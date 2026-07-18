const express = require("express");
const crypto = require("crypto");

const CODE_TTL_MS = 6 * 60 * 60 * 1000;
const sessions = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [code, entry] of sessions.entries()) {
    if (!entry?.expiresAt || entry.expiresAt <= now) {
      sessions.delete(code);
    }
  }
}

setInterval(purgeExpired, 60_000).unref();

function normalizeCode(input) {
  const raw = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!raw) return null;
  const body = raw.startsWith("SP-") ? raw.slice(3) : raw;
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(body)) return null;
  return `SP-${body}`;
}

function createBridgeRouter() {
  const router = express.Router();
  router.use(express.json({ limit: "32kb" }));

  router.post("/bridge/register", (req, res) => {
    const code = normalizeCode(req.body?.code);
    if (!code || !req.body?.host || !req.body?.port) {
      return res.status(400).json({ error: "code, host, and port are required" });
    }

    const payload = {
      code,
      host: String(req.body.host),
      port: Number(req.body.port),
      javaHost: req.body.javaHost ? String(req.body.javaHost) : String(req.body.host),
      javaPort: Number(req.body.javaPort || req.body.localWorldPort || 25565),
      lanHost: req.body.lanHost ? String(req.body.lanHost) : undefined,
      localWorldPort: Number(req.body.javaPort || req.body.localWorldPort || 25565),
      tunnelMode: req.body.tunnelMode || "relay",
      sessionId: req.body.sessionId || crypto.randomUUID(),
      hostName: req.body.hostName || "Space Bridge",
      createdAt: Date.now(),
      expiresAt: Date.now() + CODE_TTL_MS,
    };
    sessions.set(code, payload);
    return res.json({ ok: true, code, expiresAt: payload.expiresAt });
  });

  router.get("/bridge/resolve/:code", (req, res) => {
    const code = normalizeCode(req.params.code);
    if (!code) return res.status(400).json({ error: "Invalid code" });
    const entry = sessions.get(code);
    if (!entry || entry.expiresAt <= Date.now()) {
      sessions.delete(code);
      return res.status(404).json({ error: "Code not found or expired" });
    }
    return res.json(entry);
  });

  router.delete("/bridge/register/:code", (req, res) => {
    const code = normalizeCode(req.params.code);
    if (!code) return res.status(400).json({ error: "Invalid code" });
    sessions.delete(code);
    return res.json({ ok: true });
  });

  /**
   * Lightweight UDP tunnel placeholder.
   * Production can swap this for playit.gg / custom relay without launcher changes.
   */
  router.post("/bridge/tunnel", (req, res) => {
    const localPort = Number(req.body?.localPort || 19132);
    if (!Number.isFinite(localPort)) {
      return res.status(400).json({ error: "localPort required" });
    }

    const relayHost = process.env.SPACE_BRIDGE_RELAY_HOST || "";
    const relayPort = Number(process.env.SPACE_BRIDGE_RELAY_PORT || 0);
    if (!relayHost || !relayPort) {
      return res.status(503).json({
        error: "Space Bridge relay is not configured on this server.",
        hint: "Set SPACE_BRIDGE_RELAY_HOST and SPACE_BRIDGE_RELAY_PORT, or use UPnP.",
      });
    }

    const tunnelId = crypto.randomUUID();
    sessions.set(`tunnel:${tunnelId}`, {
      tunnelId,
      localPort,
      host: relayHost,
      port: relayPort,
      createdAt: Date.now(),
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    return res.json({
      ok: true,
      mode: "relay",
      tunnelId,
      host: relayHost,
      port: relayPort,
    });
  });

  router.delete("/bridge/tunnel/:tunnelId", (req, res) => {
    sessions.delete(`tunnel:${req.params.tunnelId}`);
    return res.json({ ok: true });
  });

  return router;
}

module.exports = {
  createBridgeRouter,
};
