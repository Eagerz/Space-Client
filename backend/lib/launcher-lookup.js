"use strict";

/**
 * Resolve Minecraft / Discord names → Apex Launcher ID (Minecraft UUID).
 */

const playerDb = require("./player-db");
const crashCases = require("./crash-cases");
const { getClient, isReady } = require("./discord-bot/client");

function envId(key) {
  return String(process.env[key] || "").trim();
}

/**
 * Mojang username → UUID (no dashes).
 * @param {string} username
 */
async function resolveMojangUsername(username) {
  const name = String(username || "").trim();
  if (!name || name.length > 16 || /\s/.test(name)) return null;
  try {
    const res = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
      { headers: { Accept: "application/json" } }
    );
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.id) return null;
    return {
      uuid: playerDb.normalizeUuid(data.id),
      username: data.name || name,
      source: "mojang",
    };
  } catch {
    return null;
  }
}

/**
 * Search Discord guild members by username / display name / nickname.
 * @param {string} q
 */
async function searchDiscordMembers(q) {
  const query = String(q || "").trim();
  if (!query || query.length < 2) return [];
  const client = getClient();
  const gid = envId("DISCORD_GUILD_ID");
  if (!client || !isReady() || !gid) return [];

  try {
    const guild = await client.guilds.fetch(gid);
    // Prefer API search (needs Server Members Intent for large guilds)
    let members;
    try {
      members = await guild.members.fetch({ query, limit: 15 });
    } catch {
      await guild.members.fetch().catch(() => null);
      const lower = query.toLowerCase();
      members = guild.members.cache.filter((m) => {
        const u = (m.user?.username || "").toLowerCase();
        const g = (m.user?.globalName || "").toLowerCase();
        const n = (m.nickname || "").toLowerCase();
        return u.includes(lower) || g.includes(lower) || n.includes(lower);
      });
    }

    const out = [];
    for (const m of members.values()) {
      out.push({
        discordId: m.user.id,
        discordUsername: m.user.username,
        discordGlobalName: m.user.globalName || null,
        nickname: m.nickname || null,
        source: "discord",
      });
      if (out.length >= 15) break;
    }
    return out;
  } catch (err) {
    console.warn("[launcher-lookup] discord search:", err?.message || err);
    return [];
  }
}

/**
 * Crash-case hits that mention Discord or MC names.
 * @param {string} q
 */
function searchCrashIdentities(q) {
  const lower = String(q || "").trim().toLowerCase();
  if (!lower) return [];
  const list = crashCases.listCases?.() || [];
  const hits = [];
  for (const c of list) {
    const p = c.player || {};
    const mc = String(p.minecraftUsername || "").toLowerCase();
    const du = String(p.discordUsername || "").toLowerCase();
    const did = String(p.discordId || "");
    const uuid = playerDb.normalizeUuid(p.minecraftUuid || "");
    if (
      (mc && mc.includes(lower)) ||
      (du && du.includes(lower)) ||
      (did && did.includes(lower)) ||
      (uuid && uuid.includes(lower.replace(/-/g, "")))
    ) {
      hits.push({
        uuid: uuid || null,
        username: p.minecraftUsername || null,
        discordId: p.discordId || null,
        discordUsername: p.discordUsername || null,
        crashId: c.crashId,
        source: "crash-case",
      });
    }
  }
  return hits.slice(0, 20);
}

/**
 * Full staff lookup: local DB + Mojang + Discord + crash cases.
 * @param {string} q
 */
async function lookupLauncherId(q) {
  const query = String(q || "").trim();
  if (!query) {
    return { query: "", matches: [], mojang: null, discordMembers: [], crashHits: [] };
  }

  const local = playerDb.listPlayers({ q: query, limit: 40 });
  const matches = (local.players || []).map((p) => ({
    launcherId: p.uuid,
    uuid: p.uuid,
    username: p.username,
    discordId: p.discordId || null,
    discordUsername: p.discordUsername || null,
    credits: p.credits,
    spacePlus: p.spacePlus,
    pendingStaffInbox: p.pendingStaffInbox,
    source: "player-db",
    updatedAt: p.updatedAt,
  }));

  const seen = new Set(matches.map((m) => m.uuid));

  // Exact/near Mojang resolve when query looks like a MC name
  let mojang = null;
  if (!query.includes(" ") && query.length <= 16 && !/^[0-9a-f-]{32,36}$/i.test(query)) {
    mojang = await resolveMojangUsername(query);
    if (mojang?.uuid && !seen.has(mojang.uuid)) {
      // Ensure record exists for staff actions
      playerDb.touchPlayerIdentity(mojang.uuid, mojang.username);
      const p = playerDb.getPlayer(mojang.uuid);
      matches.unshift({
        launcherId: mojang.uuid,
        uuid: mojang.uuid,
        username: mojang.username,
        discordId: p.discordId || null,
        discordUsername: p.discordUsername || null,
        credits: p.credits || 0,
        spacePlus: Boolean(p.spacePlus),
        pendingStaffInbox: p.pendingStaffInbox,
        source: "mojang",
        updatedAt: p.updatedAt,
      });
      seen.add(mojang.uuid);
    } else if (mojang?.uuid && seen.has(mojang.uuid)) {
      const hit = matches.find((m) => m.uuid === mojang.uuid);
      if (hit) hit.source = `${hit.source}+mojang`;
    }
  }

  // UUID paste
  const asUuid = playerDb.normalizeUuid(query);
  if (asUuid.length === 32 && !seen.has(asUuid)) {
    playerDb.touchPlayerIdentity(asUuid, null);
    const p = playerDb.getPlayer(asUuid);
    matches.unshift({
      launcherId: asUuid,
      uuid: asUuid,
      username: p.username || null,
      discordId: p.discordId || null,
      discordUsername: p.discordUsername || null,
      credits: p.credits || 0,
      spacePlus: Boolean(p.spacePlus),
      pendingStaffInbox: p.pendingStaffInbox,
      source: "uuid",
      updatedAt: p.updatedAt,
    });
    seen.add(asUuid);
  }

  const crashHits = searchCrashIdentities(query);
  for (const hit of crashHits) {
    if (hit.uuid && !seen.has(hit.uuid)) {
      if (hit.username) playerDb.touchPlayerIdentity(hit.uuid, hit.username);
      if (hit.discordId) {
        playerDb.touchDiscordIdentity(hit.uuid, hit.discordId, hit.discordUsername);
      }
      const p = playerDb.getPlayer(hit.uuid);
      matches.push({
        launcherId: hit.uuid,
        uuid: hit.uuid,
        username: hit.username || p.username,
        discordId: hit.discordId || p.discordId || null,
        discordUsername: hit.discordUsername || p.discordUsername || null,
        credits: p.credits || 0,
        spacePlus: Boolean(p.spacePlus),
        pendingStaffInbox: p.pendingStaffInbox,
        source: "crash-case",
        crashId: hit.crashId,
        updatedAt: p.updatedAt,
      });
      seen.add(hit.uuid);
    }
  }

  const discordMembers = await searchDiscordMembers(query);

  // Link Discord members who already have a player-db discordId
  for (const dm of discordMembers) {
    const linked = playerDb.findByDiscordId(dm.discordId);
    if (linked && !seen.has(linked.uuid)) {
      matches.push({
        launcherId: linked.uuid,
        uuid: linked.uuid,
        username: linked.username,
        discordId: linked.discordId,
        discordUsername: linked.discordUsername || dm.discordUsername,
        credits: linked.credits || 0,
        spacePlus: Boolean(linked.spacePlus),
        pendingStaffInbox: linked.pendingStaffInbox,
        source: "discord-link",
        updatedAt: linked.updatedAt,
      });
      seen.add(linked.uuid);
    }
  }

  return {
    query,
    matches,
    mojang,
    discordMembers,
    crashHits,
    note:
      "Launcher ID = Minecraft UUID. Force update queues a check on that player's next launcher heartbeat (~45s). New binaries are still published globally.",
  };
}

module.exports = {
  lookupLauncherId,
  resolveMojangUsername,
  searchDiscordMembers,
};
