/**
 * Map launcher product keys → Stripe Price IDs (from Dashboard).
 * Leave empty to use dynamic price_data for credits (test-friendly).
 */
function getCatalog() {
  return {
    credits: {
      "pack-500": {
        priceId: process.env.STRIPE_PRICE_CREDITS_500 || "",
        credits: 500,
        bonus: 0,
        fallbackEur: 5,
        label: "500 Credits",
      },
      "pack-1000": {
        priceId: process.env.STRIPE_PRICE_CREDITS_1000 || "",
        credits: 1000,
        bonus: 100,
        fallbackEur: 10,
        label: "1,000 Credits (+100 bonus)",
      },
      "pack-2500": {
        priceId: process.env.STRIPE_PRICE_CREDITS_2500 || "",
        credits: 2500,
        bonus: 350,
        fallbackEur: 25,
        label: "2,500 Credits (+350 bonus)",
      },
      "pack-5000": {
        priceId: process.env.STRIPE_PRICE_CREDITS_5000 || "",
        credits: 5000,
        bonus: 800,
        fallbackEur: 50,
        label: "5,000 Credits (+800 bonus)",
      },
    },
    spaceplus: {
      monthly: {
        priceId: process.env.STRIPE_PRICE_SPACEPLUS_MONTHLY || "",
        interval: "monthly",
        label: "Space+ Monthly",
      },
      annual: {
        priceId: process.env.STRIPE_PRICE_SPACEPLUS_ANNUAL || "",
        interval: "annual",
        label: "Space+ Annual",
      },
    },
  };
}

module.exports = { getCatalog };
