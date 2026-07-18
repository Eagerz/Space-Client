"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { analyzeCrash, aiConfigured, getProvider } = require("../crash-ai");

const DEEP_SPACE = 0xc8cad4;
const AI_TIP_COLOR = 0x6366f1;
const PING_COOLDOWN_MS = 10 * 60 * 1000;
const AI_TIP_COOLDOWN_MS = 60 * 1000;
/** @type {Map<string, number>} channelId → last ping timestamp */
const pingCooldown = new Map();
/** @type {Map<string, number>} channelId → last AI tip timestamp */
const aiTipCooldown = new Map();

/** @typedef {"general"|"refunds"|"bug"|"manager"|"purchase"} TicketTypeKey */

/**
 * Typed ticket definitions — one button each (Discord max 5 / row).
 * Modal labels must be ≤45 chars (Discord limit).
 * @type {Record<TicketTypeKey, {
 *   key: TicketTypeKey,
 *   customId: string,
 *   modalId: string,
 *   label: string,
 *   emoji: string,
 *   style: import("discord.js").ButtonStyle,
 *   slug: string,
 *   title: string,
 *   categoryEnv: string,
 *   roleEnvs: string[],
 *   questions: { id: string, label: string, placeholder: string, style: "short"|"paragraph" }[],
 * }>}
 */
const TICKET_TYPES = {
  general: {
    key: "general",
    customId: "sc_ticket_open_general",
    modalId: "sc_ticket_modal_general",
    label: "General",
    emoji: "💬",
    style: ButtonStyle.Primary,
    slug: "general",
    title: "General Support",
    categoryEnv: "DISCORD_TICKET_CAT_GENERAL_ID",
    roleEnvs: ["DISCORD_ROLE_HELPER_ID", "DISCORD_ROLE_MOD_ID", "DISCORD_ROLE_SRMOD_ID"],
    questions: [
      {
        id: "q1",
        label: "What do you need help with?",
        placeholder: "Describe your issue…",
        style: "paragraph",
      },
      {
        id: "q2",
        label: "Launcher / MC version?",
        placeholder: "e.g. Apex Launcher 1.0 · Fabric 1.21.1",
        style: "short",
      },
      {
        id: "q3",
        label: "What have you already tried?",
        placeholder: "Steps you’ve tried so far…",
        style: "paragraph",
      },
    ],
  },
  refunds: {
    key: "refunds",
    customId: "sc_ticket_open_refunds",
    modalId: "sc_ticket_modal_refunds",
    label: "Refunds",
    emoji: "💸",
    style: ButtonStyle.Danger,
    slug: "refunds",
    title: "Refund Request",
    categoryEnv: "DISCORD_TICKET_CAT_REFUNDS_ID",
    roleEnvs: [
      "DISCORD_ROLE_SRADMIN_ID",
      "DISCORD_ROLE_EAGERZ1_ID",
      "DISCORD_ROLE_MANAGER_ID",
    ],
    questions: [
      {
        id: "q1",
        label: "Order / payment ID?",
        placeholder: "Stripe / receipt ID…",
        style: "short",
      },
      {
        id: "q2",
        label: "Purchase date?",
        placeholder: "e.g. 2026-07-01",
        style: "short",
      },
      {
        id: "q3",
        label: "Reason for refund request?",
        placeholder: "Why are you requesting a refund?",
        style: "paragraph",
      },
    ],
  },
  bug: {
    key: "bug",
    customId: "sc_ticket_open_bug",
    modalId: "sc_ticket_modal_bug",
    label: "Bug Report",
    emoji: "🐛",
    style: ButtonStyle.Secondary,
    slug: "bug",
    title: "Bug Report",
    categoryEnv: "DISCORD_TICKET_CAT_BUG_ID",
    roleEnvs: ["DISCORD_ROLE_DEVELOPERS_ID"],
    questions: [
      {
        id: "q1",
        label: "What happened vs expected?",
        placeholder: "What broke? What should happen?",
        style: "paragraph",
      },
      {
        id: "q2",
        label: "Version / OS?",
        placeholder: "e.g. Win 11 · Apex Launcher 1.0",
        style: "short",
      },
      {
        id: "q3",
        label: "Logs / steps to reproduce?",
        placeholder: "Paste steps or a log snippet…",
        style: "paragraph",
      },
    ],
  },
  manager: {
    key: "manager",
    customId: "sc_ticket_open_manager",
    modalId: "sc_ticket_modal_manager",
    label: "Manager",
    emoji: "👔",
    style: ButtonStyle.Primary,
    slug: "manager",
    title: "Manager Support",
    categoryEnv: "DISCORD_TICKET_CAT_MANAGER_ID",
    roleEnvs: ["DISCORD_ROLE_MANAGER_ID"],
    questions: [
      {
        id: "q1",
        label: "What do you need from management?",
        placeholder: "Describe your request…",
        style: "paragraph",
      },
      {
        id: "q2",
        label: "Any prior ticket ID?",
        placeholder: "Channel link or ID (or N/A)",
        style: "short",
      },
      {
        id: "q3",
        label: "Urgency?",
        placeholder: "Low / Medium / High — why?",
        style: "short",
      },
    ],
  },
  purchase: {
    key: "purchase",
    customId: "sc_ticket_open_purchase",
    modalId: "sc_ticket_modal_purchase",
    label: "Purchase",
    emoji: "🛒",
    style: ButtonStyle.Success,
    slug: "purchase",
    title: "Purchase Support",
    categoryEnv: "DISCORD_TICKET_CAT_PURCHASE_ID",
    roleEnvs: ["DISCORD_ROLE_SRADMIN_ID", "DISCORD_ROLE_MANAGER_ID"],
    questions: [
      {
        id: "q1",
        label: "What were you buying?",
        placeholder: "Credits pack, Space+, etc.",
        style: "short",
      },
      {
        id: "q2",
        label: "Error message?",
        placeholder: "Exact error or what went wrong…",
        style: "paragraph",
      },
      {
        id: "q3",
        label: "Account / email at checkout?",
        placeholder: "Email used for payment…",
        style: "short",
      },
    ],
  },
};

const OPEN_CUSTOM_IDS = new Set(Object.values(TICKET_TYPES).map((t) => t.customId));
const MODAL_CUSTOM_IDS = new Set(Object.values(TICKET_TYPES).map((t) => t.modalId));

function envId(key) {
  return String(process.env[key] || "").trim();
}

function staffRoleId() {
  return envId("DISCORD_STAFF_ROLE_ID");
}

function ticketCategoryIds() {
  return [
    envId("DISCORD_TICKET_CAT_GENERAL_ID"),
    envId("DISCORD_TICKET_CAT_REFUNDS_ID"),
    envId("DISCORD_TICKET_CAT_BUG_ID"),
    envId("DISCORD_TICKET_CAT_MANAGER_ID"),
    envId("DISCORD_TICKET_CAT_PURCHASE_ID"),
  ].filter(Boolean);
}

function isTicketChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  const cats = ticketCategoryIds();
  if (cats.length && channel.parentId && cats.includes(channel.parentId)) return true;
  const name = String(channel.name || "").toLowerCase();
  return name.startsWith("ticket-");
}

/**
 * @param {string} parentId
 * @returns {typeof TICKET_TYPES[TicketTypeKey] | null}
 */
function typeFromParent(parentId) {
  if (!parentId) return null;
  for (const t of Object.values(TICKET_TYPES)) {
    if (envId(t.categoryEnv) === parentId) return t;
  }
  return null;
}

/**
 * Roles listed for this ticket type (ping targets).
 * @param {typeof TICKET_TYPES[TicketTypeKey]} type
 * @returns {string[]}
 */
function roleIdsForType(type) {
  const ids = [];
  const seen = new Set();
  for (const key of type.roleEnvs) {
    const id = envId(key);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Roles that may view the ticket channel (type roles + Staff).
 * @param {typeof TICKET_TYPES[TicketTypeKey]} type
 * @returns {string[]}
 */
function viewRoleIdsForType(type) {
  const ids = roleIdsForType(type);
  const staff = staffRoleId();
  if (staff && !ids.includes(staff)) ids.push(staff);
  return ids;
}

function sanitizeUsername(name) {
  return (
    String(name || "user")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "user"
  );
}

function ticketsPanelEmbed() {
  return new EmbedBuilder()
    .setTitle("Apex Launcher — Support Tickets")
    .setColor(DEEP_SPACE)
    .setDescription(
      [
        "Need help? Pick a ticket type below.",
        "",
        "You’ll get a **private form** with a few questions.",
        "After you submit, a ticket opens and the right staff are pinged automatically.",
        "",
        "• **General** — launcher, gameplay, account",
        "• **Refunds** — payment / refund requests",
        "• **Bug Report** — crashes, broken features",
        "• **Manager** — escalate to management",
        "• **Purchase** — checkout / store issues",
      ].join("\n")
    )
    .setFooter({ text: "Apex Launcher · Support" });
}

function ticketsPanelRow() {
  return new ActionRowBuilder().addComponents(
    ...Object.values(TICKET_TYPES).map((t) =>
      new ButtonBuilder()
        .setCustomId(t.customId)
        .setLabel(t.label)
        .setEmoji(t.emoji)
        .setStyle(t.style)
    )
  );
}

/**
 * @param {typeof TICKET_TYPES[TicketTypeKey]} type
 */
function ticketModal(type) {
  const modal = new ModalBuilder()
    .setCustomId(type.modalId)
    .setTitle(type.title.slice(0, 45));

  for (const q of type.questions.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.style === "short" ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setPlaceholder(q.placeholder.slice(0, 100))
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(q.style === "short" ? 200 : 1000);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return modal;
}

/**
 * @param {typeof TICKET_TYPES[TicketTypeKey]} type
 * @param {Record<string, string>} answers
 * @param {string} userTag
 */
function answersEmbed(type, answers, userTag) {
  const fields = type.questions.map((q) => ({
    name: q.label,
    value: (answers[q.id] || "—").slice(0, 1024),
  }));

  return new EmbedBuilder()
    .setTitle(`Apex Launcher — ${type.title}`)
    .setColor(DEEP_SPACE)
    .setDescription(
      `Ticket from **${userTag || "user"}** — answers below. Staff have been notified.`
    )
    .addFields(fields)
    .setTimestamp(new Date())
    .setFooter({ text: "Apex Launcher · Support" });
}

/**
 * @param {typeof TICKET_TYPES[TicketTypeKey] | null} [type]
 */
function helpRow(type = null) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("sc_ticket_ping_staff")
      .setLabel("Ping staff again")
      .setStyle(ButtonStyle.Secondary)
  );
  if (type?.key === "bug") {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("sc_ticket_ai_tip")
        .setLabel("AI tip")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✨")
    );
  }
  return row;
}

/**
 * Collect intake embed fields + recent user messages for crash-ai.
 * @param {import("discord.js").TextChannel} channel
 */
async function collectTicketContext(channel) {
  const chunks = [];
  try {
    const messages = await channel.messages.fetch({ limit: 25 });
    const ordered = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    for (const msg of ordered) {
      for (const embed of msg.embeds || []) {
        if (embed.title && /Bug Report|Apex Launcher/i.test(embed.title)) {
          chunks.push(`Title: ${embed.title}`);
          if (embed.description) chunks.push(embed.description);
          for (const field of embed.fields || []) {
            chunks.push(`${field.name}: ${field.value}`);
          }
        }
      }
      if (msg.author && !msg.author.bot && msg.content) {
        chunks.push(`${msg.author.username}: ${msg.content}`);
      }
    }
  } catch (err) {
    console.error("[discord-bot/tickets] context fetch failed:", err?.message || err);
  }
  return chunks.join("\n").slice(-12000);
}

/**
 * @param {Awaited<ReturnType<typeof analyzeCrash>>} plan
 */
function aiTipEmbed(plan) {
  const tips = Array.isArray(plan.tips) && plan.tips.length
    ? plan.tips.map((t, i) => `${i + 1}. ${t}`).join("\n").slice(0, 1000)
    : plan.summary || "No tips returned.";
  const fields = [
    {
      name: "Diagnosis",
      value: String(plan.diagnosis || "Unknown").slice(0, 1024),
      inline: false,
    },
    {
      name: "Confidence",
      value: String(plan.confidence ?? "?"),
      inline: true,
    },
    {
      name: "AI source",
      value: String(plan.source || getProvider()),
      inline: true,
    },
    {
      name: "Tips",
      value: tips,
      inline: false,
    },
  ];
  if (Array.isArray(plan.actions) && plan.actions.length) {
    fields.push({
      name: "Suggested actions",
      value: plan.actions.map((a) => `\`${a}\``).join(", ").slice(0, 500),
      inline: false,
    });
  }
  return new EmbedBuilder()
    .setTitle("Apex Launcher — AI tip")
    .setColor(AI_TIP_COLOR)
    .setDescription(
      aiConfigured()
        ? "Cloud crash AI looked at this ticket’s intake + recent messages."
        : "Using **local heuristics** (set `GEMINI_API_KEY` or `OPENAI_API_KEY` in backend `.env` for cloud AI)."
    )
    .addFields(fields)
    .setTimestamp(new Date())
    .setFooter({ text: "Apex Launcher · Crash AI · not a substitute for staff" });
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleAiTip(interaction) {
  const channel = interaction.channel;
  if (!channel || !isTicketChannel(channel)) {
    await interaction.reply({
      content: "AI tip only works inside support tickets.",
      ephemeral: true,
    });
    return;
  }

  const type = typeFromParent(channel.parentId);
  if (type && type.key !== "bug") {
    await interaction.reply({
      content: "AI tip is available on **Bug Report** tickets (paste logs / steps there).",
      ephemeral: true,
    });
    return;
  }

  const channelId = interaction.channelId;
  const last = aiTipCooldown.get(channelId) || 0;
  const left = AI_TIP_COOLDOWN_MS - (Date.now() - last);
  if (left > 0) {
    await interaction.reply({
      content: `AI tip is on cooldown — try again in ~${Math.ceil(left / 1000)}s.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();
  aiTipCooldown.set(channelId, Date.now());

  try {
    const logs = await collectTicketContext(channel);
    if (!logs.trim()) {
      await interaction.editReply({
        content: "Could not read ticket context. Paste a log snippet and try again.",
      });
      return;
    }

    const plan = await analyzeCrash({
      logs,
      error: "Discord bug ticket",
      source: "discord-ticket",
      version: null,
      loader: null,
    });

    await interaction.editReply({ embeds: [aiTipEmbed(plan)] });
  } catch (err) {
    console.error("[discord-bot/tickets] AI tip failed:", err?.message || err);
    await interaction.editReply({
      content: `AI tip failed: ${err?.message || String(err)}`,
    });
  }
}

/**
 * @param {import("discord.js").Guild} guild
 * @param {import("discord.js").GuildMember | import("discord.js").User} opener
 * @param {typeof TICKET_TYPES[TicketTypeKey]} type
 * @param {string[]} staffRoleIds
 */
function ticketOverwrites(guild, opener, type, staffRoleIds) {
  const botId = guild.members.me?.id || guild.client.user?.id;
  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: opener.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];
  if (botId) {
    overwrites.push({
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
    });
  }
  const seen = new Set([guild.id, opener.id, botId].filter(Boolean));
  for (const rid of staffRoleIds) {
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
 * @param {import("discord.js").ButtonInteraction} interaction
 * @param {typeof TICKET_TYPES[TicketTypeKey]} type
 */
async function showTicketModal(interaction, type) {
  const categoryId = envId(type.categoryEnv);
  if (!categoryId) {
    await interaction.reply({
      content: `Ticket category for **${type.label}** is not configured. Run \`/setup-server\` first.`,
      ephemeral: true,
    });
    return;
  }
  await interaction.showModal(ticketModal(type));
}

/**
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 * @param {typeof TICKET_TYPES[TicketTypeKey]} type
 * @param {Record<string, string>} answers
 */
async function createTicketFromAnswers(interaction, type, answers) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Run this in a server.", ephemeral: true });
    return;
  }

  const categoryId = envId(type.categoryEnv);
  if (!categoryId) {
    await interaction.reply({
      content: `Ticket category for **${type.label}** is not configured. Run \`/setup-server\` first.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const pingRoles = roleIdsForType(type);
  const viewRoles = viewRoleIdsForType(type);
  const safe = sanitizeUsername(interaction.user.username);
  const channelName = `ticket-${type.slug}-${safe}`.slice(0, 100);

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `${type.title} · ${interaction.user.tag} (${interaction.user.id})`,
      permissionOverwrites: ticketOverwrites(guild, interaction.user, type, viewRoles),
      reason: `Apex Launcher ticket (${type.slug}) by ${interaction.user.tag}`,
    });
  } catch (err) {
    console.error("[discord-bot/tickets] create failed:", err?.message || err);
    await interaction.editReply({
      content: `Could not create ticket: ${err?.message || String(err)}`,
    });
    return;
  }

  const mentionRoles = pingRoles.filter(Boolean);
  const mentions =
    mentionRoles.length > 0
      ? mentionRoles.map((id) => `<@&${id}>`).join(" ")
      : "";

  await channel.send({
    content: `${interaction.user}${mentions ? ` · ${mentions}` : ""}`,
    allowedMentions: {
      users: [interaction.user.id],
      roles: mentionRoles,
    },
    embeds: [answersEmbed(type, answers, interaction.user.username)],
    components: [helpRow(type)],
  });

  pingCooldown.set(channel.id, Date.now());

  await interaction.editReply({
    content: `Ticket created: ${channel}`,
  });
}

/**
 * @param {import("discord.js").ButtonInteraction} interaction
 */
async function handleTicketButton(interaction) {
  const id = interaction.customId || "";

  if (OPEN_CUSTOM_IDS.has(id)) {
    const type = Object.values(TICKET_TYPES).find((t) => t.customId === id);
    if (!type) return;
    await showTicketModal(interaction, type);
    return;
  }

  if (!isTicketChannel(interaction.channel)) {
    await interaction.reply({
      content: "These buttons only work inside support tickets.",
      ephemeral: true,
    });
    return;
  }

  if (id === "sc_ticket_ping_staff") {
    const channelId = interaction.channelId;
    const last = pingCooldown.get(channelId) || 0;
    const left = PING_COOLDOWN_MS - (Date.now() - last);
    if (left > 0) {
      const mins = Math.ceil(left / 60000);
      await interaction.reply({
        content: `Staff was already pinged recently. Try again in ~${mins} min.`,
        ephemeral: true,
      });
      return;
    }

    const type = typeFromParent(interaction.channel?.parentId);
    const roles = type ? roleIdsForType(type) : [staffRoleId()].filter(Boolean);
    const pingTargets = roles.length ? roles : [staffRoleId()].filter(Boolean);
    pingCooldown.set(channelId, Date.now());

    const mention =
      pingTargets.length > 0 ? pingTargets.map((r) => `<@&${r}>`).join(" ") : "@Staff";
    await interaction.reply({
      content: `${mention} — ${interaction.user} requested more help in this ticket.`,
      allowedMentions: pingTargets.length ? { roles: pingTargets } : { parse: [] },
    });
    return;
  }

  if (id === "sc_ticket_ai_tip") {
    await handleAiTip(interaction);
  }
}
/**
 * @param {import("discord.js").ModalSubmitInteraction} interaction
 * @returns {Promise<boolean>}
 */
async function handleTicketModal(interaction) {
  const id = interaction.customId || "";
  if (!MODAL_CUSTOM_IDS.has(id) && !id.startsWith("sc_ticket_modal_")) return false;

  const type = Object.values(TICKET_TYPES).find((t) => t.modalId === id);
  if (!type) return false;

  /** @type {Record<string, string>} */
  const answers = {};
  for (const q of type.questions) {
    answers[q.id] = String(interaction.fields.getTextInputValue(q.id) || "").trim();
  }

  await createTicketFromAnswers(interaction, type, answers);
  return true;
}

/**
 * @param {import("discord.js").Client} client
 */
function registerTicketHandlers(_client) {
  // Tickets open via panel → modal → create + auto-ping.
}

/**
 * Staff-created bug ticket from an unresolved crash (player may not be the opener).
 * @param {{
 *   guild: import("discord.js").Guild,
 *   staffUser: import("discord.js").User,
 *   playerDiscordId?: string|null,
 *   crashId: string,
 *   diagnosis?: string|null,
 *   summary?: string|null,
 *   minecraftUsername?: string|null,
 *   minecraftUuid?: string|null,
 *   tips?: string[],
 * }} opts
 */
async function createStaffBugTicket(opts) {
  const type = TICKET_TYPES.bug;
  const guild = opts.guild;
  const categoryId = envId(type.categoryEnv);
  if (!categoryId) {
    return { ok: false, error: `Ticket category for **${type.label}** is not configured. Run \`/setup-server\` first.` };
  }

  const playerId = String(opts.playerDiscordId || "").replace(/\D/g, "") || null;
  const openerId = playerId || opts.staffUser.id;
  let opener;
  try {
    opener = await guild.client.users.fetch(openerId);
  } catch {
    opener = opts.staffUser;
  }

  const pingRoles = roleIdsForType(type);
  const viewRoles = viewRoleIdsForType(type);
  const safe = sanitizeUsername(opener.username || "player");
  const channelName = `ticket-bug-crash-${safe}`.slice(0, 100);

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `Crash ${opts.crashId} · ${opener.tag || opener.username} (${opener.id})`,
      permissionOverwrites: ticketOverwrites(guild, opener, type, viewRoles),
      reason: `Crash escalate ticket by ${opts.staffUser.tag} · ${opts.crashId}`,
    });
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }

  // Ensure staff who created it can see the channel even if not in bug roles.
  try {
    await channel.permissionOverwrites.edit(opts.staffUser.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
    });
  } catch {
    /* ignore */
  }

  const answers = {
    q1: String(opts.diagnosis || "Unresolved Apex Launcher crash").slice(0, 1000),
    q2: [
      `Crash ID: ${opts.crashId}`,
      opts.minecraftUsername ? `MC: ${opts.minecraftUsername}` : null,
      opts.minecraftUuid ? `UUID: ${opts.minecraftUuid}` : null,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 100) || "Apex Launcher",
    q3: [
      opts.summary || null,
      Array.isArray(opts.tips) && opts.tips.length ? `AI tips:\n${opts.tips.join("\n")}` : null,
      "Full logs are in the staff crash channel attachment.",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 1000),
  };

  const mentionRoles = pingRoles.filter(Boolean);
  const userMentions = [opener.id];
  if (playerId && playerId !== opener.id) userMentions.push(playerId);

  await channel.send({
    content: [
      playerId ? `<@${playerId}>` : null,
      `${opts.staffUser} opened this from an AI recovery failure.`,
      mentionRoles.length ? mentionRoles.map((id) => `<@&${id}>`).join(" ") : null,
    ]
      .filter(Boolean)
      .join(" · "),
    allowedMentions: {
      users: [...new Set(userMentions)],
      roles: mentionRoles,
    },
    embeds: [answersEmbed(type, answers, opener.username)],
    components: [helpRow(type)],
  });

  pingCooldown.set(channel.id, Date.now());
  return { ok: true, channelId: channel.id, channel };
}

module.exports = {
  TICKET_TYPES,
  isTicketChannel,
  handleTicketButton,
  handleTicketModal,
  registerTicketHandlers,
  ticketsPanelEmbed,
  ticketsPanelRow,
  helpRow,
  answersEmbed,
  ticketModal,
  createStaffBugTicket,
};
