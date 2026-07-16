const INSTALLED_KEY = "sl-installed-mods";
const ACCENT_KEY = "sl-accent";
const BLUR_BG_KEY = "sl-blur-bg";
const CLEAR_PANELS_KEY = "sl-clear-panels";
const RAM_KEY = "sl-ram";
const IN_GAME_KEY = "sl-in-game";
const MODRINTH_PAGE_SIZE = 20;

/** One-time migrate prefs from Space Client localStorage keys. */
(function migrateLegacyStorageKeys() {
  const pairs = [
    ["space-client-installed-mods", INSTALLED_KEY],
    ["space-client-accent", ACCENT_KEY],
    ["space-client-blur-bg", BLUR_BG_KEY],
    ["space-client-clear-panels", CLEAR_PANELS_KEY],
    ["space-client-ram", RAM_KEY],
    ["space-client-in-game", IN_GAME_KEY],
  ];
  for (const [from, to] of pairs) {
    if (localStorage.getItem(to) == null && localStorage.getItem(from) != null) {
      localStorage.setItem(to, localStorage.getItem(from));
    }
  }
})();

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
    id: "launcher-migration",
    tag: "Release",
    date: "Jul 16, 2026",
    title: "Welcome to Space Launcher",
    desc: "Space Launcher ships performance packs, profile cosmetics, and a redesigned Space+ membership.",
  },
  {
    id: "perf-packs",
    tag: "Feature",
    date: "Jul 16, 2026",
    title: "Performance packs inject at launch",
    desc: "Lite, Standard, and Max Boost pull Sodium-stack jars into Fabric automatically — nothing lands in .minecraft/mods.",
  },
  {
    id: "mc-1211",
    tag: "Update",
    date: "Jul 8, 2026",
    title: "Minecraft 1.21.1 supported",
    desc: "Play on the latest stable release with Fabric loader. More versions are on the way.",
  },
];

const COSMETICS = []; // migrated to src/cosmetics.js

const cosmeticsState = { tab: "capes" };
const OWNED_COSMETICS_KEY = "sl-owned-cosmetics";
const EQUIPPED_COSMETICS_KEY = "sl-equipped-cosmetics";
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
  window.SpaceCosmetics?.refresh?.();
}

function renderCosmeticsGrid() {
  window.SpaceCosmetics?.refresh?.();
}

function initCosmeticDetailPanel() {
  // Handled by src/cosmetics.js
}

function initCosmetics() {
  if (typeof window.initSpaceCosmetics === "function") {
    window.initSpaceCosmetics();
  }
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


function purchaseCosmetic() {
  return { success: false, error: "Use the Cosmetics tab." };
}

function openSpacePlusFromCosmetics() {
  window.navigateToView?.("spaceplus");
}

function closeCosmeticDetail() {
  const overlay = document.getElementById("cosmetic-detail-overlay");
  if (overlay) {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }
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

  document.documentElement.style.setProperty("--sl-accent", color.value);
  document.documentElement.style.setProperty("--sl-accent-rgb", `${r}, ${g}, ${b}`);
  document.documentElement.style.setProperty("--sl-accent-muted", `rgba(${r}, ${g}, ${b}, 0.15)`);
  document.documentElement.style.setProperty("--sl-accent-glow", `rgba(${r}, ${g}, ${b}, 0.22)`);

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
const CREDITS_STORAGE_KEY = "sl-credits";

/** Migrate payments/credits keys from Space Client era. */
(function migratePaymentsKeys() {
  if (localStorage.getItem("sl-credits") == null && localStorage.getItem("sc-credits") != null) {
    localStorage.setItem("sl-credits", localStorage.getItem("sc-credits"));
  }
  if (localStorage.getItem("sl-payments-api") == null && localStorage.getItem("sc-payments-api") != null) {
    localStorage.setItem("sl-payments-api", localStorage.getItem("sc-payments-api"));
  }
})();

/** Backend payments API — override with localStorage `sl-payments-api` if needed. */
let PAYMENTS_API_BASE =
  (typeof localStorage !== "undefined" && localStorage.getItem("sl-payments-api")) ||
  "http://localhost:8787";

async function resolvePaymentsApiBase() {
  const override =
    typeof localStorage !== "undefined" && localStorage.getItem("sl-payments-api");
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
      document.dispatchEvent(new CustomEvent("sl-spaceplus-sync"));
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
    document.dispatchEvent(new CustomEvent("sl-spaceplus-sync"));
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

  document.addEventListener("sl-spaceplus-sync", () => {
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
    tips.push("A Fabric performance mod mixin failed — switch to Lite Boost or Vanilla Fabric under Presets, then relaunch.");
  }

  if (/unknown protocol:\s*c|Invalid URL C:/i.test(text)) {
    tips.push("Log4j Windows path bug — relaunch with the latest Space Launcher (file:// log config fix). This alone usually does not stop the game.");
  }

  if (/OutOfMemoryError|Java heap space|GC overhead/i.test(text)) {
    tips.push("Increase RAM in Settings (try 6–8 GB) and relaunch.");
  }

  if (/lwjgl|glfw|Failed to create the OpenGL context|OpenGL/i.test(text)) {
    tips.push("Update your GPU drivers, then try launching with other apps closed (overlay/Discord may interfere).");
  }

  if (/Could not find or load main class|NoClassDefFoundError|ClassNotFoundException/i.test(text)) {
    tips.push("Game files look incomplete — relaunch so assets/libraries re-download, or delete the SpaceLauncher .minecraft folder and try again.");
  }

  if (/Failed to verify username|Invalid session|401|Unauthorized/i.test(text)) {
    tips.push("Sign out and sign back in with Microsoft on the Account page.");
  }

  if (/fabric-api|ModResolutionException|Incompatible mods/i.test(text)) {
    tips.push("Fabric API / mod conflict — clear .minecraft/mods and let Space Launcher inject the performance pack from natives.");
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
    appendLaunchConsoleLine("Starting Space Launcher launch pipeline…");

    const version =
      document.getElementById("home-version")?.value ||
      modrinthState.version ||
      "1.21.1";
    const loader =
      document.getElementById("home-loader")?.value ||
      modrinthState.homeLoader ||
      "fabric";
    const memoryGb = getRamGb();
    const equippedProfile =
      window.SpaceCosmetics?.getProfileForLaunch?.() || {};
    const perfPack = window.SpacePerformance?.getPack?.() || "standard";
    const spacePlus = isSpacePlusActive();

    try {
      const result = await api.launchGame({
        version,
        loader,
        memoryGb,
        perfPack,
        spacePlus,
        equippedProfile,
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
  window.initPerformancePresets?.();
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

  window.SpaceLauncherAuth = {
    getUsername: () => getCurrentUsername(),
  };
});