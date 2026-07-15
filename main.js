const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { useMcAuth } = require("electron-mc-auth");
const authSession = require("./auth-session");
const gameLauncher = require("./game-launcher");

const BACKGROUND_COLOR = "#08080A";
let mainWindow = null;

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
  const loggedIn = authSession.isLoggedIn();
  mainWindow?.webContents.send("auth-state-changed", {
    isLoggedIn: loggedIn,
    profile: loggedIn ? profile : null,
  });
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

    authSession.saveSession(profile);
    const publicProfile = authSession.getPublicProfile();
    broadcastAuthState();

    return { success: true, profile: publicProfile };
  } catch (err) {
    console.error("[auth] Microsoft login failed:", err);
    return {
      success: false,
      error: err?.message || "Authentication failed. Please try again.",
    };
  }
});

ipcMain.handle("auth:get-profile", () => {
  if (!authSession.isLoggedIn()) {
    return { isLoggedIn: false, profile: null };
  }
  return { isLoggedIn: true, profile: authSession.getPublicProfile() };
});

ipcMain.handle("auth:is-logged-in", () => authSession.isLoggedIn());

ipcMain.handle("auth:logout", () => {
  authSession.clearSession();
  broadcastAuthState();
  return { success: true };
});

ipcMain.handle("launch:start", async (_event, options = {}) => {
  if (!mainWindow) {
    return { success: false, error: "Launcher window is not available." };
  }
  return gameLauncher.launchGame(mainWindow, options);
});

ipcMain.handle("launch:is-running", () => gameLauncher.isGameRunning());

app.whenReady().then(() => {
  authSession.loadSession();
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
    mainWindow.show();
  }
});
