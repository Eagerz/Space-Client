"use strict";

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { canPostChangelog } = require("./changelog");

const STATUS_COLORS = {
  UP: 0x4ade80,
  DOWN: 0xdc2626,
  DEGRADED: 0xf59e0b,
  MAINTENANCE: 0xf59e0b,
};

function statusChannelId() {
  return String(process.env.DISCORD_STATUS_CHANNEL_ID || "").trim();
}

function normalizeStatus(value) {
  const s = String(value || "")
    .trim()
    .toUpperCase();
  if (s === "UP" || s === "ONLINE" || s === "OK") return "UP";
  if (s === "DEGRADED" || s === "PARTIAL") return "DEGRADED";
  if (s === "MAINTENANCE") return "MAINTENANCE";
  return "DOWN";
}

function normalizeEdition(value) {
  const e = String(value || "")
    .trim()
    .toLowerCase();
  if (e === "bedrock" || e === "mcbe") return "Bedrock";
  return "Java";
}

function buildStatusEmbed(payload) {
  const version = String(payload.version || "?").slice(0, 64);
  const edition = normalizeEdition(payload.edition);
  const status = normalizeStatus(payload.status);
  const reason = String(payload.reason || (status === "UP" ? "—" : "Unspecified")).slice(0, 200);
  const eta = String(
    payload.eta || (status === "UP" ? "—" : "TBD")
  ).slice(0, 120);
  const apology =
    payload.apology ||
    "We are sorry for the inconvenience this may have caused.";

  const description = [
    `**CLIENT VERSION:** \`${version}\` (${edition})`,
    "",
    `- **STATUS:** ${status}`,
    `- **REASON:** ${reason}`,
    `- **ETA ON BACK UP:** ${eta}`,
    "",
    `-# ${apology}`,
  ].join("\n");

  return new EmbedBuilder()
    .setTitle("Apex Launcher — Status")
    .setColor(STATUS_COLORS[status] ?? STATUS_COLORS.DOWN)
    .setDescription(description)
    .setTimestamp(new Date())
    .setFooter({ text: payload.author ? `Updated by ${payload.author}` : "Apex Launcher Status" });
}

function buildStatusCommand() {
  return new SlashCommandBuilder()
    .setName("status")
    .setDescription("Post a Apex Launcher status embed to the STATUS channel")
    .addStringOption((opt) =>
      opt
        .setName("version")
        .setDescription("Client / game version (e.g. 1.21.1)")
        .setRequired(true)
        .setMaxLength(64)
    )
    .addStringOption((opt) =>
      opt
        .setName("edition")
        .setDescription("Java or Bedrock")
        .setRequired(true)
        .addChoices(
          { name: "Java", value: "java" },
          { name: "Bedrock", value: "bedrock" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("status")
        .setDescription("Service status")
        .setRequired(true)
        .addChoices(
          { name: "DOWN", value: "DOWN" },
          { name: "UP", value: "UP" },
          { name: "DEGRADED", value: "DEGRADED" },
          { name: "MAINTENANCE", value: "MAINTENANCE" }
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("reason")
        .setDescription("Reason (e.g. MAINTENANCE)")
        .setRequired(true)
        .setMaxLength(200)
    )
    .addStringOption((opt) =>
      opt
        .setName("eta")
        .setDescription("ETA on back up (e.g. 2 hours, 18:00 UTC)")
        .setRequired(false)
        .setMaxLength(120)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function handleStatusCommand(interaction) {
  if (!canPostChangelog(interaction.member)) {
    await interaction.reply({
      content: "You need Manage Server / Admin (or the admin role) to post status updates.",
      ephemeral: true,
    });
    return;
  }

  const channelId = statusChannelId();
  if (!channelId) {
    await interaction.reply({
      content: "Status channel is not configured (`DISCORD_STATUS_CHANNEL_ID`).",
      ephemeral: true,
    });
    return;
  }

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      content: "Could not reach the STATUS channel. Check the channel ID and bot permissions.",
      ephemeral: true,
    });
    return;
  }

  const payload = {
    version: interaction.options.getString("version", true),
    edition: interaction.options.getString("edition", true),
    status: interaction.options.getString("status", true),
    reason: interaction.options.getString("reason", true),
    eta: interaction.options.getString("eta") || undefined,
    author: interaction.user.tag,
  };

  const msg = await channel.send({ embeds: [buildStatusEmbed(payload)] });
  await interaction.reply({
    content: `Status posted in <#${channelId}> (${msg.url}).`,
    ephemeral: true,
  });
}

/**
 * Programmatic post (agents / ops).
 * @param {import("discord.js").Client} client
 * @param {{ version: string, edition?: string, status: string, reason: string, eta?: string, author?: string }} payload
 */
async function postStatus(client, payload) {
  const channelId = statusChannelId();
  if (!channelId) return { ok: false, skipped: "no_channel" };
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return { ok: false, skipped: "bad_channel" };

  const msg = await channel.send({ embeds: [buildStatusEmbed(payload)] });
  return { ok: true, messageId: msg.id, url: msg.url };
}

module.exports = {
  buildStatusCommand,
  handleStatusCommand,
  postStatus,
  buildStatusEmbed,
};
