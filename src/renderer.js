const ACCENT_KEY = "space-client-accent";
const BLUR_BG_KEY = "space-client-blur-bg";
const BG_THEME_KEY = "space-client-bg-theme";
const CLEAR_PANELS_KEY = "space-client-clear-panels";
const RAM_KEY = "space-client-ram";
const IN_GAME_KEY = "space-client-in-game";
const PERF_PACK_KEY = "space-launcher-perf-pack";
const SELECTED_INSTANCE_KEY = "space-client-selected-instance";
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

/** Full Java catalog (year-based 26.x + classic 1.x). */
const MINECRAFT_VERSIONS = [
  "26.3-snapshot-4",
  "26.2",
  "26.1.2",
  "26.1.1",
  "26.1",
  "1.21.11",
  "1.21.10",
  "1.21.9",
  "1.21.8",
  "1.21.7",
  "1.21.6",
  "1.21.5",
  "1.21.4",
  "1.21.3",
  "1.21.2",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.5",
  "1.20.4",
  "1.20.3",
  "1.20.2",
  "1.20.1",
  "1.20",
  "1.19.4",
  "1.19.3",
  "1.19.2",
  "1.19.1",
  "1.19",
  "1.18.2",
  "1.18.1",
  "1.18",
  "1.8.9",
];

/** Named engines for labels / legacy detection (not the full dropdown list). */
const JAVA_TARGET_POOL = [
  { value: "1.8.9", label: "1.8.9 — Old-School", legacy: true },
  { value: "26.2", label: "26.2 — Modern Stable", legacy: false },
  { value: "1.26.2", label: "26.2 — Modern Stable", legacy: false },
  { value: "26.3-snapshot-4", label: "26.3-snapshot-4 — Cutting-Edge", legacy: false },
  { value: "1.28", label: "26.3-snapshot-4 — Cutting-Edge", legacy: false },
];

const JAVA_TARGET_IDS = JAVA_TARGET_POOL.map((entry) => entry.value);

const DEFAULT_FABRIC_MC = "1.21.1";
const DEFAULT_JAVA_TARGET = "1.21.1";

const BEDROCK_PREVIEW_KEY = "space-launcher-bedrock-preview";
const HOME_EDITION_KEY = "space-launcher-home-edition";

/** Populated from main process (mod-injection FABRIC_API_BY_MC keys). */
let fabricSupportedVersions = [
  "1.21.4",
  "1.21.3",
  "1.21.2",
  "1.21.1",
  "1.21",
];

const modrinthState = {
  query: "",
  loader: "fabric",
  homeLoader: "fabric",
  version: DEFAULT_JAVA_TARGET,
  bedrockPreview: false,
  edition: "java",
  index: "downloads",
  offset: 0,
  totalHits: 0,
  loading: false,
  loaded: false,
};

const modpackState = {
  query: "",
  loader: "fabric",
  index: "downloads",
  offset: 0,
  totalHits: 0,
  loading: false,
  loaded: false,
};

const resourcePackState = {
  query: "",
  index: "downloads",
  offset: 0,
  totalHits: 0,
  loading: false,
  loaded: false,
};

const shaderState = {
  query: "",
  index: "downloads",
  offset: 0,
  totalHits: 0,
  loading: false,
  loaded: false,
};

const instanceState = {
  items: [],
  selectedId: null,
  loading: false,
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

const MOD_CARD_DEFAULT_COLORS = {
  c1: "255, 255, 255",
  c2: "148, 163, 184",
  c3: "226, 232, 240",
};

function clampChannel(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbKey(rgb) {
  return rgb.join(", ");
}

function mixRgb(a, b, t) {
  return [
    clampChannel(a[0] + (b[0] - a[0]) * t),
    clampChannel(a[1] + (b[1] - a[1]) * t),
    clampChannel(a[2] + (b[2] - a[2]) * t),
  ];
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function normalizeLogoColors(rawColors) {
  if (!rawColors.length) return { ...MOD_CARD_DEFAULT_COLORS };

  const sorted = [...rawColors].sort((a, b) => {
    const lumA = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
    const lumB = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2];
    return lumB - lumA;
  });

  let c1 = sorted[0];
  let c2 = sorted.find((c) => colorDistance(c, c1) > 36) || sorted[1];
  let c3 = sorted.find((c) => colorDistance(c, c1) > 36 && colorDistance(c, c2) > 28) || sorted[2];

  if (!c2) c2 = mixRgb(c1, [255, 255, 255], 0.35);
  if (!c3) c3 = mixRgb(c2, [255, 255, 255], 0.55);

  return {
    c1: rgbKey(c1),
    c2: rgbKey(c2),
    c3: rgbKey(c3),
  };
}

function waitForImage(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      img.removeEventListener("load", done);
      img.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      img.removeEventListener("load", done);
      img.removeEventListener("error", onErr);
      reject(new Error("icon load failed"));
    };
    img.addEventListener("load", done);
    img.addEventListener("error", onErr);
  });
}

function sampleLogoColors(img, crop) {
  const canvas = document.createElement("canvas");
  const size = 32;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  if (crop?.w && crop?.h) {
    ctx.drawImage(img, crop.x || 0, crop.y || 0, crop.w, crop.h, 0, 0, size, size);
  } else {
    ctx.drawImage(img, 0, 0, size, size);
  }
  const { data } = ctx.getImageData(0, 0, size, size);
  const buckets = new Map();

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 120) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 22) continue;

    const qr = Math.round(r / 24) * 24;
    const qg = Math.round(g / 24) * 24;
    const qb = Math.round(b / 24) * 24;
    const key = `${qr},${qg},${qb}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  const ranked = [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key]) => key.split(",").map(Number));

  return normalizeLogoColors(ranked);
}

async function applyModCardLogoColors(card) {
  if (!card || card.dataset.colorsReady === "1") return;

  const img = card.querySelector("img.modrinth-icon");
  if (!img?.src) {
    card.style.setProperty("--card-c1", MOD_CARD_DEFAULT_COLORS.c1);
    card.style.setProperty("--card-c2", MOD_CARD_DEFAULT_COLORS.c2);
    card.style.setProperty("--card-c3", MOD_CARD_DEFAULT_COLORS.c3);
    card.classList.add("has-logo-colors");
    card.dataset.colorsReady = "1";
    return;
  }

  const src = img.currentSrc || img.src;
  const probe = new Image();
  probe.crossOrigin = "anonymous";
  probe.referrerPolicy = "no-referrer";

  try {
    await new Promise((resolve, reject) => {
      probe.onload = resolve;
      probe.onerror = reject;
      probe.src = src;
    });
    const colors = sampleLogoColors(probe);
    if (colors) {
      card.style.setProperty("--card-c1", colors.c1);
      card.style.setProperty("--card-c2", colors.c2);
      card.style.setProperty("--card-c3", colors.c3);
      card.classList.add("has-logo-colors");
    }
  } catch {
    card.style.setProperty("--card-c1", MOD_CARD_DEFAULT_COLORS.c1);
    card.style.setProperty("--card-c2", MOD_CARD_DEFAULT_COLORS.c2);
    card.style.setProperty("--card-c3", MOD_CARD_DEFAULT_COLORS.c3);
    card.classList.add("has-logo-colors");
  }

  card.dataset.colorsReady = "1";
}

function initModrinthCardColors(root = document) {
  const cards = root.querySelectorAll?.(".modrinth-card") || [];
  cards.forEach((card) => {
    void applyModCardLogoColors(card);
  });
}

function setCosmeticCardColors(card, colors = MOD_CARD_DEFAULT_COLORS) {
  card.style.setProperty("--card-c1", colors.c1);
  card.style.setProperty("--card-c2", colors.c2);
  card.style.setProperty("--card-c3", colors.c3);
  card.classList.add("has-logo-colors");
  card.dataset.colorsReady = "1";
}

async function applyCosmeticCardLogoColors(card) {
  if (!card || card.dataset.colorsReady === "1") return;

  const sheetImg = card.querySelector(".cape-live-sheet");
  const previewImg = card.querySelector(".cosmetic-preview-img");
  const sourceImg = sheetImg || previewImg;

  if (!sourceImg?.src) {
    setCosmeticCardColors(card);
    return;
  }

  const src = sourceImg.currentSrc || sourceImg.src;
  const probe = new Image();
  probe.crossOrigin = "anonymous";
  probe.referrerPolicy = "no-referrer";

  try {
    await new Promise((resolve, reject) => {
      probe.onload = resolve;
      probe.onerror = reject;
      probe.src = src;
    });

    const frames = Number(sheetImg?.dataset.frameCount) || 24;
    const crop = sheetImg && probe.naturalHeight > 0
      ? {
          x: 0,
          y: 0,
          w: probe.naturalWidth,
          h: probe.naturalHeight / frames,
        }
      : null;
    const colors = sampleLogoColors(probe, crop);
    if (colors) {
      setCosmeticCardColors(card, colors);
      return;
    }
  } catch {
    // fall through to defaults
  }

  setCosmeticCardColors(card);
}

function initCosmeticCardColors(root = document) {
  const cards = root.querySelectorAll?.(".cosmetic-card") || [];
  cards.forEach((card) => {
    void applyCosmeticCardLogoColors(card);
  });
}

const HOME_NEWS = [
  {
    id: "java-bedrock",
    tag: "Release",
    date: "2026-07-17",
    dateLabel: "Jul 17, 2026",
    title: "Java + Bedrock in one launcher",
    desc: "Apex Launcher now launches both editions on Windows. Host or join cross-play worlds with Space Bridge — no router setup.",
  },
  {
    id: "stardust",
    tag: "Feature",
    date: "2026-07-17",
    dateLabel: "Jul 17, 2026",
    title: "Stardust & Cosmic Shop live",
    desc: "Earn Stardust while you play (anti-AFK tracked). 5 Stardust = 1 Credit — spend Credits in the Cosmic Shop. Events and quests coming soon.",
  },
  {
    id: "home-trailers",
    tag: "Update",
    date: "2026-07-16",
    dateLabel: "Jul 16, 2026",
    title: "Home stage trailer reel",
    desc: "Official Minecraft update trailers play full-bleed behind Home — Village & Pillage through Tricky Trials.",
  },
  {
    id: "space-bridge",
    tag: "Feature",
    date: "2026-07-15",
    dateLabel: "Jul 15, 2026",
    title: "Space Bridge cross-play",
    desc: "Open a Java LAN world, share a code, and let Bedrock friends join — or join as Bedrock/Java from Host.",
  },
  {
    id: "modrinth",
    tag: "Feature",
    date: "2026-07-05",
    dateLabel: "Jul 5, 2026",
    title: "Modrinth built into the launcher",
    desc: "Search, install, and manage mods without leaving Apex Launcher.",
  },
];

function renderHomeNews() {
  const [featured, ...rest] = HOME_NEWS;
  if (!featured) return "";

  const feed = rest
    .map(
      (item) => `
      <li class="home-news-item" data-news="${escapeHtml(item.id)}">
        <time class="home-news-item-date" datetime="${escapeHtml(item.date)}">${escapeHtml(item.dateLabel)}</time>
        <div class="home-news-item-copy">
          <p class="home-news-item-title">${escapeHtml(item.title)}</p>
          <p class="home-news-item-desc">${escapeHtml(item.desc)}</p>
        </div>
      </li>`
    )
    .join("");

  return `
    <article class="home-news-feature" data-news="${escapeHtml(featured.id)}">
      <div class="home-news-feature-meta">
        <span class="home-news-feature-tag">${escapeHtml(featured.tag)}</span>
        <time datetime="${escapeHtml(featured.date)}">${escapeHtml(featured.dateLabel)}</time>
      </div>
      <h3 class="home-news-feature-title">${escapeHtml(featured.title)}</h3>
      <p class="home-news-feature-desc">${escapeHtml(featured.desc)}</p>
    </article>
    ${
      rest.length
        ? `<ul class="home-news-feed" aria-label="Recent updates">${feed}</ul>`
        : ""
    }
  `;
}

function initHomeNews() {
  const list = document.getElementById("home-news-list");
  if (!list) return;
  list.innerHTML = renderHomeNews();
}

const COSMETICS = [
  {
    id: "jeweled-crown",
    category: "capes",
    name: "Jeweled Crown",
    desc: "Tournament champion cape — a centered jeweled gold crown on deep night cloth. Awarded to upcoming tournament winners.",
    rarity: "legendary",
    tags: ["Animated", "Tournament", "Champion"],
    price: 900,
    tournament: true,
    previewImage: "assets/capes/jeweled-crown-preview.png",
    sheetImage: "assets/capes/jeweled-crown-sheet.png",
    textureImage: "assets/capes/jeweled-crown-texture.png",
    frameCount: 32,
    equipped: false,
  },
  {
    id: "shining-trophy",
    category: "capes",
    name: "Shining Trophy",
    desc: "Tournament champion cape — a bright gold trophy on deep night cloth. Awarded to upcoming tournament winners.",
    rarity: "legendary",
    tags: ["Animated", "Tournament", "Champion"],
    price: 750,
    tournament: true,
    previewImage: "assets/capes/shining-trophy-preview.png",
    sheetImage: "assets/capes/shining-trophy-sheet.png",
    textureImage: "assets/capes/shining-trophy-texture.png",
    frameCount: 32,
    equipped: false,
  },
  {
    id: "shining-medal",
    category: "capes",
    name: "Shining Medal",
    desc: "Tournament champion cape — a ribboned gold medal on deep night cloth. Awarded to upcoming tournament winners.",
    rarity: "legendary",
    tags: ["Animated", "Tournament", "Champion"],
    price: 650,
    tournament: true,
    previewImage: "assets/capes/shining-medal-preview.png",
    sheetImage: "assets/capes/shining-medal-sheet.png",
    textureImage: "assets/capes/shining-medal-texture.png",
    frameCount: 32,
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
    frameCount: 32,
    equipped: false,
  },
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
    frameCount: 32,
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
    frameCount: 32,
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
    frameCount: 32,
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
    frameCount: 32,
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

/** Credits / Thanks page roster — skins load from Minecraft usernames. */
const THANKS_TEAM = [
  {
    username: "eagerz",
    name: "Eagerz",
    role: "Owner",
    roleKey: "owner",
  },
  {
    username: "scood",
    name: "Scood",
    role: "Developer",
    roleKey: "developer",
  },
  {
    username: "sussybara",
    name: "Sussybara",
    role: "Staff",
    roleKey: "staff",
  },
  {
    username: "MHF_Alex",
    name: "Nova",
    role: "Developer",
    roleKey: "developer",
  },
  {
    username: "MHF_Steve",
    name: "Orbit",
    role: "Staff",
    roleKey: "staff",
  },
  {
    username: "jeb_",
    name: "Beacon",
    role: "Staff",
    roleKey: "staff",
  },
  {
    username: "Dinnerbone",
    name: "Comet",
    role: "Contributor",
    roleKey: "contributor",
  },
];

function renderThanksGrid() {
  const grid = document.getElementById("thanks-grid");
  if (!grid) return;

  grid.innerHTML = THANKS_TEAM.map((member) => {
    const skin = `https://mc-heads.net/body/${encodeURIComponent(member.username)}/180`;
    const roleKey = escapeHtml(member.roleKey || "staff");
    return `
      <article class="thanks-card" role="listitem" data-role="${roleKey}">
        <div class="thanks-card-skin-wrap">
          <img
            class="thanks-card-skin"
            src="${skin}"
            alt="${escapeHtml(member.name)} skin"
            width="120"
            height="240"
            decoding="async"
            referrerpolicy="no-referrer"
          />
        </div>
        <div class="thanks-card-box">
          <h3 class="thanks-card-name">${escapeHtml(member.name)}</h3>
          <span class="thanks-role-capsule thanks-role-${roleKey}">${escapeHtml(member.role)}</span>
        </div>
      </article>`;
  }).join("");

  grid.querySelectorAll(".thanks-card-skin").forEach((img) => {
    img.addEventListener("error", () => {
      img.src = "https://mc-heads.net/body/MHF_Steve/180";
    }, { once: true });
  });
}

function initThanks() {
  renderThanksGrid();
}

function setHostLine(el, message, tone = "") {
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("is-error", "is-ok");
  if (tone === "error") el.classList.add("is-error");
  if (tone === "ok") el.classList.add("is-ok");
}

function setHostPill(state, label) {
  const pill = document.getElementById("host-status-pill");
  if (!pill) return;
  pill.dataset.state = state;
  pill.textContent = label;
}

function renderHostSession(session) {
  const codePanel = document.getElementById("host-code-panel");
  const codeValue = document.getElementById("host-code-value");
  const codeMeta = document.getElementById("host-code-meta");
  const stopBtn = document.getElementById("host-stop-btn");
  const startBtn = document.getElementById("host-start-btn");

  if (session?.code) {
    codePanel?.removeAttribute("hidden");
    if (codeValue) codeValue.textContent = session.code;
    const endpoint = session.endpoint;
    const parts = [
      endpoint?.host ? `${endpoint.host}:${endpoint.port}` : null,
      session.geyserVersion ? `Geyser ${session.geyserVersion}` : null,
      endpoint?.tunnelMode ? endpoint.tunnelMode.toUpperCase() : null,
    ].filter(Boolean);
    if (codeMeta) codeMeta.textContent = parts.join(" · ");
    stopBtn?.removeAttribute("hidden");
    startBtn?.setAttribute("disabled", "true");
    setHostPill("live", "Live");
  } else {
    codePanel?.setAttribute("hidden", "");
    if (codeValue) codeValue.textContent = "SP-------";
    if (codeMeta) codeMeta.textContent = "";
    stopBtn?.setAttribute("hidden", "");
    startBtn?.removeAttribute("disabled");
    setHostPill("idle", "Idle");
  }
}

async function refreshHostView() {
  const api = window.electronAPI;
  const versionNote = document.getElementById("host-version-note");
  if (!api?.bridgeStatus) {
    setHostLine(document.getElementById("host-status-line"), "Space Bridge is only available in the desktop app.", "error");
    return;
  }

  try {
    const status = await api.bridgeStatus();
    renderHostSession(status?.session);
    if (status?.hosting) {
      setHostPill("live", "Live");
    }

    if (versionNote && api.bridgeResolveVersions) {
      const mcVersion = document.getElementById("host-mc-version")?.value || "1.21.1";
      const resolved = await api.bridgeResolveVersions({ minecraftVersion: mcVersion });
      if (resolved?.geyserVersion) {
        versionNote.textContent = `Auto profile: Minecraft ${resolved.minecraftVersion} → Geyser ${resolved.geyserVersion} (${resolved.resolution || "auto"}).`;
      }
    }
  } catch (err) {
    setHostLine(document.getElementById("host-status-line"), err?.message || "Could not load bridge status.", "error");
  }
}

function initHost() {
  const api = window.electronAPI;
  const startBtn = document.getElementById("host-start-btn");
  const stopBtn = document.getElementById("host-stop-btn");
  const joinBtn = document.getElementById("host-join-btn");
  const copyBtn = document.getElementById("host-copy-address-btn");
  const hostLine = document.getElementById("host-status-line");
  const joinLine = document.getElementById("host-join-status");
  const mcInput = document.getElementById("host-mc-version");
  let joinPlatform = "bedrock";
  let lastResolvedAddress = "";

  document.querySelectorAll("[data-join-platform]").forEach((btn) => {
    btn.addEventListener("click", () => {
      joinPlatform = btn.dataset.joinPlatform === "java" ? "java" : "bedrock";
      document.querySelectorAll("[data-join-platform]").forEach((b) => {
        b.classList.toggle("active", b.dataset.joinPlatform === joinPlatform);
      });
      if (joinBtn) {
        joinBtn.textContent = joinPlatform === "java" ? "Connect on Java" : "Connect on Bedrock";
      }
    });
  });

  mcInput?.addEventListener("change", () => {
    void refreshHostView();
  });

  startBtn?.addEventListener("click", async () => {
    if (!api?.bridgeHost) {
      setHostLine(hostLine, "Bridge host API unavailable.", "error");
      return;
    }
    const port = Number(document.getElementById("host-world-port")?.value || 25565);
    const minecraftVersion = String(mcInput?.value || "1.21.1").trim();
    setHostPill("busy", "Starting");
    setHostLine(hostLine, "Preparing Geyser and network mapping…");
    startBtn.disabled = true;

    const result = await api.bridgeHost({ localWorldPort: port, minecraftVersion });
    if (result?.success) {
      renderHostSession({
        code: result.code,
        endpoint: result.endpoint,
        geyserVersion: result.versions?.geyserVersion,
      });
      setHostLine(
        hostLine,
        `Live. Bedrock ${result.endpoint?.bedrockAddress || ""} · Java ${result.endpoint?.javaAddress || ""}`,
        "ok"
      );
    } else {
      renderHostSession(null);
      const msg = result?.error?.message || result?.error?.title || "Failed to start Space Bridge.";
      setHostLine(hostLine, msg, "error");
    }
    startBtn.disabled = false;
  });

  stopBtn?.addEventListener("click", async () => {
    if (!api?.bridgeStop) return;
    setHostPill("busy", "Stopping");
    setHostLine(hostLine, "Stopping bridge…");
    await api.bridgeStop();
    renderHostSession(null);
    setHostLine(hostLine, "Bridge stopped.", "ok");
  });

  copyBtn?.addEventListener("click", async () => {
    if (!lastResolvedAddress) return;
    try {
      await navigator.clipboard.writeText(lastResolvedAddress);
      setHostLine(joinLine, `Copied ${lastResolvedAddress}`, "ok");
    } catch {
      setHostLine(joinLine, lastResolvedAddress, "ok");
    }
  });

  joinBtn?.addEventListener("click", async () => {
    if (!api?.bridgeJoin) {
      setHostLine(joinLine, "Bridge join API unavailable.", "error");
      return;
    }
    const code = String(document.getElementById("host-join-code")?.value || "").trim();
    if (!code) {
      setHostLine(joinLine, "Enter a Space Bridge code.", "error");
      return;
    }
    const preferLocal = Boolean(document.getElementById("host-join-local")?.checked);
    setHostLine(joinLine, joinPlatform === "java" ? "Resolving code for Java…" : "Resolving code for Bedrock…");
    joinBtn.disabled = true;

    const result = await api.bridgeJoin({
      code,
      platform: joinPlatform,
      preferLocal,
    });
    joinBtn.disabled = false;

    const resolvedEl = document.getElementById("host-resolved");
    const resolvedAddr = document.getElementById("host-resolved-address");

    if (!result?.success) {
      const msg = result?.error?.message || result?.error?.title || "Could not join with that code.";
      setHostLine(joinLine, msg, "error");
      resolvedEl?.setAttribute("hidden", "");
      copyBtn?.setAttribute("hidden", "");
      return;
    }

    lastResolvedAddress = result.endpoint?.address || "";
    if (resolvedEl && resolvedAddr && lastResolvedAddress) {
      resolvedAddr.textContent = lastResolvedAddress;
      resolvedEl.removeAttribute("hidden");
      copyBtn?.removeAttribute("hidden");
    }

    if (joinPlatform === "java") {
      setHostLine(joinLine, `Launching Java → ${lastResolvedAddress}…`);
      if (!api.launchGame) {
        setHostLine(joinLine, `Java address ready: ${lastResolvedAddress}. Launch Minecraft and join Multiplayer.`, "ok");
        return;
      }
      const launch = await api.launchGame({
        version: result.launch?.version || "1.21.1",
        loader: result.launch?.loader || "fabric",
        server: result.launch?.server,
        port: result.launch?.port,
      });
      if (launch?.success) {
        setHostLine(joinLine, `Connecting to ${lastResolvedAddress}…`, "ok");
      } else {
        setHostLine(
          joinLine,
          launch?.error || `Could not auto-launch. Join Multiplayer → ${lastResolvedAddress}`,
          "error"
        );
      }
      return;
    }

    const hint = result.bedrock?.hint || "Open Servers in Bedrock and select Space Bridge.";
    setHostLine(joinLine, `Bedrock ready at ${lastResolvedAddress}. ${hint}`, "ok");
  });

  api?.onBridgeStatus?.((payload) => {
    if (payload?.label) setHostLine(hostLine, payload.label);
    if (payload?.phase === "ready") setHostPill("live", "Live");
  });

  api?.onBridgeError?.((payload) => {
    const msg = payload?.message || payload?.title || "Bridge error";
    setHostLine(hostLine, msg, payload?.severity === "warning" ? "" : "error");
  });

  api?.onBridgeExit?.(() => {
    renderHostSession(null);
    setHostLine(hostLine, "Geyser stopped.", "error");
  });
}

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

function capeSheetStyle(item) {
  const frames = Math.max(1, Number(item.frameCount) || 24);
  const duration = (frames * 0.1).toFixed(2);
  return `--cape-sheet-frames: ${frames}; --cape-sheet-duration: ${duration}s;`;
}

function renderAnimatedCapePreview(item) {
  const sheet = escapeHtml(item.sheetImage || item.previewImage || "");
  const alt = escapeHtml(item.name);
  return `
    <div class="cape-live-preview" aria-hidden="true">
      <div class="cape-live-cape-window">
        <img class="cape-live-sheet" src="${sheet}" alt="${alt} animation" style="${capeSheetStyle(item)}" data-frame-count="${Number(item.frameCount) || 24}" />
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
    <article class="cosmetic-card ${item.equipped ? "equipped" : ""} ${owned ? "owned" : "locked"} ${isSpacePlusItem ? "spaceplus-exclusive" : ""} ${item.tournament ? "tournament-champion" : ""}" data-cosmetic="${item.id}" data-category="${item.category}" data-open-cosmetic="${item.id}" role="button" tabindex="0">
      <div class="cosmetic-preview${previewClass}">
        ${renderCosmeticPreview(item)}
        ${item.tournament ? '<span class="tournament-badge">Tournament</span>' : ""}
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
  initCosmeticCardColors(grid);

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
    ? `<div class="cosmetic-detail-hero ${item.tournament ? "cosmetic-detail-hero--tournament" : ""}">
         <div class="cape-live-cape-window cape-live-cape-window--xl">
           <img class="cape-live-sheet" src="${escapeHtml(item.sheetImage)}" alt="${escapeHtml(item.name)}" style="${capeSheetStyle(item)}" data-frame-count="${Number(item.frameCount) || 24}" />
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
        <p class="cosmetic-detail-kicker">${item.tournament ? "Tournament Champion" : escapeHtml(item.category === "capes" ? "Cape" : "Pet")}${isSpacePlusItem ? " · Space+" : ""}</p>
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
  let item = COSMETICS.find((entry) => entry.id === id);
  // Cosmic Shop items (titles/icons/capes) may not be on the old wardrobe list
  if (!item && window.__cosmicShopCatalog) {
    const shopItem = window.__cosmicShopCatalog.find((entry) => entry.id === id);
    if (shopItem) {
      item = {
        ...shopItem,
        price: shopItem.creditPrice ?? shopItem.price ?? null,
        equipped: false,
      };
    }
  }
  if (!overlay || !item) return;

  cosmeticDetailId = id;
  cosmeticDetailOpen = true;
  document.body.classList.add("cosmetic-detail-open");
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  renderCosmeticDetailContent(item);
}

window.openCosmeticDetail = openCosmeticDetail;

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

function getSelectedInstance() {
  return instanceState.items.find((item) => item.id === instanceState.selectedId) || null;
}

function getSelectedInstanceContent(bucket) {
  const instance = getSelectedInstance();
  return instance?.content?.[bucket] || {};
}

function getInstalledMods() {
  return getSelectedInstanceContent("mods");
}

function getInstalledResourcePacks() {
  return getSelectedInstanceContent("resourcepacks");
}

function getInstalledShaders() {
  return getSelectedInstanceContent("shaderpacks");
}

function isModInstalled(projectId) {
  return Boolean(getInstalledMods()[projectId]);
}

function isResourcePackInstalled(projectId) {
  return Boolean(getInstalledResourcePacks()[projectId]);
}

function isShaderInstalled(projectId) {
  return Boolean(getInstalledShaders()[projectId]);
}

function getInstalledModpacks() {
  return Object.fromEntries(
    instanceState.items
      .filter((item) => item.source?.type === "modpack" && item.source?.projectId)
      .map((item) => [
        item.source.projectId,
        {
          title: item.source.title || item.name,
          slug: item.source.slug || "",
          versionId: item.source.versionId || null,
          versionNumber: item.content?.modpacks?.[item.source.projectId]?.versionNumber || null,
          installedAt: item.createdAt || 0,
          instanceId: item.id,
        },
      ])
  );
}

function isModpackInstalled(projectId) {
  return Boolean(getInstalledModpacks()[projectId]);
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

  syncLaunchMenuFromSelects();
}

let launchVersionPatchKey = null;

function parseMcVersion(version) {
  return version.split(".").map((part) => parseInt(part, 10) || 0);
}

function compareMcVersions(a, b) {
  const partsA = parseMcVersion(a);
  const partsB = parseMcVersion(b);
  const length = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function isFabricLoaderSelected() {
  const loaderSelect = document.getElementById("home-loader");
  const loader = loaderSelect?.value || modrinthState.homeLoader || "fabric";
  return loader !== "vanilla";
}

function getVersionsForLoader(loader = modrinthState.homeLoader) {
  if (loader === "vanilla") return [...MINECRAFT_VERSIONS];
  return fabricSupportedVersions.length ? [...fabricSupportedVersions] : [DEFAULT_FABRIC_MC];
}

function isFabricVersionSupported(version) {
  return fabricSupportedVersions.includes(String(version || "").trim());
}

function isFabricPinLaunchError(error) {
  return /No Fabric API pin|Fabric API required/i.test(String(error || ""));
}

function describeFabricVersionError(version) {
  const supported = fabricSupportedVersions.length
    ? fabricSupportedVersions.join(", ")
    : DEFAULT_FABRIC_MC;
  return `Fabric is not set up for Minecraft ${version}. Supported Fabric versions: ${supported}. Use ${DEFAULT_FABRIC_MC} (recommended) or switch to Vanilla.`;
}

function validateLaunchSelection(version, loader) {
  if (isLegacyJavaTarget(version) || loader === "vanilla") {
    return null;
  }
  if (loader !== "vanilla" && !isFabricVersionSupported(version)) {
    return describeFabricVersionError(version);
  }
  return null;
}

function getJavaTargetLabel(version) {
  const entry = JAVA_TARGET_POOL.find((item) => item.value === version);
  return entry?.label || version;
}

function isLegacyJavaTarget(version) {
  return JAVA_TARGET_POOL.some((item) => item.value === version && item.legacy);
}

function syncBedrockChannelUI() {
  const preview = Boolean(modrinthState.bedrockPreview);
  document.querySelectorAll("[data-bedrock-channel]").forEach((btn) => {
    const active = (btn.dataset.bedrockChannel === "preview") === preview;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const hint = document.getElementById("home-bedrock-channel-hint");
  if (hint) {
    hint.textContent = preview
      ? "Opens Microsoft.MinecraftWindowsBeta"
      : "Opens Microsoft.MinecraftUWP";
  }
  const channel = document.getElementById("home-bedrock-channel");
  if (channel) channel.hidden = modrinthState.edition !== "bedrock";
}

function setBedrockPreview(enabled, { persist = true } = {}) {
  modrinthState.bedrockPreview = Boolean(enabled);
  if (persist) {
    try {
      localStorage.setItem(BEDROCK_PREVIEW_KEY, modrinthState.bedrockPreview ? "true" : "false");
    } catch {
      /* ignore */
    }
  }
  syncBedrockChannelUI();
  syncPlayButtonForEdition();
}

function populateHomeVersionSelect(preferredVersion) {
  const versionSelect = document.getElementById("home-version");
  const triggerText = document.getElementById("home-version-trigger-text");
  const menu = document.getElementById("home-version-menu");
  if (!versionSelect && !menu) return;

  const edition = modrinthState.edition === "bedrock" ? "bedrock" : "java";

  // Bedrock uses Retail/Preview channel UI — keep hidden select empty.
  if (edition === "bedrock") {
    if (versionSelect) versionSelect.innerHTML = "";
    if (menu) menu.innerHTML = "";
    if (triggerText) triggerText.textContent = modrinthState.bedrockPreview ? "Preview" : "Retail";
    syncBedrockChannelUI();
    return;
  }

  const loader = document.getElementById("home-loader")?.value || modrinthState.homeLoader;
  const options = getVersionsForLoader(loader);

  let selected =
    preferredVersion ||
    modrinthState.version ||
    versionSelect?.value ||
    triggerText?.textContent?.trim();

  if (!options.includes(selected)) {
    selected = options.includes(DEFAULT_JAVA_TARGET)
      ? DEFAULT_JAVA_TARGET
      : options.includes(DEFAULT_FABRIC_MC)
        ? DEFAULT_FABRIC_MC
        : options[0];
  }

  if (versionSelect) {
    versionSelect.innerHTML = options
      .map((v) => `<option value="${v}"${v === selected ? " selected" : ""}>${getJavaTargetLabel(v)}</option>`)
      .join("");
  }

  if (menu) {
    menu.innerHTML = options
      .map(
        (v) =>
          `<li role="none"><button type="button" class="home-version-option${v === selected ? " is-selected" : ""}" role="option" data-version="${escapeHtml(v)}" aria-selected="${v === selected ? "true" : "false"}">${escapeHtml(getJavaTargetLabel(v))}</button></li>`
      )
      .join("");
  }

  if (triggerText) triggerText.textContent = getJavaTargetLabel(selected) || selected || "";
  modrinthState.version = selected;

  // Legacy 1.8.9 forces Vanilla loader.
  if (isLegacyJavaTarget(selected)) {
    const loaderSelect = document.getElementById("home-loader");
    if (loaderSelect && loaderSelect.value !== "vanilla") {
      loaderSelect.value = "vanilla";
      modrinthState.homeLoader = "vanilla";
    }
  }
}

function syncVisibleVersionSelect() {
  const versionSelect = document.getElementById("home-version");
  const triggerText = document.getElementById("home-version-trigger-text");
  const menu = document.getElementById("home-version-menu");
  if (!versionSelect) return;

  const selected = versionSelect.value;
  const label = getJavaTargetLabel(selected);
  if (triggerText && triggerText.textContent !== label) {
    triggerText.textContent = label;
  }
  if (menu) {
    menu.querySelectorAll(".home-version-option").forEach((btn) => {
      const isSelected = btn.dataset.version === selected;
      btn.classList.toggle("is-selected", isSelected);
      btn.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
  }
}

function setHomeVersionDropdownOpen(open) {
  const trigger = document.getElementById("home-version-trigger");
  const menu = document.getElementById("home-version-menu");
  const dropdown = document.getElementById("home-version-dropdown");
  if (!trigger || !menu) return;

  menu.hidden = !open;
  trigger.setAttribute("aria-expanded", open ? "true" : "false");
  dropdown?.classList.toggle("is-open", open);

  if (open) {
    const selected = menu.querySelector(".home-version-option.is-selected");
    (selected || menu.querySelector(".home-version-option"))?.focus();
  }
}

function closeHomeVersionDropdown() {
  setHomeVersionDropdownOpen(false);
}

function applyVisibleHomeVersion(value) {
  const versionSelect = document.getElementById("home-version");
  if (modrinthState.edition === "bedrock") {
    setBedrockPreview(value === "preview" || value === true);
    return;
  }
  modrinthState.version = value;
  if (versionSelect) {
    versionSelect.value = value;
    versionSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (isLegacyJavaTarget(value)) {
    const loaderSelect = document.getElementById("home-loader");
    if (loaderSelect) {
      loaderSelect.value = "vanilla";
      modrinthState.homeLoader = "vanilla";
    }
  }
  syncVisibleVersionSelect();
  syncLaunchToApp();
  closeHomeVersionDropdown();
}

function syncPlayButtonForEdition() {
  const playBtn = document.querySelector(".btn-play");
  if (!playBtn || playBtn.classList.contains("launching")) return;

  const loggedIn = Boolean(currentAuthState?.isLoggedIn);
  const bedrock = modrinthState.edition === "bedrock";
  const canLaunch = bedrock || loggedIn;
  const label = bedrock
    ? modrinthState.bedrockPreview
      ? "Open Preview"
      : "Open Bedrock"
    : "Launch";

  playBtn.disabled = !canLaunch;
  playBtn.setAttribute("aria-disabled", canLaunch ? "false" : "true");
  playBtn.classList.toggle("ready", canLaunch);
  setPlayButtonLabel(playBtn, label);
  playBtn.title = bedrock
    ? modrinthState.bedrockPreview
      ? "Open Minecraft Bedrock Preview"
      : "Open Minecraft Bedrock Retail"
    : loggedIn
      ? "Launch Minecraft Java"
      : "Sign in to play";
}

const JAVA_ONLY_VIEWS = new Set(["content", "store", "library", "create", "spaceplus", "cosmetics"]);

function getActiveViewId() {
  const active = document.querySelector(".view.active");
  if (!active?.id?.startsWith("view-")) return "home";
  return active.id.slice("view-".length);
}

function syncJavaOnlyChrome() {
  const bedrock = modrinthState.edition === "bedrock";
  document.body.dataset.homeEdition = bedrock ? "bedrock" : "java";

  const accountSub = document.getElementById("account-page-sub");
  if (accountSub) {
    accountSub.textContent = bedrock
      ? "Microsoft sign-in and profile"
      : "Microsoft sign-in, profile, and Space+";
  }

  if (bedrock && JAVA_ONLY_VIEWS.has(getActiveViewId())) {
    navigateToView("home");
  }
}

function setHomeEdition(edition, { persist = true } = {}) {
  const next = edition === "bedrock" ? "bedrock" : "java";
  modrinthState.edition = next;
  if (persist) {
    try {
      localStorage.setItem(HOME_EDITION_KEY, next);
    } catch {
      /* ignore */
    }
  }

  document.querySelectorAll("[data-edition]").forEach((btn) => {
    const active = btn.dataset.edition === next;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });

  const preferred = next === "bedrock" ? null : modrinthState.version;
  populateHomeVersionSelect(preferred);
  syncBedrockChannelUI();
  if (typeof syncLaunchToApp === "function") syncLaunchToApp();
  syncPlayButtonForEdition();
  syncJavaOnlyChrome();
}

function initHomeEditionPicker() {
  let stored = "java";
  try {
    stored = localStorage.getItem(HOME_EDITION_KEY) || "java";
  } catch {
    stored = "java";
  }

  let previewStored = false;
  try {
    previewStored = localStorage.getItem(BEDROCK_PREVIEW_KEY) === "true";
  } catch {
    previewStored = false;
  }
  setBedrockPreview(previewStored, { persist: false });
  setHomeEdition(stored, { persist: false });

  document.querySelectorAll("[data-edition]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setHomeEdition(btn.dataset.edition);
    });
  });

  document.querySelectorAll("[data-bedrock-channel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setBedrockPreview(btn.dataset.bedrockChannel === "preview");
    });
  });

  const trigger = document.getElementById("home-version-trigger");
  const menu = document.getElementById("home-version-menu");
  const dropdown = document.getElementById("home-version-dropdown");

  trigger?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = trigger.getAttribute("aria-expanded") !== "true";
    setHomeVersionDropdownOpen(open);
  });

  menu?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-version]");
    if (!option) return;
    applyVisibleHomeVersion(option.dataset.version);
  });

  document.addEventListener("click", (event) => {
    if (!dropdown || dropdown.contains(event.target)) return;
    closeHomeVersionDropdown();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && trigger?.getAttribute("aria-expanded") === "true") {
      closeHomeVersionDropdown();
      trigger.focus();
    }
  });
}

function getHomeVersionOptions() {
  const versionSelect = document.getElementById("home-version");
  if (!versionSelect) return getVersionsForLoader();
  const domOptions = Array.from(versionSelect.options).map((opt) => opt.value);
  return domOptions.length ? domOptions : getVersionsForLoader();
}

function getLatestHomeVersion(options = getHomeVersionOptions()) {
  if (!options.length) return null;
  return options.reduce((best, version) => (
    compareMcVersions(version, best) > 0 ? version : best
  ));
}

function getMajorLine(version) {
  const parts = version.split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return version;
}

function getPatchVersionsForMajor(major, options = getHomeVersionOptions()) {
  return options
    .filter((version) => version === major || version.startsWith(`${major}.`))
    .sort((a, b) => compareMcVersions(b, a));
}

function getMajorVersionLines(options = getHomeVersionOptions()) {
  const majors = new Set();
  for (const version of options) {
    majors.add(getMajorLine(version));
  }
  return Array.from(majors).sort((a, b) => compareMcVersions(b, a));
}

function getActiveMajorLine() {
  const versionSelect = document.getElementById("home-version");
  if (!versionSelect?.value) return null;
  return getMajorLine(versionSelect.value);
}

function renderLaunchVersionLoaderToggle() {
  const loaderSelect = document.getElementById("home-loader");
  const loaderToggle = document.getElementById("launch-version-loader-toggle");
  if (!loaderSelect || !loaderToggle) return;

  loaderToggle.innerHTML = Array.from(loaderSelect.options)
    .map((opt) => {
      const selected = opt.value === loaderSelect.value;
      return `<button type="button" class="launch-version-loader-btn${selected ? " is-selected" : ""}" data-loader="${escapeHtml(opt.value)}" aria-pressed="${selected ? "true" : "false"}">${escapeHtml(opt.textContent)}</button>`;
    })
    .join("");
}

function renderLaunchVersionMajorGrid() {
  const majorGrid = document.getElementById("launch-version-major-grid");
  if (!majorGrid) return;

  const options = getHomeVersionOptions();
  const activeMajor = getActiveMajorLine();
  const latestVersion = getLatestHomeVersion(options);
  const versionSelect = document.getElementById("home-version");
  const latestActive = latestVersion && versionSelect?.value === latestVersion;

  const majorCards = getMajorVersionLines(options)
    .map((major) => {
      const active = major === activeMajor;
      return `<button type="button" class="launch-version-major-card${active ? " is-active" : ""}" data-major="${escapeHtml(major)}">${escapeHtml(major)}</button>`;
    })
    .join("");

  const latestCard = latestVersion
    ? `<button type="button" class="launch-version-major-card is-latest${latestActive ? " is-active" : ""}" data-major="latest">Latest version<span>${escapeHtml(latestVersion)}</span></button>`
    : "";

  majorGrid.innerHTML = majorCards + latestCard;
}

function renderLaunchVersionPatchList(majorKey) {
  const patchList = document.getElementById("launch-version-patch-list");
  const patchTitle = document.getElementById("launch-version-patch-title");
  const patchSubtitle = document.getElementById("launch-version-patch-subtitle");
  const versionSelect = document.getElementById("home-version");
  if (!patchList || !patchTitle || !patchSubtitle || !versionSelect) return;

  const options = getHomeVersionOptions();
  const patches = majorKey === "latest"
    ? [getLatestHomeVersion(options)].filter(Boolean)
    : getPatchVersionsForMajor(majorKey, options);

  patchTitle.textContent = majorKey === "latest" ? "Latest version" : majorKey;
  patchSubtitle.textContent = majorKey === "latest"
    ? "Newest release available"
    : "Select a patch release";

  patchList.innerHTML = patches
    .map((version) => {
      const selected = version === versionSelect.value;
      return `<li><button type="button" class="launch-version-patch-option${selected ? " is-selected" : ""}" data-version="${escapeHtml(version)}" role="option" aria-selected="${selected ? "true" : "false"}">${escapeHtml(version)}</button></li>`;
    })
    .join("");
}

function showLaunchVersionMajorView() {
  const majorView = document.getElementById("launch-version-major-view");
  const patchView = document.getElementById("launch-version-patch-view");
  if (!majorView || !patchView) return;

  launchVersionPatchKey = null;
  majorView.hidden = false;
  patchView.hidden = true;
  renderLaunchVersionMajorGrid();
  renderLaunchVersionLoaderToggle();
}

function showLaunchVersionPatchView(majorKey) {
  const majorView = document.getElementById("launch-version-major-view");
  const patchView = document.getElementById("launch-version-patch-view");
  if (!majorView || !patchView) return;

  launchVersionPatchKey = majorKey;
  majorView.hidden = true;
  patchView.hidden = false;
  renderLaunchVersionPatchList(majorKey);
  renderLaunchVersionLoaderToggle();
}

function syncLaunchMenuFromSelects() {
  renderLaunchVersionMajorGrid();
  renderLaunchVersionLoaderToggle();

  const patchView = document.getElementById("launch-version-patch-view");
  if (patchView && !patchView.hidden && launchVersionPatchKey) {
    renderLaunchVersionPatchList(launchVersionPatchKey);
  }
}

function setLaunchMenuOpen(open) {
  const overlay = document.getElementById("launch-version-overlay");
  const menuBtn = document.getElementById("btn-launch-menu");
  const launchSplit = document.getElementById("launch-split");
  if (!overlay || !menuBtn) return;

  overlay.hidden = !open;
  overlay.setAttribute("aria-hidden", open ? "false" : "true");
  menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  launchSplit?.classList.toggle("menu-open", open);
  document.body.classList.toggle("launch-version-open", open);

  if (open) {
    showLaunchVersionMajorView();
  }
}

function closeLaunchMenu() {
  setLaunchMenuOpen(false);
}

function setLaunchMenuInteractive(enabled) {
  const menuBtn = document.getElementById("btn-launch-menu");
  if (!menuBtn) return;
  menuBtn.disabled = !enabled;
  menuBtn.setAttribute("aria-disabled", enabled ? "false" : "true");
  if (!enabled) closeLaunchMenu();
}

function selectHomeVersion(version) {
  const versionSelect = document.getElementById("home-version");
  if (!versionSelect || versionSelect.value === version) return;

  versionSelect.value = version;
  versionSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectHomeLoader(loader) {
  const loaderSelect = document.getElementById("home-loader");
  if (!loaderSelect || loaderSelect.value === loader) return;

  loaderSelect.value = loader;
  loaderSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

function initLaunchSplitMenu() {
  const versionSelect = document.getElementById("home-version");
  const loaderSelect = document.getElementById("home-loader");
  const menuBtn = document.getElementById("btn-launch-menu");
  const overlay = document.getElementById("launch-version-overlay");
  const majorGrid = document.getElementById("launch-version-major-grid");
  const patchList = document.getElementById("launch-version-patch-list");
  const backBtn = document.getElementById("launch-version-back");
  const loaderToggle = document.getElementById("launch-version-loader-toggle");
  if (!versionSelect || !loaderSelect || !menuBtn || !overlay || !majorGrid || !patchList || !backBtn || !loaderToggle) return;

  syncLaunchMenuFromSelects();

  menuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (menuBtn.disabled) return;
    setLaunchMenuOpen(overlay.hidden);
  });

  majorGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-major]");
    if (!card) return;
    showLaunchVersionPatchView(card.dataset.major);
  });

  patchList.addEventListener("click", (event) => {
    const option = event.target.closest("[data-version]");
    if (!option) return;
    selectHomeVersion(option.dataset.version);
    syncLaunchMenuFromSelects();
    closeLaunchMenu();
  });

  backBtn.addEventListener("click", () => {
    showLaunchVersionMajorView();
  });

  loaderToggle.addEventListener("click", (event) => {
    const option = event.target.closest("[data-loader]");
    if (!option) return;
    selectHomeLoader(option.dataset.loader);
    syncLaunchMenuFromSelects();
  });

  overlay.addEventListener("click", (event) => {
    if (event.target.closest("[data-launch-version-close]")) {
      closeLaunchMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !overlay.hidden) closeLaunchMenu();
  });

  versionSelect.addEventListener("change", syncLaunchMenuFromSelects);
  loaderSelect.addEventListener("change", syncLaunchMenuFromSelects);
}

function initLaunchSelectors() {
  const versionSelect = document.getElementById("home-version");
  const loaderSelect = document.getElementById("home-loader");
  if (!versionSelect || !loaderSelect) return;

  if (!fabricSupportedVersions.includes(modrinthState.version)) {
    modrinthState.version = isFabricLoaderSelected()
      ? DEFAULT_FABRIC_MC
      : MINECRAFT_VERSIONS.includes(modrinthState.version)
        ? modrinthState.version
        : DEFAULT_FABRIC_MC;
  }

  populateHomeVersionSelect(modrinthState.version);
  loaderSelect.value = modrinthState.homeLoader;
  syncLaunchToApp();

  versionSelect.addEventListener("change", () => {
    modrinthState.version = versionSelect.value;
    syncVisibleVersionSelect();
    syncLaunchToApp();
    const selected = getSelectedInstance();
    if (selected) {
      window.electronAPI?.updateInstance?.(selected.id, { mcVersion: versionSelect.value }).then((result) => {
        if (result?.success) refreshInstances();
      }).catch(() => {});
    }
    if (modrinthState.loaded) {
      modrinthState.offset = 0;
      fetchModrinthMods();
    }
    if (modpackState.loaded) {
      modpackState.offset = 0;
      fetchModrinthModpacks();
    }
    if (resourcePackState.loaded) {
      resourcePackState.offset = 0;
      fetchResourcePacks();
    }
    if (shaderState.loaded) {
      shaderState.offset = 0;
      fetchShaders();
    }
  });

  loaderSelect.addEventListener("change", () => {
    modrinthState.homeLoader = loaderSelect.value;
    populateHomeVersionSelect(versionSelect.value);
    syncLaunchToApp();
    if (loaderSelect.value !== "vanilla") {
      modpackState.loader = loaderSelect.value;
      const packLoader = document.getElementById("modpack-loader");
      if (packLoader) packLoader.value = loaderSelect.value;
    }
    const selected = getSelectedInstance();
    if (selected) {
      window.electronAPI?.updateInstance?.(selected.id, {
        loader: loaderSelect.value,
        mcVersion: versionSelect.value,
      }).then((result) => {
        if (result?.success) refreshInstances();
      }).catch(() => {});
    }
    if (modrinthState.loaded) {
      modrinthState.offset = 0;
      fetchModrinthMods();
    }
    if (modpackState.loaded) {
      modpackState.offset = 0;
      fetchModrinthModpacks();
    }
    if (resourcePackState.loaded) {
      resourcePackState.offset = 0;
      fetchResourcePacks();
    }
    if (shaderState.loaded) {
      shaderState.offset = 0;
      fetchShaders();
    }
  });

  initLaunchSplitMenu();
}

function syncModrinthFiltersFromSettings() {
  const loaderSelect = document.getElementById("modrinth-loader");
  if (loaderSelect) loaderSelect.value = modrinthState.loader;
}

function requireSelectedInstance() {
  const selected = getSelectedInstance();
  if (!selected) {
    throw new Error("Create or select an instance first.");
  }
  return selected;
}

function renderProjectCard(hit, projectType, installAttr) {
  const installed =
    projectType === "mod"
      ? isModInstalled(hit.project_id)
      : projectType === "resourcepack"
        ? isResourcePackInstalled(hit.project_id)
        : projectType === "shader"
          ? isShaderInstalled(hit.project_id)
          : isModpackInstalled(hit.project_id);
  const icon = hit.icon_url
    ? `<img class="modrinth-icon" src="${escapeHtml(hit.icon_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<div class="modrinth-icon modrinth-icon-fallback" aria-hidden="true"></div>`;
  return `
    <article class="modrinth-card ${installed ? "installed" : ""}" data-project-id="${escapeHtml(hit.project_id)}" data-view-mod="${escapeHtml(hit.slug)}" data-author="${escapeHtml(hit.author)}" role="button" tabindex="0">
      ${icon}
      <div class="modrinth-body">
        <div class="modrinth-title-row">
          <h3 class="modrinth-title" title="${escapeHtml(hit.title)}">${escapeHtml(hit.title)}</h3>
        </div>
        <div class="modrinth-author">by ${escapeHtml(hit.author)}</div>
        <p class="modrinth-desc">${escapeHtml(hit.description || "")}</p>
        <div class="modrinth-stats">
          <span><strong>${Modrinth.formatDownloads(hit.downloads)}</strong> downloads</span>
          <span><strong>${Modrinth.formatDownloads(hit.follows)}</strong> followers</span>
        </div>
        <div class="modrinth-actions">
          <button type="button" class="btn-mod ${installed ? "installed" : "primary"}" ${installAttr}="${escapeHtml(hit.project_id)}" data-slug="${escapeHtml(hit.slug)}">
            ${installed ? "Installed" : "Install"}
          </button>
          <button type="button" class="btn-mod" data-view-mod="${escapeHtml(hit.slug)}" data-project-id="${escapeHtml(hit.project_id)}" data-author="${escapeHtml(hit.author)}">View</button>
        </div>
      </div>
    </article>`;
}

function renderModrinthCard(hit) {
  return renderProjectCard(hit, "mod", "data-install");
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
      initModrinthCardColors(grid);
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
  btn.disabled = true;
  btn.textContent = isModInstalled(projectId) ? "Removing..." : "Installing...";

  try {
    const selected = requireSelectedInstance();
    if (isModInstalled(projectId)) {
      const result = await window.electronAPI.removeInstanceProject({
        instanceId: selected.id,
        projectId,
        projectType: "mod",
      });
      if (!result?.success) throw new Error(result?.error || "Remove failed");
      await refreshInstances();
      syncInstallUI(projectId, false);
      return;
    }
    const result = await window.electronAPI.installInstanceProject({
      instanceId: selected.id,
      projectId,
      projectType: "mod",
    });
    if (!result?.success) throw new Error(result?.error || "Install failed");
    await refreshInstances();
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

  const type = project.project_type === "modpack"
    ? "modpack"
    : project.project_type === "resourcepack"
      ? "resourcepack"
      : project.project_type === "shader"
        ? "shader"
        : "mod";
  const installed = type === "modpack"
    ? isModpackInstalled(project.id)
    : type === "resourcepack"
      ? isResourcePackInstalled(project.id)
      : type === "shader"
        ? isShaderInstalled(project.id)
        : isModInstalled(project.id);
  const installAttr = type === "modpack"
    ? `data-install-pack="${project.id}"`
    : type === "resourcepack"
      ? `data-install-resource="${project.id}"`
      : type === "shader"
        ? `data-install-shader="${project.id}"`
        : `data-install="${project.id}"`;
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
      <button type="button" class="btn-mod ${installed ? "installed" : "primary"}" ${installAttr} data-slug="${escapeHtml(project.slug)}">
        ${installed ? "Installed" : "Install"}
      </button>
    </div>
    <a class="mod-detail-external" href="${Modrinth.projectUrl(project.slug, project.project_type)}" target="_blank" rel="noopener">View on Modrinth ↗</a>`;
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

    const packBtn = e.target.closest("[data-install-pack]");
    if (packBtn) {
      handleModpackInstall(packBtn.dataset.installPack, packBtn.dataset.slug, packBtn);
      return;
    }

    const resourceBtn = e.target.closest("[data-install-resource]");
    if (resourceBtn) {
      handleResourcePackInstall(resourceBtn.dataset.installResource, resourceBtn.dataset.slug, resourceBtn);
      return;
    }

    const shaderBtn = e.target.closest("[data-install-shader]");
    if (shaderBtn) {
      handleShaderInstall(shaderBtn.dataset.installShader, shaderBtn.dataset.slug, shaderBtn);
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
      e.stopPropagation();
      handleModInstall(installBtn.dataset.install, installBtn.dataset.slug, installBtn);
      return;
    }

    const viewTarget = e.target.closest("[data-view-mod]");
    if (viewTarget) {
      openModDetail(viewTarget.dataset.viewMod, { author: viewTarget.dataset.author });
    }
  });

  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".modrinth-card[data-view-mod]");
    if (!card || e.target.closest("button")) return;
    e.preventDefault();
    openModDetail(card.dataset.viewMod, { author: card.dataset.author });
  });
}

function updateActiveModCount() {
  const instance = getSelectedInstance();
  if (!instance) return;
  const meta = document.getElementById("library-meta");
  if (!meta) return;
  const count = instance.totalInstalledContent || 0;
  meta.textContent = `${instanceState.items.length} instance${instanceState.items.length === 1 ? "" : "s"} · ${count} item${count === 1 ? "" : "s"} installed in ${instance.name}`;
}

function renderModpackCard(hit) {
  return renderProjectCard(hit, "modpack", "data-install-pack");
}

function renderModpackPagination() {
  const pagination = document.getElementById("modpack-pagination");
  if (!pagination) return;

  const page = Math.floor(modpackState.offset / MODRINTH_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(modpackState.totalHits / MODRINTH_PAGE_SIZE));

  pagination.innerHTML = `
    <button type="button" id="modpack-prev" ${modpackState.offset === 0 ? "disabled" : ""}>Previous</button>
    <span>Page ${page} of ${totalPages}</span>
    <button type="button" id="modpack-next" ${page >= totalPages ? "disabled" : ""}>Next</button>`;

  document.getElementById("modpack-prev")?.addEventListener("click", () => {
    modpackState.offset = Math.max(0, modpackState.offset - MODRINTH_PAGE_SIZE);
    fetchModrinthModpacks();
  });

  document.getElementById("modpack-next")?.addEventListener("click", () => {
    modpackState.offset += MODRINTH_PAGE_SIZE;
    fetchModrinthModpacks();
  });
}

async function fetchModrinthModpacks() {
  if (modpackState.loading) return;

  const grid = document.getElementById("modpack-grid");
  const meta = document.getElementById("modpack-meta");
  if (!grid) return;

  modpackState.loading = true;
  grid.innerHTML = renderModrinthSkeletons();
  if (meta) meta.textContent = "Loading modpacks from Modrinth…";

  try {
    const data = await Modrinth.search({
      query: modpackState.query,
      loader: modpackState.loader,
      version: modrinthState.version,
      index: modpackState.index,
      offset: modpackState.offset,
      limit: MODRINTH_PAGE_SIZE,
      projectType: "modpack",
    });

    modpackState.totalHits = data.total_hits;
    modpackState.loaded = true;

    if (!data.hits.length) {
      grid.innerHTML = '<div class="modrinth-empty">No modpacks found. Try a different search or filter.</div>';
    } else {
      grid.innerHTML = data.hits.map(renderModpackCard).join("");
      initModrinthCardColors(grid);
    }

    if (meta) {
      meta.textContent = `${data.total_hits.toLocaleString()} modpacks · ${modpackState.loader} · Minecraft ${modrinthState.version}`;
    }

    renderModpackPagination();
  } catch (err) {
    grid.innerHTML = `<div class="modrinth-error">Failed to load modpacks: ${escapeHtml(err.message)}</div>`;
    if (meta) meta.textContent = "";
    const pagination = document.getElementById("modpack-pagination");
    if (pagination) pagination.innerHTML = "";
  } finally {
    modpackState.loading = false;
  }
}

function syncModpackInstallUI(projectId, installed) {
  document.querySelectorAll(`[data-install-pack="${projectId}"]`).forEach((btn) => {
    btn.classList.toggle("installed", installed);
    btn.classList.toggle("primary", !installed);
    btn.textContent = installed ? "Installed" : "Install";
  });
  document.querySelectorAll(`.modrinth-card[data-project-id="${projectId}"]`).forEach((card) => {
    card.classList.toggle("installed", installed);
  });
}

async function handleModpackInstall(projectId, slug, btn) {
  if (isModpackInstalled(projectId)) return;
  btn.disabled = true;
  btn.textContent = isModpackInstalled(projectId) ? "Installed" : "Installing...";

  try {
    const result = await window.electronAPI.installModpackInstance({
      projectId,
      loader: modpackState.loader,
      gameVersion: modrinthState.version,
    });
    if (!result?.success) throw new Error(result?.error || "Modpack install failed");
    instanceState.selectedId = result.instance?.id || instanceState.selectedId;
    await refreshInstances({ preserveSelection: true });
    syncModpackInstallUI(projectId, true);
  } catch (err) {
    document.querySelectorAll(`[data-install-pack="${projectId}"]`).forEach((installBtn) => {
      installBtn.textContent = "Failed";
      setTimeout(() => {
        installBtn.classList.add("primary");
        installBtn.classList.remove("installed");
        installBtn.textContent = "Install";
      }, 2000);
    });
    console.error("Modpack install failed:", err);
  } finally {
    document.querySelectorAll(`[data-install-pack="${projectId}"]`).forEach((installBtn) => {
      installBtn.disabled = false;
    });
  }
}

function initModpacks() {
  const grid = document.getElementById("modpack-grid");
  const searchInput = document.getElementById("modpack-search");
  const loaderSelect = document.getElementById("modpack-loader");
  const sortSelect = document.getElementById("modpack-sort");
  if (!grid) return;

  if (loaderSelect) loaderSelect.value = modpackState.loader;

  let searchDebounce;
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      modpackState.query = searchInput.value;
      modpackState.offset = 0;
      fetchModrinthModpacks();
    }, 350);
  });

  loaderSelect?.addEventListener("change", () => {
    modpackState.loader = loaderSelect.value;
    modpackState.offset = 0;
    fetchModrinthModpacks();
  });

  sortSelect?.addEventListener("change", () => {
    modpackState.index = sortSelect.value;
    modpackState.offset = 0;
    fetchModrinthModpacks();
  });

  grid.addEventListener("click", (e) => {
    const installBtn = e.target.closest("[data-install-pack]");
    if (installBtn) {
      e.stopPropagation();
      handleModpackInstall(installBtn.dataset.installPack, installBtn.dataset.slug, installBtn);
      return;
    }

    const viewTarget = e.target.closest("[data-view-mod]");
    if (viewTarget) {
      openModDetail(viewTarget.dataset.viewMod, { author: viewTarget.dataset.author });
    }
  });

  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".modrinth-card[data-view-mod]");
    if (!card || e.target.closest("button")) return;
    e.preventDefault();
    openModDetail(card.dataset.viewMod, { author: card.dataset.author });
  });
}

function syncResourcePackInstallUI(projectId, installed) {
  document.querySelectorAll(`[data-install-resource="${projectId}"]`).forEach((btn) => {
    setInstallButtonState(btn, installed);
  });
  document.querySelectorAll(`.modrinth-card[data-project-id="${projectId}"]`).forEach((card) => {
    card.classList.toggle("installed", installed);
  });
}

async function handleResourcePackInstall(projectId, slug, btn) {
  btn.disabled = true;
  btn.textContent = isResourcePackInstalled(projectId) ? "Removing..." : "Installing...";
  try {
    const selected = requireSelectedInstance();
    if (isResourcePackInstalled(projectId)) {
      const result = await window.electronAPI.removeInstanceProject({
        instanceId: selected.id,
        projectId,
        projectType: "resourcepack",
      });
      if (!result?.success) throw new Error(result?.error || "Remove failed");
      await refreshInstances();
      syncResourcePackInstallUI(projectId, false);
      return;
    }
    const result = await window.electronAPI.installInstanceProject({
      instanceId: selected.id,
      projectId,
      projectType: "resourcepack",
    });
    if (!result?.success) throw new Error(result?.error || "Install failed");
    await refreshInstances();
    syncResourcePackInstallUI(projectId, true);
  } catch (err) {
    btn.textContent = "Failed";
    setTimeout(() => setInstallButtonState(btn, false), 2000);
  } finally {
    btn.disabled = false;
  }
}

function renderResourcePackCard(hit) {
  return renderProjectCard(hit, "resourcepack", "data-install-resource");
}

function syncShaderInstallUI(projectId, installed) {
  document.querySelectorAll(`[data-install-shader="${projectId}"]`).forEach((btn) => {
    setInstallButtonState(btn, installed);
  });
  document.querySelectorAll(`.modrinth-card[data-project-id="${projectId}"]`).forEach((card) => {
    card.classList.toggle("installed", installed);
  });
}

async function handleShaderInstall(projectId, slug, btn) {
  btn.disabled = true;
  btn.textContent = isShaderInstalled(projectId) ? "Removing..." : "Installing...";
  try {
    const selected = requireSelectedInstance();
    if (isShaderInstalled(projectId)) {
      const result = await window.electronAPI.removeInstanceProject({
        instanceId: selected.id,
        projectId,
        projectType: "shader",
      });
      if (!result?.success) throw new Error(result?.error || "Remove failed");
      await refreshInstances();
      syncShaderInstallUI(projectId, false);
      return;
    }
    const result = await window.electronAPI.installInstanceProject({
      instanceId: selected.id,
      projectId,
      projectType: "shader",
    });
    if (!result?.success) throw new Error(result?.error || "Install failed");
    await refreshInstances();
    syncShaderInstallUI(projectId, true);
  } catch (err) {
    btn.textContent = "Failed";
    setTimeout(() => setInstallButtonState(btn, false), 2000);
  } finally {
    btn.disabled = false;
  }
}

function renderShaderCard(hit) {
  return renderProjectCard(hit, "shader", "data-install-shader");
}

function renderPagedContentPagination(elementId, state, onChange) {
  const pagination = document.getElementById(elementId);
  if (!pagination) return;
  const page = Math.floor(state.offset / MODRINTH_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(state.totalHits / MODRINTH_PAGE_SIZE));
  pagination.innerHTML = `
    <button type="button" data-page-nav="prev" ${state.offset === 0 ? "disabled" : ""}>Previous</button>
    <span>Page ${page} of ${totalPages}</span>
    <button type="button" data-page-nav="next" ${page >= totalPages ? "disabled" : ""}>Next</button>`;
  pagination.querySelector('[data-page-nav="prev"]')?.addEventListener("click", () => {
    state.offset = Math.max(0, state.offset - MODRINTH_PAGE_SIZE);
    onChange();
  });
  pagination.querySelector('[data-page-nav="next"]')?.addEventListener("click", () => {
    state.offset += MODRINTH_PAGE_SIZE;
    onChange();
  });
}

async function fetchResourcePacks() {
  if (resourcePackState.loading) return;
  const grid = document.getElementById("resourcepack-grid");
  const meta = document.getElementById("resourcepack-meta");
  if (!grid) return;
  resourcePackState.loading = true;
  grid.innerHTML = renderModrinthSkeletons();
  if (meta) meta.textContent = "Loading resource packs from Modrinth...";
  try {
    const data = await Modrinth.search({
      query: resourcePackState.query,
      version: modrinthState.version,
      index: resourcePackState.index,
      offset: resourcePackState.offset,
      limit: MODRINTH_PAGE_SIZE,
      projectType: "resourcepack",
    });
    resourcePackState.totalHits = data.total_hits;
    resourcePackState.loaded = true;
    grid.innerHTML = data.hits.length
      ? data.hits.map(renderResourcePackCard).join("")
      : '<div class="modrinth-empty">No resource packs found.</div>';
    initModrinthCardColors(grid);
    if (meta) meta.textContent = `${data.total_hits.toLocaleString()} resource packs · Minecraft ${modrinthState.version}`;
    renderPagedContentPagination("resourcepack-pagination", resourcePackState, fetchResourcePacks);
  } catch (err) {
    grid.innerHTML = `<div class="modrinth-error">Failed to load resource packs: ${escapeHtml(err.message)}</div>`;
    if (meta) meta.textContent = "";
  } finally {
    resourcePackState.loading = false;
  }
}

function initResourcePacks() {
  const grid = document.getElementById("resourcepack-grid");
  const searchInput = document.getElementById("resourcepack-search");
  const sortSelect = document.getElementById("resourcepack-sort");
  if (!grid) return;
  let searchDebounce;
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      resourcePackState.query = searchInput.value;
      resourcePackState.offset = 0;
      fetchResourcePacks();
    }, 350);
  });
  sortSelect?.addEventListener("change", () => {
    resourcePackState.index = sortSelect.value;
    resourcePackState.offset = 0;
    fetchResourcePacks();
  });
  grid.addEventListener("click", (e) => {
    const installBtn = e.target.closest("[data-install-resource]");
    if (installBtn) {
      e.stopPropagation();
      handleResourcePackInstall(installBtn.dataset.installResource, installBtn.dataset.slug, installBtn);
      return;
    }
    const viewTarget = e.target.closest("[data-view-mod]");
    if (viewTarget) openModDetail(viewTarget.dataset.viewMod, { author: viewTarget.dataset.author });
  });
}

async function fetchShaders() {
  if (shaderState.loading) return;
  const grid = document.getElementById("shader-grid");
  const meta = document.getElementById("shader-meta");
  if (!grid) return;
  shaderState.loading = true;
  grid.innerHTML = renderModrinthSkeletons();
  if (meta) meta.textContent = "Loading shaders from Modrinth...";
  try {
    const data = await Modrinth.search({
      query: shaderState.query,
      loader: modrinthState.loader,
      version: modrinthState.version,
      index: shaderState.index,
      offset: shaderState.offset,
      limit: MODRINTH_PAGE_SIZE,
      projectType: "shader",
    });
    shaderState.totalHits = data.total_hits;
    shaderState.loaded = true;
    grid.innerHTML = data.hits.length
      ? data.hits.map(renderShaderCard).join("")
      : '<div class="modrinth-empty">No shaders found.</div>';
    initModrinthCardColors(grid);
    if (meta) meta.textContent = `${data.total_hits.toLocaleString()} shaders · Minecraft ${modrinthState.version}`;
    renderPagedContentPagination("shader-pagination", shaderState, fetchShaders);
  } catch (err) {
    grid.innerHTML = `<div class="modrinth-error">Failed to load shaders: ${escapeHtml(err.message)}</div>`;
    if (meta) meta.textContent = "";
  } finally {
    shaderState.loading = false;
  }
}

function initShaders() {
  const grid = document.getElementById("shader-grid");
  const searchInput = document.getElementById("shader-search");
  const sortSelect = document.getElementById("shader-sort");
  if (!grid) return;
  let searchDebounce;
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      shaderState.query = searchInput.value;
      shaderState.offset = 0;
      fetchShaders();
    }, 350);
  });
  sortSelect?.addEventListener("change", () => {
    shaderState.index = sortSelect.value;
    shaderState.offset = 0;
    fetchShaders();
  });
  grid.addEventListener("click", (e) => {
    const installBtn = e.target.closest("[data-install-shader]");
    if (installBtn) {
      e.stopPropagation();
      handleShaderInstall(installBtn.dataset.installShader, installBtn.dataset.slug, installBtn);
      return;
    }
    const viewTarget = e.target.closest("[data-view-mod]");
    if (viewTarget) openModDetail(viewTarget.dataset.viewMod, { author: viewTarget.dataset.author });
  });
}

const BG_THEMES = [
  { id: "starfield", label: "Starfield" },
  { id: "nebula", label: "Nebula" },
  { id: "aurora", label: "Aurora" },
  { id: "void", label: "Deep Void" },
  { id: "ember", label: "Ember" },
  { id: "hyperspace", label: "Hyperspace" },
];

const HERO_GREETINGS = [
  { before: "Welcome aboard,", after: "", theme: "welcome" },
  { before: "Ready to get started,", after: "?", theme: "launch" },
  { before: "Back in orbit,", after: "", theme: "orbit" },
  { before: "Systems online,", after: "", theme: "cyber" },
  { before: "Good to see you,", after: "", theme: "warm" },
  { before: "Launch when ready,", after: "", theme: "launch" },
  { before: "Clear skies ahead,", after: "", theme: "sky" },
  { before: "Suit up,", after: "", theme: "suit" },
  { before: "Another orbit awaits,", after: "", theme: "orbit" },
  { before: "Welcome home,", after: "", theme: "welcome" },
  { before: "The void is calling,", after: "", theme: "void" },
  { before: "All set,", after: "?", theme: "play" },
  { before: "Time to play,", after: "", theme: "play" },
  { before: "Mission standing by,", after: "", theme: "cyber" },
  { before: "Let's make some noise,", after: "", theme: "ember" },
];

let lastHeroGreetingIndex = -1;

function getHeroDisplayName(state = currentAuthState) {
  const loggedIn = Boolean(state?.isLoggedIn && state?.profile);
  return loggedIn ? state.profile.username : "Guest";
}

function pickHeroGreetingIndex() {
  if (HERO_GREETINGS.length <= 1) return 0;
  let next = Math.floor(Math.random() * HERO_GREETINGS.length);
  if (next === lastHeroGreetingIndex) {
    next = (next + 1) % HERO_GREETINGS.length;
  }
  lastHeroGreetingIndex = next;
  return next;
}

/**
 * @param {{ rotate?: boolean, state?: object }} [options]
 */
function updateHeroGreeting(options = {}) {
  const rotate = options.rotate !== false;
  const state = options.state || currentAuthState;
  const textEl = document.getElementById("hero-greeting-text");
  const nameEl = document.getElementById("hero-greeting-name");
  const suffixEl = document.getElementById("hero-greeting-suffix");
  const greetingEl = document.getElementById("hero-greeting");
  if (!textEl || !nameEl || !suffixEl) return;

  if (rotate || lastHeroGreetingIndex < 0) {
    pickHeroGreetingIndex();
    greetingEl?.classList.remove("is-swapping");
    // Retrigger CSS fade if available
    void greetingEl?.offsetWidth;
    greetingEl?.classList.add("is-swapping");
  }

  const line = HERO_GREETINGS[Math.max(0, lastHeroGreetingIndex)] || HERO_GREETINGS[0];
  if (document.body.classList.contains("meme-mode")) {
    textEl.textContent = "wow. welcome aboard, ";
    nameEl.textContent = "guests";
    suffixEl.textContent = ". very play. much block.";
    if (greetingEl) greetingEl.dataset.theme = "meme";
    return;
  }
  textEl.textContent = `${line.before} `;
  nameEl.textContent = getHeroDisplayName(state);
  suffixEl.textContent = line.after || "";
  const homeName = document.getElementById("home-player-name");
  if (homeName && !document.body.classList.contains("meme-mode")) {
    homeName.textContent = getHeroDisplayName(state);
  }
  if (greetingEl) {
    greetingEl.dataset.theme = line.theme || "welcome";
  }
}

function updateHeroGreetingNameOnly(state = currentAuthState) {
  const nameEl = document.getElementById("hero-greeting-name");
  const homeName = document.getElementById("home-player-name");
  const name = document.body.classList.contains("meme-mode") ? "guests" : getHeroDisplayName(state);
  if (nameEl) nameEl.textContent = name;
  if (homeName) homeName.textContent = document.body.classList.contains("meme-mode") ? "guests" : getHeroDisplayName(state);
  refreshHomePlayer(state?.profile || null, getHeroDisplayName(state));
}

const MEME_MODE_KEY = "spaceclient-meme-mode";

function setPlayButtonLabel(btn, normalLabel = "Launch") {
  if (!btn) return;
  btn.dataset.normalLabel = normalLabel;
  let label = normalLabel;
  if (document.body.classList.contains("meme-mode")) {
    if (/launching/i.test(normalLabel)) label = "LUNCHING GAEM… 🚀";
    else if (/in game/i.test(normalLabel)) label = "IN GAEM 🎮";
    else label = "LUNCH GAEM 🚀";
  }
  let labelEl = btn.querySelector(".btn-play-label");
  if (!labelEl) {
    btn.replaceChildren();
    labelEl = document.createElement("span");
    labelEl.className = "btn-play-label";
    labelEl.id = "btn-play-label";
    btn.appendChild(labelEl);
  }
  labelEl.textContent = label;
}

function initMemeMode() {
  const toggle = document.getElementById("meme-mode-toggle");
  const doge = document.getElementById("meme-doge");
  const greeting = document.getElementById("hero-greeting");
  const playBtn = document.querySelector(".btn-play");
  if (!toggle) return;

  let greetingClicks = 0;
  let clickResetTimer = 0;
  const konami = [
    "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
    "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
    "b", "a",
  ];
  let konamiIndex = 0;

  const apply = (enabled, { persist = true } = {}) => {
    document.body.classList.toggle("meme-mode", enabled);
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggle.title = enabled ? "Disable Meme Mode" : "Meme Mode";
    if (doge) {
      doge.hidden = !enabled;
      doge.setAttribute("aria-hidden", enabled ? "false" : "true");
    }
    if (persist) localStorage.setItem(MEME_MODE_KEY, enabled ? "1" : "0");
    updateHeroGreeting({ rotate: false });
    setPlayButtonLabel(playBtn, playBtn?.dataset.normalLabel || "Launch");
  };

  const toggleMode = () => apply(!document.body.classList.contains("meme-mode"));

  toggle.addEventListener("click", toggleMode);
  greeting?.addEventListener("click", () => {
    greetingClicks += 1;
    clearTimeout(clickResetTimer);
    if (greetingClicks >= 5) {
      greetingClicks = 0;
      toggleMode();
      return;
    }
    clickResetTimer = window.setTimeout(() => {
      greetingClicks = 0;
    }, 1600);
  });

  document.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === konami[konamiIndex]) {
      konamiIndex += 1;
      if (konamiIndex === konami.length) {
        konamiIndex = 0;
        toggleMode();
      }
    } else {
      konamiIndex = key === konami[0] ? 1 : 0;
    }
  });

  apply(localStorage.getItem(MEME_MODE_KEY) === "1", { persist: false });
}

function getPerfPack() {
  const stored = String(localStorage.getItem(PERF_PACK_KEY) || "none").toLowerCase();
  if (stored === "weak" || stored === "balanced" || stored === "strong") return stored;
  return "none";
}

function applyPerfPack(pack) {
  const id = ["none", "weak", "balanced", "strong"].includes(String(pack)) ? String(pack) : "none";
  localStorage.setItem(PERF_PACK_KEY, id);
  document.querySelectorAll("[data-perf-pack]").forEach((btn) => {
    const active = btn.dataset.perfPack === id;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", active ? "true" : "false");
  });
  return id;
}

function navigateToView(viewId) {
  // Legacy deep links — Content is modpacks; instance add-content opens mods
  if (viewId === "mods" || viewId === "resourcepacks" || viewId === "shaders") {
    setContentMode("instance", { tab: viewId === "mods" ? "mods" : viewId });
    viewId = "content";
  }
  if (viewId === "modpacks") {
    setContentMode("modpacks");
    viewId = "content";
  }
  if (viewId === "presets") viewId = "create";
  if (viewId === "cosmetics") {
    setStoreTab("cosmetics");
    viewId = "store";
  }

  if (modrinthState.edition === "bedrock" && JAVA_ONLY_VIEWS.has(viewId)) {
    viewId = "home";
  }

  const target = document.getElementById(`view-${viewId}`);
  if (!target) return;

  const navHighlight =
    viewId === "spaceplus" || viewId === "settings" ? "account" : viewId;
  const navBtn = document.querySelector(`.nav-btn[data-view="${navHighlight}"]`);
  // Allow secondary views (settings / spaceplus) even when only Account is in the nav
  if (navBtn?.hidden) return;
  if (
    modrinthState.edition === "bedrock" &&
    navBtn?.hasAttribute("data-java-only") &&
    viewId !== "home"
  ) {
    return;
  }

  document.querySelectorAll(".nav-btn[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === navHighlight);
  });
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v === target));
  document.body.classList.toggle("home-active", viewId === "home");

  if (viewId === "home") {
    updateHeroGreeting({ rotate: true });
    refreshProfileViews();
    initCherryPetals();
    setHomeTrailerPlaying(true);
  } else {
    setHomeTrailerPlaying(false);
  }
  if (viewId === "content") {
    if (contentMode !== "instance") setContentMode("modpacks");
    else syncContentModeChrome();
    ensureContentTabLoaded();
  }
  if (viewId === "library") {
    renderLibrary();
  }
  if (viewId === "create") {
    syncCreateInstanceForm();
  }
  if (viewId === "skin" || viewId === "account") {
    refreshProfileViews();
  }
  if (viewId === "skin") {
    void refreshSkinLibrary();
  }
  if (viewId === "friends") {
    void refreshFriendsView();
  }
  if (viewId === "thanks") {
    renderThanksGrid();
  }
  if (viewId === "host") {
    void refreshHostView();
  }
  if (viewId === "store") {
    setStoreTab(storeTab);
  }
}

let storeTab = "cosmic";

function setStoreTab(tabId) {
  const next = tabId === "credits" ? "credits" : "cosmic";
  storeTab = next;

  document.querySelectorAll("[data-store-tab]").forEach((btn) => {
    const active = btn.dataset.storeTab === next;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  const creditsPanel = document.getElementById("store-panel-credits");
  const cosmicPanel = document.getElementById("store-panel-cosmic");
  if (creditsPanel) {
    const show = next === "credits";
    creditsPanel.classList.toggle("active", show);
    creditsPanel.hidden = !show;
  }
  if (cosmicPanel) {
    const show = next === "cosmic";
    cosmicPanel.classList.toggle("active", show);
    cosmicPanel.hidden = !show;
    if (show && typeof window.refreshCosmicShop === "function") {
      window.refreshCosmicShop();
    }
  }
}

function initStoreTabs() {
  document.querySelectorAll("[data-store-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setStoreTab(btn.dataset.storeTab));
  });
  setStoreTab(storeTab);
}

let contentTab = "modpacks";
/** @type {"modpacks" | "instance"} */
let contentMode = "modpacks";

function syncContentModeChrome() {
  const heading = document.getElementById("content-heading");
  const sub = document.getElementById("content-subheading");
  const tabs = document.getElementById("content-tabs");
  const target = document.getElementById("content-instance-target");
  const banner = document.getElementById("content-mode-banner");
  const bannerText = document.getElementById("content-mode-banner-text");
  const selected = getSelectedInstance();
  const isInstance = contentMode === "instance";

  if (heading) heading.textContent = isInstance ? "Add Content" : "Modpacks";
  if (sub) {
    sub.textContent = isInstance
      ? "Install mods, resource packs, and shaders into the selected instance."
      : "Install Modrinth modpacks as ready-to-play instances. Add mods from Library → Add Content.";
  }
  if (tabs) tabs.hidden = !isInstance;
  if (target) target.hidden = !isInstance;
  if (banner) banner.hidden = !isInstance;
  if (bannerText && selected) {
    bannerText.innerHTML = `Adding content to <strong>${escapeHtml(selected.name)}</strong> · ${escapeHtml(selected.loader)} · ${escapeHtml(selected.mcVersion)}`;
  } else if (bannerText) {
    bannerText.textContent = "Select an instance from Library to add content.";
  }
}

function setContentMode(mode, { tab } = {}) {
  contentMode = mode === "instance" ? "instance" : "modpacks";
  syncContentModeChrome();
  if (contentMode === "modpacks") {
    setContentTab("modpacks");
  } else {
    setContentTab(tab || "mods");
  }
}

function setContentTab(tabId) {
  let next = tabId;
  if (contentMode === "modpacks") {
    next = "modpacks";
  } else if (!["mods", "resourcepacks", "shaders"].includes(next)) {
    next = "mods";
  }
  contentTab = next;

  document.querySelectorAll("[data-content-tab]").forEach((btn) => {
    const active = btn.dataset.contentTab === next;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  const modsPanel = document.getElementById("content-panel-mods");
  const packsPanel = document.getElementById("content-panel-modpacks");
  const resourcePanel = document.getElementById("content-panel-resourcepacks");
  const shaderPanel = document.getElementById("content-panel-shaders");
  if (modsPanel) {
    const show = next === "mods";
    modsPanel.classList.toggle("active", show);
    modsPanel.hidden = !show;
  }
  if (packsPanel) {
    const show = next === "modpacks";
    packsPanel.classList.toggle("active", show);
    packsPanel.hidden = !show;
  }
  if (resourcePanel) {
    const show = next === "resourcepacks";
    resourcePanel.classList.toggle("active", show);
    resourcePanel.hidden = !show;
  }
  if (shaderPanel) {
    const show = next === "shaders";
    shaderPanel.classList.toggle("active", show);
    shaderPanel.hidden = !show;
  }
}

function ensureContentTabLoaded() {
  if (contentTab === "modpacks") {
    if (!modpackState.loaded && !modpackState.loading) {
      fetchModrinthModpacks();
    }
  } else if (contentTab === "resourcepacks") {
    if (!resourcePackState.loaded && !resourcePackState.loading) {
      fetchResourcePacks();
    }
  } else if (contentTab === "shaders") {
    if (!shaderState.loaded && !shaderState.loading) {
      fetchShaders();
    }
  } else if (!modrinthState.loaded && !modrinthState.loading) {
    syncModrinthFiltersFromSettings();
    fetchModrinthMods();
  }
}

function initContentTabs() {
  const instanceSelect = document.getElementById("content-instance-select");
  document.querySelectorAll("[data-content-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (contentMode !== "instance") return;
      setContentTab(btn.dataset.contentTab);
      ensureContentTabLoaded();
    });
  });
  instanceSelect?.addEventListener("change", () => {
    if (!instanceSelect.value) return;
    selectInstance(instanceSelect.value);
    modrinthState.loaded = false;
    resourcePackState.loaded = false;
    shaderState.loaded = false;
    syncContentModeChrome();
    ensureContentTabLoaded();
  });
  document.getElementById("content-back-modpacks")?.addEventListener("click", () => {
    setContentMode("modpacks");
    ensureContentTabLoaded();
  });
  setContentMode("modpacks");
  syncContentInstancePicker();
}

function openSpacePlusFromCosmetics() {
  closeCosmeticDetail();
  navigateToView("spaceplus");
}

function updateTitlebarPlayer(state) {
  currentAuthState = {
    isLoggedIn: Boolean(state?.isLoggedIn && state?.profile),
    profile: state?.profile || null,
  };
  updateHeroGreetingNameOnly(state);

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

  if (loggedIn) {
    startAvatarRefreshPoll();
  } else {
    stopAvatarRefreshPoll();
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
      if (btn.hidden) return;
      if (btn.dataset.view === "content") setContentMode("modpacks");
      navigateToView(btn.dataset.view);
    });
  });

  try {
    const params = new URLSearchParams(window.location.search || "");
    const openView = params.get("view");
    if (openView) navigateToView(openView);

    // Trailer capture mode: cycle real launcher screens for FFmpeg window grab.
    if (params.get("capture") === "1") {
      const tour = [
        "home",
        "skin",
        "content",
        "host",
        "library",
        "create",
        "account",
        "friends",
        "store",
        "settings",
        "home",
      ];
      let i = 0;
      const stepMs = Number(params.get("captureMs") || 4500);
      const runTour = () => {
        const view = tour[i % tour.length];
        navigateToView(view);
        i += 1;
      };
      runTour();
      window.__spaceCaptureTour = setInterval(runTour, stepMs);
    }
  } catch {
    /* ignore */
  }
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

function normalizeSkinVariant(variant) {
  const v = String(variant || "classic").toLowerCase();
  return v === "slim" || v === "alex" ? "slim" : "classic";
}

let skinPreviewCacheBust = 0;
/** @type {ReturnType<typeof setInterval>|null} */
let avatarRefreshTimer = null;
/** @type {object|null} */
let skinBrowsePlayer = null;
/** @type {{ skinId: string, name: string, variant: string }|null} */
let skinPreviewOverride = null;
/** @type {Map<string, object>} */
const skinLibraryById = new Map();
/** @type {Promise<void>|null} */
let skinPreviewRequest = null;

function bustSkinPreviewImages() {
  skinPreviewCacheBust = Date.now();
}

function stopAvatarRefreshPoll() {
  if (avatarRefreshTimer) {
    clearInterval(avatarRefreshTimer);
    avatarRefreshTimer = null;
  }
}

function buildSkinPreviewPayload({ bodySize = 180, headSize = 96, browse = false } = {}) {
  const profile = currentAuthState?.profile || null;
  const payload = {
    uuid: profile?.uuid,
    username: profile?.username,
    textureUrl: profile?.skinTextureUrl || null,
    variant: profile?.skinVariant || "classic",
    bodySize,
    headSize,
  };

  if (skinPreviewOverride?.skinId) {
    payload.skinId = skinPreviewOverride.skinId;
    payload.variant = skinPreviewOverride.variant || payload.variant;
    return payload;
  }

  if (browse && skinBrowsePlayer) {
    payload.uuid = skinBrowsePlayer.uuidCompact || skinBrowsePlayer.uuid || null;
    payload.username = skinBrowsePlayer.name || payload.username;
    payload.textureUrl = skinBrowsePlayer.textureUrl || payload.textureUrl;
    const variantEl = document.getElementById("skin-browse-variant");
    payload.variant = variantEl?.value || skinBrowsePlayer.variant || payload.variant;
    return payload;
  }

  return payload;
}

function setPreviewImage(img, dataUrl, alt) {
  if (!img || !dataUrl) return;
  if (alt) img.alt = alt;
  if (img.src === dataUrl) {
    img.src = "";
  }
  img.src = dataUrl;
}

async function fetchSkinPreviewImages(options = {}) {
  const api = window.electronAPI;
  if (!api?.getSkinPreview) return null;
  const payload = buildSkinPreviewPayload(options);
  try {
    return await api.getSkinPreview(payload);
  } catch {
    return null;
  }
}

async function refreshSkinPreviewImages() {
  if (skinPreviewRequest) return skinPreviewRequest;

  skinPreviewRequest = (async () => {
    const profile = currentAuthState?.profile || null;
    const loggedIn = Boolean(currentAuthState?.isLoggedIn && profile);
    const name = skinPreviewOverride?.name || (loggedIn ? profile.username || "Player" : "Guest");

    const [sidebarPreview, homePreview, headPreview] = await Promise.all([
      fetchSkinPreviewImages({ bodySize: 180, headSize: 96 }),
      fetchSkinPreviewImages({ bodySize: 280, headSize: 96 }),
      fetchSkinPreviewImages({ headSize: 96 }),
    ]);

    const skinImg = document.getElementById("skin-preview-img");
    const skinName = document.getElementById("skin-preview-name");
    const skinStatus = document.getElementById("skin-preview-status");
    const skinVariant = document.getElementById("skin-preview-variant");
    const homeSkinImg = document.getElementById("home-player-skin");
    const cardHead = document.getElementById("account-card-head");

    if (skinImg && sidebarPreview?.bodyDataUrl) {
      setPreviewImage(skinImg, sidebarPreview.bodyDataUrl, `${name}'s skin preview`);
    }
    if (homeSkinImg && homePreview?.bodyDataUrl) {
      setPreviewImage(homeSkinImg, homePreview.bodyDataUrl, `${name}'s skin`);
    }
    if (cardHead && headPreview?.headDataUrl) {
      setPreviewImage(cardHead, headPreview.headDataUrl, loggedIn ? `${name}'s player head` : "");
    }
    const navHead = document.getElementById("nav-account-head");
    if (navHead && loggedIn && headPreview?.headDataUrl) {
      navHead.hidden = false;
      setPreviewImage(navHead, headPreview.headDataUrl, `${name}'s player head`);
    }

    if (skinName) skinName.textContent = name;
    if (skinStatus) {
      if (skinPreviewOverride) {
        skinStatus.textContent = "Previewing library skin (not applied yet).";
      } else if (loggedIn) {
        skinStatus.textContent = "Showing your Microsoft account skin.";
      } else {
        skinStatus.textContent = "Sign in to manage your skin.";
      }
    }
    const variant = skinPreviewOverride?.variant || sidebarPreview?.variant || profile?.skinVariant;
    if (skinVariant) {
      if ((loggedIn || skinPreviewOverride) && variant) {
        skinVariant.hidden = false;
        skinVariant.textContent = normalizeSkinVariant(variant) === "slim" ? "Model: Slim" : "Model: Classic";
      } else {
        skinVariant.hidden = true;
      }
    }
  })();

  try {
    await skinPreviewRequest;
  } finally {
    skinPreviewRequest = null;
  }
}

async function pollActiveSkinProfile() {
  const api = window.electronAPI;
  if (!api?.getActiveSkin || !currentAuthState?.isLoggedIn) return;

  try {
    const result = await api.getActiveSkin();
    if (!result?.success) return;

    bustSkinPreviewImages();
    const nextProfile = {
      ...(currentAuthState.profile || {}),
      ...(result.profile || {}),
    };
    if (result.activeSkin) {
      nextProfile.skinVariant = result.activeSkin.variant || nextProfile.skinVariant;
      if (result.activeSkin.url) {
        nextProfile.skinTextureUrl = String(result.activeSkin.url).replace(/^http:\/\//i, "https://");
      }
    }
    currentAuthState = {
      isLoggedIn: true,
      profile: nextProfile,
    };
    void refreshProfileViews();
    updateTitlebarPlayer(currentAuthState);
  } catch {
    // ignore background poll errors
  }
}

function startAvatarRefreshPoll() {
  stopAvatarRefreshPoll();
  if (!currentAuthState?.isLoggedIn) return;
  avatarRefreshTimer = setInterval(() => {
    void pollActiveSkinProfile();
  }, 10000);
}

async function updateBrowseBodyPreview() {
  const body = document.getElementById("skin-browse-body");
  if (!body || !skinBrowsePlayer) return;

  const preview = await fetchSkinPreviewImages({ bodySize: 180, browse: true });
  if (preview?.bodyDataUrl) {
    setPreviewImage(body, preview.bodyDataUrl, `${skinBrowsePlayer.name}'s skin`);
    return;
  }

  const bust = Date.now();
  if (skinBrowsePlayer.textureUrl) {
    body.src = `${skinBrowsePlayer.textureUrl}${skinBrowsePlayer.textureUrl.includes("?") ? "&" : "?"}t=${bust}`;
    return;
  }
  if (skinBrowsePlayer.bodyUrl) {
    body.src = `${skinBrowsePlayer.bodyUrl}${skinBrowsePlayer.bodyUrl.includes("?") ? "&" : "?"}t=${bust}`;
  }
}

function refreshHomePlayer(profile, name) {
  const nameEl = document.getElementById("home-player-name");
  if (nameEl) nameEl.textContent = name || "Guest";
}

/** Official Minecraft animated update trailers (Village & Pillage → Tricky Trials). */
const HOME_TRAILER_YT_IDS = [
  "gcf9FM4TbN4", // Village & Pillage
  "1DhWXAiNgfQ", // Nether Update
  "0maWbr0FHKY", // Caves & Cliffs
  "GXr5glhGkzE", // The Wild Update (frogs)
  "NG-5L34HqOs", // Tricky Trials
];
const HOME_TRAILER_LOCAL = [
  "assets/video/trailers/01-village-pillage.mp4",
  "assets/video/trailers/02-nether-update.mp4",
  "assets/video/trailers/03-caves-cliffs.mp4",
  "assets/video/trailers/04-wild-update.mp4",
  "assets/video/trailers/05-tricky-trials.mp4",
];
const HOME_TRAILER_FALLBACK = "assets/video/cherry-grove.mp4";

function initCherryPetals() {
  initCherryGroveVideo();
}

function setHomeTrailerPlaying(playing) {
  const video = document.getElementById("cherry-grove-video");
  const host = document.getElementById("home-trailer-host");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (video && !video.hidden) {
    if (playing && !reduced) {
      const p = video.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else {
      video.pause();
    }
  }
  if (host && !host.hidden) {
    const iframe = host.querySelector("iframe");
    // YouTube postMessage play/pause — best-effort when embeds are used
    if (iframe?.contentWindow) {
      const func = playing && !reduced ? "playVideo" : "pauseVideo";
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func, args: [] }),
        "https://www.youtube-nocookie.com"
      );
    }
  }
}

function probeLocalVideo(src) {
  return new Promise((resolve) => {
    const probe = document.createElement("video");
    probe.preload = "metadata";
    const done = (ok) => {
      probe.removeAttribute("src");
      probe.load();
      resolve(ok);
    };
    probe.onloadedmetadata = () => done(true);
    probe.onerror = () => done(false);
    probe.src = src;
  });
}

function startLocalTrailerPlaylist(video, playlist) {
  video.hidden = false;
  video.muted = true;
  video.playsInline = true;
  video.loop = false;

  let index = Math.floor(Math.random() * playlist.length);
  const tryPlay = () => {
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };
  const loadAt = (i) => {
    index = ((i % playlist.length) + playlist.length) % playlist.length;
    video.src = playlist[index];
    tryPlay();
  };

  video.addEventListener("ended", () => loadAt(index + 1));
  video.addEventListener("error", () => loadAt(index + 1));
  video.addEventListener("canplay", tryPlay);
  loadAt(index);
}

function startYoutubeTrailerPlaylist(host) {
  const start = Math.floor(Math.random() * HOME_TRAILER_YT_IDS.length);
  const ordered = HOME_TRAILER_YT_IDS.slice(start).concat(HOME_TRAILER_YT_IDS.slice(0, start));
  const first = ordered[0];
  const playlist = ordered.join(",");
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    modestbranding: "1",
    rel: "0",
    playsinline: "1",
    iv_load_policy: "3",
    disablekb: "1",
    fs: "0",
    loop: "1",
    playlist,
  });

  const iframe = document.createElement("iframe");
  iframe.className = "home-trailer-iframe";
  iframe.title = "Minecraft update trailers";
  iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.setAttribute("allowfullscreen", "");
  iframe.src = `https://www.youtube-nocookie.com/embed/${first}?${params.toString()}`;
  host.appendChild(iframe);
  host.hidden = false;
}

function startFallbackBiomeLoop(video) {
  video.hidden = false;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.src = HOME_TRAILER_FALLBACK;
  const p = video.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

async function initCherryGroveVideo() {
  const video = document.getElementById("cherry-grove-video");
  const host = document.getElementById("home-trailer-host");
  if (!video || video.dataset.ready === "1") return;
  video.dataset.ready = "1";

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    startFallbackBiomeLoop(video);
    video.pause();
    return;
  }

  const available = [];
  for (const src of HOME_TRAILER_LOCAL) {
    if (await probeLocalVideo(src)) available.push(src);
  }

  if (available.length >= 1) {
    if (host) host.hidden = true;
    startLocalTrailerPlaylist(video, available);
    return;
  }

  if (host) {
    try {
      startYoutubeTrailerPlaylist(host);
      video.hidden = true;
      return;
    } catch (_) {
      /* fall through */
    }
  }

  startFallbackBiomeLoop(video);
}

function refreshProfileViews() {
  const loggedIn = Boolean(currentAuthState?.isLoggedIn && currentAuthState?.profile);
  const profile = currentAuthState?.profile || null;
  const name = loggedIn ? profile.username || "Player" : "Guest";

  refreshHomePlayer(profile, name);

  const skinResetBtn = document.getElementById("skin-reset-btn");
  if (skinResetBtn) skinResetBtn.disabled = !loggedIn;

  const cardName = document.getElementById("account-card-name");
  const cardStatus = document.getElementById("account-card-status");
  const authBtn = document.getElementById("account-auth-btn");
  if (cardName) cardName.textContent = name;
  if (cardStatus) cardStatus.textContent = loggedIn ? "Signed in with Microsoft" : "Not signed in";
  if (authBtn) authBtn.textContent = loggedIn ? "Sign out" : "Sign in with Microsoft";

  void refreshSkinPreviewImages();
}

function persistSelectedInstance() {
  if (instanceState.selectedId) {
    localStorage.setItem(SELECTED_INSTANCE_KEY, instanceState.selectedId);
  } else {
    localStorage.removeItem(SELECTED_INSTANCE_KEY);
  }
}

function syncContentInstancePicker() {
  const select = document.getElementById("content-instance-select");
  if (!select) return;
  const options = instanceState.items
    .map(
      (instance) => `
        <option value="${escapeHtml(instance.id)}"${instance.id === instanceState.selectedId ? " selected" : ""}>
          ${escapeHtml(instance.name)} (${escapeHtml(instance.loader)} · ${escapeHtml(instance.mcVersion)})
        </option>`
    )
    .join("");
  select.innerHTML = options || '<option value="">Create an instance first</option>';
  select.disabled = instanceState.items.length === 0;
}

function syncSelectedInstanceToLaunch() {
  const selected = getSelectedInstance();
  const versionSelect = document.getElementById("home-version");
  const loaderSelect = document.getElementById("home-loader");
  if (selected && versionSelect && loaderSelect) {
    modrinthState.version = selected.mcVersion;
    modrinthState.homeLoader = selected.loader;
    modrinthState.loader = selected.loader === "vanilla" ? "fabric" : selected.loader;
    modpackState.loader = selected.loader === "vanilla" ? "fabric" : selected.loader;
    loaderSelect.value = selected.loader;
    populateHomeVersionSelect(selected.mcVersion);
    versionSelect.value = selected.mcVersion;
    syncLaunchToApp();
  }
  syncContentInstancePicker();
}

function getBrowserPreviewInstances() {
  const now = Date.now();
  return [
    {
      id: "preview-demo-survival",
      name: "Demo Survival",
      mcVersion: "1.21.1",
      loader: "fabric",
      loaderVersion: null,
      icon: null,
      source: null,
      createdAt: now - 60_000,
      updatedAt: now,
      path: "",
      content: { mods: {}, resourcepacks: {}, shaderpacks: {}, modpacks: {} },
      counts: { mods: 0, resourcepacks: 0, shaderpacks: 0, modpacks: 0 },
      totalInstalledContent: 0,
    },
    {
      id: "preview-demo-modpack",
      name: "Fabulously Optimized",
      mcVersion: "1.21.1",
      loader: "fabric",
      loaderVersion: null,
      icon: null,
      source: { type: "modpack", projectId: "preview", title: "Fabulously Optimized" },
      createdAt: now - 120_000,
      updatedAt: now - 30_000,
      path: "",
      content: { mods: {}, resourcepacks: {}, shaderpacks: {}, modpacks: {} },
      counts: { mods: 0, resourcepacks: 0, shaderpacks: 0, modpacks: 0 },
      totalInstalledContent: 0,
    },
  ];
}

async function refreshInstances({ preserveSelection = true } = {}) {
  const api = window.electronAPI;
  instanceState.loading = true;
  let result = null;
  if (api?.listInstances) {
    result = await api.listInstances();
  }
  instanceState.loading = false;
  instanceState.items = Array.isArray(result?.instances) ? result.instances : [];
  // Browser / Cursor preview has no Electron IPC — seed demo cards so Library is inspectable.
  if (!api?.listInstances && instanceState.items.length === 0) {
    instanceState.items = getBrowserPreviewInstances();
  }

  const stored = preserveSelection ? localStorage.getItem(SELECTED_INSTANCE_KEY) : null;
  const nextSelected =
    instanceState.items.find((item) => item.id === instanceState.selectedId)?.id ||
    instanceState.items.find((item) => item.id === stored)?.id ||
    instanceState.items[0]?.id ||
    null;
  instanceState.selectedId = nextSelected;
  persistSelectedInstance();
  syncSelectedInstanceToLaunch();
  renderLibrary();
}

function selectInstance(instanceId, { navigate = false, addContent = false } = {}) {
  if (!instanceState.items.some((item) => item.id === instanceId)) return;
  instanceState.selectedId = instanceId;
  persistSelectedInstance();
  syncSelectedInstanceToLaunch();
  renderLibrary();
  if (navigate || addContent) {
    setContentMode("instance", { tab: "mods" });
    modrinthState.loaded = false;
    resourcePackState.loaded = false;
    shaderState.loaded = false;
    navigateToView("content");
  }
}

function renderLibrary() {
  const grid = document.getElementById("library-grid");
  const meta = document.getElementById("library-meta");
  if (!grid) return;

  const items = [...instanceState.items].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

  if (!items.length) {
    if (meta) meta.textContent = "";
    grid.innerHTML = `
      <div class="library-empty">
        <h3>Your library is empty</h3>
        <p>Create an instance or install a modpack from Content to see it here.</p>
        <div class="library-empty-actions">
          <button type="button" class="btn-mod primary" data-library-nav="create">Create instance</button>
          <button type="button" class="btn-mod" data-library-nav="content">Browse Content</button>
        </div>
      </div>`;
    return;
  }

  if (meta) {
    const selected = getSelectedInstance();
    meta.textContent = selected
      ? `${items.length} instance${items.length === 1 ? "" : "s"} · selected: ${selected.name}`
      : `${items.length} instance${items.length === 1 ? "" : "s"} in your library`;
  }

  grid.innerHTML = items
    .map(
      (item) => `
    <article class="library-card${item.id === instanceState.selectedId ? " installed" : ""}" data-library-id="${escapeHtml(item.id)}">
      <div class="library-card-icon" aria-hidden="true">${item.source?.type === "modpack" ? "▣" : "◇"}</div>
      <div class="library-card-body">
        <h3 class="library-card-title">${escapeHtml(item.name)}</h3>
        <p class="library-card-sub">${escapeHtml(item.loader)} · ${escapeHtml(item.mcVersion)}</p>
        <span class="library-card-badge">${item.source?.type === "modpack" ? "Modpack Instance" : "Instance"}</span>
      </div>
      <div class="library-card-actions">
        <button type="button" class="btn-mod primary" data-library-launch="${escapeHtml(item.id)}">Launch</button>
        <button type="button" class="btn-mod" data-library-content="${escapeHtml(item.id)}">Add Content</button>
        <button type="button" class="btn-mod" data-library-open="${escapeHtml(item.id)}">Open Folder</button>
        <button type="button" class="btn-mod" data-library-remove="${escapeHtml(item.id)}">Remove</button>
      </div>
    </article>`
    )
    .join("");
  updateActiveModCount();
}

function initLibrary() {
  const grid = document.getElementById("library-grid");
  document.getElementById("library-create-btn")?.addEventListener("click", () => navigateToView("create"));

  grid?.addEventListener("click", (e) => {
    const navBtn = e.target.closest("[data-library-nav]");
    if (navBtn) {
      navigateToView(navBtn.dataset.libraryNav);
      return;
    }

    const card = e.target.closest("[data-library-id]");
    if (card?.dataset.libraryId) {
      selectInstance(card.dataset.libraryId);
    }

    const launchBtn = e.target.closest("[data-library-launch]");
    if (launchBtn) {
      selectInstance(launchBtn.dataset.libraryLaunch);
      document.querySelector(".btn-play")?.click();
      return;
    }

    const contentBtn = e.target.closest("[data-library-content]");
    if (contentBtn) {
      selectInstance(contentBtn.dataset.libraryContent, { addContent: true });
      return;
    }

    const openBtn = e.target.closest("[data-library-open]");
    if (openBtn) {
      window.electronAPI?.openInstanceFolder?.(openBtn.dataset.libraryOpen);
      return;
    }

    const removeBtn = e.target.closest("[data-library-remove]");
    if (!removeBtn) return;
    window.electronAPI?.deleteInstance?.(removeBtn.dataset.libraryRemove)
      .then(() => refreshInstances({ preserveSelection: false }))
      .catch(() => {});
  });
}

function syncCreateInstancePreview() {
  const nameInput = document.getElementById("create-instance-name");
  const versionSelect = document.getElementById("create-instance-version");
  const loaderSelect = document.getElementById("create-instance-loader");
  const nameEl = document.getElementById("create-preview-name");
  const metaEl = document.getElementById("create-preview-meta");
  const chipLoader = document.getElementById("create-preview-chip-loader");
  const chipVersion = document.getElementById("create-preview-chip-version");
  const noteEl = document.getElementById("create-preview-note");

  const name = String(nameInput?.value || "").trim() || "My Survival World";
  const loader = loaderSelect?.value || "fabric";
  const version = versionSelect?.value || DEFAULT_FABRIC_MC;
  const loaderLabel = loader === "vanilla" ? "Vanilla" : "Fabric";

  if (nameEl) nameEl.textContent = name;
  if (metaEl) metaEl.textContent = `${loaderLabel} · ${version}`;
  if (chipLoader) chipLoader.textContent = loaderLabel;
  if (chipVersion) chipVersion.textContent = version;
  if (noteEl) {
    noteEl.textContent =
      loader === "vanilla"
        ? "Vanilla instances can use resource packs. Add mods by switching this instance to Fabric later."
        : "This instance gets its own mods, configs, worlds, and packs — nothing shared with other profiles.";
  }
}

function syncCreateInstanceForm() {
  const versionSelect = document.getElementById("create-instance-version");
  const loaderSelect = document.getElementById("create-instance-loader");
  if (!versionSelect) return;

  const loader = loaderSelect?.value || "fabric";
  const current = versionSelect.value || modrinthState.version || DEFAULT_FABRIC_MC;
  const versions = loader === "fabric" ? fabricSupportedVersions : MINECRAFT_VERSIONS;

  versionSelect.innerHTML = versions
    .map((v) => `<option value="${escapeHtml(v)}" ${v === current ? "selected" : ""}>${escapeHtml(v)}</option>`)
    .join("");

  if (![...versionSelect.options].some((o) => o.value === current)) {
    versionSelect.value = versions.includes(DEFAULT_FABRIC_MC) ? DEFAULT_FABRIC_MC : versions[0];
  }
  if (loaderSelect && !loaderSelect.value) loaderSelect.value = "fabric";

  document.querySelectorAll("[data-create-loader]").forEach((card) => {
    const active = card.dataset.createLoader === (loaderSelect?.value || "fabric");
    card.classList.toggle("active", active);
    card.setAttribute("aria-checked", active ? "true" : "false");
  });

  syncCreateInstancePreview();
}

function initCreateInstance() {
  const form = document.getElementById("create-instance-form");
  const nameInput = document.getElementById("create-instance-name");
  const versionSelect = document.getElementById("create-instance-version");
  const loaderSelect = document.getElementById("create-instance-loader");
  const hint = document.getElementById("create-instance-hint");
  const cancelBtn = document.getElementById("create-instance-cancel");
  if (!form) return;

  syncCreateInstanceForm();

  nameInput?.addEventListener("input", syncCreateInstancePreview);
  versionSelect?.addEventListener("change", syncCreateInstancePreview);

  document.getElementById("create-loader-cards")?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-create-loader]");
    if (!card || !loaderSelect) return;
    loaderSelect.value = card.dataset.createLoader;
    loaderSelect.dispatchEvent(new Event("change"));
  });

  loaderSelect?.addEventListener("change", () => {
    const keep = versionSelect?.value;
    const versions = loaderSelect.value === "fabric" ? fabricSupportedVersions : MINECRAFT_VERSIONS;
    if (versionSelect) {
      versionSelect.innerHTML = versions.map((v) => `<option value="${v}">${v}</option>`).join("");
      versionSelect.value = versions.includes(keep) ? keep : versions.includes(DEFAULT_FABRIC_MC) ? DEFAULT_FABRIC_MC : versions[0];
    }
    syncCreateInstanceForm();
  });

  cancelBtn?.addEventListener("click", () => navigateToView("library"));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = String(nameInput?.value || "").trim();
    if (!name) return;

    const submitBtn = document.getElementById("create-instance-submit");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating…";
    }

    const api = window.electronAPI;
    const result = await api?.createInstance?.({
      name,
      mcVersion: versionSelect?.value || DEFAULT_FABRIC_MC,
      loader: loaderSelect?.value || "fabric",
    });

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create instance";
    }

    if (!result?.success || !result.instance) {
      if (hint) {
        hint.hidden = false;
        hint.textContent = result?.error || "Failed to create instance.";
      }
      return;
    }

    if (nameInput) nameInput.value = "";
    instanceState.selectedId = result.instance.id;
    await refreshInstances({ preserveSelection: true });
    syncCreateInstancePreview();
    if (hint) {
      hint.hidden = false;
      hint.textContent = `Created "${result.instance.name}". Opening Library...`;
    }
    setTimeout(() => {
      if (hint) hint.hidden = true;
      navigateToView("library");
    }, 450);
  });
}

function initAccount() {
  const accountBtn = document.getElementById("nav-account-btn");
  const guestIcon = accountBtn?.querySelector(".nav-account-guest");
  const headImg = document.getElementById("nav-account-head");
  const authBtn = document.getElementById("account-auth-btn");
  const api = window.electronAPI;
  let authBusy = false;

  function updatePlayButton(loggedIn) {
    currentAuthState.isLoggedIn = Boolean(loggedIn);
    syncPlayButtonForEdition();
  }

  function setAccountButton(loggedIn, profile) {
    if (!accountBtn) return;
    accountBtn.classList.toggle("is-signed-in", loggedIn);
    accountBtn.classList.toggle("is-busy", authBusy);
    accountBtn.disabled = authBusy;

    if (loggedIn && profile) {
      const name = profile.username || "Player";
      accountBtn.title = `${name} — Account`;
      accountBtn.setAttribute("aria-label", `Account — ${name}`);
      guestIcon?.setAttribute("hidden", "");
      if (headImg) {
        headImg.hidden = false;
        headImg.alt = `${name}'s player head`;
      }
    } else {
      accountBtn.title = "Account";
      accountBtn.setAttribute("aria-label", "Account");
      guestIcon?.removeAttribute("hidden");
      if (headImg) {
        headImg.hidden = true;
        headImg.removeAttribute("src");
        headImg.alt = "";
        headImg.onerror = null;
      }
    }
  }

  function applyAuthState(state) {
    currentAuthState = {
      isLoggedIn: Boolean(state?.isLoggedIn && state?.profile),
      profile: state?.profile || null,
    };

    const loggedIn = currentAuthState.isLoggedIn;
    const profile = currentAuthState.profile;

    if (!loggedIn) {
      localStorage.removeItem(IN_GAME_KEY);
      stopAvatarRefreshPoll();
      skinPreviewOverride = null;
    } else {
      startAvatarRefreshPoll();
      void pollActiveSkinProfile();
    }

    setAccountButton(loggedIn, profile);
    updatePlayButton(loggedIn);
    updateTitlebarPlayer(currentAuthState);
    updateHeroGreetingNameOnly(currentAuthState);
    refreshProfileViews();
    if (document.getElementById("view-friends")?.classList.contains("active")) {
      void refreshFriendsView();
    }
    if (document.getElementById("view-skin")?.classList.contains("active")) {
      void refreshSkinLibrary();
    }

    if (document.getElementById("cosmetics-grid")) {
      syncCosmeticEquippedState();
      renderCosmeticsGrid();
    }
  }

  async function startMicrosoftLogin() {
    if (!api?.loginWithMicrosoft) {
      window.alert("Microsoft sign-in is only available in the Apex Launcher app.");
      return;
    }
    if (authBusy) return;
    authBusy = true;
    setAccountButton(false, null);
    if (authBtn) authBtn.disabled = true;
    try {
      const result = await api.loginWithMicrosoft();
      if (!result?.success) {
        console.warn("Login failed:", result?.error || "Sign-in failed");
        window.alert(result?.error || "Sign-in failed. Please try again.");
        applyAuthState({ isLoggedIn: false, profile: null });
        return;
      }
      applyAuthState({
        isLoggedIn: true,
        profile: result.profile ?? null,
      });
    } catch (err) {
      console.error("Login error:", err);
      window.alert(err?.message || "Sign-in failed. Please try again.");
      applyAuthState({ isLoggedIn: false, profile: null });
    } finally {
      authBusy = false;
      setAccountButton(currentAuthState.isLoggedIn, currentAuthState.profile);
      if (authBtn) authBtn.disabled = false;
    }
  }

  async function signOut() {
    if (!api?.logout) return;
    if (authBusy) return;
    const name = currentAuthState.profile?.username || "this account";
    if (!window.confirm(`Sign out of ${name}?`)) return;
    authBusy = true;
    setAccountButton(true, currentAuthState.profile);
    if (authBtn) authBtn.disabled = true;
    try {
      await api.logout();
      applyAuthState({ isLoggedIn: false, profile: null });
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      authBusy = false;
      setAccountButton(currentAuthState.isLoggedIn, currentAuthState.profile);
      if (authBtn) authBtn.disabled = false;
    }
  }

  authBtn?.addEventListener("click", () => {
    if (authBusy) return;
    if (currentAuthState.isLoggedIn) {
      void signOut();
      return;
    }
    void startMicrosoftLogin();
  });

  document.querySelectorAll("[data-account-nav]").forEach((btn) => {
    btn.addEventListener("click", () => navigateToView(btn.dataset.accountNav));
  });

  if (api?.getAuthProfile) {
    api.getAuthProfile().then(applyAuthState);
    api.onAuthStateChanged?.(applyAuthState);
  } else {
    applyAuthState({ isLoggedIn: false, profile: null });
  }
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

function applyBackgroundTheme(themeId) {
  const id = BG_THEMES.some((t) => t.id === themeId) ? themeId : "starfield";
  document.body.dataset.bgTheme = id;
  localStorage.setItem(BG_THEME_KEY, id);
  document.querySelectorAll("[data-bg-theme]").forEach((btn) => {
    const active = btn.dataset.bgTheme === id;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-checked", active ? "true" : "false");
  });
}

function applyClearPanels(enabled) {
  document.body.classList.toggle("clear-panels", enabled);
}

function loadStoredPreferences() {
  const storedAccent = localStorage.getItem(ACCENT_KEY);
  applyAccentColor(storedAccent || ACCENT_COLORS[0].id);

  const storedBlur = localStorage.getItem(BLUR_BG_KEY);
  applyBackgroundBlur(storedBlur === "true");

  applyBackgroundTheme(localStorage.getItem(BG_THEME_KEY) || "starfield");

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
  const bgThemePicker = document.getElementById("bg-theme-picker");
  const blurToggle = document.getElementById("blur-bg-toggle");
  const clearPanelsToggle = document.getElementById("clear-panels-toggle");
  const ramSlider = document.getElementById("ram-slider");
  const perfPackPicker = document.getElementById("perf-pack-picker");

  applyPerfPack(getPerfPack());
  perfPackPicker?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-perf-pack]");
    if (!btn) return;
    applyPerfPack(btn.dataset.perfPack);
  });

  if (bgThemePicker) {
    bgThemePicker.innerHTML = BG_THEMES.map(
      (theme) => `
        <button
          type="button"
          class="bg-theme-swatch"
          data-bg-theme="${theme.id}"
          role="radio"
          aria-checked="false"
          aria-label="${theme.label}"
          title="${theme.label}"
        >
          <span class="bg-theme-swatch-preview bg-theme-preview-${theme.id}"></span>
          <span class="bg-theme-swatch-label">${theme.label}</span>
        </button>`
    ).join("");

    applyBackgroundTheme(localStorage.getItem(BG_THEME_KEY) || "starfield");

    bgThemePicker.addEventListener("click", (e) => {
      const swatch = e.target.closest("[data-bg-theme]");
      if (!swatch) return;
      applyBackgroundTheme(swatch.dataset.bgTheme);
    });
  }

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
  const readyLaterBtn = document.getElementById("update-ready-later");
  const errorLaterBtn = document.getElementById("update-error-later");
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
  const errorTitle = document.getElementById("update-error-title");

  const states = {
    available: document.getElementById("update-state-available"),
    downloading: document.getElementById("update-state-downloading"),
    ready: document.getElementById("update-state-ready"),
    error: document.getElementById("update-state-error"),
  };

  let pendingVersion = "";
  let drawerLocked = false;
  let userInitiatedCheck = false;
  let demoMode = false;
  const DEMO_APPLIED_KEY = "sc-demo-update-applied";

  function isDemoUpdateApplied() {
    try {
      return localStorage.getItem(DEMO_APPLIED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function markDemoUpdateApplied() {
    try {
      localStorage.setItem(DEMO_APPLIED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  function goToSkinsMaintenance() {
    const skinBtn =
      document.querySelector('.nav-btn[data-view="skin"]') ||
      document.querySelector('[data-nav="skin"]');
    if (skinBtn) {
      skinBtn.click();
      return;
    }
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById("view-skin")?.classList.add("active");
  }

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
  }

  function setProgress(percent, detail = "") {
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (progressPct) progressPct.textContent = `${pct}%`;
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressBar) progressBar.setAttribute("aria-valuenow", String(pct));
    if (progressDetail) progressDetail.textContent = detail;
  }

  function handleAvailable(payload) {
    pendingVersion = payload?.version || "";
    if (availableTitle) {
      availableTitle.textContent = "An update is available";
    }
    drawerLocked = false;
    showDrawerState("available");
    setSettingsStatus(
      pendingVersion
        ? `Update v${pendingVersion} is available.`
        : "An update is available.",
      "ok"
    );
  }

  function handleProgress(payload) {
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
  }

  function handleDownloaded(payload) {
    pendingVersion = payload?.version || pendingVersion;
    drawerLocked = false;
    showDrawerState("ready");
    setSettingsStatus(
      pendingVersion
        ? `Update v${pendingVersion} downloaded — relaunch to apply.`
        : "Update downloaded — relaunch to apply.",
      "ok"
    );
  }

  function handleError(payload, { forceDrawer = false } = {}) {
    drawerLocked = false;
    const message = payload?.message || "Update failed.";
    const security = !!(payload?.security || payload?.code === "SIGNATURE_MISMATCH");
    const drawerVisible = drawer && !drawer.hidden;
    const downloading = states.downloading && !states.downloading.hidden;
    if (forceDrawer || drawerVisible || downloading || userInitiatedCheck || security) {
      showDrawerState("error");
      if (errorTitle) {
        errorTitle.textContent = security ? "Security alert" : "Update failed";
      }
      if (errorMessage) errorMessage.textContent = message;
    }
    if (userInitiatedCheck || drawerVisible || downloading || security) {
      setSettingsStatus(message, "error");
    }
    userInitiatedCheck = false;
  }

  function applyBufferedState(state) {
    if (!state?.channel) return;
    switch (state.channel) {
      case "update:available":
        handleAvailable(state.payload);
        break;
      case "update:progress":
        handleProgress(state.payload);
        break;
      case "update:downloaded":
        handleDownloaded(state.payload);
        break;
      case "update:error":
        handleError(state.payload, { forceDrawer: false });
        break;
      default:
        break;
    }
  }

  function runFakeDownloadDemo() {
    demoMode = true;
    drawerLocked = true;
    setProgress(0, "Starting download…");
    showDrawerState("downloading");
    let pct = 0;
    const timer = setInterval(() => {
      pct += 8 + Math.random() * 10;
      if (pct >= 100) {
        clearInterval(timer);
        setProgress(100, "Verified");
        handleDownloaded({ version: pendingVersion || "1.0.2" });
        return;
      }
      handleProgress({
        percent: pct,
        transferred: Math.round((pct / 100) * 48_000_000),
        total: 48_000_000,
        bytesPerSecond: 2_400_000,
      });
    }, 180);
  }

  dismissBtn?.addEventListener("click", () => {
    drawerLocked = false;
    hideDrawer();
  });
  readyLaterBtn?.addEventListener("click", () => {
    drawerLocked = false;
    hideDrawer();
  });
  errorLaterBtn?.addEventListener("click", () => {
    drawerLocked = false;
    hideDrawer();
  });

  downloadBtn?.addEventListener("click", async () => {
    if (demoMode) {
      runFakeDownloadDemo();
      return;
    }
    if (!api?.downloadUpdate) return;
    drawerLocked = true;
    setProgress(0, "Starting download…");
    showDrawerState("downloading");
    const result = await api.downloadUpdate();
    if (result?.skipped) {
      // Unpackaged: play the fake progress so UI can be reviewed
      runFakeDownloadDemo();
    } else if (result && result.success === false) {
      drawerLocked = false;
      showDrawerState("error");
      if (errorMessage) {
        errorMessage.textContent = result.error || "Download failed.";
      }
    }
  });

  installBtn?.addEventListener("click", async () => {
    // Demo / unpackaged: don't restart the app — open Skins (maintenance) and clear the toast
    if (demoMode) {
      markDemoUpdateApplied();
      drawerLocked = false;
      hideDrawer();
      setSettingsStatus("Skins is in maintenance after the demo update.", "ok");
      goToSkinsMaintenance();
      return;
    }
    if (!api?.installUpdate) return;
    installBtn.disabled = true;
    setSettingsStatus("Applying update and relaunching…", "ok");
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
    if (demoMode) {
      handleAvailable({ version: pendingVersion || "1.0.2" });
      return;
    }
    if (api?.checkForUpdates) {
      userInitiatedCheck = true;
      setSettingsStatus("Checking for updates…");
      checkBtn && (checkBtn.disabled = true);
      const result = await api.checkForUpdates();
      checkBtn && (checkBtn.disabled = false);
      if (result?.skipped) {
        userInitiatedCheck = false;
        handleAvailable({ version: "1.0.2" });
        demoMode = true;
      } else if (result && result.success === false) {
        userInitiatedCheck = false;
        setSettingsStatus(result.error || "Update check failed.", "error");
      }
    }
  });

  checkBtn?.addEventListener("click", async () => {
    if (!api?.checkForUpdates) {
      setSettingsStatus("Updater API unavailable.", "error");
      return;
    }
    userInitiatedCheck = true;
    checkBtn.disabled = true;
    setSettingsStatus("Checking for updates…");
    try {
      const result = await api.checkForUpdates();
      if (result?.skipped) {
        userInitiatedCheck = false;
        demoMode = true;
        handleAvailable({ version: "1.0.2" });
        setSettingsStatus("Demo update shown (dev / unpackaged).", "ok");
      } else if (result && result.success === false) {
        userInitiatedCheck = false;
        setSettingsStatus(result.error || "Update check failed.", "error");
      }
    } finally {
      checkBtn.disabled = false;
    }
  });

  api?.onUpdateChecking?.(() => {
    if (userInitiatedCheck) setSettingsStatus("Checking for updates…");
  });

  api?.onUpdateAvailable?.((payload) => {
    userInitiatedCheck = false;
    demoMode = false;
    handleAvailable(payload);
  });

  api?.onUpdateNotAvailable?.(() => {
    if (userInitiatedCheck) {
      setSettingsStatus("You're on the latest version.", "ok");
    }
    userInitiatedCheck = false;
  });

  api?.onUpdateProgress?.((payload) => {
    handleProgress(payload);
  });

  api?.onUpdateDownloaded?.((payload) => {
    handleDownloaded(payload);
  });

  api?.onUpdateError?.((payload) => {
    handleError(payload);
  });

  // Catch up if the packaged startup check finished before listeners were bound
  if (api?.getUpdateState) {
    api.getUpdateState().then((result) => {
      if (result?.state) {
        applyBufferedState(result.state);
        return;
      }
      // Dev toast once per machine until demo "Relaunch" is clicked
      if (result && result.packaged === false && !isDemoUpdateApplied()) {
        demoMode = true;
        setTimeout(() => handleAvailable({ version: "1.0.2" }), 1200);
      }
    }).catch(() => {
      if (!isDemoUpdateApplied()) {
        demoMode = true;
        setTimeout(() => handleAvailable({ version: "1.0.2" }), 1200);
      }
    });
  } else if (!isDemoUpdateApplied()) {
    demoMode = true;
    setTimeout(() => handleAvailable({ version: "1.0.2" }), 1200);
  }

  // Dev hook for launcher-update agent / npm run show-update
  window.__spaceShowUpdateToast = (version) => {
    try {
      localStorage.removeItem(DEMO_APPLIED_KEY);
    } catch {
      /* ignore */
    }
    demoMode = true;
    handleAvailable({ version: version || "1.0.2" });
  };
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
    if (typeof player.stardust === "number") {
      localStorage.setItem("sc-stardust", String(player.stardust));
    }
    if (Array.isArray(player.ownedCosmetics)) {
      localStorage.setItem(OWNED_COSMETICS_KEY, JSON.stringify(player.ownedCosmetics));
      document.dispatchEvent(new CustomEvent("sc-cosmetics-changed"));
    }
    if (player.equippedCosmetics) {
      localStorage.setItem(EQUIPPED_COSMETICS_KEY, JSON.stringify(player.equippedCosmetics));
    }
    if (typeof window.refreshCosmicShop === "function") {
      window.refreshCosmicShop();
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

function hideAiRecoveryPanel() {
  const panel = document.getElementById("launch-ai-recovery");
  if (!panel) return;
  panel.hidden = true;
  panel.classList.remove("is-resolved", "is-failed");
  const list = document.getElementById("launch-ai-recovery-list");
  if (list) list.innerHTML = "";
  const status = document.getElementById("launch-ai-recovery-status");
  if (status) status.textContent = "Standing by…";
  const phase = document.getElementById("launch-ai-recovery-phase");
  if (phase) phase.textContent = "Idle";
}

function showAiRecoveryPanel() {
  const panel = document.getElementById("launch-ai-recovery");
  if (!panel) return;
  panel.hidden = false;
  panel.classList.remove("is-resolved", "is-failed");
}

function updateAiRecoveryStatus(payload = {}) {
  const panel = document.getElementById("launch-ai-recovery");
  const statusEl = document.getElementById("launch-ai-recovery-status");
  const phaseEl = document.getElementById("launch-ai-recovery-phase");
  if (!panel) return;

  // Failed escalations go to Discord staff only — keep the launcher quiet.
  if (
    payload.phase === "escalated-silent" ||
    payload.phase === "escalating-silent" ||
    payload.result?.silentEscalate
  ) {
    hideAiRecoveryPanel();
    return;
  }

  panel.hidden = false;

  if (phaseEl) {
    phaseEl.textContent = String(payload.phase || "working").replace(/-/g, " ");
  }
  if (statusEl && payload.label) {
    statusEl.textContent = payload.label;
  }

  if (payload.phase === "resolved") {
    panel.classList.add("is-resolved");
    panel.classList.remove("is-failed");
  } else if (payload.phase === "failed" || payload.phase === "reporting") {
    panel.classList.add("is-failed");
    panel.classList.remove("is-resolved");
  }

  const result = payload.result;
  if (result && Array.isArray(result.tips)) {
    const list = document.getElementById("launch-ai-recovery-list");
    if (list) {
      const extras = [];
      if (result.diagnosis) extras.push(`Diagnosis: ${result.diagnosis}`);
      if (result.recovered) extras.push("Safe repairs applied — try PLAY again.");
      list.innerHTML = [...extras, ...result.tips]
        .slice(0, 8)
        .map((tip) => `<li>${escapeHtml(tip)}</li>`)
        .join("");
    }
  }
}

function startAiCrashRecovery({ logText, exitCode, error, source }) {
  const api = window.electronAPI;
  if (!api?.runCrashRecovery) return;

  showAiRecoveryPanel();
  updateAiRecoveryStatus({
    phase: "collecting",
    label: "AI recovery — reading Apex Launcher files & logs…",
  });

  const version =
    document.getElementById("launch-version")?.value ||
    localStorage.getItem("sc_mc_version") ||
    "1.21.1";
  const loader =
    document.getElementById("launch-loader")?.value ||
    localStorage.getItem("sc_mc_loader") ||
    "fabric";

  api
    .runCrashRecovery({
      logText: logText || getLaunchConsoleText(),
      exitCode: exitCode ?? null,
      error: error || null,
      version,
      loader,
      source: source || "game",
    })
    .catch((err) => {
      updateAiRecoveryStatus({
        phase: "failed",
        label: err?.message || "AI recovery failed to start",
        result: { tips: ["Could not start AI recovery."], recovered: false },
      });
    });
}

/** Dev / soft-reload hook — synthetic crash → AI recovery → Discord when unresolved. */
window.__spaceTriggerCrashTest = (payload = {}) => {
  startAiCrashRecovery({
    logText: payload.logText,
    exitCode: payload.exitCode ?? 1,
    error: payload.error || "Synthetic test crash — Discord staff escalate",
    source: payload.source || "test",
  });
  return { ok: true };
};

function buildLaunchCrashTips(logText = "", exitCode = null) {
  const text = String(logText || "");
  const tips = [];

  if (/launch bridge|space bridge|geyser.*exit|bridge.*exited with code/i.test(text)) {
    tips.push("Space Bridge failed — open a Java Singleplayer world → Open to LAN (port 25565) before clicking Host.");
    tips.push("Allow Apex Launcher and Java through Windows Firewall; close other apps on ports 19132/25565.");
  }

  if (/No Fabric API pin|Fabric API required.*Prefer/i.test(text)) {
    tips.push(`Open the launch menu and pick Minecraft ${DEFAULT_FABRIC_MC} with Fabric (recommended).`);
    tips.push("Fabric is pinned for 1.21.x — use Vanilla for older releases without Fabric injection.");
    tips.push("Switch to Vanilla in the launch menu if you need an older release without Fabric injection.");
  }

  if (/ClientBrandRetrieverMixin|InvalidInjectionException|Mixin transformation/i.test(text)) {
    tips.push("Fabric mixin crash — remove conflicting jars from .minecraft/mods and try a different Performance Pack in Settings.");
    tips.push("Make sure Cosmetics / brand mixins target Minecraft 1.21.1 getClientModName, not <clinit>.");
  }

  if (/unknown protocol:\s*c|Invalid URL C:/i.test(text)) {
    tips.push("Log4j Windows path bug — relaunch with the latest Apex Launcher (file:// log config fix). This alone usually does not stop the game.");
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
    tips.push("Fabric API / mod conflict — remove extra jars from .minecraft/mods and keep only Apex Launcher injection.");
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
  if (!visible) {
    hideLaunchCrashTips();
    hideAiRecoveryPanel();
  }
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
  btn.style.opacity = "";
  setLaunchMenuInteractive(true);
  if (loggedIn !== undefined) {
    currentAuthState.isLoggedIn = Boolean(loggedIn);
  }
  syncPlayButtonForEdition();
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
    setPlayButtonLabel(btn, "In Game");
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
      const logText = getLaunchConsoleText();
      showLaunchCrashTips(logText, payload?.code ?? null);
      startAiCrashRecovery({
        logText,
        exitCode: payload?.code ?? null,
        source: "game-close",
      });
    } else {
      hideLaunchCrashTips();
      hideAiRecoveryPanel();
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
    const logText = `${getLaunchConsoleText()}\n${payload?.error || ""}`;
    showLaunchCrashTips(logText, null);
    if (!isFabricPinLaunchError(payload?.error)) {
      startAiCrashRecovery({
        logText,
        error: payload?.error || "Unknown error",
        source: "game-error",
      });
    } else {
      hideAiRecoveryPanel();
    }
    resetPlayButton(btn, { loggedIn: true });
  });

  api?.onCrashRecoveryStatus?.((payload) => {
    updateAiRecoveryStatus(payload || {});
  });

  api?.onCrashRecoveryResult?.((payload) => {
    if (payload?.silentEscalate || payload?.reportedToStaff || payload?.reportQueued) {
      if (!payload?.recovered) {
        hideAiRecoveryPanel();
        return;
      }
    }
    updateAiRecoveryStatus({
      phase: payload?.recovered ? "resolved" : "failed",
      label: payload?.recovered
        ? "AI recovery applied — try PLAY again"
        : payload?.error || "Recovery unfinished",
      result: payload,
    });
    if (payload?.recovered) {
      appendLaunchConsoleLine(`[AI recovery] ${payload.diagnosis || "Repairs applied"} — relaunch when ready.`);
    }
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

    if (modrinthState.edition === "bedrock") {
      if (!api?.bridgeLaunchBedrock) {
        appendLaunchConsoleLine("Bedrock launch requires the Electron app (npm start).");
        return;
      }
      launching = true;
      btn.classList.add("launching");
      btn.disabled = true;
      btn.setAttribute("aria-disabled", "true");
      const preview = Boolean(modrinthState.bedrockPreview);
      setPlayButtonLabel(btn, preview ? "Opening Preview…" : "Opening…");
      clearLaunchConsole();
      appendLaunchConsoleLine(
        preview
          ? "Opening Minecraft Bedrock Preview (Microsoft.MinecraftWindowsBeta)…"
          : "Opening Minecraft Bedrock Retail (Microsoft.MinecraftUWP)…"
      );

      try {
        const result = await api.bridgeLaunchBedrock({ preview });
        if (result?.success) {
          appendLaunchConsoleLine(
            preview
              ? "Minecraft Bedrock Preview launched."
              : "Minecraft Bedrock Retail launched."
          );
          setPlayButtonLabel(btn, preview ? "Preview Open" : "Bedrock Open");
          setTimeout(() => {
            resetPlayButton(btn);
            launching = false;
          }, 1200);
        } else {
          const msg =
            result?.error?.message ||
            result?.error?.title ||
            (preview
              ? "Bedrock Preview package not found on this system."
              : "Could not open Minecraft Bedrock.");
          appendLaunchConsoleLine(`Error: ${msg}`);
          if (preview || /Preview package not found/i.test(String(msg))) {
            window.alert("Bedrock Preview package not found on this system.");
          } else if (result?.storeOpened) {
            appendLaunchConsoleLine("Opened the Microsoft Store so you can install Minecraft.");
          }
          resetPlayButton(btn);
          launching = false;
        }
      } catch (err) {
        const msg = err?.message || String(err);
        appendLaunchConsoleLine(`Error: ${msg}`);
        if (preview || /Preview package not found/i.test(msg)) {
          window.alert("Bedrock Preview package not found on this system.");
        }
        resetPlayButton(btn);
        launching = false;
      }
      return;
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
    setLaunchMenuInteractive(false);
    setPlayButtonLabel(btn, "Launching…");
    updateLaunchProgressUI({
      label: "Preparing launch…",
      percent: 0,
      detail: "",
      speed: 0,
    }, { resetPercent: true });
    appendLaunchConsoleLine("Starting Apex Launcher launch pipeline…");

    const selectedInstance = getSelectedInstance();
    if (!selectedInstance) {
      launching = false;
      setLaunchOverlayState("failed");
      updateLaunchProgressUI({
        label: "No instance selected",
        percent: 0,
        detail: "Create or select an instance before launching.",
        speed: 0,
      });
      appendLaunchConsoleLine("Create or select an instance before launching.");
      resetPlayButton(btn, { loggedIn: true });
      return;
    }
    const version = selectedInstance.mcVersion || modrinthState.version || DEFAULT_FABRIC_MC;
    let loader = selectedInstance.loader || modrinthState.homeLoader || "fabric";
    if (isLegacyJavaTarget(version)) {
      loader = "vanilla";
    }
    const memoryGb = getRamGb();
    const equippedCape = getEquippedCosmetics().capes || null;

    const launchValidationError = validateLaunchSelection(version, loader);
    if (launchValidationError) {
      launching = false;
      setLaunchOverlayState("failed");
      updateLaunchProgressUI({
        label: "Unsupported Fabric version",
        percent: 0,
        detail: launchValidationError,
        speed: 0,
      });
      appendLaunchConsoleLine(`Error: ${launchValidationError}`);
      showLaunchCrashTips(launchValidationError, null);
      hideAiRecoveryPanel();
      resetPlayButton(btn, { loggedIn: true });
      return;
    }

    try {
      const result = await api.launchGame({
        version,
        loader,
        instancePath: selectedInstance.path,
        memoryGb,
        equippedCape,
        perfPack: getPerfPack(),
      });
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

/** @type {ReturnType<typeof setInterval>|null} */
let friendsPresenceTimer = null;
/** @type {Map<string, object>} */
let friendsPresenceMap = new Map();

function setSkinTab(tabId) {
  const next = tabId === "browse" ? "browse" : "library";
  document.querySelectorAll("[data-skin-tab]").forEach((btn) => {
    const active = btn.dataset.skinTab === next;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  const libraryPanel = document.getElementById("skin-panel-library");
  const browsePanel = document.getElementById("skin-panel-browse");
  if (libraryPanel) {
    libraryPanel.classList.toggle("active", next === "library");
    libraryPanel.hidden = next !== "library";
  }
  if (browsePanel) {
    browsePanel.classList.toggle("active", next === "browse");
    browsePanel.hidden = next !== "browse";
  }
}

async function refreshSkinLibrary() {
  const api = window.electronAPI;
  const grid = document.getElementById("skin-library-grid");
  const hint = document.getElementById("skin-library-hint");
  if (!grid || !api?.listSkins) return;

  try {
    const result = await api.listSkins();
    const skins = result?.skins || [];
    skinLibraryById.clear();
    skins.forEach((skin) => skinLibraryById.set(skin.id, skin));
    if (hint) {
      hint.textContent = skins.length
        ? `${skins.length} saved skin${skins.length === 1 ? "" : "s"}`
        : "Saved skins appear here. Import a PNG or save one from Browse.";
    }
    if (!skins.length) {
      grid.innerHTML = "";
      return;
    }
    grid.innerHTML = skins
      .map((skin) => {
        const thumb =
          skin.previewDataUrl ||
          skin.bodyPreviewUrl ||
          "https://mc-heads.net/avatar/MHF_Steve/64";
        const selected = skinPreviewOverride?.skinId === skin.id ? " is-selected" : "";
        return `
          <article class="skin-library-card${selected}" data-skin-id="${escapeHtml(skin.id)}" tabindex="0" role="button" aria-label="Preview ${escapeHtml(skin.name)}">
            <img class="skin-library-thumb" src="${escapeHtml(thumb)}" alt="" width="64" height="64" decoding="async" referrerpolicy="no-referrer" />
            <p class="skin-library-name" title="${escapeHtml(skin.name)}">${escapeHtml(skin.name)}</p>
            <label class="skin-variant-label">
              Model
              <select class="select-field skin-library-variant" data-skin-variant-for="${escapeHtml(skin.id)}" aria-label="Skin model for ${escapeHtml(skin.name)}">
                <option value="classic"${skin.variant === "classic" ? " selected" : ""}>Classic</option>
                <option value="slim"${skin.variant === "slim" ? " selected" : ""}>Slim</option>
              </select>
            </label>
            <div class="skin-library-actions">
              <button type="button" class="btn-mod primary" data-skin-use="${escapeHtml(skin.id)}">Use</button>
              <button type="button" class="btn-mod" data-skin-delete="${escapeHtml(skin.id)}">Delete</button>
            </div>
          </article>`;
      })
      .join("");
  } catch (err) {
    if (hint) hint.textContent = err?.message || "Could not load skin library.";
  }
}

function previewLibrarySkin(skinId) {
  const skin = skinLibraryById.get(skinId);
  if (!skin) return;
  const variantSelect = document.querySelector(`[data-skin-variant-for="${skinId}"]`);
  skinPreviewOverride = {
    skinId,
    name: skin.name,
    variant: variantSelect?.value || skin.variant || "classic",
  };
  document.querySelectorAll(".skin-library-card").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.skinId === skinId);
  });
  void refreshProfileViews();
}

function applyAuthProfileFromSkinResult(profile, activeSkin) {
  if (!profile) return;
  bustSkinPreviewImages();
  const nextProfile = {
    ...(currentAuthState.profile || {}),
    ...profile,
    isLoggedIn: true,
  };
  if (activeSkin?.variant) nextProfile.skinVariant = activeSkin.variant;
  if (activeSkin?.url) {
    nextProfile.skinTextureUrl = String(activeSkin.url).replace(/^http:\/\//i, "https://");
  }
  currentAuthState = {
    isLoggedIn: true,
    profile: nextProfile,
  };
  refreshProfileViews();
  updateTitlebarPlayer(currentAuthState);
  startAvatarRefreshPoll();
}

async function refreshSkinAfterApply() {
  const api = window.electronAPI;
  if (!api?.getActiveSkin) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    bustSkinPreviewImages();
    const result = await api.getActiveSkin();
    if (result?.success) {
      applyAuthProfileFromSkinResult(result.profile, result.activeSkin);
      if (result.activeSkin?.url) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}

async function initSkins() {
  const api = window.electronAPI;
  if (!api?.listSkins) return;

  document.querySelectorAll("[data-skin-tab]").forEach((btn) => {
    btn.addEventListener("click", () => setSkinTab(btn.dataset.skinTab));
  });

  document.getElementById("skin-import-btn")?.addEventListener("click", async () => {
    const result = await api.importSkin();
    if (result?.cancelled) return;
    if (!result?.success) {
      const hint = document.getElementById("skin-library-hint");
      if (hint) hint.textContent = result?.error || "Import failed.";
      return;
    }
    setSkinTab("library");
    await refreshSkinLibrary();
  });

  document.getElementById("skin-reset-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("skin-reset-btn");
    if (btn) btn.disabled = true;
    const result = await api.resetSkin();
    if (result?.success) {
      skinPreviewOverride = null;
      applyAuthProfileFromSkinResult(result.profile);
      await refreshSkinAfterApply();
    } else {
      const status = document.getElementById("skin-preview-status");
      if (status) status.textContent = result?.error || "Reset failed.";
    }
    if (btn) btn.disabled = !currentAuthState.isLoggedIn;
  });

  document.getElementById("skin-library-grid")?.addEventListener("click", async (e) => {
    const useBtn = e.target.closest("[data-skin-use]");
    const delBtn = e.target.closest("[data-skin-delete]");
    const card = e.target.closest(".skin-library-card");

    if (!useBtn && !delBtn && card?.dataset.skinId) {
      previewLibrarySkin(card.dataset.skinId);
      return;
    }

    if (useBtn) {
      if (!currentAuthState.isLoggedIn) {
        const hint = document.getElementById("skin-library-hint");
        if (hint) hint.textContent = "Sign in to apply a skin to your account.";
        return;
      }
      useBtn.disabled = true;
      const skinId = useBtn.getAttribute("data-skin-use");
      const variantSelect = document.querySelector(`[data-skin-variant-for="${skinId}"]`);
      const variant = variantSelect?.value || "classic";
      const result = await api.applySkin({ skinId, variant });
      useBtn.disabled = false;
      if (result?.success) {
        skinPreviewOverride = null;
        applyAuthProfileFromSkinResult(result.profile);
        await refreshSkinAfterApply();
        const hint = document.getElementById("skin-library-hint");
        if (hint) hint.textContent = "Skin applied to your Microsoft account.";
      } else {
        const hint = document.getElementById("skin-library-hint");
        if (hint) hint.textContent = result?.error || "Could not apply skin.";
      }
      return;
    }
    if (delBtn) {
      const deletedId = delBtn.getAttribute("data-skin-delete");
      await api.deleteSkin(deletedId);
      if (skinPreviewOverride?.skinId === deletedId) {
        skinPreviewOverride = null;
        void refreshProfileViews();
      }
      await refreshSkinLibrary();
    }
  });

  document.getElementById("skin-library-grid")?.addEventListener("change", (e) => {
    const select = e.target.closest(".skin-library-variant");
    if (!select) return;
    const skinId = select.getAttribute("data-skin-variant-for");
    if (skinPreviewOverride?.skinId === skinId) {
      skinPreviewOverride.variant = select.value || "classic";
      void refreshProfileViews();
      return;
    }
    previewLibrarySkin(skinId);
  });

  document.getElementById("skin-browse-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("skin-browse-input");
    const status = document.getElementById("skin-browse-status");
    const resultBox = document.getElementById("skin-browse-result");
    const username = String(input?.value || "").trim();
    if (!username) return;
    if (status) status.textContent = "Looking up…";
    if (resultBox) resultBox.hidden = true;
    skinBrowsePlayer = null;

    const result = await api.searchSkinPlayer(username);
    if (!result?.success || !result.player) {
      if (status) status.textContent = result?.error || "Player not found.";
      return;
    }
    skinBrowsePlayer = result.player;
    if (status) status.textContent = "";
    const nameEl = document.getElementById("skin-browse-name");
    const variantEl = document.getElementById("skin-browse-variant");
    if (nameEl) nameEl.textContent = result.player.name;
    if (variantEl) variantEl.value = result.player.variant === "slim" ? "slim" : "classic";
    if (resultBox) resultBox.hidden = false;
    updateBrowseBodyPreview();
  });

  document.getElementById("skin-browse-variant")?.addEventListener("change", () => {
    updateBrowseBodyPreview();
  });

  document.getElementById("skin-browse-save")?.addEventListener("click", async () => {
    const status = document.getElementById("skin-browse-status");
    if (!skinBrowsePlayer?.textureUrl) {
      if (status) status.textContent = "No public texture URL for this player.";
      return;
    }
    const variant = document.getElementById("skin-browse-variant")?.value || "classic";
    const result = await api.saveSkinFromUrl({
      url: skinBrowsePlayer.textureUrl,
      name: skinBrowsePlayer.name,
      variant,
      playerName: skinBrowsePlayer.name,
    });
    if (result?.success) {
      if (status) status.textContent = `Saved ${skinBrowsePlayer.name} to library.`;
      await refreshSkinLibrary();
    } else if (status) {
      status.textContent = result?.error || "Save failed.";
    }
  });

  document.getElementById("skin-browse-apply")?.addEventListener("click", async () => {
    const status = document.getElementById("skin-browse-status");
    if (!currentAuthState.isLoggedIn) {
      if (status) status.textContent = "Sign in to apply a skin.";
      return;
    }
    if (!skinBrowsePlayer?.textureUrl) {
      if (status) status.textContent = "No public texture URL for this player.";
      return;
    }
    const variant = document.getElementById("skin-browse-variant")?.value || "classic";
    const result = await api.applySkin({
      url: skinBrowsePlayer.textureUrl,
      variant,
      name: skinBrowsePlayer.name,
      saveToLibrary: true,
    });
    if (result?.success) {
      skinPreviewOverride = null;
      applyAuthProfileFromSkinResult(result.profile);
      await refreshSkinAfterApply();
      if (status) status.textContent = `Now using ${skinBrowsePlayer.name}'s skin.`;
      await refreshSkinLibrary();
    } else if (status) {
      status.textContent = result?.error || "Apply failed.";
    }
  });
}

function presenceLabel(status) {
  const s = String(status || "").toUpperCase();
  if (s.startsWith("PLAYING")) return { text: "In game", cls: "is-playing" };
  if (s === "ONLINE") return { text: "Online", cls: "is-online" };
  return { text: "Offline", cls: "" };
}

function friendRowHtml(friend, { mode }) {
  const id = friend.profileId || "";
  const name = friend.name || "Unknown";
  const head = `https://mc-heads.net/avatar/${String(id).replace(/-/g, "")}/36`;
  const presence = friendsPresenceMap.get(String(id).replace(/-/g, "").toLowerCase())
    || friendsPresenceMap.get(id);
  const label = mode === "friend" ? presenceLabel(presence?.status) : { text: mode === "incoming" ? "Incoming" : "Outgoing", cls: "" };

  let actions = "";
  if (mode === "friend") {
    actions = `<button type="button" class="btn-mod" data-friend-remove="${escapeHtml(id)}">Remove</button>`;
  } else if (mode === "incoming") {
    actions = `
      <button type="button" class="btn-mod primary" data-friend-accept="${escapeHtml(id)}">Accept</button>
      <button type="button" class="btn-mod" data-friend-decline="${escapeHtml(id)}">Decline</button>`;
  } else {
    actions = `<button type="button" class="btn-mod" data-friend-cancel="${escapeHtml(id)}">Cancel</button>`;
  }

  return `
    <li class="friends-row" data-friend-id="${escapeHtml(id)}">
      <img class="friends-row-head" src="${escapeHtml(head)}" alt="" width="36" height="36" decoding="async" referrerpolicy="no-referrer" />
      <div class="friends-row-body">
        <p class="friends-row-name">${escapeHtml(name)}</p>
        <p class="friends-row-presence ${label.cls}">${escapeHtml(label.text)}</p>
      </div>
      <div class="friends-row-actions">${actions}</div>
    </li>`;
}

function setFriendsStatus(message, kind = "") {
  const el = document.getElementById("friends-status");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("is-error", kind === "error");
  el.classList.toggle("is-ok", kind === "ok");
}

function stopFriendsPresencePoll() {
  if (friendsPresenceTimer) {
    clearInterval(friendsPresenceTimer);
    friendsPresenceTimer = null;
  }
}

function startFriendsPresencePoll() {
  stopFriendsPresencePoll();
  friendsPresenceTimer = setInterval(() => {
    const friendsView = document.getElementById("view-friends");
    if (!friendsView?.classList.contains("active")) {
      stopFriendsPresencePoll();
      return;
    }
    void syncFriendsPresenceOnly();
  }, 35000);
}

async function syncFriendsPresenceOnly() {
  const api = window.electronAPI;
  if (!api?.syncFriendsPresence || !currentAuthState.isLoggedIn) return;
  try {
    const result = await api.syncFriendsPresence({});
    friendsPresenceMap = new Map();
    for (const p of result?.presence || []) {
      const key = String(p.profileId || "").replace(/-/g, "").toLowerCase();
      if (key) friendsPresenceMap.set(key, p);
      if (p.profileId) friendsPresenceMap.set(p.profileId, p);
    }
    // Re-render list labels without full refetch if DOM already has rows
    document.querySelectorAll("#friends-list .friends-row").forEach((row) => {
      const id = row.getAttribute("data-friend-id") || "";
      const key = id.replace(/-/g, "").toLowerCase();
      const presence = friendsPresenceMap.get(key) || friendsPresenceMap.get(id);
      const label = presenceLabel(presence?.status);
      const el = row.querySelector(".friends-row-presence");
      if (el) {
        el.textContent = label.text;
        el.className = `friends-row-presence ${label.cls}`;
      }
    });
  } catch {
    // ignore poll errors
  }
}

async function refreshFriendsView() {
  const api = window.electronAPI;
  const signedOut = document.getElementById("friends-signed-out");
  const signedIn = document.getElementById("friends-signed-in");
  if (!signedOut || !signedIn) return;

  const loggedIn = Boolean(currentAuthState?.isLoggedIn);
  signedOut.hidden = loggedIn;
  signedIn.hidden = !loggedIn;

  if (!loggedIn) {
    stopFriendsPresencePoll();
    return;
  }
  if (!api?.listFriends) {
    setFriendsStatus("Friends API unavailable.", "error");
    return;
  }

  setFriendsStatus("Loading…");
  const [listResult, presenceResult] = await Promise.all([
    api.listFriends(),
    api.syncFriendsPresence({}),
  ]);

  friendsPresenceMap = new Map();
  for (const p of presenceResult?.presence || []) {
    const key = String(p.profileId || "").replace(/-/g, "").toLowerCase();
    if (key) friendsPresenceMap.set(key, p);
    if (p.profileId) friendsPresenceMap.set(p.profileId, p);
  }

  const friends = listResult?.friends || [];
  const incoming = listResult?.incomingRequests || [];
  const outgoing = listResult?.outgoingRequests || [];

  const listEl = document.getElementById("friends-list");
  const incomingEl = document.getElementById("friends-incoming");
  const outgoingEl = document.getElementById("friends-outgoing");
  const listEmpty = document.getElementById("friends-list-empty");
  const incomingEmpty = document.getElementById("friends-incoming-empty");
  const outgoingEmpty = document.getElementById("friends-outgoing-empty");

  if (listEl) listEl.innerHTML = friends.map((f) => friendRowHtml(f, { mode: "friend" })).join("");
  if (incomingEl) incomingEl.innerHTML = incoming.map((f) => friendRowHtml(f, { mode: "incoming" })).join("");
  if (outgoingEl) outgoingEl.innerHTML = outgoing.map((f) => friendRowHtml(f, { mode: "outgoing" })).join("");

  if (listEmpty) listEmpty.hidden = friends.length > 0;
  if (incomingEmpty) incomingEmpty.hidden = incoming.length > 0;
  if (outgoingEmpty) outgoingEmpty.hidden = outgoing.length > 0;

  const count = document.getElementById("friends-count");
  const inCount = document.getElementById("friends-incoming-count");
  const outCount = document.getElementById("friends-outgoing-count");
  if (count) count.textContent = String(friends.length);
  if (inCount) inCount.textContent = String(incoming.length);
  if (outCount) outCount.textContent = String(outgoing.length);

  if (!listResult?.success) {
    setFriendsStatus(listResult?.error || "Could not load friends.", "error");
  } else if (presenceResult && !presenceResult.success && presenceResult.error) {
    setFriendsStatus(presenceResult.error, "error");
  } else {
    setFriendsStatus("");
  }

  startFriendsPresencePoll();
}

async function initFriends() {
  const api = window.electronAPI;
  if (!api?.listFriends) return;

  document.getElementById("friends-refresh-btn")?.addEventListener("click", () => {
    void refreshFriendsView();
  });

  document.getElementById("friends-signin-btn")?.addEventListener("click", async () => {
    const api = window.electronAPI;
    if (!api?.loginWithMicrosoft) return;
    setFriendsStatus("Opening Microsoft sign-in…");
    try {
      const result = await api.loginWithMicrosoft();
      if (!result?.success) {
        setFriendsStatus(result?.error || "Sign-in cancelled.", "error");
      }
    } catch (err) {
      setFriendsStatus(err?.message || "Sign-in failed.", "error");
    }
  });

  document.getElementById("friends-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("friends-add-input");
    const name = String(input?.value || "").trim();
    if (!name) return;
    setFriendsStatus("Sending request…");
    const result = await api.addFriend({ name });
    if (result?.success) {
      if (input) input.value = "";
      setFriendsStatus(`Request sent to ${name}.`, "ok");
      await refreshFriendsView();
    } else {
      setFriendsStatus(result?.error || "Could not add friend.", "error");
    }
  });

  const handleFriendAction = async (e) => {
    const accept = e.target.closest("[data-friend-accept]");
    const decline = e.target.closest("[data-friend-decline]");
    const cancel = e.target.closest("[data-friend-cancel]");
    const remove = e.target.closest("[data-friend-remove]");

    if (accept) {
      const result = await api.addFriend({ profileId: accept.getAttribute("data-friend-accept") });
      setFriendsStatus(result?.success ? "Friend accepted." : result?.error || "Failed.", result?.success ? "ok" : "error");
      await refreshFriendsView();
      return;
    }
    if (decline) {
      const result = await api.removeFriend({ profileId: decline.getAttribute("data-friend-decline") });
      setFriendsStatus(result?.success ? "Request declined." : result?.error || "Failed.", result?.success ? "ok" : "error");
      await refreshFriendsView();
      return;
    }
    if (cancel) {
      const result = await api.removeFriend({ profileId: cancel.getAttribute("data-friend-cancel") });
      setFriendsStatus(result?.success ? "Request cancelled." : result?.error || "Failed.", result?.success ? "ok" : "error");
      await refreshFriendsView();
      return;
    }
    if (remove) {
      const result = await api.removeFriend({ profileId: remove.getAttribute("data-friend-remove") });
      setFriendsStatus(result?.success ? "Friend removed." : result?.error || "Failed.", result?.success ? "ok" : "error");
      await refreshFriendsView();
    }
  };

  document.getElementById("friends-list")?.addEventListener("click", handleFriendAction);
  document.getElementById("friends-incoming")?.addEventListener("click", handleFriendAction);
  document.getElementById("friends-outgoing")?.addEventListener("click", handleFriendAction);
}

document.addEventListener("DOMContentLoaded", async () => {
  await resolvePaymentsApiBase();
  const api = window.electronAPI;
  if (api?.getFabricSupportedVersions) {
    try {
      const supported = await api.getFabricSupportedVersions();
      if (Array.isArray(supported) && supported.length) {
        fabricSupportedVersions = supported;
      }
    } catch {
      /* keep fallback list */
    }
  }
  initWindowControls();
  initTitlebarPlayer();
  initNavigation();
  initLaunchSelectors();
  initHomeEditionPicker();
  initCherryPetals();
  document.body.classList.toggle("home-active", Boolean(document.getElementById("view-home")?.classList.contains("active")));
  initHomeNews();
  initContentTabs();
  initStoreTabs();
  initModrinth();
  initModpacks();
  initResourcePacks();
  initShaders();
  initLibrary();
  initCreateInstance();
  initModDetailPanel();
  initCosmeticDetailPanel();
  initCosmetics();
  initAccount();
  initThanks();
  initHost();
  initSkins();
  initFriends();
  initStore();
  if (typeof window.initCosmicShop === "function") {
    await window.initCosmicShop();
  }
  initSpacePlus();
  initPaymentsRefresh();
  initSettings();
  initAutoUpdaterUI();
  initMemeMode();
  initPlayButton();
  await refreshInstances({ preserveSelection: true });
  updateActiveModCount();
  initTrailerRecorder();
});

/** Trailer recorder: Alt+C / IPC clip feedback in Game Logs. */
function initTrailerRecorder() {
  const api = window.electronAPI;
  if (!api?.onRecorderClip) return;
  api.onRecorderClip((result) => {
    if (result?.success) {
      appendLaunchConsoleLine(
        `[recorder] Saved ${result.eventType || "clip"} → ${result.fileName || result.path || "clips/raw"}`
      );
    } else if (result?.error) {
      appendLaunchConsoleLine(`[recorder] Clip failed: ${result.error}`);
    }
  });
  api.onRecorderStatus?.((status) => {
    if (status?.recording && status?.target) {
      appendLaunchConsoleLine(`[recorder] Capture target: ${status.target}`);
    }
  });
}