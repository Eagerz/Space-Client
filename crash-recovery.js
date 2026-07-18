/**
 * AI crash recovery for Apex Launcher (main process).
 *
 * - Sandboxed read access to Apex Launcher user files (game dir, natives, bin, logs)
 * - Runs safe repair actions when a crash is diagnosed
 * - Escalates unresolved cases to staff via the backend Discord bot
 *
 * Secrets (OpenAI / Discord) stay on the backend — never in Electron.
 */

"use strict";

const { app, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const paymentsConfig = require("./payments-config");
const modInjection = require("./mod-injection");
const authSession = require("./auth-session");
const { signProgressionJwt } = require("./progression-jwt");
const autoUpdater = require("./auto-updater");

/** Allowed repair action ids returned by the AI / local heuristics. */
const ALLOWED_ACTIONS = new Set([
  "clear_extra_mods",
  "clear_shader_caches",
  "clear_logs",
  "restage_fabric_injection",
  "suggest_more_ram",
  "suggest_relogin",
  "suggest_gpu_drivers",
  "none",
]);

const REPORT_QUEUE_FILE = "crash-report-queue.json";
const MAX_LOG_CHARS = 12000;
const MAX_FILE_LIST = 80;
const INBOX_POLL_MS = 45_000;

let mainWindow = null;
let recoveryInFlight = false;
let initialized = false;
let inboxPollTimer = null;
let inboxPollInFlight = false;

function send(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function getMinecraftPath() {
  return path.join(app.getPath("userData"), "SpaceClient", ".minecraft");
}

function getNativesDir() {
  if (process.env.SPACE_CLIENT_NATIVES) {
    return path.resolve(process.env.SPACE_CLIENT_NATIVES);
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(local, "SpaceClient", "natives");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "SpaceClient", "natives");
  }
  return path.join(os.homedir(), ".local", "share", "SpaceClient", "natives");
}

function getBinDir() {
  if (process.env.SPACE_CLIENT_BIN) {
    return path.resolve(process.env.SPACE_CLIENT_BIN);
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(local, "SpaceClient", "bin");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "SpaceClient", "bin");
  }
  return path.join(os.homedir(), ".local", "share", "SpaceClient", "bin");
}

/** Roots the AI / recovery may inspect. Auth session is intentionally excluded. */
function sandboxRoots() {
  return [
    getMinecraftPath(),
    getNativesDir(),
    getBinDir(),
    path.join(app.getPath("userData"), "SpaceClient"),
  ].map((p) => path.normalize(p));
}

function isPathInside(candidate, root) {
  const resolved = path.resolve(candidate);
  const base = path.resolve(root);
  return resolved === base || resolved.startsWith(base + path.sep);
}

function assertSandboxed(filePath) {
  const resolved = path.resolve(filePath);
  const ok = sandboxRoots().some((root) => isPathInside(resolved, root));
  if (!ok) {
    throw new Error(`Path outside recovery sandbox: ${resolved}`);
  }
  // Never touch encrypted auth material even if under userData somehow.
  if (/auth-session\.enc$/i.test(resolved)) {
    throw new Error("Auth session is not readable by crash recovery.");
  }
  return resolved;
}

function safeReadText(filePath, maxChars = 8000) {
  const resolved = assertSandboxed(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return null;
  }
  const raw = fs.readFileSync(resolved, "utf8");
  return raw.length > maxChars ? raw.slice(-maxChars) : raw;
}

function listDirSafe(dirPath, { max = 40, extensions = null } = {}) {
  try {
    const resolved = assertSandboxed(dirPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      return [];
    }
    return fs
      .readdirSync(resolved)
      .filter((name) => {
        if (!extensions) return true;
        return extensions.some((ext) => name.toLowerCase().endsWith(ext));
      })
      .slice(0, max)
      .map((name) => {
        const full = path.join(resolved, name);
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          /* ignore */
        }
        return { name, size };
      });
  } catch {
    return [];
  }
}

function newestCrashReportSnippet() {
  const crashDir = path.join(getMinecraftPath(), "crash-reports");
  try {
    const resolved = assertSandboxed(crashDir);
    if (!fs.existsSync(resolved)) return null;
    const files = fs
      .readdirSync(resolved)
      .filter((n) => n.endsWith(".txt"))
      .map((name) => {
        const full = path.join(resolved, name);
        return { name, full, mtime: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    if (!files.length) return null;
    return {
      name: files[0].name,
      text: safeReadText(files[0].full, 6000),
    };
  } catch {
    return null;
  }
}

/**
 * Collect a privacy-conscious snapshot of launcher + game files for diagnosis.
 */
function collectFileContext() {
  const mc = getMinecraftPath();
  const mods = listDirSafe(path.join(mc, "mods"), { extensions: [".jar"] });
  const natives = listDirSafe(getNativesDir(), { extensions: [".jar"] });
  const bin = listDirSafe(getBinDir(), { extensions: [".jar"] });
  const logsDir = path.join(mc, "logs");
  const latestLog = safeReadText(path.join(logsDir, "latest.log"), 4000);
  const crash = newestCrashReportSnippet();

  return {
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion?.() || "unknown",
    paths: {
      minecraft: mc,
      natives: getNativesDir(),
      bin: getBinDir(),
    },
    mods,
    nativesJars: natives,
    binJars: bin,
    latestLogTail: latestLog,
    crashReport: crash,
  };
}

function truncateLogs(logText) {
  const text = String(logText || "");
  if (text.length <= MAX_LOG_CHARS) return text;
  return text.slice(-MAX_LOG_CHARS);
}

/**
 * Local heuristics when the AI backend is offline or has no API key.
 */
function localDiagnose(logText, exitCode) {
  const text = String(logText || "");
  const actions = [];
  const tips = [];
  let diagnosis = "Unknown launch/game failure";
  let confidence = 0.35;
  let resolvable = true;

  if (/OutOfMemoryError|Java heap space|GC overhead/i.test(text)) {
    diagnosis = "Java ran out of memory";
    actions.push("suggest_more_ram", "clear_shader_caches");
    tips.push("Increase allocated RAM in Settings (try 6–8 GB), then relaunch.");
    confidence = 0.85;
  } else if (/ClientBrandRetrieverMixin|InvalidInjectionException|Mixin transformation/i.test(text)) {
    diagnosis = "Fabric mixin / performance mod failure";
    actions.push("restage_fabric_injection", "clear_extra_mods");
    tips.push("Restaging Fabric injection and clearing extra mods.");
    confidence = 0.8;
  } else if (/fabric-api|ModResolutionException|Incompatible mods/i.test(text)) {
    diagnosis = "Fabric mod conflict";
    actions.push("clear_extra_mods", "restage_fabric_injection");
    tips.push("Removing extra jars from .minecraft/mods and restaging Apex Launcher injection.");
    confidence = 0.78;
  } else if (/No Fabric API pin|Fabric API required.*Prefer/i.test(text)) {
    diagnosis = "Minecraft version not supported for Fabric";
    tips.push(`Open the launch menu and select Minecraft ${modInjection.DEFAULT_FABRIC_MC || "1.21.1"} with Fabric.`);
    tips.push("Apex Launcher only pins Fabric API for 1.21.x — 1.21.1 is recommended (core mod target).");
    confidence = 0.95;
    resolvable = false;
    actions.push("none");
  } else if (/Failed to verify username|Invalid session|401|Unauthorized/i.test(text)) {
    diagnosis = "Microsoft / Minecraft session invalid";
    actions.push("suggest_relogin");
    tips.push("Sign out and sign back in with Microsoft on the Account page.");
    confidence = 0.9;
    resolvable = false; // needs user action
  } else if (/lwjgl|glfw|Failed to create the OpenGL context|OpenGL/i.test(text)) {
    diagnosis = "Graphics / OpenGL context failure";
    actions.push("suggest_gpu_drivers", "clear_shader_caches");
    tips.push("Update GPU drivers and close overlays, then relaunch.");
    confidence = 0.7;
    resolvable = false;
  } else if (/Could not find or load main class|NoClassDefFoundError|ClassNotFoundException/i.test(text)) {
    diagnosis = "Incomplete game libraries or classpath";
    actions.push("restage_fabric_injection", "clear_logs");
    tips.push("Restaging injection; relaunch so libraries re-download if needed.");
    confidence = 0.65;
  } else if (exitCode === 1 || exitCode === -1 || /Minecraft has crashed/i.test(text)) {
    diagnosis = "Generic Minecraft crash";
    actions.push("clear_extra_mods", "clear_shader_caches");
    tips.push("Clearing extra mods and shader caches, then try relaunching.");
    confidence = 0.45;
  } else {
    tips.push("No confident local fix — escalating to staff if recovery fails.");
    resolvable = false;
    actions.push("none");
  }

  return {
    source: "local",
    diagnosis,
    confidence,
    resolvable,
    actions: actions.filter((a) => ALLOWED_ACTIONS.has(a)),
    tips,
    summary: tips[0] || diagnosis,
  };
}

async function askBackendAI(payload) {
  const base = paymentsConfig.getApiBase();
  const url = `${base}/api/crash/analyze`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Analyze failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  return res.json();
}

function queueReport(report) {
  const file = path.join(app.getPath("userData"), "SpaceClient", REPORT_QUEUE_FILE);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let queue = [];
    if (fs.existsSync(file)) {
      try {
        queue = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        queue = [];
      }
    }
    if (!Array.isArray(queue)) queue = [];
    queue.push({ ...report, queuedAt: Date.now() });
    // Keep last 25
    if (queue.length > 25) queue = queue.slice(-25);
    fs.writeFileSync(file, JSON.stringify(queue, null, 2), "utf8");
  } catch (err) {
    console.error("[crash-recovery] Failed to queue report:", err?.message || err);
  }
}

function loadAndClearQueue() {
  const file = path.join(app.getPath("userData"), "SpaceClient", REPORT_QUEUE_FILE);
  if (!fs.existsSync(file)) return [];
  try {
    const queue = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, "[]", "utf8");
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

async function reportToStaff(report) {
  const base = paymentsConfig.getApiBase();
  const url = `${base}/api/crash/report`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(report),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      queueReport(report);
      return { ok: false, queued: true, status: res.status, crashId: body.crashId || report.crashId };
    }
    return { ok: true, crashId: body.crashId || report.crashId, ...body };
  } catch (err) {
    queueReport(report);
    return { ok: false, queued: true, error: err?.message || String(err), crashId: report.crashId };
  }
}

async function fetchStaffPending(crashId) {
  if (!crashId) return null;
  const base = paymentsConfig.getApiBase();
  const res = await fetch(`${base}/api/crash/cases/${encodeURIComponent(crashId)}/pending`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return res.json();
}

async function ackStaffPending(crashId, payload) {
  if (!crashId) return null;
  const base = paymentsConfig.getApiBase();
  const res = await fetch(`${base}/api/crash/cases/${encodeURIComponent(crashId)}/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Poll staff-queued remote fixes and apply them locally (staff cannot access the player's PC).
 */
async function pollAndApplyStaffFix(crashId, { version } = {}) {
  const pending = await fetchStaffPending(crashId);
  if (!pending?.ok) {
    return { ok: false, skipped: "none" };
  }

  const actions = Array.isArray(pending.pendingActions) ? pending.pendingActions : [];
  const tip = pending.staffTip ? String(pending.staffTip) : null;
  // Tips are delivered via Discord DM / ticket — do not surface them in the launcher.
  if (!actions.length) {
    if (tip) {
      await ackStaffPending(crashId, { applied: [], tipShown: true });
    }
    return { ok: true, applied: [], tip: null, status: pending.status, tipAcked: Boolean(tip) };
  }

  send("crash:recovery-status", {
    phase: "staff-fix",
    label: "Applying staff remote fix…",
    crashId,
  });

  const repair = await applyActions(actions, { version });

  await ackStaffPending(crashId, {
    applied: repair.applied,
    tipShown: Boolean(tip),
  });

  const result = {
    ok: true,
    crashId,
    applied: repair.applied,
    tip: null,
    tips: repair.userTips || [],
    status: pending.status,
  };

  // Only notify the UI when a local file repair actually ran.
  if (repair.applied?.length) {
    send("crash:staff-fix", result);
    send("crash:recovery-status", {
      phase: "staff-fix-ready",
      label: "Staff remote fix applied — try PLAY again",
      result,
    });
  }

  return result;
}

function signInboxToken(profile) {
  if (!profile?.id) return null;
  return signProgressionJwt(
    {
      sub: profile.id,
      typ: "inbox",
      username: profile.name || "",
    },
    120
  );
}

function tipLooksLikeUpdate(tip) {
  const t = String(tip || "").toLowerCase();
  return /\bupdate\b/.test(t) && /\b(launcher|Apex Launcher|Apex Launcher|app)\b/.test(t);
}

/**
 * Heartbeat: fetch per-user staff inbox and apply allow-listed fixes / update tip.
 */
async function pollAndApplyStaffInbox({ version } = {}) {
  if (inboxPollInFlight) return { ok: false, skipped: "in_flight" };
  if (!authSession.isLoggedIn()) return { ok: false, skipped: "not_signed_in" };

  const profile = authSession.loadSession();
  const token = signInboxToken(profile);
  if (!token) return { ok: false, skipped: "no_token" };

  inboxPollInFlight = true;
  try {
    const base = paymentsConfig.getApiBase();
    const res = await fetch(`${base}/api/crash/inbox?token=${encodeURIComponent(token)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const inbox = await res.json().catch(() => null);
    if (!inbox?.ok) return { ok: false, skipped: "bad_body" };

    const actions = Array.isArray(inbox.actions) ? inbox.actions : [];
    const tip = inbox.tip ? String(inbox.tip) : null;
    const forceUpdate =
      Boolean(inbox.forceUpdateCheck) || tipLooksLikeUpdate(tip);

    // Tips alone are Discord/staff-contact — skip launcher messaging; still honor force update + actions.
    if (!actions.length && !forceUpdate) {
      if (tip) {
        const ackToken = signInboxToken(authSession.loadSession());
        if (ackToken) {
          await fetch(`${base}/api/crash/inbox/ack`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              token: ackToken,
              applied: [],
              tipShown: true,
              updateCheckDone: false,
            }),
          }).catch(() => null);
        }
      }
      return { ok: true, applied: [], tip: null, empty: !tip, tipAcked: Boolean(tip) };
    }

    if (actions.length || forceUpdate) {
      send("crash:recovery-status", {
        phase: "staff-inbox",
        label: actions.length ? "Applying staff fix…" : "Checking for launcher update…",
      });
    }

    const repair = actions.length
      ? await applyActions(actions, { version: version || "1.21.1" })
      : { applied: [], userTips: [], fixedLikely: false };

    let updateCheck = null;
    if (forceUpdate && typeof autoUpdater.checkForUpdatesNow === "function") {
      try {
        updateCheck = await autoUpdater.checkForUpdatesNow({ quiet: false });
      } catch (err) {
        updateCheck = { success: false, error: err?.message || String(err) };
      }
    }

    const ackToken = signInboxToken(authSession.loadSession());
    if (ackToken) {
      await fetch(`${base}/api/crash/inbox/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          token: ackToken,
          applied: repair.applied,
          tipShown: Boolean(tip),
          updateCheckDone: forceUpdate,
        }),
      }).catch(() => null);
    }

    const result = {
      ok: true,
      applied: repair.applied,
      tip: null,
      tips: repair.userTips || [],
      forceUpdateCheck: forceUpdate,
      updateCheck,
    };

    if (repair.applied?.length) {
      send("crash:staff-inbox", result);
      send("crash:staff-fix", result);
      send("crash:recovery-status", {
        phase: "staff-fix-ready",
        label: "Staff remote fix applied",
        result,
      });
    }

    return result;
  } finally {
    inboxPollInFlight = false;
  }
}

function startStaffInboxPolling() {
  if (inboxPollTimer) return;
  const tick = () => {
    pollAndApplyStaffInbox().catch(() => {});
  };
  // First poll shortly after launch / sign-in window is up.
  setTimeout(tick, 12_000);
  inboxPollTimer = setInterval(tick, INBOX_POLL_MS);
  if (typeof inboxPollTimer.unref === "function") inboxPollTimer.unref();
}

function stopStaffInboxPolling() {
  if (inboxPollTimer) {
    clearInterval(inboxPollTimer);
    inboxPollTimer = null;
  }
}

async function flushReportQueue() {
  const queued = loadAndClearQueue();
  const results = [];
  for (const item of queued) {
    results.push(await reportToStaff(item));
  }
  return results;
}

function removeExtraMods() {
  const modsDir = path.join(getMinecraftPath(), "mods");
  assertSandboxed(modsDir);
  if (!fs.existsSync(modsDir)) {
    return { removed: [], note: "No mods folder" };
  }
  const removed = [];
  for (const name of fs.readdirSync(modsDir)) {
    if (!name.toLowerCase().endsWith(".jar")) continue;
    // Keep Apex Launcher branded jars if a user dropped them here; strip everything else.
    if (/^space[-_]?client/i.test(name) || /^fabric-api/i.test(name)) continue;
    const full = path.join(modsDir, name);
    assertSandboxed(full);
    fs.unlinkSync(full);
    removed.push(name);
  }
  return { removed, note: removed.length ? `Removed ${removed.length} mod(s)` : "No extra mods found" };
}

function clearShaderCaches() {
  const mc = getMinecraftPath();
  const targets = [
    path.join(mc, "shaderpacks", "cache"),
    path.join(mc, "sodium-cache"),
    path.join(mc, "iris-cache"),
    path.join(mc, ".mixin.out"),
  ];
  const cleared = [];
  for (const dir of targets) {
    try {
      assertSandboxed(dir);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        cleared.push(path.basename(dir));
      }
    } catch {
      /* skip */
    }
  }
  return { cleared, note: cleared.length ? `Cleared: ${cleared.join(", ")}` : "No shader caches present" };
}

function clearLogsFolder() {
  const logsDir = path.join(getMinecraftPath(), "logs");
  assertSandboxed(logsDir);
  if (!fs.existsSync(logsDir)) {
    return { note: "No logs folder" };
  }
  let count = 0;
  for (const name of fs.readdirSync(logsDir)) {
    if (name === "latest.log") continue;
    const full = path.join(logsDir, name);
    try {
      assertSandboxed(full);
      const st = fs.statSync(full);
      if (st.isFile()) {
        fs.unlinkSync(full);
        count += 1;
      }
    } catch {
      /* skip */
    }
  }
  return { note: `Cleared ${count} old log file(s)` };
}

async function restageFabric(version = "1.21.1") {
  const result = await modInjection.prepareFabricInjection({ mcVersion: version });
  return {
    ok: Boolean(result?.ok),
    note: result?.ok
      ? "Restaged Fabric API + performance pack injection"
      : result?.error || "Restage failed",
    warnings: result?.warnings || [],
  };
}

/**
 * Execute only whitelisted repair actions.
 * @returns {Promise<{ applied: object[], userTips: string[], fixedLikely: boolean }>}
 */
async function applyActions(actions, { version } = {}) {
  const applied = [];
  const userTips = [];
  let fixedLikely = false;

  for (const action of actions || []) {
    if (!ALLOWED_ACTIONS.has(action) || action === "none") continue;

    if (action === "clear_extra_mods") {
      const r = removeExtraMods();
      applied.push({ action, ...r });
      if (r.removed?.length) fixedLikely = true;
    } else if (action === "clear_shader_caches") {
      const r = clearShaderCaches();
      applied.push({ action, ...r });
      if (r.cleared?.length) fixedLikely = true;
    } else if (action === "clear_logs") {
      applied.push({ action, ...clearLogsFolder() });
    } else if (action === "restage_fabric_injection") {
      const r = await restageFabric(version || "1.21.1");
      applied.push({ action, ...r });
      if (r.ok) fixedLikely = true;
    } else if (action === "suggest_more_ram") {
      userTips.push("Increase RAM in Settings (try 6–8 GB) and relaunch.");
    } else if (action === "suggest_relogin") {
      userTips.push("Sign out and sign back in with Microsoft on the Account page.");
    } else if (action === "suggest_gpu_drivers") {
      userTips.push("Update GPU drivers and close overlays (Discord, GeForce Experience), then relaunch.");
    }
  }

  return { applied, userTips, fixedLikely };
}

/**
 * Full recovery pipeline after a crash or launch error.
 */
async function runRecovery({
  logText = "",
  exitCode = null,
  error = null,
  version = "1.21.1",
  loader = "fabric",
  source = "game",
} = {}) {
  if (recoveryInFlight) {
    return { success: false, skipped: "in_flight" };
  }
  recoveryInFlight = true;

  const startedAt = Date.now();
  send("crash:recovery-status", {
    phase: "collecting",
    label: "AI recovery — collecting files & logs…",
  });

  try {
    const fileContext = collectFileContext();
    const logs = truncateLogs(
      [logText, error ? `Error: ${error}` : ""].filter(Boolean).join("\n")
    );

    send("crash:recovery-status", {
      phase: "analyzing",
      label: "AI recovery — diagnosing crash…",
    });

    let plan = null;
    try {
      const ai = await askBackendAI({
        logs,
        exitCode,
        error,
        version,
        loader,
        source,
        fileContext: {
          ...fileContext,
          // Cap lists for the API
          mods: (fileContext.mods || []).slice(0, MAX_FILE_LIST),
          nativesJars: (fileContext.nativesJars || []).slice(0, 40),
          binJars: (fileContext.binJars || []).slice(0, 20),
        },
      });
      if (ai && ai.diagnosis) {
        plan = {
          source: ai.source || "openai",
          diagnosis: String(ai.diagnosis),
          confidence: Number(ai.confidence) || 0.5,
          resolvable: ai.resolvable !== false,
          actions: Array.isArray(ai.actions)
            ? ai.actions.filter((a) => ALLOWED_ACTIONS.has(a))
            : [],
          tips: Array.isArray(ai.tips) ? ai.tips.map(String).slice(0, 6) : [],
          summary: String(ai.summary || ai.diagnosis),
        };
      }
    } catch (err) {
      console.warn("[crash-recovery] AI backend unavailable, using local heuristics:", err?.message || err);
    }

    if (!plan) {
      plan = localDiagnose(logs, exitCode);
    }

    send("crash:recovery-status", {
      phase: "repairing",
      label: `AI recovery — ${plan.diagnosis}`,
      diagnosis: plan.diagnosis,
    });

    const repair = await applyActions(plan.actions, { version });
    const tips = [...new Set([...(plan.tips || []), ...repair.userTips])].slice(0, 8);

    const actionList = plan.actions.length ? plan.actions : ["none"];
    const onlyUserTips = actionList.every(
      (a) => a === "none" || String(a).startsWith("suggest_")
    );
    // File repairs that landed count as recovered. Clear user-only guidance does not escalate.
    const recovered = Boolean(repair.fixedLikely);
    // Escalate when we didn't repair files and it isn't a clear "user must…" tip.
    const shouldReport =
      !recovered &&
      (!onlyUserTips || actionList.includes("none") || plan.confidence < 0.4);

    const result = {
      success: true,
      recovered,
      diagnosis: plan.diagnosis,
      confidence: plan.confidence,
      source: plan.source,
      tips,
      applied: repair.applied,
      summary: plan.summary,
      durationMs: Date.now() - startedAt,
    };

    if (shouldReport) {
      // Escalate to Discord staff silently — do not surface failure messaging in the launcher UI.
      send("crash:recovery-status", {
        phase: "escalating-silent",
        label: "",
        diagnosis: plan.diagnosis,
      });

      const crashId = crypto.randomBytes(6).toString("hex");
      const profile = authSession.getPublicProfile?.() || authSession.loadSession?.() || null;
      const report = {
        crashId,
        diagnosis: plan.diagnosis,
        confidence: plan.confidence,
        source: plan.source,
        exitCode,
        error: error || null,
        version,
        loader,
        crashSource: source,
        tips,
        applied: repair.applied,
        logsTail: logs.slice(-12000),
        mods: (fileContext.mods || []).map((m) => m.name).slice(0, 40),
        platform: process.platform,
        appVersion: fileContext.appVersion,
        crashReportName: fileContext.crashReport?.name || null,
        summary: plan.summary,
        player: {
          minecraftUsername: profile?.username || profile?.name || null,
          minecraftUuid: profile?.uuid || profile?.id || null,
          discordId: null,
          discordUsername: null,
        },
      };

      const staff = await reportToStaff(report);
      result.reportedToStaff = Boolean(staff.ok);
      result.reportQueued = Boolean(staff.queued);
      result.crashId = staff.crashId || crashId;
      result.silentEscalate = true;

      // Start polling for staff remote fixes (player's launcher applies them locally).
      if (result.crashId) {
        setTimeout(() => {
          pollAndApplyStaffFix(result.crashId, { version }).catch(() => {});
        }, 5000);
        const pollTimer = setInterval(() => {
          pollAndApplyStaffFix(result.crashId, { version }).catch(() => {});
        }, 20000);
        setTimeout(() => clearInterval(pollTimer), 15 * 60 * 1000);
      }
    } else {
      result.reportedToStaff = false;
      result.reportQueued = false;
    }

    const phase = result.recovered
      ? "resolved"
      : onlyUserTips && !shouldReport
        ? "resolved"
        : shouldReport
          ? "escalated-silent"
          : "failed";
    const label = result.recovered
      ? "AI recovery applied — try PLAY again"
      : onlyUserTips && !shouldReport
        ? "AI diagnosis ready — follow the steps below"
        : shouldReport
          ? ""
          : "Recovery unfinished";

    send("crash:recovery-status", {
      phase,
      label,
      result,
    });
    send("crash:recovery-result", result);
    return result;
  } catch (err) {
    const message = err?.message || String(err);
    console.error("[crash-recovery]", message);
    const fail = {
      success: false,
      recovered: false,
      error: message,
      tips: [],
      silentEscalate: true,
    };
    try {
      await reportToStaff({
        diagnosis: "Crash recovery internal failure",
        confidence: 0,
        source: "client",
        error: message,
        version,
        loader,
        crashSource: source,
        logsTail: truncateLogs(logText).slice(-2000),
        platform: process.platform,
      });
      fail.reportedToStaff = true;
    } catch {
      fail.reportedToStaff = false;
    }
    send("crash:recovery-status", { phase: "escalated-silent", label: "", result: fail });
    send("crash:recovery-result", fail);
    return fail;
  } finally {
    recoveryInFlight = false;
  }
}

function installElectronGuards() {
  process.on("uncaughtException", (err) => {
    console.error("[crash-recovery] uncaughtException:", err);
    runRecovery({
      logText: String(err?.stack || err),
      error: err?.message || String(err),
      source: "electron-uncaught",
    }).catch(() => {});
  });

  process.on("unhandledRejection", (reason) => {
    const message =
      reason instanceof Error ? reason.message : String(reason);
    console.error("[crash-recovery] unhandledRejection:", reason);
    runRecovery({
      logText: reason instanceof Error ? reason.stack || message : message,
      error: message,
      source: "electron-rejection",
    }).catch(() => {});
  });

  app.on("render-process-gone", (_event, _wc, details) => {
    runRecovery({
      logText: `Renderer gone: ${details?.reason || "unknown"} (exit ${details?.exitCode})`,
      error: details?.reason || "render-process-gone",
      exitCode: details?.exitCode ?? null,
      source: "electron-renderer",
    }).catch(() => {});
  });
}

function registerIpc() {
  ipcMain.handle("crash:run-recovery", async (_event, payload = {}) => {
    return runRecovery(payload);
  });

  ipcMain.handle("crash:get-file-context", async () => {
    try {
      return { success: true, context: collectFileContext() };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("crash:flush-reports", async () => {
    try {
      const results = await flushReportQueue();
      return { success: true, results };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("crash:poll-staff-fix", async (_event, payload = {}) => {
    try {
      const result = await pollAndApplyStaffFix(payload.crashId, {
        version: payload.version || "1.21.1",
      });
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err?.message || String(err) };
    }
  });
}

/**
 * @param {import("electron").BrowserWindow | null} win
 */
function setMainWindow(win) {
  mainWindow = win;
}

function init(win) {
  setMainWindow(win);
  if (!initialized) {
    initialized = true;
    registerIpc();
    installElectronGuards();
    startStaffInboxPolling();
    // Best-effort flush of reports that failed while Discord/bot was offline.
    setTimeout(() => {
      flushReportQueue().catch(() => {});
    }, 8000);
  }
}

module.exports = {
  init,
  setMainWindow,
  runRecovery,
  collectFileContext,
  pollAndApplyStaffFix,
  pollAndApplyStaffInbox,
  startStaffInboxPolling,
  stopStaffInboxPolling,
  ALLOWED_ACTIONS,
};
