/**
 * Durable diagnostic snapshots for Space Cloud (local-first).
 * Never stores auth-session / tokens.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data", "diagnostics");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

const BLOCKED_KEYS = new Set([
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "password",
  "auth-session",
  "authSession",
  "clientSecret",
  "sessionToken",
]);

/** @type {Map<string, object>} */
let index = new Map();
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(INDEX_FILE)) {
      const raw = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
      const list = Array.isArray(raw?.entries) ? raw.entries : [];
      for (const item of list) {
        if (item?.crashId) index.set(item.crashId, item);
      }
    }
  } catch (err) {
    console.error("[diagnostics] load failed:", err?.message || err);
    index = new Map();
  }
}

function persistIndex() {
  ensureLoaded();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const list = [...index.values()]
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, 400);
    fs.writeFileSync(INDEX_FILE, `${JSON.stringify({ entries: list }, null, 2)}\n`, "utf8");
  } catch (err) {
    console.error("[diagnostics] index save failed:", err?.message || err);
  }
}

function sanitizeValue(value, depth = 0) {
  if (depth > 8) return null;
  if (value == null) return value;
  if (typeof value === "string") {
    if (/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i.test(value) && value.length > 40) {
      return "[redacted-jwt]";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((v) => sanitizeValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (BLOCKED_KEYS.has(k) || /token|secret|password|auth.?session/i.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function crashDir(crashId) {
  const id = String(crashId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return { id, dir: path.join(DATA_DIR, id) };
}

/**
 * Persist a sanitized crash / diagnostic snapshot.
 * @param {object} report
 */
function saveDiagnostic(report = {}) {
  ensureLoaded();
  const { id, dir } = crashDir(report.crashId || report.id);
  if (!id) return null;

  const launcherId = String(
    report.player?.minecraftUuid || report.minecraftUuid || report.launcherId || ""
  )
    .replace(/-/g, "")
    .toLowerCase()
    .slice(0, 32);

  const safe = sanitizeValue({
    crashId: id,
    launcherId: launcherId || null,
    username: report.player?.minecraftUsername || report.minecraftUsername || null,
    discordId: report.player?.discordId || report.discordId || null,
    diagnosis: report.diagnosis || null,
    summary: report.summary || null,
    confidence: report.confidence ?? null,
    source: report.source || null,
    version: report.version || null,
    loader: report.loader || null,
    platform: report.platform || null,
    appVersion: report.appVersion || null,
    error: report.error || null,
    exitCode: report.exitCode ?? null,
    tips: report.tips || [],
    mods: report.fileContext?.mods || report.mods || null,
    nativesJars: report.fileContext?.nativesJars || null,
    binJars: report.fileContext?.binJars || null,
    createdAt: new Date().toISOString(),
  });

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), `${JSON.stringify(safe, null, 2)}\n`, "utf8");

  const logs = String(report.logsTail || report.logs || "").slice(-200_000);
  if (logs) {
    fs.writeFileSync(path.join(dir, "logs.txt"), logs, "utf8");
  }

  const crashReport = report.fileContext?.crashReport?.text || report.crashReportText || "";
  if (crashReport) {
    fs.writeFileSync(
      path.join(dir, "crash-report.txt"),
      String(crashReport).slice(-120_000),
      "utf8"
    );
  }

  const latestLog = report.fileContext?.latestLogTail || "";
  if (latestLog) {
    fs.writeFileSync(path.join(dir, "latest-log-tail.txt"), String(latestLog).slice(-80_000), "utf8");
  }

  const entry = {
    crashId: id,
    launcherId: launcherId || null,
    username: safe.username,
    diagnosis: safe.diagnosis,
    summary: safe.summary,
    status: report.status || "open",
    path: dir,
    hasLogs: Boolean(logs),
    createdAt: safe.createdAt,
    updatedAt: safe.createdAt,
    githubBackup: null,
  };
  index.set(id, entry);
  persistIndex();
  return entry;
}

function getDiagnostic(crashId) {
  ensureLoaded();
  const meta = index.get(String(crashId || "").trim());
  if (!meta) return null;
  const { dir } = crashDir(crashId);
  let detail = null;
  let logsPreview = null;
  try {
    const metaPath = path.join(dir, "meta.json");
    if (fs.existsSync(metaPath)) {
      detail = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    }
    const logsPath = path.join(dir, "logs.txt");
    if (fs.existsSync(logsPath)) {
      logsPreview = fs.readFileSync(logsPath, "utf8").slice(-8000);
    }
  } catch (err) {
    console.warn("[diagnostics] read failed:", err?.message || err);
  }
  return { ...meta, detail, logsPreview };
}

/**
 * @param {{ launcherId?: string, q?: string, limit?: number }} [opts]
 */
function listDiagnostics(opts = {}) {
  ensureLoaded();
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 40));
  const lid = opts.launcherId
    ? String(opts.launcherId).replace(/-/g, "").toLowerCase()
    : null;
  const q = String(opts.q || "").trim().toLowerCase();
  let rows = [...index.values()].sort((a, b) =>
    String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  );
  if (lid) rows = rows.filter((e) => e.launcherId === lid);
  if (q) {
    rows = rows.filter((e) => {
      const hay = [e.crashId, e.launcherId, e.username, e.diagnosis, e.summary]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q) || (lid && e.launcherId?.includes(q.replace(/-/g, "")));
    });
  }
  return rows.slice(0, limit);
}

function markGithubBackup(crashId, info) {
  ensureLoaded();
  const entry = index.get(String(crashId || "").trim());
  if (!entry) return null;
  entry.githubBackup = info;
  entry.updatedAt = new Date().toISOString();
  index.set(entry.crashId, entry);
  persistIndex();
  return entry;
}

function getArchivePaths(crashId) {
  const { id, dir } = crashDir(crashId);
  if (!id || !fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).map((name) => path.join(dir, name));
  return { id, dir, files };
}

module.exports = {
  saveDiagnostic,
  getDiagnostic,
  listDiagnostics,
  markGithubBackup,
  getArchivePaths,
  sanitizeValue,
};
