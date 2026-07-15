const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

/** @typedef {{ id: string, name: string, skins: { url: string }[], access_token: string, refresh_token: string, client_token: string, expires_in: number }} McProfile */

let session = null;

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

/**
 * Persist tokens in main process only. Uses Electron safeStorage when available.
 * @param {McProfile} profile
 */
function saveSession(profile) {
  session = {
    id: profile.id,
    name: profile.name,
    skins: profile.skins || [],
    access_token: profile.access_token,
    refresh_token: profile.refresh_token,
    client_token: profile.client_token,
    expires_in: profile.expires_in,
    savedAt: Date.now(),
  };

  try {
    const payload = JSON.stringify(session);
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

function loadSession() {
  if (session) return session;

  try {
    const filePath = sessionFilePath();
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath);
    const json = canEncrypt()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");

    session = JSON.parse(json);
    return session;
  } catch (err) {
    console.warn("[auth] Failed to load session:", err.message);
    return null;
  }
}

function clearSession() {
  session = null;
  try {
    const filePath = sessionFilePath();
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn("[auth] Failed to clear session:", err.message);
  }
}

function getSkinUrl(profile) {
  const activeSkin = profile?.skins?.find((s) => s.state === "ACTIVE") || profile?.skins?.[0];
  if (activeSkin?.url) return activeSkin.url;
  if (profile?.id) return `https://mc-heads.net/avatar/${profile.id}/96`;
  return "https://mc-heads.net/avatar/MHF_Steve/96";
}

function getExpiresAt(profile) {
  if (!profile?.savedAt || !profile?.expires_in) return null;
  return profile.savedAt + profile.expires_in * 1000;
}

/** Safe profile for renderer — no raw tokens exposed. */
function getPublicProfile() {
  const profile = loadSession();
  if (!profile) return null;

  const expiresAt = getExpiresAt(profile);

  return {
    uuid: profile.id,
    username: profile.name,
    skinUrl: getSkinUrl(profile),
    expiresAt,
    isLoggedIn: true,
  };
}

function isLoggedIn() {
  const profile = loadSession();
  if (!profile) return false;

  const expiresAt = getExpiresAt(profile);
  if (expiresAt && Date.now() > expiresAt) {
    return false;
  }

  return true;
}

function getTokens() {
  const profile = loadSession();
  if (!profile || !isLoggedIn()) return null;

  return {
    access_token: profile.access_token,
    refresh_token: profile.refresh_token,
    client_token: profile.client_token,
    uuid: profile.id,
    username: profile.name,
  };
}

module.exports = {
  saveSession,
  loadSession,
  clearSession,
  getPublicProfile,
  isLoggedIn,
  getTokens,
};
