/**
 * Periodic dependency health checks with Discord alerts on down / recovered only.
 */

const fs = require("fs");
const path = require("path");
const { notifyDiscord, clearCooldown } = require("./discord-alerts");

const DATA_DIR = path.join(__dirname, "..", "data");
const CHECK_INTERVAL_MS = Number(process.env.DISCORD_STATUS_INTERVAL_MS || 60_000);

/** @type {Map<string, boolean | null>} checkId -> last healthy (null = unknown) */
const lastHealthy = new Map();

let intervalHandle = null;

/**
 * @param {import("stripe").default} stripe
 * @returns {Promise<{ id: string, label: string, ok: boolean, detail?: string }[]>}
 */
async function runChecks(stripe) {
  const results = [];

  // Player DB writable
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const probe = path.join(DATA_DIR, ".health-probe");
    fs.writeFileSync(probe, String(Date.now()), "utf8");
    fs.unlinkSync(probe);
    results.push({ id: "player_db", label: "Player DB", ok: true });
  } catch (err) {
    results.push({
      id: "player_db",
      label: "Player DB",
      ok: false,
      detail: err?.message || "Player DB not writable",
    });
  }

  // Stripe API (only when a real key is configured)
  const secret = process.env.STRIPE_SECRET_KEY || "";
  if (secret && !secret.includes("replace_me") && !secret.includes("placeholder")) {
    try {
      await stripe.balance.retrieve();
      results.push({ id: "stripe", label: "Stripe API", ok: true });
    } catch (err) {
      results.push({
        id: "stripe",
        label: "Stripe API",
        ok: false,
        detail: err?.message || "Stripe unreachable",
      });
    }
  }

  return results;
}

/**
 * @param {{ id: string, label: string, ok: boolean, detail?: string }} check
 */
async function handleTransition(check) {
  const prev = lastHealthy.has(check.id) ? lastHealthy.get(check.id) : null;
  lastHealthy.set(check.id, check.ok);

  // Skip first observation (establish baseline without spam)
  if (prev === null) return;

  if (prev === true && check.ok === false) {
    await notifyDiscord({
      key: `monitor:down:${check.id}`,
      force: true,
      title: `${check.label} is down`,
      body: check.detail || "Health check failed.",
      service: check.label,
      status: "Down",
      severity: "critical",
    });
  } else if (prev === false && check.ok === true) {
    clearCooldown(`monitor:down:${check.id}`);
    await notifyDiscord({
      key: `monitor:up:${check.id}`,
      force: true,
      title: `${check.label} recovered`,
      body: "Health check is passing again.",
      service: check.label,
      status: "Resolved",
      severity: "resolved",
    });
  }
}

/**
 * @param {import("stripe").default} stripe
 */
async function tick(stripe) {
  try {
    const results = await runChecks(stripe);
    for (const check of results) {
      await handleTransition(check);
    }
  } catch (err) {
    console.error("[status-monitor] Tick failed:", err?.message || err);
  }
}

/**
 * @param {import("stripe").default} stripe
 * @param {{ intervalMs?: number }} [options]
 */
function startStatusMonitor(stripe, options = {}) {
  if (intervalHandle) return;

  const intervalMs = Math.max(15_000, options.intervalMs || CHECK_INTERVAL_MS);

  // Initial baseline (no alerts)
  tick(stripe).catch(() => {});

  intervalHandle = setInterval(() => {
    tick(stripe).catch(() => {});
  }, intervalMs);

  if (typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }

  console.info(
    `[status-monitor] Running every ${Math.round(intervalMs / 1000)}s (Discord alerts on state change)`
  );
}

function stopStatusMonitor() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startStatusMonitor,
  stopStatusMonitor,
  runChecks,
};
