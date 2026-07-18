"use strict";

/**
 * Egrz → Discord Rich Presence (IPC to Discord desktop on this machine).
 * Shows "Playing Egrz" / staff dashboard on the signed-in Discord user's profile.
 */

const { oauthClientId } = require("./egrz-auth");

/** @type {import("discord-rpc").Client | null} */
let rpc = null;
let rpcReady = false;
let startedAt = null;
let lastHeartbeat = 0;
let clearTimer = null;
let connecting = null;

const IDLE_MS = 45_000;

function rpcEnabled() {
  const flag = process.env.EGRZ_DISCORD_RPC;
  if (flag === "false" || flag === "0") return false;
  return Boolean(oauthClientId());
}

async function ensureRpc() {
  if (!rpcEnabled()) return null;
  if (rpcReady && rpc) return rpc;
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      // Lazy require so backend boots even if package missing mid-install
      const DiscordRPC = require("discord-rpc");
      DiscordRPC.register(oauthClientId());
      const client = new DiscordRPC.Client({ transport: "ipc" });
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Discord IPC timeout — is Discord desktop open?")), 8000);
        client.once("ready", () => {
          clearTimeout(t);
          resolve();
        });
        client.login({ clientId: oauthClientId() }).catch((err) => {
          clearTimeout(t);
          reject(err);
        });
      });
      rpc = client;
      rpcReady = true;
      console.info("[egrz-rpc] Connected to Discord desktop (Rich Presence)");
      client.on("disconnected", () => {
        rpcReady = false;
        rpc = null;
        console.warn("[egrz-rpc] Discord IPC disconnected");
      });
      return client;
    } catch (err) {
      rpcReady = false;
      rpc = null;
      console.warn("[egrz-rpc] Could not connect:", err?.message || err);
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

/**
 * @param {{ module?: string, username?: string }} [opts]
 */
async function setEgrzActivity(opts = {}) {
  const client = await ensureRpc();
  if (!client) return { ok: false, reason: "discord_ipc_unavailable" };

  if (!startedAt) startedAt = new Date();
  lastHeartbeat = Date.now();
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  clearTimer = setTimeout(() => {
    clearEgrzActivity().catch(() => {});
  }, IDLE_MS);

  const moduleName = String(opts.module || "Overview").slice(0, 64);
  const who = String(opts.username || "").slice(0, 32);

  try {
    await client.setActivity({
      details: "Egrz · Staff Command",
      state: who ? `${moduleName} · ${who}` : moduleName,
      startTimestamp: startedAt,
      largeImageKey: process.env.EGRZ_RPC_LARGE_IMAGE || "apex",
      largeImageText: "Apex Launcher",
      smallImageKey: process.env.EGRZ_RPC_SMALL_IMAGE || undefined,
      smallImageText: "Egrz",
      instance: false,
      buttons: [
        { label: "Open Egrz", url: process.env.EGRZ_PUBLIC_URL || "http://localhost:8787/egrz/" },
      ],
    });
    return { ok: true };
  } catch (err) {
    // Buttons / image keys may fail if app not configured — retry text-only
    try {
      await client.setActivity({
        details: "Egrz · Staff Command",
        state: who ? `${moduleName} · ${who}` : moduleName,
        startTimestamp: startedAt,
        instance: false,
      });
      return { ok: true, fallback: true };
    } catch (err2) {
      console.warn("[egrz-rpc] setActivity failed:", err2?.message || err2);
      return { ok: false, reason: err2?.message || String(err2) };
    }
  }
}

async function clearEgrzActivity() {
  startedAt = null;
  lastHeartbeat = 0;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  if (!rpc || !rpcReady) return { ok: true, cleared: true };
  try {
    await rpc.clearActivity();
  } catch {
    /* ignore */
  }
  return { ok: true, cleared: true };
}

function getRpcStatus() {
  return {
    enabled: rpcEnabled(),
    connected: rpcReady,
    active: Boolean(startedAt),
    lastHeartbeat: lastHeartbeat || null,
    clientIdSet: Boolean(oauthClientId()),
  };
}

module.exports = {
  setEgrzActivity,
  clearEgrzActivity,
  getRpcStatus,
  ensureRpc,
};
