/**
 * Space Client — Interactive GUI layer
 * Parallax sky, toasts, command palette, home hub, view polish.
 */
(function () {
  "use strict";

  const ACTIVITY_KEY = "sc-activity-log";
  const MAX_ACTIVITY = 12;

  const QUICK_ACTIONS = [
    { view: "friends", label: "Friends", hint: "Chat & join" },
    { view: "mods", label: "Mods", hint: "Browse Modrinth" },
    { view: "cosmetics", label: "Cosmetics", hint: "Capes & pets" },
    { view: "store", label: "Store", hint: "Buy credits" },
  ];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function ensureToastHost() {
    let host = document.getElementById("sc-toast-host");
    if (host) return host;
    host = document.createElement("div");
    host.id = "sc-toast-host";
    host.className = "sc-toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
    return host;
  }

  function showToast(message, opts = {}) {
    const host = ensureToastHost();
    const toast = document.createElement("div");
    toast.className = `sc-toast sc-toast-${opts.tone || "info"}`;
    toast.innerHTML = `
      <span class="sc-toast-msg">${escapeHtml(message)}</span>
      ${opts.actionLabel ? `<button type="button" class="sc-toast-action">${escapeHtml(opts.actionLabel)}</button>` : ""}
    `;
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-in"));

    const dismiss = () => {
      toast.classList.remove("is-in");
      toast.classList.add("is-out");
      setTimeout(() => toast.remove(), 280);
    };

    const actionBtn = toast.querySelector(".sc-toast-action");
    if (actionBtn && typeof opts.onAction === "function") {
      actionBtn.addEventListener("click", () => {
        opts.onAction();
        dismiss();
      });
    }

    setTimeout(dismiss, opts.duration || 4200);
    return dismiss;
  }

  function loadActivity() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function pushActivity(entry) {
    const list = loadActivity();
    list.unshift({
      id: `act-${Date.now()}`,
      at: new Date().toISOString(),
      ...entry,
    });
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(list.slice(0, MAX_ACTIVITY)));
    renderActivity();
  }

  function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function renderActivity() {
    const root = document.getElementById("home-activity-list");
    if (!root) return;
    const list = loadActivity();
    if (!list.length) {
      root.innerHTML = `<p class="home-activity-empty">Launch, chat, and browse — your activity will show up here.</p>`;
      return;
    }
    root.innerHTML = list
      .map(
        (item) => `
      <article class="home-activity-item">
        <span class="home-activity-dot" data-kind="${escapeHtml(item.kind || "info")}"></span>
        <div>
          <p class="home-activity-text">${escapeHtml(item.text)}</p>
          <time class="home-activity-time">${escapeHtml(relativeTime(item.at))}</time>
        </div>
      </article>`
      )
      .join("");
  }

  function renderQuickActions() {
    const root = document.getElementById("home-quick-actions");
    if (!root) return;
    root.innerHTML = QUICK_ACTIONS.map(
      (a) => `
      <button type="button" class="home-quick-btn" data-nav="${escapeHtml(a.view)}">
        <span class="home-quick-label">${escapeHtml(a.label)}</span>
        <span class="home-quick-hint">${escapeHtml(a.hint)}</span>
      </button>`
    ).join("");

    root.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-nav");
        if (typeof window.navigateToView === "function") {
          window.navigateToView(view);
        } else {
          document.querySelector(`.nav-btn[data-view="${view}"]`)?.click();
        }
        pushActivity({ kind: "nav", text: `Opened ${btn.querySelector(".home-quick-label")?.textContent || view}` });
      });
    });
  }

  function renderOnlineFriendsStrip() {
    const root = document.getElementById("home-friends-strip");
    if (!root) return;

    const friends =
      typeof window.SpaceSocial?.getOnlineFriends === "function"
        ? window.SpaceSocial.getOnlineFriends()
        : [];

    if (!friends.length) {
      root.innerHTML = `
        <button type="button" class="home-friends-empty" data-nav="friends">
          No friends online — open Friends to add someone
        </button>`;
      root.querySelector("[data-nav]")?.addEventListener("click", () => {
        document.querySelector('.nav-btn[data-view="friends"]')?.click();
      });
      return;
    }

    root.innerHTML = `
      <div class="home-friends-row">
        ${friends
          .slice(0, 8)
          .map(
            (f) => `
          <button type="button" class="home-friend-chip" data-friend-id="${escapeHtml(f.id)}" title="${escapeHtml(f.detail || f.username)}">
            <img src="https://mc-heads.net/avatar/${encodeURIComponent(f.username)}/40" alt="" width="32" height="32" loading="lazy" />
            <span class="home-friend-presence presence-${escapeHtml(f.presence)}"></span>
            <span class="home-friend-name">${escapeHtml(f.username)}</span>
          </button>`
          )
          .join("")}
        <button type="button" class="home-friends-more" data-nav="friends">All friends</button>
      </div>`;

    root.querySelectorAll("[data-friend-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-friend-id");
        document.querySelector('.nav-btn[data-view="friends"]')?.click();
        window.SpaceSocial?.selectFriend?.(id);
      });
    });
    root.querySelector("[data-nav]")?.addEventListener("click", () => {
      document.querySelector('.nav-btn[data-view="friends"]')?.click();
    });
  }

  function initParallax() {
    const sky = document.querySelector(".sky-bg");
    const hero = document.querySelector(".hero");
    if (!sky) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;

    const tick = () => {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      sky.style.transform = `translate3d(${curX * 12}px, ${curY * 8}px, 0) scale(1.04)`;
      if (hero) {
        hero.style.setProperty("--hero-shift-x", `${curX * 6}px`);
        hero.style.setProperty("--hero-shift-y", `${curY * 4}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const panel = document.querySelector(".main-panel");
    panel?.addEventListener("pointermove", (e) => {
      const rect = panel.getBoundingClientRect();
      targetX = (e.clientX - rect.left) / rect.width - 0.5;
      targetY = (e.clientY - rect.top) / rect.height - 0.5;
    });
    panel?.addEventListener("pointerleave", () => {
      targetX = 0;
      targetY = 0;
    });

    window.addEventListener("beforeunload", () => cancelAnimationFrame(raf));
  }

  function initMagneticPlay() {
    const btn = document.querySelector(".btn-play");
    if (!btn) return;
    btn.addEventListener("pointermove", (e) => {
      if (btn.disabled) return;
      const rect = btn.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 10;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 6;
      btn.style.transform = `translate(${x}px, ${y}px) scale(1.03)`;
    });
    btn.addEventListener("pointerleave", () => {
      btn.style.transform = "";
    });
  }

  function initCommandPalette() {
    const existing = document.getElementById("sc-cmd-overlay");
    if (existing) return;

    const overlay = document.createElement("div");
    overlay.id = "sc-cmd-overlay";
    overlay.className = "sc-cmd-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <button type="button" class="sc-cmd-veil" aria-label="Close"></button>
      <div class="sc-cmd-panel" role="dialog" aria-modal="true" aria-label="Quick navigate">
        <input type="search" class="sc-cmd-input" id="sc-cmd-input" placeholder="Jump to… friends, mods, settings" autocomplete="off" />
        <div class="sc-cmd-list" id="sc-cmd-list" role="listbox"></div>
        <p class="sc-cmd-hint">Press <kbd>Esc</kbd> to close · <kbd>Ctrl</kbd>+<kbd>K</kbd> to open</p>
      </div>`;
    document.body.appendChild(overlay);

    const views = [
      { id: "home", label: "Home", hint: "Launch & news" },
      { id: "mods", label: "Mod Library", hint: "Modrinth browse" },
      { id: "cosmetics", label: "Cosmetics", hint: "Capes & pets" },
      { id: "friends", label: "Friends", hint: "Social & DMs" },
      { id: "assistant", label: "Space AI", hint: "Ask for help" },
      { id: "settings", label: "Settings", hint: "Preferences" },
      { id: "spaceplus", label: "Space+", hint: "Premium perks" },
      { id: "store", label: "Store", hint: "Credits" },
      { id: "account", label: "Account", hint: "Microsoft sign-in" },
    ];

    const input = overlay.querySelector("#sc-cmd-input");
    const list = overlay.querySelector("#sc-cmd-list");
    let activeIndex = 0;
    let filtered = views;

    function renderList() {
      const q = (input.value || "").trim().toLowerCase();
      filtered = views.filter((v) => !q || v.label.toLowerCase().includes(q) || v.id.includes(q) || v.hint.toLowerCase().includes(q));
      activeIndex = 0;
      list.innerHTML = filtered.length
        ? filtered
            .map(
              (v, i) => `
          <button type="button" class="sc-cmd-item${i === 0 ? " is-active" : ""}" data-view="${escapeHtml(v.id)}" role="option" aria-selected="${i === 0}">
            <span>${escapeHtml(v.label)}</span>
            <span class="sc-cmd-item-hint">${escapeHtml(v.hint)}</span>
          </button>`
            )
            .join("")
        : `<p class="sc-cmd-empty">No matches</p>`;
    }

    function open() {
      overlay.hidden = false;
      input.value = "";
      renderList();
      setTimeout(() => input.focus(), 40);
    }

    function close() {
      overlay.hidden = true;
    }

    function go(viewId) {
      close();
      if (typeof window.navigateToView === "function") window.navigateToView(viewId);
      else document.querySelector(`.nav-btn[data-view="${viewId}"]`)?.click();
      pushActivity({ kind: "nav", text: `Jumped to ${viewId}` });
    }

    overlay.querySelector(".sc-cmd-veil")?.addEventListener("click", close);
    input.addEventListener("input", renderList);
    list.addEventListener("click", (e) => {
      const item = e.target.closest("[data-view]");
      if (item) go(item.getAttribute("data-view"));
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
        list.querySelectorAll(".sc-cmd-item").forEach((el, i) => el.classList.toggle("is-active", i === activeIndex));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        list.querySelectorAll(".sc-cmd-item").forEach((el, i) => el.classList.toggle("is-active", i === activeIndex));
      } else if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        go(filtered[activeIndex].id);
      }
    });

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (overlay.hidden) open();
        else close();
      }
      if (e.key === "Escape" && !overlay.hidden) close();
    });

    window.SpaceGUI = window.SpaceGUI || {};
    window.SpaceGUI.openCommandPalette = open;
  }

  function enhanceNavTransitions() {
    const views = document.querySelectorAll(".view");
    views.forEach((v) => v.classList.add("view-interactive"));

    document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.remove("nav-pulse");
        void btn.offsetWidth;
        btn.classList.add("nav-pulse");
      });
    });
  }

  function initInteractiveGui() {
    renderQuickActions();
    renderActivity();
    renderOnlineFriendsStrip();
    initParallax();
    initMagneticPlay();
    initCommandPalette();
    enhanceNavTransitions();

    // Seed a welcome activity once
    if (!loadActivity().length) {
      pushActivity({ kind: "info", text: "Welcome to Space Client — press Ctrl+K to quick-navigate" });
    }

    window.addEventListener("space-friends-updated", () => {
      renderOnlineFriendsStrip();
    });
  }

  window.SpaceGUI = {
    showToast,
    pushActivity,
    refreshHomeFriends: renderOnlineFriendsStrip,
    refreshActivity: renderActivity,
  };

  window.initInteractiveGui = initInteractiveGui;
})();
