/**
 * Crash recovery API — AI analysis + Discord staff bot reporting + remote staff fixes.
 * Called by the Electron client only (no secrets in the client).
 */

"use strict";

const express = require("express");
const { analyzeCrash, aiConfigured, getProvider } = require("../lib/crash-ai");
const { reportCrash } = require("../lib/staff-bot");
const { notifyDiscord } = require("../lib/discord-alerts");
const crashCases = require("../lib/crash-cases");
const playerDb = require("../lib/player-db");
const { verifyProgressionJwt } = require("../lib/session-jwt");

function resolveInboxAuth(req) {
  const token =
    req.body?.token ||
    req.query?.token ||
    String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const payload = verifyProgressionJwt(token);
  if (!payload) return null;
  const uuid = playerDb.normalizeUuid(payload.sub);
  if (!uuid || uuid.length < 32) return null;
  if (payload.typ && payload.typ !== "inbox" && payload.typ !== "sync") return null;
  return { uuid, payload };
}

function createCrashRouter() {
  const router = express.Router();

  /**
   * POST /api/crash/analyze
   * Body: { logs, exitCode, error, version, loader, source, fileContext }
   */
  router.post("/crash/analyze", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const plan = await analyzeCrash(req.body || {});
      res.json(plan);
    } catch (err) {
      console.error("[crash] analyze failed:", err?.message || err);
      res.status(500).json({ error: "Crash analysis failed" });
    }
  });

  /**
   * POST /api/crash/report
   * Body: unresolved crash report from the client after AI recovery failed.
   */
  router.post("/crash/report", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const report = req.body || {};
      if (!report.crashId) {
        report.crashId = crashCases.newCrashId();
      }

      const mcUuid = report.player?.minecraftUuid || report.minecraftUuid || null;
      const mcName = report.player?.minecraftUsername || report.minecraftUsername || null;
      if (mcUuid) {
        try {
          playerDb.touchPlayerIdentity(mcUuid, mcName);
        } catch (err) {
          console.warn("[crash] identity touch failed:", err?.message || err);
        }
      }

      const bot = await reportCrash(report);

      // Ensure case exists even if Discord skipped (launcher can still poll).
      if (!crashCases.getCase(report.crashId)) {
        crashCases.createCase(report);
      }

      // Also mirror to status webhook if configured (works before bot is ready).
      if (!bot.ok) {
        await notifyDiscord({
          key: `crash:${String(report.diagnosis || "unknown").slice(0, 40)}`,
          title: "AI recovery failed — staff report",
          body: [
            `crashId=${report.crashId}`,
            report.player?.minecraftUsername || report.minecraftUsername,
            report.diagnosis,
            report.error,
            `platform=${report.platform} version=${report.version}`,
            bot.skipped ? `(bot skipped: ${bot.skipped})` : "",
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 900),
          service: "Crash recovery",
          status: "Needs staff",
          severity: "error",
          cooldownMs: 5 * 60 * 1000,
        }).catch(() => {});
      }

      if (bot.ok) {
        return res.json({
          ok: true,
          messageId: bot.messageId,
          crashId: bot.crashId || report.crashId,
        });
      }

      // Client should queue when bot isn't ready yet — but still return crashId for polling.
      if (bot.skipped === "no_token" || bot.skipped === "bot_not_ready" || bot.skipped === "no_channel") {
        return res.status(503).json({
          ok: false,
          error: "Staff bot not configured yet",
          skipped: bot.skipped,
          crashId: report.crashId,
        });
      }

      return res.status(502).json({
        ok: false,
        error: bot.error || "Failed to notify staff",
        crashId: report.crashId,
      });
    } catch (err) {
      console.error("[crash] report failed:", err?.message || err);
      res.status(500).json({ error: "Crash report failed" });
    }
  });

  /**
   * GET /api/crash/cases/:crashId/pending
   * Launcher polls for staff-queued allow-listed actions + tip.
   */
  router.get("/crash/cases/:crashId/pending", (req, res) => {
    const pending = crashCases.getPendingForClient(req.params.crashId);
    if (!pending) {
      return res.status(404).json({ ok: false, error: "Unknown crash id" });
    }
    return res.json({ ok: true, ...pending });
  });

  /**
   * POST /api/crash/cases/:crashId/ack
   * Launcher acknowledges applied actions / tip shown.
   */
  router.post("/crash/cases/:crashId/ack", express.json({ limit: "32kb" }), (req, res) => {
    const body = req.body || {};
    const entry = crashCases.ackClientApplied(req.params.crashId, {
      applied: body.applied || [],
      tipShown: Boolean(body.tipShown),
    });
    if (!entry) {
      return res.status(404).json({ ok: false, error: "Unknown crash id" });
    }
    return res.json({
      ok: true,
      crashId: entry.crashId,
      status: entry.status,
      pendingActions: entry.pendingActions,
    });
  });

  /**
   * GET /api/crash/inbox
   * Auth: progression JWT (typ inbox|sync). Returns pending staff inbox for that UUID.
   */
  router.get("/crash/inbox", (req, res) => {
    const auth = resolveInboxAuth(req);
    if (!auth) {
      return res.status(401).json({ ok: false, error: "Invalid or expired inbox token" });
    }
    if (auth.payload.username || auth.payload.name) {
      try {
        playerDb.touchPlayerIdentity(auth.uuid, auth.payload.username || auth.payload.name);
      } catch {
        /* ignore */
      }
    }
    const inbox = playerDb.getStaffInbox(auth.uuid);
    return res.json({ ok: true, ...inbox });
  });

  /**
   * POST /api/crash/inbox/ack
   * Body: { token, applied?, tipShown?, updateCheckDone? }
   */
  router.post("/crash/inbox/ack", express.json({ limit: "32kb" }), (req, res) => {
    const auth = resolveInboxAuth(req);
    if (!auth) {
      return res.status(401).json({ ok: false, error: "Invalid or expired inbox token" });
    }
    const body = req.body || {};
    const player = playerDb.ackStaffInbox(auth.uuid, {
      applied: body.applied || [],
      tipShown: Boolean(body.tipShown),
      updateCheckDone: Boolean(body.updateCheckDone),
    });
    if (!player) {
      return res.status(404).json({ ok: false, error: "Player not found" });
    }
    return res.json({ ok: true, ...playerDb.getStaffInbox(auth.uuid) });
  });

  router.get("/crash/health", (_req, res) => {
    res.json({
      ok: true,
      provider: getProvider(),
      aiConfigured: aiConfigured(),
      openai: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
      gemini: Boolean(String(process.env.GEMINI_API_KEY || "").trim()),
      discordBot: Boolean(String(process.env.DISCORD_BOT_TOKEN || "").trim()),
      staffChannel: Boolean(String(process.env.DISCORD_STAFF_CHANNEL_ID || "").trim()),
      links: {
        crashReportToStaff: true,
        bugTicketAiTip: true,
        staffRemoteFix: true,
        playerStaffInbox: true,
      },
    });
  });

  return router;
}

module.exports = { createCrashRouter };
