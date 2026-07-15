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
    id: "void-walker",
    category: "capes",
    name: "Void Walker Cape",
    desc: "A flowing cloak woven from starless void, trailing faint purple wisps.",
    rarity: "legendary",
    tags: ["Animated", "Exclusive"],
    previewClass: "cape-pattern-void-walker",
    equipped: true,
  },
  {
    id: "nebula-cloak",
    category: "capes",
    name: "Nebula Cloak",
    desc: "Swirling pink and indigo nebula patterns shimmer across the fabric.",
    rarity: "epic",
    tags: ["Particle FX"],
    previewClass: "cape-pattern-nebula-cloak",
    equipped: false,
  },
  {
    id: "comet-trail",
    category: "capes",
    name: "Comet Trail",
    desc: "A sleek cape with a trailing comet tail that follows your movement.",
    rarity: "rare",
    tags: ["Trail"],
    previewClass: "cape-pattern-comet-trail",
    equipped: false,
  },
  {
    id: "deep-space-banner",
    category: "capes",
    name: "Deep Space Banner",
    desc: "Classic starfield banner with pixel constellations along the hem.",
    rarity: "uncommon",
    tags: ["Classic"],
    previewClass: "cape-pattern-deep-space",
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

const RARITY_LABELS = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

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

function renderCosmeticPreview(item) {
  if (item.category === "capes" && item.previewClass) {
    return renderCapePreview(item.previewClass);
  }
  return `<span class="cosmetic-preview-icon" aria-hidden="true">${item.preview || "✨"}</span>`;
}

function renderCosmeticCard(item) {
  const tags = (item.tags || [])
    .map((tag) => `<span class="cosmetic-tag">${escapeHtml(tag)}</span>`)
    .join("");

  const previewClass = item.category === "capes" ? " cosmetic-preview--cape" : "";

  return `
    <article class="cosmetic-card ${item.equipped ? "equipped" : ""}" data-cosmetic="${item.id}" data-category="${item.category}">
      <div class="cosmetic-preview${previewClass}">
        ${renderCosmeticPreview(item)}
        <span class="cosmetic-rarity cosmetic-rarity-${item.rarity}">${escapeHtml(RARITY_LABELS[item.rarity] || item.rarity)}</span>
        ${item.equipped ? '<span class="cosmetic-equipped-badge">Equipped</span>' : ""}
      </div>
      <div class="cosmetic-body">
        <div class="cosmetic-header">
          <h3 class="cosmetic-title">${escapeHtml(item.name)}</h3>
          <label class="toggle" title="${item.equipped ? "Unequip" : "Equip"}">
            <input type="checkbox" ${item.equipped ? "checked" : ""} data-cosmetic-toggle="${item.id}" aria-label="Equip ${escapeHtml(item.name)}" />
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
        <p class="cosmetic-desc">${escapeHtml(item.desc)}</p>
        ${tags ? `<div class="cosmetic-tags">${tags}</div>` : ""}
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

function updateTitlebarPlayer(state) {
  updateHeroGreeting(state);

  const nameEl = document.getElementById("titlebar-player-name");
  const dotEl = document.getElementById("titlebar-status-dot");
  if (!nameEl || !dotEl) return;

  const loggedIn = Boolean(state?.isLoggedIn && state?.profile);
  nameEl.textContent = loggedIn ? state.profile.username : "Guest";

  const inGame = localStorage.getItem(IN_GAME_KEY) === "true";

  dotEl.classList.toggle("online", inGame);
  dotEl.classList.toggle("offline", !inGame);
  dotEl.setAttribute("title", inGame ? "In game" : "Not in game");
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
  const views = document.querySelectorAll(".view");

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const viewId = btn.dataset.view;
      navBtns.forEach((b) => b.classList.toggle("active", b === btn));
      views.forEach((v) => v.classList.toggle("active", v.id === `view-${viewId}`));

      if (viewId === "mods" && !modrinthState.loaded && !modrinthState.loading) {
        syncModrinthFiltersFromSettings();
        fetchModrinthMods();
      }
    });
  });
}
function initCosmetics() {
  const grid = document.getElementById("cosmetics-grid");
  const tabs = document.querySelectorAll("[data-cosmetics-tab]");
  if (!grid) return;

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

  grid.addEventListener("change", (e) => {
    const id = e.target.dataset.cosmeticToggle;
    if (!id) return;

    const item = COSMETICS.find((entry) => entry.id === id);
    if (!item) return;

    if (e.target.checked) {
      COSMETICS.forEach((entry) => {
        if (entry.category === item.category) entry.equipped = entry.id === id;
      });
    } else {
      item.equipped = false;
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
    const loggedIn = Boolean(state?.isLoggedIn && state?.profile);
    const profile = state?.profile;

    const avatar = document.getElementById("account-avatar");
    const username = document.getElementById("account-username");
    const email = document.getElementById("account-email");
    const status = document.getElementById("account-status");
    const msStatus = document.getElementById("account-ms-status");
    const mcUsername = document.getElementById("account-mc-username");
    const mcUuid = document.getElementById("account-mc-uuid");
    const sessionExpires = document.getElementById("account-session-expires");

    if (loggedIn && profile) {
      if (avatar) avatar.src = profile.skinUrl;
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

      signInBtn?.classList.add("hidden");
      signOutBtnEl?.classList.remove("hidden");
      accountSidebar?.classList.add("logged-in");
    } else {
      if (avatar) avatar.src = "https://mc-heads.net/avatar/MHF_Steve/96";
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

      signInBtn?.classList.remove("hidden", "loading");
      signOutBtnEl?.classList.add("hidden");
      accountSidebar?.classList.remove("logged-in");
      setSignInLoading(false);
      localStorage.removeItem(IN_GAME_KEY);
    }

    updatePlayButton(loggedIn);
    updateHeroGreeting(state);
    refreshTitlebarPlayer();
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

  const storedClearPanels = localStorage.getItem(CLEAR_PANELS_KEY);
  applyClearPanels(storedClearPanels === "true");
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
    clearPanelsToggle.checked = localStorage.getItem(CLEAR_PANELS_KEY) === "true";

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

const STORE_CREDITS_PER_EUR = 100;
const STORE_TAX_RATE = 0;

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

  if (!balanceEl || !packsEl) return;

  const stored = localStorage.getItem("sc-credits");
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

  checkoutBtn?.addEventListener("click", () => {
    if (checkoutBtn.classList.contains("loading")) return;

    checkoutBtn.classList.add("loading");
    checkoutBtn.disabled = true;
    checkoutBtn.setAttribute("aria-busy", "true");

    setTimeout(() => {
      checkoutBtn.classList.remove("loading");
      checkoutBtn.disabled = false;
      checkoutBtn.setAttribute("aria-busy", "false");
    }, 1800);
  });

  updateCustomDisplay(storeState.customCredits);
  updatePackSelection();
  updateCheckout();
}

const SPACEPLUS_SUB_KEY = "spaceplus-subscribed";

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

  function subscribe() {
    localStorage.setItem(SPACEPLUS_SUB_KEY, "true");
    updateSubscriptionUI();
  }

  function toggleDemoSubscription() {
    localStorage.setItem(SPACEPLUS_SUB_KEY, isSubscribed() ? "false" : "true");
    updateSubscriptionUI();
  }

  function manageSubscription() {
    window.alert("Subscription management will open in your browser.");
  }

  document.getElementById("spaceplus-upgrade-btn")?.addEventListener("click", subscribe);
  document.getElementById("spaceplus-billing-upgrade-btn")?.addEventListener("click", subscribe);
  document.getElementById("spaceplus-manage-btn")?.addEventListener("click", manageSubscription);
  document.getElementById("spaceplus-billing-manage-btn")?.addEventListener("click", manageSubscription);
  document.getElementById("spaceplus-demo-toggle")?.addEventListener("click", toggleDemoSubscription);

  updateSubscriptionUI();
}

function formatLaunchSpeed(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "";
  const kb = bytesPerSec / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB/s`;
  return `${(kb / 1024).toFixed(1)} MB/s`;
}

function setLaunchProgressVisible(visible) {
  const panel = document.getElementById("launch-progress");
  if (!panel) return;
  panel.hidden = !visible;
}

function updateLaunchProgressUI(payload = {}) {
  const labelEl = document.getElementById("launch-progress-label");
  const pctEl = document.getElementById("launch-progress-pct");
  const fillEl = document.getElementById("launch-progress-fill");
  const detailEl = document.getElementById("launch-progress-detail");
  const barEl = document.getElementById("launch-progress-bar");

  setLaunchProgressVisible(true);

  if (payload.label && labelEl) labelEl.textContent = payload.label;

  if (Number.isFinite(payload.percent)) {
    const pct = Math.max(0, Math.min(100, Math.round(payload.percent)));
    if (pctEl) pctEl.textContent = `${pct}%`;
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

  api?.onLaunchProgress?.((payload) => {
    if (Number.isFinite(payload?.percent)) lastPercent = payload.percent;
    updateLaunchProgressUI({
      ...payload,
      percent: Number.isFinite(payload?.percent) ? payload.percent : lastPercent,
    });
  });

  api?.onLaunchStarted?.(() => {
    launching = false;
    setInGame(true);
    setLaunchProgressVisible(false);
    btn.classList.remove("launching");
    btn.textContent = "IN GAME";
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
    btn.title = "Minecraft is running";
  });

  api?.onLaunchClosed?.(() => {
    launching = false;
    setInGame(false);
    setLaunchProgressVisible(false);
    lastPercent = 0;
    resetPlayButton(btn, { loggedIn: true });
  });

  api?.onLaunchError?.((payload) => {
    launching = false;
    setInGame(false);
    setLaunchProgressVisible(true);
    updateLaunchProgressUI({
      label: "Launch failed",
      percent: lastPercent,
      detail: payload?.error || "Unknown error",
    });
    resetPlayButton(btn, { loggedIn: true });
  });

  btn.addEventListener("click", async () => {
    if (btn.disabled || launching) return;

    if (!api?.launchGame) {
      updateLaunchProgressUI({
        label: "Unavailable",
        percent: 0,
        detail: "Launch requires the Electron app (npm start).",
      });
      setLaunchProgressVisible(true);
      return;
    }

    launching = true;
    lastPercent = 0;
    btn.classList.add("launching");
    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
    btn.textContent = "LAUNCHING…";
    updateLaunchProgressUI({
      label: "Preparing launch…",
      percent: 0,
      detail: "",
    });

    const version =
      document.getElementById("home-version")?.value ||
      modrinthState.version ||
      "1.21.1";
    const loader =
      document.getElementById("home-loader")?.value ||
      modrinthState.homeLoader ||
      "vanilla";
    const memoryGb = getRamGb();

    try {
      const result = await api.launchGame({ version, loader, memoryGb });
      if (!result?.success) {
        launching = false;
        updateLaunchProgressUI({
          label: "Launch failed",
          percent: lastPercent,
          detail: result?.error || "Could not start Minecraft.",
        });
        resetPlayButton(btn, { loggedIn: true });
      }
    } catch (err) {
      launching = false;
      updateLaunchProgressUI({
        label: "Launch failed",
        percent: lastPercent,
        detail: err?.message || String(err),
      });
      resetPlayButton(btn, { loggedIn: true });
    }
  });
}

loadStoredPreferences();

document.addEventListener("DOMContentLoaded", () => {
  initWindowControls();
  initTitlebarPlayer();
  initNavigation();
  initLaunchSelectors();
  initHomeNews();
  initModrinth();
  initModDetailPanel();
  initCosmetics();
  initAccount();
  initStore();
  initSpacePlus();
  initSettings();
  initPlayButton();
  updateActiveModCount();
});