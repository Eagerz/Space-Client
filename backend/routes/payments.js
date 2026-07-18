const express = require("express");
const { getCatalog } = require("../lib/catalog");
const playerDb = require("../lib/player-db");
const { alertError, notifyDiscord } = require("../lib/discord-alerts");

/**
 * @param {import("stripe").default} stripe
 */
function createPaymentsRouter(stripe) {
  const router = express.Router();

  /**
   * POST /api/checkout/create-session
   * Body: {
   *   mcUuid: string,
   *   checkoutType: "payment" | "subscription",
   *   priceId?: string,          // Stripe Price ID (preferred)
   *   productKey?: string,       // pack-500 | pack-1000 | ... | monthly | annual
   *   customCredits?: number,    // one-time custom amount (100 credits = €1)
   *   username?: string
   * }
   */
  router.post("/checkout/create-session", express.json(), async (req, res) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({
          error: "Stripe is not configured. Set STRIPE_SECRET_KEY on the backend.",
        });
      }

      const {
        mcUuid,
        checkoutType,
        priceId: rawPriceId,
        productKey,
        customCredits,
        username,
      } = req.body || {};

      const uuid = playerDb.normalizeUuid(mcUuid);
      if (!uuid || uuid.length < 32) {
        return res.status(400).json({ error: "A valid Minecraft UUID is required." });
      }

      const type = checkoutType === "subscription" ? "subscription" : "payment";
      const catalog = getCatalog();
      const successUrl =
        process.env.STRIPE_SUCCESS_URL ||
        "https://github.com/Eagerz/space-client#payment-success";
      const cancelUrl =
        process.env.STRIPE_CANCEL_URL ||
        "https://github.com/Eagerz/space-client#payment-cancelled";

      let lineItems;
      let mode = type;
      let metadata = {
        mc_uuid: uuid,
        mc_username: username ? String(username).slice(0, 64) : "",
        checkout_type: type,
        product_key: productKey ? String(productKey) : "",
      };

      if (type === "subscription") {
        const key = productKey === "annual" ? "annual" : "monthly";
        const plan = catalog.spaceplus[key];
        const priceId = rawPriceId || plan.priceId;
        if (!priceId) {
          return res.status(400).json({
            error:
              "Missing Space+ Stripe Price ID. Set STRIPE_PRICE_SPACEPLUS_MONTHLY / ANNUAL or pass priceId.",
          });
        }
        lineItems = [{ price: priceId, quantity: 1 }];
        metadata.product_key = key;
        metadata.interval = key;
        metadata.fulfillment = "spaceplus";
      } else if (customCredits != null) {
        const credits = Math.round(Number(customCredits));
        if (!Number.isFinite(credits) || credits < 100 || credits > 50000) {
          return res.status(400).json({
            error: "customCredits must be between 100 and 50,000.",
          });
        }
        const unitAmount = Math.round((credits / 100) * 100); // euros → cents
        lineItems = [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: unitAmount,
              product_data: {
                name: `${credits.toLocaleString()} Apex Launcher Credits`,
                description: "Launcher credits (100 credits = €1.00)",
              },
            },
          },
        ];
        metadata.fulfillment = "credits";
        metadata.credits = String(credits);
        metadata.product_key = "custom";
      } else {
        const key = productKey || "pack-500";
        const pack = catalog.credits[key];
        if (!pack && !rawPriceId) {
          return res.status(400).json({ error: `Unknown credit product: ${key}` });
        }

        const priceId = rawPriceId || pack?.priceId;
        const totalCredits = pack ? pack.credits + pack.bonus : null;

        if (priceId) {
          lineItems = [{ price: priceId, quantity: 1 }];
        } else {
          lineItems = [
            {
              quantity: 1,
              price_data: {
                currency: "eur",
                unit_amount: Math.round((pack.fallbackEur || 5) * 100),
                product_data: {
                  name: pack.label,
                  description: "Apex Launcher credit pack",
                },
              },
            },
          ];
        }

        metadata.fulfillment = "credits";
        metadata.product_key = key;
        if (totalCredits != null) metadata.credits = String(totalCredits);
      }

      const session = await stripe.checkout.sessions.create({
        mode,
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: uuid,
        metadata,
        ...(mode === "subscription"
          ? {
              subscription_data: {
                metadata: {
                  mc_uuid: uuid,
                  interval: metadata.interval || "monthly",
                },
              },
            }
          : {
              payment_intent_data: {
                metadata: {
                  mc_uuid: uuid,
                  credits: metadata.credits || "",
                },
              },
            }),
      });

      if (!session.url) {
        return res.status(502).json({ error: "Stripe did not return a checkout URL." });
      }

      return res.json({
        success: true,
        url: session.url,
        sessionId: session.id,
      });
    } catch (err) {
      console.error("[payments] create-session failed:", err);
      alertError(
        "payments:create-session",
        "Checkout session creation failed",
        err?.message || "Failed to create checkout session.",
        "Checkout"
      ).catch(() => {});
      return res.status(500).json({
        error: err?.message || "Failed to create checkout session.",
      });
    }
  });

  /**
   * POST /api/webhooks/stripe
   * Mount with express.raw in server.js — do NOT use express.json here.
   */
  router.post("/webhooks/stripe", async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[payments] STRIPE_WEBHOOK_SECRET is not set");
      return res.status(503).send("Webhook secret not configured");
    }

    let event;
    try {
      const signature = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (err) {
      console.error("[payments] Webhook signature verification failed:", err.message);
      alertError(
        "payments:webhook-signature",
        "Stripe webhook signature failed",
        err.message,
        "Stripe Webhook"
      ).catch(() => {});
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        await fulfillCheckoutSession(event.data.object);
      }

      if (
        event.type === "customer.subscription.deleted" ||
        event.type === "customer.subscription.updated"
      ) {
        const sub = event.data.object;
        const mcUuid = sub.metadata?.mc_uuid;
        if (mcUuid && event.type === "customer.subscription.deleted") {
          playerDb.setSpacePlus(mcUuid, false, {
            reason: "subscription_deleted",
            stripeSubscriptionId: sub.id,
          });
        }
        if (mcUuid && event.type === "customer.subscription.updated") {
          const active = sub.status === "active" || sub.status === "trialing";
          playerDb.setSpacePlus(mcUuid, active, {
            reason: "subscription_updated",
            status: sub.status,
            stripeSubscriptionId: sub.id,
          });
        }
      }

      return res.json({ received: true });
    } catch (err) {
      console.error("[payments] Webhook handler failed:", err);
      alertError(
        "payments:webhook-handler",
        "Stripe webhook handler failed",
        err?.message || "Webhook handler failed",
        "Stripe Webhook"
      ).catch(() => {});
      return res.status(500).json({ error: "Webhook handler failed" });
    }
  });

  /**
   * GET /api/players/:uuid — optional status for launcher refresh
   */
  router.get("/players/:uuid", express.json(), (req, res) => {
    const player = playerDb.getPlayer(req.params.uuid);
    return res.json({
      uuid: player.uuid,
      credits: player.credits,
      spacePlus: player.spacePlus,
      spacePlusInterval: player.spacePlusInterval,
      stardust: player.stardust || 0,
      stardustLifetime: player.stardustLifetime || 0,
      stardustDailyEarned: player.stardustDailyEarned || 0,
      ownedCosmetics: player.ownedCosmetics || [],
      equippedCosmetics: player.equippedCosmetics || {},
      updatedAt: player.updatedAt,
    });
  });

  return router;
}

async function fulfillCheckoutSession(session) {
  const meta = session.metadata || {};
  const mcUuid = meta.mc_uuid || session.client_reference_id;
  if (!mcUuid) {
    console.warn("[payments] checkout.session.completed missing mc_uuid");
    notifyDiscord({
      key: "payments:fulfill-missing-uuid",
      title: "Checkout fulfilled without Minecraft UUID",
      body: `Session ${session.id} has no mc_uuid — delivery skipped.`,
      service: "Fulfillment",
      status: "Warning",
      severity: "warning",
    }).catch(() => {});
    return;
  }

  if (
    session.payment_status &&
    session.payment_status !== "paid" &&
    session.mode === "payment"
  ) {
    console.warn("[payments] Skipping unpaid session", session.id);
    return;
  }

  if (!playerDb.claimSession(session.id)) {
    console.info("[payments] Session already fulfilled:", session.id);
    return;
  }

  try {
    if (meta.fulfillment === "spaceplus" || session.mode === "subscription") {
      playerDb.setSpacePlus(mcUuid, true, {
        interval: meta.interval || meta.product_key || "monthly",
        stripeSessionId: session.id,
        stripeCustomerId: session.customer,
      });
      console.info("[payments] Space+ unlocked for", mcUuid);
      return;
    }

    const credits = Number(meta.credits);
    if (Number.isFinite(credits) && credits > 0) {
      playerDb.addCredits(mcUuid, credits, {
        productKey: meta.product_key,
        stripeSessionId: session.id,
      });
      console.info("[payments] Credited", credits, "to", mcUuid);
      return;
    }

    console.warn("[payments] No fulfillment rule for session", session.id, meta);
    notifyDiscord({
      key: "payments:fulfill-no-rule",
      title: "Checkout completed with no fulfillment rule",
      body: `Session ${session.id} — metadata: ${JSON.stringify(meta).slice(0, 400)}`,
      service: "Fulfillment",
      status: "Warning",
      severity: "warning",
    }).catch(() => {});
  } catch (err) {
    console.error("[payments] Fulfillment failed:", err);
    alertError(
      "payments:fulfill-failed",
      "Payment fulfillment failed",
      err?.message || String(err),
      "Fulfillment"
    ).catch(() => {});
    throw err;
  }
}

module.exports = { createPaymentsRouter };
