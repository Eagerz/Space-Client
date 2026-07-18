"use strict";

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

/** Left accent bar on the embed (Discord’s side line). */
const CHANGELOG_COLOR = 0xc8cad4;

function changelogChannelId() {
  return String(process.env.DISCORD_CHANGELOG_CHANNEL_ID || "").trim();
}

function adminRoleId() {
  return String(process.env.DISCORD_ADMIN_ROLE_ID || "").trim();
}

function canPostChangelog(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const role = adminRoleId();
  if (role && member.roles?.cache?.has(role)) return true;
  return false;
}

/** e.g. 18/7/26 */
function formatChangelogDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

/**
 * Normalize notes into `-` bullet lines (keeps blank lines).
 * @param {string} raw
 */
function formatNotes(raw) {
  const text = String(raw || "").trim();
  if (!text) return "-";
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return "";
      if (/^[-•*]\s+/.test(t)) return `- ${t.replace(/^[-•*]\s+/, "")}`;
      if (t === "-" || t === "•" || t === "*") return "-";
      return `- ${t}`;
    })
    .join("\n")
    .slice(0, 4000);
}

function buildChangelogEmbed({ notes, version, author, date }) {
  const dateLabel = formatChangelogDate(date || new Date());
  // Discord embed titles render bold — "Changelogs - 18/7/26"
  const title = `Changelogs - ${dateLabel}`;
  const description = formatNotes(notes);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(CHANGELOG_COLOR)
    .setDescription(description);

  if (version) {
    embed.setFooter({
      text: author ? `v${version} · ${author}` : `v${version}`,
    });
  } else if (author) {
    embed.setFooter({ text: author });
  }

  return embed;
}

function buildChangelogCommand() {
  return new SlashCommandBuilder()
    .setName("changelog")
    .setDescription("Post a changelog (title: Changelogs - D/M/YY) to the changelogs channel")
    .addStringOption((opt) =>
      opt
        .setName("notes")
        .setDescription("Changelog lines — each becomes a - bullet")
        .setRequired(true)
        .setMaxLength(3500)
    )
    .addStringOption((opt) =>
      opt
        .setName("version")
        .setDescription("Optional version (shown in footer)")
        .setRequired(false)
        .setMaxLength(32)
    )
    .addStringOption((opt) =>
      opt
        .setName("date")
        .setDescription("Optional date as D/M/YY (default: today)")
        .setRequired(false)
        .setMaxLength(12)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

/**
 * Parse D/M/YY or D/M/YYYY → Date, or null.
 * @param {string | null} raw
 */
function parseDateOption(raw) {
  if (!raw) return null;
  const m = String(raw)
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const month = Number(m[2]) - 1;
  const day = Number(m[1]);
  const d = new Date(year, month, day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function handleChangelogCommand(interaction) {
  if (!canPostChangelog(interaction.member)) {
    await interaction.reply({
      content: "You need Manage Server / Admin (or the changelog admin role) to post updates.",
      ephemeral: true,
    });
    return;
  }

  const channelId = changelogChannelId();
  if (!channelId) {
    await interaction.reply({
      content: "Changelog channel is not configured (`DISCORD_CHANGELOG_CHANNEL_ID`).",
      ephemeral: true,
    });
    return;
  }

  const notes = interaction.options.getString("notes", true).trim();
  const version = interaction.options.getString("version")?.trim() || "";
  const dateRaw = interaction.options.getString("date")?.trim() || "";
  const parsed = parseDateOption(dateRaw);
  if (dateRaw && !parsed) {
    await interaction.reply({
      content: "Date must look like **18/7/26** (D/M/YY).",
      ephemeral: true,
    });
    return;
  }

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      content: "Could not reach the changelogs channel. Check the channel ID and bot permissions.",
      ephemeral: true,
    });
    return;
  }

  const embed = buildChangelogEmbed({
    notes,
    version,
    author: interaction.user.tag,
    date: parsed || new Date(),
  });

  await channel.send({ embeds: [embed] });
  await interaction.reply({
    content: `Changelog posted in <#${channelId}>.`,
    ephemeral: true,
  });
}

/**
 * Programmatic post (agents / CI can call this later).
 * @param {import("discord.js").Client} client
 * @param {{ notes: string, version?: string, title?: string, author?: string, date?: Date | string }} payload
 */
async function postChangelog(client, payload) {
  const channelId = changelogChannelId();
  if (!channelId) return { ok: false, skipped: "no_channel" };
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return { ok: false, skipped: "bad_channel" };

  let date = new Date();
  if (payload.date instanceof Date) date = payload.date;
  else if (typeof payload.date === "string") date = parseDateOption(payload.date) || new Date();

  const embed = buildChangelogEmbed({
    notes: payload.notes || payload.title || "",
    version: payload.version || "",
    author: payload.author || "",
    date,
  });

  const msg = await channel.send({ embeds: [embed] });
  return { ok: true, messageId: msg.id };
}

module.exports = {
  buildChangelogCommand,
  handleChangelogCommand,
  postChangelog,
  canPostChangelog,
  formatChangelogDate,
  formatNotes,
  buildChangelogEmbed,
};
