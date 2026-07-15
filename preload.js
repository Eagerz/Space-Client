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

  /** @param {{ version?: string, loader?: string, memoryGb?: number, equippedCape?: string | null }} options */
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
  onLaunchLog: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launch:log", listener);
    return () => ipcRenderer.removeListener("launch:log", listener);
  },

  /** Open Stripe Checkout URL in the system browser (PCI-safe). */
  openPaymentPortal: (url) => ipcRenderer.invoke("payments:open-external", url),
  getPaymentsApiBase: () => ipcRenderer.invoke("payments:get-api-base"),
  onPaymentsRefresh: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("payments:refresh", listener);
    return () => ipcRenderer.removeListener("payments:refresh", listener);
  },

  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateChecking: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("update:checking", listener);
    return () => ipcRenderer.removeListener("update:checking", listener);
  },
  onUpdateAvailable: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("update:available", listener);
    return () => ipcRenderer.removeListener("update:available", listener);
  },
  onUpdateNotAvailable: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("update:not-available", listener);
    return () => ipcRenderer.removeListener("update:not-available", listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("update:progress", listener);
    return () => ipcRenderer.removeListener("update:progress", listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("update:downloaded", listener);
    return () => ipcRenderer.removeListener("update:downloaded", listener);
  },
  onUpdateError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("update:error", listener);
    return () => ipcRenderer.removeListener("update:error", listener);
  },
});

/** Slim payments alias used by store / Space+ checkout. */
contextBridge.exposeInMainWorld("api", {
  openPaymentPortal: (url) => ipcRenderer.invoke("payments:open-external", url),
  getPaymentsApiBase: () => ipcRenderer.invoke("payments:get-api-base"),
  onPaymentsRefresh: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("payments:refresh", listener);
    return () => ipcRenderer.removeListener("payments:refresh", listener);
  },
});
