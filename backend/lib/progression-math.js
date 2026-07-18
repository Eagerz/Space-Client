const {
  STARDUST_PER_BLOCK,
  ACTIVE_BLOCK_MS,
  DAILY_STARDUST_CAP,
  HEARTBEAT_INTERVAL_MS,
  MAX_HEARTBEAT_GAP_MS,
  MAX_SESSION_MS,
  STARDUST_PER_CREDIT,
} = require("./progression-config");

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function resetDailyIfNeeded(player) {
  const today = utcDateKey();
  if (player.stardustDailyDate !== today) {
    player.stardustDailyEarned = 0;
    player.stardustDailyDate = today;
  }
}

/**
 * Compute verified active milliseconds from heartbeat ticks.
 * Server never trusts a raw stardust number from the client.
 */
function activeMsFromHeartbeats(heartbeats, sessionStartMs, sessionEndMs) {
  if (!Array.isArray(heartbeats) || !heartbeats.length) return 0;

  const start = Number(sessionStartMs) || 0;
  const end = Number(sessionEndMs) || Date.now();
  if (!start || end <= start) return 0;
  if (end - start > MAX_SESSION_MS) return 0;

  const sorted = heartbeats
    .map((hb) => ({
      t: Number(hb.t ?? hb.ts ?? hb.time ?? 0),
      active: Boolean(hb.a ?? hb.active),
    }))
    .filter((hb) => hb.t >= start && hb.t <= end)
    .sort((a, b) => a.t - b.t);

  if (!sorted.length) return 0;

  let activeMs = 0;
  let lastActiveTs = null;

  for (const hb of sorted) {
    if (!hb.active) {
      lastActiveTs = null;
      continue;
    }
    if (lastActiveTs == null) {
      activeMs += HEARTBEAT_INTERVAL_MS;
      lastActiveTs = hb.t;
      continue;
    }
    const gap = hb.t - lastActiveTs;
    if (gap > MAX_HEARTBEAT_GAP_MS) {
      activeMs += HEARTBEAT_INTERVAL_MS;
    } else {
      activeMs += Math.min(gap, HEARTBEAT_INTERVAL_MS * 3);
    }
    lastActiveTs = hb.t;
  }

  const sessionCap = end - start;
  return Math.max(0, Math.min(activeMs, sessionCap, MAX_SESSION_MS));
}

function stardustFromActiveMs(activeMs, dailyEarnedSoFar = 0) {
  const blocks = Math.floor(activeMs / ACTIVE_BLOCK_MS);
  const raw = blocks * STARDUST_PER_BLOCK;
  const dailyRemaining = Math.max(0, DAILY_STARDUST_CAP - Math.max(0, dailyEarnedSoFar));
  return Math.min(raw, dailyRemaining);
}

function cosmicPassFromLifetime(lifetimeStardust) {
  // Deprecated — Cosmic Pass removed. Kept for older clients reading the field.
  const xp = Math.max(0, Math.floor(Number(lifetimeStardust) || 0));
  return { xp, level: 1, progress: 0, nextAt: 100, retired: true };
}

function creditsFromStardust(stardust) {
  return Math.floor(Math.max(0, Number(stardust) || 0) / STARDUST_PER_CREDIT);
}

function stardustCostForCredits(credits) {
  return Math.max(0, Math.round(Number(credits) || 0) * STARDUST_PER_CREDIT);
}

module.exports = {
  utcDateKey,
  resetDailyIfNeeded,
  activeMsFromHeartbeats,
  stardustFromActiveMs,
  cosmicPassFromLifetime,
  creditsFromStardust,
  stardustCostForCredits,
  STARDUST_PER_CREDIT,
};
