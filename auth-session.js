const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

/** @typedef {{ id: string, name: string, skins: { url: string }[], access_token: string, refresh_token: string, client_token: string, expires_in: number, client_id?: string, clientSecret?: string, savedAt?: number }} McProfile */

/** @type {{ accounts: McProfile[], activeId: string | null } | null} */
let store = null;

function sessionFilePath() {
  return path.join(app.getPath("userData"), "auth-session.enc");
}

function canEncrypt() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function emptyStore() {
  return { accounts: [], activeId: null };
}

function persist() {
  if (!store) return;
  try {
    const payload = JSON.stringify(store);
    const filePath = sessionFilePath();
    if (canEncrypt()) {
      fs.writeFileSync(filePath, safeStorage.encryptString(payload));
    } else {
      fs.writeFileSync(filePath, payload, "utf8");
    }
  } catch (err) {
    console.warn("[auth] Failed to persist session:", err.message);
  }
}

/**
 * Persist tokens in main process only. Uses Electron safeStorage when available.
 * Adds or updates the account and sets it active.
 * @param {McProfile} profile
 */
function saveSession(profile) {
  loadSessionStore();
  const entry = {
    id: profile.id,
    name: profile.name,
    skins: profile.skins || [],
    access_token: profile.access_token,
    refresh_token: profile.refresh_token,
    client_token: profile.client_token,
    expires_in: profile.expires_in,
    client_id: profile.client_id || "00000000402b5328",
    clientSecret: profile.clientSecret || "",
    savedAt: Date.now(),
  };

  const idx = store.accounts.findIndex((a) => a.id === entry.id);
  if (idx >= 0) {
    store.accounts[idx] = { ...store.accounts[idx], ...entry };
  } else {
    store.accounts.push(entry);
  }
  store.activeId = entry.id;
  persist();
}

function migrateLegacySession(parsed) {
  // Old format was a single profile object with access_token.
  if (parsed && parsed.access_token && parsed.id && !parsed.accounts) {
    return {
      accounts: [
        {
          ...parsed,
          client_id: parsed.client_id || "00000000402b5328",
          clientSecret: parsed.clientSecret || "",
        },
      ],
      activeId: parsed.id,
    };
  }
  if (parsed && Array.isArray(parsed.accounts)) {
    return {
      accounts: parsed.accounts,
      activeId: parsed.activeId || parsed.accounts[0]?.id || null,
    };
  }
  return emptyStore();
}

function loadSessionStore() {
  if (store) return store;

  try {
    const filePath = sessionFilePath();
    if (!fs.existsSync(filePath)) {
      store = emptyStore();
      return store;
    }

    const raw = fs.readFileSync(filePath);
    const json = canEncrypt()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");

    store = migrateLegacySession(JSON.parse(json));
    return store;
  } catch (err) {
    console.warn("[auth] Failed to load session:", err.message);
    store = emptyStore();
    return store;
  }
}

/** @deprecated prefer loadSessionStore — kept for callers expecting a single profile */
function loadSession() {
  return getActiveAccount();
}

function getActiveAccount() {
  const s = loadSessionStore();
  if (!s.activeId) return null;
  return s.accounts.find((a) => a.id === s.activeId) || null;
}

function clearSession() {
  const s = loadSessionStore();
  if (!s.activeId) {
    store = emptyStore();
    try {
      const filePath = sessionFilePath();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.warn("[auth] Failed to clear session:", err.message);
    }
    return;
  }

  s.accounts = s.accounts.filter((a) => a.id !== s.activeId);
  s.activeId = s.accounts[0]?.id || null;
  store = s;
  if (s.accounts.length === 0) {
    try {
      const filePath = sessionFilePath();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.warn("[auth] Failed to clear session file:", err.message);
    }
    store = emptyStore();
  } else {
    persist();
  }
}

function clearAllSessions() {
  store = emptyStore();
  try {
    const filePath = sessionFilePath();
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("[auth] Failed to clear all sessions:", err.message);
  }
}

/**
 * Return a rendered head URL for UI avatars.
 */
function getSkinUrl(profile) {
  const rawId = profile?.id ? String(profile.id).replace(/-/g, "") : "";
  if (/^[a-f0-9]{32}$/i.test(rawId)) {
    return `https://mc-heads.net/avatar/${rawId}/96`;
  }
  if (profile?.name) {
    return `https://mc-heads.net/avatar/${encodeURIComponent(profile.name)}/96`;
  }
  const activeSkin = profile?.skins?.find((s) => s.state === "ACTIVE") || profile?.skins?.[0];
  if (activeSkin?.url) {
    return String(activeSkin.url).replace(/^http:\/\//i, "https://");
  }
  return "https://mc-heads.net/avatar/MHF_Steve/96";
}

function getExpiresAt(profile) {
  if (!profile?.savedAt || !profile?.expires_in) return null;
  return profile.savedAt + profile.expires_in * 1000;
}

function toPublicProfile(profile) {
  if (!profile) return null;
  const expiresAt = getExpiresAt(profile);
  const now = Date.now();
  const expired = Boolean(expiresAt && now > expiresAt);
  const needsRefresh = Boolean(expiresAt && now > expiresAt - 5 * 60 * 1000);

  return {
    uuid: profile.id,
    username: profile.name,
    skinUrl: getSkinUrl(profile),
    expiresAt,
    expired,
    needsRefresh,
    isLoggedIn: !expired,
  };
}

/** Safe profile for renderer — no raw tokens exposed. */
function getPublicProfile() {
  const profile = getActiveAccount();
  if (!profile) return null;
  return toPublicProfile(profile);
}

function listAccounts() {
  const s = loadSessionStore();
  return {
    activeId: s.activeId,
    accounts: s.accounts.map((a) => toPublicProfile(a)).filter(Boolean),
  };
}

function setActiveAccount(id) {
  const s = loadSessionStore();
  if (!s.accounts.some((a) => a.id === id)) {
    return { success: false, error: "Account not found." };
  }
  s.activeId = id;
  persist();
  return { success: true, ...listAccounts() };
}

function removeAccount(id) {
  const s = loadSessionStore();
  const before = s.accounts.length;
  s.accounts = s.accounts.filter((a) => a.id !== id);
  if (s.accounts.length === before) {
    return { success: false, error: "Account not found." };
  }
  if (s.activeId === id) {
    s.activeId = s.accounts[0]?.id || null;
  }
  store = s;
  if (s.accounts.length === 0) {
    clearAllSessions();
  } else {
    persist();
  }
  return { success: true, ...listAccounts() };
}

function isLoggedIn() {
  const profile = getActiveAccount();
  if (!profile) return false;

  const expiresAt = getExpiresAt(profile);
  if (expiresAt && Date.now() > expiresAt) {
    return false;
  }

  return true;
}

function isExpired() {
  const profile = getActiveAccount();
  if (!profile) return false;
  const expiresAt = getExpiresAt(profile);
  return Boolean(expiresAt && Date.now() > expiresAt);
}

function needsRefresh(skewMs = 5 * 60 * 1000) {
  const profile = getActiveAccount();
  if (!profile) return false;
  const expiresAt = getExpiresAt(profile);
  if (!expiresAt) return Boolean(profile.refresh_token);
  return Date.now() > expiresAt - skewMs;
}

function getTokens() {
  const profile = getActiveAccount();
  if (!profile) return null;

  return {
    access_token: profile.access_token,
    refresh_token: profile.refresh_token,
    client_token: profile.client_token,
    client_id: profile.client_id || "00000000402b5328",
    clientSecret: profile.clientSecret || "",
    uuid: profile.id,
    username: profile.name,
    expires_in: profile.expires_in,
    savedAt: profile.savedAt,
    skins: profile.skins || [],
  };
}

/**
 * Build a profile object suitable for electron-mc-auth refresh().
 */
function getRefreshProfile() {
  const profile = getActiveAccount();
  if (!profile?.refresh_token) return null;
  return {
    ...profile,
    client_id: profile.client_id || "00000000402b5328",
    clientSecret: profile.clientSecret || "",
    // Library validate() compares expires_in > Date.now(); force refresh path.
    expires_in: 0,
  };
}

module.exports = {
  saveSession,
  loadSession,
  loadSessionStore,
  clearSession,
  clearAllSessions,
  getPublicProfile,
  listAccounts,
  setActiveAccount,
  removeAccount,
  isLoggedIn,
  isExpired,
  needsRefresh,
  getTokens,
  getRefreshProfile,
  getActiveAccount,
  getExpiresAt,
};
