/**
 * Cloud-manifest auto-updater for Apex Launcher (Windows / macOS).
 *
 * Lifecycle:
 *  1. Boot → GET https://download.spaceclient.com/updates/latest.json
 *  2. If newer → dark update UI (renderer) → user clicks Update Now
 *  3. Download to OS temp → verify SHA-256 against manifest `signature`
 *  4. Detached shell waits ~500ms, replaces binaries, relaunches → app quits
 *
 * Offline / manifest failures are logged and bypassed so launch still works.
 *
 * Expected manifest shape:
 * {
 *   "version": "1.0.2",
 *   "notes": "Optional release notes",
 *   "platforms": {
 *     "win32": { "url": "https://…/Setup.exe", "signature": "<sha256 hex>" },
 *     "darwin": { "url": "https://…/Space-Launcher-mac.zip", "signature": "<sha256 hex>" },
 *     "darwin-arm64": { "url": "…", "signature": "…" }
 *   }
 * }
 * Flat form also accepted: { "version", "url", "signature" }
 */

"use strict";

const { ipcMain, app } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { pipeline } = require("stream/promises");
const { URL } = require("url");

const MANIFEST_URL =
  process.env.SPACE_UPDATE_MANIFEST ||
  "https://download.spaceclient.com/updates/latest.json";

const ALLOW_DEV =
  process.env.SPACE_UPDATER_FORCE_DEV === "1" ||
  process.env.SPACE_UPDATER_ALLOW_DEV === "1";

let mainWindowRef = null;
let handlersRegistered = false;
let startupCheckScheduled = false;
let lastUiState = null;

/** @type {{ version: string, notes?: string, url: string, signature: string, fileName?: string } | null} */
let pendingUpdate = null;
/** @type {string | null} */
let verifiedPayloadPath = null;
let downloadInFlight = false;

const UI_CHANNELS = new Set([
  "update:checking",
  "update:available",
  "update:not-available",
  "update:progress",
  "update:downloaded",
  "update:error",
]);

function updaterEnabled() {
  return app.isPackaged || ALLOW_DEV;
}

function remember(channel, payload) {
  if (!UI_CHANNELS.has(channel)) return;
  if (
    lastUiState &&
    (lastUiState.channel === "update:downloaded" ||
      lastUiState.channel === "update:available" ||
      lastUiState.channel === "update:progress") &&
    (channel === "update:checking" || channel === "update:not-available")
  ) {
    return;
  }
  lastUiState = { channel, payload: payload ?? null, at: Date.now() };
}

function send(channel, payload) {
  remember(channel, payload);
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  try {
    mainWindowRef.webContents.send(channel, payload);
  } catch (err) {
    console.warn("[updater] Failed to send", channel, err?.message || err);
  }
}

function parseSemver(version) {
  const cleaned = String(version || "")
    .trim()
    .replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: cleaned,
  };
}

/** @returns {number} positive if a > b, negative if a < b, 0 if equal / unparsable */
function compareVersions(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) {
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  }
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function platformKey() {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  return process.platform;
}

/**
 * @param {any} manifest
 * @returns {{ version: string, notes?: string, url: string, signature: string, fileName?: string }}
 */
function pickPlatformAsset(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Invalid update manifest.");
  }
  const version = String(manifest.version || "").trim();
  if (!version) throw new Error("Manifest missing version.");

  const notes =
    typeof manifest.notes === "string"
      ? manifest.notes
      : typeof manifest.releaseNotes === "string"
        ? manifest.releaseNotes
        : undefined;

  const platforms = manifest.platforms || manifest.assets || null;
  let asset = null;

  if (platforms && typeof platforms === "object") {
    const key = platformKey();
    asset =
      platforms[key] ||
      platforms[process.platform] ||
      (process.platform === "win32"
        ? platforms.win || platforms.windows || platforms.win32
        : null) ||
      (process.platform === "darwin"
        ? platforms.mac || platforms.darwin || platforms.osx
        : null);
  }

  if (!asset && manifest.url && manifest.signature) {
    asset = {
      url: manifest.url,
      signature: manifest.signature,
      fileName: manifest.fileName,
    };
  }

  if (!asset?.url || !asset?.signature) {
    throw new Error(`No update asset for platform ${platformKey()}.`);
  }

  const signature = String(asset.signature)
    .trim()
    .toLowerCase()
    .replace(/^sha256:/i, "");
  if (!/^[a-f0-9]{64}$/.test(signature)) {
    throw new Error("Manifest signature must be a 64-char SHA-256 hex digest.");
  }

  return {
    version,
    notes,
    url: String(asset.url).trim(),
    signature,
    fileName: asset.fileName ? String(asset.fileName) : undefined,
  };
}

function fetchJson(urlString, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const ok = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      fail(new Error("Invalid manifest URL."));
      return;
    }

    const lib = parsed.protocol === "http:" ? http : https;
    const req = lib.get(
      urlString,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": `SpaceLauncher/${app.getVersion()} (${process.platform})`,
          "Cache-Control": "no-cache",
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          fetchJson(new URL(res.headers.location, urlString).href, {
            timeoutMs,
          })
            .then(ok)
            .catch(fail);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          fail(new Error(`Manifest HTTP ${status}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const text = Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
            ok(JSON.parse(text));
          } catch (err) {
            fail(err);
          }
        });
        res.on("error", fail);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      fail(new Error("Manifest request timed out."));
    });
    req.on("error", fail);
  });
}

function downloadToFile(urlString, destPath, onProgress, { timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const ok = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const lib = urlString.startsWith("http:") ? http : https;
    const req = lib.get(
      urlString,
      {
        headers: {
          "User-Agent": `SpaceLauncher/${app.getVersion()} (${process.platform})`,
        },
        timeout: timeoutMs || undefined,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          downloadToFile(
            new URL(res.headers.location, urlString).href,
            destPath,
            onProgress,
            { timeoutMs }
          )
            .then(ok)
            .catch(fail);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          fail(new Error(`Download HTTP ${status}`));
          return;
        }

        const total = Number(res.headers["content-length"]) || 0;
        let transferred = 0;
        let lastTick = Date.now();
        let lastBytes = 0;
        const out = fs.createWriteStream(destPath);

        res.on("data", (chunk) => {
          transferred += chunk.length;
          const now = Date.now();
          const dt = Math.max(1, now - lastTick);
          const bytesPerSecond = ((transferred - lastBytes) * 1000) / dt;
          if (now - lastTick >= 200 || transferred === total) {
            lastTick = now;
            lastBytes = transferred;
            const percent = total > 0 ? (transferred / total) * 100 : 0;
            try {
              onProgress?.({
                percent,
                transferred,
                total,
                bytesPerSecond,
              });
            } catch {
              /* ignore UI errors */
            }
          }
        });

        pipeline(res, out).then(ok).catch(fail);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      fail(new Error("Download timed out."));
    });
    req.on("error", fail);
  });
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function guessFileName(urlString, fileName) {
  if (fileName) return path.basename(fileName);
  try {
    const base = path.basename(new URL(urlString).pathname);
    if (base && base !== "/" && base !== ".") return base;
  } catch {
    /* ignore */
  }
  if (process.platform === "win32") return "Space-Launcher-Update.exe";
  if (process.platform === "darwin") return "Space-Launcher-Update.zip";
  return "Space-Launcher-Update.bin";
}

function installRoot() {
  // Packaged: directory containing the .exe / .app bundle
  if (process.platform === "darwin") {
    // .../Apex Launcher.app/Contents/MacOS/Space-Launcher → .app
    const exe = process.execPath;
    const macos = path.dirname(exe);
    const contents = path.dirname(macos);
    const appBundle = path.dirname(contents);
    if (appBundle.toLowerCase().endsWith(".app")) return appBundle;
  }
  return path.dirname(process.execPath);
}

function relaunchPath() {
  return process.execPath;
}

function writeReplaceScript(payloadPath) {
  const tmpDir = path.join(os.tmpdir(), "SpaceClient-updater");
  fs.mkdirSync(tmpDir, { recursive: true });
  const ext = path.extname(payloadPath).toLowerCase();
  const target = installRoot();
  const relaunch = relaunchPath();
  const stamp = Date.now();

  if (process.platform === "win32") {
    const scriptPath = path.join(tmpDir, `apply-${stamp}.cmd`);
    const payloadEsc = payloadPath.replace(/"/g, "");
    const targetEsc = target.replace(/"/g, "");
    const relaunchEsc = relaunch.replace(/"/g, "");

    if (ext === ".exe") {
      // NSIS / setup installer — silent install, then relaunch
      const body = [
        "@echo off",
        "setlocal",
        'powershell -NoProfile -Command "Start-Sleep -Milliseconds 500"',
        `start /wait "" "${payloadEsc}" /S`,
        `start "" "${relaunchEsc}"`,
        `del /f /q "%~f0" >nul 2>&1`,
        "endlocal",
      ].join("\r\n");
      fs.writeFileSync(scriptPath, body, "utf8");
      return { scriptPath, shell: true };
    }

    // Zip / folder payload — wait, expand, overwrite, relaunch
    const extractDir = path.join(tmpDir, `extract-${stamp}`);
    const body = [
      "@echo off",
      "setlocal EnableExtensions",
      'powershell -NoProfile -Command "Start-Sleep -Milliseconds 500"',
      `mkdir "${extractDir}" >nul 2>&1`,
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${payloadEsc.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`,
      `robocopy "${extractDir}" "${targetEsc}" /E /R:2 /W:1 /NFL /NDL /NJH /NJS /nc /ns /np`,
      `if errorlevel 8 exit /b 1`,
      `start "" "${relaunchEsc}"`,
      `rmdir /s /q "${extractDir}" >nul 2>&1`,
      `del /f /q "${payloadEsc}" >nul 2>&1`,
      `del /f /q "%~f0" >nul 2>&1`,
      "endlocal",
    ].join("\r\n");
    fs.writeFileSync(scriptPath, body, "utf8");
    return { scriptPath, shell: true };
  }

  if (process.platform === "darwin") {
    const scriptPath = path.join(tmpDir, `apply-${stamp}.sh`);
    const extractDir = path.join(tmpDir, `extract-${stamp}`);
    const lines = [
      "#!/bin/bash",
      "set -euo pipefail",
      "sleep 0.5",
    ];

    if (ext === ".dmg") {
      lines.push(
        `MOUNT=$(hdiutil attach -nobrowse -readonly ${JSON.stringify(payloadPath)} | awk '/\\/Volumes\\//{print $3; exit}')`,
        `APP_SRC=$(find "$MOUNT" -maxdepth 2 -name "*.app" -type d | head -n 1)`,
        `test -n "$APP_SRC"`,
        `rm -rf ${JSON.stringify(target)}`,
        `ditto "$APP_SRC" ${JSON.stringify(target)}`,
        `hdiutil detach "$MOUNT" -quiet || true`
      );
    } else {
      // .zip expected to contain .app or win-unpacked-style tree
      lines.push(
        `mkdir -p ${JSON.stringify(extractDir)}`,
        `unzip -qo ${JSON.stringify(payloadPath)} -d ${JSON.stringify(extractDir)}`,
        `APP_SRC=$(find ${JSON.stringify(extractDir)} -maxdepth 3 -name "*.app" -type d | head -n 1)`,
        `if [ -n "$APP_SRC" ]; then`,
        `  rm -rf ${JSON.stringify(target)}`,
        `  ditto "$APP_SRC" ${JSON.stringify(target)}`,
        `else`,
        `  ditto ${JSON.stringify(extractDir)} ${JSON.stringify(target)}`,
        `fi`,
        `rm -rf ${JSON.stringify(extractDir)}`
      );
    }

    lines.push(
      `open ${JSON.stringify(target)}`,
      `rm -f ${JSON.stringify(payloadPath)}`,
      `rm -f "$0"`
    );
    fs.writeFileSync(scriptPath, `${lines.join("\n")}\n`, { mode: 0o755 });
    try {
      fs.chmodSync(scriptPath, 0o755);
    } catch {
      /* ignore */
    }
    return { scriptPath, shell: false };
  }

  throw new Error(`Self-replace is not supported on ${process.platform}.`);
}

function spawnDetachedReplace(payloadPath) {
  const { scriptPath, shell: useShell } = writeReplaceScript(payloadPath);

  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", scriptPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
    child.unref();
    return;
  }

  const child = spawn("/bin/bash", [scriptPath], {
    detached: true,
    stdio: "ignore",
    shell: useShell,
  });
  child.unref();
}

async function runCheck({ quiet = true } = {}) {
  if (!updaterEnabled()) {
    return { success: false, skipped: true, reason: "not-packaged" };
  }

  send("update:checking");
  try {
    const manifest = await fetchJson(MANIFEST_URL);
    const asset = pickPlatformAsset(manifest);
    const current = app.getVersion();

    if (compareVersions(asset.version, current) <= 0) {
      pendingUpdate = null;
      verifiedPayloadPath = null;
      send("update:not-available", { version: current });
      return { success: true, updateInfo: null };
    }

    pendingUpdate = asset;
    verifiedPayloadPath = null;
    send("update:available", {
      version: asset.version,
      releaseNotes: asset.notes,
    });
    return {
      success: true,
      updateInfo: { version: asset.version },
    };
  } catch (err) {
    const message = err?.message || String(err);
    console.warn(
      "[updater] Manifest check failed — continuing without update:",
      message
    );
    if (!quiet) {
      send("update:error", { message });
    }
    return { success: false, skipped: true, reason: "offline", error: message };
  }
}

async function runDownload() {
  if (!updaterEnabled()) {
    return { success: false, skipped: true, reason: "not-packaged" };
  }
  if (downloadInFlight) {
    return { success: false, error: "A download is already in progress." };
  }
  if (!pendingUpdate) {
    const check = await runCheck({ quiet: false });
    if (!pendingUpdate) {
      return {
        success: false,
        error: check.error || "No update available to download.",
      };
    }
  }

  downloadInFlight = true;
  const asset = pendingUpdate;
  const tmpRoot = path.join(os.tmpdir(), "SpaceClient-updater");
  await fsp.mkdir(tmpRoot, { recursive: true });
  const fileName = guessFileName(asset.url, asset.fileName);
  const destPath = path.join(tmpRoot, `${Date.now()}-${fileName}`);

  try {
    send("update:progress", {
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
    });

    await downloadToFile(asset.url, destPath, (progress) => {
      send("update:progress", progress);
    });

    send("update:progress", {
      percent: 100,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
    });

    const digest = await sha256File(destPath);
    if (digest !== asset.signature) {
      try {
        await fsp.unlink(destPath);
      } catch {
        /* ignore */
      }
      verifiedPayloadPath = null;
      const message =
        "Security alert: update file SHA-256 does not match the cloud signature. The download was deleted.";
      console.error("[updater]", message, { expected: asset.signature, got: digest });
      send("update:error", {
        message,
        code: "SIGNATURE_MISMATCH",
        security: true,
      });
      return { success: false, error: message, security: true };
    }

    verifiedPayloadPath = destPath;
    send("update:downloaded", { version: asset.version });
    return { success: true, path: destPath };
  } catch (err) {
    try {
      await fsp.unlink(destPath);
    } catch {
      /* ignore */
    }
    verifiedPayloadPath = null;
    const message = err?.message || String(err);
    console.error("[updater] Download failed:", message);
    send("update:error", { message });
    return { success: false, error: message };
  } finally {
    downloadInFlight = false;
  }
}

function quitAndRelaunchApp() {
  setTimeout(() => {
    try {
      app.relaunch();
    } catch (err) {
      console.warn("[updater] app.relaunch failed:", err?.message || err);
    }
    try {
      app.exit(0);
    } catch {
      process.exit(0);
    }
  }, 150);
}

function runInstall() {
  // Dev / demo: no verified payload — still relaunch so the toast flow feels real
  if (!verifiedPayloadPath || !fs.existsSync(verifiedPayloadPath)) {
    console.info("[updater] Relaunching app (no install payload — demo / already applied).");
    quitAndRelaunchApp();
    return { success: true, relaunchOnly: true };
  }

  try {
    spawnDetachedReplace(verifiedPayloadPath);
    // Detached script replaces files and starts the new binary; quit this process
    setTimeout(() => {
      try {
        app.quit();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        process.exit(0);
      }, 800);
    }, 150);
    return { success: true };
  } catch (err) {
    const message = err?.message || String(err);
    send("update:error", { message });
    return { success: false, error: message };
  }
}

function registerIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle("update:check", async () => {
    // User-initiated checks surface errors; boot path uses quiet separately
    return runCheck({ quiet: false });
  });

  ipcMain.handle("update:download", async () => runDownload());

  ipcMain.handle("update:install", () => runInstall());

  ipcMain.handle("update:get-state", () => {
    if (!updaterEnabled()) {
      return { packaged: false, state: null };
    }
    return {
      packaged: true,
      state: lastUiState,
      pendingVersion: pendingUpdate?.version || null,
    };
  });
}

/**
 * @param {import("electron").BrowserWindow} mainWindow
 * @param {{ autoCheckDelayMs?: number }} [options]
 */
function initAutoUpdater(mainWindow, options = {}) {
  mainWindowRef = mainWindow;
  registerIpcHandlers();

  if (!updaterEnabled()) {
    console.info(
      "[updater] Skipped — not a packaged build (set SPACE_UPDATER_FORCE_DEV=1 to test)."
    );
    return;
  }

  console.info(
    `[updater] Active — cloud manifest ${MANIFEST_URL} (SHA-256 verified, non-silent).`
  );

  const delayMs = options.autoCheckDelayMs ?? 4000;
  if (!startupCheckScheduled) {
    startupCheckScheduled = true;
    setTimeout(() => {
      runCheck({ quiet: true }).catch((err) => {
        console.warn(
          "[updater] Startup check error (bypassed):",
          err?.message || err
        );
      });
    }, delayMs);
  }
}

function setMainWindow(mainWindow) {
  mainWindowRef = mainWindow;
}

module.exports = {
  initAutoUpdater,
  setMainWindow,
  checkForUpdatesNow: (opts) => runCheck(opts || { quiet: false }),
  // Exported for tests / tooling
  compareVersions,
  pickPlatformAsset,
  MANIFEST_URL,
};
