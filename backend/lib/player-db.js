const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "players.json");

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify({ players: {}, processedSessions: {} }, null, 2),
      "utf8"
    );
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  if (!db.players) db.players = {};
  if (!db.processedSessions) db.processedSessions = {};
  return db;
}

/** Prevent double-credit on Stripe webhook retries. */
function claimSession(sessionId) {
  if (!sessionId) return true;
  const db = readDb();
  if (db.processedSessions[sessionId]) return false;
  db.processedSessions[sessionId] = new Date().toISOString();
  writeDb(db);
  return true;
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function normalizeUuid(uuid) {
  return String(uuid || "").replace(/-/g, "").toLowerCase();
}

function defaultPlayer(id) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    uuid: id,
    username: null,
    discordId: null,
    discordUsername: null,
    credits: 0,
    spacePlus: false,
    spacePlusInterval: null,
    stripeCustomerId: null,
    stardust: 0,
    stardustLifetime: 0,
    stardustDailyEarned: 0,
    stardustDailyDate: today,
    cosmicPassXp: 0,
    cosmicPassLevel: 1,
    totalActiveMs: 0,
    ownedCosmetics: [],
    equippedCosmetics: { capes: null, pets: null, titles: null, icons: null },
    sessionHistory: [],
    pendingStaffInbox: emptyInbox(),
    updatedAt: new Date().toISOString(),
  };
}

function emptyInbox() {
  return {
    actions: [],
    tip: null,
    forceUpdateCheck: false,
    updatedAt: null,
    queuedBy: null,
  };
}

function migratePlayer(player, id) {
  const today = new Date().toISOString().slice(0, 10);
  if (player.stardust == null) player.stardust = 0;
  if (player.stardustLifetime == null) player.stardustLifetime = 0;
  if (player.stardustDailyEarned == null) player.stardustDailyEarned = 0;
  if (!player.stardustDailyDate) player.stardustDailyDate = today;
  if (player.cosmicPassXp == null) player.cosmicPassXp = 0;
  if (player.cosmicPassLevel == null) player.cosmicPassLevel = 1;
  if (player.totalActiveMs == null) player.totalActiveMs = 0;
  if (!Array.isArray(player.ownedCosmetics)) player.ownedCosmetics = [];
  if (!player.equippedCosmetics) {
    player.equippedCosmetics = { capes: null, pets: null, titles: null, icons: null };
  }
  if (!Array.isArray(player.sessionHistory)) player.sessionHistory = [];
  if (player.username === undefined) player.username = null;
  if (player.discordId === undefined) player.discordId = null;
  if (player.discordUsername === undefined) player.discordUsername = null;
  if (!player.pendingStaffInbox || typeof player.pendingStaffInbox !== "object") {
    player.pendingStaffInbox = emptyInbox();
  }
  if (!Array.isArray(player.pendingStaffInbox.actions)) {
    player.pendingStaffInbox.actions = [];
  }
  if (player.pendingStaffInbox.forceUpdateCheck == null) {
    player.pendingStaffInbox.forceUpdateCheck = false;
  }
  if (player.pendingStaffInbox.tip === undefined) {
    player.pendingStaffInbox.tip = null;
  }
  player.uuid = id;
  return player;
}

function getPlayer(mcUuid) {
  const id = normalizeUuid(mcUuid);
  const db = readDb();
  if (!db.players[id]) {
    db.players[id] = defaultPlayer(id);
    writeDb(db);
  } else {
    db.players[id] = migratePlayer(db.players[id], id);
  }
  return db.players[id];
}

function savePlayer(player) {
  const db = readDb();
  const id = normalizeUuid(player.uuid);
  player.uuid = id;
  player.updatedAt = new Date().toISOString();
  db.players[id] = player;
  writeDb(db);
  return player;
}

function addCredits(mcUuid, amount, meta = {}) {
  const player = getPlayer(mcUuid);
  const credits = Math.max(0, Math.round(Number(amount) || 0));
  player.credits = (player.credits || 0) + credits;
  player.lastPurchase = {
    type: "credits",
    credits,
    ...meta,
    at: new Date().toISOString(),
  };
  return savePlayer(player);
}

function setSpacePlus(mcUuid, enabled, meta = {}) {
  const player = getPlayer(mcUuid);
  player.spacePlus = Boolean(enabled);
  player.spacePlusInterval = meta.interval || player.spacePlusInterval || null;
  if (meta.stripeCustomerId) {
    player.stripeCustomerId = meta.stripeCustomerId;
  }
  player.lastPurchase = {
    type: "spaceplus",
    enabled: player.spacePlus,
    ...meta,
    at: new Date().toISOString(),
  };
  return savePlayer(player);
}

function addSessionRecord(mcUuid, record) {
  const player = getPlayer(mcUuid);
  const history = Array.isArray(player.sessionHistory) ? player.sessionHistory : [];
  history.unshift({
    id: record.sessionId,
    instanceId: record.instanceId || null,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    activeMs: record.activeMs || 0,
    stardustEarned: record.stardustEarned || 0,
    crashed: Boolean(record.crashed),
    syncedAt: new Date().toISOString(),
  });
  player.sessionHistory = history.slice(0, 50);
  player.totalActiveMs = (player.totalActiveMs || 0) + (record.activeMs || 0);
  return savePlayer(player);
}

function applyStardustEarn(mcUuid, amount, meta = {}) {
  const player = getPlayer(mcUuid);
  const { resetDailyIfNeeded } = require("./progression-math");
  resetDailyIfNeeded(player);
  const delta = Math.max(0, Math.round(Number(amount) || 0));
  if (!delta) return savePlayer(player);
  player.stardust = (player.stardust || 0) + delta;
  player.stardustLifetime = (player.stardustLifetime || 0) + delta;
  player.stardustDailyEarned = (player.stardustDailyEarned || 0) + delta;
  player.lastProgression = { type: "earn", delta, ...meta, at: new Date().toISOString() };
  return savePlayer(player);
}

function spendStardust(mcUuid, amount, meta = {}) {
  const player = getPlayer(mcUuid);
  const cost = Math.max(0, Math.round(Number(amount) || 0));
  if (cost > (player.stardust || 0)) {
    return { ok: false, error: "Insufficient Stardust.", player };
  }
  player.stardust = (player.stardust || 0) - cost;
  player.lastProgression = { type: "spend", cost, ...meta, at: new Date().toISOString() };
  return { ok: true, player: savePlayer(player) };
}

function spendCredits(mcUuid, creditAmount, meta = {}) {
  const { stardustCostForCredits } = require("./progression-math");
  const stardustCost = stardustCostForCredits(creditAmount);
  return spendStardust(mcUuid, stardustCost, { ...meta, credits: creditAmount });
}

function unlockCosmetic(mcUuid, cosmeticId, source = "credits") {
  const player = getPlayer(mcUuid);
  const owned = new Set(player.ownedCosmetics || []);
  if (owned.has(cosmeticId)) {
    return { ok: false, error: "Already owned.", player };
  }
  owned.add(cosmeticId);
  player.ownedCosmetics = [...owned];
  player.lastProgression = {
    type: "unlock",
    cosmeticId,
    source,
    at: new Date().toISOString(),
  };
  return { ok: true, player: savePlayer(player) };
}

function setEquippedCosmetic(mcUuid, category, cosmeticId) {
  const player = getPlayer(mcUuid);
  if (!player.equippedCosmetics) {
    player.equippedCosmetics = { capes: null, pets: null, titles: null, icons: null };
  }
  player.equippedCosmetics[category] = cosmeticId || null;
  return savePlayer(player);
}

function getProgressionSnapshot(player) {
  const { creditsFromStardust, STARDUST_PER_CREDIT } = require("./progression-math");
  const stardust = player.stardust || 0;
  const creditBalance = creditsFromStardust(stardust) + (player.credits || 0);
  return {
    uuid: player.uuid,
    stardust,
    stardustLifetime: player.stardustLifetime || 0,
    stardustDailyEarned: player.stardustDailyEarned || 0,
    stardustDailyCap: 100,
    stardustDailyRemaining: Math.max(0, 100 - (player.stardustDailyEarned || 0)),
    stardustPerCredit: STARDUST_PER_CREDIT,
    credits: creditBalance,
    creditsFromStardust: creditsFromStardust(stardust),
    totalActiveMs: player.totalActiveMs || 0,
    ownedCosmetics: player.ownedCosmetics || [],
    equippedCosmetics: player.equippedCosmetics || {},
    spacePlus: Boolean(player.spacePlus),
    updatedAt: player.updatedAt,
  };
}

/**
 * Upsert last-known Minecraft username on a player record.
 * @param {string} mcUuid
 * @param {string|null|undefined} username
 */
function touchPlayerIdentity(mcUuid, username) {
  const id = normalizeUuid(mcUuid);
  if (!id || id.length < 32) return null;
  const player = getPlayer(id);
  const name = String(username || "").trim().slice(0, 32);
  if (name && player.username !== name) {
    player.username = name;
  }
  return savePlayer(player);
}

/**
 * Link Discord identity onto a launcher (Minecraft UUID) record.
 * @param {string} mcUuid
 * @param {string|null|undefined} discordId
 * @param {string|null|undefined} discordUsername
 */
function touchDiscordIdentity(mcUuid, discordId, discordUsername) {
  const id = normalizeUuid(mcUuid);
  if (!id || id.length < 32) return null;
  const player = getPlayer(id);
  const did = String(discordId || "").trim();
  const dname = String(discordUsername || "").trim().slice(0, 64);
  let changed = false;
  if (did && player.discordId !== did) {
    player.discordId = did;
    changed = true;
  }
  if (dname && player.discordUsername !== dname) {
    player.discordUsername = dname;
    changed = true;
  }
  return changed ? savePlayer(player) : player;
}

/**
 * @param {string} discordId
 */
function findByDiscordId(discordId) {
  const did = String(discordId || "").trim();
  if (!did) return null;
  const db = readDb();
  for (const p of Object.values(db.players || {})) {
    if (String(p.discordId || "") === did) {
      return migratePlayer({ ...p }, normalizeUuid(p.uuid));
    }
  }
  return null;
}

/**
 * Queue staff remote-fix / tip for a signed-in launcher (by Minecraft UUID).
 * @param {string} mcUuid
 * @param {{ actions?: string[], tip?: string|null, forceUpdateCheck?: boolean, queuedBy?: string|null }} opts
 */
function queueStaffInbox(mcUuid, opts = {}) {
  const id = normalizeUuid(mcUuid);
  if (!id || id.length < 32) return null;
  const player = getPlayer(id);
  const inbox = player.pendingStaffInbox || emptyInbox();
  const nextActions = Array.isArray(opts.actions)
    ? [...new Set([...(inbox.actions || []), ...opts.actions.map(String)])]
    : [...(inbox.actions || [])];
  inbox.actions = nextActions.slice(0, 20);
  if (opts.tip != null && String(opts.tip).trim()) {
    inbox.tip = String(opts.tip).trim().slice(0, 1500);
  }
  if (opts.forceUpdateCheck === true) {
    inbox.forceUpdateCheck = true;
  }
  if (opts.queuedBy) {
    inbox.queuedBy = String(opts.queuedBy).slice(0, 80);
  }
  inbox.updatedAt = new Date().toISOString();
  player.pendingStaffInbox = inbox;
  return savePlayer(player);
}

/**
 * @param {string} mcUuid
 */
function getStaffInbox(mcUuid) {
  const id = normalizeUuid(mcUuid);
  if (!id || id.length < 32) return null;
  const db = readDb();
  if (!db.players[id]) {
    return { uuid: id, ...emptyInbox() };
  }
  const player = migratePlayer({ ...db.players[id] }, id);
  const inbox = player.pendingStaffInbox || emptyInbox();
  return {
    uuid: id,
    username: player.username || null,
    actions: [...(inbox.actions || [])],
    tip: inbox.tip || null,
    forceUpdateCheck: Boolean(inbox.forceUpdateCheck),
    updatedAt: inbox.updatedAt || null,
    queuedBy: inbox.queuedBy || null,
  };
}

/**
 * Clear applied inbox items after the launcher applies them.
 * @param {string} mcUuid
 * @param {{ applied?: string[], tipShown?: boolean, updateCheckDone?: boolean }} opts
 */
function ackStaffInbox(mcUuid, opts = {}) {
  const id = normalizeUuid(mcUuid);
  if (!id || id.length < 32) return null;
  const player = getPlayer(id);
  const inbox = player.pendingStaffInbox || emptyInbox();
  const appliedIds = Array.isArray(opts.applied)
    ? opts.applied.map((a) => (typeof a === "string" ? a : a?.action)).filter(Boolean)
    : [];
  inbox.actions = (inbox.actions || []).filter((a) => !appliedIds.includes(a));
  if (opts.tipShown) {
    inbox.tip = null;
  }
  if (opts.updateCheckDone) {
    inbox.forceUpdateCheck = false;
  }
  inbox.updatedAt = new Date().toISOString();
  player.pendingStaffInbox = inbox;
  return savePlayer(player);
}

/**
 * List / search players without creating missing entries.
 * Matches UUID, Stripe customer, session id, Minecraft username, Discord name/id.
 * @param {{ q?: string, limit?: number }} [opts]
 */
function listPlayers(opts = {}) {
  const db = readDb();
  const qRaw = String(opts.q || "").trim().toLowerCase();
  const qUuid = qRaw.replace(/-/g, "");
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  let rows = Object.values(db.players || {}).map((p) => migratePlayer({ ...p }, normalizeUuid(p.uuid)));
  if (qRaw) {
    rows = rows.filter((p) => {
      const id = normalizeUuid(p.uuid);
      const name = String(p.username || "").toLowerCase();
      const dname = String(p.discordUsername || "").toLowerCase();
      const did = String(p.discordId || "").toLowerCase();
      const customer = String(p.stripeCustomerId || "").toLowerCase();
      const session = String(p.lastPurchase?.sessionId || "").toLowerCase();
      return (
        id.includes(qUuid) ||
        name.includes(qRaw) ||
        dname.includes(qRaw) ||
        did.includes(qRaw) ||
        customer.includes(qRaw) ||
        session.includes(qRaw)
      );
    });
  }
  rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return {
    total: rows.length,
    players: rows.slice(0, limit).map((p) => ({
      uuid: p.uuid,
      username: p.username || null,
      discordId: p.discordId || null,
      discordUsername: p.discordUsername || null,
      credits: p.credits || 0,
      spacePlus: Boolean(p.spacePlus),
      stardust: p.stardust || 0,
      stripeCustomerId: p.stripeCustomerId || null,
      lastPurchase: p.lastPurchase || null,
      pendingStaffInbox: p.pendingStaffInbox || emptyInbox(),
      updatedAt: p.updatedAt || null,
    })),
    processedSessionCount: Object.keys(db.processedSessions || {}).length,
  };
}

function listProcessedSessions(limit = 40) {
  const db = readDb();
  return Object.entries(db.processedSessions || {})
    .map(([id, at]) => ({ sessionId: id, at }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
}

module.exports = {
  normalizeUuid,
  getPlayer,
  addCredits,
  setSpacePlus,
  claimSession,
  addSessionRecord,
  applyStardustEarn,
  spendStardust,
  unlockCosmetic,
  setEquippedCosmetic,
  getProgressionSnapshot,
  spendCredits,
  listPlayers,
  listProcessedSessions,
  touchPlayerIdentity,
  touchDiscordIdentity,
  findByDiscordId,
  queueStaffInbox,
  getStaffInbox,
  ackStaffInbox,
  readDb,
};
