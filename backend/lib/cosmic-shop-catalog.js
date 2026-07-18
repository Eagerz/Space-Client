/**
 * Cosmic Shop catalog — Credit-priced launcher cosmetics.
 * Economy: 5 Stardust = 1 Credit. Earn Stardust by playing; spend Credits in the shop.
 * Capes live under src/assets/capes/.
 */

function cape(id, name, desc, rarity, tags, creditPrice, extras = {}) {
  const frameCount = extras.frameCount ?? 32;
  return {
    id,
    category: "capes",
    name,
    desc,
    rarity,
    tags,
    creditPrice,
    stardustPrice: creditPrice * 5,
    previewImage: `assets/capes/${id}-preview.png`,
    sheetImage: `assets/capes/${id}-sheet.png`,
    textureImage: `assets/capes/${id}-texture.png`,
    frameCount,
    tournament: !!extras.tournament,
  };
}

const SHOP_ITEMS = [
  cape(
    "jeweled-crown",
    "Jeweled Crown",
    "Tournament champion cape — a centered jeweled gold crown on deep night cloth. Awarded to upcoming tournament winners.",
    "legendary",
    ["Animated", "Tournament", "Champion"],
    180,
    { tournament: true }
  ),
  cape(
    "shining-trophy",
    "Shining Trophy",
    "Tournament champion cape — a bright gold trophy on deep night cloth. Awarded to upcoming tournament winners.",
    "legendary",
    ["Animated", "Tournament", "Champion"],
    150,
    { tournament: true }
  ),
  cape(
    "shining-medal",
    "Shining Medal",
    "Tournament champion cape — a ribboned gold medal on deep night cloth. Awarded to upcoming tournament winners.",
    "legendary",
    ["Animated", "Tournament", "Champion"],
    130,
    { tournament: true }
  ),
  cape(
    "supernova-burst",
    "Supernova Burst",
    "A quiet field, then a white flash blooms into a fading stardust ring.",
    "legendary",
    ["Animated", "Legendary"],
    150
  ),
  cape(
    "event-horizon",
    "Event Horizon",
    "A matte-black singularity with silver–violet light lazily lensing around its edge.",
    "legendary",
    ["Animated", "Legendary", "Exclusive"],
    170
  ),
  cape(
    "solar-eclipse",
    "Solar Eclipse",
    "A black lunar disc crowned by a flickering white corona and soft flare wisps.",
    "epic",
    ["Animated", "Solar"],
    120
  ),
  cape(
    "lunar-cycle",
    "Lunar Cycle",
    "A single moon waxes and wanes through a clean phase loop.",
    "rare",
    ["Animated", "Moon"],
    76
  ),
  cape(
    "dark-matter-waves",
    "Dark Matter Waves",
    "Satin dark-grey cloth disturbed by a continuous hypnotic ripple.",
    "epic",
    ["Animated", "Subtle"],
    100
  ),
];

const BY_ID = Object.fromEntries(SHOP_ITEMS.map((item) => [item.id, item]));

function getShopCatalog() {
  return SHOP_ITEMS;
}

function getShopItem(id) {
  return BY_ID[id] || null;
}

module.exports = {
  getShopCatalog,
  getShopItem,
  SHOP_ITEMS,
};
