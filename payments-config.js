/**
 * Payments API base URL for the Electron renderer (no secrets).
 * Override with SPACE_PAYMENTS_API in the environment when packaging.
 */
const isDev =
  process.env.NODE_ENV !== "production" &&
  !process.env.SPACE_PAYMENTS_API;

module.exports = {
  /** Resolved at runtime in main and exposed via IPC. */
  getApiBase() {
    if (process.env.SPACE_PAYMENTS_API) {
      return String(process.env.SPACE_PAYMENTS_API).replace(/\/$/, "");
    }
    if (isDev) {
      return "http://localhost:8787";
    }
    return "https://api.spaceclient.app";
  },
};
