/**
 * Space Client — Space AI assistant panel
 * Local mock replies + IPC-ready hooks (window.SpaceAssistant).
 */
(function () {
  "use strict";

  /** @type {Array<{ id: string, role: "user"|"assistant", text: string }>} */
  let messages = [];

  window.SpaceAssistant = {
    /**
     * Wire to Node/socket backend later.
     * @param {{ text: string, history: typeof messages }} payload
     * @returns {Promise<string>|string}
     */
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
    if (q.includes("cape")) {
      return "Open Cosmetics → Capes, equip one you own, then hit PLAY. Space Client stages the texture into your game folder automatically.";
    }
    if (q.includes("fps") || q.includes("hypixel")) {
      return "For Hypixel: turn on FPS Boost in ClickGUI (Right Shift), lower particles, disable clouds, and keep Java allocation at 4–6 GB. Unfocused FPS helps when alt-tabbed.";
    }
    if (q.includes("space+") || q.includes("space plus")) {
      return "Space+ unlocks exclusive cosmetics (Plus Sigil, Member Orbit, Priority Flare) and premium perks. Open the Space+ tab in the sidebar to subscribe.";
    }
    if (q.includes("friend") || q.includes("social")) {
      return "Friends live in the Friends tab — search, DM, and Quick Join when they're on a public server. Add Friend sends a username request (socket wiring coming soon).";
    }
    if (q.includes("mod")) {
      return "Browse Modrinth from the Mod Library tab. Space Client injects its own core + Fabric API from natives — keep Fabric selected on Home.";
    }
    return "I'm Space AI — ask about capes, mods, Space+, FPS, or friends. Full backend wiring will replace these local tips soon.";
  }

  function render() {
    const root = document.getElementById("assistant-messages");
    if (!root) return;

    if (!messages.length) {
      root.innerHTML = `
        <div class="assistant-welcome">
          <div class="assistant-welcome-orb" aria-hidden="true">✦</div>
          <h3>Space AI</h3>
          <p>Ask anything about Space Client — launch, cosmetics, mods, or social.</p>
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

    const reply = await window.SpaceAssistant.onSendPrompt({
      text: clean,
      history: messages.slice(),
    });

    messages.push({
      id: `a-${Date.now()}`,
      role: "assistant",
      text: String(reply || "…"),
    });
    render();
  }

  function initAssistant() {
    if (!document.getElementById("view-assistant")) return;

    render();

    document.getElementById("assistant-compose")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("assistant-input");
      if (!input) return;
      const value = input.value;
      input.value = "";
      send(value);
    });

    document.getElementById("assistant-clear")?.addEventListener("click", () => {
      messages = [];
      render();
    });

    document.querySelectorAll("#assistant-suggestions [data-prompt]").forEach((btn) => {
      btn.addEventListener("click", () => send(btn.getAttribute("data-prompt")));
    });
  }

  window.initAssistant = initAssistant;
})();
