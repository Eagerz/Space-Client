"use strict";

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { getClient, isReady, ensureClient, botEnabled } = require("./client");
const crashCases = require("../crash-cases");
const playerDb = require("../player-db");
const { createStaffBugTicket } = require("./tickets");

const PRESET_DM_TIPS = {
  suggest_more_ram: "Increase allocated RAM in Settings (try 6–8 GB), then relaunch Apex Launcher.",
  suggest_relogin: "Sign out and sign back in with Microsoft on the Account page, then relaunch.",
  suggest_gpu_drivers: "Update GPU drivers and close overlays (Discord, GeForce Experience), then relaunch.",
};

function getStaffChannelId() {
  return String(process.env.DISCORD_STAFF_CHANNEL_ID || "").trim();
}

function playerLabel(report = {}) {
  const p = report.player || {};
  const mc = p.minecraftUsername || report.minecraftUsername;
  const disc =
    p.discordUsername ||
    report.discordUsername ||
    (p.discordId || report.discordId ? `id:${p.discordId || report.discordId}` : null);
  if (mc && disc) return `**${mc}** · Discord \`${disc}\``;
  if (mc) return `**${mc}** (Minecraft)`;
  if (disc) return `Discord \`${disc}\``;
  return "_Unknown player — ask them for claim code / crash ID_";
}

function buildCrashEmbed(report = {}) {
  const diagnosis = String(report.diagnosis || "Unresolved crash").slice(0, 256);
  const crashId = String(report.crashId || "?").slice(0, 32);
  const fields = [
    {
      name: "Player",
      value: playerLabel(report).slice(0, 1024),
      inline: false,
    },
    {
      name: "Crash ID",
      value: `\`${crashId}\` — launcher polls this for staff fixes`,
      inline: false,
    },
    {
      name: "Diagnosis",
      value: diagnosis.slice(0, 1024),
      inline: false,
    },
    {
      name: "Confidence",
      value: String(report.confidence ?? "?"),
      inline: true,
    },
    {
      name: "AI source",
      value: String(report.source || "unknown"),
      inline: true,
    },
    {
      name: "Version / loader",
      value: `${report.version || "?"} / ${report.loader || "?"}`,
      inline: true,
    },
    {
      name: "Exit / platform",
      value: `${report.exitCode ?? "n/a"} · ${report.platform || "?"} · app ${report.appVersion || "?"}`,
      inline: false,
    },
  ];

  if (report.player?.minecraftUuid || report.minecraftUuid) {
    fields.push({
      name: "Minecraft UUID",
      value: `\`${report.player?.minecraftUuid || report.minecraftUuid}\``,
      inline: false,
    });
  }

  if (report.error) {
    fields.push({
      name: "Error",
      value: String(report.error).slice(0, 1000),
      inline: false,
    });
  }

  if (Array.isArray(report.tips) && report.tips.length) {
    fields.push({
      name: "AI tips for player",
      value: report.tips.map((t, i) => `${i + 1}. ${t}`).join("\n").slice(0, 1000),
      inline: false,
    });
  }

  if (Array.isArray(report.mods) && report.mods.length) {
    fields.push({
      name: "Mods folder",
      value: report.mods.slice(0, 25).join(", ").slice(0, 1000) || "(empty)",
      inline: false,
    });
  }

  if (Array.isArray(report.applied) && report.applied.length) {
    fields.push({
      name: "Actions already tried",
      value: report.applied
        .map((a) => `\`${a.action}\`${a.note ? ` — ${a.note}` : ""}`)
        .join("\n")
        .slice(0, 1000),
      inline: false,
    });
  }

  fields.push({
    name: "Contact player",
    value:
      "Do **not** rely on the launcher UI — **DM** them or **open a ticket**. Queue remote fixes still apply silently on their PC.",
    inline: false,
  });

  return new EmbedBuilder()
    .setTitle("Apex Launcher — AI recovery failed")
    .setColor(0xdc2626)
    .setDescription(
      String(report.summary || report.tips?.[0] || "Client could not auto-fix this crash.").slice(
        0,
        400
      )
    )
    .addFields(fields)
    .setTimestamp(new Date())
    .setFooter({ text: `Crash source: ${report.crashSource || "game"} · id ${crashId}` });
}

/**
 * @param {string} crashId
 */
function staffFixRows(crashId) {
  const id = String(crashId || "").slice(0, 32);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sc_crash_fix:${id}:clear_extra_mods`)
        .setLabel("Queue: clear mods")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`sc_crash_fix:${id}:clear_shader_caches`)
        .setLabel("Queue: shaders")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`sc_crash_fix:${id}:restage_fabric_injection`)
        .setLabel("Queue: restage Fabric")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`sc_crash_fix:${id}:clear_logs`)
        .setLabel("Queue: clear logs")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sc_crash_dm:${id}`)
        .setLabel("DM player")
        .setStyle(ButtonStyle.Success)
        .setEmoji("💬"),
      new ButtonBuilder()
        .setCustomId(`sc_crash_ticket:${id}`)
        .setLabel("Open ticket")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎫"),
      new ButtonBuilder()
        .setCustomId(`sc_crash_suggest:${id}:suggest_more_ram`)
        .setLabel("DM: more RAM")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`sc_crash_resolve:${id}`)
        .setLabel("Mark resolved")
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function staffCanFix(interaction) {
  if (!interaction.memberPermissions) return false;
  return (
    interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)
  );
}

/**
 * Post an unresolved crash report to the staff channel.
 * @returns {Promise<{ ok: boolean, skipped?: string, messageId?: string, crashId?: string, error?: string }>}
 */
async function reportCrash(report) {
  if (!botEnabled()) {
    return { ok: false, skipped: "no_token" };
  }

  if (!isReady()) {
    const started = await ensureClient();
    if (!started.ok && !isReady()) {
      return { ok: false, skipped: "bot_not_ready" };
    }
  }

  const client = getClient();
  const channelId = getStaffChannelId();
  if (!client || !channelId) {
    return { ok: false, skipped: channelId ? "bot_not_ready" : "no_channel" };
  }

  const crashId = String(report.crashId || crashCases.newCrashId()).slice(0, 32);
  const enriched = { ...report, crashId };
  const saved = crashCases.createCase(enriched);

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return { ok: false, skipped: "bad_channel", crashId };
    }

    const roleId = String(process.env.DISCORD_STAFF_ROLE_ID || "").trim();
    const content = roleId
      ? `<@&${roleId}> unresolved crash · \`${crashId}\``
      : `Unresolved crash · \`${crashId}\``;

    /** @type {import("discord.js").AttachmentBuilder[]} */
    const files = [];
    const logs = String(report.logsTail || report.logs || "").trim();
    if (logs) {
      files.push(
        new AttachmentBuilder(Buffer.from(logs, "utf8"), {
          name: `crash-${crashId}-logs.txt`,
        })
      );
    }

    const msg = await channel.send({
      content,
      embeds: [buildCrashEmbed(enriched)],
      components: staffFixRows(crashId),
      files,
      allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
    });

    crashCases.updateCase(crashId, { discordMessageId: msg.id });

    return { ok: true, messageId: msg.id, crashId: saved.crashId };
  } catch (err) {
    console.error("[discord-bot/crash] reportCrash failed:", err?.message || err);
    return { ok: false, error: err?.message || String(err), crashId };
  }
}

/**
 * Resolve Discord snowflake for DMs / tickets from case + optional staff input.
 * @param {object|null} entry
 * @param {string} [overrideId]
 */
function resolvePlayerDiscordId(entry, overrideId) {
  const fromInput = String(overrideId || "").replace(/\D/g, "");
  if (fromInput.length >= 16) return fromInput;
  const fromCase = String(entry?.player?.discordId || "").replace(/\D/g, "");
  if (fromCase.length >= 16) return fromCase;
  return null;
}

/**
 * @param {import("discord.js").Client} client
 * @param {string} discordId
 * @param {import("discord.js").EmbedBuilder|object} embedOrPayload
 */
async function dmDiscordUser(client, discordId, embedOrPayload) {
  const user = await client.users.fetch(discordId);
  const payload =
    embedOrPayload && typeof embedOrPayload.toJSON === "function"
      ? { embeds: [embedOrPayload] }
      : embedOrPayload;
  await user.send(payload);
  return user;
}

function tipEmbed(crashId, tip, staffTag) {
  return new EmbedBuilder()
    .setTitle("Apex Launcher — help from staff")
    .setColor(0x6366f1)
    .setDescription(String(tip).slice(0, 2000))
    .addFields({ name: "Crash ID", value: `\`${crashId}\``, inline: true })
    .setFooter({ text: staffTag ? `From ${staffTag}` : "Apex Launcher staff" })
    .setTimestamp(new Date());
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleCrashButton(interaction) {
  const id = interaction.customId || "";
  if (!id.startsWith("sc_crash_")) return false;

  if (!staffCanFix(interaction)) {
    await interaction.reply({
      content: "You need Manage Messages (or Manage Server) to handle crash actions.",
      ephemeral: true,
    });
    return true;
  }

  if (id.startsWith("sc_crash_dm:")) {
    const crashId = id.slice("sc_crash_dm:".length);
    const entry = crashCases.getCase(crashId);
    const known = String(entry?.player?.discordId || "").replace(/\D/g, "");
    const idInput = new TextInputBuilder()
      .setCustomId("discord_id")
      .setLabel("Player Discord user ID")
      .setStyle(TextInputStyle.Short)
      .setRequired(!known)
      .setMaxLength(32)
      .setPlaceholder("Right-click user → Copy User ID");
    if (known) idInput.setValue(known.slice(0, 32));

    const modal = new ModalBuilder()
      .setCustomId(`sc_crash_dm_modal:${crashId}`)
      .setTitle("DM player")
      .addComponents(
        new ActionRowBuilder().addComponents(idInput),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("tip")
            .setLabel("DM message")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
            .setPlaceholder("What should they try next?")
        )
      );
    await interaction.showModal(modal);
    return true;
  }

  if (id.startsWith("sc_crash_ticket:")) {
    const crashId = id.slice("sc_crash_ticket:".length);
    const entry = crashCases.getCase(crashId);
    const known = String(entry?.player?.discordId || "").replace(/\D/g, "");
    const idInput = new TextInputBuilder()
      .setCustomId("discord_id")
      .setLabel("Player Discord ID (optional)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(32)
      .setPlaceholder("Paste ID to add/ping them — or leave blank");
    if (known) idInput.setValue(known.slice(0, 32));

    const modal = new ModalBuilder()
      .setCustomId(`sc_crash_ticket_modal:${crashId}`)
      .setTitle("Open bug ticket")
      .addComponents(new ActionRowBuilder().addComponents(idInput));
    await interaction.showModal(modal);
    return true;
  }

  if (id.startsWith("sc_crash_resolve:")) {
    const crashId = id.slice("sc_crash_resolve:".length);
    const entry = crashCases.markResolved(crashId, interaction.user.tag);
    if (!entry) {
      await interaction.reply({ content: `Unknown crash \`${crashId}\`.`, ephemeral: true });
      return true;
    }
    await interaction.reply({
      content: `Marked \`${crashId}\` resolved by ${interaction.user}.`,
      ephemeral: false,
    });
    return true;
  }

  if (id.startsWith("sc_crash_fix:") || id.startsWith("sc_crash_suggest:")) {
    const parts = id.split(":");
    const crashId = parts[1];
    const action = parts[2];
    if (!crashCases.ALLOWED_ACTIONS.has(action) && !String(action).startsWith("suggest_")) {
      await interaction.reply({ content: "Unknown action.", ephemeral: true });
      return true;
    }

    // Preset tips → DM the player (no launcher message).
    if (String(action).startsWith("suggest_")) {
      const tip = PRESET_DM_TIPS[action] || "Please follow staff guidance and relaunch Apex Launcher.";
      const entry = crashCases.getCase(crashId);
      if (!entry) {
        await interaction.reply({ content: `Unknown crash \`${crashId}\`.`, ephemeral: true });
        return true;
      }
      const discordId = resolvePlayerDiscordId(entry);
      if (!discordId) {
        await interaction.reply({
          content: `No Discord ID on this crash — use **DM player** and paste their user ID, then send: ${tip}`,
          ephemeral: true,
        });
        return true;
      }
      try {
        const client = getClient();
        await dmDiscordUser(client, discordId, tipEmbed(crashId, tip, interaction.user.tag));
        crashCases.queueStaffFix(crashId, { tip, staffTag: interaction.user.tag, note: "dm_sent" });
        if (entry.player?.minecraftUuid) {
          // Store tip on case only — do not push launcher inbox tip.
        }
        await interaction.reply({
          content: `DM’d <@${discordId}> for \`${crashId}\` (${action}).`,
          ephemeral: false,
        });
      } catch (err) {
        await interaction.reply({
          content: `Could not DM <@${discordId}>: ${err?.message || err}. They may have DMs closed — open a ticket instead.`,
          ephemeral: true,
        });
      }
      return true;
    }

    const actions = [action];
    const entry = crashCases.queueStaffFix(crashId, {
      actions,
      tip: null,
      staffTag: interaction.user.tag,
    });
    if (!entry) {
      await interaction.reply({ content: `Unknown crash \`${crashId}\`.`, ephemeral: true });
      return true;
    }

    const mcUuid = entry.player?.minecraftUuid;
    if (mcUuid) {
      try {
        playerDb.queueStaffInbox(mcUuid, {
          actions,
          tip: null,
          queuedBy: interaction.user.tag,
        });
      } catch (err) {
        console.warn("[discord-crash] inbox queue failed:", err?.message || err);
      }
    }

    await interaction.reply({
      content: `Queued **${action}** for \`${crashId}\`${mcUuid ? " (+ silent player inbox)" : ""} — applies on their PC, no launcher popup.`,
      ephemeral: false,
    });
    return true;
  }

  return false;
}

/**
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleCrashModal(interaction) {
  const id = interaction.customId || "";
  if (
    !id.startsWith("sc_crash_tip_modal:") &&
    !id.startsWith("sc_crash_dm_modal:") &&
    !id.startsWith("sc_crash_ticket_modal:")
  ) {
    return false;
  }

  if (!staffCanFix(interaction)) {
    await interaction.reply({
      content: "You need Manage Messages (or Manage Server) for this.",
      ephemeral: true,
    });
    return true;
  }

  if (id.startsWith("sc_crash_ticket_modal:")) {
    const crashId = id.slice("sc_crash_ticket_modal:".length);
    const entry = crashCases.getCase(crashId);
    if (!entry) {
      await interaction.reply({ content: `Unknown crash \`${crashId}\`.`, ephemeral: true });
      return true;
    }
    if (!interaction.guild) {
      await interaction.reply({ content: "Open a ticket from a server channel.", ephemeral: true });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });
    const discordId = resolvePlayerDiscordId(
      entry,
      interaction.fields.getTextInputValue("discord_id")
    );
    if (discordId && entry.player) {
      entry.player.discordId = discordId;
      crashCases.updateCase(crashId, { player: entry.player });
    }

    const result = await createStaffBugTicket({
      guild: interaction.guild,
      staffUser: interaction.user,
      playerDiscordId: discordId,
      crashId,
      diagnosis: entry.diagnosis,
      summary: entry.summary,
      minecraftUsername: entry.player?.minecraftUsername,
      minecraftUuid: entry.player?.minecraftUuid,
      tips: entry.tips,
    });

    if (!result.ok) {
      await interaction.editReply({ content: result.error || "Could not create ticket." });
      return true;
    }

    await interaction.editReply({
      content: `Ticket opened: <#${result.channelId}>${discordId ? ` · player <@${discordId}>` : " · no player Discord ID (staff-only until you add them)"}`,
    });
    try {
      await interaction.followUp({
        content: `Ticket <#${result.channelId}> created for crash \`${crashId}\` by ${interaction.user}.`,
        ephemeral: false,
      });
    } catch {
      /* ignore */
    }
    return true;
  }

  // DM tip (new) + legacy tip modal id
  const crashId = id.startsWith("sc_crash_dm_modal:")
    ? id.slice("sc_crash_dm_modal:".length)
    : id.slice("sc_crash_tip_modal:".length);
  const tip = String(interaction.fields.getTextInputValue("tip") || "").trim();
  let discordIdInput = "";
  try {
    discordIdInput = interaction.fields.getTextInputValue("discord_id");
  } catch {
    discordIdInput = "";
  }

  const entry = crashCases.getCase(crashId);
  if (!entry) {
    await interaction.reply({ content: `Unknown crash \`${crashId}\`.`, ephemeral: true });
    return true;
  }

  const discordId = resolvePlayerDiscordId(entry, discordIdInput);
  if (!discordId) {
    await interaction.reply({
      content: "Need a Discord user ID to DM. Enable Developer Mode → right-click user → Copy User ID.",
      ephemeral: true,
    });
    return true;
  }

  if (entry.player) {
    entry.player.discordId = discordId;
    crashCases.updateCase(crashId, { player: entry.player });
  }

  try {
    const client = getClient();
    await dmDiscordUser(client, discordId, tipEmbed(crashId, tip, interaction.user.tag));
    crashCases.queueStaffFix(crashId, {
      tip,
      staffTag: interaction.user.tag,
      note: "dm_sent",
    });
    await interaction.reply({
      content: `DM’d <@${discordId}> for \`${crashId}\` — not shown in their launcher.`,
      ephemeral: false,
    });
  } catch (err) {
    await interaction.reply({
      content: `Could not DM <@${discordId}>: ${err?.message || err}. Try **Open ticket** instead.`,
      ephemeral: true,
    });
  }
  return true;
}

module.exports = {
  reportCrash,
  buildCrashEmbed,
  handleCrashButton,
  handleCrashModal,
  staffFixRows,
};
