const path = require("path");
const tls = require("tls");

// Node 22+ default CA bundle can miss corp/system roots on Windows; use the OS store
// so Discord.js (and other HTTPS) can verify certificates.
try {
  if (typeof tls.setDefaultCACertificates === "function" && typeof tls.getCACertificates === "function") {
    tls.setDefaultCACertificates(tls.getCACertificates("system"));
  }
} catch {
  // Best-effort — Discord login may still fail without system roots.
}

require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const { createPaymentsRouter } = require("./routes/payments");
const { createCrashRouter } = require("./routes/crash");
const { createBridgeRouter } = require("./routes/bridge");
const { createProgressionRouter } = require("./routes/progression");
const { createMobileUpdateRouter } = require("./routes/mobile-update");
const { createStaffRouter } = require("./routes/staff");
const { startStatusMonitor } = require("./lib/status-monitor");
const { notifyDiscord } = require("./lib/discord-alerts");
const { startDiscordBot } = require("./lib/discord-bot");

const PORT = Number(process.env.PORT || 8787);
const stripeSecret = process.env.STRIPE_SECRET_KEY || "";

if (!stripeSecret) {
  console.warn(
    "[backend] STRIPE_SECRET_KEY missing — checkout routes will return 503 until configured."
  );
}

// Placeholder lets the process boot without a key; routes still guard on STRIPE_SECRET_KEY.
const stripe = new Stripe(stripeSecret || "sk_test_placeholder");

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
      : true,
    credentials: true,
  })
);

// Stripe webhooks require the raw body for signature verification.
// Must be registered before any express.json() that could touch this path.
app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "space-client-backend" });
});

app.use(express.json({ limit: "256kb" }));

app.use("/api", createPaymentsRouter(stripe));
app.use("/api", createCrashRouter());
app.use("/api", createBridgeRouter());
app.use("/api/v1", createProgressionRouter());
app.use("/v1", createMobileUpdateRouter());
app.use("/api/v1", createMobileUpdateRouter());
app.use("/api/staff", createStaffRouter(stripe));

// Egrz staff dashboard (static)
const egrzRoot = path.join(__dirname, "..", "egrz");
app.use("/egrz", express.static(egrzRoot, { index: "index.html", extensions: ["html"] }));
app.get("/egrz", (_req, res) => {
  res.redirect(302, "/egrz/");
});

app.use((err, _req, res, _next) => {
  console.error("[backend]", err);
  notifyDiscord({
    key: "backend:unhandled",
    title: "Unhandled backend error",
    body: err?.message || "Internal server error",
    service: "API",
    status: "Error",
    severity: "error",
  }).catch(() => {});
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.info(
    `[backend] Apex Launcher payments API listening on http://localhost:${PORT}`
  );
  console.info(`[backend] Egrz staff dashboard → http://localhost:${PORT}/egrz/`);
  startStatusMonitor(stripe);
  startDiscordBot().catch((err) => {
    console.warn("[backend] Discord bot did not start:", err?.message || err);
  });
});
