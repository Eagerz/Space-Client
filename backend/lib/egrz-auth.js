"use strict";

/**
 * Egrz staff auth — Discord OAuth + HMAC session cookie + guild role gates.
 */

const crypto = require("crypto");

const COOKIE_NAME = "egrz_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ROLE_ENVS = [
  { env: "DISCORD_ROLE_EAGERZ1_ID", level: "owner", label: "Eagerz1" },
  { env: "DISCORD_ROLE_MANAGER_ID", level: "owner", label: "Manager" },
  { env: "DISCORD_ROLE_SRADMIN_ID", level: "ops", label: "SrAdmin" },
  { env: "DISCORD_ROLE_SRMOD_ID", level: "ops", label: "SrMod" },
  { env: "DISCORD_ROLE_MOD_ID", level: "viewer", label: "Mod" },
  { env: "DISCORD_ROLE_HELPER_ID", level: "viewer", label: "Helper" },
  { env: "DISCORD_ROLE_DEVELOPERS_ID", level: "viewer", label: "Developers" },
  { env: "DISCORD_STAFF_ROLE_ID", level: "viewer", label: "Staff" },
];

const LEVEL_RANK = { viewer: 1, ops: 2, owner: 3 };

function publicUrl() {
  return String(process.env.EGRZ_PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`).replace(
    /\/$/,
    ""
  );
}

function oauthClientId() {
  return String(process.env.DISCORD_OAUTH_CLIENT_ID || process.env.DISCORD_BOT_CLIENT_ID || "").trim();
}

function oauthClientSecret() {
  return String(process.env.DISCORD_OAUTH_CLIENT_SECRET || "").trim();
}

function sessionSecret() {
  return String(process.env.EGRZ_SESSION_SECRET || "").trim();
}

function guildId() {
  return String(process.env.DISCORD_GUILD_ID || "").trim();
}

function botToken() {
  return String(process.env.DISCORD_BOT_TOKEN || "").trim();
}

function redirectUri() {
  return `${publicUrl()}/api/staff/auth/callback`;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signPayload(obj) {
  const secret = sessionSecret();
  if (!secret) throw new Error("EGRZ_SESSION_SECRET is not set");
  const body = b64url(JSON.stringify(obj));
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || !sessionSecret()) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expect = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = Buffer.from(body, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verifyToken(cookies[COOKIE_NAME]);
}

function setSessionCookie(res, payload) {
  const token = signPayload(payload);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = publicUrl().startsWith("https") ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = publicUrl().startsWith("https") ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

function staffRoleIds() {
  return ROLE_ENVS.map((r) => ({
    ...r,
    id: String(process.env[r.env] || "").trim(),
  })).filter((r) => r.id);
}

/**
 * @param {string[]} memberRoleIds
 */
function resolveAccess(memberRoleIds) {
  const set = new Set(memberRoleIds.map(String));
  let best = null;
  const matched = [];
  for (const role of staffRoleIds()) {
    if (!set.has(role.id)) continue;
    matched.push(role.label);
    if (!best || LEVEL_RANK[role.level] > LEVEL_RANK[best.level]) {
      best = role;
    }
  }
  if (!best) return null;
  return { level: best.level, roles: matched };
}

function oauthConfigured() {
  return Boolean(oauthClientId() && oauthClientSecret() && sessionSecret() && guildId());
}

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: oauthClientId(),
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: "identify",
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: oauthClientId(),
    client_secret: oauthClientSecret(),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
  });
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Discord user (${res.status})`);
  return res.json();
}

/**
 * Use bot token to read guild member roles (reliable; no guilds.members.read scope needed).
 * @param {string} userId
 */
async function fetchGuildMember(userId) {
  const gid = guildId();
  const token = botToken();
  if (!gid || !token) throw new Error("DISCORD_GUILD_ID / DISCORD_BOT_TOKEN required for staff checks");
  const res = await fetch(`https://discord.com/api/v10/guilds/${gid}/members/${userId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guild member fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

function requireAuth(minLevel = "viewer") {
  const minRank = LEVEL_RANK[minLevel] || 1;
  return (req, res, next) => {
    const session = getSession(req);
    if (!session) {
      return res.status(401).json({ error: "Not signed in", login: "/api/staff/auth/login" });
    }
    if ((LEVEL_RANK[session.level] || 0) < minRank) {
      return res.status(403).json({ error: "Insufficient staff level", level: session.level, need: minLevel });
    }
    req.egrz = session;
    next();
  };
}

function createSessionFromUser(user, access) {
  return {
    sub: String(user.id),
    username: user.username || "",
    globalName: user.global_name || user.username || "",
    avatar: user.avatar || null,
    level: access.level,
    roles: access.roles,
    exp: Date.now() + SESSION_TTL_MS,
  };
}

module.exports = {
  COOKIE_NAME,
  oauthConfigured,
  publicUrl,
  redirectUri,
  oauthClientId,
  buildAuthorizeUrl,
  exchangeCode,
  fetchDiscordUser,
  fetchGuildMember,
  resolveAccess,
  createSessionFromUser,
  setSessionCookie,
  clearSessionCookie,
  getSession,
  requireAuth,
  staffRoleIds,
  LEVEL_RANK,
};
