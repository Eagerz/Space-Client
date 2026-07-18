/**
 * Discord Incoming Webhook alerts for Apex Launcher ops/status.
 * Webhook URL stays on the backend only — never ship to Electron.
 */

const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes per alert key

/** @type {Map<string, number>} */
const lastPostedAt = new Map();

const SEVERITY_COLORS = {
  critical: 0xb91c1c,
  error: 0xdc2626,
  warning: 0xb45309,
  info: 0x3e3e4f,
  resolved: 0x16a34a,
};

function alertsEnabled() {
  const flag = process.env.DISCORD_ALERTS_ENABLED;
  if (flag === "false" || flag === "0") return false;
  return true;
}

function getWebhookUrl() {
  const url = process.env.DISCORD_STATUS_WEBHOOK_URL || "";
  return url.trim();
}

/**
 * @param {string} key
 * @param {number} [cooldownMs]
 * @returns {boolean}
 */
function canPost(key, cooldownMs = DEFAULT_COOLDOWN_MS) {
  if (!key) return true;
  const last = lastPostedAt.get(key) || 0;
  return Date.now() - last >= cooldownMs;
}

/**
 * @param {string} key
 */
function markPosted(key) {
  if (key) lastPostedAt.set(key, Date.now());
}

/**
 * Clear cooldown for a key (e.g. after recovery so the next outage can alert immediately).
 * @param {string} key
 */
function clearCooldown(key) {
  if (key) lastPostedAt.delete(key);
}

/**
 * Post a status embed to Discord. No-ops if webhook unset or alerts disabled.
 *
 * @param {{
 *   title: string,
 *   body?: string,
 *   severity?: keyof typeof SEVERITY_COLORS,
 *   service?: string,
 *   status?: string,
 *   key?: string,
 *   cooldownMs?: number,
 *   force?: boolean,
 * }} opts
 * @returns {Promise<{ ok: boolean, skipped?: string, status?: number }>}
 */
async function notifyDiscord(opts = {}) {
  const {
    title,
    body = "",
    severity = "info",
    service = "Apex Launcher",
    status = "",
    key = "",
    cooldownMs = DEFAULT_COOLDOWN_MS,
    force = false,
  } = opts;

  if (!alertsEnabled()) {
    return { ok: false, skipped: "disabled" };
  }

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return { ok: false, skipped: "no_webhook" };
  }

  if (!force && key && !canPost(key, cooldownMs)) {
    return { ok: false, skipped: "cooldown" };
  }

  const color = SEVERITY_COLORS[severity] || SEVERITY_COLORS.info;
  const fields = [
    { name: "Service", value: service, inline: true },
  ];
  if (status) {
    fields.push({ name: "Status", value: status, inline: true });
  }
  if (body) {
    fields.push({
      name: "Detail",
      value: String(body).slice(0, 1000),
      inline: false,
    });
  }

  const payload = {
    username: "Apex Launcher Status",
    embeds: [
      {
        title: String(title || "Status update").slice(0, 256),
        color,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: "Apex Launcher backend" },
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "[discord-alerts] Webhook failed:",
        res.status,
        text.slice(0, 200)
      );
      return { ok: false, status: res.status };
    }

    if (key) markPosted(key);
    return { ok: true, status: res.status };
  } catch (err) {
    console.error("[discord-alerts] Post failed:", err?.message || err);
    return { ok: false };
  }
}

/**
 * Convenience: error-class alert with default cooldown.
 */
function alertError(key, title, body, service = "Payments") {
  return notifyDiscord({
    key,
    title,
    body,
    service,
    status: "Error",
    severity: "error",
  });
}

module.exports = {
  notifyDiscord,
  alertError,
  clearCooldown,
  canPost,
  DEFAULT_COOLDOWN_MS,
};
