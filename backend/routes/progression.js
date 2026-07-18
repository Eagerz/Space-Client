const express = require("express");
const playerDb = require("../lib/player-db");
const { verifyProgressionJwt } = require("../lib/session-jwt");
const {
  activeMsFromHeartbeats,
  stardustFromActiveMs,
  resetDailyIfNeeded,
} = require("../lib/progression-math");
const { DAILY_STARDUST_CAP } = require("../lib/progression-config");
const { getShopCatalog, getShopItem } = require("../lib/cosmic-shop-catalog");

/** Dedupe sync batches per session window. */
const recentSyncs = new Map();

function pruneSyncCache() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, ts] of recentSyncs.entries()) {
    if (ts < cutoff) recentSyncs.delete(key);
  }
}

function createProgressionRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "64kb" }));

  /**
   * POST /api/v1/progression/sync
   * Body: { token: "<signed JWT>" }
   */
  router.post("/progression/sync", (req, res) => {
    try {
      pruneSyncCache();
      const token = req.body?.token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
      const payload = verifyProgressionJwt(token);
      if (!payload) {
        return res.status(401).json({ error: "Invalid or expired progression token." });
      }

      const uuid = playerDb.normalizeUuid(payload.sub);
      if (!uuid || uuid.length < 32) {
        return res.status(400).json({ error: "Invalid player UUID in token." });
      }
      if (payload.typ !== "sync") {
        return res.status(400).json({ error: "Invalid token type." });
      }

      const sessionId = String(payload.sid || "");
      const start = Number(payload.start) || 0;
      const end = Number(payload.end) || Date.now();
      const heartbeats = Array.isArray(payload.hb) ? payload.hb : [];

      if (!sessionId || !start) {
        return res.status(400).json({ error: "Session id and start time required." });
      }
      if (heartbeats.length > 1500) {
        return res.status(400).json({ error: "Too many heartbeats in one sync." });
      }

      const syncKey = `${uuid}:${sessionId}:${heartbeats.length}:${end}`;
      if (recentSyncs.has(syncKey)) {
        const player = playerDb.getPlayer(uuid);
        return res.json({
          success: true,
          duplicate: true,
          progression: playerDb.getProgressionSnapshot(player),
        });
      }
      recentSyncs.set(syncKey, Date.now());

      const player = playerDb.getPlayer(uuid);
      resetDailyIfNeeded(player);

      if (payload.username || payload.name) {
        playerDb.touchPlayerIdentity(uuid, payload.username || payload.name);
      }

      const activeMs = activeMsFromHeartbeats(heartbeats, start, end);
      const earned = stardustFromActiveMs(activeMs, player.stardustDailyEarned || 0);

      if (earned > 0) {
        playerDb.applyStardustEarn(uuid, earned, { sessionId, activeMs });
      }

      playerDb.addSessionRecord(uuid, {
        sessionId,
        instanceId: payload.inst || null,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(end).toISOString(),
        activeMs,
        stardustEarned: earned,
        crashed: Boolean(payload.crashed),
      });

      const updated = playerDb.getPlayer(uuid);
      return res.json({
        success: true,
        earned,
        activeMs,
        dailyCap: DAILY_STARDUST_CAP,
        progression: playerDb.getProgressionSnapshot(updated),
      });
    } catch (err) {
      console.error("[progression] sync failed:", err);
      return res.status(500).json({ error: "Progression sync failed." });
    }
  });

  router.get("/progression/:uuid", (req, res) => {
    const uuid = playerDb.normalizeUuid(req.params.uuid);
    if (!uuid) return res.status(400).json({ error: "Invalid UUID." });
    const player = playerDb.getPlayer(uuid);
    return res.json(playerDb.getProgressionSnapshot(player));
  });

  router.get("/shop/catalog", (_req, res) => {
    const { getShopCatalog } = require("../lib/cosmic-shop-catalog");
    const { STARDUST_PER_CREDIT } = require("../lib/progression-config");
    return res.json({
      items: getShopCatalog(),
      economy: { stardustPerCredit: STARDUST_PER_CREDIT },
    });
  });

  router.post("/shop/claim", (req, res) => {
    try {
      const token = req.body?.token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
      const payload = verifyProgressionJwt(token);
      if (!payload) {
        return res.status(401).json({ error: "Invalid or expired claim token." });
      }
      if (payload.typ !== "claim") {
        return res.status(400).json({ error: "Invalid token type." });
      }

      const uuid = playerDb.normalizeUuid(payload.sub);
      const itemId = String(payload.itemId || "");
      const item = getShopItem(itemId);
      if (!item) return res.status(404).json({ error: "Item not found." });

      const player = playerDb.getPlayer(uuid);
      const owned = new Set(player.ownedCosmetics || []);
      if (owned.has(itemId)) {
        return res.status(409).json({ error: "Already owned." });
      }

      const creditPrice =
        Number(item.creditPrice) || Math.ceil((Number(item.stardustPrice) || 0) / 5);
      const spend = playerDb.spendCredits(uuid, creditPrice, { itemId });
      if (!spend.ok) {
        return res.status(402).json({
          error: spend.error || "Insufficient Credits (5 Stardust = 1 Credit).",
        });
      }

      const unlock = playerDb.unlockCosmetic(uuid, itemId, "credits");
      if (!unlock.ok) {
        return res.status(409).json({ error: unlock.error });
      }

      return res.json({
        success: true,
        itemId,
        progression: playerDb.getProgressionSnapshot(unlock.player),
      });
    } catch (err) {
      console.error("[shop] claim failed:", err);
      return res.status(500).json({ error: "Claim failed." });
    }
  });

  return router;
}

module.exports = { createProgressionRouter };
