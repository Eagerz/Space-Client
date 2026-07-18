/** Stardust earn rate: 10 per 15 minutes of verified active play. */
const STARDUST_PER_BLOCK = 10;
const ACTIVE_BLOCK_MS = 15 * 60 * 1000;
const DAILY_STARDUST_CAP = 100;

/** Each verified active heartbeat represents this much play time. */
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/** Gaps longer than this between heartbeats break the active streak. */
const MAX_HEARTBEAT_GAP_MS = 5 * 60 * 1000;

/** AFK threshold — no input for this long pauses earning (client-side). */
const AFK_IDLE_MS = 5 * 60 * 1000;

/** Server rejects sessions longer than 24h. */
const MAX_SESSION_MS = 24 * 60 * 60 * 1000;

/** Economy: 5 Stardust = 1 Credit (shop prices are in Credits). */
const STARDUST_PER_CREDIT = 5;

module.exports = {
  STARDUST_PER_BLOCK,
  ACTIVE_BLOCK_MS,
  DAILY_STARDUST_CAP,
  HEARTBEAT_INTERVAL_MS,
  MAX_HEARTBEAT_GAP_MS,
  AFK_IDLE_MS,
  MAX_SESSION_MS,
  STARDUST_PER_CREDIT,
};
