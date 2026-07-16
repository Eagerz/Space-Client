/**
 * GitHub-powered auto-updater for Space Launcher (electron-updater).
 * Non-silent: never auto-downloads or auto-installs; UI must confirm.
 * Only active in packaged builds (app.isPackaged).
 */

const { ipcMain, app } = require("electron");

let autoUpdater = null;
let mainWindowRef = null;
let handlersRegistered = false;
let eventsBound = false;
let startupCheckScheduled = false;

function getAutoUpdater() {
  if (!autoUpdater) {
    ({ autoUpdater } = require("electron-updater"));
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
  }
  return autoUpdater;
}

function send(channel, payload) {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.webContents.send(channel, payload);
}

function registerIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle("update:check", async () => {
    if (!app.isPackaged) {
      return { success: false, skipped: true, reason: "not-packaged" };
    }
    try {
      const result = await getAutoUpdater().checkForUpdates();
      return {
        success: true,
        updateInfo: result?.updateInfo
          ? { version: result.updateInfo.version }
          : null,
      };
    } catch (err) {
      const message = err?.message || String(err);
      send("update:error", { message });
      return { success: false, error: message };
    }
  });

  ipcMain.handle("update:download", async () => {
    if (!app.isPackaged) {
      return { success: false, skipped: true, reason: "not-packaged" };
    }
    try {
      await getAutoUpdater().downloadUpdate();
      return { success: true };
    } catch (err) {
      const message = err?.message || String(err);
      send("update:error", { message });
      return { success: false, error: message };
    }
  });

  ipcMain.handle("update:install", () => {
    if (!app.isPackaged) {
      return { success: false, skipped: true, reason: "not-packaged" };
    }
    // isSilent=false, isForceRunAfter=true — relaunch after install
    setImmediate(() => {
      getAutoUpdater().quitAndInstall(false, true);
    });
    return { success: true };
  });
}

function bindUpdaterEvents() {
  if (eventsBound) return;
  eventsBound = true;

  const updater = getAutoUpdater();

  updater.on("checking-for-update", () => {
    send("update:checking");
  });

  updater.on("update-available", (info) => {
    send("update:available", {
      version: info?.version || "",
      releaseNotes: typeof info?.releaseNotes === "string" ? info.releaseNotes : undefined,
      releaseName: info?.releaseName || undefined,
    });
  });

  updater.on("update-not-available", (info) => {
    send("update:not-available", {
      version: info?.version || "",
    });
  });

  updater.on("download-progress", (progress) => {
    send("update:progress", {
      percent: progress?.percent ?? 0,
      bytesPerSecond: progress?.bytesPerSecond ?? 0,
      transferred: progress?.transferred ?? 0,
      total: progress?.total ?? 0,
    });
  });

  updater.on("update-downloaded", (info) => {
    send("update:downloaded", {
      version: info?.version || "",
    });
  });

  updater.on("error", (err) => {
    send("update:error", {
      message: err?.message || String(err),
    });
  });
}

/**
 * @param {import("electron").BrowserWindow} mainWindow
 * @param {{ autoCheckDelayMs?: number }} [options]
 */
function initAutoUpdater(mainWindow, options = {}) {
  mainWindowRef = mainWindow;
  registerIpcHandlers();

  if (!app.isPackaged) {
    console.info(
      "[updater] Skipped — not a packaged build (use a release install to check for updates)."
    );
    return;
  }

  bindUpdaterEvents();

  const delayMs = options.autoCheckDelayMs ?? 4000;
  if (!startupCheckScheduled) {
    startupCheckScheduled = true;
    setTimeout(() => {
      getAutoUpdater()
        .checkForUpdates()
        .catch((err) => {
          send("update:error", { message: err?.message || String(err) });
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
};
