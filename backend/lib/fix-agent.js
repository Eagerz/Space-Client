/**
 * Space Cloud Fix Agent — free-text issue → allow-listed actions → player inbox.
 */

"use strict";

const crashAi = require("./crash-ai");
const crashCases = require("./crash-cases");
const playerDb = require("./player-db");
const fixJobs = require("./fix-jobs");
const { getClient, isReady } = require("./discord-bot/client");

const FILE_ACTIONS = new Set([
  "clear_extra_mods",
  "clear_shader_caches",
  "clear_logs",
  "restage_fabric_injection",
]);

const CONFIDENCE_QUEUE = 0.55;

function envId(key) {
  return String(process.env[key] || "").trim();
}

/**
 * Analyze a staff-written issue (and optional crash logs) into the crash allow-list.
 * @param {{ issueText: string, logs?: string, version?: string, loader?: string }} input
 */
async function analyzeIssue(input = {}) {
  const issueText = String(input.issueText || "").trim();
  const logs = [issueText, input.logs ? String(input.logs) : ""].filter(Boolean).join("\n\n---\n\n");
  const plan = await crashAi.analyzeCrash({
    error: issueText.slice(0, 500),
    logs: logs.slice(-12000),
    version: input.version || null,
    loader: input.loader || null,
    source: "fix-agent",
  });
  const actions = crashCases.sanitizeActions(
    (plan.actions || []).filter((a) => a !== "none")
  );
  const tip =
    Array.isArray(plan.tips) && plan.tips.length
      ? plan.tips.join(" ").slice(0, 1500)
      : plan.summary || plan.diagnosis || null;
  const forceUpdateCheck = /update|outdated|old launcher|force update|reinstall launcher/i.test(
    issueText
  );
  return {
    ...plan,
    actions,
    tip,
    forceUpdateCheck,
  };
}

function shouldAutoQueue(plan, { requireConfirm = false } = {}) {
  if (requireConfirm) return false;
  const fileActions = (plan.actions || []).filter((a) => FILE_ACTIONS.has(a));
  const confidence = Number(plan.confidence) || 0;
  if (confidence < CONFIDENCE_QUEUE) return false;
  if (fileActions.length > 0) return true;
  if (plan.forceUpdateCheck) return true;
  // suggest_* only with a tip — still queue so inbox tip/update path can run guidance flags
  if ((plan.actions || []).some((a) => String(a).startsWith("suggest_")) && plan.tip) {
    return true;
  }
  // High-confidence player guidance (e.g. Space Bridge host prerequisites) with no file repair.
  if (plan.tip && confidence >= CONFIDENCE_QUEUE && plan.resolvable === false) {
    return true;
  }
  return false;
}

/**
 * @param {object} opts
 */
async function runFixJob(opts = {}) {
  const launcherId = playerDb.normalizeUuid(opts.launcherId || opts.uuid || "");
  if (!launcherId || launcherId.length < 32) {
    throw Object.assign(new Error("Invalid launcher ID"), { status: 400 });
  }
  const issueText = String(opts.issueText || "").trim();
  if (!issueText) {
    throw Object.assign(new Error("issueText required"), { status: 400 });
  }

  const createdBy = opts.createdBy || "staff";
  const notifyDiscord = opts.notifyDiscord !== false;
  const requireConfirm = Boolean(opts.requireConfirm);
  const ticketChannelId = opts.ticketChannelId
    ? String(opts.ticketChannelId).replace(/\D/g, "") || null
    : null;

  if (opts.username) playerDb.touchPlayerIdentity(launcherId, opts.username);
  if (opts.discordId) {
    playerDb.touchDiscordIdentity(launcherId, opts.discordId, opts.discordUsername);
  }

  const player = playerDb.getPlayer(launcherId);
  const job = fixJobs.createJob({
    launcherId,
    username: opts.username || player.username || null,
    discordId: opts.discordId || player.discordId || null,
    discordUsername: opts.discordUsername || player.discordUsername || null,
    issueText,
    status: "analyzing",
    notifyDiscord,
    ticketChannelId,
    crashId: opts.crashId || null,
    requireConfirm,
    createdBy: String(createdBy).slice(0, 80),
  });

  let plan;
  try {
    plan = await analyzeIssue({
      issueText,
      logs: opts.logs || null,
      version: opts.version || null,
      loader: opts.loader || null,
    });
  } catch (err) {
    return fixJobs.updateJob(job.id, {
      status: "failed",
      result: { error: err?.message || String(err) },
    });
  }

  fixJobs.updateJob(job.id, {
    proposedActions: plan.actions,
    tip: plan.tip,
    forceUpdateCheck: plan.forceUpdateCheck,
    diagnosis: plan.diagnosis,
    confidence: plan.confidence,
    summary: plan.summary,
  });

  const auto = shouldAutoQueue(plan, { requireConfirm });
  if (!auto) {
    const updated = fixJobs.updateJob(job.id, {
      status: "needs_staff",
      result: {
        reason: requireConfirm
          ? "Staff confirmation required before queueing"
          : "Low confidence or no safe automated fix",
      },
    });
    if (notifyDiscord) {
      await notifyStaffNeedsReview(updated).catch((e) =>
        console.warn("[fix-agent] staff notify failed:", e?.message || e)
      );
    }
    return updated;
  }

  return queueJobActions(job.id, {
    actions: plan.actions.filter((a) => FILE_ACTIONS.has(a)),
    tip: plan.tip,
    forceUpdateCheck: plan.forceUpdateCheck,
    queuedBy: createdBy,
    notifyQueued: notifyDiscord,
  });
}

/**
 * Queue allow-listed actions for an existing job (confirm path).
 */
function queueJobActions(jobId, opts = {}) {
  const job = fixJobs.getJob(jobId);
  if (!job) return null;

  const actions = crashCases.sanitizeActions(
    opts.actions != null ? opts.actions : job.proposedActions || []
  ).filter((a) => FILE_ACTIONS.has(a));
  const tip =
    opts.tip != null
      ? String(opts.tip).trim().slice(0, 1500) || null
      : job.tip;
  const forceUpdateCheck =
    opts.forceUpdateCheck != null ? Boolean(opts.forceUpdateCheck) : job.forceUpdateCheck;

  if (!actions.length && !tip && !forceUpdateCheck) {
    return fixJobs.updateJob(jobId, {
      status: "needs_staff",
      result: { reason: "Nothing safe to queue" },
    });
  }

  playerDb.queueStaffInbox(job.launcherId, {
    actions,
    tip,
    forceUpdateCheck,
    queuedBy: opts.queuedBy || job.createdBy || "fix-agent",
  });

  const updated = fixJobs.updateJob(jobId, {
    status: "queued",
    proposedActions: actions.length ? actions : job.proposedActions,
    tip,
    forceUpdateCheck,
    queuedAt: new Date().toISOString(),
    result: {
      message:
        "Fix queued — applies when the player's Apex Launcher is open (heartbeat ~45s) or on next launch.",
    },
  });

  if (opts.notifyQueued !== false && job.notifyDiscord !== false) {
    notifyFixQueued(updated).catch((e) =>
      console.warn("[fix-agent] queued notify failed:", e?.message || e)
    );
  }

  return updated;
}

/**
 * Staff closes a job as fixed (testing or manual resolution).
 * @param {string} jobId
 * @param {{ note?: string, closedBy?: string, notifyDiscord?: boolean }} [opts]
 */
async function markJobFixed(jobId, opts = {}) {
  const job = fixJobs.getJob(jobId);
  if (!job) return null;

  const closedBy = opts.closedBy || "staff";
  const note = opts.note != null ? String(opts.note).trim().slice(0, 500) : null;
  const updated = fixJobs.updateJob(jobId, {
    status: "fixed",
    appliedAt: new Date().toISOString(),
    result: {
      ...(job.result || {}),
      message: "Status: fixed",
      closedBy: String(closedBy).slice(0, 80),
      ...(note ? { note } : {}),
    },
  });

  if (opts.notifyDiscord !== false && job.notifyDiscord !== false) {
    await notifyFixFixed(updated).catch((e) =>
      console.warn("[fix-agent] fixed notify failed:", e?.message || e)
    );
  }

  return updated;
}

async function notifyFixFixed(job) {
  const playerMsg = {
    embeds: [
      jobEmbed(job, {
        title: "Apex Launcher — issue fixed",
        color: 0x5a9e6f,
        extra: {
          name: "Status",
          value: "**fixed** — you can relaunch Minecraft or retry Space Bridge Host.",
        },
      }),
    ],
  };

  let notify = { ...(job.notify || {}), fixed: {} };

  if (job.ticketChannelId) {
    notify.fixed.ticket = await sendDiscordMessage(job.ticketChannelId, {
      content: job.discordId ? `<@${job.discordId}>` : undefined,
      allowedMentions: job.discordId ? { users: [job.discordId] } : undefined,
      ...playerMsg,
    });
  } else if (job.discordId) {
    notify.fixed.dm = await dmUser(job.discordId, playerMsg);
  }

  const staffChannel = envId("DISCORD_STAFF_CHANNEL_ID");
  if (staffChannel) {
    notify.fixed.staff = await sendDiscordMessage(staffChannel, {
      embeds: [
        jobEmbed(job, {
          title: "Fix Agent — status: fixed",
          color: 0x5a9e6f,
          extra: {
            name: "Status",
            value: "fixed",
          },
        }),
      ],
    });
  }

  return fixJobs.updateJob(job.id, { notify });
}

/**
 * After launcher inbox ack — mark matching queued jobs fixed and notify.
 * @param {string} launcherId
 * @param {{ applied?: string[], tipShown?: boolean, updateCheckDone?: boolean }} ack
 */
async function onInboxAck(launcherId, ack = {}) {
  const lid = playerDb.normalizeUuid(launcherId);
  if (!lid) return [];
  const appliedIds = Array.isArray(ack.applied)
    ? ack.applied.map((a) => (typeof a === "string" ? a : a?.action)).filter(Boolean)
    : [];
  const queued = fixJobs.listQueuedForLauncher(lid).filter((j) => j.status === "queued");
  const completed = [];

  for (const job of queued) {
    const needed = (job.proposedActions || []).filter((a) => FILE_ACTIONS.has(a));
    const allApplied =
      !needed.length || needed.every((a) => appliedIds.includes(a));
    const tipDone = !job.tip || ack.tipShown;
    const updateDone = !job.forceUpdateCheck || ack.updateCheckDone;
    // Complete when any applied actions overlap OR update/tip completed for update-only jobs
    const overlap = needed.some((a) => appliedIds.includes(a));
    const updateOnly = !needed.length && (job.forceUpdateCheck || job.tip);
    if (!(allApplied || overlap || (updateOnly && (tipDone || updateDone || appliedIds.length || ack.updateCheckDone || ack.tipShown)))) {
      continue;
    }

    const updated = fixJobs.updateJob(job.id, {
      status: "fixed",
      appliedAt: new Date().toISOString(),
      result: {
        applied: appliedIds,
        tipShown: Boolean(ack.tipShown),
        updateCheckDone: Boolean(ack.updateCheckDone),
        message: "Status: fixed — launcher applied the fix",
      },
    });
    completed.push(updated);
    if (job.notifyDiscord !== false) {
      await notifyFixFixed(updated).catch((e) =>
        console.warn("[fix-agent] fixed notify failed:", e?.message || e)
      );
    }
  }

  return completed;
}

async function sendDiscordMessage(channelId, payload) {
  const client = getClient();
  if (!client || !isReady() || !channelId) return { ok: false, skipped: "no_channel" };
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased?.()) return { ok: false, skipped: "invalid_channel" };
  const msg = await ch.send(payload);
  return { ok: true, messageId: msg.id };
}

async function dmUser(discordId, payload) {
  const client = getClient();
  if (!client || !isReady() || !discordId) return { ok: false, skipped: "no_dm" };
  try {
    const user = await client.users.fetch(String(discordId));
    const msg = await user.send(payload);
    return { ok: true, messageId: msg.id };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function jobEmbed(job, { title, color, extra }) {
  return {
    title,
    color,
    description: String(job.issueText || "").slice(0, 800),
    fields: [
      { name: "Job", value: `\`${job.id}\``, inline: true },
      { name: "Launcher ID", value: `\`${job.launcherId}\``, inline: true },
      {
        name: "Status",
        value: String(job.status),
        inline: true,
      },
      job.diagnosis
        ? { name: "Diagnosis", value: String(job.diagnosis).slice(0, 200), inline: false }
        : null,
      job.proposedActions?.length
        ? {
            name: "Actions",
            value: job.proposedActions.map((a) => `\`${a}\``).join(", "),
            inline: false,
          }
        : null,
      extra || null,
    ].filter(Boolean),
    footer: {
      text: job.username
        ? `${job.username} · ${job.createdBy || "fix-agent"}`
        : job.createdBy || "fix-agent",
    },
    timestamp: new Date().toISOString(),
  };
}

async function notifyFixQueued(job) {
  const playerMsg = {
    embeds: [
      jobEmbed(job, {
        title: "Apex Launcher — fix queued",
        color: 0x6b8cae,
        extra: {
          name: "Next step",
          value:
            "Keep Apex Launcher open (or reopen it). Safe repairs run automatically within about a minute, then you can relaunch Minecraft.",
        },
      }),
    ],
  };

  let notify = { dm: null, ticket: null, staff: null };

  if (job.ticketChannelId) {
    notify.ticket = await sendDiscordMessage(job.ticketChannelId, {
      content: job.discordId ? `<@${job.discordId}>` : undefined,
      allowedMentions: job.discordId ? { users: [job.discordId] } : undefined,
      ...playerMsg,
    });
  } else if (job.discordId) {
    notify.dm = await dmUser(job.discordId, playerMsg);
  }

  const staffChannel = envId("DISCORD_STAFF_CHANNEL_ID");
  if (staffChannel && (!notify.dm?.ok && !notify.ticket?.ok)) {
    notify.staff = await sendDiscordMessage(staffChannel, {
      embeds: [
        jobEmbed(job, {
          title: "Fix Agent — queued (player not notified)",
          color: 0xc8a96a,
          extra: {
            name: "Note",
            value: job.discordId
              ? "DM failed or blocked — link Discord on Launcher ID or open a ticket."
              : "No Discord linked to this Launcher ID.",
          },
        }),
      ],
    });
  } else if (staffChannel) {
    notify.staff = await sendDiscordMessage(staffChannel, {
      embeds: [
        jobEmbed(job, {
          title: "Fix Agent — queued",
          color: 0x6b8cae,
          extra: null,
        }),
      ],
    });
  }

  return fixJobs.updateJob(job.id, { notify });
}

async function notifyFixApplied(job) {
  const playerMsg = {
    embeds: [
      jobEmbed(job, {
        title: "Apex Launcher — issue fixed",
        color: 0x5a9e6f,
        extra: {
          name: "Done",
          value:
            "Your launcher applied the queued repairs. Relaunch Minecraft if it is still closed. Reply in your ticket if anything is still wrong.",
        },
      }),
    ],
  };

  let notify = { ...(job.notify || {}), applied: {} };

  if (job.ticketChannelId) {
    notify.applied.ticket = await sendDiscordMessage(job.ticketChannelId, {
      content: job.discordId ? `<@${job.discordId}>` : undefined,
      allowedMentions: job.discordId ? { users: [job.discordId] } : undefined,
      ...playerMsg,
    });
  } else if (job.discordId) {
    notify.applied.dm = await dmUser(job.discordId, playerMsg);
  }

  const staffChannel = envId("DISCORD_STAFF_CHANNEL_ID");
  if (staffChannel) {
    notify.applied.staff = await sendDiscordMessage(staffChannel, {
      embeds: [
        jobEmbed(job, {
          title: "Fix Agent — applied on player PC",
          color: 0x5a9e6f,
          extra: null,
        }),
      ],
    });
  }

  return fixJobs.updateJob(job.id, { notify });
}

async function notifyStaffNeedsReview(job) {
  const staffChannel = envId("DISCORD_STAFF_CHANNEL_ID");
  if (!staffChannel) return null;
  const result = await sendDiscordMessage(staffChannel, {
    embeds: [
      jobEmbed(job, {
        title: "Fix Agent — needs staff",
        color: 0xb85c5c,
        extra: {
          name: "Reason",
          value: String(job.result?.reason || "Review in Egrz → Agents").slice(0, 300),
        },
      }),
    ],
  });
  return fixJobs.updateJob(job.id, { notify: { staff: result } });
}

module.exports = {
  FILE_ACTIONS,
  CONFIDENCE_QUEUE,
  analyzeIssue,
  shouldAutoQueue,
  runFixJob,
  queueJobActions,
  markJobFixed,
  onInboxAck,
  notifyFixQueued,
  notifyFixApplied,
  notifyFixFixed,
};
