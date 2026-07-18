"use strict";

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

const DEEP_SPACE = 0xc8cad4;

/** Public panel channel (⭐│reviews). Falls back to staff reviews channel. */
function reviewsPanelChannelId() {
  return (
    String(process.env.DISCORD_REVIEWS_PANEL_CHANNEL_ID || "").trim() ||
    String(process.env.DISCORD_REVIEWS_CHANNEL_ID || "").trim()
  );
}

/** Where submitted review embeds are posted (⭐│staff-reviews). */
function reviewsDestinationChannelId() {
  return String(process.env.DISCORD_REVIEWS_CHANNEL_ID || "").trim();
}

function buildSetupReviewsCommand() {
  return new SlashCommandBuilder()
    .setName("setup-reviews")
    .setDescription("Post the reviews panel embed in the public reviews channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

function reviewsPanelEmbed() {
  return new EmbedBuilder()
    .setTitle("Apex Launcher — Reviews")
    .setColor(DEEP_SPACE)
    .setDescription(
      [
        "Share how Apex Launcher is working for you.",
        "",
        "Click a button below — you’ll get a **private form only you can see**.",
        "Tell us your **rating (1–10)** and **why**.",
      ].join("\n")
    )
    .setFooter({ text: "Honest feedback helps us improve" });
}

function reviewsPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sc_review_positive")
      .setLabel("Leave a positive review")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("sc_review_negative")
      .setLabel("Leave a negative review")
      .setStyle(ButtonStyle.Danger)
  );
}

function reviewModal(kind) {
  const positive = kind === "positive";
  const modal = new ModalBuilder()
    .setCustomId(positive ? "sc_review_modal_positive" : "sc_review_modal_negative")
    .setTitle(positive ? "Positive review" : "Negative review");

  const rating = new TextInputBuilder()
    .setCustomId("rating")
    .setLabel("Rating out of 10")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. 8")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2);

  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Reason why")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("What did you like or dislike?")
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(rating),
    new ActionRowBuilder().addComponents(reason)
  );
  return modal;
}

function parseRating(raw) {
  const n = Number(String(raw || "").trim());
  if (!Number.isFinite(n) || n < 1 || n > 10 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleReviewButton(interaction) {
  const id = interaction.customId;
  if (id === "sc_review_positive") {
    await interaction.showModal(reviewModal("positive"));
    return true;
  }
  if (id === "sc_review_negative") {
    await interaction.showModal(reviewModal("negative"));
    return true;
  }
  return false;
}

/**
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 */
async function handleReviewModal(interaction) {
  const id = interaction.customId || "";
  if (!id.startsWith("sc_review_modal_")) return false;

  const positive = id.endsWith("positive");
  const rating = parseRating(interaction.fields.getTextInputValue("rating"));
  const reason = String(interaction.fields.getTextInputValue("reason") || "").trim();

  if (rating == null) {
    await interaction.reply({
      content: "Rating must be a whole number from **1** to **10**.",
      ephemeral: true,
    });
    return true;
  }

  const channelId = reviewsDestinationChannelId() || reviewsPanelChannelId();
  const channel =
    (channelId && (await interaction.client.channels.fetch(channelId).catch(() => null))) ||
    null;

  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      content: "Could not post your review — reviews channel unavailable.",
      ephemeral: true,
    });
    return true;
  }

  const stars = "★".repeat(rating) + "☆".repeat(10 - rating);
  const embed = new EmbedBuilder()
    .setTitle(positive ? "Positive review" : "Negative review")
    .setColor(positive ? 0x22c55e : 0xef4444)
    .setDescription(reason.slice(0, 2000))
    .addFields(
      { name: "Rating", value: `**${rating}/10**\n${stars}`, inline: true },
      { name: "From", value: `${interaction.user}`, inline: true }
    )
    .setTimestamp(new Date())
    .setFooter({ text: "Apex Launcher Reviews" });

  await channel.send({ embeds: [embed] });
  await interaction.reply({
    content: "Thanks — your review was posted.",
    ephemeral: true,
  });
  return true;
}

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function handleSetupReviews(interaction) {
  if (!canPostChangelog(interaction.member)) {
    await interaction.reply({
      content: "You need Manage Server / Admin to set up the reviews panel.",
      ephemeral: true,
    });
    return;
  }

  const channelId = reviewsPanelChannelId();
  if (!channelId) {
    await interaction.reply({
      content:
        "Set `DISCORD_REVIEWS_PANEL_CHANNEL_ID` (or `DISCORD_REVIEWS_CHANNEL_ID`) in the backend `.env` first.",
      ephemeral: true,
    });
    return;
  }

  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({
      content: "Could not reach the reviews panel channel.",
      ephemeral: true,
    });
    return;
  }

  await channel.send({
    embeds: [reviewsPanelEmbed()],
    components: [reviewsPanelRow()],
  });
  await interaction.reply({
    content: `Reviews panel posted in <#${channelId}>.`,
    ephemeral: true,
  });
}

module.exports = {
  buildSetupReviewsCommand,
  handleSetupReviews,
  handleReviewButton,
  handleReviewModal,
  reviewsPanelEmbed,
  reviewsPanelRow,
  reviewsPanelChannelId,
  reviewsDestinationChannelId,
};
