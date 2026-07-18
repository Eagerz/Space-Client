"use strict";

const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const { canPostChangelog } = require("./changelog");
const { reviewsPanelEmbed, reviewsPanelRow } = require("./reviews");
const { suggestionsPanelEmbed, suggestionsPanelRow } = require("./suggestions");
const { ticketsPanelEmbed, ticketsPanelRow } = require("./tickets");

const ENV_PATH = path.join(__dirname, "..", "..", ".env");
const DEEP_SPACE = 0xc8cad4;
const DELETE_DELAY_MS = 350;

/** Roles created by /setup-server (if missing). Higher rank listed first for ordering. */
const ROLE_SPECS = [
  { name: "Eagerz1", env: "DISCORD_ROLE_EAGERZ1_ID", color: 0xe8eaef, hoist: true },
  { name: "Manager", env: "DISCORD_ROLE_MANAGER_ID", color: 0xd4d6de, hoist: true },
  { name: "SrAdmin", env: "DISCORD_ROLE_SRADMIN_ID", color: 0xc0c2cc, hoist: true },
  { name: "SrMod", env: "DISCORD_ROLE_SRMOD_ID", color: 0xacaeba, hoist: true },
  { name: "Mod", env: "DISCORD_ROLE_MOD_ID", color: 0x989aa8, hoist: true },
  { name: "Helper", env: "DISCORD_ROLE_HELPER_ID", color: 0x848692, hoist: true },
  { name: "Developers", env: "DISCORD_ROLE_DEVELOPERS_ID", color: 0x7a7c88, hoist: true },
  { name: "Staff", env: "DISCORD_STAFF_ROLE_ID", color: 0xc8cad4, hoist: true },
];

/** Ticket category → staff role env keys that may view. */
const TICKET_CAT_SPECS = [
  {
    emoji: "📁",
    name: "GENERAL",
    env: "DISCORD_TICKET_CAT_GENERAL_ID",
    roleEnvs: ["DISCORD_ROLE_HELPER_ID", "DISCORD_ROLE_MOD_ID", "DISCORD_ROLE_SRMOD_ID"],
  },
  {
    emoji: "📁",
    name: "REFUNDS",
    env: "DISCORD_TICKET_CAT_REFUNDS_ID",
    roleEnvs: ["DISCORD_ROLE_SRADMIN_ID", "DISCORD_ROLE_EAGERZ1_ID", "DISCORD_ROLE_MANAGER_ID"],
  },
  {
    emoji: "📁",
    name: "BUG-REPORTS",
    env: "DISCORD_TICKET_CAT_BUG_ID",
    roleEnvs: ["DISCORD_ROLE_DEVELOPERS_ID"],
  },
  {
    emoji: "📁",
    name: "MANAGER-SUPPORT",
    env: "DISCORD_TICKET_CAT_MANAGER_ID",
    roleEnvs: ["DISCORD_ROLE_MANAGER_ID"],
  },
  {
    emoji: "📁",
    name: "PURCHASE-SUPPORT",
    env: "DISCORD_TICKET_CAT_PURCHASE_ID",
    roleEnvs: ["DISCORD_ROLE_SRADMIN_ID", "DISCORD_ROLE_MANAGER_ID"],
  },
];

function channelName(emoji, name) {
  return `${emoji}│${name}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function upsertEnv(key, value) {
  let text = "";
  try {
    text = fs.readFileSync(ENV_PATH, "utf8");
  } catch {
    text = "";
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    text = `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(ENV_PATH, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  process.env[key] = String(value);
}

function setupPassword() {
  return String(process.env.DISCORD_SETUP_PASSWORD || "").trim();
}

function buildSetupServerCommand() {
  return new SlashCommandBuilder()
    .setName("setup-server")
    .setDescription("Wipe & recreate Apex Launcher Discord layout (password required)")
    .addStringOption((opt) =>
      opt
        .setName("password")
        .setDescription("Setup password from backend .env (DISCORD_SETUP_PASSWORD)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
}

/**
 * @param {import("discord.js").Guild} guild
 * @param {string[]} roleIds
 * @param {string} botId
 */
function privateCategoryOverwrites(guild, roleIds, botId) {
  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];
  const seen = new Set([guild.id, botId]);
  for (const rid of roleIds) {
    if (!rid || seen.has(rid)) continue;
    seen.add(rid);
    overwrites.push({
      id: rid,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }
  return overwrites;
}

/**
 * Delete every channel in the guild (children before categories).
 * @param {import("discord.js").Guild} guild
 */
async function wipeAllChannels(guild) {
  await guild.channels.fetch().catch(() => null);
  const all = [...guild.channels.cache.values()];
  const nonCategories = all.filter((c) => c.type !== ChannelType.GuildCategory);
  const categories = all.filter((c) => c.type === ChannelType.GuildCategory);

  let deleted = 0;
  for (const ch of nonCategories) {
    try {
      await ch.delete("Apex Launcher /setup-server wipe");
      deleted += 1;
      await sleep(DELETE_DELAY_MS);
    } catch (err) {
      console.warn(`[discord-bot/setup] delete ${ch.name}:`, err?.message || err);
    }
  }
  for (const ch of categories) {
    try {
      await ch.delete("Apex Launcher /setup-server wipe");
      deleted += 1;
      await sleep(DELETE_DELAY_MS);
    } catch (err) {
      console.warn(`[discord-bot/setup] delete category ${ch.name}:`, err?.message || err);
    }
  }
  return deleted;
}

/**
 * @param {import("discord.js").Guild} guild
 * @param {Map<string, string>} roleIdsByEnv
 */
async function ensureRoles(guild, roleIdsByEnv) {
  const created = [];
  const reused = [];
  /** @type {import("discord.js").Role[]} */
  const rolesInOrder = [];

  for (const spec of ROLE_SPECS) {
    let role = guild.roles.cache.find((r) => r.name === spec.name);
    if (!role) {
      role = await guild.roles.create({
        name: spec.name,
        color: spec.color ?? DEEP_SPACE,
        mentionable: true,
        hoist: spec.hoist !== false,
        reason: "Apex Launcher /setup-server",
      });
      created.push(`@${spec.name}`);
      await sleep(250);
    } else {
      // Keep existing roles in sync (mentionable + hoist) without wiping perms
      await role
        .edit({
          mentionable: true,
          hoist: spec.hoist !== false,
          reason: "Apex Launcher /setup-server sync",
        })
        .catch(() => {});
      reused.push(`@${spec.name}`);
    }
    roleIdsByEnv.set(spec.env, role.id);
    upsertEnv(spec.env, role.id);
    rolesInOrder.push(role);
  }

  // Stack roles under the bot's highest role (best-effort)
  const me = guild.members.me;
  const botTop = me?.roles?.highest;
  if (botTop && rolesInOrder.length) {
    let position = Math.max(1, botTop.position - 1);
    for (const role of rolesInOrder) {
      if (role.managed || role.id === guild.id) continue;
      try {
        await role.setPosition(position, { reason: "Apex Launcher /setup-server hierarchy" });
        position = Math.max(1, position - 1);
        await sleep(200);
      } catch (err) {
        console.warn(`[discord-bot/setup] role position ${role.name}:`, err?.message || err);
      }
    }
  }

  return { created, reused, rolesInOrder };
}

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function handleSetupServer(interaction) {
  const expected = setupPassword();
  const provided = String(interaction.options.getString("password", true) || "").trim();

  if (!expected) {
    await interaction.reply({
      content: "`DISCORD_SETUP_PASSWORD` is not set in the backend `.env`. Set it locally first.",
      ephemeral: true,
    });
    return;
  }

  if (provided !== expected) {
    await interaction.reply({
      content: "Incorrect setup password.",
      ephemeral: true,
    });
    return;
  }

  if (!canPostChangelog(interaction.member)) {
    await interaction.reply({
      content: "You need **Administrator** / Manage Server to run `/setup-server`.",
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Run this in a server.", ephemeral: true });
    return;
  }

  const me = guild.members.me;
  const perms = me?.permissions;
  if (
    !perms?.has(PermissionFlagsBits.Administrator) &&
    !(perms?.has(PermissionFlagsBits.ManageChannels) && perms?.has(PermissionFlagsBits.ManageRoles))
  ) {
    await interaction.reply({
      content: [
        "The **Apex Launcher** bot needs **Administrator** (or Manage Channels + Manage Roles).",
        "Re-invite it with Administrator checked, then run `/setup-server` again.",
      ].join("\n"),
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const botId = me.user.id;
  const created = [];
  const ids = {};

  try {
    const wiped = await wipeAllChannels(guild);
    created.push(`(wiped ${wiped} channels)`);

    const roleIdsByEnv = new Map();
    const rolesResult = await ensureRoles(guild, roleIdsByEnv);
    created.push(...rolesResult.created);
    const roleMentions = ROLE_SPECS.map((s) => {
      const id = roleIdsByEnv.get(s.env);
      return id ? `<@&${id}>` : `@${s.name}`;
    }).join(" · ");

    const staffRoleId = roleIdsByEnv.get("DISCORD_STAFF_ROLE_ID");
    const allStaffRoleIds = ROLE_SPECS.map((s) => roleIdsByEnv.get(s.env)).filter(Boolean);

    /** @type {import("discord.js").CategoryChannel[]} */
    const categoryOrder = [];

    // ── 📌│IMPORTANT (top — announcements / feedback) ─────────────
    const important = await guild.channels.create({
      name: channelName("📌", "IMPORTANT"),
      type: ChannelType.GuildCategory,
      reason: "Apex Launcher /setup-server",
    });
    created.push(important.name);
    categoryOrder.push(important);

    const importantChannels = [
      {
        emoji: "📜",
        name: "changelogs",
        topic: "Update changelogs (/changelog)",
        env: "DISCORD_CHANGELOG_CHANNEL_ID",
      },
      {
        emoji: "📡",
        name: "status",
        topic: "Service status (/status)",
        env: "DISCORD_STATUS_CHANNEL_ID",
      },
      {
        emoji: "📋",
        name: "todos",
        topic: "Bot todos, roadmap & planned work",
        env: "DISCORD_TODOS_CHANNEL_ID",
      },
      {
        emoji: "⭐",
        name: "reviews",
        topic: "Leave a review (panel)",
        env: "DISCORD_REVIEWS_PANEL_CHANNEL_ID",
      },
      {
        emoji: "💡",
        name: "suggestions",
        topic: "Community suggestions (panel)",
        env: "DISCORD_SUGGESTIONS_CHANNEL_ID",
      },
      {
        emoji: "✅",
        name: "accepted-suggestions",
        topic: "Accepted suggestions",
        env: "DISCORD_ACCEPTED_SUGGESTIONS_CHANNEL_ID",
      },
    ];

    for (const spec of importantChannels) {
      const ch = await guild.channels.create({
        name: channelName(spec.emoji, spec.name),
        type: ChannelType.GuildText,
        parent: important.id,
        topic: spec.topic,
        reason: "Apex Launcher /setup-server",
      });
      created.push(ch.name);
      if (spec.env) {
        ids[spec.env] = ch.id;
        upsertEnv(spec.env, ch.id);
      }
      await sleep(200);
    }

    // ── 🚀│COMMUNITY (casual chat) ────────────────────────────────
    const community = await guild.channels.create({
      name: channelName("🚀", "COMMUNITY"),
      type: ChannelType.GuildCategory,
      reason: "Apex Launcher /setup-server",
    });
    created.push(community.name);
    categoryOrder.push(community);

    const communityChannels = [
      { emoji: "💬", name: "general", topic: "Community chat", env: null },
      { emoji: "🖼️", name: "media", topic: "Screenshots, clips & media", env: null },
      { emoji: "😂", name: "memes", topic: "Memes & shitposts", env: null },
      { emoji: "🤖", name: "bot-commands", topic: "Bot commands & spam", env: null },
      { emoji: "🎲", name: "off-topic", topic: "Anything else", env: null },
    ];

    for (const spec of communityChannels) {
      const ch = await guild.channels.create({
        name: channelName(spec.emoji, spec.name),
        type: ChannelType.GuildText,
        parent: community.id,
        topic: spec.topic,
        reason: "Apex Launcher /setup-server",
      });
      created.push(ch.name);
      await sleep(200);
    }

    // ── 🎫│SUPPORT (public panel) ─────────────────────────────────
    const supportCat = await guild.channels.create({
      name: channelName("🎫", "SUPPORT"),
      type: ChannelType.GuildCategory,
      reason: "Apex Launcher /setup-server",
    });
    created.push(supportCat.name);
    categoryOrder.push(supportCat);
    ids.DISCORD_TICKET_CATEGORY_ID = supportCat.id;
    upsertEnv("DISCORD_TICKET_CATEGORY_ID", supportCat.id);

    const ticketsPanel = await guild.channels.create({
      name: channelName("🎫", "tickets"),
      type: ChannelType.GuildText,
      parent: supportCat.id,
      topic: "Open a support ticket",
      reason: "Apex Launcher /setup-server",
    });
    created.push(ticketsPanel.name);
    ids.DISCORD_TICKETS_PANEL_CHANNEL_ID = ticketsPanel.id;
    upsertEnv("DISCORD_TICKETS_PANEL_CHANNEL_ID", ticketsPanel.id);

    // ── Private ticket type categories ────────────────────────────
    for (const spec of TICKET_CAT_SPECS) {
      const roleIds = [
        ...spec.roleEnvs.map((e) => roleIdsByEnv.get(e)).filter(Boolean),
        staffRoleId,
      ].filter(Boolean);

      const cat = await guild.channels.create({
        name: channelName(spec.emoji, spec.name),
        type: ChannelType.GuildCategory,
        permissionOverwrites: privateCategoryOverwrites(guild, roleIds, botId),
        reason: "Apex Launcher /setup-server",
      });
      created.push(cat.name);
      categoryOrder.push(cat);
      ids[spec.env] = cat.id;
      upsertEnv(spec.env, cat.id);
      await sleep(250);
    }

    // ── 🛡️│STAFF (private) ───────────────────────────────────────
    const staffCat = await guild.channels.create({
      name: channelName("🛡️", "STAFF"),
      type: ChannelType.GuildCategory,
      permissionOverwrites: privateCategoryOverwrites(guild, allStaffRoleIds, botId),
      reason: "Apex Launcher /setup-server",
    });
    created.push(staffCat.name);
    categoryOrder.push(staffCat);

    const staffChannels = [
      {
        emoji: "📢",
        name: "staff-announcements",
        topic: "Internal staff announcements",
        env: "DISCORD_STAFF_ANNOUNCEMENTS_CHANNEL_ID",
      },
      {
        emoji: "🛡️",
        name: "staff",
        topic: "Crash / ops alerts",
        env: "DISCORD_STAFF_CHANNEL_ID",
      },
      {
        emoji: "⭐",
        name: "staff-reviews",
        topic: "Submitted player reviews",
        env: "DISCORD_REVIEWS_CHANNEL_ID",
      },
      { emoji: "💬", name: "staff-chat", topic: "Staff chat", env: null },
    ];

    for (const spec of staffChannels) {
      const ch = await guild.channels.create({
        name: channelName(spec.emoji, spec.name),
        type: ChannelType.GuildText,
        parent: staffCat.id,
        topic: spec.topic,
        reason: "Apex Launcher /setup-server",
      });
      created.push(ch.name);
      if (spec.env) {
        ids[spec.env] = ch.id;
        upsertEnv(spec.env, ch.id);
      }
      await sleep(200);
    }

    // ── 🔊│VOICE (always bottom) ──────────────────────────────────
    const voiceCat = await guild.channels.create({
      name: channelName("🔊", "VOICE"),
      type: ChannelType.GuildCategory,
      reason: "Apex Launcher /setup-server",
    });
    created.push(voiceCat.name);
    categoryOrder.push(voiceCat);

    for (const spec of [
      { emoji: "🔊", name: "general" },
      { emoji: "🎧", name: "media" },
      { emoji: "🎮", name: "gaming" },
    ]) {
      const ch = await guild.channels.create({
        name: channelName(spec.emoji, spec.name),
        type: ChannelType.GuildVoice,
        parent: voiceCat.id,
        reason: "Apex Launcher /setup-server",
      });
      created.push(ch.name);
      await sleep(200);
    }

    // Lock category order: IMPORTANT → COMMUNITY → SUPPORT → tickets → STAFF → VOICE
    for (let i = 0; i < categoryOrder.length; i++) {
      try {
        await categoryOrder[i].setPosition(i, { reason: "Apex Launcher /setup-server order" });
        await sleep(150);
      } catch (err) {
        console.warn(
          `[discord-bot/setup] category position ${categoryOrder[i].name}:`,
          err?.message || err
        );
      }
    }

    upsertEnv("DISCORD_GUILD_ID", guild.id);
    ids.DISCORD_GUILD_ID = guild.id;

    // Seed todos channel with a starter board
    const todosId = ids.DISCORD_TODOS_CHANNEL_ID;
    if (todosId) {
      const todosCh = await guild.channels.fetch(todosId).catch(() => null);
      if (todosCh?.isTextBased()) {
        await todosCh
          .send({
            embeds: [
              new EmbedBuilder()
                .setTitle("Apex Launcher — Todos")
                .setColor(DEEP_SPACE)
                .setDescription(
                  [
                    "Bot / staff roadmap lives here.",
                    "",
                    "**In progress**",
                    "• _(add items)_",
                    "",
                    "**Up next**",
                    "• _(add items)_",
                    "",
                    "**Done**",
                    "• Server layout + tickets bot",
                  ].join("\n")
                )
                .setFooter({ text: "Apex Launcher · Todos" }),
            ],
          })
          .catch((err) => console.warn("[discord-bot/setup] todos seed:", err?.message || err));
      }
    }

    // ── Panels (tickets / reviews / suggestions) ──────────────────
    const panelPosts = [];

    async function postPanel(label, channelId, payload) {
      if (!channelId) {
        panelPosts.push(`${label}: skipped (no channel id)`);
        return;
      }
      const ch = await guild.channels.fetch(channelId).catch((err) => {
        console.warn(`[discord-bot/setup] fetch ${label}:`, err?.message || err);
        return null;
      });
      if (!ch?.isTextBased()) {
        panelPosts.push(`${label}: channel not text-based`);
        return;
      }
      try {
        await ch.send(payload);
        panelPosts.push(`${label}: posted in <#${channelId}>`);
      } catch (err) {
        console.error(`[discord-bot/setup] post ${label}:`, err?.message || err);
        panelPosts.push(`${label}: failed — ${err?.message || String(err)}`);
      }
    }

    await postPanel("Tickets", ids.DISCORD_TICKETS_PANEL_CHANNEL_ID, {
      embeds: [ticketsPanelEmbed()],
      components: [ticketsPanelRow()],
    });
    await postPanel("Reviews", ids.DISCORD_REVIEWS_PANEL_CHANNEL_ID, {
      embeds: [reviewsPanelEmbed()],
      components: [reviewsPanelRow()],
    });
    await postPanel("Suggestions", ids.DISCORD_SUGGESTIONS_CHANNEL_ID, {
      embeds: [suggestionsPanelEmbed()],
      components: [suggestionsPanelRow()],
    });

    const embed = new EmbedBuilder()
      .setTitle("Apex Launcher — Server setup complete")
      .setColor(DEEP_SPACE)
      .setDescription(
        [
          "All previous channels were **deleted** and the Apex Launcher layout was recreated.",
          "Channel / role / category IDs were written to `backend/.env`.",
          "",
          "**Restart the backend** so slash commands and tickets pick up the new env values.",
          "Then try `/changelog`, `/status`, open a ticket, leave a review, or post a suggestion.",
        ].join("\n")
      )
      .addFields(
        {
          name: "Key channels",
          value: [
            ids.DISCORD_CHANGELOG_CHANNEL_ID
              ? `<#${ids.DISCORD_CHANGELOG_CHANNEL_ID}> → changelogs`
              : null,
            ids.DISCORD_STATUS_CHANNEL_ID
              ? `<#${ids.DISCORD_STATUS_CHANNEL_ID}> → status`
              : null,
            ids.DISCORD_TICKETS_PANEL_CHANNEL_ID
              ? `<#${ids.DISCORD_TICKETS_PANEL_CHANNEL_ID}> → tickets panel`
              : null,
            ids.DISCORD_REVIEWS_PANEL_CHANNEL_ID
              ? `<#${ids.DISCORD_REVIEWS_PANEL_CHANNEL_ID}> → reviews panel`
              : null,
            ids.DISCORD_REVIEWS_CHANNEL_ID
              ? `<#${ids.DISCORD_REVIEWS_CHANNEL_ID}> → staff reviews`
              : null,
            ids.DISCORD_STAFF_CHANNEL_ID
              ? `<#${ids.DISCORD_STAFF_CHANNEL_ID}> → staff / crashes`
              : null,
            staffRoleId ? `Staff role → <@&${staffRoleId}>` : null,
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 1024),
        },
        {
          name: "Staff roles",
          value: (roleMentions || "—").slice(0, 1024),
        },
        {
          name: "Created",
          value: created.map((n) => `\`${n}\``).join(", ").slice(0, 1024) || "—",
        },
        {
          name: "Panels",
          value: (panelPosts.join("\n") || "—").slice(0, 1024),
        }
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[discord-bot/setup-server]", err?.message || err);
    await interaction.editReply({
      content: `Setup failed: ${err?.message || String(err)}`,
    }).catch(() => {});
  }
}

module.exports = {
  buildSetupServerCommand,
  handleSetupServer,
  ROLE_SPECS,
  TICKET_CAT_SPECS,
};
