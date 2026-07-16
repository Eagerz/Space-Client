const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const childProcess = require("child_process");
const { pathToFileURL } = require("url");
const { Launch } = require("minecraft-java-core");
const authSession = require("./auth-session");
const modInjection = require("./mod-injection");
const instances = require("./instances");

/** @type {import("minecraft-java-core").default | null} */
let activeLauncher = null;
let isLaunching = false;
let gameRunning = false;

/**
 * minecraft-java-core spawns Java without windowsHide. On Windows that can pop a
 * CMD console. Keep java.exe (not javaw) so stdout/stderr still pipe into our
 * Game Logs panel; only hide the OS console window.
 */
const originalSpawn = childProcess.spawn;
childProcess.spawn = function spaceClientSpawn(command, args, options) {
  const opts = { ...(options || {}) };
  opts.windowsHide = true;
  // Ensure we capture game output for the in-app logs panel.
  if (!opts.stdio) {
    opts.stdio = ["ignore", "pipe", "pipe"];
  }
  return originalSpawn.call(this, command, args, opts);
};

function getMinecraftPath(instanceId) {
  return instances.getGamePath(instanceId);
}

/**
 * Map stored electron-mc-auth session into minecraft-java-core authenticator shape.
 */
function buildAuthenticator() {
  const session = authSession.getActiveAccount?.() || authSession.loadSession();
  if (!session) return null;
  // Allow slightly expired sessions — caller should refresh first.
  if (!session.access_token || !session.name || !session.id) return null;

  const expiresAt = session.savedAt && session.expires_in
    ? session.savedAt + session.expires_in * 1000
    : Date.now() + 3600 * 1000;

  return {
    access_token: session.access_token,
    client_token: session.client_token || session.id,
    uuid: String(session.id || "").replace(/-/g, ""),
    name: session.name,
    refresh_token: session.refresh_token,
    user_properties: "{}",
    meta: {
      type: "Xbox",
      access_token_expires_in: expiresAt,
      demo: false,
    },
    profile: {
      skins: session.skins || [],
      capes: [],
    },
  };
}

function clampMemoryGb(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 4;
  return Math.min(16, Math.max(2, Math.round(n)));
}

function normalizeVersion(version) {
  if (!version || typeof version !== "string") return "1.21.1";
  return version.trim();
}

function normalizeLoader(loader) {
  // Space Client cosmetics/HUD require Fabric; vanilla and quilt also supported for launcher mode.
  const value = String(loader || "fabric").toLowerCase();
  if (value === "vanilla" || value === "none" || value === "off") return "vanilla";
  if (value === "quilt") return "quilt";
  if (value === "fabric") return "fabric";
  return "fabric";
}

function resolveJavaPath(javaPath) {
  if (!javaPath || typeof javaPath !== "string") return null;
  const trimmed = javaPath.trim();
  if (!trimmed) return null;
  if (!fs.existsSync(trimmed)) return null;
  return trimmed;
}

function send(win, channel, payload) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

function restoreWindow(win) {
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

function hideWindow(win) {
  if (!win || win.isDestroyed()) return;
  win.hide();
}

/**
 * Resolve a cape texture PNG from the Electron app assets folder.
 * @param {string} capeId
 * @returns {string | null}
 */
function resolveCapeTexturePath(capeId) {
  if (!capeId || typeof capeId !== "string") return null;
  const safe = capeId.replace(/[^a-z0-9\-]/gi, "");
  if (!safe) return null;
  const fileName = `${safe}-texture.png`;
  const candidates = [
    path.join(__dirname, "src", "assets", "capes", fileName),
    path.join(app.getAppPath(), "src", "assets", "capes", fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Stage equipped cape into .minecraft/config/space-client/cosmetics for the Fabric core mod.
 * @param {string} gamePath
 * @param {string | null | undefined} capeId
 * @param {(line: string) => void} log
 */
function stageEquippedCosmetics(gamePath, capeId, log) {
  const cosmeticsDir = path.join(gamePath, "config", "space-client", "cosmetics");
  fs.mkdirSync(cosmeticsDir, { recursive: true });
  const capePng = path.join(cosmeticsDir, "cape.png");
  const manifestPath = path.join(cosmeticsDir, "equipped.json");
  const manifest = {
    cape: null,
    updatedAt: new Date().toISOString(),
  };

  if (capeId) {
    const src = resolveCapeTexturePath(capeId);
    if (src) {
      fs.copyFileSync(src, capePng);
      manifest.cape = capeId;
      log(`Staged cape texture: ${capeId}`);
    } else {
      try {
        fs.unlinkSync(capePng);
      } catch {
        // ignore
      }
      log(`Cape texture missing for "${capeId}" — unequipped in-game.`);
    }
  } else {
    try {
      fs.unlinkSync(capePng);
    } catch {
      // ignore
    }
    log("No cape equipped — cleared in-game cosmetics stage.");
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * Per-file download events jump 0→100 repeatedly. Floor percent against the last
 * value within a phase so the UI never goes backwards mid-phase.
 */
function createProgressTracker() {
  let lastPercent = 0;
  let lastPhase = "starting";

  return function track(phase, percent) {
    if (phase && phase !== lastPhase) {
      // Intentional phase change — do not drop below prior peak unless reset.
      if (phase === "starting") lastPercent = 0;
      lastPhase = phase;
    }
    if (!Number.isFinite(percent)) return null;
    const next = Math.max(0, Math.min(100, Math.round(percent)));
    if (next < lastPercent && phase === lastPhase) {
      return lastPercent;
    }
    lastPercent = Math.max(lastPercent, next);
    return lastPercent;
  };
}

/**
 * @param {Electron.BrowserWindow} win
 * @param {{ version?: string, loader?: string, memoryGb?: number, equippedCape?: string | null, instanceId?: string, javaPath?: string | null }} options
 */
async function launchGame(win, options = {}) {
  if (isLaunching || gameRunning) {
    return { success: false, error: "A launch is already in progress or Minecraft is running." };
  }

  const authenticator = buildAuthenticator();
  if (!authenticator?.access_token || !authenticator?.name || !authenticator?.uuid) {
    return { success: false, error: "Sign in with Microsoft before playing." };
  }

  const active = instances.getActiveInstance();
  const instanceId = options.instanceId || active?.id;
  if (instanceId && options.instanceId) {
    instances.setActiveInstance(instanceId);
  }

  const version = normalizeVersion(options.version || active?.version);
  const loader = normalizeLoader(options.loader || active?.loader);
  const memoryGb = clampMemoryGb(options.memoryGb ?? active?.memoryGb);
  const memoryMinGb = Math.max(1, Math.min(memoryGb, Math.floor(memoryGb / 2) || 2));
  const javaPath = resolveJavaPath(options.javaPath ?? active?.javaPath);
  const gamePath = getMinecraftPath(instanceId);
  const trackPercent = createProgressTracker();

  // Persist launch choices onto the active instance for next time.
  if (instanceId) {
    instances.updateInstance(instanceId, {
      version,
      loader,
      memoryGb,
      javaPath: javaPath || active?.javaPath || null,
    });
  }

  isLaunching = true;
  let hiddenForGame = false;
  let sawGameCrash = false;

  send(win, "launch:progress", {
    phase: "starting",
    percent: trackPercent("starting", 0),
    label: "Preparing launch…",
    detail: version,
  });
  send(win, "launch:log", { line: `Preparing launch for ${version} (${loader})…` });

  try {
    stageEquippedCosmetics(gamePath, options.equippedCape, (line) => {
      send(win, "launch:log", { line });
    });

    const launcher = new Launch();
    activeLauncher = launcher;

    const onProgress = (downloaded, total, element) => {
      const tot = Number(total) || 0;
      const dl = Number(downloaded) || 0;
      const raw = tot > 0 ? (dl / tot) * 100 : null;
      const percent = trackPercent("download", raw);
      const file = typeof element === "string" ? element : "files";
      send(win, "launch:progress", {
        phase: "download",
        percent,
        label: `Downloading ${file}`,
        detail: Number.isFinite(percent) ? `${percent}%` : undefined,
        speed: undefined,
      });
    };

    const onSpeed = (speed) => {
      // Speed-only updates must NOT wipe percent / label in the UI.
      send(win, "launch:progress", {
        phase: "download",
        speed: Number(speed) || 0,
      });
    };

    const onCheck = (progress, size, element) => {
      const tot = Number(size) || 0;
      const cur = Number(progress) || 0;
      const raw = tot > 0 ? (cur / tot) * 100 : null;
      const percent = trackPercent("verify", raw);
      send(win, "launch:progress", {
        phase: "verify",
        percent,
        label: `Verifying ${typeof element === "string" ? element : "files"}`,
        detail: Number.isFinite(percent) ? `${percent}%` : undefined,
      });
    };

    const onExtract = (file) => {
      send(win, "launch:progress", {
        phase: "extract",
        label: "Extracting",
        detail: typeof file === "string" ? file : "resources",
      });
      if (typeof file === "string") {
        send(win, "launch:log", { line: `Extracting ${file}` });
      }
    };

    const onPatch = (patch) => {
      send(win, "launch:progress", {
        phase: "patch",
        label: "Applying loader patch",
        detail: typeof patch === "string" ? patch : "…",
      });
      if (typeof patch === "string") {
        send(win, "launch:log", { line: `Patch: ${patch}` });
      }
    };

    const onData = (line) => {
      const text = String(line || "").replace(/\r/g, "");
      const chunks = text.split("\n").filter((part) => part.trim().length > 0);
      for (const chunk of chunks) {
        send(win, "launch:log", { line: chunk });
        if (
          /Minecraft has crashed|BootstrapMethodError|InvalidInjectionException|Mixin transformation .* failed|Critical injection failure/i.test(
            chunk
          )
        ) {
          sawGameCrash = true;
        }
      }

      // Mark game as running once JVM dumps launch args — but keep the launcher
      // visible so Game Logs stay readable (Lunar / Feather style).
      if (!hiddenForGame && /Launching with arguments/i.test(text)) {
        hiddenForGame = true;
        gameRunning = true;
        isLaunching = false;
        send(win, "launch:progress", {
          phase: "launching",
          percent: trackPercent("launching", 100),
          label: "Minecraft is booting…",
          detail: "Watch Game Logs below",
        });
        send(win, "launch:started", { version, loader });
      }
    };

    const onClose = (code) => {
      cleanupListeners();
      activeLauncher = null;
      gameRunning = false;
      isLaunching = false;
      const exitCode = typeof code === "number" ? code : null;
      const crashed = sawGameCrash || (exitCode !== null && exitCode !== 0);
      send(win, "launch:log", {
        line: crashed
          ? `Minecraft exited${exitCode !== null ? ` with code ${exitCode}` : ""} (crash detected).`
          : "Minecraft closed.",
      });
      send(win, "launch:closed", { code: exitCode, crashed });
      restoreWindow(win);
    };

    const onError = (err) => {
      cleanupListeners();
      activeLauncher = null;
      gameRunning = false;
      isLaunching = false;

      const message =
        (typeof err === "string" && err) ||
        err?.error ||
        err?.message ||
        "Failed to launch Minecraft.";

      send(win, "launch:log", { line: `Error: ${message}` });
      send(win, "launch:error", { error: String(message) });
      restoreWindow(win);
    };

    function cleanupListeners() {
      launcher.removeListener("progress", onProgress);
      launcher.removeListener("speed", onSpeed);
      launcher.removeListener("check", onCheck);
      launcher.removeListener("extract", onExtract);
      launcher.removeListener("patch", onPatch);
      launcher.removeListener("data", onData);
      launcher.removeListener("close", onClose);
      launcher.removeListener("error", onError);
    }

    launcher.on("progress", onProgress);
    launcher.on("speed", onSpeed);
    launcher.on("check", onCheck);
    launcher.on("extract", onExtract);
    launcher.on("patch", onPatch);
    launcher.on("data", onData);
    launcher.on("close", onClose);
    launcher.on("error", onError);

    const launchOptions = {
      path: gamePath,
      authenticator,
      version,
      // Keep attached so stdout/stderr pipe into our in-app console (and avoid a new Win console group).
      detached: false,
      // Fabric install + Java can exceed 15s on first launch.
      timeout: 60000,
      downloadFileMultiple: Math.min(
        16,
        Math.max(1, Number(options.downloadParallel) || 5)
      ),
      verify: false,
      ignored: ["config", "logs", "resourcepacks", "options.txt", "optionsof.txt", "saves"],
      loader: {
        path: "./loader",
        enable: loader === "fabric" || loader === "quilt",
        type: loader === "fabric" || loader === "quilt" ? loader : null,
        build: "latest",
      },
      memory: {
        min: `${memoryMinGb}G`,
        max: `${memoryGb}G`,
      },
      java: {
        path: javaPath,
        version: null,
        type: "jre",
      },
      JVM_ARGS: [],
    };

    if (javaPath) {
      send(win, "launch:log", { line: `Using custom Java: ${javaPath}` });
    }
    send(win, "launch:log", { line: `Instance: ${active?.name || instanceId || "default"} → ${gamePath}` });

    // Windows: bare `C:/...xml` is treated as an invalid URL protocol by Log4j
    // ("unknown protocol: c"). Prefer a proper file:// URI when the config exists.
    const logConfigPath = path.join(gamePath, "assets", "log_configs", "client-1.12.xml");
    if (fs.existsSync(logConfigPath)) {
      launchOptions.JVM_ARGS.push(`-Dlog4j.configurationFile=${pathToFileURL(logConfigPath).href}`);
    }

    if (loader === "fabric") {
      send(win, "launch:progress", {
        phase: "patch",
        label: "Preparing Fabric mods…",
        detail: version,
      });
      const mod = await modInjection.prepareFabricInjection({ mcVersion: version });
      for (const warning of mod.warnings || []) {
        send(win, "launch:log", { line: warning });
      }
      if (mod.ok && mod.jvmArg) {
        launchOptions.JVM_ARGS.push(mod.jvmArg);
        send(win, "launch:log", {
          line: "Fabric Loader enabled — injecting Space Client core + Fabric API from natives.",
        });
        if (mod.jarPath) {
          send(win, "launch:log", { line: `Core mod: ${mod.jarPath}` });
        }
        if (mod.fabricApiPath) {
          send(win, "launch:log", { line: `Fabric API: ${mod.fabricApiPath}` });
        }
      } else {
        // Launcher mode: allow Fabric without Space Client core on unsupported versions.
        const message =
          mod.error ||
          "Space Client core / Fabric API could not be prepared for injection.";
        send(win, "launch:log", {
          line: `Warning: ${message} Continuing with Fabric + installed mods only.`,
        });
      }
    } else if (loader === "quilt") {
      send(win, "launch:log", {
        line: "Quilt loader selected — Space Client core injection is Fabric-only; using instance mods.",
      });
    }

    send(win, "launch:progress", {
      phase: "download",
      percent: trackPercent("download", 0),
      label: "Checking game files…",
      detail: version,
    });

    // Launch() kicks off the pipeline and resolves once spawn is set up;
    // download progress arrives through events.
    await launcher.Launch(launchOptions);

    return { success: true };
  } catch (err) {
    isLaunching = false;
    gameRunning = false;
    activeLauncher = null;
    const message = err?.message || String(err);
    send(win, "launch:log", { line: `Error: ${message}` });
    send(win, "launch:error", { error: message });
    restoreWindow(win);
    return { success: false, error: message };
  }
}

function isGameRunning() {
  return gameRunning || isLaunching;
}

module.exports = {
  launchGame,
  getMinecraftPath,
  isGameRunning,
};
