const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const tls = require("tls");

// Node 22+ default CA bundle can miss corp/system roots on Windows; use the OS store.
try {
  if (typeof tls.setDefaultCACertificates === "function" && typeof tls.getCACertificates === "function") {
    tls.setDefaultCACertificates(tls.getCACertificates("system"));
  }
} catch {
  // Best-effort — Electron net.fetch remains a fallback for downloads.
}

const { useMcAuth } = require("electron-mc-auth");
const authSession = require("./auth-session");
const gameLauncher = require("./game-launcher");
const { initAutoUpdater, setMainWindow } = require("./auto-updater");
const paymentsConfig = require("./payments-config");
const instances = require("./instances");
const modManager = require("./mod-manager");
const presets = require("./presets");

/** Only http(s) URLs may leave the app (Stripe Checkout). */
function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

const BACKGROUND_COLOR = "#08080A";
let mainWindow = null;
let refreshInFlight = null;

const mcAuth = useMcAuth({
  onError: (msg) => console.error("[auth]", msg),
  onInfo: (msg) => console.info("[auth]", msg),
  onWarn: (msg) => console.warn("[auth]", msg),
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    minWidth: 960,
    minHeight: 560,
    frame: false,
    backgroundColor: BACKGROUND_COLOR,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    setMainWindow(mainWindow);
    initAutoUpdater(mainWindow, { autoCheckDelayMs: 4000 });
    // Proactively refresh Microsoft token if close to expiry.
    ensureFreshSession().catch((err) => {
      console.warn("[auth] Startup refresh skipped:", err?.message || err);
    });
  });

  mainWindow.on("focus", () => {
    mainWindow.webContents.send("payments:refresh");
    ensureFreshSession()
      .then((result) => {
        if (result?.refreshed) broadcastAuthState();
      })
      .catch(() => {});
  });

  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window-maximized-changed", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window-maximized-changed", false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function broadcastAuthState() {
  const profile = authSession.getPublicProfile();
  const loggedIn = Boolean(profile?.isLoggedIn);
  const accounts = authSession.listAccounts();
  mainWindow?.webContents.send("auth-state-changed", {
    isLoggedIn: loggedIn,
    profile: loggedIn ? profile : profile?.expired ? profile : null,
    expired: Boolean(profile?.expired),
    needsRefresh: Boolean(profile?.needsRefresh),
    accounts: accounts.accounts,
    activeId: accounts.activeId,
  });
}

/**
 * Refresh Microsoft / Minecraft tokens when near expiry.
 * @param {{ force?: boolean }} opts
 */
async function ensureFreshSession(opts = {}) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const active = authSession.getActiveAccount();
    if (!active?.refresh_token) {
      return { success: false, error: "No refresh token available.", refreshed: false };
    }

    if (!opts.force && !authSession.needsRefresh() && authSession.isLoggedIn()) {
      return { success: true, refreshed: false, profile: authSession.getPublicProfile() };
    }

    try {
      const refreshProfile = authSession.getRefreshProfile();
      const refreshed = await mcAuth.refresh(refreshProfile);
      // Library may return `this` when it thinks the token is still valid.
      if (!refreshed || typeof refreshed !== "object" || !refreshed.access_token) {
        if (authSession.isLoggedIn()) {
          return { success: true, refreshed: false, profile: authSession.getPublicProfile() };
        }
        return { success: false, error: "Token refresh failed. Please sign in again.", refreshed: false };
      }

      authSession.saveSession({
        ...active,
        ...refreshed,
        client_id: refreshed.client_id || active.client_id || "00000000402b5328",
        clientSecret: refreshed.clientSecret || active.clientSecret || "",
      });
      broadcastAuthState();
      return { success: true, refreshed: true, profile: authSession.getPublicProfile() };
    } catch (err) {
      console.error("[auth] Token refresh failed:", err);
      return {
        success: false,
        error: err?.message || "Token refresh failed. Please sign in again.",
        refreshed: false,
        expired: authSession.isExpired(),
      };
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

ipcMain.handle("window-minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window-maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  }
  mainWindow.maximize();
  return true;
});

ipcMain.handle("window-close", () => {
  mainWindow?.close();
});

ipcMain.handle("window-is-maximized", () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle("auth:microsoft-login", async () => {
  try {
    const profile = await mcAuth.launch();
    if (!profile) {
      return { success: false, error: "Login cancelled or failed." };
    }

    authSession.saveSession({
      ...profile,
      client_id: profile.client_id || "00000000402b5328",
      clientSecret: profile.clientSecret || "",
    });
    const publicProfile = authSession.getPublicProfile();
    broadcastAuthState();

    return { success: true, profile: publicProfile, ...authSession.listAccounts() };
  } catch (err) {
    console.error("[auth] Microsoft login failed:", err);
    return {
      success: false,
      error: err?.message || "Authentication failed. Please try again.",
    };
  }
});

ipcMain.handle("auth:get-profile", async () => {
  await ensureFreshSession().catch(() => {});
  const profile = authSession.getPublicProfile();
  if (!profile || profile.expired) {
    return {
      isLoggedIn: false,
      profile: profile?.expired ? profile : null,
      expired: Boolean(profile?.expired),
      ...authSession.listAccounts(),
    };
  }
  return { isLoggedIn: true, profile, expired: false, ...authSession.listAccounts() };
});

ipcMain.handle("auth:is-logged-in", async () => {
  await ensureFreshSession().catch(() => {});
  return authSession.isLoggedIn();
});

ipcMain.handle("auth:logout", () => {
  authSession.clearSession();
  broadcastAuthState();
  return { success: true, ...authSession.listAccounts() };
});

ipcMain.handle("auth:refresh", async (_event, opts = {}) => {
  const result = await ensureFreshSession({ force: Boolean(opts.force) });
  broadcastAuthState();
  return result;
});

ipcMain.handle("auth:list-accounts", () => authSession.listAccounts());

ipcMain.handle("auth:set-active-account", async (_event, id) => {
  const result = authSession.setActiveAccount(id);
  if (result.success) {
    await ensureFreshSession().catch(() => {});
    broadcastAuthState();
  }
  return { ...result, ...authSession.listAccounts(), profile: authSession.getPublicProfile() };
});

ipcMain.handle("auth:remove-account", (_event, id) => {
  const result = authSession.removeAccount(id);
  broadcastAuthState();
  return result;
});

ipcMain.handle("launch:start", async (_event, options = {}) => {
  if (!mainWindow) {
    return { success: false, error: "Launcher window is not available." };
  }

  const refreshed = await ensureFreshSession();
  if (!refreshed.success && !authSession.isLoggedIn()) {
    return {
      success: false,
      error: refreshed.error || "Session expired. Please sign in again.",
      expired: true,
    };
  }

  return gameLauncher.launchGame(mainWindow, options);
});

ipcMain.handle("launch:is-running", () => gameLauncher.isGameRunning());

ipcMain.handle("instances:list", () => {
  instances.ensureStore();
  return instances.listInstances();
});

ipcMain.handle("instances:get-active", () => instances.getActiveInstance());

ipcMain.handle("instances:set-active", (_event, id) => instances.setActiveInstance(id));

ipcMain.handle("instances:create", (_event, input) => instances.createInstance(input || {}));

ipcMain.handle("instances:update", (_event, id, patch) => instances.updateInstance(id, patch || {}));

ipcMain.handle("instances:delete", (_event, id) => instances.deleteInstance(id));

ipcMain.handle("instances:duplicate", (_event, id) => instances.duplicateInstance(id));

ipcMain.handle("mods:list", (_event, instanceId) => {
  const gamePath = instances.getGamePath(instanceId || instances.getActiveInstance().id);
  return modManager.listInstalled(gamePath);
});

ipcMain.handle("mods:install", async (event, payload = {}) => {
  const active = instances.getActiveInstance();
  const instanceId = payload.instanceId || active.id;
  const gamePath = instances.getGamePath(instanceId);
  const sendProgress = (progress) => {
    event.sender.send("mods:progress", { ...progress, projectId: payload.projectId });
  };
  try {
    const result = await modManager.installMod({
      gamePath,
      projectId: payload.projectId,
      slug: payload.slug,
      loader: payload.loader || active.loader || "fabric",
      gameVersion: payload.gameVersion || active.version || "1.21.1",
      onProgress: sendProgress,
    });
    return { ...result, mods: modManager.listInstalled(gamePath).mods };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("mods:remove", (_event, payload = {}) => {
  const gamePath = instances.getGamePath(payload.instanceId || instances.getActiveInstance().id);
  const result = modManager.removeMod(gamePath, payload.projectId);
  return { ...result, mods: modManager.listInstalled(gamePath).mods };
});

ipcMain.handle("mods:set-enabled", (_event, payload = {}) => {
  const gamePath = instances.getGamePath(payload.instanceId || instances.getActiveInstance().id);
  const result = modManager.setModEnabled(gamePath, payload.projectId, Boolean(payload.enabled));
  return { ...result, mods: modManager.listInstalled(gamePath).mods };
});

ipcMain.handle("mods:install-modpack", async (event, payload = {}) => {
  const active = instances.getActiveInstance();
  const instanceId = payload.instanceId || active.id;
  const gamePath = instances.getGamePath(instanceId);
  const sendProgress = (progress) => {
    event.sender.send("mods:progress", { ...progress, projectId: payload.projectId });
  };
  try {
    const result = await modManager.installModpack({
      gamePath,
      projectId: payload.projectId,
      slug: payload.slug,
      loader: payload.loader || active.loader || "fabric",
      gameVersion: payload.gameVersion || active.version || "1.21.1",
      onProgress: sendProgress,
    });
    return { ...result, mods: modManager.listInstalled(gamePath).mods };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle("presets:list", () => presets.listPresets());

ipcMain.handle("presets:create", (_event, input) => presets.createPreset(input || {}));

ipcMain.handle("presets:update", (_event, id, patch) => presets.updatePreset(id, patch || {}));

ipcMain.handle("presets:delete", (_event, id) => presets.deletePreset(id));

ipcMain.handle("java:pick-path", async () => {
  if (!mainWindow) return { success: false, cancelled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select Java executable",
    properties: ["openFile"],
    filters:
      process.platform === "win32"
        ? [{ name: "Java", extensions: ["exe"] }]
        : [{ name: "All files", extensions: ["*"] }],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { success: false, cancelled: true };
  }
  return { success: true, path: result.filePaths[0] };
});

ipcMain.handle("payments:open-external", async (_event, url) => {
  if (!isAllowedExternalUrl(url)) {
    return { success: false, error: "Only http(s) checkout URLs are allowed." };
  }
  try {
    await shell.openExternal(String(url));
    // User returns from Stripe in the browser — focus handler also refreshes entitlements.
    setTimeout(() => {
      mainWindow?.webContents.send("payments:refresh");
    }, 1500);
    return { success: true };
  } catch (err) {
    console.error("[payments] openExternal failed:", err);
    return {
      success: false,
      error: err?.message || "Failed to open checkout in browser.",
    };
  }
});

ipcMain.handle("payments:get-api-base", () => paymentsConfig.getApiBase());

app.whenReady().then(() => {
  authSession.loadSessionStore();
  instances.ensureStore();
  createWindow();
});

app.on("window-all-closed", () => {
  // Keep the app alive while Minecraft is running with the launcher hidden.
  if (gameLauncher.isGameRunning()) return;
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow && !mainWindow.isVisible()) {
    setMainWindow(mainWindow);
    mainWindow.show();
  }
});
