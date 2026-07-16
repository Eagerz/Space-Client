/**
 * Space Launcher — Promotional ads system (client-side)
 * Space+ / Owner roles hide all ads. Slots: home banner, mods rail, pre-play interstitial.
 */
(function () {
  "use strict";

  const SPACEPLUS_SUB_KEY = "spaceplus-subscribed";
  const ADS_OPT_OUT_KEY = "sl-ads-opt-out";
  const ADS_STATS_KEY = "sl-ads-stats";
  const INTERSTITIAL_LAST_KEY = "sl-ad-interstitial-last";
  const LEGACY_ADS_OPT_OUT = "sc-ads-opt-out";
  const LEGACY_ADS_STATS = "sc-ads-stats";
  const LEGACY_INTERSTITIAL = "sc-ad-interstitial-last";

  (function migrateAdsKeys() {
    const pairs = [
      [LEGACY_ADS_OPT_OUT, ADS_OPT_OUT_KEY],
      [LEGACY_ADS_STATS, ADS_STATS_KEY],
      [LEGACY_INTERSTITIAL, INTERSTITIAL_LAST_KEY],
    ];
    for (const [from, to] of pairs) {
      if (localStorage.getItem(to) == null && localStorage.getItem(from) != null) {
        localStorage.setItem(to, localStorage.getItem(from));
      }
    }
  })();
  const INTERSTITIAL_COOLDOWN_MS = 12 * 60 * 1000;

  const AD_CATALOG = [
    {
      id: "hypixel-partner",
      title: "Hypixel Network",
      subtitle: "The largest Minecraft server network",
      cta: "Visit",
      url: "https://hypixel.net",
      tone: "violet",
      slots: ["home", "mods", "interstitial"],
      sponsor: "Partner",
    },
    {
      id: "modrinth-spotlight",
      title: "Discover mods on Modrinth",
      subtitle: "Open-source mods, resource packs, and more",
      cta: "Browse",
      url: "https://modrinth.com",
      tone: "green",
      slots: ["home", "mods"],
      sponsor: "Spotlight",
    },
    {
      id: "spaceplus-promo",
      title: "Go ad-free with Space+",
      subtitle: "Max Boost, exclusive flair, and no promos",
      cta: "Upgrade",
      url: "#spaceplus",
      tone: "gold",
      slots: ["home", "interstitial"],
      sponsor: "Space Launcher",
      internal: true,
      view: "spaceplus",
    },
    {
      id: "fabric-api",
      title: "Fabric API",
      subtitle: "Essential library for Fabric mods",
      cta: "Learn more",
      url: "https://modrinth.com/mod/fabric-api",
      tone: "blue",
      slots: ["mods"],
      sponsor: "Ecosystem",
    },
    {
      id: "cubecraft",
      title: "CubeCraft Games",
      subtitle: "Mini-games, skyblock, and more",
      cta: "Play",
      url: "https://www.cubecraft.net",
      tone: "cyan",
      slots: ["home", "interstitial"],
      sponsor: "Partner",
    },
  ];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isOwner() {
    const name = (window.SpaceLauncherAuth?.getUsername?.() || "").trim().toLowerCase();
    return name === "eagerz8811" || name === "eagerz";
  }

  function isSpacePlus() {
    if (typeof window.isSpacePlusActive === "function") return window.isSpacePlusActive();
    return localStorage.getItem(SPACEPLUS_SUB_KEY) === "true" || isOwner();
  }

  function adsDisabled() {
    return isSpacePlus() || localStorage.getItem(ADS_OPT_OUT_KEY) === "true";
  }

  function loadStats() {
    try {
      return JSON.parse(localStorage.getItem(ADS_STATS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function track(adId, event) {
    const stats = loadStats();
    if (!stats[adId]) stats[adId] = { impressions: 0, clicks: 0 };
    stats[adId][event] = (stats[adId][event] || 0) + 1;
    localStorage.setItem(ADS_STATS_KEY, JSON.stringify(stats));
  }

  function pickAd(slot) {
    const pool = AD_CATALOG.filter((a) => a.slots.includes(slot));
    if (!pool.length) return null;
    // Prefer Space+ promo for free users on home
    if (slot === "home" && !isSpacePlus()) {
      const plus = pool.find((a) => a.id === "spaceplus-promo");
      if (plus && Math.random() < 0.45) return plus;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function handleAdClick(ad) {
    track(ad.id, "clicks");
    window.SpaceGUI?.pushActivity?.({ kind: "ad", text: `Opened promo: ${ad.title}` });
    if (ad.internal && ad.view) {
      if (typeof window.navigateToView === "function") window.navigateToView(ad.view);
      else document.querySelector(`.nav-btn[data-view="${ad.view}"]`)?.click();
      return;
    }
    if (ad.url) {
      const api = window.electronAPI || window.api;
      if (api?.openPaymentPortal) api.openPaymentPortal(ad.url);
      else window.open(ad.url, "_blank", "noopener");
    }
  }

  function renderBanner(container, ad, variant) {
    if (!container || !ad) return;
    track(ad.id, "impressions");
    container.hidden = false;
    container.innerHTML = `
      <article class="sl-ad sl-ad-${escapeHtml(ad.tone)} sl-ad-${escapeHtml(variant)}" data-ad-id="${escapeHtml(ad.id)}">
        <div class="sl-ad-meta">
          <span class="sl-ad-sponsor">${escapeHtml(ad.sponsor)}</span>
          <span class="sl-ad-label">Sponsored</span>
        </div>
        <div class="sl-ad-body">
          <div>
            <h3 class="sl-ad-title">${escapeHtml(ad.title)}</h3>
            <p class="sl-ad-sub">${escapeHtml(ad.subtitle)}</p>
          </div>
          <button type="button" class="sl-ad-cta" data-ad-cta>${escapeHtml(ad.cta)}</button>
        </div>
        <button type="button" class="sl-ad-dismiss" aria-label="Dismiss ad" data-ad-dismiss>×</button>
      </article>`;

    container.querySelector("[data-ad-cta]")?.addEventListener("click", () => handleAdClick(ad));
    container.querySelector("[data-ad-dismiss]")?.addEventListener("click", () => {
      container.hidden = true;
      container.innerHTML = "";
      window.SpaceGUI?.showToast?.("Ad dismissed", { tone: "info", duration: 2200 });
    });
  }

  function refreshSlots() {
    const home = document.getElementById("ad-slot-home");
    const mods = document.getElementById("ad-slot-mods");

    if (adsDisabled()) {
      if (home) {
        home.hidden = true;
        home.innerHTML = "";
      }
      if (mods) {
        mods.hidden = true;
        mods.innerHTML = "";
      }
      document.body.classList.add("ads-disabled");
      updateSettingsRow();
      return;
    }

    document.body.classList.remove("ads-disabled");
    if (home) renderBanner(home, pickAd("home"), "banner");
    if (mods) renderBanner(mods, pickAd("mods"), "rail");
    updateSettingsRow();
  }

  function canShowInterstitial() {
    if (adsDisabled()) return false;
    const last = Number(localStorage.getItem(INTERSTITIAL_LAST_KEY) || 0);
    return Date.now() - last > INTERSTITIAL_COOLDOWN_MS;
  }

  function closeInterstitial() {
    const overlay = document.getElementById("ad-interstitial");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }

  /**
   * Show pre-play interstitial for free users. Resolves when user continues or skips.
   * @returns {Promise<boolean>} true if play should continue
   */
  function maybeShowPlayInterstitial() {
    return new Promise((resolve) => {
      if (!canShowInterstitial()) {
        resolve(true);
        return;
      }

      const overlay = document.getElementById("ad-interstitial");
      const body = document.getElementById("ad-interstitial-body");
      if (!overlay || !body) {
        resolve(true);
        return;
      }

      const ad = pickAd("interstitial");
      if (!ad) {
        resolve(true);
        return;
      }

      localStorage.setItem(INTERSTITIAL_LAST_KEY, String(Date.now()));
      track(ad.id, "impressions");

      let remaining = 3;
      body.innerHTML = `
        <article class="sl-ad sl-ad-${escapeHtml(ad.tone)} sl-ad-interstitial" data-ad-id="${escapeHtml(ad.id)}">
          <div class="sl-ad-meta">
            <span class="sl-ad-sponsor">${escapeHtml(ad.sponsor)}</span>
            <span class="sl-ad-label">Sponsored</span>
          </div>
          <h3 class="sl-ad-title">${escapeHtml(ad.title)}</h3>
          <p class="sl-ad-sub">${escapeHtml(ad.subtitle)}</p>
          <div class="sl-ad-interstitial-actions">
            <button type="button" class="sl-ad-cta" data-ad-cta>${escapeHtml(ad.cta)}</button>
            <button type="button" class="sl-ad-skip" data-ad-skip disabled>Continue in ${remaining}…</button>
          </div>
          <p class="sl-ad-spaceplus-hint">Space+ members never see these — <button type="button" class="sl-ad-link" data-goto-plus>Upgrade</button></p>
        </article>`;

      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");

      const skipBtn = body.querySelector("[data-ad-skip]");
      const timer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearInterval(timer);
          if (skipBtn) {
            skipBtn.disabled = false;
            skipBtn.textContent = "Continue to PLAY";
          }
        } else if (skipBtn) {
          skipBtn.textContent = `Continue in ${remaining}…`;
        }
      }, 1000);

      const finish = (continuePlay) => {
        clearInterval(timer);
        closeInterstitial();
        resolve(continuePlay);
      };

      body.querySelector("[data-ad-cta]")?.addEventListener("click", () => {
        handleAdClick(ad);
      });
      skipBtn?.addEventListener("click", () => {
        if (!skipBtn.disabled) finish(true);
      });
      body.querySelector("[data-goto-plus]")?.addEventListener("click", () => {
        finish(false);
        if (typeof window.navigateToView === "function") window.navigateToView("spaceplus");
        else document.querySelector('.nav-btn[data-view="spaceplus"]')?.click();
      });
    });
  }

  function updateSettingsRow() {
    const status = document.getElementById("ads-status-label");
    const toggle = document.getElementById("ads-opt-out-toggle");
    if (status) {
      if (isSpacePlus()) status.textContent = "Hidden — Space+ ad-free";
      else if (localStorage.getItem(ADS_OPT_OUT_KEY) === "true") status.textContent = "Promos hidden (settings)";
      else status.textContent = "Showing partner promos";
    }
    if (toggle) {
      toggle.checked = isSpacePlus() || localStorage.getItem(ADS_OPT_OUT_KEY) === "true";
      toggle.disabled = isSpacePlus();
    }
  }

  function initAdsSettings() {
    const toggle = document.getElementById("ads-opt-out-toggle");
    if (!toggle) return;
    toggle.addEventListener("change", () => {
      if (isSpacePlus()) {
        toggle.checked = true;
        return;
      }
      localStorage.setItem(ADS_OPT_OUT_KEY, toggle.checked ? "true" : "false");
      refreshSlots();
      window.SpaceGUI?.showToast?.(
        toggle.checked ? "Promotional content hidden" : "Promotional content enabled",
        { tone: "info" }
      );
    });
    updateSettingsRow();
  }

  function initAds() {
    initAdsSettings();
    refreshSlots();

    // Refresh when Space+ demo toggles or entitlements change
    window.addEventListener("storage", (e) => {
      if (e.key === SPACEPLUS_SUB_KEY || e.key === ADS_OPT_OUT_KEY) refreshSlots();
    });
    window.addEventListener("space-entitlements-changed", refreshSlots);
  }

  window.SpaceAds = {
    refresh: refreshSlots,
    maybeShowPlayInterstitial,
    adsDisabled,
    closeInterstitial,
  };

  window.initAds = initAds;
})();
