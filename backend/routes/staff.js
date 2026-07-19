"use strict";

/**
 * Egrz staff API — /api/staff/*
 */

const crypto = require("crypto");
const express = require("express");
const playerDb = require("../lib/player-db");
const crashCases = require("../lib/crash-cases");
const {
  oauthConfigured,
  publicUrl,
  redirectUri,
  oauthClientId,
  buildAuthorizeUrl,
  exchangeCode,
  fetchDiscordUser,
  fetchGuildMember,
  resolveAccess,
  createSessionFromUser,
  setSessionCookie,
  clearSessionCookie,
  getSession,
  requireAuth,
  staffRoleIds,
} = require("../lib/egrz-auth");
const { getClient, isReady, botEnabled } = require("../lib/discord-bot/client");
const { setEgrzActivity, clearEgrzActivity, getRpcStatus } = require("../lib/egrz-rpc");
const { lookupLauncherId } = require("../lib/launcher-lookup");
const fixJobs = require("../lib/fix-jobs");
const fixAgent = require("../lib/fix-agent");
const diagnosticsStore = require("../lib/diagnostics-store");
const { backupDiagnostic, backupEnabled } = require("../lib/github-backup");
const fs = require("fs");
const path = require("path");

const STATE_COOKIE = "egrz_oauth_state";

function envId(key) {
  return String(process.env[key] || "").trim();
}

function ticketCategoryMap() {
  return [
    { key: "general", label: "General", env: "DISCORD_TICKET_CAT_GENERAL_ID" },
    { key: "refunds", label: "Refunds", env: "DISCORD_TICKET_CAT_REFUNDS_ID" },
    { key: "bug", label: "Bug Report", env: "DISCORD_TICKET_CAT_BUG_ID" },
    { key: "manager", label: "Manager Support", env: "DISCORD_TICKET_CAT_MANAGER_ID" },
    { key: "purchase", label: "Purchase Support", env: "DISCORD_TICKET_CAT_PURCHASE_ID" },
  ].map((t) => ({ ...t, id: envId(t.env) }));
}

function setStateCookie(res, state) {
  const secure = publicUrl().startsWith("https") ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`
  );
}

function clearStateCookie(res) {
  const secure = publicUrl().startsWith("https") ? "; Secure" : "";
  res.append("Set-Cookie", `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function discordChannelUrl(guildId, channelId) {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

/**
 * @param {import("stripe").Stripe} stripe
 */
function createStaffRouter(stripe) {
  const router = express.Router();

  // ── Auth ────────────────────────────────────────────────────────
  router.get("/auth/config", (_req, res) => {
    res.json({
      configured: oauthConfigured(),
      publicUrl: publicUrl(),
      redirectUri: redirectUri(),
      clientIdSet: Boolean(oauthClientId()),
      guildIdSet: Boolean(envId("DISCORD_GUILD_ID")),
      botReady: isReady(),
      rpc: getRpcStatus(),
    });
  });

  router.get("/auth/login", (req, res) => {
    if (!oauthConfigured()) {
      return res.status(503).send(
        "Egrz OAuth is not configured. Set DISCORD_OAUTH_CLIENT_ID, DISCORD_OAUTH_CLIENT_SECRET, EGRZ_SESSION_SECRET, DISCORD_GUILD_ID."
      );
    }
    const state = crypto.randomBytes(16).toString("hex");
    setStateCookie(res, state);
    res.redirect(buildAuthorizeUrl(state));
  });

  router.get("/auth/callback", async (req, res) => {
    try {
      if (!oauthConfigured()) {
        return res.status(503).send("OAuth not configured");
      }
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      const cookies = parseCookies(req);
      if (!code || !state || state !== cookies[STATE_COOKIE]) {
        return res.status(400).send("Invalid OAuth state. Try signing in again.");
      }
      clearStateCookie(res);

      const token = await exchangeCode(code);
      const user = await fetchDiscordUser(token.access_token);
      const member = await fetchGuildMember(user.id);
      if (!member) {
        return res.status(403).send("You are not a member of the Apex Launcher Discord server.");
      }
      const access = resolveAccess(member.roles || []);
      if (!access) {
        return res
          .status(403)
          .send("Access denied — you need a staff role (Helper, Mod, Staff, Developers, …).");
      }

      const session = createSessionFromUser(user, access);
      setSessionCookie(res, session);
      res.redirect("/egrz/");
    } catch (err) {
      console.error("[egrz/auth]", err?.message || err);
      res.status(500).send(`Sign-in failed: ${err?.message || String(err)}`);
    }
  });

  router.post("/auth/logout", async (_req, res) => {
    clearSessionCookie(res);
    await clearEgrzActivity().catch(() => {});
    res.json({ ok: true });
  });

  router.get("/auth/me", (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ authenticated: false });
    res.json({
      authenticated: true,
      user: {
        id: session.sub,
        username: session.username,
        globalName: session.globalName,
        avatar: session.avatar,
        level: session.level,
        roles: session.roles,
      },
      rpc: getRpcStatus(),
    });
  });

  // Discord Rich Presence heartbeat (shows “Playing Egrz” on Discord desktop)
  router.post("/presence/heartbeat", requireAuth("viewer"), async (req, res) => {
    const moduleName = String(req.body?.module || "Overview");
    const result = await setEgrzActivity({
      module: moduleName,
      username: req.egrz.globalName || req.egrz.username,
    });
    res.json({ ...result, rpc: getRpcStatus() });
  });

  router.post("/presence/clear", requireAuth("viewer"), async (_req, res) => {
    const result = await clearEgrzActivity();
    res.json({ ...result, rpc: getRpcStatus() });
  });

  // Everything below requires staff session
  router.use(requireAuth("viewer"));

  // ── Launcher ID lookup (MC name / Discord / UUID) ────────────────
  router.get("/launcher-id/lookup", async (req, res) => {
    try {
      const q = String(req.query.q || "");
      const result = await lookupLauncherId(q);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err?.message || "lookup failed" });
    }
  });

  /** Link a Discord account onto a launcher ID (ops). */
  router.post("/launcher-id/:uuid/link-discord", requireAuth("ops"), (req, res) => {
    const uuid = playerDb.normalizeUuid(req.params.uuid);
    if (!uuid || uuid.length < 32) {
      return res.status(400).json({ error: "Invalid launcher ID" });
    }
    const discordId = String(req.body?.discordId || "").trim();
    const discordUsername = String(req.body?.discordUsername || "").trim();
    if (!discordId) return res.status(400).json({ error: "discordId required" });
    const player = playerDb.touchDiscordIdentity(uuid, discordId, discordUsername);
    res.json({
      ok: true,
      launcherId: uuid,
      discordId: player.discordId,
      discordUsername: player.discordUsername,
    });
  });

  // ── Overview ────────────────────────────────────────────────────
  router.get("/overview", async (_req, res) => {
    try {
      const players = playerDb.listPlayers({ limit: 5 });
      const tickets = await listTicketsSafe();
      const crashHealth = {
        botReady: isReady(),
        botEnabled: botEnabled(),
        staffChannel: Boolean(envId("DISCORD_STAFF_CHANNEL_ID")),
      };
      let stripeOk = false;
      try {
        if (process.env.STRIPE_SECRET_KEY) {
          await stripe.balance.retrieve();
          stripeOk = true;
        }
      } catch {
        stripeOk = false;
      }

      res.json({
        ticketsOpen: tickets.total,
        ticketsByType: tickets.byType,
        playerCount: players.total,
        processedSessions: players.processedSessionCount,
        recentPlayers: players.players,
        crashHealth,
        stripeOk,
        bot: {
          ready: isReady(),
          tag: getClient()?.user?.tag || null,
        },
        todosChannel: envId("DISCORD_TODOS_CHANNEL_ID") || null,
      });
    } catch (err) {
      res.status(500).json({ error: err?.message || "overview failed" });
    }
  });

  // ── Players ─────────────────────────────────────────────────────
  router.get("/players", (req, res) => {
    const q = String(req.query.q || "");
    const limit = Number(req.query.limit || 50);
    res.json(playerDb.listPlayers({ q, limit }));
  });

  router.get("/players/:uuid", (req, res) => {
    const uuid = playerDb.normalizeUuid(req.params.uuid);
    if (!uuid || uuid.length < 32) {
      return res.status(400).json({ error: "Invalid UUID" });
    }
    const db = playerDb.readDb();
    if (!db.players[uuid]) {
      return res.status(404).json({ error: "Player not found" });
    }
    const player = playerDb.getPlayer(uuid);
    res.json({
      player,
      snapshot: playerDb.getProgressionSnapshot(player),
      inbox: playerDb.getStaffInbox(uuid),
    });
  });

  /**
   * POST /api/staff/players/:uuid/inbox
   * Queue allow-listed remote fix / tip / force update check for a player's launcher.
   */
  router.post("/players/:uuid/inbox", requireAuth("ops"), express.json({ limit: "32kb" }), (req, res) => {
    const uuid = playerDb.normalizeUuid(req.params.uuid);
    if (!uuid || uuid.length < 32) {
      return res.status(400).json({ error: "Invalid UUID" });
    }
    const body = req.body || {};
    const rawActions = Array.isArray(body.actions) ? body.actions : [];
    const actions = crashCases.sanitizeActions(rawActions);
    let tip = body.tip != null ? String(body.tip).trim().slice(0, 1500) : null;
    const forceUpdateCheck = Boolean(body.forceUpdateCheck);
    if (forceUpdateCheck && !tip) {
      tip = "Update Apex Launcher when prompted, then relaunch Minecraft.";
    }
    if (!actions.length && !tip && !forceUpdateCheck) {
      return res.status(400).json({ error: "Provide actions, tip, and/or forceUpdateCheck" });
    }
    if (body.username) {
      playerDb.touchPlayerIdentity(uuid, body.username);
    }
    if (body.discordId) {
      playerDb.touchDiscordIdentity(uuid, body.discordId, body.discordUsername);
    }
    const queuedBy =
      req.egrz?.globalName || req.egrz?.username || req.egrz?.sub || "staff";
    playerDb.queueStaffInbox(uuid, {
      actions,
      tip,
      forceUpdateCheck,
      queuedBy: String(queuedBy),
    });
    res.json({ ok: true, inbox: playerDb.getStaffInbox(uuid) });
  });

  // ── Purchases ───────────────────────────────────────────────────
  router.get("/purchases/lookup", async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q required" });

    const result = {
      query: q,
      players: playerDb.listPlayers({ q, limit: 20 }).players,
      stripeSessions: [],
      processed: playerDb
        .listProcessedSessions(80)
        .filter((s) => s.sessionId.toLowerCase().includes(q.toLowerCase())),
    };

    if (process.env.STRIPE_SECRET_KEY && q.startsWith("cs_")) {
      try {
        const session = await stripe.checkout.sessions.retrieve(q);
        result.stripeSessions.push({
          id: session.id,
          status: session.status,
          paymentStatus: session.payment_status,
          amountTotal: session.amount_total,
          currency: session.currency,
          customer: session.customer,
          metadata: session.metadata || {},
          created: session.created,
        });
      } catch (err) {
        result.stripeError = err?.message || String(err);
      }
    }

    res.json(result);
  });

  router.get("/purchases/recent", async (_req, res) => {
    const processed = playerDb.listProcessedSessions(40);
    const players = playerDb.listPlayers({ limit: 30 }).players.filter((p) => p.lastPurchase);
    res.json({ processed, recentPurchases: players.map((p) => ({ uuid: p.uuid, ...p.lastPurchase })) });
  });

  // ── Tickets ─────────────────────────────────────────────────────
  router.get("/tickets", async (_req, res) => {
    try {
      res.json(await listTicketsSafe());
    } catch (err) {
      res.status(500).json({ error: err?.message || "tickets failed" });
    }
  });

  // ── Crashes + durable diagnostics ───────────────────────────────
  router.get("/crashes", async (req, res) => {
    try {
      const channelId = envId("DISCORD_STAFF_CHANNEL_ID");
      const gid = envId("DISCORD_GUILD_ID");
      const messages = [];
      const client = getClient();
      if (client && isReady() && channelId) {
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (ch?.isTextBased()) {
          const recent = await ch.messages.fetch({ limit: 25 });
          for (const m of recent.values()) {
            if (!m.author?.bot && !m.embeds?.length) continue;
            const embed = m.embeds?.[0];
            messages.push({
              id: m.id,
              content: m.content?.slice(0, 300) || "",
              title: embed?.title || null,
              description: embed?.description?.slice(0, 500) || null,
              createdAt: m.createdAt?.toISOString?.() || null,
              url: discordChannelUrl(gid, channelId) + `/${m.id}`,
            });
          }
        }
      }

      const q = String(req.query.q || "");
      const launcherId = String(req.query.launcherId || "");
      const diagnostics = diagnosticsStore.listDiagnostics({
        q,
        launcherId: launcherId || undefined,
        limit: Number(req.query.limit || 40),
      });
      const cases = crashCases.listCases().slice(0, 40).map((c) => ({
        crashId: c.crashId,
        status: c.status,
        diagnosis: c.diagnosis,
        summary: c.summary,
        launcherId: c.player?.minecraftUuid || null,
        username: c.player?.minecraftUsername || null,
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
      }));

      res.json({
        staffChannelId: channelId || null,
        botReady: isReady(),
        messages,
        diagnostics,
        cases,
        githubBackupEnabled: backupEnabled(),
      });
    } catch (err) {
      res.status(500).json({ error: err?.message || "crashes failed" });
    }
  });

  router.get("/crashes/:crashId", (req, res) => {
    const crashId = String(req.params.crashId || "").trim();
    const diagnostic = diagnosticsStore.getDiagnostic(crashId);
    const crashCase = crashCases.getCase(crashId);
    if (!diagnostic && !crashCase) {
      return res.status(404).json({ error: "Crash / diagnostic not found" });
    }
    res.json({
      ok: true,
      diagnostic,
      case: crashCase,
    });
  });

  router.post(
    "/crashes/:crashId/backup",
    requireAuth("ops"),
    async (req, res) => {
      try {
        const result = await backupDiagnostic(req.params.crashId);
        if (!result.ok && result.skipped) {
          return res.status(400).json(result);
        }
        if (!result.ok) return res.status(502).json(result);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err?.message || "backup failed" });
      }
    }
  );

  // ── Todos ───────────────────────────────────────────────────────
  router.get("/todos", async (_req, res) => {
    try {
      const channelId = envId("DISCORD_TODOS_CHANNEL_ID");
      const gid = envId("DISCORD_GUILD_ID");
      const messages = [];
      const client = getClient();
      if (client && isReady() && channelId) {
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (ch?.isTextBased()) {
          const recent = await ch.messages.fetch({ limit: 20 });
          for (const m of recent.values()) {
            messages.push({
              id: m.id,
              content: m.content?.slice(0, 800) || "",
              title: m.embeds?.[0]?.title || null,
              description: m.embeds?.[0]?.description?.slice(0, 1200) || null,
              createdAt: m.createdAt?.toISOString?.() || null,
              url: discordChannelUrl(gid, channelId) + `/${m.id}`,
            });
          }
        }
      }
      res.json({ channelId: channelId || null, messages });
    } catch (err) {
      res.status(500).json({ error: err?.message || "todos failed" });
    }
  });

  router.post("/todos", requireAuth("ops"), async (req, res) => {
    try {
      const channelId = envId("DISCORD_TODOS_CHANNEL_ID");
      if (!channelId) return res.status(400).json({ error: "DISCORD_TODOS_CHANNEL_ID not set" });
      const client = getClient();
      if (!client || !isReady()) return res.status(503).json({ error: "Discord bot offline" });
      const text = String(req.body?.text || "").trim().slice(0, 1800);
      if (!text) return res.status(400).json({ error: "text required" });
      const ch = await client.channels.fetch(channelId);
      if (!ch?.isTextBased()) return res.status(400).json({ error: "Todos channel invalid" });
      const msg = await ch.send({
        embeds: [
          {
            title: "Egrz — Todo",
            description: text,
            color: 0xc8cad4,
            footer: { text: `Posted by ${req.egrz.globalName || req.egrz.username}` },
            timestamp: new Date().toISOString(),
          },
        ],
      });
      res.json({ ok: true, messageId: msg.id });
    } catch (err) {
      res.status(500).json({ error: err?.message || "post failed" });
    }
  });

  // ── Updates ─────────────────────────────────────────────────────
  router.get("/updates", async (_req, res) => {
    const mobile = {
      jsonSet: Boolean(envId("MOBILE_ANDROID_UPDATE_JSON")),
      url: envId("MOBILE_ANDROID_UPDATE_URL") || null,
      apkUrl: envId("MOBILE_ANDROID_APK_URL") || null,
      version: envId("MOBILE_ANDROID_VERSION") || null,
      versionCode: envId("MOBILE_ANDROID_VERSION_CODE") || null,
      sha256: envId("MOBILE_ANDROID_APK_SHA256") || null,
    };
    let changelogRecent = [];
    const changelogId = envId("DISCORD_CHANGELOG_CHANNEL_ID");
    const client = getClient();
    if (client && isReady() && changelogId) {
      try {
        const ch = await client.channels.fetch(changelogId);
        if (ch?.isTextBased()) {
          const recent = await ch.messages.fetch({ limit: 8 });
          changelogRecent = [...recent.values()].map((m) => ({
            id: m.id,
            title: m.embeds?.[0]?.title || m.content?.slice(0, 80) || "changelog",
            createdAt: m.createdAt?.toISOString?.() || null,
          }));
        }
      } catch {
        /* ignore */
      }
    }

    let channels = {
      stable: {
        label: "Stable",
        manifestUrl: "https://download.spaceclient.com/updates/latest.json",
        note: "Default production channel",
      },
      canary: {
        label: "Canary",
        manifestUrl: null,
        note: "Optional canary manifest — set URL in backend/data/update-channels.json",
      },
    };
    try {
      const channelsPath = path.join(__dirname, "..", "data", "update-channels.json");
      if (fs.existsSync(channelsPath)) {
        channels = JSON.parse(fs.readFileSync(channelsPath, "utf8"));
      }
    } catch {
      /* keep defaults */
    }

    res.json({
      mobile,
      desktop: {
        note:
          "Desktop binaries: CDN manifest (download.spaceclient.com) + GitHub Releases as CI/backup. Per-player force update uses staff inbox.",
        manifestUrl: "https://download.spaceclient.com/updates/latest.json",
        releasesUrl: "https://github.com/Eagerz/space-client/releases",
        publishScript: "scripts/publish-app-update.js",
      },
      channels,
      changelogRecent,
    });
  });

  // ── Fix Agent jobs (Space Cloud) ────────────────────────────────
  router.get("/fix-jobs", (req, res) => {
    const jobs = fixJobs.listJobs({
      status: req.query.status || undefined,
      launcherId: req.query.launcherId || undefined,
      limit: Number(req.query.limit || 50),
    });
    res.json({ jobs });
  });

  router.get("/fix-jobs/:id", (req, res) => {
    const job = fixJobs.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json({ job });
  });

  router.post("/fix-jobs", requireAuth("ops"), express.json({ limit: "64kb" }), async (req, res) => {
    try {
      const body = req.body || {};
      let launcherId = playerDb.normalizeUuid(body.launcherId || body.uuid || "");
      let username = body.username || null;
      let discordId = body.discordId || null;
      let discordUsername = body.discordUsername || null;

      if ((!launcherId || launcherId.length < 32) && body.q) {
        const looked = await lookupLauncherId(String(body.q));
        const match = looked?.matches?.[0];
        if (match?.launcherId) {
          launcherId = playerDb.normalizeUuid(match.launcherId);
          username = username || match.username || null;
          discordId = discordId || match.discordId || null;
          discordUsername = discordUsername || match.discordUsername || null;
        }
      }

      const createdBy =
        req.egrz?.globalName || req.egrz?.username || req.egrz?.sub || "staff";

      const job = await fixAgent.runFixJob({
        launcherId,
        username,
        discordId,
        discordUsername,
        issueText: body.issueText,
        logs: body.logs || null,
        crashId: body.crashId || null,
        ticketChannelId: body.ticketChannelId || null,
        notifyDiscord: body.notifyDiscord !== false,
        requireConfirm: Boolean(body.requireConfirm),
        createdBy: String(createdBy),
      });

      res.json({ ok: true, job });
    } catch (err) {
      const status = err?.status || 500;
      res.status(status).json({ error: err?.message || "Fix job failed" });
    }
  });

  router.post(
    "/fix-jobs/:id/fixed",
    requireAuth("ops"),
    express.json({ limit: "16kb" }),
    async (req, res) => {
      try {
        const existing = fixJobs.getJob(req.params.id);
        if (!existing) return res.status(404).json({ error: "Job not found" });
        const body = req.body || {};
        const closedBy =
          req.egrz?.globalName || req.egrz?.username || req.egrz?.sub || "staff";
        const job = await fixAgent.markJobFixed(req.params.id, {
          note: body.note || null,
          closedBy: String(closedBy),
          notifyDiscord: body.notifyDiscord !== false,
        });
        res.json({ ok: true, job });
      } catch (err) {
        res.status(500).json({ error: err?.message || "Mark fixed failed" });
      }
    }
  );

  router.post(
    "/fix-jobs/:id/queue",
    requireAuth("ops"),
    express.json({ limit: "32kb" }),
    async (req, res) => {
      try {
        const existing = fixJobs.getJob(req.params.id);
        if (!existing) return res.status(404).json({ error: "Job not found" });
        const body = req.body || {};
        const queuedBy =
          req.egrz?.globalName || req.egrz?.username || req.egrz?.sub || "staff";
        const job = fixAgent.queueJobActions(req.params.id, {
          actions: body.actions,
          tip: body.tip,
          forceUpdateCheck: body.forceUpdateCheck,
          queuedBy: String(queuedBy),
          notifyQueued: body.notifyDiscord !== false,
        });
        res.json({ ok: true, job });
      } catch (err) {
        res.status(500).json({ error: err?.message || "Queue failed" });
      }
    }
  );

  // ── Agents board (catalog + fix agent pointer) ──────────────────
  router.get("/agents", (_req, res) => {
    res.json({
      fixAgent: {
        id: "space-cloud-fix",
        name: "Space Cloud Fix Agent",
        status: "active",
        endpoint: "POST /api/staff/fix-jobs",
        note: "Type issue + launcher ID in Egrz Agents — queues allow-listed repairs.",
      },
      agents: [
        { id: "space-cloud-fix", name: "Space Cloud Fix Agent", area: "backend/lib/fix-agent.js", status: "active" },
        { id: "discord-bot", name: "Discord Bot", area: "backend/lib/discord-bot", status: "active" },
        { id: "electron-auto-updater", name: "Electron Auto Updater", area: "auto-updater.js", status: "active" },
        { id: "electron-release-ci", name: "Electron Release CI", area: ".github/workflows", status: "active" },
        { id: "mc-mod-compiler", name: "MC Mod Compiler", area: "mods/space-client-core", status: "active" },
        { id: "gradle-build-provisioner", name: "Gradle Build Provisioner", area: "natives pipeline", status: "active" },
        { id: "gameplay-recorder", name: "Gameplay Recorder", area: "gameplay-recorder.js", status: "scaffold" },
        { id: "video-dashboard", name: "Video Dashboard", area: "video-dashboard/", status: "scaffold" },
        { id: "video-editor", name: "Video Editor", area: "clips pipeline", status: "scaffold" },
        { id: "space-landing", name: "Space Landing", area: "website/", status: "active" },
        { id: "launcher-update", name: "Launcher Update", area: "version bump + toast", status: "active" },
        { id: "space-reload", name: "Space Reload", area: "Electron relaunch", status: "active" },
        { id: "egrz", name: "Egrz Dashboard", area: "egrz/ + /api/staff", status: "active" },
      ],
    });
  });

  // ── Discord ops (read-only) ─────────────────────────────────────
  router.get("/discord", (_req, res) => {
    const gid = envId("DISCORD_GUILD_ID");
    const channels = {
      changelogs: envId("DISCORD_CHANGELOG_CHANNEL_ID"),
      status: envId("DISCORD_STATUS_CHANNEL_ID"),
      reviewsPanel: envId("DISCORD_REVIEWS_PANEL_CHANNEL_ID"),
      reviewsStaff: envId("DISCORD_REVIEWS_CHANNEL_ID"),
      suggestions: envId("DISCORD_SUGGESTIONS_CHANNEL_ID"),
      ticketsPanel: envId("DISCORD_TICKETS_PANEL_CHANNEL_ID"),
      staff: envId("DISCORD_STAFF_CHANNEL_ID"),
      staffAnnouncements: envId("DISCORD_STAFF_ANNOUNCEMENTS_CHANNEL_ID"),
      todos: envId("DISCORD_TODOS_CHANNEL_ID"),
    };
    const links = {};
    for (const [k, id] of Object.entries(channels)) {
      if (id && gid) links[k] = discordChannelUrl(gid, id);
    }
    res.json({
      botReady: isReady(),
      botTag: getClient()?.user?.tag || null,
      guildId: gid || null,
      channels,
      links,
      roles: staffRoleIds().map((r) => ({ label: r.label, level: r.level, id: r.id })),
      note: "/setup-server wipe stays Discord-only (password gated).",
    });
  });

  return router;
}

async function listTicketsSafe() {
  const gid = envId("DISCORD_GUILD_ID");
  const cats = ticketCategoryMap();
  const byType = {};
  const tickets = [];
  const client = getClient();

  for (const cat of cats) {
    byType[cat.key] = 0;
    if (!cat.id || !client || !isReady()) continue;
    try {
      const parent = await client.channels.fetch(cat.id).catch(() => null);
      if (!parent) continue;
      const guild = parent.guild || (gid ? await client.guilds.fetch(gid) : null);
      if (!guild) continue;
      await guild.channels.fetch().catch(() => null);
      const children = guild.channels.cache.filter(
        (c) => c.parentId === cat.id && String(c.name || "").startsWith("ticket-")
      );
      byType[cat.key] = children.size;
      for (const ch of children.values()) {
        tickets.push({
          id: ch.id,
          name: ch.name,
          type: cat.key,
          typeLabel: cat.label,
          topic: ch.topic || null,
          url: discordChannelUrl(gid, ch.id),
          createdAt: ch.createdAt?.toISOString?.() || null,
        });
      }
    } catch {
      /* continue */
    }
  }

  tickets.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return { total: tickets.length, byType, tickets };
}

module.exports = { createStaffRouter };
