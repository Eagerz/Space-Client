/**
 * Space Launcher — Profile cosmetics (badges, frames, themes).
 * Launcher-side identity only — no ClickGUI / in-game cape jar.
 */
(function () {
  "use strict";

  const OWNED_KEY = "sl-owned-cosmetics";
  const EQUIPPED_KEY = "sl-equipped-cosmetics";
  const LEGACY_OWNED = "sc-owned-cosmetics";
  const LEGACY_EQUIPPED = "sc-equipped-cosmetics";
  const SPACEPLUS_SUB_KEY = "spaceplus-subscribed";
  const CREDITS_KEY = "sc-credits";

  /** @type {Array<{
   *   id: string,
   *   category: "badges"|"frames"|"themes",
   *   name: string,
   *   desc: string,
   *   rarity: string,
   *   price: number|null,
   *   exclusive?: "spaceplus"|null,
   *   swatch: string,
   * }>} */
  const CATALOG = [
    // Badges
    { id: "badge-orbit", category: "badges", name: "Orbit", desc: "A clean orbital ring beside your name.", rarity: "common", price: 0, swatch: "orbit" },
    { id: "badge-comet", category: "badges", name: "Comet", desc: "A streaking comet mark for the titlebar.", rarity: "uncommon", price: 120, swatch: "comet" },
    { id: "badge-nova", category: "badges", name: "Nova", desc: "Bright starburst badge with soft pulse.", rarity: "rare", price: 220, swatch: "nova" },
    { id: "badge-eclipse", category: "badges", name: "Eclipse", desc: "Dark disc with a bright corona rim.", rarity: "epic", price: 380, swatch: "eclipse" },
    { id: "badge-plus", category: "badges", name: "Plus Sigil", desc: "Animated Space+ member mark.", rarity: "legendary", price: null, exclusive: "spaceplus", swatch: "plus" },
    // Frames
    { id: "frame-plain", category: "frames", name: "Plain", desc: "Minimal avatar edge.", rarity: "common", price: 0, swatch: "plain" },
    { id: "frame-silver", category: "frames", name: "Silver Ring", desc: "Thin metallic ring around your head.", rarity: "uncommon", price: 150, swatch: "silver" },
    { id: "frame-aurora", category: "frames", name: "Aurora", desc: "Cyan–violet gradient frame.", rarity: "rare", price: 280, swatch: "aurora" },
    { id: "frame-void", category: "frames", name: "Void Edge", desc: "Deep void border with star flecks.", rarity: "epic", price: 420, swatch: "void" },
    { id: "frame-member", category: "frames", name: "Member Orbit", desc: "Exclusive Space+ orbital frame.", rarity: "legendary", price: null, exclusive: "spaceplus", swatch: "member" },
    // Themes
    { id: "theme-deep", category: "themes", name: "Deep Space", desc: "Default cold-void launcher accents.", rarity: "common", price: 0, swatch: "deep" },
    { id: "theme-ember", category: "themes", name: "Ember Drift", desc: "Warm ember highlights on chrome.", rarity: "rare", price: 260, swatch: "ember" },
    { id: "theme-ion", category: "themes", name: "Ion Blue", desc: "Electric blue accent wash.", rarity: "rare", price: 260, swatch: "ion" },
    { id: "theme-flare", category: "themes", name: "Priority Flare", desc: "Gold flare accents for Space+ members.", rarity: "legendary", price: null, exclusive: "spaceplus", swatch: "flare" },
  ];

  const state = {
    tab: "badges",
    detailId: null,
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  }

  function isSpacePlus() {
    if (typeof window.isSpacePlusActive === "function") return window.isSpacePlusActive();
    return localStorage.getItem(SPACEPLUS_SUB_KEY) === "true";
  }

  function getCredits() {
    return Number(localStorage.getItem(CREDITS_KEY) || 0) || 0;
  }

  function setCredits(n) {
    localStorage.setItem(CREDITS_KEY, String(Math.max(0, Math.floor(n))));
    window.dispatchEvent(new CustomEvent("space-entitlements-changed"));
  }

  function getOwned() {
    let owned = readJson(OWNED_KEY, null);
    if (!Array.isArray(owned)) {
      owned = readJson(LEGACY_OWNED, []);
      localStorage.setItem(OWNED_KEY, JSON.stringify(owned));
    }
    return owned;
  }

  function setOwned(ids) {
    localStorage.setItem(OWNED_KEY, JSON.stringify(ids));
  }

  function getEquipped() {
    let eq = readJson(EQUIPPED_KEY, null);
    if (!eq || typeof eq !== "object") {
      eq = readJson(LEGACY_EQUIPPED, {});
      // Migrate old cape/pet keys away
      eq = {
        badges: eq.badges || "badge-orbit",
        frames: eq.frames || "frame-plain",
        themes: eq.themes || "theme-deep",
      };
      localStorage.setItem(EQUIPPED_KEY, JSON.stringify(eq));
    }
    return {
      badges: eq.badges || "badge-orbit",
      frames: eq.frames || "frame-plain",
      themes: eq.themes || "theme-deep",
    };
  }

  function setEquipped(map) {
    localStorage.setItem(EQUIPPED_KEY, JSON.stringify(map));
    applyEquippedToChrome();
    window.dispatchEvent(new CustomEvent("space-cosmetics-changed"));
  }

  function isOwned(item) {
    if (!item) return false;
    if (item.price === 0 && !item.exclusive) return true;
    if (item.exclusive === "spaceplus" && isSpacePlus()) return true;
    return getOwned().includes(item.id);
  }

  function findItem(id) {
    return CATALOG.find((c) => c.id === id) || null;
  }

  function applyEquippedToChrome() {
    const eq = getEquipped();
    const theme = findItem(eq.themes);
    document.body.dataset.cosmeticTheme = theme?.swatch || "deep";
    document.body.dataset.cosmeticBadge = findItem(eq.badges)?.swatch || "orbit";
    document.body.dataset.cosmeticFrame = findItem(eq.frames)?.swatch || "plain";

    const badgeEl = document.getElementById("titlebar-cosmetic-badge");
    if (badgeEl) {
      badgeEl.dataset.swatch = findItem(eq.badges)?.swatch || "orbit";
      badgeEl.hidden = false;
    }
  }

  function renderPreview(item) {
    return `<div class="cosmo-preview cosmo-preview-${escapeHtml(item.category)} cosmo-swatch-${escapeHtml(item.swatch)}" aria-hidden="true"></div>`;
  }

  function renderCard(item) {
    const owned = isOwned(item);
    const eq = getEquipped();
    const equipped = eq[item.category] === item.id;
    const plus = item.exclusive === "spaceplus";
    let price = "";
    if (plus && !owned) price = `<span class="cosmo-price cosmo-price-plus">Space+</span>`;
    else if (owned) price = `<span class="cosmo-price cosmo-price-owned">${equipped ? "Equipped" : "Owned"}</span>`;
    else if (item.price === 0) price = `<span class="cosmo-price">Free</span>`;
    else price = `<span class="cosmo-price">${item.price} cr</span>`;

    return `
      <article class="cosmo-card ${owned ? "is-owned" : "is-locked"} ${equipped ? "is-equipped" : ""} ${plus ? "is-plus" : ""}"
        data-cosmo-id="${escapeHtml(item.id)}" role="button" tabindex="0">
        ${renderPreview(item)}
        <div class="cosmo-card-body">
          <div class="cosmo-card-top">
            <h3 class="cosmo-card-name">${escapeHtml(item.name)}</h3>
            <span class="cosmo-rarity rarity-${escapeHtml(item.rarity)}">${escapeHtml(item.rarity)}</span>
          </div>
          <p class="cosmo-card-desc">${escapeHtml(item.desc)}</p>
          ${price}
        </div>
      </article>`;
  }

  function renderGrid() {
    const grid = document.getElementById("cosmetics-grid");
    const meta = document.getElementById("cosmetics-meta");
    if (!grid) return;
    const items = CATALOG.filter((c) => c.category === state.tab);
    const ownedCount = items.filter(isOwned).length;
    if (meta) meta.textContent = `${ownedCount}/${items.length} unlocked · ${getCredits()} credits`;
    grid.innerHTML = items.map(renderCard).join("");
  }

  function openDetail(id) {
    const item = findItem(id);
    const overlay = document.getElementById("cosmetic-detail-overlay");
    const body = document.getElementById("cosmetic-detail-content");
    if (!item || !overlay || !body) return;
    state.detailId = id;
    const owned = isOwned(item);
    const equipped = getEquipped()[item.category] === item.id;

    let action = "";
    if (!owned && item.exclusive === "spaceplus") {
      action = `<button type="button" class="cosmo-action" data-cosmo-plus>Unlock with Space+</button>`;
    } else if (!owned && item.price > 0) {
      action = `<button type="button" class="cosmo-action" data-cosmo-buy>Buy for ${item.price} credits</button>`;
    } else if (owned && !equipped) {
      action = `<button type="button" class="cosmo-action" data-cosmo-equip>Equip</button>`;
    } else if (owned && equipped) {
      action = `<button type="button" class="cosmo-action cosmo-action-muted" data-cosmo-unequip>Unequip</button>`;
    } else {
      action = `<button type="button" class="cosmo-action" data-cosmo-equip>Equip</button>`;
    }

    body.innerHTML = `
      <div class="cosmo-detail-preview">${renderPreview(item)}</div>
      <p class="cosmo-detail-kicker" id="cosmetic-detail-title">${escapeHtml(item.category.slice(0, -1))} · ${escapeHtml(item.rarity)}${item.exclusive === "spaceplus" ? " · Space+" : ""}</p>
      <h3 class="cosmo-detail-title">${escapeHtml(item.name)}</h3>
      <p class="cosmo-detail-desc">${escapeHtml(item.desc)}</p>
      <div class="cosmo-detail-actions">${action}</div>`;

    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");

    body.querySelector("[data-cosmo-plus]")?.addEventListener("click", () => {
      closeDetail();
      window.navigateToView?.("spaceplus");
    });
    body.querySelector("[data-cosmo-buy]")?.addEventListener("click", () => buyItem(item));
    body.querySelector("[data-cosmo-equip]")?.addEventListener("click", () => equipItem(item));
    body.querySelector("[data-cosmo-unequip]")?.addEventListener("click", () => unequipCategory(item.category));
  }

  function closeDetail() {
    const overlay = document.getElementById("cosmetic-detail-overlay");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    state.detailId = null;
  }

  function buyItem(item) {
    if (isOwned(item)) return;
    const credits = getCredits();
    if (credits < item.price) {
      window.SpaceGUI?.showToast?.("Not enough credits — visit the Store", {
        tone: "info",
        actionLabel: "Store",
        onAction: () => window.navigateToView?.("store"),
      });
      return;
    }
    setCredits(credits - item.price);
    setOwned([...getOwned(), item.id]);
    window.SpaceGUI?.showToast?.(`Unlocked ${item.name}`, { tone: "ok" });
    window.SpaceGUI?.pushActivity?.({ kind: "social", text: `Unlocked cosmetic: ${item.name}` });
    renderGrid();
    openDetail(item.id);
  }

  function equipItem(item) {
    if (!isOwned(item)) return;
    const eq = getEquipped();
    eq[item.category] = item.id;
    setEquipped(eq);
    window.SpaceGUI?.showToast?.(`Equipped ${item.name}`, { tone: "ok", duration: 2000 });
    renderGrid();
    openDetail(item.id);
  }

  function unequipCategory(category) {
    const eq = getEquipped();
    const defaults = { badges: "badge-orbit", frames: "frame-plain", themes: "theme-deep" };
    eq[category] = defaults[category];
    setEquipped(eq);
    renderGrid();
    if (state.detailId) openDetail(state.detailId);
  }

  function getProfileForLaunch() {
    const eq = getEquipped();
    return {
      badge: eq.badges || null,
      frame: eq.frames || null,
      theme: eq.themes || null,
    };
  }

  function initCosmetics() {
    const grid = document.getElementById("cosmetics-grid");
    if (!grid) return;

    applyEquippedToChrome();
    renderGrid();

    document.querySelectorAll("[data-cosmetics-tab]").forEach((tab) => {
      tab.addEventListener("click", () => {
        const next = tab.dataset.cosmeticsTab;
        if (!next || next === state.tab) return;
        state.tab = next;
        document.querySelectorAll("[data-cosmetics-tab]").forEach((t) => {
          const on = t.dataset.cosmeticsTab === next;
          t.classList.toggle("active", on);
          t.setAttribute("aria-selected", on ? "true" : "false");
        });
        renderGrid();
      });
    });

    grid.addEventListener("click", (e) => {
      const card = e.target.closest("[data-cosmo-id]");
      if (card) openDetail(card.getAttribute("data-cosmo-id"));
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest("[data-cosmo-id]");
      if (!card) return;
      e.preventDefault();
      openDetail(card.getAttribute("data-cosmo-id"));
    });

    document.querySelectorAll("[data-cosmetic-detail-close]")?.forEach((el) => {
      el.addEventListener("click", closeDetail);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.detailId) closeDetail();
    });

    window.addEventListener("space-entitlements-changed", () => {
      renderGrid();
      applyEquippedToChrome();
    });
  }

  window.SpaceCosmetics = {
    getProfileForLaunch,
    getEquipped,
    refresh: renderGrid,
    catalog: CATALOG,
  };
  window.initSpaceCosmetics = initCosmetics;
  window.initCosmetics = initCosmetics;
})();
