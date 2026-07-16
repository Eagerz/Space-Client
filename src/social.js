/**
 * Space Client — Friends & Social panel
 * Mock-backed UI with IPC-ready callbacks (window.SpaceSocial).
 */
(function () {
  "use strict";

  const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

  /** @typedef {"online"|"ingame"|"offline"} FriendPresence */

  /**
   * @type {Array<{
   *   id: string,
   *   username: string,
   *   presence: FriendPresence,
   *   detail: string,
   *   lastSeen?: string,
   *   server?: string|null,
   *   messages: Array<{ id: string, from: "me"|"them", text: string, at: string }>
   * }>}
   */
  const MOCK_FRIENDS = [
    {
      id: "f1",
      username: "NovaPulse",
      presence: "ingame",
      detail: "Playing Hypixel (Bedwars)",
      server: "mc.hypixel.net",
      spacePlus: true,
      messages: [
        { id: "m1", from: "them", text: "queue up for bedwars?", at: "18:02" },
        { id: "m2", from: "me", text: "one sec — launching Space", at: "18:03" },
        { id: "m3", from: "them", text: "lobby 3 when you're in", at: "18:03" },
      ],
    },
    {
      id: "f2",
      username: "OrbitKid",
      presence: "online",
      detail: "Online in launcher",
      server: null,
      spacePlus: false,
      messages: [
        { id: "m1", from: "me", text: "you see the new cape shop?", at: "12:10" },
        { id: "m2", from: "them", text: "yeah Event Horizon looks insane", at: "12:12" },
      ],
    },
    {
      id: "f3",
      username: "SilverDrift",
      presence: "online",
      detail: "Idle",
      server: null,
      spacePlus: true,
      messages: [
        { id: "m1", from: "them", text: "WANNA duel on mineplex later", at: "09:40" },
        { id: "m2", from: "me", text: "after this ranked game", at: "09:41" },
      ],
    },
    {
      id: "f4",
      username: "EchoVoxel",
      presence: "ingame",
      detail: "Playing on play.cubecraft.net",
      server: "play.cubecraft.net",
      spacePlus: false,
      messages: [
        { id: "m1", from: "them", text: "skywars is cracked today", at: "17:55" },
      ],
    },
    {
      id: "f5",
      username: "QuietStar",
      presence: "offline",
      detail: "Offline — 3h ago",
      lastSeen: "3h ago",
      server: null,
      spacePlus: false,
      messages: [
        { id: "m1", from: "me", text: "gn — cubecraft tomorrow?", at: "Yesterday" },
        { id: "m2", from: "them", text: "bet", at: "Yesterday" },
      ],
    },
    {
      id: "f6",
      username: "AshComet",
      presence: "offline",
      detail: "Offline — 2d ago",
      lastSeen: "2d ago",
      server: null,
      spacePlus: true,
      messages: [
        { id: "m1", from: "them", text: "got Space+ yet?", at: "Mon" },
        { id: "m2", from: "me", text: "yep — exclusive capes unlocked", at: "Mon" },
      ],
    },
  ];

  const state = {
    friends: MOCK_FRIENDS.map((f) => structuredClone(f)),
    activeId: null,
    query: "",
  };

  /** IPC-ready hooks — replace bodies when the socket server is live. */
  window.SpaceSocial = {
    onSendMessage(payload) {
      console.info("[SpaceSocial] onSendMessage", payload);
    },
    onSendFriendRequest(payload) {
      console.info("[SpaceSocial] onSendFriendRequest", payload);
    },
    onQuickJoin(payload) {
      console.info("[SpaceSocial] onQuickJoin", payload);
    },
    onSelectFriend(payload) {
      console.info("[SpaceSocial] onSelectFriend", payload);
    },
  };

  function avatarUrl(username) {
    return `https://mc-heads.net/avatar/${encodeURIComponent(username)}/64`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function filteredFriends() {
    const q = state.query.trim().toLowerCase();
    return state.friends.filter((f) => !q || f.username.toLowerCase().includes(q));
  }

  function renderFriendsList() {
    const root = document.getElementById("social-friends-list");
    if (!root) return;

    const list = filteredFriends();
    const online = list.filter((f) => f.presence !== "offline");
    const offline = list.filter((f) => f.presence === "offline");

    const section = (title, friends) => {
      if (!friends.length) return "";
      return `
        <div class="social-section-label">${escapeHtml(title)}</div>
        ${friends.map((f) => friendCard(f)).join("")}
      `;
    };

    root.innerHTML =
      section(`Online — ${online.length}`, online) +
      section(`Offline — ${offline.length}`, offline);
    if (!root.innerHTML.trim()) {
      root.innerHTML = `<p class="social-list-empty">No friends match.</p>`;
    }

    root.querySelectorAll("[data-friend-id]").forEach((el) => {
      el.addEventListener("click", () => selectFriend(el.getAttribute("data-friend-id")));
    });
  }

  function friendCard(f) {
    const active = f.id === state.activeId ? " is-active" : "";
    const muted = f.presence === "offline" ? " is-offline" : "";
    const star =
      f.presence === "ingame"
        ? `<span class="social-space-star" title="Online on Space Client" aria-label="Online on Space Client">✦</span>`
        : "";
    const plusFlair = f.spacePlus
      ? `<span class="social-plus-flair" title="Space+" aria-label="Space+ member">+</span>`
      : "";
    return `
      <button type="button" class="social-friend-card${active}${muted}${f.spacePlus ? " has-plus-flair" : ""}" data-friend-id="${escapeHtml(f.id)}" role="listitem">
        <div class="social-avatar-wrap">
          <img src="${avatarUrl(f.username)}" alt="" width="36" height="36" loading="lazy" />
          <span class="social-presence presence-${escapeHtml(f.presence)}"></span>
        </div>
        <div class="social-friend-meta">
          <div class="social-friend-name-row">
            <span class="social-friend-name">${escapeHtml(f.username)}</span>
            ${plusFlair}
            ${star}
          </div>
          <span class="social-friend-detail">${escapeHtml(f.detail)}</span>
        </div>
      </button>
    `;
  }

  function selectFriend(id) {
    const friend = state.friends.find((f) => f.id === id);
    if (!friend) return;
    state.activeId = id;
    window.SpaceSocial.onSelectFriend({ friendId: id, username: friend.username });
    renderFriendsList();
    showChat(friend, true);
  }

  function showChat(friend, animate) {
    const empty = document.getElementById("social-empty");
    const chat = document.getElementById("social-chat");
    if (!empty || !chat) return;

    empty.hidden = true;
    chat.hidden = false;

    const avatar = document.getElementById("social-chat-avatar");
    const name = document.getElementById("social-chat-name");
    const status = document.getElementById("social-chat-status");
    const presence = document.getElementById("social-chat-presence");
    const star = document.getElementById("social-chat-star");
    const join = document.getElementById("social-quick-join");
    const feed = document.getElementById("social-messages");

    if (avatar) {
      avatar.src = avatarUrl(friend.username);
      avatar.alt = friend.username;
    }
    if (name) name.textContent = friend.username;
    if (status) {
      status.textContent = friend.detail;
      status.classList.toggle("is-live", friend.presence !== "offline");
    }
    if (presence) {
      presence.className = `social-presence presence-${friend.presence}`;
    }
    if (star) star.hidden = friend.presence !== "ingame";
    if (join) {
      const canJoin = Boolean(friend.server) && friend.presence === "ingame";
      join.hidden = !canJoin;
      join.onclick = () => {
        window.SpaceSocial.onQuickJoin({
          friendId: friend.id,
          username: friend.username,
          server: friend.server,
        });
      };
    }

    if (feed) {
      feed.classList.remove("social-messages-enter");
      // Force reflow for chat switch animation
      void feed.offsetWidth;
      feed.innerHTML = friend.messages
        .map(
          (m) => `
        <div class="social-bubble social-bubble-${m.from}">
          <p>${escapeHtml(m.text)}</p>
          <time>${escapeHtml(m.at)}</time>
        </div>`
        )
        .join("");
      if (animate) {
        feed.classList.add("social-messages-enter");
        feed.style.setProperty("--social-ease", EASE);
      }
      feed.scrollTop = feed.scrollHeight;
    }
  }

  function sendMessage(text) {
    const friend = state.friends.find((f) => f.id === state.activeId);
    if (!friend || !text.trim()) return;

    const msg = {
      id: `local-${Date.now()}`,
      from: "me",
      text: text.trim(),
      at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    friend.messages.push(msg);
    window.SpaceSocial.onSendMessage({
      friendId: friend.id,
      username: friend.username,
      text: msg.text,
    });
    showChat(friend, false);
  }

  function openAddPanel(open) {
    const overlay = document.getElementById("social-add-overlay");
    if (!overlay) return;
    overlay.hidden = !open;
    if (open) {
      const input = document.getElementById("social-add-username");
      if (input) {
        input.value = "";
        setTimeout(() => input.focus(), 80);
      }
      const feedback = document.getElementById("social-add-feedback");
      if (feedback) feedback.textContent = "";
    }
  }

  function submitFriendRequest(username) {
    const clean = String(username || "").trim();
    const feedback = document.getElementById("social-add-feedback");
    if (!/^[A-Za-z0-9_]{3,16}$/.test(clean)) {
      if (feedback) feedback.textContent = "Enter a valid Minecraft username (3–16 chars).";
      return;
    }
    window.SpaceSocial.onSendFriendRequest({ username: clean });
    if (feedback) feedback.textContent = `Request sent to ${clean}.`;
    const btn = document.getElementById("social-add-submit");
    if (btn) {
      btn.classList.remove("is-rippling");
      void btn.offsetWidth;
      btn.classList.add("is-rippling");
    }
    setTimeout(() => openAddPanel(false), 900);
  }

  function initSocial() {
    if (!document.getElementById("view-friends")) return;

    renderFriendsList();

    const search = document.getElementById("social-search");
    if (search) {
      search.addEventListener("input", () => {
        state.query = search.value;
        renderFriendsList();
      });
    }

    const compose = document.getElementById("social-compose");
    if (compose) {
      compose.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("social-compose-input");
        if (!input) return;
        sendMessage(input.value);
        input.value = "";
      });
    }

    document.getElementById("social-open-add")?.addEventListener("click", () => openAddPanel(true));
    document.getElementById("social-add-veil")?.addEventListener("click", () => openAddPanel(false));
    document.getElementById("social-add-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      submitFriendRequest(document.getElementById("social-add-username")?.value);
    });

    // Default hub: first online friend if any
    const first = state.friends.find((f) => f.presence !== "offline") || state.friends[0];
    if (first) selectFriend(first.id);
  }

  window.initSocial = initSocial;
})();
