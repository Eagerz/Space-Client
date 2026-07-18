/**
 * Persistent Fix Agent jobs (Egrz → allow-listed launcher inbox → Discord notify).
 * Local-first JSON under backend/data/.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "fix-jobs.json");

const STATUSES = new Set([
  "analyzing",
  "queued",
  "applied",
  "needs_staff",
  "failed",
]);

/** @type {Map<string, object>} */
let jobs = new Map();
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      const list = Array.isArray(raw?.jobs) ? raw.jobs : Array.isArray(raw) ? raw : [];
      for (const item of list) {
        if (item?.id) jobs.set(item.id, item);
      }
    }
  } catch (err) {
    console.error("[fix-jobs] load failed:", err?.message || err);
    jobs = new Map();
  }
}

function persist() {
  ensureLoaded();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const list = [...jobs.values()]
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, 500);
    fs.writeFileSync(DATA_FILE, `${JSON.stringify({ jobs: list }, null, 2)}\n`, "utf8");
  } catch (err) {
    console.error("[fix-jobs] save failed:", err?.message || err);
  }
}

function newJobId() {
  return `fix_${crypto.randomBytes(6).toString("hex")}`;
}

/**
 * @param {object} partial
 */
function createJob(partial = {}) {
  ensureLoaded();
  const now = new Date().toISOString();
  const id = String(partial.id || newJobId()).slice(0, 40);
  const entry = {
    id,
    launcherId: String(partial.launcherId || "").replace(/-/g, "").toLowerCase().slice(0, 32),
    username: partial.username || null,
    discordId: partial.discordId || null,
    discordUsername: partial.discordUsername || null,
    issueText: String(partial.issueText || "").slice(0, 4000),
    status: STATUSES.has(partial.status) ? partial.status : "analyzing",
    proposedActions: Array.isArray(partial.proposedActions) ? partial.proposedActions : [],
    tip: partial.tip || null,
    forceUpdateCheck: Boolean(partial.forceUpdateCheck),
    diagnosis: partial.diagnosis || null,
    confidence: partial.confidence ?? null,
    summary: partial.summary || null,
    notifyDiscord: partial.notifyDiscord !== false,
    ticketChannelId: partial.ticketChannelId || null,
    crashId: partial.crashId || null,
    requireConfirm: Boolean(partial.requireConfirm),
    createdBy: partial.createdBy || null,
    result: partial.result || null,
    notify: partial.notify || null,
    createdAt: now,
    updatedAt: now,
    queuedAt: null,
    appliedAt: null,
  };
  jobs.set(id, entry);
  persist();
  return entry;
}

function getJob(id) {
  ensureLoaded();
  return jobs.get(String(id || "").trim()) || null;
}

function updateJob(id, patch = {}) {
  ensureLoaded();
  const entry = jobs.get(String(id || "").trim());
  if (!entry) return null;
  const next = { ...entry, ...patch, updatedAt: new Date().toISOString() };
  if (patch.status && !STATUSES.has(patch.status)) {
    next.status = entry.status;
  }
  jobs.set(entry.id, next);
  persist();
  return next;
}

/**
 * @param {{ status?: string, launcherId?: string, limit?: number }} [opts]
 */
function listJobs(opts = {}) {
  ensureLoaded();
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));
  const status = opts.status ? String(opts.status) : null;
  const lid = opts.launcherId
    ? String(opts.launcherId).replace(/-/g, "").toLowerCase()
    : null;
  let rows = [...jobs.values()].sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  );
  if (status) rows = rows.filter((j) => j.status === status);
  if (lid) rows = rows.filter((j) => j.launcherId === lid);
  return rows.slice(0, limit);
}

/**
 * Jobs still waiting for launcher ack for this UUID.
 * @param {string} launcherId
 */
function listQueuedForLauncher(launcherId) {
  const lid = String(launcherId || "")
    .replace(/-/g, "")
    .toLowerCase();
  if (!lid) return [];
  ensureLoaded();
  return [...jobs.values()].filter(
    (j) => j.launcherId === lid && (j.status === "queued" || j.status === "analyzing")
  );
}

module.exports = {
  STATUSES,
  newJobId,
  createJob,
  getJob,
  updateJob,
  listJobs,
  listQueuedForLauncher,
};
