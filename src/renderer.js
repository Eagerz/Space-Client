const INSTALLED_KEY = "space-client-installed-mods";
const ACCENT_KEY = "space-client-accent";
const BLUR_BG_KEY = "space-client-blur-bg";
const CLEAR_PANELS_KEY = "space-client-clear-panels";
const RAM_KEY = "space-client-ram";
const IN_GAME_KEY = "space-client-in-game";
const MODRINTH_PAGE_SIZE = 20;

const ACCENT_COLORS = [
  { id: "white", value: "#FFFFFF", label: "White" },
  { id: "silver", value: "#B8B8C4", label: "Silver" },
  { id: "blue", value: "#3B82F6", label: "Blue" },
  { id: "indigo", value: "#6366F1", label: "Indigo" },
  { id: "purple", value: "#8B5CF6", label: "Purple" },
  { id: "magenta", value: "#D946EF", label: "Magenta" },
  { id: "pink", value: "#EC4899", label: "Pink" },
  { id: "rose", value: "#FB7185", label: "Rose" },
  { id: "red", value: "#EF4444", label: "Red" },
  { id: "orange", value: "#F97316", label: "Orange" },
  { id: "amber", value: "#F59E0B", label: "Amber" },
  { id: "gold", value: "#EAB308", label: "Gold" },
  { id: "lime", value: "#84CC16", label: "Lime" },
  { id: "green", value: "#22C55E", label: "Green" },
  { id: "teal", value: "#14B8A6", label: "Teal" },
  { id: "cyan", value: "#06B6D4", label: "Cyan" },
];

const MINECRAFT_VERSIONS = [
  "1.18", "1.18.1", "1.18.2",
  "1.19", "1.19.1", "1.19.2", "1.19.3", "1.19.4",
  "1.20", "1.20.1", "1.20.2", "1.20.3", "1.20.4", "1.20.5", "1.20.6",
  "1.21", "1.21.1", "1.21.2", "1.21.3", "1.21.4",
  "1.22", "1.22.1", "1.22.2",
  "1.23", "1.23.1",
  "1.24", "1.24.1",
  "1.25", "1.25.1",
  "1.26", "1.26.1", "1.26.2",
];

const modrinthState = {
  query: "",
  loader: "fabric",
  homeLoader: "fabric",
  version: "1.21.1",
  index: "downloads",
  offset: 0,
  totalHits: 0,
  loading: false,
  loaded: false,
};

let modDetailOpen = false;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderTagList(items, max = 8) {
  const { shown, remaining } = Modrinth.formatTagList(items, max);
  if (!shown.length) return "";
  const tags = shown.map((t) => `<span class="mod-detail-tag">${escapeHtml(t)}</span>`).join("");
  const more = remaining > 0 ? `<span class="mod-detail-tag mod-detail-tag-more">+${remaining} more</span>` : "";
  return tags + more;
}

function setInstallButtonState(btn, installed) {
  if (!btn) return;
  btn.textContent = installed ? "Installed" : "Install";
  btn.classList.toggle("installed", installed);
  btn.classList.toggle("primary", !installed);
}

function syncInstallUI(projectId, installed) {
  document.querySelectorAll(`[data-install="${projectId}"]`).forEach((btn) => {
    setInstallButtonState(btn, installed);
  });
  document.querySelectorAll(`.modrinth-card[data-project-id="${projectId}"]`).forEach((card) => {
    card.classList.toggle("installed", installed);
  });
}

const HOME_NEWS = [
  {
    id: "release-v1",
    tag: "Release",
    date: "Jul 10, 2026",
    title: "Space Client v1.0 released",
    desc: "The first public build is live — launch Minecraft with Fabric, browse Modrinth, and manage cosmetics from one place.",
  },
  {
    id: "mc-1211",
    tag: "Update",
    date: "Jul 8, 2026",
    title: "Minecraft 1.21.1 now supported",
    desc: "Play on the latest stable release with Fabric loader. More versions are on the way.",
  },
  {
    id: "modrinth",
    tag: "Feature",
    date: "Jul 5, 2026",
    title: "Modrinth integration added",
    desc: "Search, install, and manage mods without leaving the launcher.",
  },
];

const COSMETICS = [
  {
    id: "event-horizon",
    category: "capes",
    name: "Event Horizon",
    desc: "A matte-black singularity with silver–violet light lazily lensing around its edge.",
    rarity: "legendary",
    tags: ["Animated", "Legendary", "Exclusive"],
    price: 850,
    previewImage: "assets/capes/event-horizon-preview.png",
    sheetImage: "assets/capes/event-horizon-sheet.png",
    textureImage: "assets/capes/event-horizon-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "hyperspace",
    category: "capes",
    name: "Hyperspace",
    desc: "Vertical star streaks whip past as if you are forever jumping to warp.",
    rarity: "epic",
    tags: ["Animated", "Motion"],
    price: 550,
    previewImage: "assets/capes/hyperspace-preview.png",
    sheetImage: "assets/capes/hyperspace-sheet.png",
    textureImage: "assets/capes/hyperspace-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "starfall",
    category: "capes",
    name: "Starfall",
    desc: "Quiet charcoal stars, then a sharp white comet cuts across and dissolves.",
    rarity: "rare",
    tags: ["Animated", "Rare"],
    price: 400,
    previewImage: "assets/capes/starfall-preview.png",
    sheetImage: "assets/capes/starfall-sheet.png",
    textureImage: "assets/capes/starfall-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "solar-eclipse",
    category: "capes",
    name: "Solar Eclipse",
    desc: "A black lunar disc crowned by a flickering white corona and soft flare wisps.",
    rarity: "epic",
    tags: ["Animated", "Solar"],
    price: 600,
    previewImage: "assets/capes/solar-eclipse-preview.png",
    sheetImage: "assets/capes/solar-eclipse-sheet.png",
    textureImage: "assets/capes/solar-eclipse-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "liquid-nebula",
    category: "capes",
    name: "Liquid Nebula",
    desc: "Obsidian canvas with indigo dust clouds drifting like silk lava.",
    rarity: "epic",
    tags: ["Animated", "Nebula"],
    price: 550,
    previewImage: "assets/capes/liquid-nebula-preview.png",
    sheetImage: "assets/capes/liquid-nebula-sheet.png",
    textureImage: "assets/capes/liquid-nebula-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "chronos",
    category: "capes",
    name: "Chronos",
    desc: "Concentric orbital rings and pixel planets circling a tiny white sun.",
    rarity: "legendary",
    tags: ["Animated", "Legendary"],
    price: 800,
    previewImage: "assets/capes/chronos-preview.png",
    sheetImage: "assets/capes/chronos-sheet.png",
    textureImage: "assets/capes/chronos-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "lunar-cycle",
    category: "capes",
    name: "Lunar Cycle",
    desc: "A single moon waxes and wanes through a clean phase loop.",
    rarity: "rare",
    tags: ["Animated", "Moon"],
    price: 380,
    previewImage: "assets/capes/lunar-cycle-preview.png",
    sheetImage: "assets/capes/lunar-cycle-sheet.png",
    textureImage: "assets/capes/lunar-cycle-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "cosmic-pulse",
    category: "capes",
    name: "Cosmic Pulse",
    desc: "A quiet digital grid; ice-white nodes cascade from shoulders to hem.",
    rarity: "uncommon",
    tags: ["Animated", "Grid"],
    price: 300,
    previewImage: "assets/capes/cosmic-pulse-preview.png",
    sheetImage: "assets/capes/cosmic-pulse-sheet.png",
    textureImage: "assets/capes/cosmic-pulse-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "aurora-borealis",
    category: "capes",
    name: "Aurora Borealis",
    desc: "Ethereal cyan curtains ripple like silk across a deep night sky.",
    rarity: "epic",
    tags: ["Animated", "Aurora"],
    price: 580,
    previewImage: "assets/capes/aurora-borealis-preview.png",
    sheetImage: "assets/capes/aurora-borealis-sheet.png",
    textureImage: "assets/capes/aurora-borealis-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "orion-shimmer",
    category: "capes",
    name: "Orion's Shimmer",
    desc: "A mapped constellation shimmering independently along faint silver links.",
    rarity: "rare",
    tags: ["Animated", "Constellation"],
    price: 420,
    previewImage: "assets/capes/orion-shimmer-preview.png",
    sheetImage: "assets/capes/orion-shimmer-sheet.png",
    textureImage: "assets/capes/orion-shimmer-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "glitch-void",
    category: "capes",
    name: "Glitch Void",
    desc: "Sleek black cloth that randomly slices, shifts, and flashes neon static.",
    rarity: "epic",
    tags: ["Animated", "Glitch"],
    price: 620,
    previewImage: "assets/capes/glitch-void-preview.png",
    sheetImage: "assets/capes/glitch-void-sheet.png",
    textureImage: "assets/capes/glitch-void-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "cosmic-dust",
    category: "capes",
    name: "Cosmic Dust",
    desc: "The hem dissolves into rising silver sparks that fade into the void.",
    rarity: "uncommon",
    tags: ["Animated", "Particles"],
    price: 280,
    previewImage: "assets/capes/cosmic-dust-preview.png",
    sheetImage: "assets/capes/cosmic-dust-sheet.png",
    textureImage: "assets/capes/cosmic-dust-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "supernova-burst",
    category: "capes",
    name: "Supernova Burst",
    desc: "A quiet field, then a white flash blooms into a fading stardust ring.",
    rarity: "legendary",
    tags: ["Animated", "Legendary"],
    price: 750,
    previewImage: "assets/capes/supernova-burst-preview.png",
    sheetImage: "assets/capes/supernova-burst-sheet.png",
    textureImage: "assets/capes/supernova-burst-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "satellite-signal",
    category: "capes",
    name: "Satellite Signal",
    desc: "A retro vector satellite sends crisp concentric waves into the dark.",
    rarity: "rare",
    tags: ["Animated", "Retro"],
    price: 360,
    previewImage: "assets/capes/satellite-signal-preview.png",
    sheetImage: "assets/capes/satellite-signal-sheet.png",
    textureImage: "assets/capes/satellite-signal-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "dark-matter-waves",
    category: "capes",
    name: "Dark Matter Waves",
    desc: "Satin dark-grey cloth disturbed by a continuous hypnotic ripple.",
    rarity: "epic",
    tags: ["Animated", "Subtle"],
    price: 500,
    previewImage: "assets/capes/dark-matter-waves-preview.png",
    sheetImage: "assets/capes/dark-matter-waves-sheet.png",
    textureImage: "assets/capes/dark-matter-waves-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "plus-sigil",
    category: "capes",
    name: "Plus Sigil",
    desc: "Space+ exclusive — a silver plus mark that slowly blooms and retracts in the dark.",
    rarity: "legendary",
    tags: ["Animated", "Space+", "Exclusive"],
    price: null,
    exclusive: "spaceplus",
    previewImage: "assets/capes/plus-sigil-preview.png",
    sheetImage: "assets/capes/plus-sigil-sheet.png",
    textureImage: "assets/capes/plus-sigil-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "member-orbit",
    category: "capes",
    name: "Member Orbit",
    desc: "Space+ exclusive — dual orbital rings with a soft silver pulse reserved for members.",
    rarity: "epic",
    tags: ["Animated", "Space+", "Exclusive"],
    price: null,
    exclusive: "spaceplus",
    previewImage: "assets/capes/member-orbit-preview.png",
    sheetImage: "assets/capes/member-orbit-sheet.png",
    textureImage: "assets/capes/member-orbit-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "priority-flare",
    category: "capes",
    name: "Priority Flare",
    desc: "Space+ exclusive — a quiet field then a crisp priority flare that echoes down the cape.",
    rarity: "legendary",
    tags: ["Animated", "Space+", "Exclusive"],
    price: null,
    exclusive: "spaceplus",
    previewImage: "assets/capes/priority-flare-preview.png",
    sheetImage: "assets/capes/priority-flare-sheet.png",
    textureImage: "assets/capes/priority-flare-texture.png",
    frameCount: 24,
    equipped: false,
  },
  {
    id: "space-pup",
    category: "pets",
    name: "Space Pup",
    desc: "A loyal pup in a tiny astronaut suit, orbiting your shoulder.",
    rarity: "rare",
    tags: ["Companion"],
    preview: "🐕",
    equipped: true,
  },
  {
    id: "star-fox",
    category: "pets",
    name: "Star Fox Pet",
    desc: "A cosmic fox with a glowing tail that leaves stardust in its wake.",
    rarity: "legendary",
    tags: ["Animated", "Rare Drop"],
    preview: "🦊",
    equipped: false,
  },
  {
    id: "orbital-cat",
    category: "pets",
    name: "Orbital Cat",
    desc: "A zero-gravity cat that drifts in a slow orbit around you.",
    rarity: "epic",
    tags: ["Floating"],
    preview: "🐱",
    equipped: false,
  },
  {
    id: "cosmic-slime",
    category: "pets",
    name: "Cosmic Slime",
    desc: "A translucent slime blob filled with tiny twinkling stars.",
    rarity: "common",
    tags: ["Starter"],
    preview: "✨",
    equipped: false,
  },
];

const cosmeticsState = { tab: "capes" };
const OWNED_COSMETICS_KEY = "sc-owned-cosmetics";
const EQUIPPED_COSMETICS_KEY = "sc-equipped-cosmetics";
const SPACEPLUS_SUB_KEY = "spaceplus-subscribed";

/** Username → role. Owner unlocks every cosmetic. */
const PROFILE_ROLES = {
  eagerz: {
    id: "owner",
    label: "Owner",
    grantsAllCosmetics: true,
  },
};

/** Latest auth snapshot for ownership / role checks. */
let currentAuthState = { isLoggedIn: false, profile: null };

/** Tags that are rarity labels — never shown on cape/pet cards. */
const RARITY_TAG_NAMES = new Set([
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "rare drop",
]);

function cosmeticDisplayTags(tags) {
  return (tags || []).filter((tag) => !RARITY_TAG_NAMES.has(String(tag).toLowerCase()));
}

function renderHomeNewsCard(item) {
  return `
    <article class="home-news-card" data-news="${item.id}">
      <div class="home-news-card-meta">
        <span class="home-news-card-tag">${escapeHtml(item.tag)}</span>
        <time class="home-news-card-date" datetime="${escapeHtml(item.date)}">${escapeHtml(item.date)}</time>
      </div>
      <h3 class="home-news-card-title">${escapeHtml(item.title)}</h3>
      <p class="home-news-card-desc">${escapeHtml(item.desc)}</p>
    </article>
  `;
}

function initHomeNews() {
  const list = document.getElementById("home-news-list");
  if (!list) return;
  list.innerHTML = HOME_NEWS.map(renderHomeNewsCard).join("");
}

function renderCapePreview(previewClass) {
  return `
    <div class="cape-preview" aria-hidden="true">
      <div class="cape-preview-model">
        <div class="cape-preview-cape ${previewClass}"></div>
        <div class="cape-preview-head"></div>
        <div class="cape-preview-torso"></div>
        <div class="cape-preview-legs">
          <div class="cape-preview-leg"></div>
          <div class="cape-preview-leg"></div>
        </div>
      </div>
    </div>`;
}

function getCurrentUsername() {
  return currentAuthState?.profile?.username || "";
}

function getPlayerRole(username = getCurrentUsername()) {
  if (!username) return null;
  return PROFILE_ROLES[String(username).trim().toLowerCase()] || null;
}

function isOwnerPlayer(username = getCurrentUsername()) {
  return getPlayerRole(username)?.id === "owner";
}

function isSpacePlusActive() {
  return localStorage.getItem(SPACEPLUS_SUB_KEY) === "true" || isOwnerPlayer();
}

function playerHasAllCosmetics() {
  return Boolean(getPlayerRole()?.grantsAllCosmetics);
}

function getOwnedCosmetics() {
  try {
    return JSON.parse(localStorage.getItem(OWNED_COSMETICS_KEY) || "[]");
  } catch {
    return [];
  }
}

function setOwnedCosmetics(ids) {
  localStorage.setItem(OWNED_COSMETICS_KEY, JSON.stringify(ids));
}

function isCosmeticOwned(id) {
  const item = COSMETICS.find((entry) => entry.id === id);
  if (!item) return false;
  if (playerHasAllCosmetics()) return true;
  if (item.exclusive === "spaceplus" && isSpacePlusActive()) return true;
  if (item.price == null && !item.exclusive) return true;
  return getOwnedCosmetics().includes(id);
}

function getEquippedCosmetics() {
  try {
    return JSON.parse(localStorage.getItem(EQUIPPED_COSMETICS_KEY) || "{}");
  } catch {
    return {};
  }
}

function setEquippedCosmetic(category, id) {
  const equipped = getEquippedCosmetics();
  if (id) equipped[category] = id;
  else delete equipped[category];
  localStorage.setItem(EQUIPPED_COSMETICS_KEY, JSON.stringify(equipped));
}

function syncCosmeticEquippedState() {
  const equipped = getEquippedCosmetics();
  COSMETICS.forEach((item) => {
    item.equipped = equipped[item.category] === item.id;
  });
}

function getCreditsBalance() {
  const stored = localStorage.getItem(CREDITS_STORAGE_KEY);
  const balance = stored !== null ? Number(stored) : 0;
  return Number.isFinite(balance) ? balance : 0;
}

function setCreditsBalance(credits) {
  const value = Math.max(0, Math.round(credits));
  localStorage.setItem(CREDITS_STORAGE_KEY, String(value));
  const balanceEl = document.getElementById("store-credit-balance");
  if (balanceEl) balanceEl.textContent = formatStoreCredits(value);
  return value;
}

function purchaseCosmetic(id) {
  const item = COSMETICS.find((entry) => entry.id === id);
  if (!item) return { success: false, error: "Item not found." };
  if (item.exclusive === "spaceplus") {
    return { success: false, error: "Space+ exclusive.", requiresSpacePlus: true };
  }
  if (item.price == null) return { success: false, error: "Not for sale." };
  if (isCosmeticOwned(id)) return { success: false, error: "Already owned." };

  const balance = getCreditsBalance();
  if (balance < item.price) {
    return { success: false, error: `Need ${formatStoreCredits(item.price - balance)} more credits.` };
  }

  setCreditsBalance(balance - item.price);
  const owned = getOwnedCosmetics();
  owned.push(id);
  setOwnedCosmetics(owned);
  return { success: true };
}

function renderAnimatedCapePreview(item) {
  const sheet = escapeHtml(item.sheetImage || item.previewImage || "");
  const alt = escapeHtml(item.name);
  return `
    <div class="cape-live-preview" aria-hidden="true">
      <div class="cape-live-cape-window">
        <img class="cape-live-sheet" src="${sheet}" alt="${alt} animation" />
      </div>
    </div>`;
}

function renderCosmeticPreview(item) {
  if (item.category === "capes" && (item.sheetImage || item.animImage)) {
    return renderAnimatedCapePreview(item);
  }
  if (item.previewImage) {
    const src = escapeHtml(item.previewImage);
    const alt = escapeHtml(item.name);
    return `<img class="cosmetic-preview-img" src="${src}" alt="${alt} preview" loading="lazy" />`;
  }
  if (item.category === "capes" && item.previewClass) {
    return renderCapePreview(item.previewClass);
  }
  return `<span class="cosmetic-preview-icon" aria-hidden="true">${item.preview || "✨"}</span>`;
}

function renderCosmeticCard(item) {
  const tags = cosmeticDisplayTags(item.tags)
    .map((tag) => `<span class="cosmetic-tag">${escapeHtml(tag)}</span>`)
    .join("");

  const previewClass = item.category === "capes" ? " cosmetic-preview--cape" : "";
  const owned = isCosmeticOwned(item.id);
  const isSpacePlusItem = item.exclusive === "spaceplus";

  let priceBlock = "";
  if (isSpacePlusItem && !owned) {
    priceBlock = `<div class="cosmetic-price-row">
         <span class="cosmetic-exclusive-badge">Space+</span>
         <button type="button" class="btn-cosmetic-spaceplus" data-open-spaceplus>Unlock with Space+</button>
       </div>`;
  } else if (item.price != null && !owned) {
    priceBlock = `<div class="cosmetic-price-row">
         <span class="cosmetic-price">
           <svg class="cosmetic-price-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4a2 2 0 010 4h-2a2 2 0 000 4h4"/></svg>
           ${formatStoreCredits(item.price)}
         </span>
         <button type="button" class="btn-cosmetic-buy" data-buy-cosmetic="${escapeHtml(item.id)}">Buy</button>
       </div>`;
  } else if (owned) {
    priceBlock = isSpacePlusItem
      ? `<div class="cosmetic-owned-badge">${playerHasAllCosmetics() ? "Owner unlocked" : "Space+ owned"}</div>`
      : item.price != null
        ? `<div class="cosmetic-owned-badge">${playerHasAllCosmetics() && !getOwnedCosmetics().includes(item.id) ? "Owner unlocked" : "Owned"}</div>`
        : "";
  }

  const equipToggle = owned
    ? `<label class="toggle" title="${item.equipped ? "Unequip" : "Equip"}">
         <input type="checkbox" ${item.equipped ? "checked" : ""} data-cosmetic-toggle="${item.id}" aria-label="Equip ${escapeHtml(item.name)}" />
         <span class="toggle-track"><span class="toggle-thumb"></span></span>
       </label>`
    : "";

  return `
    <article class="cosmetic-card ${item.equipped ? "equipped" : ""} ${owned ? "owned" : "locked"} ${isSpacePlusItem ? "spaceplus-exclusive" : ""}" data-cosmetic="${item.id}" data-category="${item.category}" data-open-cosmetic="${item.id}" role="button" tabindex="0">
      <div class="cosmetic-preview${previewClass}">
        ${renderCosmeticPreview(item)}
        ${isSpacePlusItem ? '<span class="cosmetic-spaceplus-flag">Space+</span>' : ""}
        ${item.equipped ? '<span class="cosmetic-equipped-badge">Equipped</span>' : ""}
      </div>
      <div class="cosmetic-body">
        <div class="cosmetic-header">
          <h3 class="cosmetic-title">${escapeHtml(item.name)}</h3>
          ${equipToggle}
        </div>
        <p class="cosmetic-desc">${escapeHtml(item.desc)}</p>
        ${tags ? `<div class="cosmetic-tags">${tags}</div>` : ""}
        ${priceBlock}
      </div>
    </article>`;
}

function getCosmeticsForTab(tab) {
  return COSMETICS.filter((item) => item.category === tab);
}

function updateCosmeticsMeta(tab) {
  const meta = document.getElementById("cosmetics-meta");
  if (!meta) return;

  const items = getCosmeticsForTab(tab);
  const equipped = items.find((item) => item.equipped);
  const label = tab === "capes" ? "cape" : "pet";
  meta.textContent = equipped
    ? `${items.length} ${label}s · ${equipped.name} equipped`
    : `${items.length} ${label}s · none equipped`;
}

function renderCosmeticsGrid() {
  const grid = document.getElementById("cosmetics-grid");
  if (!grid) return;

  const items = getCosmeticsForTab(cosmeticsState.tab);
  grid.innerHTML = items.length
    ? items.map(renderCosmeticCard).join("")
    : '<div class="cosmetics-empty">No cosmetics in this category yet.</div>';

  updateCosmeticsMeta(cosmeticsState.tab);

  if (cosmeticDetailOpen && cosmeticDetailId) {
    const still = COSMETICS.find((entry) => entry.id === cosmeticDetailId);
    if (still) renderCosmeticDetailContent(still);
  }
}

let cosmeticDetailOpen = false;
let cosmeticDetailId = null;

function renderCosmeticDetailContent(item) {
  const content = document.getElementById("cosmetic-detail-content");
  if (!content || !item) return;

  const owned = isCosmeticOwned(item.id);
  const isSpacePlusItem = item.exclusive === "spaceplus";
  const tags = cosmeticDisplayTags(item.tags)
    .map((tag) => `<span class="cosmetic-tag">${escapeHtml(tag)}</span>`)
    .join("");

  const preview = item.sheetImage
    ? `<div class="cosmetic-detail-hero">
         <div class="cape-live-cape-window cape-live-cape-window--xl">
           <img class="cape-live-sheet" src="${escapeHtml(item.sheetImage)}" alt="${escapeHtml(item.name)}" />
         </div>
       </div>`
    : `<div class="cosmetic-detail-hero cosmetic-detail-hero--icon">${renderCosmeticPreview(item)}</div>`;

  let actions = "";
  if (isSpacePlusItem && !owned) {
    actions = `
      <div class="cosmetic-detail-actions">
        <span class="cosmetic-exclusive-badge">Space+ Exclusive</span>
        <button type="button" class="btn-cosmetic-spaceplus btn-cosmetic-buy--lg" data-open-spaceplus>Upgrade to Space+</button>
      </div>`;
  } else if (item.price != null && !owned) {
    actions = `
      <div class="cosmetic-detail-actions">
        <div class="cosmetic-detail-price">
          <span class="cosmetic-price">
            <svg class="cosmetic-price-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h4a2 2 0 010 4h-2a2 2 0 000 4h4"/></svg>
            ${formatStoreCredits(item.price)}
          </span>
          <span class="cosmetic-detail-balance">Balance: ${formatStoreCredits(getCreditsBalance())}</span>
        </div>
        <button type="button" class="btn-cosmetic-buy btn-cosmetic-buy--lg" data-buy-cosmetic="${escapeHtml(item.id)}">Buy Cape</button>
      </div>`;
  } else if (owned) {
    actions = `
      <div class="cosmetic-detail-actions">
        <div class="cosmetic-owned-badge">${playerHasAllCosmetics() ? "Unlocked by Owner role" : isSpacePlusItem ? "Included with Space+" : "Owned"}</div>
        <label class="toggle cosmetic-detail-equip" title="${item.equipped ? "Unequip" : "Equip"}">
          <span class="cosmetic-detail-equip-label">${item.equipped ? "Equipped" : "Equip"}</span>
          <input type="checkbox" ${item.equipped ? "checked" : ""} data-cosmetic-toggle="${item.id}" aria-label="Equip ${escapeHtml(item.name)}" />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>`;
  }

  content.innerHTML = `
    ${preview}
    <header class="cosmetic-detail-header">
      <div>
        <p class="cosmetic-detail-kicker">${escapeHtml(item.category === "capes" ? "Cape" : "Pet")}${isSpacePlusItem ? " · Space+" : ""}</p>
        <h2 class="cosmetic-detail-title" id="cosmetic-detail-title">${escapeHtml(item.name)}</h2>
      </div>
    </header>
    <p class="cosmetic-detail-desc">${escapeHtml(item.desc)}</p>
    ${tags ? `<div class="cosmetic-tags cosmetic-detail-tags">${tags}</div>` : ""}
    ${item.frameCount ? `<p class="cosmetic-detail-meta">${item.frameCount}-frame animated loop · Minecraft cape texture</p>` : ""}
    ${actions}
  `;
}

function openCosmeticDetail(id) {
  const overlay = document.getElementById("cosmetic-detail-overlay");
  const item = COSMETICS.find((entry) => entry.id === id);
  if (!overlay || !item) return;

  cosmeticDetailId = id;
  cosmeticDetailOpen = true;
  document.body.classList.add("cosmetic-detail-open");
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  renderCosmeticDetailContent(item);
}

function closeCosmeticDetail() {
  const overlay = document.getElementById("cosmetic-detail-overlay");
  if (!overlay || overlay.hidden) return;

  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  cosmeticDetailOpen = false;
  cosmeticDetailId = null;
  document.body.classList.remove("cosmetic-detail-open");
}

function initCosmeticDetailPanel() {
  const overlay = document.getElementById("cosmetic-detail-overlay");
  if (!overlay) return;

  overlay.addEventListener("click", (e) => {
    if (e.target.closest("[data-cosmetic-detail-close]")) {
      closeCosmeticDetail();
      return;
    }

    if (e.target.closest("[data-open-spaceplus]")) {
      openSpacePlusFromCosmetics();
      return;
    }

    const buyBtn = e.target.closest("[data-buy-cosmetic]");
    if (buyBtn) {
      const id = buyBtn.dataset.buyCosmetic;
      const result = purchaseCosmetic(id);
      if (!result.success) {
        buyBtn.classList.add("error");
        buyBtn.textContent = result.error?.length > 28 ? "Not enough credits" : result.error;
        setTimeout(() => {
          buyBtn.classList.remove("error");
          buyBtn.textContent = "Buy Cape";
        }, 2200);
        return;
      }
      const item = COSMETICS.find((entry) => entry.id === id);
      if (item) {
        COSMETICS.forEach((entry) => {
          if (entry.category === item.category) entry.equipped = false;
        });
        item.equipped = true;
        setEquippedCosmetic(item.category, id);
      }
      renderCosmeticsGrid();
      return;
    }
  });

  overlay.addEventListener("change", (e) => {
    const id = e.target.dataset.cosmeticToggle;
    if (!id) return;
    const item = COSMETICS.find((entry) => entry.id === id);
    if (!item) return;
    if (item.price && !isCosmeticOwned(id)) {
      e.target.checked = false;
      return;
    }
    if (e.target.checked) {
      COSMETICS.forEach((entry) => {
        if (entry.category === item.category) entry.equipped = entry.id === id;
      });
      setEquippedCosmetic(item.category, id);
    } else {
      item.equipped = false;
      setEquippedCosmetic(item.category, null);
    }
    renderCosmeticsGrid();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cosmeticDetailOpen) closeCosmeticDetail();
  });
}

function getInstalledMods() {
  try {
    return JSON.parse(localStorage.getItem(INSTALLED_KEY) || "{}");
  } catch {
    return {};
  }
}

function setInstalledMod(projectId, data) {
  const installed = getInstalledMods();
  installed[projectId] = data;
  localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));
  updateActiveModCount();
}

function removeInstalledMod(projectId) {
  const installed = getInstalledMods();
  delete installed[projectId];
  localStorage.setItem(INSTALLED_KEY, JSON.stringify(installed));
  updateActiveModCount();
}

function isModInstalled(projectId) {
  return Boolean(getInstalledMods()[projectId]);
}

function formatFooterVersion() {
  const loaderLabel = modrinthState.homeLoader === "vanilla" ? "Vanilla" : "Fabric";
  return `${modrinthState.version} - ${loaderLabel}`;
}

function syncLaunchToApp() {
  modrinthState.loader = modrinthState.homeLoader === "vanilla" ? "vanilla" : modrinthState.homeLoader;

  const footerVersion = document.getElementById("footer-version");
  if (footerVersion) footerVersion.textContent = formatFooterVersion();

  const modrinthLoader = document.getElementById("modrinth-loader");
  if (modrinthLoader && modrinthState.homeLoader === "fabric") {
    modrinthLoader.value = "fabric";
  }
}

function initLaunchSelectors() {
  const versionSelect = document.getElementById("home-version");
  const loaderSelect = document.getElementById("home-loader");
  if (!versionSelect || !loaderSelect) return;

  versionSelect.innerHTML = MINECRAFT_VERSIONS.map(
    (v) => `<option value="${v}"${v === modrinthState.version ? " selected" : ""}>${v}</option>`
  ).join("");

  loaderSelect.value = modrinthState.homeLoader;
  syncLaunchToApp();

  versionSelect.addEventListener("change", () => {
    modrinthState.version = versionSelect.value;
    syncLaunchToApp();
    if (modrinthState.loaded) {
      modrinthState.offset = 0;
      fetchModrinthMods();
    }
  });

  loaderSelect.addEventListener("change", () => {
    modrinthState.homeLoader = loaderSelect.value;
    syncLaunchToApp();
    if (modrinthState.loaded) {
      modrinthState.offset = 0;
      fetchModrinthMods();
    }
  });
}

function syncModrinthFiltersFromSettings() {
  const loaderSelect = document.getElementById("modrinth-loader");
  if (loaderSelect) loaderSelect.value = modrinthState.loader;
}

function renderModrinthCard(hit) {
  const installed = isModInstalled(hit.project_id);
  return `
    <article class="modrinth-card ${installed ? "installed" : ""}" data-project-id="${hit.project_id}">
      <img class="modrinth-icon" src="${hit.icon_url}" alt="" loading="lazy" />
      <div class="modrinth-body">
        <div class="modrinth-title-row">
          <h3 class="modrinth-title" title="${hit.title}">${hit.title}</h3>
        </div>
        <div class="modrinth-author">by ${hit.author}</div>
        <p class="modrinth-desc">${hit.description}</p>
        <div class="modrinth-stats">
          <span><strong>${Modrinth.formatDownloads(hit.downloads)}</strong> downloads</span>
          <span><strong>${Modrinth.formatDownloads(hit.follows)}</strong> followers</span>
        </div>
        <div class="modrinth-actions">
          <button type="button" class="btn-mod ${installed ? "installed" : "primary"}" data-install="${hit.project_id}" data-slug="${hit.slug}">
            ${installed ? "Installed" : "Install"}
          </button>
          <button type="button" class="btn-mod" data-view-mod="${escapeHtml(hit.slug)}" data-project-id="${hit.project_id}" data-author="${escapeHtml(hit.author)}">View</button>
        </div>
      </div>
    </article>`;
}

function renderModrinthSkeletons(count = 6) {
  return Array.from({ length: count }, () => '<div class="modrinth-skeleton"></div>').join("");
}

function renderModrinthPagination() {
  const pagination = document.getElementById("modrinth-pagination");
  if (!pagination) return;

  const page = Math.floor(modrinthState.offset / MODRINTH_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(modrinthState.totalHits / MODRINTH_PAGE_SIZE));

  pagination.innerHTML = `
    <button type="button" id="modrinth-prev" ${modrinthState.offset === 0 ? "disabled" : ""}>Previous</button>
    <span>Page ${page} of ${totalPages}</span>
    <button type="button" id="modrinth-next" ${page >= totalPages ? "disabled" : ""}>Next</button>`;

  document.getElementById("modrinth-prev")?.addEventListener("click", () => {
    modrinthState.offset = Math.max(0, modrinthState.offset - MODRINTH_PAGE_SIZE);
    fetchModrinthMods();
  });

  document.getElementById("modrinth-next")?.addEventListener("click", () => {
    modrinthState.offset += MODRINTH_PAGE_SIZE;
    fetchModrinthMods();
  });
}

async function fetchModrinthMods() {
  if (modrinthState.loading) return;

  const grid = document.getElementById("modrinth-grid");
  const meta = document.getElementById("modrinth-meta");
  if (!grid) return;

  modrinthState.loading = true;
  grid.innerHTML = renderModrinthSkeletons();
  if (meta) meta.textContent = "Loading from Modrinth…";

  try {
    const data = await Modrinth.search({
      query: modrinthState.query,
      loader: modrinthState.loader,
      version: modrinthState.version,
      index: modrinthState.index,
      offset: modrinthState.offset,
      limit: MODRINTH_PAGE_SIZE,
    });

    modrinthState.totalHits = data.total_hits;
    modrinthState.loaded = true;

    if (!data.hits.length) {
      grid.innerHTML = '<div class="modrinth-empty">No mods found. Try a different search or filter.</div>';
    } else {
      grid.innerHTML = data.hits.map(renderModrinthCard).join("");
    }

    if (meta) {
      const loaderLabel = modrinthState.homeLoader === "vanilla" ? "vanilla" : modrinthState.loader;
      meta.textContent = `${data.total_hits.toLocaleString()} mods · ${loaderLabel} · Minecraft ${modrinthState.version}`;
    }

    renderModrinthPagination();
  } catch (err) {
    grid.innerHTML = `<div class="modrinth-error">Failed to load mods: ${err.message}</div>`;
    if (meta) meta.textContent = "";
    document.getElementById("modrinth-pagination").innerHTML = "";
  } finally {
    modrinthState.loading = false;
  }
}

async function handleModInstall(projectId, slug, btn) {
  if (isModInstalled(projectId)) {
    removeInstalledMod(projectId);
    syncInstallUI(projectId, false);
    return;
  }

  btn.disabled = true;
  btn.textContent = "Installing…";

  try {
    const version = await Modrinth.getCompatibleVersion(projectId, modrinthState.loader, modrinthState.version);
    if (!version) throw new Error("No compatible version found");

    setInstalledMod(projectId, {
      slug,
      title: version.name,
      versionId: version.id,
      versionNumber: version.version_number,
      installedAt: Date.now(),
    });

    syncInstallUI(projectId, true);
  } catch (err) {
    document.querySelectorAll(`[data-install="${projectId}"]`).forEach((installBtn) => {
      installBtn.textContent = "Failed";
      setTimeout(() => setInstallButtonState(installBtn, false), 2000);
    });
    console.error("Install failed:", err);
  } finally {
    document.querySelectorAll(`[data-install="${projectId}"]`).forEach((installBtn) => {
      installBtn.disabled = false;
    });
  }
}

function renderModDetailLoading() {
  const content = document.getElementById("mod-detail-content");
  if (!content) return;
  content.innerHTML = `
    <div class="mod-detail-loading">
      <div class="mod-detail-spinner"></div>
      <p>Loading mod details…</p>
    </div>`;
}

function renderModDetailError(message) {
  const content = document.getElementById("mod-detail-content");
  if (!content) return;
  content.innerHTML = `
    <div class="mod-detail-error">
      <p>Failed to load mod details</p>
      <p class="mod-detail-error-msg">${escapeHtml(message)}</p>
      <button type="button" class="btn-mod" data-mod-detail-close>Close</button>
    </div>`;
}

function renderModDetailContent(project, { author } = {}) {
  const content = document.getElementById("mod-detail-content");
  if (!content) return;

  const installed = isModInstalled(project.id);
  const displayAuthor = author || "Unknown";
  const loaders = project.loaders || [];
  const categories = [...(project.categories || []), ...(project.additional_categories || [])];
  const gameVersions = [...(project.game_versions || [])].reverse();
  const showBody = project.body && project.body.trim() !== project.description?.trim();

  content.innerHTML = `
    <header class="mod-detail-header">
      <img class="mod-detail-icon" src="${escapeHtml(project.icon_url)}" alt="" />
      <div class="mod-detail-header-text">
        <h2 class="mod-detail-title" id="mod-detail-title">${escapeHtml(project.title)}</h2>
        <p class="mod-detail-author">by ${escapeHtml(displayAuthor)}</p>
      </div>
    </header>
    <div class="mod-detail-stats">
      <span><strong>${Modrinth.formatDownloads(project.downloads)}</strong> downloads</span>
      <span><strong>${Modrinth.formatDownloads(project.followers ?? 0)}</strong> followers</span>
    </div>
    <p class="mod-detail-desc">${escapeHtml(project.description)}</p>
    ${showBody ? `<div class="mod-detail-body">${escapeHtml(project.body)}</div>` : ""}
    ${loaders.length ? `<div class="mod-detail-section"><h3>Loaders</h3><div class="mod-detail-tags">${renderTagList(loaders)}</div></div>` : ""}
    ${categories.length ? `<div class="mod-detail-section"><h3>Categories</h3><div class="mod-detail-tags">${renderTagList(categories)}</div></div>` : ""}
    ${gameVersions.length ? `<div class="mod-detail-section"><h3>Game versions</h3><div class="mod-detail-tags">${renderTagList(gameVersions, 12)}</div></div>` : ""}
    <div class="mod-detail-actions">
      <button type="button" class="btn-mod ${installed ? "installed" : "primary"}" data-install="${project.id}" data-slug="${escapeHtml(project.slug)}">
        ${installed ? "Installed" : "Install"}
      </button>
    </div>
    <a class="mod-detail-external" href="${Modrinth.projectUrl(project.slug)}" target="_blank" rel="noopener">View on Modrinth ↗</a>`;
}

function openModDetail(slug, { author } = {}) {
  const overlay = document.getElementById("mod-detail-overlay");
  if (!overlay) return;

  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  modDetailOpen = true;
  document.body.classList.add("mod-detail-open");
  renderModDetailLoading();

  Modrinth.getProject(slug)
    .then((project) => renderModDetailContent(project, { author }))
    .catch((err) => renderModDetailError(err.message));
}

function closeModDetail() {
  const overlay = document.getElementById("mod-detail-overlay");
  if (!overlay || overlay.hidden) return;

  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  modDetailOpen = false;
  document.body.classList.remove("mod-detail-open");
}

function initModDetailPanel() {
  const overlay = document.getElementById("mod-detail-overlay");
  if (!overlay) return;

  overlay.addEventListener("click", (e) => {
    if (e.target.closest("[data-mod-detail-close]")) {
      closeModDetail();
      return;
    }

    const installBtn = e.target.closest("[data-install]");
    if (installBtn) {
      handleModInstall(installBtn.dataset.install, installBtn.dataset.slug, installBtn);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modDetailOpen) closeModDetail();
  });
}

function initModrinth() {
  const grid = document.getElementById("modrinth-grid");
  const searchInput = document.getElementById("modrinth-search");
  const loaderSelect = document.getElementById("modrinth-loader");
  const sortSelect = document.getElementById("modrinth-sort");
  if (!grid) return;

  syncModrinthFiltersFromSettings();

  let searchDebounce;
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      modrinthState.query = searchInput.value;
      modrinthState.offset = 0;
      fetchModrinthMods();
    }, 350);
  });

  loaderSelect?.addEventListener("change", () => {
    modrinthState.loader = loaderSelect.value;
    modrinthState.offset = 0;
    fetchModrinthMods();
  });

  sortSelect?.addEventListener("change", () => {
    modrinthState.index = sortSelect.value;
    modrinthState.offset = 0;
    fetchModrinthMods();
  });

  grid.addEventListener("click", (e) => {
    const installBtn = e.target.closest("[data-install]");
    if (installBtn) {
      handleModInstall(installBtn.dataset.install, installBtn.dataset.slug, installBtn);
      return;
    }

    const viewBtn = e.target.closest("[data-view-mod]");
    if (viewBtn) {
      openModDetail(viewBtn.dataset.viewMod, { author: viewBtn.dataset.author });
    }
  });
}

function updateActiveModCount() {
  // Reserved for future dashboard use; installed count lives in localStorage.
}

function updateHeroGreeting(state) {
  const nameEl = document.getElementById("hero-greeting-name");
  if (!nameEl) return;

  const loggedIn = Boolean(state?.isLoggedIn && state?.profile);
  nameEl.textContent = loggedIn ? state.profile.username : "Guest";
}

function navigateToView(viewId) {
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
  const views = document.querySelectorAll(".view");
  if (!navBtn) return;
  document.querySelectorAll(".nav-btn[data-view]").forEach((b) => b.classList.toggle("active", b === navBtn));
  views.forEach((v) => v.classList.toggle("active", v.id === `view-${viewId}`));

  if (viewId === "mods" && !modrinthState.loaded && !modrinthState.loading) {
    syncModrinthFiltersFromSettings();
    fetchModrinthMods();
  }
}

window.navigateToView = navigateToView;
window.isSpacePlusActive = isSpacePlusActive;

function openSpacePlusFromCosmetics() {
  closeCosmeticDetail();
  navigateToView("spaceplus");
}

function updateTitlebarPlayer(state) {
  currentAuthState = {
    isLoggedIn: Boolean(state?.isLoggedIn && state?.profile),
    profile: state?.profile || null,
  };
  updateHeroGreeting(state);

  const nameEl = document.getElementById("titlebar-player-name");
  const dotEl = document.getElementById("titlebar-status-dot");
  const roleEl = document.getElementById("titlebar-role-badge");
  if (!nameEl || !dotEl) return;

  const loggedIn = Boolean(state?.isLoggedIn && state?.profile);
  const username = loggedIn ? state.profile.username : "Guest";
  nameEl.textContent = username;

  const role = loggedIn ? getPlayerRole(username) : null;
  if (roleEl) {
    if (role) {
      roleEl.hidden = false;
      roleEl.textContent = role.label;
      roleEl.dataset.role = role.id;
    } else {
      roleEl.hidden = true;
      roleEl.textContent = "";
      delete roleEl.dataset.role;
    }
  }

  const inGame = localStorage.getItem(IN_GAME_KEY) === "true";

  dotEl.classList.toggle("online", inGame);
  dotEl.classList.toggle("offline", !inGame);
  dotEl.setAttribute("title", inGame ? "In game" : "Not in game");

  // Owner / Space+ ownership can change with auth — refresh cosmetics UI if visible
  if (document.getElementById("cosmetics-grid")) {
    syncCosmeticEquippedState();
    renderCosmeticsGrid();
  }
}

function refreshTitlebarPlayer() {
  const api = window.electronAPI;
  if (api) {
    api.getAuthProfile().then(updateTitlebarPlayer);
  } else {
    updateTitlebarPlayer({ isLoggedIn: false, profile: null });
  }
}

function setInGame(inGame) {
  localStorage.setItem(IN_GAME_KEY, inGame ? "true" : "false");
  refreshTitlebarPlayer();
}

function initTitlebarPlayer() {
  const api = window.electronAPI;
  if (!api) {
    updateTitlebarPlayer({ isLoggedIn: false, profile: null });
    return;
  }

  api.getAuthProfile().then(updateTitlebarPlayer);
  api.onAuthStateChanged(updateTitlebarPlayer);
}

function initWindowControls() {
  const minimizeBtn = document.getElementById("btn-minimize");
  const maximizeBtn = document.getElementById("btn-maximize");
  const closeBtn = document.getElementById("btn-close");
  const api = window.electronAPI;

  if (!api) return;

  minimizeBtn?.addEventListener("click", () => api.minimizeWindow());
  closeBtn?.addEventListener("click", () => api.closeWindow());

  maximizeBtn?.addEventListener("click", async () => {
    await api.maximizeWindow();
  });

  api.isMaximized().then(updateMaximizeIcon);
  api.onMaximizedChanged(updateMaximizeIcon);
}

function updateMaximizeIcon(isMaximized) {
  const btn = document.getElementById("btn-maximize");
  if (!btn) return;

  btn.innerHTML = isMaximized
    ? `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
         <path d="M2 2h6v6H2z"/><path d="M4 4h4v4"/>
       </svg>`
    : `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
         <rect x="0.5" y="0.5" width="9" height="9"/>
       </svg>`;
  btn.setAttribute("aria-label", isMaximized ? "Restore" : "Maximize");
}

function initNavigation() {
  const navBtns = document.querySelectorAll(".nav-btn[data-view]");

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      navigateToView(btn.dataset.view);
    });
  });
}
function initCosmetics() {
  const grid = document.getElementById("cosmetics-grid");
  const tabs = document.querySelectorAll("[data-cosmetics-tab]");
  if (!grid) return;

  syncCosmeticEquippedState();
  renderCosmeticsGrid();

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const nextTab = tab.dataset.cosmeticsTab;
      if (!nextTab || nextTab === cosmeticsState.tab) return;

      cosmeticsState.tab = nextTab;
      tabs.forEach((btn) => {
        const isActive = btn.dataset.cosmeticsTab === nextTab;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      renderCosmeticsGrid();
    });
  });

  grid.addEventListener("click", (e) => {
    const spacePlusBtn = e.target.closest("[data-open-spaceplus]");
    if (spacePlusBtn) {
      e.stopPropagation();
      openSpacePlusFromCosmetics();
      return;
    }

    if (e.target.closest("[data-buy-cosmetic]") || e.target.closest(".toggle") || e.target.closest("input")) {
      const buyBtn = e.target.closest("[data-buy-cosmetic]");
      if (buyBtn) {
        e.stopPropagation();
        const id = buyBtn.dataset.buyCosmetic;
        const result = purchaseCosmetic(id);
        if (!result.success) {
          buyBtn.classList.add("error");
          buyBtn.textContent = result.error?.length > 24 ? "Not enough credits" : result.error;
          setTimeout(() => {
            buyBtn.classList.remove("error");
            buyBtn.textContent = "Buy";
          }, 2200);
          return;
        }
        const item = COSMETICS.find((entry) => entry.id === id);
        if (item) {
          COSMETICS.forEach((entry) => {
            if (entry.category === item.category) entry.equipped = false;
          });
          item.equipped = true;
          setEquippedCosmetic(item.category, id);
        }
        renderCosmeticsGrid();
      }
      return;
    }

    const card = e.target.closest("[data-open-cosmetic]");
    if (card) openCosmeticDetail(card.dataset.openCosmetic);
  });

  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-open-cosmetic]");
    if (!card || e.target.closest("input") || e.target.closest("button")) return;
    e.preventDefault();
    openCosmeticDetail(card.dataset.openCosmetic);
  });

  grid.addEventListener("change", (e) => {
    const id = e.target.dataset.cosmeticToggle;
    if (!id) return;

    const item = COSMETICS.find((entry) => entry.id === id);
    if (!item) return;
    if (item.price && !isCosmeticOwned(id)) {
      e.target.checked = false;
      return;
    }

    if (e.target.checked) {
      COSMETICS.forEach((entry) => {
        if (entry.category === item.category) entry.equipped = entry.id === id;
      });
      setEquippedCosmetic(item.category, id);
    } else {
      item.equipped = false;
      setEquippedCosmetic(item.category, null);
    }

    renderCosmeticsGrid();
  });
}

function initAccount() {
  const signInBtn = document.getElementById("account-signin-btn");
  const signOutBtnEl = document.getElementById("account-signout-btn");
  const accountSidebar = document.querySelector(".account-sidebar");
  const api = window.electronAPI;

  if (!api) return;

  function formatExpires(expiresAt) {
    if (!expiresAt) return "—";
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function setSignInLoading(loading) {
    if (!signInBtn) return;
    signInBtn.classList.toggle("loading", loading);
    signInBtn.disabled = loading;
    signInBtn.setAttribute("aria-busy", loading ? "true" : "false");
  }

  function updatePlayButton(loggedIn) {
    const playBtn = document.querySelector(".btn-play");
    if (!playBtn) return;

    playBtn.disabled = !loggedIn;
    playBtn.setAttribute("aria-disabled", loggedIn ? "false" : "true");
    playBtn.classList.toggle("ready", loggedIn);
    playBtn.title = loggedIn ? "Launch Minecraft" : "Sign in to play";
  }

  function applyAuthState(state) {
    currentAuthState = {
      isLoggedIn: Boolean(state?.isLoggedIn && state?.profile),
      profile: state?.profile || null,
    };

    const loggedIn = currentAuthState.isLoggedIn;
    const profile = currentAuthState.profile;
    const role = loggedIn ? getPlayerRole(profile?.username) : null;

    const avatar = document.getElementById("account-avatar");
    const username = document.getElementById("account-username");
    const email = document.getElementById("account-email");
    const status = document.getElementById("account-status");
    const msStatus = document.getElementById("account-ms-status");
    const mcUsername = document.getElementById("account-mc-username");
    const mcUuid = document.getElementById("account-mc-uuid");
    const sessionExpires = document.getElementById("account-session-expires");
    const roleBadge = document.getElementById("account-role-badge");
    const roleRow = document.getElementById("account-role-value");
    const spacePlusRow = document.getElementById("account-spaceplus-value");

    if (loggedIn && profile) {
      if (avatar) {
        const skin =
          profile.skinUrl ||
          (profile.uuid
            ? `https://mc-heads.net/avatar/${String(profile.uuid).replace(/-/g, "")}/96`
            : "https://mc-heads.net/avatar/MHF_Steve/96");
        avatar.alt = profile.username ? `${profile.username}'s avatar` : "Player avatar";
        avatar.onerror = () => {
          avatar.onerror = null;
          const name = profile.username || "MHF_Steve";
          avatar.src = `https://mc-heads.net/avatar/${encodeURIComponent(name)}/96`;
        };
        avatar.src = skin;
      }
      if (username) username.textContent = profile.username;
      if (email) email.textContent = "Microsoft account linked";
      if (status) {
        status.textContent = "Online";
        status.classList.add("online");
      }
      if (msStatus) {
        msStatus.textContent = "Connected";
        msStatus.classList.remove("muted");
      }
      if (mcUsername) {
        mcUsername.textContent = profile.username;
        mcUsername.classList.remove("muted");
      }
      if (mcUuid) {
        mcUuid.textContent = profile.uuid;
        mcUuid.classList.remove("muted");
      }
      if (sessionExpires) sessionExpires.textContent = formatExpires(profile.expiresAt);

      if (roleBadge) {
        if (role) {
          roleBadge.hidden = false;
          roleBadge.textContent = role.label;
          roleBadge.dataset.role = role.id;
        } else {
          roleBadge.hidden = true;
          roleBadge.textContent = "";
          delete roleBadge.dataset.role;
        }
      }
      if (roleRow) {
        roleRow.textContent = role ? role.label : "Player";
        roleRow.classList.toggle("muted", !role);
      }
      if (spacePlusRow) {
        const plus = isSpacePlusActive();
        spacePlusRow.textContent = plus ? (isOwnerPlayer() ? "Included (Owner)" : "Active") : "Not subscribed";
        spacePlusRow.classList.toggle("muted", !plus);
      }

      signInBtn?.classList.add("hidden");
      signOutBtnEl?.classList.remove("hidden");
      accountSidebar?.classList.add("logged-in");
    } else {
      if (avatar) {
        avatar.onerror = null;
        avatar.alt = "";
        avatar.src = "https://mc-heads.net/avatar/MHF_Steve/96";
      }
      if (username) username.textContent = "Guest";
      if (email) email.textContent = "Not signed in";
      if (status) {
        status.textContent = "Offline";
        status.classList.remove("online");
      }
      if (msStatus) {
        msStatus.textContent = "Not connected";
        msStatus.classList.add("muted");
      }
      if (mcUsername) {
        mcUsername.textContent = "—";
        mcUsername.classList.add("muted");
      }
      if (mcUuid) {
        mcUuid.textContent = "—";
        mcUuid.classList.add("muted");
      }
      if (sessionExpires) sessionExpires.textContent = "—";
      if (roleBadge) {
        roleBadge.hidden = true;
        roleBadge.textContent = "";
        delete roleBadge.dataset.role;
      }
      if (roleRow) {
        roleRow.textContent = "—";
        roleRow.classList.add("muted");
      }
      if (spacePlusRow) {
        spacePlusRow.textContent = "—";
        spacePlusRow.classList.add("muted");
      }

      signInBtn?.classList.remove("hidden", "loading");
      signOutBtnEl?.classList.add("hidden");
      accountSidebar?.classList.remove("logged-in");
      setSignInLoading(false);
      localStorage.removeItem(IN_GAME_KEY);
    }

    updatePlayButton(loggedIn);
    updateTitlebarPlayer(currentAuthState);
    updateHeroGreeting(currentAuthState);
  }

  signInBtn?.addEventListener("click", async () => {
    setSignInLoading(true);
    try {
      const result = await api.loginWithMicrosoft();
      if (!result?.success) {
        console.warn("Login failed:", result?.error);
      }
      applyAuthState({
        isLoggedIn: result?.success,
        profile: result?.profile ?? null,
      });
    } catch (err) {
      console.error("Login error:", err);
      applyAuthState({ isLoggedIn: false, profile: null });
    } finally {
      setSignInLoading(false);
    }
  });

  signOutBtnEl?.addEventListener("click", async () => {
    await api.logout();
    applyAuthState({ isLoggedIn: false, profile: null });
  });

  api.getAuthProfile().then(applyAuthState);
  api.onAuthStateChanged(applyAuthState);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function getAccentColor(accentId) {
  return ACCENT_COLORS.find((color) => color.id === accentId) || ACCENT_COLORS[0];
}

function applyAccentColor(accentId) {
  const color = getAccentColor(accentId);
  const [r, g, b] = hexToRgb(color.value);

  document.documentElement.style.setProperty("--sc-accent", color.value);
  document.documentElement.style.setProperty("--sc-accent-rgb", `${r}, ${g}, ${b}`);
  document.documentElement.style.setProperty("--sc-accent-muted", `rgba(${r}, ${g}, ${b}, 0.15)`);
  document.documentElement.style.setProperty("--sc-accent-glow", `rgba(${r}, ${g}, ${b}, 0.22)`);

  document.querySelectorAll(".accent-swatch").forEach((swatch) => {
    const isActive = swatch.dataset.accent === color.id;
    swatch.classList.toggle("active", isActive);
    swatch.setAttribute("aria-checked", isActive ? "true" : "false");
  });
}

function applyBackgroundBlur(enabled) {
  document.body.classList.toggle("blur-bg", enabled);
}

function applyClearPanels(enabled) {
  document.body.classList.toggle("clear-panels", enabled);
}

function loadStoredPreferences() {
  const storedAccent = localStorage.getItem(ACCENT_KEY);
  applyAccentColor(storedAccent || ACCENT_COLORS[0].id);

  const storedBlur = localStorage.getItem(BLUR_BG_KEY);
  applyBackgroundBlur(storedBlur === "true");

  // Default on for first launch; only disable when the user explicitly turns it off.
  const storedClearPanels = localStorage.getItem(CLEAR_PANELS_KEY);
  if (storedClearPanels === null) {
    localStorage.setItem(CLEAR_PANELS_KEY, "true");
  }
  applyClearPanels(localStorage.getItem(CLEAR_PANELS_KEY) !== "false");
}

function getRamGb() {
  const stored = Number(localStorage.getItem(RAM_KEY));
  if (Number.isFinite(stored) && stored >= 2 && stored <= 16) return stored;
  return 4;
}

function applyRamSetting(gb) {
  const value = Math.min(16, Math.max(2, Math.round(Number(gb) || 4)));
  localStorage.setItem(RAM_KEY, String(value));
  const ramSlider = document.getElementById("ram-slider");
  const ramValue = document.getElementById("ram-value");
  const footerRam = document.getElementById("footer-ram");
  if (ramSlider) ramSlider.value = String(value);
  const label = `${value} GB`;
  if (ramValue) ramValue.textContent = label;
  if (footerRam) footerRam.textContent = label;
  return value;
}

function initSettings() {
  const accentPicker = document.getElementById("accent-picker");
  const blurToggle = document.getElementById("blur-bg-toggle");
  const clearPanelsToggle = document.getElementById("clear-panels-toggle");
  const ramSlider = document.getElementById("ram-slider");

  if (accentPicker) {
    accentPicker.innerHTML = ACCENT_COLORS.map(
      (color) => `
        <button
          type="button"
          class="accent-swatch"
          data-accent="${color.id}"
          role="radio"
          aria-checked="false"
          aria-label="${color.label}"
          title="${color.label}"
        ></button>`
    ).join("");

    const storedAccent = localStorage.getItem(ACCENT_KEY) || ACCENT_COLORS[0].id;
    applyAccentColor(storedAccent);

    accentPicker.addEventListener("click", (e) => {
      const swatch = e.target.closest("[data-accent]");
      if (!swatch) return;

      const accentId = swatch.dataset.accent;
      localStorage.setItem(ACCENT_KEY, accentId);
      applyAccentColor(accentId);
    });
  }

  if (blurToggle) {
    blurToggle.checked = localStorage.getItem(BLUR_BG_KEY) === "true";

    blurToggle.addEventListener("change", () => {
      localStorage.setItem(BLUR_BG_KEY, blurToggle.checked ? "true" : "false");
      applyBackgroundBlur(blurToggle.checked);
    });
  }

  if (clearPanelsToggle) {
    clearPanelsToggle.checked = localStorage.getItem(CLEAR_PANELS_KEY) !== "false";

    clearPanelsToggle.addEventListener("change", () => {
      localStorage.setItem(CLEAR_PANELS_KEY, clearPanelsToggle.checked ? "true" : "false");
      applyClearPanels(clearPanelsToggle.checked);
    });
  }

  ramSlider?.addEventListener("input", () => {
    applyRamSetting(ramSlider.value);
  });

  applyRamSetting(getRamGb());
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSecond) {
  const n = Number(bytesPerSecond) || 0;
  if (n <= 0) return "";
  return `${formatBytes(n)}/s`;
}

function initAutoUpdaterUI() {
  const api = window.electronAPI;
  const drawer = document.getElementById("update-drawer");
  const dismissBtn = document.getElementById("update-drawer-dismiss");
  const downloadBtn = document.getElementById("update-download-btn");
  const installBtn = document.getElementById("update-install-btn");
  const retryBtn = document.getElementById("update-retry-btn");
  const checkBtn = document.getElementById("btn-check-updates");
  const settingsStatus = document.getElementById("settings-update-status");
  const availableTitle = document.getElementById("update-available-title");
  const progressPct = document.getElementById("update-progress-pct");
  const progressFill = document.getElementById("update-progress-fill");
  const progressBar = document.getElementById("update-progress-bar");
  const progressDetail = document.getElementById("update-progress-detail");
  const errorMessage = document.getElementById("update-error-message");

  const states = {
    available: document.getElementById("update-state-available"),
    downloading: document.getElementById("update-state-downloading"),
    ready: document.getElementById("update-state-ready"),
    error: document.getElementById("update-state-error"),
  };

  let pendingVersion = "";
  let drawerLocked = false;

  function setSettingsStatus(text, tone = "") {
    if (!settingsStatus) return;
    if (!text) {
      settingsStatus.hidden = true;
      settingsStatus.textContent = "";
      settingsStatus.removeAttribute("data-tone");
      return;
    }
    settingsStatus.hidden = false;
    settingsStatus.textContent = text;
    if (tone) settingsStatus.setAttribute("data-tone", tone);
    else settingsStatus.removeAttribute("data-tone");
  }

  function hideDrawer() {
    if (!drawer || drawerLocked) return;
    drawer.hidden = true;
    drawer.setAttribute("aria-hidden", "true");
    Object.values(states).forEach((el) => {
      if (el) el.hidden = true;
    });
  }

  function showDrawerState(name) {
    if (!drawer) return;
    drawer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    Object.entries(states).forEach(([key, el]) => {
      if (el) el.hidden = key !== name;
    });
    if (dismissBtn) {
      dismissBtn.hidden = name === "downloading";
    }
  }

  function setProgress(percent, detail = "") {
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (progressPct) progressPct.textContent = `${pct}%`;
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressBar) progressBar.setAttribute("aria-valuenow", String(pct));
    if (progressDetail) progressDetail.textContent = detail;
  }

  dismissBtn?.addEventListener("click", () => {
    drawerLocked = false;
    hideDrawer();
  });

  downloadBtn?.addEventListener("click", async () => {
    if (!api?.downloadUpdate) return;
    drawerLocked = true;
    setProgress(0, "Starting download…");
    showDrawerState("downloading");
    const result = await api.downloadUpdate();
    if (result?.skipped) {
      drawerLocked = false;
      setSettingsStatus("Updates only work in an installed (packaged) build.", "error");
      showDrawerState("error");
      if (errorMessage) {
        errorMessage.textContent = "Run a packaged install to download updates.";
      }
    } else if (result && result.success === false) {
      drawerLocked = false;
      showDrawerState("error");
      if (errorMessage) {
        errorMessage.textContent = result.error || "Download failed.";
      }
    }
  });

  installBtn?.addEventListener("click", async () => {
    if (!api?.installUpdate) return;
    installBtn.disabled = true;
    const result = await api.installUpdate();
    if (result?.success === false) {
      installBtn.disabled = false;
      drawerLocked = false;
      showDrawerState("error");
      if (errorMessage) {
        errorMessage.textContent = result.error || "Install failed.";
      }
    }
  });

  retryBtn?.addEventListener("click", async () => {
    drawerLocked = false;
    hideDrawer();
    if (api?.checkForUpdates) {
      setSettingsStatus("Checking for updates…");
      checkBtn && (checkBtn.disabled = true);
      const result = await api.checkForUpdates();
      checkBtn && (checkBtn.disabled = false);
      if (result?.skipped) {
        setSettingsStatus("Updates only work in an installed (packaged) build.", "error");
      } else if (result && result.success === false) {
        setSettingsStatus(result.error || "Update check failed.", "error");
      }
    }
  });

  checkBtn?.addEventListener("click", async () => {
    if (!api?.checkForUpdates) {
      setSettingsStatus("Updater API unavailable.", "error");
      return;
    }
    checkBtn.disabled = true;
    setSettingsStatus("Checking for updates…");
    try {
      const result = await api.checkForUpdates();
      if (result?.skipped) {
        setSettingsStatus("Updates only work in an installed (packaged) build.", "error");
      } else if (result && result.success === false) {
        setSettingsStatus(result.error || "Update check failed.", "error");
      }
      // Success path: status updated by IPC listeners (available / not-available / error)
    } finally {
      checkBtn.disabled = false;
    }
  });

  api?.onUpdateChecking?.(() => {
    setSettingsStatus("Checking for updates…");
  });

  api?.onUpdateAvailable?.((payload) => {
    pendingVersion = payload?.version || "";
    const label = pendingVersion ? `v${pendingVersion}` : "";
    if (availableTitle) {
      availableTitle.textContent = label
        ? `New Update Available (${label})!`
        : "New Update Available!";
    }
    drawerLocked = false;
    showDrawerState("available");
    setSettingsStatus(
      label ? `Update ${label} is available.` : "An update is available.",
      "ok"
    );
  });

  api?.onUpdateNotAvailable?.(() => {
    setSettingsStatus("You're on the latest version.", "ok");
  });

  api?.onUpdateProgress?.((payload) => {
    drawerLocked = true;
    showDrawerState("downloading");
    const pct = payload?.percent ?? 0;
    const speed = formatSpeed(payload?.bytesPerSecond);
    const transferred = formatBytes(payload?.transferred);
    const total = formatBytes(payload?.total);
    const parts = [];
    if (payload?.total > 0) parts.push(`${transferred} / ${total}`);
    if (speed) parts.push(speed);
    setProgress(pct, parts.join(" · "));
  });

  api?.onUpdateDownloaded?.((payload) => {
    pendingVersion = payload?.version || pendingVersion;
    drawerLocked = false;
    showDrawerState("ready");
    setSettingsStatus(
      pendingVersion
        ? `Update v${pendingVersion} downloaded — relaunch to apply.`
        : "Update downloaded — relaunch to apply.",
      "ok"
    );
  });

  api?.onUpdateError?.((payload) => {
    drawerLocked = false;
    const message = payload?.message || "Update failed.";
    // Ignore noisy errors while drawer was never shown for a quiet background check
    if (!drawer?.hidden || states.downloading?.hidden === false) {
      showDrawerState("error");
      if (errorMessage) errorMessage.textContent = message;
    }
    setSettingsStatus(message, "error");
  });
}

const STORE_CREDITS_PER_EUR = 100;
const STORE_TAX_RATE = 0;
const CREDITS_STORAGE_KEY = "sc-credits";

/** Backend payments API — override with localStorage `sc-payments-api` if needed. */
let PAYMENTS_API_BASE =
  (typeof localStorage !== "undefined" && localStorage.getItem("sc-payments-api")) ||
  "http://localhost:8787";

async function resolvePaymentsApiBase() {
  const override =
    typeof localStorage !== "undefined" && localStorage.getItem("sc-payments-api");
  if (override) {
    PAYMENTS_API_BASE = override.replace(/\/$/, "");
    return PAYMENTS_API_BASE;
  }
  const getBase =
    window.electronAPI?.getPaymentsApiBase || window.api?.getPaymentsApiBase;
  if (getBase) {
    try {
      const base = await getBase();
      if (base) PAYMENTS_API_BASE = String(base).replace(/\/$/, "");
    } catch {
      /* keep default */
    }
  }
  return PAYMENTS_API_BASE;
}

const STORE_PACKS = {
  "pack-500": { credits: 500, bonus: 0, priceEur: 5 },
  "pack-1000": { credits: 1000, bonus: 100, priceEur: 10 },
  "pack-2500": { credits: 2500, bonus: 350, priceEur: 25 },
  "pack-5000": { credits: 5000, bonus: 800, priceEur: 50 },
};

function formatStoreCredits(value) {
  return Number(value).toLocaleString();
}

function creditsToEur(credits) {
  return credits / STORE_CREDITS_PER_EUR;
}

function formatStoreEur(amount) {
  return `€${amount.toFixed(2)}`;
}

function clampStoreCredits(value) {
  const min = 100;
  const max = 50000;
  const stepped = Math.round(value / 50) * 50;
  return Math.min(max, Math.max(min, stepped));
}

function setCheckoutOverlayVisible(visible) {
  const overlay = document.getElementById("checkout-overlay");
  if (!overlay) return;
  overlay.hidden = !visible;
  overlay.setAttribute("aria-hidden", visible ? "false" : "true");
}

function openPaymentPortal(url) {
  const open =
    window.api?.openPaymentPortal || window.electronAPI?.openPaymentPortal;
  if (!open) {
    return Promise.resolve({
      success: false,
      error: "Checkout bridge unavailable. Restart the launcher.",
    });
  }
  return open(url);
}

async function getLoggedInProfile() {
  const api = window.electronAPI;
  if (!api?.getAuthProfile) return null;
  try {
    const state = await api.getAuthProfile();
    if (state?.isLoggedIn && state?.profile?.uuid) return state.profile;
  } catch {
    /* ignore */
  }
  return null;
}

async function createCheckoutSession(body) {
  const res = await fetch(`${PAYMENTS_API_BASE}/api/checkout/create-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Checkout failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  if (!data?.url) {
    throw new Error("No checkout URL returned from payment server.");
  }
  return data;
}

async function fetchPlayerStatus(mcUuid) {
  const uuid = String(mcUuid || "").replace(/-/g, "").toLowerCase();
  if (!uuid) return null;
  const res = await fetch(`${PAYMENTS_API_BASE}/api/players/${encodeURIComponent(uuid)}`);
  if (!res.ok) return null;
  return res.json();
}

function applyLocalCreditsBalance(balanceEl, credits) {
  if (!balanceEl) return;
  const value = Number.isFinite(Number(credits)) ? Number(credits) : 0;
  balanceEl.textContent = formatStoreCredits(value);
  localStorage.setItem(CREDITS_STORAGE_KEY, String(value));
}

async function syncPlayerEntitlementsFromBackend() {
  const profile = await getLoggedInProfile();
  if (!profile?.uuid) return null;

  try {
    const player = await fetchPlayerStatus(profile.uuid);
    if (!player) return null;

    const balanceEl = document.getElementById("store-credit-balance");
    if (typeof player.credits === "number") {
      applyLocalCreditsBalance(balanceEl, player.credits);
    }
    if (typeof player.spacePlus === "boolean") {
      localStorage.setItem(SPACEPLUS_SUB_KEY, player.spacePlus ? "true" : "false");
      document.dispatchEvent(new CustomEvent("sc-spaceplus-sync"));
    }
    return player;
  } catch {
    return null;
  }
}

async function startSecureCheckout({ checkoutType, productKey, customCredits, errorEl }) {
  const setError = (msg) => {
    if (!errorEl) return;
    if (msg) {
      errorEl.hidden = false;
      errorEl.textContent = msg;
    } else {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
  };

  setError("");

  const profile = await getLoggedInProfile();
  if (!profile) {
    setError("Sign in with Microsoft before purchasing.");
    return false;
  }

  setCheckoutOverlayVisible(true);

  try {
    const payload = {
      mcUuid: profile.uuid,
      username: profile.username || "",
      checkoutType,
    };
    if (productKey) payload.productKey = productKey;
    if (customCredits != null) payload.customCredits = customCredits;

    const session = await createCheckoutSession(payload);
    const opened = await openPaymentPortal(session.url);
    if (!opened?.success) {
      setError(opened?.error || "Could not open the browser checkout.");
      return false;
    }
    return true;
  } catch (err) {
    const offline =
      err?.name === "TypeError" ||
      /Failed to fetch|NetworkError|Load failed/i.test(String(err?.message || ""));
    if (offline) {
      setError(
        "Payment server unreachable. Start the backend on port 8787, then try again."
      );
    } else {
      setError(err?.message || "Checkout could not be started.");
    }
    return false;
  } finally {
    setCheckoutOverlayVisible(false);
  }
}

function initStore() {
  const balanceEl = document.getElementById("store-credit-balance");
  const packsEl = document.getElementById("store-packs");
  const customSection = document.getElementById("store-custom");
  const slider = document.getElementById("store-credits-slider");
  const input = document.getElementById("store-credits-input");
  const customEurEl = document.getElementById("store-custom-eur");
  const selectCustomBtn = document.getElementById("store-select-custom");
  const checkoutNameText = document.getElementById("store-checkout-name-text");
  const checkoutDetail = document.getElementById("store-checkout-detail");
  const subtotalEl = document.getElementById("store-subtotal");
  const taxEl = document.getElementById("store-tax");
  const totalEl = document.getElementById("store-total");
  const checkoutBtn = document.getElementById("store-checkout-btn");
  const errorEl = document.getElementById("store-checkout-error");

  if (!balanceEl || !packsEl) return;

  const stored = localStorage.getItem(CREDITS_STORAGE_KEY);
  const balance = stored !== null ? Number(stored) : 0;
  balanceEl.textContent = Number.isFinite(balance) ? formatStoreCredits(balance) : "0";

  const storeState = {
    mode: "preset",
    packId: "pack-500",
    customCredits: 750,
  };

  function getSelection() {
    if (storeState.mode === "custom") {
      const credits = storeState.customCredits;
      const subtotal = creditsToEur(credits);
      return {
        name: `${formatStoreCredits(credits)} credits`,
        detail: "Custom amount",
        credits,
        subtotal,
      };
    }

    const pack = STORE_PACKS[storeState.packId];
    const totalCredits = pack.credits + pack.bonus;
    const detail = pack.bonus
      ? `Includes +${formatStoreCredits(pack.bonus)} bonus`
      : "No bonus";

    return {
      name: `${formatStoreCredits(totalCredits)} credits`,
      detail,
      credits: totalCredits,
      subtotal: pack.priceEur,
    };
  }

  function updateCustomDisplay(credits) {
    const clamped = clampStoreCredits(credits);
    storeState.customCredits = clamped;
    if (slider) slider.value = String(Math.min(Number(slider.max), clamped));
    if (input) input.value = String(clamped);
    if (customEurEl) customEurEl.textContent = `= ${formatStoreEur(creditsToEur(clamped))}`;
    if (storeState.mode === "custom") updateCheckout();
  }

  function updatePackSelection() {
    packsEl.querySelectorAll(".store-pack-card").forEach((card) => {
      const isSelected = storeState.mode === "preset" && card.dataset.packId === storeState.packId;
      card.classList.toggle("selected", isSelected);
      card.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
    customSection?.classList.toggle("active", storeState.mode === "custom");
  }

  function updateCheckout() {
    const selection = getSelection();
    const tax = selection.subtotal * STORE_TAX_RATE;
    const total = selection.subtotal + tax;

    if (checkoutNameText) checkoutNameText.textContent = selection.name;
    if (checkoutDetail) checkoutDetail.textContent = selection.detail;
    if (subtotalEl) subtotalEl.textContent = formatStoreEur(selection.subtotal);
    if (taxEl) taxEl.textContent = formatStoreEur(tax);
    if (totalEl) totalEl.textContent = formatStoreEur(total);
  }

  function selectPreset(packId) {
    if (!STORE_PACKS[packId]) return;
    storeState.mode = "preset";
    storeState.packId = packId;
    updatePackSelection();
    updateCheckout();
  }

  function selectCustom() {
    storeState.mode = "custom";
    updatePackSelection();
    updateCheckout();
  }

  function setCheckoutLoading(loading) {
    if (!checkoutBtn) return;
    checkoutBtn.classList.toggle("loading", loading);
    checkoutBtn.disabled = loading;
    checkoutBtn.setAttribute("aria-busy", loading ? "true" : "false");
  }

  packsEl.querySelectorAll(".store-pack-card").forEach((card) => {
    card.addEventListener("click", () => selectPreset(card.dataset.packId));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectPreset(card.dataset.packId);
      }
    });
  });

  slider?.addEventListener("input", () => {
    updateCustomDisplay(Number(slider.value));
  });

  input?.addEventListener("input", () => {
    const raw = Number(input.value);
    if (!Number.isFinite(raw)) return;
    updateCustomDisplay(raw);
  });

  input?.addEventListener("blur", () => {
    updateCustomDisplay(Number(input.value) || storeState.customCredits);
  });

  selectCustomBtn?.addEventListener("click", selectCustom);

  checkoutBtn?.addEventListener("click", async () => {
    if (checkoutBtn.classList.contains("loading")) return;

    setCheckoutLoading(true);
    try {
      const body =
        storeState.mode === "custom"
          ? {
              checkoutType: "payment",
              customCredits: storeState.customCredits,
              errorEl,
            }
          : {
              checkoutType: "payment",
              productKey: storeState.packId,
              errorEl,
            };
      await startSecureCheckout(body);
    } finally {
      setCheckoutLoading(false);
    }
  });

  updateCustomDisplay(storeState.customCredits);
  updatePackSelection();
  updateCheckout();
  syncPlayerEntitlementsFromBackend();
}

function initSpacePlus() {
  const priceEl = document.getElementById("spaceplus-price");
  if (!priceEl) return;

  const saveBadge = document.getElementById("spaceplus-save-badge");
  const toggleBtns = document.querySelectorAll(".spaceplus-toggle-btn[data-interval]");
  const upgradeBlock = document.getElementById("spaceplus-upgrade-block");
  const subscribedBlock = document.getElementById("spaceplus-subscribed-block");
  const billingActions = document.getElementById("spaceplus-billing-actions");
  const billingSubscribed = document.getElementById("spaceplus-billing-subscribed");
  const billingDesc = document.getElementById("spaceplus-billing-desc");
  const priceAmount = priceEl.querySelector(".spaceplus-price-amount");
  const pricePeriod = priceEl.querySelector(".spaceplus-price-period");
  const errorEl = document.getElementById("spaceplus-checkout-error");
  const upgradeBtns = [
    document.getElementById("spaceplus-upgrade-btn"),
    document.getElementById("spaceplus-billing-upgrade-btn"),
  ].filter(Boolean);

  const prices = {
    monthly: { amount: "€4.99", period: "/ Month", showSave: false },
    annual: { amount: "€49.99", period: "/ Year", showSave: true },
  };

  let interval = "monthly";
  let fading = false;

  function isSubscribed() {
    return localStorage.getItem(SPACEPLUS_SUB_KEY) === "true";
  }

  function updateSubscriptionUI() {
    const subscribed = isSubscribed();

    if (upgradeBlock) upgradeBlock.hidden = subscribed;
    if (subscribedBlock) subscribedBlock.hidden = !subscribed;
    if (billingActions) billingActions.hidden = subscribed;
    if (billingSubscribed) billingSubscribed.hidden = !subscribed;

    if (billingDesc) {
      billingDesc.textContent = subscribed
        ? "Your Space+ subscription is active. Manage billing and renewal below."
        : "Subscribe to Space+ for premium perks across the launcher.";
    }
  }

  function setPrice(nextInterval) {
    if (fading || nextInterval === interval) return;
    fading = true;

    priceEl.classList.add("spaceplus-price-fade-out");

    setTimeout(() => {
      const data = prices[nextInterval];
      if (priceAmount) priceAmount.textContent = data.amount;
      if (pricePeriod) pricePeriod.textContent = data.period;
      if (saveBadge) saveBadge.hidden = !data.showSave;

      priceEl.classList.remove("spaceplus-price-fade-out");
      priceEl.classList.add("spaceplus-price-fade-in");

      interval = nextInterval;
      fading = false;

      setTimeout(() => priceEl.classList.remove("spaceplus-price-fade-in"), 320);
    }, 220);
  }

  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.dataset.interval;
      if (!next || next === interval) return;

      toggleBtns.forEach((b) => b.classList.toggle("active", b === btn));
      setPrice(next);
    });
  });

  function setUpgradeLoading(loading) {
    upgradeBtns.forEach((btn) => {
      btn.classList.toggle("loading", loading);
      btn.disabled = loading;
    });
  }

  async function subscribe() {
    setUpgradeLoading(true);
    try {
      await startSecureCheckout({
        checkoutType: "subscription",
        productKey: interval === "annual" ? "annual" : "monthly",
        errorEl,
      });
    } finally {
      setUpgradeLoading(false);
    }
  }

  function toggleDemoSubscription() {
    localStorage.setItem(SPACEPLUS_SUB_KEY, isSubscribed() ? "false" : "true");
    document.dispatchEvent(new CustomEvent("sc-spaceplus-sync"));
    window.dispatchEvent(new CustomEvent("space-entitlements-changed"));
  }

  function manageSubscription() {
    window.alert(
      "Subscription management opens in your browser once the Stripe Customer Portal is configured."
    );
  }

  document.getElementById("spaceplus-upgrade-btn")?.addEventListener("click", subscribe);
  document.getElementById("spaceplus-billing-upgrade-btn")?.addEventListener("click", subscribe);
  document.getElementById("spaceplus-manage-btn")?.addEventListener("click", manageSubscription);
  document.getElementById("spaceplus-billing-manage-btn")?.addEventListener("click", manageSubscription);
  document.getElementById("spaceplus-demo-toggle")?.addEventListener("click", toggleDemoSubscription);

  document.addEventListener("sc-spaceplus-sync", () => {
    updateSubscriptionUI();
    syncCosmeticEquippedState();
    renderCosmeticsGrid();
    window.SpaceAds?.refresh?.();
    window.dispatchEvent(new CustomEvent("space-entitlements-changed"));
    const spacePlusRow = document.getElementById("account-spaceplus-value");
    if (spacePlusRow && currentAuthState.isLoggedIn) {
      const plus = isSpacePlusActive();
      spacePlusRow.textContent = plus ? (isOwnerPlayer() ? "Included (Owner)" : "Active") : "Not subscribed";
      spacePlusRow.classList.toggle("muted", !plus);
    }
  });

  updateSubscriptionUI();
}

function initPaymentsRefresh() {
  const refresh = () => {
    syncPlayerEntitlementsFromBackend();
  };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  window.electronAPI?.onAuthStateChanged?.((state) => {
    if (state?.isLoggedIn) refresh();
  });
  const onRefresh =
    window.electronAPI?.onPaymentsRefresh || window.api?.onPaymentsRefresh;
  onRefresh?.(refresh);
}

function formatLaunchSpeed(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "";
  const kb = bytesPerSec / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB/s`;
  return `${(kb / 1024).toFixed(1)} MB/s`;
}

function formatLaunchPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function classifyLaunchLogLine(line) {
  const text = String(line || "");
  if (/error|exception|crash|failed|fatal/i.test(text)) return "is-error";
  if (/warn(ing)?/i.test(text)) return "is-warn";
  if (/minecraft closed|exited with code 0|successfully|done\./i.test(text)) return "is-success";
  if (/info|preparing|downloading|extracting|launching|fabric/i.test(text)) return "is-info";
  return "";
}

function clearLaunchConsole() {
  const body = document.getElementById("launch-console-body");
  if (body) body.innerHTML = "";
}

function appendLaunchConsoleLine(line) {
  const body = document.getElementById("launch-console-body");
  if (!body || !line) return;
  const text = String(line).replace(/\s+$/g, "");
  if (!text) return;

  const row = document.createElement("div");
  row.className = `launch-log-line ${classifyLaunchLogLine(text)}`.trim();
  row.textContent = text;
  body.appendChild(row);

  // Cap retained lines so long launches stay responsive.
  while (body.children.length > 800) {
    body.removeChild(body.firstChild);
  }

  body.scrollTop = body.scrollHeight;
}

function getLaunchConsoleText() {
  const body = document.getElementById("launch-console-body");
  if (!body) return "";
  return Array.from(body.querySelectorAll(".launch-log-line"))
    .map((el) => el.textContent)
    .join("\n");
}

function setLaunchOverlayState(state) {
  const card = document.querySelector(".launch-overlay-card");
  if (!card) return;
  card.classList.toggle("is-failed", state === "failed");
  card.classList.toggle("is-running", state === "running");
}

function hideLaunchCrashTips() {
  const tips = document.getElementById("launch-crash-tips");
  if (tips) tips.hidden = true;
  const list = document.getElementById("launch-crash-tips-list");
  if (list) list.innerHTML = "";
}

function buildLaunchCrashTips(logText = "", exitCode = null) {
  const text = String(logText || "");
  const tips = [];

  if (/ClientBrandRetrieverMixin|InvalidInjectionException|Mixin transformation/i.test(text)) {
    tips.push("Space Client core mixin failed — rebuild/update space-client-core (npm run build:mods) and relaunch.");
    tips.push("Make sure Cosmetics / brand mixins target Minecraft 1.21.1 getClientModName, not <clinit>.");
  }

  if (/unknown protocol:\s*c|Invalid URL C:/i.test(text)) {
    tips.push("Log4j Windows path bug — relaunch with the latest Space Client (file:// log config fix). This alone usually does not stop the game.");
  }

  if (/OutOfMemoryError|Java heap space|GC overhead/i.test(text)) {
    tips.push("Increase RAM in Settings (try 6–8 GB) and relaunch.");
  }

  if (/lwjgl|glfw|Failed to create the OpenGL context|OpenGL/i.test(text)) {
    tips.push("Update your GPU drivers, then try launching with other apps closed (overlay/Discord may interfere).");
  }

  if (/Could not find or load main class|NoClassDefFoundError|ClassNotFoundException/i.test(text)) {
    tips.push("Game files look incomplete — relaunch so assets/libraries re-download, or delete the SpaceClient .minecraft folder and try again.");
  }

  if (/Failed to verify username|Invalid session|401|Unauthorized/i.test(text)) {
    tips.push("Sign out and sign back in with Microsoft on the Account page.");
  }

  if (/fabric-api|ModResolutionException|Incompatible mods/i.test(text)) {
    tips.push("Fabric API / mod conflict — remove extra jars from .minecraft/mods and keep only Space Client injection.");
  }

  if (exitCode === 1 || exitCode === -1 || /Minecraft has crashed|exited with code [^0]/i.test(text)) {
    tips.push("Copy Game Logs and search the first ERROR / Caused by line — that is usually the real crash.");
  }

  if (!tips.length) {
    tips.push("Scroll Game Logs for the first red ERROR / Exception line.");
    tips.push("Try Vanilla loader once to rule out Fabric injection.");
    tips.push("Raise allocated RAM in Settings, then relaunch.");
    tips.push("Update GPU drivers and close overlays (GeForce Experience, Discord).");
  }

  return [...new Set(tips)].slice(0, 6);
}

function showLaunchCrashTips(logText, exitCode) {
  const tipsEl = document.getElementById("launch-crash-tips");
  const list = document.getElementById("launch-crash-tips-list");
  if (!tipsEl || !list) return;

  const tips = buildLaunchCrashTips(logText, exitCode);
  list.innerHTML = tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("");
  tipsEl.hidden = false;
}

function setLaunchProgressVisible(visible) {
  const overlay = document.getElementById("launch-overlay");
  if (!overlay) return;
  overlay.hidden = !visible;
  overlay.setAttribute("aria-hidden", visible ? "false" : "true");
  document.body.classList.toggle("launch-overlay-open", visible);
  if (!visible) hideLaunchCrashTips();
}

function updateLaunchProgressUI(payload = {}, { resetPercent = false } = {}) {
  const labelEl = document.getElementById("launch-progress-label");
  const pctEl = document.getElementById("launch-progress-pct");
  const fillEl = document.getElementById("launch-progress-fill");
  const detailEl = document.getElementById("launch-progress-detail");
  const barEl = document.getElementById("launch-progress-bar");

  setLaunchProgressVisible(true);

  if (payload.label) {
    if (labelEl) labelEl.textContent = payload.label;
  }

  if (Number.isFinite(payload.percent)) {
    let pct = Math.max(0, Math.min(100, Math.round(payload.percent)));
    if (!resetPercent && Number.isFinite(updateLaunchProgressUI._lastPercent)) {
      pct = Math.max(updateLaunchProgressUI._lastPercent, pct);
    }
    updateLaunchProgressUI._lastPercent = pct;
    if (pctEl) pctEl.textContent = formatLaunchPercent(pct);
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (barEl) barEl.setAttribute("aria-valuenow", String(pct));
  }

  const parts = [];
  if (payload.detail) parts.push(payload.detail);
  if (Number.isFinite(payload.speed) && payload.speed > 0) {
    parts.push(formatLaunchSpeed(payload.speed));
  }
  if (detailEl && (payload.detail != null || payload.speed != null)) {
    detailEl.textContent = parts.join(" · ");
  }
}

updateLaunchProgressUI._lastPercent = 0;

function resetPlayButton(btn, { loggedIn } = {}) {
  if (!btn) return;
  btn.classList.remove("launching");
  btn.textContent = "PLAY";
  btn.style.opacity = "";
  if (loggedIn !== undefined) {
    btn.disabled = !loggedIn;
    btn.setAttribute("aria-disabled", loggedIn ? "false" : "true");
    btn.classList.toggle("ready", loggedIn);
    btn.title = loggedIn ? "Launch Minecraft" : "Sign in to play";
  } else if (!btn.disabled) {
    btn.title = "Launch Minecraft";
  }
}

function initPlayButton() {
  const btn = document.querySelector(".btn-play");
  if (!btn) return;

  const api = window.electronAPI;
  let launching = false;
  let lastPercent = 0;
  let lastSpeed = 0;
  let lastLabel = "Preparing…";
  let lastDetail = "";

  api?.onLaunchProgress?.((payload) => {
    if (!payload || typeof payload !== "object") return;

    // Ignore null / missing percent so speed-only ticks never wipe progress.
    if (Number.isFinite(payload.percent)) {
      lastPercent = Math.max(lastPercent, Math.max(0, Math.min(100, payload.percent)));
    }
    if (payload.label) lastLabel = payload.label;
    if (payload.detail != null && payload.detail !== "") lastDetail = payload.detail;
    if (Number.isFinite(payload.speed)) lastSpeed = payload.speed;

    updateLaunchProgressUI({
      label: lastLabel,
      percent: lastPercent,
      detail: lastDetail,
      speed: lastSpeed,
    });
  });

  api?.onLaunchLog?.((payload) => {
    appendLaunchConsoleLine(payload?.line);
  });

  api?.onLaunchStarted?.(() => {
    launching = false;
    setInGame(true);
    lastPercent = 100;
    setLaunchOverlayState("running");
    updateLaunchProgressUI({
      label: "Minecraft is booting…",
      percent: 100,
      detail: "Game Logs stay open — check here if it crashes",
      speed: 0,
    });
    appendLaunchConsoleLine("Minecraft process started — streaming Game Logs…");
    // Keep overlay open (do not dismiss) so crash output remains visible.
    btn.classList.remove("launching");
    btn.textContent = "IN GAME";
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
    btn.title = "Minecraft is running — watch Game Logs";
  });

  api?.onLaunchClosed?.((payload) => {
    launching = false;
    setInGame(false);
    const crashed = Boolean(payload?.crashed);
    setLaunchOverlayState(crashed ? "failed" : "");
    setLaunchProgressVisible(true);
    updateLaunchProgressUI({
      label: crashed ? "Minecraft crashed" : "Minecraft closed",
      percent: lastPercent,
      detail: crashed
        ? `Exit code ${payload?.code ?? "?"} — scroll Game Logs for the stack trace`
        : "Game session ended",
      speed: 0,
    });
    if (crashed) {
      showLaunchCrashTips(getLaunchConsoleText(), payload?.code ?? null);
    } else {
      hideLaunchCrashTips();
    }
    lastSpeed = 0;
    lastLabel = "Preparing…";
    lastDetail = "";
    updateLaunchProgressUI._lastPercent = crashed ? lastPercent : 0;
    resetPlayButton(btn, { loggedIn: true });
  });

  api?.onLaunchError?.((payload) => {
    launching = false;
    setInGame(false);
    setLaunchOverlayState("failed");
    setLaunchProgressVisible(true);
    updateLaunchProgressUI({
      label: "Launch failed",
      percent: lastPercent,
      detail: payload?.error || "Unknown error",
      speed: 0,
    });
    appendLaunchConsoleLine(`Error: ${payload?.error || "Unknown error"}`);
    showLaunchCrashTips(`${getLaunchConsoleText()}\n${payload?.error || ""}`, null);
    resetPlayButton(btn, { loggedIn: true });
  });

  document.getElementById("launch-overlay-dismiss")?.addEventListener("click", () => {
    setLaunchProgressVisible(false);
    setLaunchOverlayState("");
  });

  document.getElementById("launch-console-clear")?.addEventListener("click", () => {
    clearLaunchConsole();
  });

  document.getElementById("launch-console-copy")?.addEventListener("click", async () => {
    const text = getLaunchConsoleText();
    const copyBtn = document.getElementById("launch-console-copy");
    try {
      await navigator.clipboard.writeText(text || "");
      if (copyBtn) {
        copyBtn.textContent = "Copied";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1200);
      }
    } catch {
      if (copyBtn) copyBtn.textContent = "Failed";
      setTimeout(() => {
        if (copyBtn) copyBtn.textContent = "Copy";
      }, 1200);
    }
  });

  btn.addEventListener("click", async () => {
    if (btn.disabled || launching) return;

    if (window.SpaceAds?.maybeShowPlayInterstitial) {
      const continuePlay = await window.SpaceAds.maybeShowPlayInterstitial();
      if (!continuePlay) return;
    }

    if (!api?.launchGame) {
      clearLaunchConsole();
      setLaunchOverlayState("failed");
      updateLaunchProgressUI({
        label: "Unavailable",
        percent: 0,
        detail: "Launch requires the Electron app (npm start).",
      }, { resetPercent: true });
      appendLaunchConsoleLine("Launch requires the Electron app (npm start).");
      setLaunchProgressVisible(true);
      return;
    }

    launching = true;
    window.SpaceGUI?.pushActivity?.({ kind: "launch", text: "Started Minecraft launch" });
    lastPercent = 0;
    lastSpeed = 0;
    lastLabel = "Preparing launch…";
    lastDetail = "";
    updateLaunchProgressUI._lastPercent = 0;
    clearLaunchConsole();
    hideLaunchCrashTips();
    setLaunchOverlayState("");
    btn.classList.add("launching");
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
    btn.textContent = "LAUNCHING…";
    updateLaunchProgressUI({
      label: "Preparing launch…",
      percent: 0,
      detail: "",
      speed: 0,
    }, { resetPercent: true });
    appendLaunchConsoleLine("Starting Space Client launch pipeline…");

    const version =
      document.getElementById("home-version")?.value ||
      modrinthState.version ||
      "1.21.1";
    const loader =
      document.getElementById("home-loader")?.value ||
      modrinthState.homeLoader ||
      "fabric";
    const memoryGb = getRamGb();
    const equippedCape = getEquippedCosmetics().capes || null;

    try {
      const result = await api.launchGame({ version, loader, memoryGb, equippedCape });
      if (!result?.success) {
        launching = false;
        setLaunchOverlayState("failed");
        updateLaunchProgressUI({
          label: "Launch failed",
          percent: lastPercent,
          detail: result?.error || "Could not start Minecraft.",
          speed: 0,
        });
        appendLaunchConsoleLine(`Error: ${result?.error || "Could not start Minecraft."}`);
        resetPlayButton(btn, { loggedIn: true });
      }
    } catch (err) {
      launching = false;
      setLaunchOverlayState("failed");
      updateLaunchProgressUI({
        label: "Launch failed",
        percent: lastPercent,
        detail: err?.message || String(err),
        speed: 0,
      });
      appendLaunchConsoleLine(`Error: ${err?.message || String(err)}`);
      resetPlayButton(btn, { loggedIn: true });
    }
  });
}

loadStoredPreferences();

document.addEventListener("DOMContentLoaded", async () => {
  await resolvePaymentsApiBase();
  initWindowControls();
  initTitlebarPlayer();
  initNavigation();
  initLaunchSelectors();
  initHomeNews();
  initModrinth();
  initModDetailPanel();
  initCosmeticDetailPanel();
  initCosmetics();
  initSocial();
  initAssistant();
  initInteractiveGui();
  initAds();
  initAccount();
  initStore();
  initSpacePlus();
  initPaymentsRefresh();
  initSettings();
  initAutoUpdaterUI();
  initPlayButton();
  updateActiveModCount();

  document.getElementById("home-open-friends")?.addEventListener("click", () => {
    navigateToView("friends");
  });

  window.SpaceClientAuth = {
    getUsername: () => getCurrentUsername(),
  };
});