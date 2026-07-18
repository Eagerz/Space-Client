"use strict";

/**
 * Shared Discord.js client for Apex Launcher (changelogs, tickets, crash staff).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** @type {import("discord.js").Client | null} */
let client = null;
let ready = false;
let starting = false;

const AVATAR_PATH = path.join(__dirname, "assets", "bot-avatar.png");
const AVATAR_HASH_PATH = path.join(__dirname, "..", "..", "data", "bot-avatar.hash");

function botEnabled() {
  const flag = process.env.DISCORD_BOT_ENABLED;
  if (flag === "false" || flag === "0") return false;
  return Boolean(String(process.env.DISCORD_BOT_TOKEN || "").trim());
}

function getClient() {
  return client;
}

function isReady() {
  return Boolean(ready && client);
}

/**
 * Presence: shows as "Playing Apex Launcher" on the bot profile.
 * @param {import("discord.js").Client} c
 */
async function applyBotPresence(c) {
  const { ActivityType } = require("discord.js");
  const activityName =
    String(process.env.DISCORD_BOT_ACTIVITY || "Apex Launcher").trim() || "Apex Launcher";
  await c.user.setPresence({
    status: "online",
    activities: [{ name: activityName, type: ActivityType.Playing }],
  });
  console.info(`[discord-bot] Presence set: Playing ${activityName}`);
}

/**
 * Sync bot avatar from assets/bot-avatar.png (only when file hash changes).
 * @param {import("discord.js").Client} c
 */
async function applyBotAvatar(c) {
  if (!fs.existsSync(AVATAR_PATH)) {
    console.warn("[discord-bot] No bot-avatar.png — skip avatar sync");
    return;
  }
  const buf = fs.readFileSync(AVATAR_PATH);
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  let prev = "";
  try {
    prev = fs.readFileSync(AVATAR_HASH_PATH, "utf8").trim();
  } catch {
    /* first run */
  }
  if (prev === hash) {
    console.info("[discord-bot] Avatar already up to date");
    return;
  }
  try {
    await c.user.setAvatar(buf);
    fs.mkdirSync(path.dirname(AVATAR_HASH_PATH), { recursive: true });
    fs.writeFileSync(AVATAR_HASH_PATH, `${hash}\n`, "utf8");
    console.info("[discord-bot] Bot avatar updated (Apex Launcher logo)");
  } catch (err) {
    console.warn("[discord-bot] Avatar update failed:", err?.message || err);
  }
}

/**
 * @param {import("discord.js").Client} c
 */
async function brandBot(c) {
  await applyBotPresence(c);
  await applyBotAvatar(c);
  try {
    if (c.user && c.user.username !== "Apex Launcher") {
      await c.user.setUsername("Apex Launcher");
      console.info("[discord-bot] Username set to Apex Launcher");
    }
  } catch (err) {
    console.warn(
      "[discord-bot] Username change skipped (set in Discord Developer Portal if needed):",
      err?.message || err
    );
  }
}

/**
 * @param {(client: import("discord.js").Client) => void | Promise<void>} [onReady]
 * @returns {Promise<{ ok: boolean, skipped?: string, already?: boolean, error?: string }>}
 */
async function ensureClient(onReady) {
  if (!botEnabled()) {
    return { ok: false, skipped: "no_token" };
  }
  if (isReady()) {
    if (typeof onReady === "function" && client && !client.__spaceClientWired) {
      await onReady(client);
      client.__spaceClientWired = true;
    }
    return { ok: true, already: true };
  }
  if (starting) return { ok: false, skipped: "starting" };

  starting = true;
  try {
    const { Client, GatewayIntentBits, Partials } = require("discord.js");
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ],
      partials: [Partials.Channel],
    });

    client.once("ready", async () => {
      ready = true;
      console.info(`[discord-bot] Logged in as ${client.user?.tag}`);
      try {
        await brandBot(client);
      } catch (err) {
        console.error("[discord-bot] brand failed:", err?.message || err);
      }
      if (typeof onReady === "function") {
        try {
          await onReady(client);
          client.__spaceClientWired = true;
        } catch (err) {
          console.error("[discord-bot] onReady failed:", err?.message || err);
        }
      }
    });

    client.on("error", (err) => {
      console.error("[discord-bot]", err?.message || err);
    });

    await client.login(String(process.env.DISCORD_BOT_TOKEN || "").trim());

    const deadline = Date.now() + 15000;
    while (!ready && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: ready };
  } catch (err) {
    console.error("[discord-bot] Failed to start:", err?.message || err);
    client = null;
    ready = false;
    return { ok: false, error: err?.message || String(err) };
  } finally {
    starting = false;
  }
}

async function destroyClient() {
  if (client) {
    try {
      await client.destroy();
    } catch {
      /* ignore */
    }
  }
  client = null;
  ready = false;
}

module.exports = {
  botEnabled,
  getClient,
  isReady,
  ensureClient,
  destroyClient,
  brandBot,
};
