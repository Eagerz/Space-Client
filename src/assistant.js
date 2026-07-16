/**
 * Space Launcher — Space AI assistant panel
 * Local mock replies + IPC-ready hooks (window.SpaceAssistant).
 */
(function () {
  "use strict";

  /** @type {Array<{ id: string, role: "user"|"assistant", text: string }>} */
  let messages = [];

  window.SpaceAssistant = {
    async onSendPrompt(payload) {
      console.info("[SpaceAssistant] onSendPrompt", payload);
      return mockReply(payload.text);
    },
  };

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mockReply(text) {
    const q = String(text).toLowerCase();
    if (q.includes("cosmetic") || q.includes("badge") || q.includes("frame") || q.includes("theme") || q.includes("cape")) {
      return "Open Cosmetics to equip badges, frames, and launcher themes. Space+ unlocks exclusive flair. These show in Space Launcher — there is no Right Shift / ClickGUI anymore.";
    }
    if (q.includes("fps") || q.includes("boost") || q.includes("performance") || q.includes("hypixel")) {
      return "Open Performance in the sidebar and pick Lite Boost (low-end) or Standard Boost. Space+ unlocks Max Boost. Jars inject at launch via Fabric — nothing goes into .minecraft/mods.";
    }
    if (q.includes("space+") || q.includes("space plus")) {
      return "Space+ unlocks Max Boost, exclusive profile cosmetics, ad-free browsing, and early launcher betas. Open the Space+ tab to join.";
    }
    if (q.includes("friend") || q.includes("social")) {
      return "Friends live in the Friends tab — search, DM, and Quick Join when they're on a public server.";
    }
    if (q.includes("mod")) {
      return "Browse Modrinth from Mod Library. For FPS, use Performance packs — Space Launcher injects Sodium-stack jars automatically when you hit PLAY with Fabric selected.";
    }
    return "I'm Space AI — ask about performance packs, cosmetics, Space+, mods, or friends.";
  }

  function render() {
    const root = document.getElementById("assistant-messages");
    if (!root) return;

    if (!messages.length) {
      root.innerHTML = `
        <div class="assistant-welcome">
          <div class="assistant-welcome-orb" aria-hidden="true">✦</div>
          <h3>Space AI</h3>
          <p>Ask anything about Space Launcher — performance, cosmetics, mods, or social.</p>
        </div>`;
      return;
    }

    root.innerHTML = messages
      .map(
        (m) => `
      <div class="assistant-bubble assistant-bubble-${m.role}">
        <p>${escapeHtml(m.text)}</p>
      </div>`
      )
      .join("");
    root.scrollTop = root.scrollHeight;
  }

  async function send(text) {
    const clean = String(text || "").trim();
    if (!clean) return;

    messages.push({ id: `u-${Date.now()}`, role: "user", text: clean });
    render();

    const reply = await window.SpaceAssistant.onSendPrompt({ text: clean, history: messages.slice() });
    messages.push({ id: `a-${Date.now()}`, role: "assistant", text: String(reply || "") });
    render();
  }

  function initAssistant() {
    if (!document.getElementById("view-assistant")) return;
    render();

    document.getElementById("assistant-compose")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("assistant-input");
      if (!input) return;
      send(input.value);
      input.value = "";
    });

    document.getElementById("assistant-clear")?.addEventListener("click", () => {
      messages = [];
      render();
    });

    document.getElementById("assistant-suggestions")?.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-prompt]");
      if (!chip) return;
      send(chip.getAttribute("data-prompt"));
    });
  }

  window.initAssistant = initAssistant;
})();
