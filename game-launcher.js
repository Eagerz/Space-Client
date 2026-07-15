const { app } = require("electron");
const path = require("path");
const { Launch } = require("minecraft-java-core");
const authSession = require("./auth-session");

/** @type {import("minecraft-java-core").default | null} */
let activeLauncher = null;
let isLaunching = false;
let gameRunning = false;

function getMinecraftPath() {
  return path.join(app.getPath("userData"), "SpaceClient", ".minecraft");
}

/**
 * Map stored electron-mc-auth session into minecraft-java-core authenticator shape.
 */
function buildAuthenticator() {
  const session = authSession.loadSession();
  if (!session || !authSession.isLoggedIn()) return null;

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
  const value = String(loader || "vanilla").toLowerCase();
  if (value === "fabric") return "fabric";
  return "vanilla";
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
 * @param {Electron.BrowserWindow} win
 * @param {{ version?: string, loader?: string, memoryGb?: number }} options
 */
async function launchGame(win, options = {}) {
  if (isLaunching || gameRunning) {
    return { success: false, error: "A launch is already in progress or Minecraft is running." };
  }

  if (!authSession.isLoggedIn()) {
    return { success: false, error: "Sign in with Microsoft before playing." };
  }

  const authenticator = buildAuthenticator();
  if (!authenticator?.access_token || !authenticator?.name || !authenticator?.uuid) {
    return { success: false, error: "Invalid authentication session. Please sign in again." };
  }

  const version = normalizeVersion(options.version);
  const loader = normalizeLoader(options.loader);
  const memoryGb = clampMemoryGb(options.memoryGb);
  const memoryMinGb = Math.max(1, Math.min(memoryGb, Math.floor(memoryGb / 2) || 2));
  const gamePath = getMinecraftPath();

  isLaunching = true;
  let hiddenForGame = false;

  send(win, "launch:progress", {
    phase: "starting",
    percent: 0,
    label: "Preparing launch…",
    detail: version,
  });

  try {
    const launcher = new Launch();
    activeLauncher = launcher;

    const onProgress = (downloaded, total, element) => {
      const tot = Number(total) || 0;
      const dl = Number(downloaded) || 0;
      const percent = tot > 0 ? Math.min(100, Math.round((dl / tot) * 100)) : 0;
      const file = typeof element === "string" ? element : "files";
      send(win, "launch:progress", {
        phase: "download",
        percent,
        label: `Downloading ${file}`,
        detail: `${percent}%`,
        speed: null,
      });
    };

    const onSpeed = (speed) => {
      send(win, "launch:progress", {
        phase: "download",
        percent: null,
        label: null,
        detail: null,
        speed: Number(speed) || 0,
      });
    };

    const onCheck = (progress, size, element) => {
      const tot = Number(size) || 0;
      const cur = Number(progress) || 0;
      const percent = tot > 0 ? Math.min(100, Math.round((cur / tot) * 100)) : 0;
      send(win, "launch:progress", {
        phase: "verify",
        percent,
        label: `Verifying ${typeof element === "string" ? element : "files"}`,
        detail: `${percent}%`,
      });
    };

    const onExtract = (file) => {
      send(win, "launch:progress", {
        phase: "extract",
        percent: null,
        label: "Extracting",
        detail: typeof file === "string" ? file : "resources",
      });
    };

    const onPatch = (patch) => {
      send(win, "launch:progress", {
        phase: "patch",
        percent: null,
        label: "Applying loader patch",
        detail: typeof patch === "string" ? patch : "…",
      });
    };

    const onData = (line) => {
      const text = String(line || "");
      if (!hiddenForGame && /Launching with arguments/i.test(text)) {
        hiddenForGame = true;
        gameRunning = true;
        isLaunching = false;
        send(win, "launch:progress", {
          phase: "launching",
          percent: 100,
          label: "Starting Minecraft…",
          detail: version,
        });
        send(win, "launch:started", { version, loader });
        hideWindow(win);
      }
    };

    const onClose = () => {
      cleanupListeners();
      activeLauncher = null;
      gameRunning = false;
      isLaunching = false;
      send(win, "launch:closed", {});
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
      detached: true,
      timeout: 15000,
      downloadFileMultiple: 5,
      verify: false,
      ignored: ["config", "logs", "resourcepacks", "options.txt", "optionsof.txt", "saves"],
      loader: {
        enable: loader === "fabric",
        type: loader === "fabric" ? "fabric" : null,
        build: "latest",
      },
      memory: {
        min: `${memoryMinGb}G`,
        max: `${memoryGb}G`,
      },
      java: {
        path: null,
        version: null,
        type: "jre",
      },
    };

    send(win, "launch:progress", {
      phase: "download",
      percent: 0,
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
