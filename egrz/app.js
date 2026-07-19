/* Egrz staff dashboard client */

const TITLES = {
  overview: ["Overview", "Live ops snapshot"],
  "launcher-id": ["Launcher ID", "Find player → fix → force update"],
  tickets: ["Tickets", "Open Discord support channels"],
  purchases: ["Purchases", "Stripe sessions & player entitlements"],
  players: ["Players", "Search by Minecraft name · push fixes by User ID"],
  crashes: ["Crashes", "Diagnostics archive + staff feed"],
  updates: ["Updates", "Force update + CDN / GitHub backup"],
  agents: ["Fix Agent", "Issue + Launcher ID → auto repair + Discord notify"],
  discord: ["Discord Ops", "Channels, roles, bot status"],
};

const state = {
  user: null,
  view: "overview",
  rpcTimer: null,
};

async function pulsePresence(moduleName) {
  try {
    await api("/presence/heartbeat", {
      method: "POST",
      body: JSON.stringify({ module: moduleName || state.view || "Overview" }),
    });
  } catch {
    /* Discord desktop may be closed — ignore */
  }
}

function startPresenceLoop() {
  stopPresenceLoop();
  pulsePresence(TITLES[state.view]?.[0] || state.view);
  state.rpcTimer = setInterval(() => {
    pulsePresence(TITLES[state.view]?.[0] || state.view);
  }, 20_000);
}

function stopPresenceLoop() {
  if (state.rpcTimer) {
    clearInterval(state.rpcTimer);
    state.rpcTimer = null;
  }
  api("/presence/clear", { method: "POST" }).catch(() => {});
}

async function api(path, opts = {}) {
  const res = await fetch(`/api/staff${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || text || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function avatarUrl(user) {
  if (!user?.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
}

function showLogin(hint) {
  $("view-login").hidden = false;
  $("view-shell").hidden = true;
  $("login-hint").textContent = hint || "";
}

function showShell() {
  $("view-login").hidden = true;
  $("view-shell").hidden = false;
  const u = state.user;
  const av = avatarUrl(u);
  $("sidebar-user").innerHTML = `
    ${av ? `<img src="${esc(av)}" alt="" width="28" height="28" style="border-radius:50%;vertical-align:middle;margin-right:8px" />` : ""}
    <strong>${esc(u.globalName || u.username)}</strong>
    <span class="badge">${esc(u.level)}</span>
    <div>${esc((u.roles || []).join(" · "))}</div>
  `;
}

function setActiveNav(view) {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  const [title, sub] = TITLES[view] || [view, ""];
  $("page-title").textContent = title;
  $("page-sub").textContent = sub;
}

function stageHtml(html) {
  $("stage").innerHTML = html;
}

function loading() {
  stageHtml(`<p class="muted">Loading…</p>`);
}

function errorBox(err) {
  stageHtml(`<div class="error-banner">${esc(err.message || err)}</div>`);
}

async function renderOverview() {
  loading();
  const d = await api("/overview");
  const typeRows = Object.entries(d.ticketsByType || {})
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`)
    .join("");
  stageHtml(`
    <div class="grid">
      <div class="stat"><div class="label">Open tickets</div><div class="value">${d.ticketsOpen ?? 0}</div></div>
      <div class="stat"><div class="label">Players</div><div class="value">${d.playerCount ?? 0}</div></div>
      <div class="stat"><div class="label">Paid sessions</div><div class="value">${d.processedSessions ?? 0}</div></div>
      <div class="stat"><div class="label">Stripe</div><div class="value" style="font-size:1.1rem"><span class="badge ${d.stripeOk ? "ok" : "bad"}">${d.stripeOk ? "OK" : "Down"}</span></div></div>
      <div class="stat"><div class="label">Discord bot</div><div class="value" style="font-size:1.1rem"><span class="badge ${d.bot?.ready ? "ok" : "bad"}">${d.bot?.ready ? esc(d.bot.tag || "Online") : "Offline"}</span></div></div>
    </div>
    <div class="panel">
      <h3>Tickets by type</h3>
      <div class="table-wrap"><table><thead><tr><th>Type</th><th>Open</th></tr></thead><tbody>${typeRows || `<tr><td colspan="2" class="muted">None</td></tr>`}</tbody></table></div>
    </div>
    <div class="panel">
      <h3>Recently updated players</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>UUID</th><th>Credits</th><th>Space+</th><th>Updated</th></tr></thead>
        <tbody>
          ${(d.recentPlayers || [])
            .map(
              (p) => `<tr>
              <td class="mono">${esc(p.uuid)}</td>
              <td>${p.credits ?? 0}</td>
              <td>${p.spacePlus ? "yes" : "—"}</td>
              <td class="muted">${esc(p.updatedAt || "")}</td>
            </tr>`
            )
            .join("") || `<tr><td colspan="4" class="muted">No players yet</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `);
}

async function renderTickets() {
  loading();
  const d = await api("/tickets");
  stageHtml(`
    <div class="grid">
      <div class="stat"><div class="label">Open</div><div class="value">${d.total ?? 0}</div></div>
    </div>
    <div class="panel">
      <h3>Channels</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Type</th><th>Topic</th><th></th></tr></thead>
        <tbody>
          ${(d.tickets || [])
            .map(
              (t) => `<tr>
              <td class="mono">${esc(t.name)}</td>
              <td><span class="badge">${esc(t.typeLabel || t.type)}</span></td>
              <td class="muted">${esc((t.topic || "").slice(0, 80))}</td>
              <td><a href="${esc(t.url)}" target="_blank" rel="noreferrer">Open</a></td>
            </tr>`
            )
            .join("") || `<tr><td colspan="4" class="muted">No open ticket-* channels</td></tr>`}
        </tbody>
      </table></div>
    </div>
  `);
}

async function renderPurchases() {
  stageHtml(`
    <div class="panel">
      <h3>Lookup</h3>
      <div class="field-row">
        <input type="search" id="purchase-q" placeholder="MC UUID, cs_… session, customer id" />
        <button type="button" class="btn btn-primary" id="purchase-go">Search</button>
      </div>
      <div id="purchase-out" style="margin-top:1rem"></div>
    </div>
    <div class="panel" id="purchase-recent"><p class="muted">Loading recent…</p></div>
  `);
  $("purchase-go").onclick = async () => {
    const q = $("purchase-q").value.trim();
    if (!q) return;
    $("purchase-out").innerHTML = `<p class="muted">Searching…</p>`;
    try {
      const d = await api(`/purchases/lookup?q=${encodeURIComponent(q)}`);
      $("purchase-out").innerHTML = `
        ${d.stripeError ? `<div class="error-banner">${esc(d.stripeError)}</div>` : ""}
        <h4>Players</h4>
        <pre class="mono" style="white-space:pre-wrap">${esc(JSON.stringify(d.players, null, 2))}</pre>
        <h4>Stripe sessions</h4>
        <pre class="mono" style="white-space:pre-wrap">${esc(JSON.stringify(d.stripeSessions, null, 2))}</pre>
        <h4>Processed matches</h4>
        <pre class="mono" style="white-space:pre-wrap">${esc(JSON.stringify(d.processed, null, 2))}</pre>
      `;
    } catch (err) {
      $("purchase-out").innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
    }
  };
  try {
    const r = await api("/purchases/recent");
    $("purchase-recent").innerHTML = `
      <h3>Recent entitlements</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>UUID</th><th>Type</th><th>When</th></tr></thead>
        <tbody>
          ${(r.recentPurchases || [])
            .map(
              (p) => `<tr>
              <td class="mono">${esc(p.uuid)}</td>
              <td>${esc(p.type || "")}</td>
              <td class="muted">${esc(p.at || "")}</td>
            </tr>`
            )
            .join("") || `<tr><td colspan="3" class="muted">None</td></tr>`}
        </tbody>
      </table></div>
    `;
  } catch (err) {
    $("purchase-recent").innerHTML = `<div class="error-banner">${esc(err.message)}</div>`;
  }
}

async function renderPlayers() {
  stageHtml(`
    <div class="field-row">
      <input type="search" id="player-q" placeholder="Search Minecraft name / UUID / customer" />
      <button type="button" class="btn" id="player-go">Search</button>
    </div>
    <div class="panel" id="player-out"><p class="muted">Loading…</p></div>
    <div class="panel" id="player-inbox-panel" hidden>
      <h3>Queue fix for selected player</h3>
      <p class="muted">User ID = Minecraft UUID. Queued items deliver on the player's next launcher heartbeat (~45s).</p>
      <p><strong>User ID</strong> <code class="mono" id="inbox-uuid"></code>
        <button type="button" class="btn btn-ghost" id="inbox-copy">Copy</button>
      </p>
      <p id="inbox-username" class="muted"></p>
      <div class="field-row" style="flex-wrap:wrap;gap:0.5rem;margin:0.75rem 0">
        <label><input type="checkbox" value="clear_extra_mods" class="inbox-action" /> clear_extra_mods</label>
        <label><input type="checkbox" value="clear_shader_caches" class="inbox-action" /> clear_shader_caches</label>
        <label><input type="checkbox" value="clear_logs" class="inbox-action" /> clear_logs</label>
        <label><input type="checkbox" value="restage_fabric_injection" class="inbox-action" /> restage_fabric_injection</label>
      </div>
      <label class="muted" style="display:block;margin-bottom:0.35rem">Tip to player</label>
      <textarea id="inbox-tip" rows="3" placeholder="Update Apex Launcher, then relaunch Minecraft."></textarea>
      <label style="display:block;margin:0.75rem 0"><input type="checkbox" id="inbox-force-update" /> Prompt launcher update check</label>
      <button type="button" class="btn btn-primary" id="inbox-queue">Queue fix</button>
      <span class="muted" id="inbox-status"></span>
    </div>
  `);

  const panel = $("player-inbox-panel");
  let selectedUuid = null;

  function selectPlayer(p) {
    selectedUuid = p.uuid;
    panel.hidden = false;
    $("inbox-uuid").textContent = p.uuid;
    $("inbox-username").textContent = p.username
      ? `Minecraft: ${p.username}`
      : "Minecraft name unknown (will update on next sync)";
    $("inbox-status").textContent = "";
  }

  $("inbox-copy").onclick = async () => {
    if (!selectedUuid) return;
    try {
      await navigator.clipboard.writeText(selectedUuid);
      $("inbox-status").textContent = "UUID copied";
    } catch {
      $("inbox-status").textContent = selectedUuid;
    }
  };

  $("inbox-queue").onclick = async () => {
    if (!selectedUuid) return;
    const actions = [...document.querySelectorAll(".inbox-action:checked")].map((el) => el.value);
    const tip = $("inbox-tip").value.trim();
    const forceUpdateCheck = $("inbox-force-update").checked;
    $("inbox-status").textContent = "Queuing…";
    try {
      const d = await api(`/players/${encodeURIComponent(selectedUuid)}/inbox`, {
        method: "POST",
        body: JSON.stringify({ actions, tip: tip || null, forceUpdateCheck }),
      });
      $("inbox-status").textContent = `Queued — ${d.inbox?.actions?.length || 0} action(s)${d.inbox?.tip ? " + tip" : ""}${d.inbox?.forceUpdateCheck ? " + update check" : ""}`;
    } catch (e) {
      $("inbox-status").textContent = e.message || "Failed";
    }
  };

  async function run(q = "") {
    const d = await api(`/players?q=${encodeURIComponent(q)}&limit=80`);
    $("player-out").innerHTML = `
      <h3>${d.total} player(s)</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Minecraft</th><th>User ID (UUID)</th><th>Credits</th><th>Stardust</th><th>Space+</th><th>Inbox</th><th></th></tr></thead>
        <tbody>
          ${(d.players || [])
            .map((p, i) => {
              const pending = p.pendingStaffInbox || {};
              const inboxHint =
                (pending.actions && pending.actions.length) || pending.tip || pending.forceUpdateCheck
                  ? "pending"
                  : "—";
              return `<tr data-idx="${i}">
              <td>${esc(p.username || "—")}</td>
              <td class="mono">${esc(p.uuid)}</td>
              <td>${p.credits ?? 0}</td>
              <td>${p.stardust ?? 0}</td>
              <td>${p.spacePlus ? "yes" : "—"}</td>
              <td class="muted">${esc(inboxHint)}</td>
              <td><button type="button" class="btn btn-ghost player-select" data-idx="${i}">Queue fix</button></td>
            </tr>`;
            })
            .join("") || `<tr><td colspan="7" class="muted">No matches</td></tr>`}
        </tbody>
      </table></div>
    `;
    $("player-out").querySelectorAll(".player-select").forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute("data-idx"));
        const p = (d.players || [])[idx];
        if (p) selectPlayer(p);
      };
    });
  }
  $("player-go").onclick = () => run($("player-q").value.trim()).catch((e) => errorBox(e));
  await run();
}

async function renderLauncherId() {
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("egrzSelectedLauncher") || "null");
    } catch {
      return null;
    }
  })();

  stageHtml(`
    <div class="panel">
      <h3>1 · Look up Launcher ID</h3>
      <p class="muted">Search by <strong>Minecraft name</strong>, <strong>Discord name</strong>, or paste a UUID. Launcher ID = Minecraft UUID.</p>
      <div class="field-row">
        <input type="search" id="lid-q" placeholder="e.g. Steve / eagerz / uuid…" style="min-width:280px" />
        <button type="button" class="btn btn-primary" id="lid-go">Search</button>
      </div>
      <div id="lid-results" style="margin-top:1rem"></div>
      <div id="lid-discord" style="margin-top:1rem"></div>
    </div>
    <div class="panel" id="lid-fix-panel" ${saved ? "" : "hidden"}>
      <h3>2 · Queue fix</h3>
      <p><strong>Launcher ID</strong> <code class="mono" id="lid-uuid">${esc(saved?.launcherId || "")}</code>
        <button type="button" class="btn btn-ghost" id="lid-copy">Copy</button>
      </p>
      <p class="muted" id="lid-meta"></p>
      <div class="field-row" style="flex-wrap:wrap;gap:0.5rem;margin:0.75rem 0">
        <label><input type="checkbox" value="clear_extra_mods" class="lid-action" /> clear_extra_mods</label>
        <label><input type="checkbox" value="clear_shader_caches" class="lid-action" /> clear_shader_caches</label>
        <label><input type="checkbox" value="clear_logs" class="lid-action" /> clear_logs</label>
        <label><input type="checkbox" value="restage_fabric_injection" class="lid-action" /> restage_fabric_injection</label>
        <label><input type="checkbox" value="suggest_relogin" class="lid-action" /> suggest_relogin</label>
        <label><input type="checkbox" value="suggest_gpu_drivers" class="lid-action" /> suggest_gpu_drivers</label>
      </div>
      <label class="muted" style="display:block;margin-bottom:0.35rem">Tip shown in their launcher</label>
      <textarea id="lid-tip" rows="2" placeholder="We cleared shader caches — please relaunch Minecraft."></textarea>
      <button type="button" class="btn btn-primary" id="lid-queue-fix" style="margin-top:0.75rem">Queue fix</button>
      <span class="muted" id="lid-fix-status"></span>
    </div>
    <div class="panel" id="lid-update-panel" ${saved ? "" : "hidden"}>
      <h3>3 · Force launcher update</h3>
      <p class="muted">Queues an update check on <em>their</em> Apex Launcher (next heartbeat ~45s). They must be online with the launcher running. New builds are still published globally.</p>
      <button type="button" class="btn btn-primary" id="lid-force-update">Force update check</button>
      <button type="button" class="btn" id="lid-goto-updates">Open Updates section</button>
      <span class="muted" id="lid-update-status"></span>
    </div>
  `);

  let selected = saved;

  function remember(sel) {
    selected = sel;
    sessionStorage.setItem("egrzSelectedLauncher", JSON.stringify(sel));
    $("lid-fix-panel").hidden = false;
    $("lid-update-panel").hidden = false;
    $("lid-uuid").textContent = sel.launcherId;
    $("lid-meta").textContent = [
      sel.username ? `Minecraft: ${sel.username}` : null,
      sel.discordUsername ? `Discord: ${sel.discordUsername}` : null,
      sel.discordId ? `Discord ID: ${sel.discordId}` : null,
      `source: ${sel.source || "—"}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (saved) remember(saved);

  $("lid-copy").onclick = async () => {
    const id = $("lid-uuid").textContent;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      $("lid-fix-status").textContent = "Copied";
    } catch {
      $("lid-fix-status").textContent = id;
    }
  };

  $("lid-queue-fix").onclick = async () => {
    if (!selected?.launcherId) return;
    const actions = [...document.querySelectorAll(".lid-action:checked")].map((el) => el.value);
    const tip = $("lid-tip").value.trim();
    if (!actions.length && !tip) {
      $("lid-fix-status").textContent = "Pick actions and/or a tip";
      return;
    }
    $("lid-fix-status").textContent = "Queuing…";
    try {
      const body = {
        actions,
        tip: tip || null,
        forceUpdateCheck: false,
        username: selected.username || undefined,
        discordId: selected.discordId || undefined,
        discordUsername: selected.discordUsername || undefined,
      };
      const d = await api(`/players/${encodeURIComponent(selected.launcherId)}/inbox`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      $("lid-fix-status").textContent = `Fix queued (${d.inbox?.actions?.length || 0} action(s))`;
    } catch (e) {
      $("lid-fix-status").textContent = e.message || "Failed";
    }
  };

  $("lid-force-update").onclick = async () => {
    if (!selected?.launcherId) return;
    $("lid-update-status").textContent = "Queuing update check…";
    try {
      await api(`/players/${encodeURIComponent(selected.launcherId)}/inbox`, {
        method: "POST",
        body: JSON.stringify({
          forceUpdateCheck: true,
          tip: "Apex Launcher update required — please install when prompted, then relaunch.",
          username: selected.username || undefined,
          discordId: selected.discordId || undefined,
          discordUsername: selected.discordUsername || undefined,
        }),
      });
      $("lid-update-status").textContent = "Update check queued — deliver on next launcher heartbeat";
    } catch (e) {
      $("lid-update-status").textContent = e.message || "Failed";
    }
  };

  $("lid-goto-updates").onclick = () => navigate("updates");

  $("lid-go").onclick = async () => {
    const q = $("lid-q").value.trim();
    if (!q) return;
    $("lid-results").innerHTML = `<p class="muted">Searching…</p>`;
    $("lid-discord").innerHTML = "";
    try {
      const d = await api(`/launcher-id/lookup?q=${encodeURIComponent(q)}`);
      const rows = (d.matches || [])
        .map((m, i) => {
          return `<tr>
            <td>${esc(m.username || "—")}</td>
            <td class="mono">${esc(m.launcherId)}</td>
            <td>${esc(m.discordUsername || m.discordId || "—")}</td>
            <td class="muted">${esc(m.source)}</td>
            <td><button type="button" class="btn btn-ghost lid-pick" data-idx="${i}">Select</button></td>
          </tr>`;
        })
        .join("");
      $("lid-results").innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Minecraft</th><th>Launcher ID</th><th>Discord</th><th>Source</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5" class="muted">No launcher IDs found</td></tr>`}</tbody>
        </table></div>
        <p class="muted">${esc(d.note || "")}</p>
      `;
      $("lid-results").querySelectorAll(".lid-pick").forEach((btn) => {
        btn.onclick = () => {
          const m = d.matches[Number(btn.dataset.idx)];
          if (m) remember(m);
        };
      });

      if (d.discordMembers?.length) {
        $("lid-discord").innerHTML = `
          <h4>Discord members (link manually if needed)</h4>
          <div class="table-wrap"><table>
            <thead><tr><th>Discord</th><th>ID</th><th></th></tr></thead>
            <tbody>
              ${d.discordMembers
                .map(
                  (dm, i) => `<tr>
                  <td>${esc(dm.discordGlobalName || dm.discordUsername)}${dm.nickname ? ` (${esc(dm.nickname)})` : ""}</td>
                  <td class="mono">${esc(dm.discordId)}</td>
                  <td><button type="button" class="btn btn-ghost lid-link-dc" data-idx="${i}">Use with selected ID</button></td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table></div>
        `;
        $("lid-discord").querySelectorAll(".lid-link-dc").forEach((btn) => {
          btn.onclick = async () => {
            const dm = d.discordMembers[Number(btn.dataset.idx)];
            if (!selected?.launcherId || !dm) {
              $("lid-fix-status").textContent = "Select a Launcher ID first, then link Discord";
              return;
            }
            try {
              await api(`/launcher-id/${encodeURIComponent(selected.launcherId)}/link-discord`, {
                method: "POST",
                body: JSON.stringify({
                  discordId: dm.discordId,
                  discordUsername: dm.discordUsername,
                }),
              });
              remember({
                ...selected,
                discordId: dm.discordId,
                discordUsername: dm.discordUsername,
              });
              $("lid-fix-status").textContent = "Discord linked to Launcher ID";
            } catch (e) {
              $("lid-fix-status").textContent = e.message || "Link failed";
            }
          };
        });
      }
    } catch (e) {
      $("lid-results").innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
    }
  };
}

async function renderUpdates() {
  loading();
  const d = await api("/updates");
  const m = d.mobile || {};
  const channels = d.channels || {};
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("egrzSelectedLauncher") || "null");
    } catch {
      return null;
    }
  })();

  const channelRows = Object.entries(channels)
    .map(
      ([id, ch]) => `<tr>
        <td><strong>${esc(ch.label || id)}</strong></td>
        <td class="mono">${esc(ch.manifestUrl || "—")}</td>
        <td class="muted">${esc(ch.note || "")}</td>
      </tr>`
    )
    .join("");

  stageHtml(`
    <div class="panel">
      <h3>Force update for a player</h3>
      <p class="muted">Uses the Launcher ID selected in <strong>Launcher ID</strong>. Queues an update check on their next heartbeat (~45s) or next launch.</p>
      <p>${
        saved?.launcherId
          ? `<strong>Selected:</strong> <code class="mono">${esc(saved.launcherId)}</code> ${esc(saved.username || "")}`
          : `<span class="muted">No player selected — open Launcher ID first.</span>`
      }</p>
      <div class="field-row" style="margin-top:0.75rem">
        <button type="button" class="btn btn-primary" id="upd-force" ${saved?.launcherId ? "" : "disabled"}>Force update check</button>
        <button type="button" class="btn" id="upd-goto-lid">Go to Launcher ID</button>
        <span class="muted" id="upd-force-status"></span>
      </div>
    </div>
    <div class="panel">
      <h3>Update channels</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Channel</th><th>Manifest</th><th>Note</th></tr></thead>
        <tbody>${channelRows || `<tr><td colspan="3" class="muted">No channels file</td></tr>`}</tbody>
      </table></div>
      <p class="muted" style="margin-top:0.5rem">Edit <code>backend/data/update-channels.json</code>. Live player fixes use Force update / Fix Agent — not GitHub alone.</p>
    </div>
    <div class="panel">
      <h3>Android / mobile</h3>
      <table>
        <tr><th>Version</th><td class="mono">${esc(m.version || "—")}</td></tr>
        <tr><th>Version code</th><td class="mono">${esc(m.versionCode || "—")}</td></tr>
        <tr><th>APK URL</th><td class="mono">${esc(m.apkUrl || "—")}</td></tr>
        <tr><th>Manifest URL</th><td class="mono">${esc(m.url || "—")}</td></tr>
        <tr><th>Inline JSON</th><td>${m.jsonSet ? "set" : "—"}</td></tr>
      </table>
      <p class="muted" style="margin-top:0.75rem">Edit via backend <code>.env</code> (<code>MOBILE_ANDROID_*</code>), then restart.</p>
    </div>
    <div class="panel">
      <h3>Desktop releases</h3>
      <p>${esc(d.desktop?.note || "")}</p>
      <p>CDN manifest: <code class="mono">${esc(d.desktop?.manifestUrl || "")}</code></p>
      <p>Publish helper: <code class="mono">${esc(d.desktop?.publishScript || "")}</code></p>
      <p><a href="${esc(d.desktop?.releasesUrl || "#")}" target="_blank" rel="noreferrer">GitHub Releases (CI / backup)</a></p>
    </div>
    <div class="panel">
      <h3>Recent changelogs</h3>
      <ul class="list-plain">
        ${(d.changelogRecent || [])
          .map((c) => `<li><strong>${esc(c.title)}</strong> <span class="muted">${esc(c.createdAt || "")}</span></li>`)
          .join("") || `<li class="empty">None</li>`}
      </ul>
    </div>
  `);

  $("upd-goto-lid").onclick = () => navigate("launcher-id");
  const forceBtn = $("upd-force");
  if (forceBtn && !forceBtn.disabled) {
    forceBtn.onclick = async () => {
      $("upd-force-status").textContent = "Queuing…";
      try {
        await api(`/players/${encodeURIComponent(saved.launcherId)}/inbox`, {
          method: "POST",
          body: JSON.stringify({
            forceUpdateCheck: true,
            tip: "Apex Launcher update required — please install when prompted, then relaunch.",
            username: saved.username || undefined,
            discordId: saved.discordId || undefined,
            discordUsername: saved.discordUsername || undefined,
          }),
        });
        $("upd-force-status").textContent = "Queued — player gets it on next heartbeat";
      } catch (e) {
        $("upd-force-status").textContent = e.message || "Failed";
      }
    };
  }
}

async function renderCrashes() {
  loading();
  const d = await api("/crashes");
  const diagRows = (d.diagnostics || [])
    .map(
      (x) => `<tr>
        <td class="mono">${esc(x.crashId)}</td>
        <td>${esc(x.username || "—")}</td>
        <td class="mono">${esc((x.launcherId || "").slice(0, 12))}${x.launcherId ? "…" : ""}</td>
        <td>${esc((x.diagnosis || x.summary || "—").slice(0, 80))}</td>
        <td class="muted">${esc(x.updatedAt || x.createdAt || "")}</td>
        <td>
          <button type="button" class="btn btn-ghost crash-open" data-id="${esc(x.crashId)}">Open</button>
          <button type="button" class="btn btn-primary crash-to-agent" data-id="${esc(x.crashId)}" data-lid="${esc(x.launcherId || "")}" data-user="${esc(x.username || "")}" data-diag="${esc(x.diagnosis || x.summary || "")}">Fix Agent</button>
        </td>
      </tr>`
    )
    .join("");

  const caseRows = (d.cases || [])
    .map(
      (c) => `<tr>
        <td class="mono">${esc(c.crashId)}</td>
        <td><span class="badge">${esc(c.status || "")}</span></td>
        <td>${esc(c.username || "—")}</td>
        <td>${esc((c.diagnosis || "").slice(0, 60))}</td>
        <td>
          <button type="button" class="btn btn-primary case-to-agent" data-id="${esc(c.crashId)}" data-lid="${esc(c.launcherId || "")}" data-user="${esc(c.username || "")}" data-diag="${esc(c.diagnosis || c.summary || "")}">Fix Agent</button>
        </td>
      </tr>`
    )
    .join("");

  stageHtml(`
    <p class="muted">Bot ${d.botReady ? "online" : "offline"} · staff channel ${esc(d.staffChannelId || "unset")} · GitHub backup ${d.githubBackupEnabled ? "on" : "off"}</p>
    <div class="panel">
      <h3>Local diagnostics archive</h3>
      <p class="muted">Stored under <code>backend/data/diagnostics/</code> — searchable for 1–2 player issues.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Crash ID</th><th>Player</th><th>Launcher ID</th><th>Diagnosis</th><th>When</th><th></th></tr></thead>
        <tbody>${diagRows || `<tr><td colspan="6" class="muted">No diagnostics yet — crashes save here on report</td></tr>`}</tbody>
      </table></div>
      <div id="crash-detail" style="margin-top:1rem"></div>
    </div>
    <div class="panel">
      <h3>Crash cases</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>ID</th><th>Status</th><th>Player</th><th>Diagnosis</th><th></th></tr></thead>
        <tbody>${caseRows || `<tr><td colspan="5" class="muted">No cases</td></tr>`}</tbody>
      </table></div>
    </div>
    <div class="panel">
      <h3>Discord staff feed</h3>
      <ul class="list-plain">
        ${(d.messages || [])
          .map(
            (m) => `<li>
              <strong>${esc(m.title || "Crash / staff message")}</strong>
              <div class="muted">${esc(m.createdAt || "")}</div>
              <div>${esc((m.description || m.content || "").slice(0, 280))}</div>
              ${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noreferrer">Open in Discord</a>` : ""}
            </li>`
          )
          .join("") || `<li class="empty">No recent bot messages in staff channel</li>`}
      </ul>
    </div>
  `);

  function sendToFixAgent(btn) {
    const draft = {
      launcherId: btn.dataset.lid || "",
      username: btn.dataset.user || "",
      crashId: btn.dataset.id || "",
      issueText: [
        btn.dataset.diag ? `Crash diagnosis: ${btn.dataset.diag}` : null,
        btn.dataset.id ? `Crash ID: ${btn.dataset.id}` : null,
        "Please apply safe launcher repairs and notify the player.",
      ]
        .filter(Boolean)
        .join("\n"),
    };
    sessionStorage.setItem("egrzFixAgentDraft", JSON.stringify(draft));
    navigate("agents");
  }

  document.querySelectorAll(".crash-to-agent, .case-to-agent").forEach((btn) => {
    btn.onclick = () => sendToFixAgent(btn);
  });

  document.querySelectorAll(".crash-open").forEach((btn) => {
    btn.onclick = async () => {
      const box = $("crash-detail");
      box.innerHTML = `<p class="muted">Loading…</p>`;
      try {
        const detail = await api(`/crashes/${encodeURIComponent(btn.dataset.id)}`);
        const diag = detail.diagnostic || {};
        const meta = diag.detail || {};
        box.innerHTML = `
          <h4>Crash <code class="mono">${esc(diag.crashId || btn.dataset.id)}</code></h4>
          <p>${esc(meta.diagnosis || diag.diagnosis || "—")}</p>
          <p class="muted">${esc(meta.summary || "")}</p>
          <pre class="mono" style="max-height:240px;overflow:auto;white-space:pre-wrap;font-size:0.75rem">${esc(diag.logsPreview || "(no logs)")}</pre>
          <button type="button" class="btn btn-primary" id="detail-to-agent">Send to Fix Agent</button>
          ${d.githubBackupEnabled ? `<button type="button" class="btn" id="detail-backup">Backup to GitHub</button>` : ""}
          <span class="muted" id="detail-status"></span>
        `;
        $("detail-to-agent").onclick = () => {
          sendToFixAgent({
            dataset: {
              lid: diag.launcherId || meta.launcherId || "",
              user: meta.username || diag.username || "",
              id: diag.crashId || btn.dataset.id,
              diag: meta.diagnosis || diag.diagnosis || "",
            },
          });
        };
        const backupBtn = $("detail-backup");
        if (backupBtn) {
          backupBtn.onclick = async () => {
            $("detail-status").textContent = "Backing up…";
            try {
              const r = await api(`/crashes/${encodeURIComponent(btn.dataset.id)}/backup`, {
                method: "POST",
                body: "{}",
              });
              $("detail-status").textContent = r.ok ? `Backed up: ${r.url || "ok"}` : r.error || r.skipped || "Failed";
            } catch (e) {
              $("detail-status").textContent = e.message || "Failed";
            }
          };
        }
      } catch (e) {
        box.innerHTML = `<div class="error-banner">${esc(e.message)}</div>`;
      }
    };
  });
}

function statusBadge(status) {
  const s = String(status || "");
  const cls =
    s === "applied" || s === "fixed"
      ? "ok"
      : s === "needs_staff" || s === "failed"
        ? "bad"
        : s === "queued"
          ? ""
          : "";
  return `<span class="badge ${cls}">${esc(s)}</span>`;
}

async function renderAgents() {
  loading();
  const draft = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("egrzFixAgentDraft") || "null");
    } catch {
      return null;
    }
  })();
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("egrzSelectedLauncher") || "null");
    } catch {
      return null;
    }
  })();

  const [agents, todos, jobsRes] = await Promise.all([
    api("/agents"),
    api("/todos"),
    api("/fix-jobs?limit=40"),
  ]);

  const defaultLid = draft?.launcherId || saved?.launcherId || "";
  const defaultUser = draft?.username || saved?.username || "";
  const defaultIssue = draft?.issueText || "";
  const defaultCrash = draft?.crashId || "";
  const last = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("egrzFixAgentLast") || "null");
    } catch {
      return null;
    }
  })();

  const jobRows = (jobsRes.jobs || [])
    .map(
      (j) => `<tr>
        <td class="mono">${esc(j.id)}</td>
        <td>${statusBadge(j.status)}</td>
        <td>${esc(j.username || "—")}<div class="mono muted">${esc((j.launcherId || "").slice(0, 12))}…</div></td>
        <td>${esc((j.diagnosis || j.issueText || "").slice(0, 70))}</td>
        <td class="mono">${esc((j.proposedActions || []).join(", ") || "—")}</td>
        <td class="muted">${esc(j.updatedAt || "")}</td>
        <td>${
          j.status === "needs_staff"
            ? `<button type="button" class="btn btn-primary job-queue" data-id="${esc(j.id)}">Queue anyway</button>`
            : ""
        }</td>
      </tr>`
    )
    .join("");

  stageHtml(`
    <div class="panel">
      <h3>Space Cloud Fix Agent</h3>
      <p class="muted">Describe the player's issue. The agent maps it to allow-listed repairs, queues them on their launcher (~45s heartbeat), then DMs / tickets when applied. The cloud cannot start a closed app — they need the launcher open or next launch.</p>
      <label>Launcher ID or Minecraft / Discord name</label>
      <input type="text" id="fix-q" placeholder="UUID, username, or Discord name" value="${esc(defaultLid || defaultUser)}" />
      <label style="margin-top:0.75rem;display:block">Issue</label>
      <textarea id="fix-issue" rows="5" placeholder="Game crashes on join with mixin error…">${esc(defaultIssue)}</textarea>
      <label style="margin-top:0.75rem;display:block">Ticket channel ID (optional)</label>
      <input type="text" id="fix-ticket" placeholder="Discord ticket channel snowflake" />
      <div class="field-row" style="margin-top:0.75rem;gap:1rem;flex-wrap:wrap">
        <label><input type="checkbox" id="fix-notify" checked /> Notify Discord</label>
        <label><input type="checkbox" id="fix-confirm" /> Require confirm before queue</label>
      </div>
      <div class="field-row" style="margin-top:0.75rem">
        <button type="button" class="btn btn-primary" id="fix-run">Run Fix Agent</button>
        <span class="muted" id="fix-status">${last?.status ? esc(`Last: ${last.status}`) : ""}</span>
      </div>
      <p class="muted" id="fix-result">${esc(last?.text || "")}</p>
    </div>
    <div class="panel">
      <h3>Fix jobs</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Job</th><th>Status</th><th>Player</th><th>Issue</th><th>Actions</th><th>Updated</th><th></th></tr></thead>
        <tbody>${jobRows || `<tr><td colspan="7" class="muted">No jobs yet</td></tr>`}</tbody>
      </table></div>
    </div>
    <div class="panel">
      <h3>Post a todo</h3>
      <textarea id="todo-text" placeholder="Ship Egrz overview polish…"></textarea>
      <div style="margin-top:0.5rem">
        <button type="button" class="btn btn-primary" id="todo-post">Post to Discord</button>
        <span class="muted" id="todo-status"></span>
      </div>
      <p class="muted">Requires ops level (SrMod+) and DISCORD_TODOS_CHANNEL_ID.</p>
    </div>
    <div class="panel">
      <h3>Todos channel</h3>
      <ul class="list-plain">
        ${(todos.messages || [])
          .map(
            (m) => `<li>
              <strong>${esc(m.title || "Todo")}</strong>
              <div>${esc((m.description || m.content || "").slice(0, 240))}</div>
              ${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noreferrer">Open</a>` : ""}
            </li>`
          )
          .join("") || `<li class="empty">No messages — run /setup-server or post above</li>`}
      </ul>
    </div>
    <div class="panel">
      <h3>Agent catalog</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Agent</th><th>Area</th><th>Status</th></tr></thead>
        <tbody>
          ${(agents.agents || [])
            .map(
              (a) => `<tr>
              <td>${esc(a.name)}</td>
              <td class="mono">${esc(a.area)}</td>
              <td><span class="badge">${esc(a.status)}</span></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table></div>
    </div>
  `);

  if (draft) {
    sessionStorage.removeItem("egrzFixAgentDraft");
  }

  $("fix-run").onclick = async () => {
    const q = $("fix-q").value.trim();
    const issueText = $("fix-issue").value.trim();
    if (!q || !issueText) {
      $("fix-status").textContent = "Launcher ID / name and issue required";
      return;
    }
    $("fix-status").textContent = "Analyzing…";
    $("fix-result").textContent = "";
    try {
      const looksUuid = /^[0-9a-f-]{32,36}$/i.test(q);
      const body = {
        issueText,
        notifyDiscord: $("fix-notify").checked,
        requireConfirm: $("fix-confirm").checked,
        ticketChannelId: $("fix-ticket").value.trim() || undefined,
        crashId: defaultCrash || undefined,
      };
      if (looksUuid) body.launcherId = q;
      else body.q = q;
      if (defaultUser && looksUuid) body.username = defaultUser;

      const d = await api("/fix-jobs", { method: "POST", body: JSON.stringify(body) });
      const job = d.job || {};
      sessionStorage.setItem(
        "egrzFixAgentLast",
        JSON.stringify({
          status: job.status,
          text: [
            job.diagnosis ? `Diagnosis: ${job.diagnosis}` : null,
            job.proposedActions?.length ? `Actions: ${job.proposedActions.join(", ")}` : null,
            job.result?.message || job.result?.reason || null,
            `Job ${job.id}`,
          ]
            .filter(Boolean)
            .join(" · "),
        })
      );
      await renderAgents();
    } catch (err) {
      $("fix-status").textContent = err.message || "Failed";
    }
  };

  document.querySelectorAll(".job-queue").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api(`/fix-jobs/${encodeURIComponent(btn.dataset.id)}/queue`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        await renderAgents();
      } catch (e) {
        alert(e.message || "Queue failed");
      }
    };
  });

  $("todo-post").onclick = async () => {
    const text = $("todo-text").value.trim();
    if (!text) return;
    $("todo-status").textContent = "Posting…";
    try {
      await api("/todos", { method: "POST", body: JSON.stringify({ text }) });
      $("todo-status").textContent = "Posted.";
      await renderAgents();
    } catch (err) {
      $("todo-status").textContent = err.message;
    }
  };
}

async function renderDiscord() {
  loading();
  const d = await api("/discord");
  const linkRows = Object.entries(d.links || {})
    .map(([k, url]) => `<tr><td>${esc(k)}</td><td><a href="${esc(url)}" target="_blank" rel="noreferrer">Open</a></td></tr>`)
    .join("");
  stageHtml(`
    <div class="grid">
      <div class="stat"><div class="label">Bot</div><div class="value" style="font-size:1rem"><span class="badge ${d.botReady ? "ok" : "bad"}">${d.botReady ? esc(d.botTag || "Online") : "Offline"}</span></div></div>
      <div class="stat"><div class="label">Guild</div><div class="value" style="font-size:0.9rem" class="mono">${esc(d.guildId || "—")}</div></div>
    </div>
    <div class="panel">
      <h3>Channel links</h3>
      <div class="table-wrap"><table><tbody>${linkRows || `<tr><td class="muted">No channel IDs in env</td></tr>`}</tbody></table></div>
      <p class="muted">${esc(d.note || "")}</p>
    </div>
    <div class="panel">
      <h3>Staff roles</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Role</th><th>Level</th><th>ID</th></tr></thead>
        <tbody>
          ${(d.roles || [])
            .map((r) => `<tr><td>${esc(r.label)}</td><td>${esc(r.level)}</td><td class="mono">${esc(r.id)}</td></tr>`)
            .join("")}
        </tbody>
      </table></div>
    </div>
  `);
}

const RENDERERS = {
  overview: renderOverview,
  "launcher-id": renderLauncherId,
  tickets: renderTickets,
  purchases: renderPurchases,
  players: renderPlayers,
  crashes: renderCrashes,
  updates: renderUpdates,
  agents: renderAgents,
  discord: renderDiscord,
};

async function navigate(view) {
  state.view = view;
  setActiveNav(view);
  pulsePresence(TITLES[view]?.[0] || view);
  try {
    await RENDERERS[view]();
  } catch (err) {
    if (err.status === 401) {
      stopPresenceLoop();
      showLogin("Session expired — sign in again.");
      return;
    }
    errorBox(err);
  }
}

async function boot() {
  $("nav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    navigate(btn.dataset.view);
  });
  $("btn-logout").onclick = async () => {
    stopPresenceLoop();
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    showLogin();
  };

  try {
    const cfg = await api("/auth/config");
    if (!cfg.configured) {
      showLogin(
        "OAuth not configured. Set DISCORD_OAUTH_CLIENT_ID, DISCORD_OAUTH_CLIENT_SECRET, EGRZ_SESSION_SECRET, DISCORD_GUILD_ID in backend/.env"
      );
      return;
    }
  } catch {
    /* continue — maybe auth still works */
  }

  try {
    const me = await api("/auth/me");
    state.user = me.user;
    showShell();
    startPresenceLoop();
    await navigate("overview");
  } catch {
    showLogin();
  }
}

boot();
