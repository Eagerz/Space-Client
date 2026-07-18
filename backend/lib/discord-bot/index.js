"use strict";

/**
 * Apex Launcher Discord bot — changelogs, status, reviews, suggestions,
 * typed support tickets, /setup-server bootstrap, crash staff.
 */

const { REST, Routes } = require("discord.js");
const { botEnabled, ensureClient, destroyClient, getClient, isReady } = require("./client");
const {
  buildChangelogCommand,
  handleChangelogCommand,
  postChangelog,
} = require("./changelog");
const {
  buildStatusCommand,
  handleStatusCommand,
  postStatus,
} = require("./status");
const {
  buildSetupReviewsCommand,
  handleSetupReviews,
  handleReviewButton,
  handleReviewModal,
} = require("./reviews");
const {
  buildSetupSuggestionsCommand,
  handleSetupSuggestions,
  handleSuggestionButton,
  handleSuggestionModal,
} = require("./suggestions");
const {
  buildSetupServerCommand,
  handleSetupServer,
} = require("./setup-server");
const {
  registerTicketHandlers,
  handleTicketButton,
  handleTicketModal,
} = require("./tickets");
const { reportCrash, handleCrashButton, handleCrashModal } = require("./crash");

function guildId() {
  return String(process.env.DISCORD_GUILD_ID || "").trim();
}

async function registerSlashCommands(client) {
  const commands = [
    buildChangelogCommand().toJSON(),
    buildStatusCommand().toJSON(),
    buildSetupReviewsCommand().toJSON(),
    buildSetupSuggestionsCommand().toJSON(),
    buildSetupServerCommand().toJSON(),
  ];
  const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  const appId = client.application?.id || client.user?.id;
  if (!token || !appId) {
    console.warn("[discord-bot] Cannot register slash commands — missing app id.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const gid = guildId();
  if (gid) {
    await rest.put(Routes.applicationGuildCommands(appId, gid), { body: commands });
    console.info(`[discord-bot] Registered guild slash commands for ${gid}`);
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.info("[discord-bot] Registered global slash commands (can take up to ~1h)");
  }
}

function wireBot(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "changelog") {
          await handleChangelogCommand(interaction);
          return;
        }
        if (interaction.commandName === "status") {
          await handleStatusCommand(interaction);
          return;
        }
        if (interaction.commandName === "setup-reviews") {
          await handleSetupReviews(interaction);
          return;
        }
        if (interaction.commandName === "setup-suggestions") {
          await handleSetupSuggestions(interaction);
          return;
        }
        if (interaction.commandName === "setup-server") {
          await handleSetupServer(interaction);
          return;
        }
      }

      if (interaction.isButton()) {
        const id = interaction.customId || "";
        if (id.startsWith("sc_ticket_")) {
          await handleTicketButton(interaction);
          return;
        }
        if (id.startsWith("sc_crash_")) {
          await handleCrashButton(interaction);
          return;
        }
        if (await handleReviewButton(interaction)) return;
        if (await handleSuggestionButton(interaction)) return;
      }

      if (interaction.isModalSubmit()) {
        if (await handleCrashModal(interaction)) return;
        if (await handleTicketModal(interaction)) return;
        if (await handleReviewModal(interaction)) return;
        if (await handleSuggestionModal(interaction)) return;
      }
    } catch (err) {
      console.error("[discord-bot] interaction error:", err?.message || err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction
          .reply({ content: "Something went wrong.", ephemeral: true })
          .catch(() => {});
      }
    }
  });

  registerTicketHandlers(client);
}

/**
 * Start the unified Discord bot (idempotent).
 */
async function startDiscordBot() {
  if (!botEnabled()) {
    console.info(
      "[discord-bot] Disabled or DISCORD_BOT_TOKEN unset — changelogs/tickets/crash bot idle."
    );
    return { ok: false, skipped: "no_token" };
  }

  return ensureClient(async (client) => {
    wireBot(client);
    try {
      await registerSlashCommands(client);
    } catch (err) {
      console.error("[discord-bot] Slash command register failed:", err?.message || err);
    }
  });
}

async function stopDiscordBot() {
  await destroyClient();
}

module.exports = {
  startDiscordBot,
  stopDiscordBot,
  reportCrash,
  postChangelog,
  postStatus,
  botEnabled,
  isReady,
  getClient,
  startStaffBot: startDiscordBot,
  stopStaffBot: stopDiscordBot,
};
