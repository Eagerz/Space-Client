"use strict";

const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { canPostChangelog } = require("./changelog");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const VOTES_FILE = path.join(DATA_DIR, "suggestion-votes.json");

function suggestionsChannelId() {
  return String(process.env.DISCORD_SUGGESTIONS_CHANNEL_ID || "").trim();
}

function acceptedChannelId() {
  return String(process.env.DISCORD_ACCEPTED_SUGGESTIONS_CHANNEL_ID || "").trim();
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadVotes() {
  try {
    if (!fs.existsSync(VOTES_FILE)) return {};
    return JSON.parse(fs.readFileSync(VOTES_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

function saveVotes(data) {
  ensureDataDir();
  fs.writeFileSync(VOTES_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function getVoteState(messageId) {
  const all = loadVotes();
  const entry = all[messageId] || { up: [], down: [], status: "open" };
  entry.up = Array.isArray(entry.up) ? entry.up : [];
  entry.down = Array.isArray(entry.down) ? entry.down : [];
  entry.status = entry.status || "open";
  return entry;
}

function setVoteState(messageId, entry) {
  const all = loadVotes();
  all[messageId] = entry;
  saveVotes(all);
}

function buildSetupSuggestionsCommand() {
  return new SlashCommandBuilder()
    .setName("setup-suggestions")
    .setDescription("Post the suggestions panel embed in the suggestions channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

function suggestionsPanelEmbed() {
  return new EmbedBuilder()
    .setTitle("Apex Launcher — Suggestions")
    .setColor(0xc8cad4)
    .setDescription(
      [
        "Got an idea for Apex Launcher?",
        "",
        "Click **Leave a suggestion** — you’ll get a **private form only you can see**.",
        "The community can **upvote / downvote**. Staff can **accept** or **deny**.",
        "Accepted ideas are posted to the accepted-suggestions channel.",
      ].join("\n")
    )
    .setFooter({ text: "One clear idea per suggestion works best" });
}

function suggestionsPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sc_suggestion_open")
      .setLabel("Leave a suggestion")
      .setStyle(ButtonStyle.Primary)
  );
}

function suggestionModal() {
  const modal = new ModalBuilder()
    .setCustomId("sc_suggestion_modal")
    .setTitle("Leave a suggestion");

  const title = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Short title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. Animated cape preview in-game")
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(100);

  const details = new TextInputBuilder()
    .setCustomId("details")
    .setLabel("Your suggestion")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Describe the idea and why it helps…")
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(details)
  );
  return modal;
}

function voteCounts(entry) {
  return { up: entry.up.length, down: entry.down.length, score: entry.up.length - entry.down.length };
}

function suggestionComponents(status = "open") {
  const closed = status !== "open";
  const voteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sc_sug_up")
      .setLabel("Upvote")
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId("sc_sug_down")
      .setLabel("Downvote")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(closed)
  );

  const adminRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sc_sug_accept")
      .setLabel("Accept")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId("sc_sug_deny")
      .setLabel("Deny")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed)
  );

  return [voteRow, adminRow];
}

function buildSuggestionEmbed({ title, details, authorTag, authorId, up, down, status, staffNote }) {
  const score = up - down;
  const statusLine =
    status === "accepted"
      ? "✅ **Accepted**"
      : status === "denied"
        ? "❌ **Denied**"
        : "⏳ Open for votes";

  const embed = new EmbedBuilder()
    .setTitle(String(title).slice(0, 256))
    .setColor(
      status === "accepted" ? 0x22c55e : status === "denied" ? 0x64748b : 0xc8cad4
    )
    .setDescription(String(details).slice(0, 3500))
    .addFields(
      { name: "From", value: authorId ? `<@${authorId}>` : authorTag || "Unknown", inline: true },
      { name: "Votes", value: `👍 **${up}** · 👎 **${down}** · score **${score}**`, inline: true },
      { name: "Status", value: statusLine, inline: true }
    )
    .setTimestamp(new Date())
    .setFooter({ text: "Apex Launcher Suggestions" });

  if (staffNote) {
    embed.addFields({ name: "Staff", value: staffNote.slice(0, 500), inline: false });
  }
  return embed;
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleSuggestionButton(interaction) {
  const id = interaction.customId || "";

  if (id === "sc_suggestion_open") {
    await interaction.showModal(suggestionModal());
    return true;
  }

  if (id === "sc_sug_up" || id === "sc_sug_down") {
    await handleVote(interaction, id === "sc_sug_up" ? "up" : "down");
    return true;
  }

  if (id === "sc_sug_accept" || id === "sc_sug_deny") {
    await handleModeration(interaction, id === "sc_sug_accept" ? "accepted" : "denied");
    return true;
  }

  return false;
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleVote(interaction, direction) {
  const message = interaction.message;
  const entry = getVoteState(message.id);
  if (entry.status !== "open") {
    await interaction.reply({ content: "This suggestion is closed.", ephemeral: true });
    return;
  }

  const userId = interaction.user.id;
  entry.up = entry.up.filter((id) => id !== userId);
  entry.down = entry.down.filter((id) => id !== userId);
  if (direction === "up") entry.up.push(userId);
  else entry.down.push(userId);
  setVoteState(message.id, entry);

  const { up, down } = voteCounts(entry);
  const old = message.embeds[0];
  const title = old?.title || "Suggestion";
  const details = old?.description || "";
  const authorField = old?.fields?.find((f) => f.name === "From");
  const authorMention = authorField?.value || "Unknown";
  const authorId = authorMention.match(/^<@!?(\d+)>$/)?.[1];

  const embed = buildSuggestionEmbed({
    title,
    details,
    authorId,
    authorTag: authorMention,
    up,
    down,
    status: "open",
  });

  await message.edit({ embeds: [embed], components: suggestionComponents("open") });
  await interaction.reply({
    content: direction === "up" ? "Upvoted." : "Downvoted.",
    ephemeral: true,
  });
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleModeration(interaction, status) {
  if (!canPostChangelog(interaction.member)) {
    await interaction.reply({
      content: "Only Admin+ (Manage Server / Admin role) can accept or deny suggestions.",
      ephemeral: true,
    });
    return;
  }

  const message = interaction.message;
  const entry = getVoteState(message.id);
  if (entry.status !== "open") {
    await interaction.reply({ content: "Already moderated.", ephemeral: true });
    return;
  }

  entry.status = status;
  setVoteState(message.id, entry);
  const { up, down } = voteCounts(entry);

  const old = message.embeds[0];
  const title = old?.title || "Suggestion";
  const details = old?.description || "";
  const authorField = old?.fields?.find((f) => f.name === "From");
  const authorMention = authorField?.value || "Unknown";
  const authorId = authorMention.match(/^<@!?(\d+)>$/)?.[1];
  const staffNote = `${status === "accepted" ? "Accepted" : "Denied"} by ${interaction.user}`;

  const embed = buildSuggestionEmbed({
    title,
    details,
    authorId,
    authorTag: authorMention,
    up,
    down,
    status,
    staffNote,
  });

  await message.edit({ embeds: [embed], components: suggestionComponents(status) });

  if (status === "accepted") {
    const destId = acceptedChannelId();
    if (destId) {
      const dest = await interaction.client.channels.fetch(destId).catch(() => null);
      if (dest && dest.isTextBased()) {
        const acceptedEmbed = EmbedBuilder.from(embed)
          .setTitle(`✅ Accepted — ${title}`.slice(0, 256))
          .setColor(0x22c55e);
        await dest.send({
          content: `Accepted suggestion from ${authorMention}`,
          embeds: [acceptedEmbed],
        });
      }
    }
  }

  await interaction.reply({
    content:
      status === "accepted"
        ? "Suggestion accepted" + (acceptedChannelId() ? " and sent to the accepted channel." : ".")
        : "Suggestion denied.",
    ephemeral: true,
  });
}

/**
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 */
async function handleSuggestionModal(interaction) {
  if (interaction.customId !== "sc_suggestion_modal") return false;

  const title = String(interaction.fields.getTextInputValue("title") || "").trim();
  const details = String(interaction.fields.getTextInputValue("details") || "").trim();

  const channelId = suggestionsChannelId();
  const channel =
    (channelId && (await interaction.client.channels.fetch(channelId).catch(() => null))) ||
    interaction.channel;

  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      content: "Could not post — suggestions channel unavailable.",
      ephemeral: true,
    });
    return true;
  }

  const embed = buildSuggestionEmbed({
    title,
    details,
    authorId: interaction.user.id,
    authorTag: interaction.user.tag,
    up: 0,
    down: 0,
    status: "open",
  });

  const msg = await channel.send({
    embeds: [embed],
    components: suggestionComponents("open"),
  });
  setVoteState(msg.id, { up: [], down: [], status: "open" });

  await interaction.reply({
    content: "Suggestion posted — others can vote, and staff can accept or deny it.",
    ephemeral: true,
  });
  return true;
}

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function handleSetupSuggestions(interaction) {
  if (!canPostChangelog(interaction.member)) {
    await interaction.reply({
      content: "You need Manage Server / Admin to set up the suggestions panel.",
      ephemeral: true,
    });
    return;
  }

  const channelId = suggestionsChannelId();
  if (!channelId) {
    await interaction.reply({
      content: "Set `DISCORD_SUGGESTIONS_CHANNEL_ID` in the backend `.env` first.",
      ephemeral: true,
    });
    return;
  }

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      content: "Could not reach the suggestions channel.",
      ephemeral: true,
    });
    return;
  }

  await channel.send({
    embeds: [suggestionsPanelEmbed()],
    components: [suggestionsPanelRow()],
  });
  await interaction.reply({
    content: `Suggestions panel posted in <#${channelId}>.`,
    ephemeral: true,
  });
}

module.exports = {
  buildSetupSuggestionsCommand,
  handleSetupSuggestions,
  handleSuggestionButton,
  handleSuggestionModal,
};
