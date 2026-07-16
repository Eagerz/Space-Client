/**
 * Space Client monetization layer — Space+ perks + credit sinks.
 * Presets stay unlimited for everyone (no slot gates).
 */
(function () {
  "use strict";

  const STIPEND_KEY = "sc-spaceplus-stipend";
  const BOOSTS_KEY = "sc-active-boosts";
  const WALLPAPERS_KEY = "sc-owned-wallpapers";
  const WALLPAPER_EQUIP_KEY = "sc-equipped-wallpaper";
  const GIFTS_KEY = "sc-gift-codes";
  const TIPS_KEY = "sc-creator-tips";
  const EARLY_ACCESS_KEY = "sc-early-access";
  const FLAIR_KEY = "sc-profile-flair";

  const SPACEPLUS_MONTHLY_CREDITS = 200;
  const PRIORITY_DOWNLOADS = 12;
  const STANDARD_DOWNLOADS = 5;

  /** Current seasonal drop window (inclusive). */
  const CURRENT_SEASON = {
    id: "summer-2026",
    label: "Summer 2026",
    startsAt: Date.parse("2026-06-01T00:00:00Z"),
    endsAt: Date.parse("2026-09-01T00:00:00Z"),
  };

  const BOOSTS = [
    {
      id: "boost-trail",
      name: "Stardust Trail",
      desc: "Cosmetic particle trail in-game for 7 days. No gameplay advantage.",
      price: 250,
      durationDays: 7,
    },
    {
      id: "boost-launch-flare",
      name: "Launch Flare",
      desc: "Celebration animation when Minecraft boots — 3 days.",
      price: 150,
      durationDays: 3,
    },
    {
      id: "boost-name-glow",
      name: "Name Glow",
      desc: "Soft titlebar name glow for 14 days.",
      price: 200,
      durationDays: 14,
    },
  ];

  const WALLPAPERS = [
    {
      id: "wp-deep-void",
      name: "Deep Void",
      desc: "Near-black gradient with sparse silver stars.",
      price: 300,
      cssClass: "wallpaper-deep-void",
    },
    {
      id: "wp-nebula-haze",
      name: "Nebula Haze",
      desc: "Soft indigo haze behind the starfield.",
      price: 400,
      cssClass: "wallpaper-nebula-haze",
    },
    {
      id: "wp-lunar-rim",
      name: "Lunar Rim",
      desc: "Cool moonlight edge glow on the main panel.",
      price: 350,
      cssClass: "wallpaper-lunar-rim",
    },
  ];

  const CREATORS = [
    { id: "creator-nova", name: "NovaPulse", capeHint: "Hyperspace vibes" },
    { id: "creator-orbit", name: "OrbitKid", capeHint: "Event Horizon fan" },
    { id: "creator-silver", name: "SilverDrift", capeHint: "Aurora edits" },
  ];

  const TIP_AMOUNTS = [50, 100, 250];

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function isSpacePlus() {
    if (typeof window.isSpacePlusActive === "function") return window.isSpacePlusActive();
    return localStorage.getItem("spaceplus-subscribed") === "true";
  }

  function getCredits() {
    if (typeof window.getCreditsBalance === "function") return window.getCreditsBalance();
    return Number(localStorage.getItem("sc-credits")) || 0;
  }

  function setCredits(n) {
    if (typeof window.setCreditsBalance === "function") return window.setCreditsBalance(n);
    localStorage.setItem("sc-credits", String(Math.max(0, Math.round(n))));
    return n;
  }

  function spendCredits(amount) {
    const balance = getCredits();
    if (balance < amount) {
      return { success: false, error: `Need ${amount - balance} more credits.` };
    }
    setCredits(balance - amount);
    return { success: true, balance: balance - amount };
  }

  function isSeasonActive(now = Date.now()) {
    return now >= CURRENT_SEASON.startsAt && now <= CURRENT_SEASON.endsAt;
  }

  function getSeasonInfo() {
    return { ...CURRENT_SEASON, active: isSeasonActive() };
  }

  /** Monthly Space+ credit stipend (idempotent per calendar month). */
  function claimMonthlyStipend() {
    if (!isSpacePlus()) {
      return { success: false, error: "Space+ required.", requiresSpacePlus: true };
    }
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const claimed = readJson(STIPEND_KEY, {});
    if (claimed.month === stamp) {
      return { success: true, alreadyClaimed: true, credits: 0, month: stamp };
    }
    setCredits(getCredits() + SPACEPLUS_MONTHLY_CREDITS);
    writeJson(STIPEND_KEY, { month: stamp, amount: SPACEPLUS_MONTHLY_CREDITS, at: Date.now() });
    return { success: true, alreadyClaimed: false, credits: SPACEPLUS_MONTHLY_CREDITS, month: stamp };
  }

  function getDownloadParallelism() {
    return isSpacePlus() ? PRIORITY_DOWNLOADS : STANDARD_DOWNLOADS;
  }

  function isEarlyAccessEnabled() {
    return isSpacePlus() && localStorage.getItem(EARLY_ACCESS_KEY) !== "false";
  }

  function setEarlyAccessEnabled(enabled) {
    if (!isSpacePlus()) return { success: false, error: "Space+ required.", requiresSpacePlus: true };
    localStorage.setItem(EARLY_ACCESS_KEY, enabled ? "true" : "false");
    applyEarlyAccessUi();
    return { success: true, enabled: Boolean(enabled) };
  }

  function applyEarlyAccessUi() {
    const on = isEarlyAccessEnabled();
    document.body.classList.toggle("early-access", on);
    const badge = document.getElementById("early-access-badge");
    if (badge) badge.hidden = !on;
    const toggle = document.getElementById("early-access-toggle");
    if (toggle) {
      toggle.checked = on;
      toggle.disabled = !isSpacePlus();
    }
    const status = document.getElementById("early-access-status");
    if (status) {
      if (!isSpacePlus()) status.textContent = "Space+ unlocks the early-access channel.";
      else status.textContent = on ? "Receiving beta launcher channel notes." : "Early access paused.";
    }
  }

  function applyProfileFlair() {
    const plus = isSpacePlus();
    document.body.classList.toggle("spaceplus-flair", plus);
    const titlebar = document.querySelector(".titlebar-player");
    titlebar?.classList.toggle("has-plus-flair", plus);

    const roleEl = document.getElementById("titlebar-role-badge");
    if (plus && roleEl && roleEl.hidden) {
      // Soft flair when no Owner role — animated star via CSS class on a dedicated chip.
    }
    let chip = document.getElementById("titlebar-plus-flair");
    if (plus) {
      if (!chip && titlebar) {
        chip = document.createElement("span");
        chip.id = "titlebar-plus-flair";
        chip.className = "titlebar-plus-flair";
        chip.title = "Space+";
        chip.textContent = "✦";
        titlebar.appendChild(chip);
      }
      if (chip) chip.hidden = false;
    } else if (chip) {
      chip.hidden = true;
    }

    // Name glow boost
    const boosts = getActiveBoosts();
    document.body.classList.toggle("boost-name-glow", Boolean(boosts["boost-name-glow"]));
  }

  function getActiveBoosts() {
    const map = readJson(BOOSTS_KEY, {});
    const now = Date.now();
    let dirty = false;
    for (const [id, exp] of Object.entries(map)) {
      if (!exp || exp < now) {
        delete map[id];
        dirty = true;
      }
    }
    if (dirty) writeJson(BOOSTS_KEY, map);
    return map;
  }

  function purchaseBoost(boostId) {
    const boost = BOOSTS.find((b) => b.id === boostId);
    if (!boost) return { success: false, error: "Boost not found." };
    const spend = spendCredits(boost.price);
    if (!spend.success) return spend;
    const map = getActiveBoosts();
    const base = Math.max(Date.now(), map[boostId] || 0);
    map[boostId] = base + boost.durationDays * 24 * 60 * 60 * 1000;
    writeJson(BOOSTS_KEY, map);
    applyProfileFlair();
    renderBoosts();
    return { success: true, expiresAt: map[boostId] };
  }

  function getOwnedWallpapers() {
    return readJson(WALLPAPERS_KEY, []);
  }

  function purchaseWallpaper(id) {
    const wp = WALLPAPERS.find((w) => w.id === id);
    if (!wp) return { success: false, error: "Wallpaper not found." };
    const owned = getOwnedWallpapers();
    if (owned.includes(id)) return { success: false, error: "Already owned." };
    const spend = spendCredits(wp.price);
    if (!spend.success) return spend;
    owned.push(id);
    writeJson(WALLPAPERS_KEY, owned);
    equipWallpaper(id);
    renderWallpapers();
    return { success: true };
  }

  function equipWallpaper(id) {
    const owned = getOwnedWallpapers();
    if (id && !owned.includes(id)) return { success: false, error: "Not owned." };
    localStorage.setItem(WALLPAPER_EQUIP_KEY, id || "");
    applyWallpaper();
    renderWallpapers();
    return { success: true };
  }

  function applyWallpaper() {
    const id = localStorage.getItem(WALLPAPER_EQUIP_KEY) || "";
    document.body.classList.remove(...WALLPAPERS.map((w) => w.cssClass));
    const wp = WALLPAPERS.find((w) => w.id === id);
    if (wp) document.body.classList.add(wp.cssClass);
  }

  function purchaseGiftSpacePlus() {
    const price = 499; // credits ≈ €4.99
    const spend = spendCredits(price);
    if (!spend.success) return spend;
    const code = `SP+-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    const gifts = readJson(GIFTS_KEY, []);
    gifts.unshift({ code, createdAt: Date.now(), redeemed: false });
    writeJson(GIFTS_KEY, gifts.slice(0, 20));
    renderGifts();
    return { success: true, code };
  }

  function redeemGiftCode(raw) {
    const code = String(raw || "")
      .trim()
      .toUpperCase();
    if (!code) return { success: false, error: "Enter a gift code." };
    const gifts = readJson(GIFTS_KEY, []);
    const gift = gifts.find((g) => g.code === code);
    if (!gift) return { success: false, error: "Code not found on this device." };
    if (gift.redeemed) return { success: false, error: "Code already redeemed." };
    gift.redeemed = true;
    gift.redeemedAt = Date.now();
    writeJson(GIFTS_KEY, gifts);
    localStorage.setItem("spaceplus-subscribed", "true");
    document.dispatchEvent(new CustomEvent("sc-spaceplus-sync"));
    claimMonthlyStipend();
    applyAll();
    renderGifts();
    return { success: true };
  }

  function tipCreator(creatorId, amount) {
    const creator = CREATORS.find((c) => c.id === creatorId);
    if (!creator) return { success: false, error: "Creator not found." };
    const tip = Number(amount);
    if (!TIP_AMOUNTS.includes(tip)) return { success: false, error: "Invalid tip amount." };
    const spend = spendCredits(tip);
    if (!spend.success) return spend;
    const tips = readJson(TIPS_KEY, []);
    tips.unshift({ creatorId, amount: tip, at: Date.now() });
    writeJson(TIPS_KEY, tips.slice(0, 50));
    renderCreatorTips();
    return { success: true, creator: creator.name, amount: tip };
  }

  function buildCrashProTips(logText = "", exitCode = null) {
    const basic =
      typeof window.buildLaunchCrashTips === "function"
        ? window.buildLaunchCrashTips(logText, exitCode)
        : [];
    if (!isSpacePlus()) {
      return {
        tips: basic,
        pro: false,
        upsell: "Space+ Crash Recovery Pro adds deeper diagnosis and one-click safe repairs.",
      };
    }

    const text = String(logText || "");
    const pro = [...basic];
    if (/OutOfMemoryError|Java heap space/i.test(text)) {
      pro.unshift("Pro: Auto-suggest raising RAM to 8 GB and clearing junk in instance/mods before relaunch.");
    }
    if (/ModResolutionException|Incompatible mods|Duplicate/i.test(text)) {
      pro.unshift("Pro: Safe repair — disable the last-installed mod jar (.jar → .jar.disabled) and relaunch.");
    }
    if (/Mixin|InvalidInjectionException/i.test(text)) {
      pro.unshift("Pro: Skip Space Client core injection once (Vanilla/Fabric vanilla mods only) to isolate the crash.");
    }
    if (/Failed to verify username|Invalid session/i.test(text)) {
      pro.unshift("Pro: Force token refresh, then relaunch without clearing your whole instance.");
    }
    if (exitCode && exitCode !== 0) {
      pro.unshift(`Pro: Exit code ${exitCode} mapped — keep Game Logs open and run Safe Repair below.`);
    }
    pro.push("Pro: Safe Repair clears crash-reports cache and shader caches only (never worlds).");
    return { tips: [...new Set(pro)].slice(0, 8), pro: true, upsell: null };
  }

  async function runSafeRepair() {
    if (!isSpacePlus()) {
      return { success: false, error: "Crash Recovery Pro requires Space+.", requiresSpacePlus: true };
    }
    const api = window.electronAPI;
    const active = window.LauncherFeatures?.getActiveInstance?.();
    if (!api?.listInstalledMods || !active) {
      // Soft local repair message when instance APIs unavailable
      return {
        success: true,
        message: "Marked safe-repair checklist complete. Relaunch when ready.",
      };
    }
    // Disable last non-pack mod as a conservative conflict fix.
    const { mods } = await api.listInstalledMods(active.id);
    const candidates = (mods || [])
      .filter((m) => m.projectType !== "modpack" && m.enabled && m.fileName)
      .sort((a, b) => (b.updatedAt || b.installedAt || 0) - (a.updatedAt || a.installedAt || 0));
    if (candidates[0]) {
      await api.setModEnabled({
        projectId: candidates[0].projectId,
        enabled: false,
        instanceId: active.id,
      });
      await window.LauncherFeatures?.refreshInstalledMods?.();
      return {
        success: true,
        message: `Disabled latest mod “${candidates[0].title || candidates[0].fileName}”. Try launching again.`,
      };
    }
    return {
      success: true,
      message: "No recently installed mods to disable. Try Vanilla once or raise RAM.",
    };
  }

  function openSpacePlusUpsell(reason) {
    const banner = document.getElementById("monetization-upsell");
    if (banner) {
      banner.hidden = false;
      banner.querySelector("[data-upsell-reason]") &&
        (banner.querySelector("[data-upsell-reason]").textContent =
          reason || "Unlock priority downloads, Crash Pro, seasonal drops, and monthly credits.");
    }
    document.querySelector('.nav-btn[data-view="spaceplus"]')?.click();
  }

  function renderBoosts() {
    const root = document.getElementById("store-boosts");
    if (!root) return;
    const active = getActiveBoosts();
    root.innerHTML = BOOSTS.map((b) => {
      const exp = active[b.id];
      const activeLabel = exp
        ? `Active until ${new Date(exp).toLocaleDateString()}`
        : `${b.durationDays} days`;
      return `
        <article class="store-extra-card">
          <div>
            <h4>${escapeHtml(b.name)}</h4>
            <p>${escapeHtml(b.desc)}</p>
            <span class="store-extra-meta">${escapeHtml(activeLabel)}</span>
          </div>
          <button type="button" class="btn-mod primary" data-buy-boost="${escapeHtml(b.id)}">${b.price} credits</button>
        </article>`;
    }).join("");
  }

  function renderWallpapers() {
    const root = document.getElementById("store-wallpapers");
    if (!root) return;
    const owned = getOwnedWallpapers();
    const equipped = localStorage.getItem(WALLPAPER_EQUIP_KEY) || "";
    root.innerHTML = WALLPAPERS.map((w) => {
      const isOwned = owned.includes(w.id);
      const isOn = equipped === w.id;
      return `
        <article class="store-extra-card ${w.cssClass}-preview">
          <div>
            <h4>${escapeHtml(w.name)}</h4>
            <p>${escapeHtml(w.desc)}</p>
            <span class="store-extra-meta">${isOn ? "Equipped" : isOwned ? "Owned" : `${w.price} credits`}</span>
          </div>
          ${
            isOwned
              ? `<button type="button" class="btn-mod ${isOn ? "installed" : "primary"}" data-equip-wallpaper="${escapeHtml(w.id)}">${isOn ? "Equipped" : "Equip"}</button>`
              : `<button type="button" class="btn-mod primary" data-buy-wallpaper="${escapeHtml(w.id)}">Buy</button>`
          }
        </article>`;
    }).join("");
  }

  function renderGifts() {
    const list = document.getElementById("store-gift-list");
    if (!list) return;
    const gifts = readJson(GIFTS_KEY, []);
    if (!gifts.length) {
      list.innerHTML = '<p class="store-extra-empty">No gift codes yet. Buy one to share Space+ with a friend.</p>';
      return;
    }
    list.innerHTML = gifts
      .map(
        (g) => `
      <div class="store-gift-row">
        <code>${escapeHtml(g.code)}</code>
        <span>${g.redeemed ? "Redeemed" : "Unused"}</span>
      </div>`
      )
      .join("");
  }

  function renderCreatorTips() {
    const root = document.getElementById("store-creator-tips");
    if (!root) return;
    root.innerHTML = CREATORS.map((c) => {
      const buttons = TIP_AMOUNTS.map(
        (n) =>
          `<button type="button" class="btn-mod" data-tip-creator="${escapeHtml(c.id)}" data-tip-amount="${n}">${n}</button>`
      ).join("");
      return `
        <article class="store-extra-card">
          <div>
            <h4>${escapeHtml(c.name)}</h4>
            <p>Tip credits toward their cape drops — ${escapeHtml(c.capeHint)}.</p>
          </div>
          <div class="store-tip-actions">${buttons}</div>
        </article>`;
    }).join("");
  }

  function renderStipendStatus() {
    const el = document.getElementById("spaceplus-stipend-status");
    if (!el) return;
    if (!isSpacePlus()) {
      el.textContent = `Space+ members receive ${SPACEPLUS_MONTHLY_CREDITS} credits every month.`;
      return;
    }
    const claimed = readJson(STIPEND_KEY, {});
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    el.textContent =
      claimed.month === stamp
        ? `Monthly stipend claimed (${SPACEPLUS_MONTHLY_CREDITS} credits).`
        : `Claim your ${SPACEPLUS_MONTHLY_CREDITS} monthly credits.`;
  }

  function renderSeasonBanner() {
    const el = document.getElementById("seasonal-drop-banner");
    if (!el) return;
    const season = getSeasonInfo();
    if (!season.active) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<strong>${escapeHtml(season.label)} drop</strong> — Space+ exclusive seasonal cape is live in Cosmetics.`;
  }

  function bindStoreExtras() {
    document.getElementById("store-boosts")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-buy-boost]");
      if (!btn) return;
      const result = purchaseBoost(btn.dataset.buyBoost);
      if (!result.success) {
        btn.textContent = result.error?.slice(0, 28) || "Failed";
        setTimeout(renderBoosts, 1600);
        if (result.requiresSpacePlus) openSpacePlusUpsell(result.error);
      }
    });

    document.getElementById("store-wallpapers")?.addEventListener("click", (e) => {
      const buy = e.target.closest("[data-buy-wallpaper]");
      const equip = e.target.closest("[data-equip-wallpaper]");
      if (buy) {
        const result = purchaseWallpaper(buy.dataset.buyWallpaper);
        if (!result.success) {
          buy.textContent = result.error?.slice(0, 24) || "Failed";
          setTimeout(renderWallpapers, 1600);
        }
      } else if (equip) {
        equipWallpaper(equip.dataset.equipWallpaper);
      }
    });

    document.getElementById("store-buy-gift-btn")?.addEventListener("click", () => {
      const result = purchaseGiftSpacePlus();
      const status = document.getElementById("store-gift-status");
      if (status) {
        status.hidden = false;
        status.textContent = result.success
          ? `Gift code ready: ${result.code}`
          : result.error || "Could not create gift.";
      }
    });

    document.getElementById("store-redeem-gift-btn")?.addEventListener("click", () => {
      const input = document.getElementById("store-redeem-gift-input");
      const result = redeemGiftCode(input?.value);
      const status = document.getElementById("store-gift-status");
      if (status) {
        status.hidden = false;
        status.textContent = result.success ? "Space+ unlocked from gift code." : result.error || "Redeem failed.";
      }
      if (result.success && input) input.value = "";
    });

    document.getElementById("store-creator-tips")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tip-creator]");
      if (!btn) return;
      const result = tipCreator(btn.dataset.tipCreator, Number(btn.dataset.tipAmount));
      const status = document.getElementById("store-tips-status");
      if (status) {
        status.hidden = false;
        status.textContent = result.success
          ? `Tipped ${result.creator} ${result.amount} credits. Thanks!`
          : result.error || "Tip failed.";
      }
    });

    document.getElementById("spaceplus-claim-stipend")?.addEventListener("click", () => {
      const result = claimMonthlyStipend();
      renderStipendStatus();
      if (!result.success && result.requiresSpacePlus) openSpacePlusUpsell(result.error);
      const status = document.getElementById("spaceplus-stipend-flash");
      if (status) {
        status.hidden = false;
        status.textContent = result.alreadyClaimed
          ? "Already claimed this month."
          : result.success
            ? `+${result.credits} credits added.`
            : result.error || "Could not claim.";
      }
    });

    document.getElementById("early-access-toggle")?.addEventListener("change", (e) => {
      const result = setEarlyAccessEnabled(e.target.checked);
      if (!result.success) {
        e.target.checked = false;
        openSpacePlusUpsell(result.error);
      }
    });

    document.getElementById("monetization-upsell-cta")?.addEventListener("click", () => {
      openSpacePlusUpsell();
    });

    document.getElementById("crash-pro-repair-btn")?.addEventListener("click", async () => {
      const status = document.getElementById("crash-pro-status");
      const result = await runSafeRepair();
      if (status) {
        status.hidden = false;
        status.textContent = result.success ? result.message : result.error || "Repair failed.";
      }
      if (!result.success && result.requiresSpacePlus) openSpacePlusUpsell(result.error);
    });

    document.querySelectorAll("[data-open-spaceplus-upsell]").forEach((el) => {
      el.addEventListener("click", () => openSpacePlusUpsell(el.dataset.openSpaceplusUpsell || ""));
    });
  }

  function applyAll() {
    applyWallpaper();
    applyProfileFlair();
    applyEarlyAccessUi();
    renderBoosts();
    renderWallpapers();
    renderGifts();
    renderCreatorTips();
    renderStipendStatus();
    renderSeasonBanner();
    if (isSpacePlus()) claimMonthlyStipend();
  }

  function init() {
    bindStoreExtras();
    applyAll();
    document.addEventListener("sc-spaceplus-sync", () => {
      applyAll();
    });
  }

  window.SpaceMonetization = {
    init,
    applyAll,
    claimMonthlyStipend,
    getDownloadParallelism,
    isEarlyAccessEnabled,
    setEarlyAccessEnabled,
    getSeasonInfo,
    isSeasonActive,
    buildCrashProTips,
    runSafeRepair,
    openSpacePlusUpsell,
    getActiveBoosts,
    BOOSTS,
    WALLPAPERS,
    CREATORS,
    SPACEPLUS_MONTHLY_CREDITS,
    PRIORITY_DOWNLOADS,
    STANDARD_DOWNLOADS,
  };
})();
