const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimizeWindow: () => ipcRenderer.invoke("window-minimize"),
  maximizeWindow: () => ipcRenderer.invoke("window-maximize"),
  closeWindow: () => ipcRenderer.invoke("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onMaximizedChanged: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window-maximized-changed", listener);
    return () => ipcRenderer.removeListener("window-maximized-changed", listener);
  },

  loginWithMicrosoft: () => ipcRenderer.invoke("auth:microsoft-login"),
  getAuthProfile: () => ipcRenderer.invoke("auth:get-profile"),
  isLoggedIn: () => ipcRenderer.invoke("auth:is-logged-in"),
  logout: () => ipcRenderer.invoke("auth:logout"),
  onAuthStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("auth-state-changed", listener);
    return () => ipcRenderer.removeListener("auth-state-changed", listener);
  },

  /** @param {{ version?: string, loader?: string, memoryGb?: number }} options */
  launchGame: (options) => ipcRenderer.invoke("launch:start", options),
  isLaunchRunning: () => ipcRenderer.invoke("launch:is-running"),
  onLaunchProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launch:progress", listener);
    return () => ipcRenderer.removeListener("launch:progress", listener);
  },
  onLaunchStarted: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launch:started", listener);
    return () => ipcRenderer.removeListener("launch:started", listener);
  },
  onLaunchClosed: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launch:closed", listener);
    return () => ipcRenderer.removeListener("launch:closed", listener);
  },
  onLaunchError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launch:error", listener);
    return () => ipcRenderer.removeListener("launch:error", listener);
  },
});
