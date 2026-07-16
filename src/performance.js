/**
 * Space Launcher — Performance pack presets UI.
 */
(function () {
  "use strict";

  const PERF_KEY = "sl-perf-pack";
  const SPACEPLUS_SUB_KEY = "spaceplus-subscribed";

  const PACKS = [
    {
      id: "off",
      label: "Vanilla Fabric",
      desc: "Fabric loader + API only. No performance jars.",
      chips: ["Fabric API"],
      spacePlusOnly: false,
    },
    {
      id: "lite",
      label: "Lite Boost",
      desc: "Ideal for low-end PCs — Sodium rendering, Lithium tick, FerriteCore memory.",
      chips: ["Sodium", "Lithium", "FerriteCore"],
      spacePlusOnly: false,
    },
    {
      id: "standard",
      label: "Standard Boost",
      desc: "Balanced pack for most PCs — Lite plus culling and UI speedups.",
      chips: ["Sodium", "Lithium", "FerriteCore", "Entity Culling", "ImmediatelyFast"],
      spacePlusOnly: false,
    },
    {
      id: "max",
      label: "Max Boost",
      desc: "Full optimization stack for max FPS. Exclusive to Space+.",
      chips: ["Standard stack", "MoreCulling", "ModernFix"],
      spacePlusOnly: true,
    },
  ];

  function isSpacePlus() {
    if (typeof window.isSpacePlusActive === "function") return window.isSpacePlusActive();
    return localStorage.getItem(SPACEPLUS_SUB_KEY) === "true";
  }

  function getPack() {
    const id = localStorage.getItem(PERF_KEY) || "standard";
    return PACKS.some((p) => p.id === id) ? id : "standard";
  }

  function setPack(id) {
    localStorage.setItem(PERF_KEY, id);
    render();
    window.SpaceGUI?.showToast?.(`Performance pack: ${PACKS.find((p) => p.id === id)?.label || id}`, {
      tone: "ok",
      duration: 2200,
    });
    window.SpaceGUI?.pushActivity?.({ kind: "launch", text: `Selected performance pack: ${id}` });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    const root = document.getElementById("perf-packs-grid");
    const active = document.getElementById("perf-active-label");
    if (!root) return;
    const current = getPack();
    if (active) {
      const pack = PACKS.find((p) => p.id === current);
      active.textContent = pack ? pack.label : current;
    }

    root.innerHTML = PACKS.map((pack) => {
      const locked = pack.spacePlusOnly && !isSpacePlus();
      const selected = pack.id === current;
      return `
        <article class="perf-card ${selected ? "is-selected" : ""} ${locked ? "is-locked" : ""}" data-perf-pack="${escapeHtml(pack.id)}">
          <div class="perf-card-top">
            <h3 class="perf-card-title">${escapeHtml(pack.label)}</h3>
            ${pack.spacePlusOnly ? '<span class="perf-plus-flag">Space+</span>' : ""}
            ${selected ? '<span class="perf-selected-flag">Active</span>' : ""}
          </div>
          <p class="perf-card-desc">${escapeHtml(pack.desc)}</p>
          <div class="perf-chips">${pack.chips.map((c) => `<span class="perf-chip">${escapeHtml(c)}</span>`).join("")}</div>
          <button type="button" class="perf-card-btn" data-select-pack="${escapeHtml(pack.id)}" ${locked ? "disabled" : ""}>
            ${locked ? "Requires Space+" : selected ? "Selected" : "Use this pack"}
          </button>
        </article>`;
    }).join("");

    root.querySelectorAll("[data-select-pack]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-select-pack");
        const pack = PACKS.find((p) => p.id === id);
        if (!pack) return;
        if (pack.spacePlusOnly && !isSpacePlus()) {
          window.navigateToView?.("spaceplus");
          return;
        }
        setPack(id);
      });
    });
  }

  function initPerformancePresets() {
    if (!document.getElementById("view-presets")) return;
    render();
    window.addEventListener("space-entitlements-changed", render);
  }

  window.SpacePerformance = {
    getPack,
    setPack,
    packs: PACKS,
  };
  window.initPerformancePresets = initPerformancePresets;
})();
