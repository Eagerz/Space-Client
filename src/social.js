/**
 * Space Launcher — Friends & Social panel
 * Persistent client-side friends graph with requests, presence sim, unread DMs.
 * Hooks on window.SpaceSocial remain IPC-ready for a future socket backend.
 */
(function () {
  "use strict";

  const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
  const STORAGE_KEY = "sc-friends-state-v1";
  const PRESENCE_TICK_MS = 28000;

  /** @typedef {"online"|"ingame"|"offline"} FriendPresence */

  const SEED_FRIENDS = [
    {
      id: "f1",
      username: "NovaPulse",
      presence: "ingame",
      detail: "Playing Hypixel (Bedwars)",
      server: "mc.hypixel.net",
      messages: [
        { id: "m1", from: "them", text: "queue up for bedwars?", at: "18:02" },
        { id: "m2", from: "me", text: "one sec — launching Space", at: "18:03" },
        { id: "m3", from: "them", text: "lobby 3 when you're in", at: "18:03" },
      ],
      unread: 1,
    },
    {
      id: "f2",
      username: "OrbitKid",
      presence: "online",
      detail: "Online in launcher",
      server: null,
      messages: [
        { id: "m1", from: "me", text: "you see the new cape shop?", at: "12:10" },
        { id: "m2", from: "them", text: "yeah Event Horizon looks insane", at: "12:12" },
      ],
      unread: 0,
    },
    {
      id: "f3",
      username: "SilverDrift",
      presence: "online",
      detail: "Idle",
      server: null,
      messages: [
        { id: "m1", from: "them", text: "WANNA duel on mineplex later", at: "09:40" },
        { id: "m2", from: "me", text: "after this ranked game", at: "09:41" },
      ],
      unread: 0,
    },
    {
      id: "f4",
      username: "EchoVoxel",
      presence: "ingame",
      detail: "Playing on play.cubecraft.net",
      server: "play.cubecraft.net",
      messages: [
        { id: "m1", from: "them", text: "skywars is cracked today", at: "17:55" },
      ],
      unread: 1,
    },
    {
      id: "f5",
      username: "QuietStar",
      presence: "offline",
      detail: "Offline — 3h ago",
      lastSeen: "3h ago",
      server: null,
      messages: [
        { id: "m1", from: "me", text: "gn — cubecraft tomorrow?", at: "Yesterday" },
        { id: "m2", from: "them", text: "bet", at: "Yesterday" },
      ],
      unread: 0,
    },
    {
      id: "f6",
      username: "AshComet",
      presence: "offline",
      detail: "Offline — 2d ago",
      lastSeen: "2d ago",
      server: null,
      messages: [
        { id: "m1", from: "them", text: "got Space+ yet?", at: "Mon" },
        { id: "m2", from: "me", text: "yep — exclusive capes unlocked", at: "Mon" },
      ],
      unread: 0,
    },
  ];

  const SEED_REQUESTS = [
    { id: "r1", username: "PixelOrbit", direction: "incoming", at: Date.now() - 3600000 },
    { id: "r2", username: "LunarFox", direction: "outgoing", at: Date.now() - 7200000 },
  ];

  const SERVERS = [
    { host: "mc.hypixel.net", label: "Hypixel (Bedwars)" },
    { host: "play.cubecraft.net", label: "CubeCraft SkyWars" },
    { host: "mc.minehut.com", label: "Minehut lobby" },
    { host: null, label: "Online in launcher" },
    { host: null, label: "Idle" },
  ];

  const AUTO_REPLIES = [
    "gg, one more?",
    "joining in a sec",
    "nice cape btw",
    "brb — grabbing a snack",
    "Space Launcher feels so smooth",
    "invite me when you're in",
  ];

  const state = {
    friends: [],
    requests: [],
    activeId: null,
    query: "",
    tab: "friends",
    presenceTimer: null,
    replyTimer: null,
  };

  function defaultState() {
    return {
      friends: SEED_FRIENDS.map((f) => structuredClone(f)),
      requests: SEED_REQUESTS.map((r) => structuredClone(r)),
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.friends) || !parsed.friends.length) return defaultState();
      return {
        friends: parsed.friends,
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      };
    } catch {
      return defaultState();
    }
  }

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ friends: state.friends, requests: state.requests })
    );
    window.dispatchEvent(new CustomEvent("space-friends-updated"));
    updateFriendsNavBadge();
  }

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
      window.SpaceGUI?.showToast?.(`Quick Join → ${payload.server}`, {
        tone: "ok",
        actionLabel: "Copy",
        onAction: () => {
          navigator.clipboard?.writeText?.(payload.server);
          window.SpaceGUI?.showToast?.("Server address copied", { tone: "ok", duration: 2000 });
        },
      });
      window.SpaceGUI?.pushActivity?.({
        kind: "join",
        text: `Quick Join ${payload.username} on ${payload.server}`,
      });
    },
    onSelectFriend(payload) {
      console.info("[SpaceSocial] onSelectFriend", payload);
    },
    onAcceptRequest(payload) {
      console.info("[SpaceSocial] onAcceptRequest", payload);
    },
    onDeclineRequest(payload) {
      console.info("[SpaceSocial] onDeclineRequest", payload);
    },
    onRemoveFriend(payload) {
      console.info("[SpaceSocial] onRemoveFriend", payload);
    },
    getOnlineFriends() {
      return state.friends.filter((f) => f.presence !== "offline");
    },
    getUnreadTotal() {
      return state.friends.reduce((sum, f) => sum + (f.unread || 0), 0) + state.requests.filter((r) => r.direction === "incoming").length;
    },
    selectFriend(id) {
      selectFriend(id);
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

  function updateFriendsNavBadge() {
    const btn = document.querySelector('.nav-btn[data-view="friends"]');
    if (!btn) return;
    let badge = btn.querySelector(".nav-badge");
    const total = window.SpaceSocial.getUnreadTotal();
    if (total <= 0) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-badge";
      btn.appendChild(badge);
    }
    badge.textContent = total > 9 ? "9+" : String(total);
  }

  function renderFriendsList() {
    const root = document.getElementById("social-friends-list");
    if (!root) return;

    if (state.tab === "requests") {
      renderRequestsList(root);
      return;
    }

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

  function renderRequestsList(root) {
    const incoming = state.requests.filter((r) => r.direction === "incoming");
    const outgoing = state.requests.filter((r) => r.direction === "outgoing");

    const block = (title, items, kind) => {
      if (!items.length) return "";
      return `
        <div class="social-section-label">${escapeHtml(title)}</div>
        ${items
          .map(
            (r) => `
          <div class="social-request-card" data-request-id="${escapeHtml(r.id)}">
            <div class="social-avatar-wrap">
              <img src="${avatarUrl(r.username)}" alt="" width="36" height="36" loading="lazy" />
            </div>
            <div class="social-friend-meta">
              <span class="social-friend-name">${escapeHtml(r.username)}</span>
              <span class="social-friend-detail">${kind === "incoming" ? "Wants to be friends" : "Request pending"}</span>
            </div>
            <div class="social-request-actions">
              ${
                kind === "incoming"
                  ? `<button type="button" class="social-req-accept" data-accept="${escapeHtml(r.id)}">Accept</button>
                     <button type="button" class="social-req-decline" data-decline="${escapeHtml(r.id)}">Decline</button>`
                  : `<button type="button" class="social-req-decline" data-cancel="${escapeHtml(r.id)}">Cancel</button>`
              }
            </div>
          </div>`
          )
          .join("")}
      `;
    };

    root.innerHTML =
      block(`Incoming — ${incoming.length}`, incoming, "incoming") +
      block(`Outgoing — ${outgoing.length}`, outgoing, "outgoing");

    if (!root.innerHTML.trim()) {
      root.innerHTML = `<p class="social-list-empty">No pending requests.</p>`;
    }

    root.querySelectorAll("[data-accept]").forEach((btn) => {
      btn.addEventListener("click", () => acceptRequest(btn.getAttribute("data-accept")));
    });
    root.querySelectorAll("[data-decline]").forEach((btn) => {
      btn.addEventListener("click", () => removeRequest(btn.getAttribute("data-decline"), "declined"));
    });
    root.querySelectorAll("[data-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => removeRequest(btn.getAttribute("data-cancel"), "cancelled"));
    });
  }

  function friendCard(f) {
    const active = f.id === state.activeId ? " is-active" : "";
    const muted = f.presence === "offline" ? " is-offline" : "";
    const star =
      f.presence === "ingame"
        ? `<span class="social-space-star" title="Online on Space Launcher" aria-label="Online on Space Launcher">✦</span>`
        : "";
    const unread =
      f.unread > 0
        ? `<span class="social-unread-badge">${f.unread > 9 ? "9+" : f.unread}</span>`
        : "";
    return `
      <button type="button" class="social-friend-card${active}${muted}" data-friend-id="${escapeHtml(f.id)}" role="listitem">
        <div class="social-avatar-wrap">
          <img src="${avatarUrl(f.username)}" alt="" width="36" height="36" loading="lazy" />
          <span class="social-presence presence-${escapeHtml(f.presence)}"></span>
        </div>
        <div class="social-friend-meta">
          <div class="social-friend-name-row">
            <span class="social-friend-name">${escapeHtml(f.username)}</span>
            ${star}
            ${unread}
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
    state.tab = "friends";
    syncTabButtons();
    if (friend.unread) {
      friend.unread = 0;
      persist();
    }
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
    const removeBtn = document.getElementById("social-remove-friend");

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
    if (removeBtn) {
      removeBtn.hidden = false;
      removeBtn.onclick = () => removeFriend(friend.id);
    }

    if (feed) {
      feed.classList.remove("social-messages-enter");
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
    window.SpaceGUI?.pushActivity?.({ kind: "chat", text: `Messaged ${friend.username}` });
    persist();
    showChat(friend, false);
    scheduleAutoReply(friend);
  }

  function scheduleAutoReply(friend) {
    clearTimeout(state.replyTimer);
    if (friend.presence === "offline") return;
    state.replyTimer = setTimeout(() => {
      const target = state.friends.find((f) => f.id === friend.id);
      if (!target) return;
      const reply = AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
      target.messages.push({
        id: `auto-${Date.now()}`,
        from: "them",
        text: reply,
        at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      if (state.activeId !== target.id) {
        target.unread = (target.unread || 0) + 1;
        window.SpaceGUI?.showToast?.(`${target.username}: ${reply}`, {
          tone: "info",
          actionLabel: "Open",
          onAction: () => {
            document.querySelector('.nav-btn[data-view="friends"]')?.click();
            selectFriend(target.id);
          },
        });
      }
      persist();
      if (state.activeId === target.id) showChat(target, false);
      else renderFriendsList();
    }, 1400 + Math.random() * 2200);
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
    if (state.friends.some((f) => f.username.toLowerCase() === clean.toLowerCase())) {
      if (feedback) feedback.textContent = "You're already friends with that player.";
      return;
    }
    if (state.requests.some((r) => r.username.toLowerCase() === clean.toLowerCase())) {
      if (feedback) feedback.textContent = "A request for that username is already pending.";
      return;
    }

    const req = {
      id: `r-${Date.now()}`,
      username: clean,
      direction: "outgoing",
      at: Date.now(),
    };
    state.requests.unshift(req);
    window.SpaceSocial.onSendFriendRequest({ username: clean });
    window.SpaceGUI?.pushActivity?.({ kind: "social", text: `Friend request sent to ${clean}` });
    persist();

    if (feedback) feedback.textContent = `Request sent to ${clean}.`;
    const btn = document.getElementById("social-add-submit");
    if (btn) {
      btn.classList.remove("is-rippling");
      void btn.offsetWidth;
      btn.classList.add("is-rippling");
    }

    // Simulate accept after a delay for interactivity
    setTimeout(() => {
      const pending = state.requests.find((r) => r.id === req.id);
      if (!pending) return;
      acceptRequest(req.id, { silent: false, simulated: true });
    }, 3500 + Math.random() * 2500);

    setTimeout(() => openAddPanel(false), 900);
  }

  function acceptRequest(id, opts = {}) {
    const idx = state.requests.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const req = state.requests[idx];
    state.requests.splice(idx, 1);

    if (!state.friends.some((f) => f.username.toLowerCase() === req.username.toLowerCase())) {
      const friend = {
        id: `f-${Date.now()}`,
        username: req.username,
        presence: "online",
        detail: opts.simulated ? "Just accepted — online in launcher" : "Online in launcher",
        server: null,
        messages: [
          {
            id: `m-welcome-${Date.now()}`,
            from: "them",
            text: opts.simulated ? "hey! accepted your request 👋" : "thanks for accepting!",
            at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ],
        unread: 1,
      };
      state.friends.unshift(friend);
      window.SpaceSocial.onAcceptRequest({ username: req.username, friendId: friend.id });
      window.SpaceGUI?.showToast?.(`${req.username} is now your friend`, {
        tone: "ok",
        actionLabel: "Chat",
        onAction: () => {
          document.querySelector('.nav-btn[data-view="friends"]')?.click();
          selectFriend(friend.id);
        },
      });
      window.SpaceGUI?.pushActivity?.({ kind: "social", text: `You and ${req.username} are now friends` });
    }
    persist();
    renderFriendsList();
    updateRequestCount();
  }

  function removeRequest(id, reason) {
    const idx = state.requests.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const req = state.requests[idx];
    state.requests.splice(idx, 1);
    window.SpaceSocial.onDeclineRequest({ username: req.username, reason });
    persist();
    renderFriendsList();
    updateRequestCount();
  }

  function removeFriend(id) {
    const friend = state.friends.find((f) => f.id === id);
    if (!friend) return;
    if (!confirm(`Remove ${friend.username} from friends?`)) return;
    state.friends = state.friends.filter((f) => f.id !== id);
    window.SpaceSocial.onRemoveFriend({ friendId: id, username: friend.username });
    window.SpaceGUI?.showToast?.(`Removed ${friend.username}`, { tone: "info" });
    window.SpaceGUI?.pushActivity?.({ kind: "social", text: `Removed ${friend.username}` });
    if (state.activeId === id) {
      state.activeId = null;
      const empty = document.getElementById("social-empty");
      const chat = document.getElementById("social-chat");
      if (empty) empty.hidden = false;
      if (chat) chat.hidden = true;
    }
    persist();
    renderFriendsList();
  }

  function updateRequestCount() {
    const countEl = document.getElementById("social-request-count");
    const incoming = state.requests.filter((r) => r.direction === "incoming").length;
    if (countEl) {
      countEl.textContent = String(incoming);
      countEl.hidden = incoming === 0;
    }
  }

  function syncTabButtons() {
    document.querySelectorAll("[data-social-tab]").forEach((btn) => {
      const active = btn.getAttribute("data-social-tab") === state.tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function tickPresence() {
    const onlineFriends = state.friends.filter((f) => f.presence !== "offline");
    if (!onlineFriends.length) return;
    const friend = onlineFriends[Math.floor(Math.random() * onlineFriends.length)];
    const pick = SERVERS[Math.floor(Math.random() * SERVERS.length)];
    if (pick.host) {
      friend.presence = "ingame";
      friend.server = pick.host;
      friend.detail = `Playing ${pick.label}`;
    } else {
      friend.presence = Math.random() > 0.35 ? "online" : "offline";
      friend.server = null;
      friend.detail = friend.presence === "offline" ? "Offline — just now" : pick.label;
      if (friend.presence === "offline") friend.lastSeen = "just now";
    }
    persist();
    renderFriendsList();
    if (state.activeId === friend.id) showChat(friend, false);
  }

  function initSocial() {
    if (!document.getElementById("view-friends")) return;

    const loaded = loadState();
    state.friends = loaded.friends;
    state.requests = loaded.requests;

    renderFriendsList();
    updateRequestCount();
    updateFriendsNavBadge();

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

    document.querySelectorAll("[data-social-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tab = btn.getAttribute("data-social-tab") || "friends";
        syncTabButtons();
        renderFriendsList();
      });
    });

    clearInterval(state.presenceTimer);
    state.presenceTimer = setInterval(tickPresence, PRESENCE_TICK_MS);

    const first = state.friends.find((f) => f.presence !== "offline") || state.friends[0];
    if (first) selectFriend(first.id);

    window.dispatchEvent(new CustomEvent("space-friends-updated"));
  }

  window.initSocial = initSocial;
})();
