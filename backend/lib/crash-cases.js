/**
 * Persistent crash cases for staff remote fixes.
 * Staff queue allow-listed actions / tips; the launcher polls and applies locally.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "crash-cases.json");

const ALLOWED_ACTIONS = new Set([
  "clear_extra_mods",
  "clear_shader_caches",
  "clear_logs",
  "restage_fabric_injection",
  "suggest_more_ram",
  "suggest_relogin",
  "suggest_gpu_drivers",
]);

/** @type {Map<string, object>} */
let cases = new Map();
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      const list = Array.isArray(raw?.cases) ? raw.cases : Array.isArray(raw) ? raw : [];
      for (const item of list) {
        if (item?.crashId) cases.set(item.crashId, item);
      }
    }
  } catch (err) {
    console.error("[crash-cases] load failed:", err?.message || err);
    cases = new Map();
  }
}

function persist() {
  ensureLoaded();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const list = [...cases.values()]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 200);
    fs.writeFileSync(DATA_FILE, `${JSON.stringify({ cases: list }, null, 2)}\n`, "utf8");
  } catch (err) {
    console.error("[crash-cases] save failed:", err?.message || err);
  }
}

function newCrashId() {
  return crypto.randomBytes(6).toString("hex");
}

function sanitizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  return [...new Set(actions.map(String).filter((a) => ALLOWED_ACTIONS.has(a)))];
}

/**
 * @param {object} report
 */
function createCase(report = {}) {
  ensureLoaded();
  const crashId = String(report.crashId || newCrashId()).slice(0, 32);
  const now = Date.now();
  const entry = {
    crashId,
    status: "open",
    createdAt: now,
    updatedAt: now,
    diagnosis: report.diagnosis || null,
    summary: report.summary || null,
    source: report.source || null,
    confidence: report.confidence ?? null,
    player: {
      minecraftUsername: report.player?.minecraftUsername || report.minecraftUsername || null,
      minecraftUuid: report.player?.minecraftUuid || report.minecraftUuid || null,
      discordId: report.player?.discordId || report.discordId || null,
      discordUsername: report.player?.discordUsername || report.discordUsername || null,
    },
    version: report.version || null,
    loader: report.loader || null,
    platform: report.platform || null,
    appVersion: report.appVersion || null,
    tips: Array.isArray(report.tips) ? report.tips.map(String).slice(0, 8) : [],
    pendingActions: [],
    staffTip: null,
    staffNote: null,
    discordMessageId: null,
    appliedByClient: [],
  };
  cases.set(crashId, entry);
  persist();
  return entry;
}

function getCase(crashId) {
  ensureLoaded();
  return cases.get(String(crashId || "").trim()) || null;
}

function updateCase(crashId, patch = {}) {
  ensureLoaded();
  const entry = cases.get(String(crashId || "").trim());
  if (!entry) return null;
  Object.assign(entry, patch, { updatedAt: Date.now() });
  cases.set(entry.crashId, entry);
  persist();
  return entry;
}

function queueStaffFix(crashId, { actions = [], tip = null, note = null, staffTag = null } = {}) {
  ensureLoaded();
  const entry = cases.get(String(crashId || "").trim());
  if (!entry) return null;
  const nextActions = sanitizeActions([...(entry.pendingActions || []), ...actions]);
  entry.pendingActions = nextActions;
  if (tip != null && String(tip).trim()) {
    entry.staffTip = String(tip).trim().slice(0, 1500);
  }
  if (note != null && String(note).trim()) {
    entry.staffNote = String(note).trim().slice(0, 500);
  }
  if (staffTag) {
    entry.lastStaffTag = String(staffTag).slice(0, 80);
  }
  entry.status = "fix_queued";
  entry.updatedAt = Date.now();
  cases.set(entry.crashId, entry);
  persist();
  return entry;
}

/**
 * What the launcher should apply / show.
 */
function getPendingForClient(crashId) {
  const entry = getCase(crashId);
  if (!entry) return null;
  if (entry.status === "resolved" || entry.status === "closed") {
    return { crashId, status: entry.status, pendingActions: [], staffTip: null };
  }
  return {
    crashId: entry.crashId,
    status: entry.status,
    pendingActions: [...(entry.pendingActions || [])],
    staffTip: entry.staffTip || null,
    diagnosis: entry.diagnosis || null,
    player: entry.player || null,
  };
}

function ackClientApplied(crashId, { applied = [], tipShown = false } = {}) {
  ensureLoaded();
  const entry = cases.get(String(crashId || "").trim());
  if (!entry) return null;
  const appliedIds = Array.isArray(applied) ? applied.map((a) => (typeof a === "string" ? a : a?.action)).filter(Boolean) : [];
  entry.pendingActions = (entry.pendingActions || []).filter((a) => !appliedIds.includes(a));
  entry.appliedByClient = [...(entry.appliedByClient || []), ...appliedIds.map((action) => ({
    action,
    at: Date.now(),
  }))].slice(-40);
  if (tipShown) {
    entry.staffTipDeliveredAt = Date.now();
  }
  if (!entry.pendingActions.length && !entry.staffTip) {
    entry.status = "awaiting_relaunch";
  }
  entry.updatedAt = Date.now();
  cases.set(entry.crashId, entry);
  persist();
  return entry;
}

function markResolved(crashId, staffTag = null) {
  return updateCase(crashId, {
    status: "resolved",
    pendingActions: [],
    resolvedBy: staffTag || null,
    resolvedAt: Date.now(),
  });
}

/** @returns {object[]} */
function listCases() {
  ensureLoaded();
  return [...cases.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

module.exports = {
  ALLOWED_ACTIONS,
  newCrashId,
  createCase,
  getCase,
  updateCase,
  queueStaffFix,
  getPendingForClient,
  ackClientApplied,
  markResolved,
  sanitizeActions,
  listCases,
};
