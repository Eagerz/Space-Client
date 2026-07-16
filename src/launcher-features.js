/**
 * Launcher essentials UI: instances, presets, installed mods, modpacks, app mode, Java path.
 * Loaded after modrinth.js / before renderer.js interactions that call into window.LauncherFeatures.
 */

(function () {
  const APP_MODE_KEY = "space-client-app-mode";

  /** @type {{ activeId: string | null, instances: any[] }} */
  let instanceState = { activeId: null, instances: [] };
  /** @type {any[]} */
  let installedModsCache = [];
  /** @type {any[]} */
  let presetsCache = [];

  const modpackState = {
    query: "",
    loader: "fabric",
    offset: 0,
    totalHits: 0,
    loading: false,
    loaded: false,
  };

  function api() {
    return window.electronAPI;
  }

  function getAppMode() {
    return localStorage.getItem(APP_MODE_KEY) === "launcher" ? "launcher" : "client";
  }

  function applyAppMode(mode) {
    const next = mode === "launcher" ? "launcher" : "client";
    localStorage.setItem(APP_MODE_KEY, next);
    document.body.dataset.appMode = next;
    const select = document.getElementById("app-mode-select");
    if (select) select.value = next;

    document.querySelectorAll("[data-mode='client']").forEach((el) => {
      el.hidden = next === "launcher";
    });

    // If current view is client-only and we switched to launcher, go home.
    if (next === "launcher") {
      const activeNav = document.querySelector(".nav-btn.active[data-view]");
      if (activeNav?.dataset.mode === "client") {
        document.querySelector('.nav-btn[data-view="home"]')?.click();
      }
    }
  }

  function syncSessionBanner(state) {
    const banner = document.getElementById("session-expiry-banner");
    if (!banner) return;

    if (state?.expired) {
      banner.hidden = false;
      banner.textContent = "Session expired — sign in again to play.";
      banner.dataset.tone = "error";
      return;
    }
    if (state?.needsRefresh || state?.profile?.needsRefresh) {
      banner.hidden = false;
      banner.textContent = "Session expires soon — refreshing automatically…";
      banner.dataset.tone = "warn";
      api()
        ?.refreshAuth?.()
        .then((result) => {
          if (result?.success) {
            banner.hidden = false;
            banner.textContent = "Session refreshed.";
            banner.dataset.tone = "ok";
            setTimeout(() => {
              if (banner.dataset.tone === "ok") banner.hidden = true;
            }, 2500);
          } else if (result?.error) {
            banner.hidden = false;
            banner.textContent = result.error;
            banner.dataset.tone = "error";
          }
        })
        .catch(() => {});
      return;
    }
    banner.hidden = true;
    banner.textContent = "";
  }

  function renderAccountSwitcher(state) {
    const root = document.getElementById("account-switcher");
    if (!root) return;
    const accounts = state?.accounts || [];
    const activeId = state?.activeId || state?.profile?.uuid || null;

    if (!accounts.length) {
      root.innerHTML = '<p class="account-switcher-empty">No saved accounts yet.</p>';
      return;
    }

    root.innerHTML = accounts
      .map((acc) => {
        const id = acc.uuid;
        const active = id === activeId;
        const expired = acc.expired ? " (expired)" : "";
        return `
          <div class="account-switcher-row ${active ? "active" : ""}" data-account-id="${escapeHtml(id)}">
            <img src="${escapeHtml(acc.skinUrl)}" alt="" width="32" height="32" loading="lazy" referrerpolicy="no-referrer" />
            <div class="account-switcher-meta">
              <strong>${escapeHtml(acc.username)}</strong>
              <span>${active ? "Active" : "Saved"}${expired}</span>
            </div>
            <div class="account-switcher-actions">
              ${active ? "" : `<button type="button" class="btn-mod" data-switch-account="${escapeHtml(id)}">Use</button>`}
              <button type="button" class="btn-mod" data-remove-account="${escapeHtml(id)}">Remove</button>
            </div>
          </div>`;
      })
      .join("");
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function refreshInstances() {
    const electron = api();
    if (!electron?.listInstances) return instanceState;
    const data = await electron.listInstances();
    instanceState = {
      activeId: data.activeId,
      instances: data.instances || [],
    };
    renderInstanceSelect();
    renderInstancesManager();
    syncJavaPathInput();
    return instanceState;
  }

  function getActiveInstance() {
    return (
      instanceState.instances.find((i) => i.id === instanceState.activeId) ||
      instanceState.instances[0] ||
      null
    );
  }

  function renderInstanceSelect() {
    const select = document.getElementById("home-instance");
    if (!select) return;
    const active = instanceState.activeId;
    select.innerHTML = instanceState.instances
      .map(
        (inst) =>
          `<option value="${escapeHtml(inst.id)}"${inst.id === active ? " selected" : ""}>${escapeHtml(inst.name)}</option>`
      )
      .join("");
  }

  function renderInstancesManager() {
    const root = document.getElementById("instances-manager");
    if (!root) return;
    if (!instanceState.instances.length) {
      root.innerHTML = '<p class="instances-empty">No instances yet.</p>';
      return;
    }
    root.innerHTML = instanceState.instances
      .map((inst) => {
        const active = inst.id === instanceState.activeId;
        return `
          <div class="instance-row ${active ? "active" : ""}" data-instance-id="${escapeHtml(inst.id)}">
            <div class="instance-row-main">
              <strong>${escapeHtml(inst.name)}</strong>
              <span>${escapeHtml(inst.version)} · ${escapeHtml(inst.loader)} · ${inst.memoryGb} GB</span>
            </div>
            <div class="instance-row-actions">
              ${active ? '<span class="instance-active-badge">Active</span>' : `<button type="button" class="btn-mod" data-activate-instance="${escapeHtml(inst.id)}">Activate</button>`}
              <button type="button" class="btn-mod" data-duplicate-instance="${escapeHtml(inst.id)}">Duplicate</button>
              <button type="button" class="btn-mod" data-rename-instance="${escapeHtml(inst.id)}">Rename</button>
              <button type="button" class="btn-mod" data-delete-instance="${escapeHtml(inst.id)}" ${instanceState.instances.length <= 1 ? "disabled" : ""}>Delete</button>
            </div>
          </div>`;
      })
      .join("");
  }

  function syncJavaPathInput() {
    const input = document.getElementById("java-path-input");
    if (!input) return;
    const active = getActiveInstance();
    input.value = active?.javaPath || "";
  }

  async function applyActiveInstanceToHome() {
    const active = getActiveInstance();
    if (!active) return;
    const versionSelect = document.getElementById("home-version");
    const loaderSelect = document.getElementById("home-loader");
    if (versionSelect && active.version) {
      if (![...versionSelect.options].some((o) => o.value === active.version)) {
        const opt = document.createElement("option");
        opt.value = active.version;
        opt.textContent = active.version;
        versionSelect.appendChild(opt);
      }
      versionSelect.value = active.version;
    }
    if (loaderSelect && active.loader) loaderSelect.value = active.loader;
    if (typeof window.applyRamSetting === "function" && active.memoryGb) {
      window.applyRamSetting(active.memoryGb);
    } else {
      const ramSlider = document.getElementById("ram-slider");
      if (ramSlider) {
        ramSlider.value = String(active.memoryGb || 4);
        ramSlider.dispatchEvent(new Event("input"));
      }
    }
    syncJavaPathInput();

    // Keep modrinth filters aligned when instance changes.
    if (window.modrinthState) {
      window.modrinthState.version = active.version;
      window.modrinthState.homeLoader = active.loader === "vanilla" ? "vanilla" : active.loader;
      window.modrinthState.loader = active.loader === "vanilla" ? "fabric" : active.loader;
    }
  }

  async function refreshInstalledMods() {
    const electron = api();
    const list = document.getElementById("installed-mods-list");
    const meta = document.getElementById("installed-mods-meta");
    if (!electron?.listInstalledMods || !list) return;

    try {
      const result = await electron.listInstalledMods(instanceState.activeId);
      installedModsCache = result?.mods || [];
      if (!installedModsCache.length) {
        list.innerHTML = "";
        if (meta) meta.textContent = "No mods installed on this instance.";
        return;
      }
      if (meta) meta.textContent = `${installedModsCache.length} mod${installedModsCache.length === 1 ? "" : "s"} on active instance`;
      list.innerHTML = installedModsCache
        .map((mod) => {
          const id = escapeHtml(mod.projectId);
          const enabled = mod.enabled !== false && mod.present !== false;
          return `
            <div class="installed-mod-row ${enabled ? "" : "disabled"}" data-project-id="${id}">
              <div class="installed-mod-meta">
                <strong>${escapeHtml(mod.title || mod.slug || mod.projectId)}</strong>
                <span>${escapeHtml(mod.versionNumber || "")} · ${escapeHtml(mod.fileName || "")}</span>
              </div>
              <div class="installed-mod-actions">
                <button type="button" class="btn-mod" data-toggle-mod="${id}" data-enabled="${enabled ? "1" : "0"}">${enabled ? "Disable" : "Enable"}</button>
                <button type="button" class="btn-mod" data-uninstall-mod="${id}">Remove</button>
              </div>
            </div>`;
        })
        .join("");
    } catch (err) {
      if (meta) meta.textContent = err.message || "Failed to load installed mods";
    }
  }

  function isModInstalledLocal(projectId) {
    return installedModsCache.some((m) => m.projectId === projectId);
  }

  async function refreshPresets() {
    const electron = api();
    const list = document.getElementById("presets-list");
    if (!list) return;
    if (!electron?.listPresets) {
      list.innerHTML = '<div class="presets-empty">Presets require the Electron app.</div>';
      return;
    }
    const data = await electron.listPresets();
    presetsCache = data?.presets || [];
    if (!presetsCache.length) {
      list.innerHTML = '<div class="presets-empty">No presets yet. Save your current launch config to create one.</div>';
      return;
    }
    list.innerHTML = presetsCache
      .map((preset) => {
        const id = escapeHtml(preset.id);
        return `
          <article class="preset-card" data-preset-id="${id}">
            <div class="preset-card-body">
              <h3>${escapeHtml(preset.name)}</h3>
              <p>${escapeHtml(preset.version)} · ${escapeHtml(preset.loader)} · ${preset.memoryGb} GB</p>
              ${preset.notes ? `<p class="preset-notes">${escapeHtml(preset.notes)}</p>` : ""}
            </div>
            <div class="preset-card-actions">
              <button type="button" class="btn-mod primary" data-apply-preset="${id}">Apply</button>
              <button type="button" class="btn-mod" data-delete-preset="${id}">Delete</button>
            </div>
          </article>`;
      })
      .join("");
  }

  async function createPresetFromCurrent() {
    const electron = api();
    if (!electron?.createPreset) return;
    const name = window.prompt("Preset name", "My loadout");
    if (!name) return;
    const active = getActiveInstance();
    await electron.createPreset({
      name,
      instanceId: active?.id || null,
      version: document.getElementById("home-version")?.value || active?.version || "1.21.1",
      loader: document.getElementById("home-loader")?.value || active?.loader || "fabric",
      memoryGb: Number(document.getElementById("ram-slider")?.value) || active?.memoryGb || 4,
      javaPath: document.getElementById("java-path-input")?.value || active?.javaPath || null,
    });
    await refreshPresets();
  }

  async function applyPreset(id) {
    const preset = presetsCache.find((p) => p.id === id);
    if (!preset) return;
    const electron = api();
    if (preset.instanceId && electron?.setActiveInstance) {
      await electron.setActiveInstance(preset.instanceId);
      await refreshInstances();
    }
    if (preset.version || preset.loader || preset.memoryGb != null || preset.javaPath !== undefined) {
      const active = getActiveInstance();
      if (active && electron?.updateInstance) {
        await electron.updateInstance(active.id, {
          version: preset.version,
          loader: preset.loader,
          memoryGb: preset.memoryGb,
          javaPath: preset.javaPath,
        });
        await refreshInstances();
      }
    }
    await applyActiveInstanceToHome();
    document.querySelector('.nav-btn[data-view="home"]')?.click();
  }

  async function fetchModpacks() {
    if (modpackState.loading || typeof Modrinth === "undefined") return;
    const grid = document.getElementById("modpack-grid");
    const meta = document.getElementById("modpack-meta");
    if (!grid) return;
    modpackState.loading = true;
    grid.innerHTML = Array.from({ length: 6 }, () => '<div class="modrinth-skeleton"></div>').join("");
    try {
      const version = document.getElementById("home-version")?.value || "1.21.1";
      const data = await Modrinth.search({
        query: modpackState.query,
        loader: modpackState.loader,
        version,
        offset: modpackState.offset,
        limit: 20,
        projectType: "modpack",
      });
      modpackState.totalHits = data.total_hits;
      modpackState.loaded = true;
      if (!data.hits.length) {
        grid.innerHTML = '<div class="modrinth-empty">No modpacks found.</div>';
      } else {
        grid.innerHTML = data.hits
          .map((hit) => {
            const installed = isModInstalledLocal(`pack:${hit.project_id}`);
            return `
              <article class="modrinth-card ${installed ? "installed" : ""}" data-project-id="${hit.project_id}">
                <img class="modrinth-icon" src="${hit.icon_url || ""}" alt="" loading="lazy" />
                <div class="modrinth-body">
                  <div class="modrinth-title-row"><h3 class="modrinth-title">${escapeHtml(hit.title)}</h3></div>
                  <div class="modrinth-author">by ${escapeHtml(hit.author)}</div>
                  <p class="modrinth-desc">${escapeHtml(hit.description)}</p>
                  <div class="modrinth-actions">
                    <button type="button" class="btn-mod ${installed ? "installed" : "primary"}" data-install-pack="${hit.project_id}" data-slug="${escapeHtml(hit.slug)}">
                      ${installed ? "Installed" : "Install"}
                    </button>
                  </div>
                </div>
              </article>`;
          })
          .join("");
      }
      if (meta) meta.textContent = `${data.total_hits.toLocaleString()} modpacks · ${modpackState.loader} · Minecraft ${version}`;
      renderModpackPagination();
    } catch (err) {
      grid.innerHTML = `<div class="modrinth-error">Failed to load modpacks: ${escapeHtml(err.message)}</div>`;
    } finally {
      modpackState.loading = false;
    }
  }

  function renderModpackPagination() {
    const pagination = document.getElementById("modpack-pagination");
    if (!pagination) return;
    const page = Math.floor(modpackState.offset / 20) + 1;
    const totalPages = Math.max(1, Math.ceil(modpackState.totalHits / 20));
    pagination.innerHTML = `
      <button type="button" id="modpack-prev" ${modpackState.offset === 0 ? "disabled" : ""}>Previous</button>
      <span>Page ${page} of ${totalPages}</span>
      <button type="button" id="modpack-next" ${page >= totalPages ? "disabled" : ""}>Next</button>`;
    document.getElementById("modpack-prev")?.addEventListener("click", () => {
      modpackState.offset = Math.max(0, modpackState.offset - 20);
      fetchModpacks();
    });
    document.getElementById("modpack-next")?.addEventListener("click", () => {
      modpackState.offset += 20;
      fetchModpacks();
    });
  }

  function initModpacks() {
    const search = document.getElementById("modpack-search");
    const loader = document.getElementById("modpack-loader");
    const grid = document.getElementById("modpack-grid");
    let debounce;
    search?.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        modpackState.query = search.value;
        modpackState.offset = 0;
        fetchModpacks();
      }, 350);
    });
    loader?.addEventListener("change", () => {
      modpackState.loader = loader.value;
      modpackState.offset = 0;
      fetchModpacks();
    });
    grid?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-install-pack]");
      if (!btn) return;
      const projectId = btn.dataset.installPack;
      const slug = btn.dataset.slug;
      const electron = api();
      if (!electron?.installModpack) return;
      if (isModInstalledLocal(`pack:${projectId}`)) {
        await electron.removeMod({ projectId: `pack:${projectId}` });
        await refreshInstalledMods();
        fetchModpacks();
        return;
      }
      btn.disabled = true;
      btn.textContent = "Installing…";
      const active = getActiveInstance();
      const result = await electron.installModpack({
        projectId,
        slug,
        loader: modpackState.loader,
        gameVersion: document.getElementById("home-version")?.value || active?.version || "1.21.1",
        instanceId: active?.id,
      });
      btn.disabled = false;
      if (!result?.success) {
        btn.textContent = "Failed";
        setTimeout(() => {
          btn.textContent = "Install";
        }, 2000);
        console.error(result?.error);
        return;
      }
      await refreshInstalledMods();
      fetchModpacks();
    });
  }

  function initInstancesUi() {
    document.getElementById("home-instance")?.addEventListener("change", async (e) => {
      const id = e.target.value;
      await api()?.setActiveInstance?.(id);
      await refreshInstances();
      await applyActiveInstanceToHome();
      await refreshInstalledMods();
    });

    document.getElementById("instance-create-btn")?.addEventListener("click", async () => {
      const name = window.prompt("Instance name", "New Instance");
      if (!name) return;
      const version = document.getElementById("home-version")?.value || "1.21.1";
      const loader = document.getElementById("home-loader")?.value || "fabric";
      const memoryGb = Number(document.getElementById("ram-slider")?.value) || 4;
      await api()?.createInstance?.({ name, version, loader, memoryGb });
      await refreshInstances();
      await applyActiveInstanceToHome();
      await refreshInstalledMods();
    });

    document.getElementById("instances-manager")?.addEventListener("click", async (e) => {
      const activate = e.target.closest("[data-activate-instance]");
      const dup = e.target.closest("[data-duplicate-instance]");
      const rename = e.target.closest("[data-rename-instance]");
      const del = e.target.closest("[data-delete-instance]");
      const electron = api();
      if (activate) {
        await electron.setActiveInstance(activate.dataset.activateInstance);
        await refreshInstances();
        await applyActiveInstanceToHome();
        await refreshInstalledMods();
      } else if (dup) {
        await electron.duplicateInstance(dup.dataset.duplicateInstance);
        await refreshInstances();
      } else if (rename) {
        const id = rename.dataset.renameInstance;
        const current = instanceState.instances.find((i) => i.id === id);
        const name = window.prompt("Rename instance", current?.name || "");
        if (!name) return;
        await electron.updateInstance(id, { name });
        await refreshInstances();
      } else if (del) {
        if (!window.confirm("Delete this instance and its game files?")) return;
        await electron.deleteInstance(del.dataset.deleteInstance);
        await refreshInstances();
        await applyActiveInstanceToHome();
        await refreshInstalledMods();
      }
    });
  }

  function initJavaPathUi() {
    document.getElementById("java-path-browse")?.addEventListener("click", async () => {
      const result = await api()?.pickJavaPath?.();
      if (!result?.success || !result.path) return;
      const input = document.getElementById("java-path-input");
      if (input) input.value = result.path;
      const active = getActiveInstance();
      if (active) {
        await api().updateInstance(active.id, { javaPath: result.path });
        await refreshInstances();
      }
    });
    document.getElementById("java-path-clear")?.addEventListener("click", async () => {
      const input = document.getElementById("java-path-input");
      if (input) input.value = "";
      const active = getActiveInstance();
      if (active) {
        await api().updateInstance(active.id, { javaPath: null });
        await refreshInstances();
      }
    });
    document.getElementById("java-path-input")?.addEventListener("change", async (e) => {
      const active = getActiveInstance();
      if (!active) return;
      const value = e.target.value.trim() || null;
      await api().updateInstance(active.id, { javaPath: value });
      await refreshInstances();
    });
  }

  function initPresetsUi() {
    document.getElementById("preset-create-btn")?.addEventListener("click", () => {
      createPresetFromCurrent();
    });
    document.getElementById("presets-list")?.addEventListener("click", async (e) => {
      const applyBtn = e.target.closest("[data-apply-preset]");
      const deleteBtn = e.target.closest("[data-delete-preset]");
      if (applyBtn) await applyPreset(applyBtn.dataset.applyPreset);
      if (deleteBtn) {
        await api()?.deletePreset?.(deleteBtn.dataset.deletePreset);
        await refreshPresets();
      }
    });
  }

  function initInstalledModsUi() {
    document.getElementById("installed-mods-refresh")?.addEventListener("click", () => refreshInstalledMods());
    document.getElementById("installed-mods-list")?.addEventListener("click", async (e) => {
      const toggle = e.target.closest("[data-toggle-mod]");
      const uninstall = e.target.closest("[data-uninstall-mod]");
      const electron = api();
      if (toggle) {
        const enabled = toggle.dataset.enabled !== "1";
        await electron.setModEnabled({
          projectId: toggle.dataset.toggleMod,
          enabled,
          instanceId: instanceState.activeId,
        });
        await refreshInstalledMods();
        window.syncInstallUI?.(toggle.dataset.toggleMod, false);
        // Re-sync all from cache
        installedModsCache.forEach((m) => window.syncInstallUI?.(m.projectId, true));
      } else if (uninstall) {
        const projectId = uninstall.dataset.uninstallMod;
        await electron.removeMod({ projectId, instanceId: instanceState.activeId });
        await refreshInstalledMods();
        window.syncInstallUI?.(projectId, false);
      }
    });
  }

  function initAppModeUi() {
    const select = document.getElementById("app-mode-select");
    applyAppMode(getAppMode());
    select?.addEventListener("change", () => applyAppMode(select.value));
  }

  function initAccountExtras() {
    const addBtn = document.getElementById("account-add-btn");
    const refreshBtn = document.getElementById("account-refresh-btn");
    const electron = api();

    addBtn?.addEventListener("click", async () => {
      addBtn.disabled = true;
      try {
        await electron.loginWithMicrosoft();
      } finally {
        addBtn.disabled = false;
      }
    });

    refreshBtn?.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Refreshing…";
      try {
        const result = await electron.refreshAuth({ force: true });
        const status = document.getElementById("account-session-status");
        if (status) {
          status.textContent = result?.success
            ? result.refreshed
              ? "Refreshed"
              : "Still valid"
            : result?.error || "Refresh failed";
          status.classList.toggle("muted", !result?.success);
        }
        syncSessionBanner(result);
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "Refresh session";
      }
    });

    document.getElementById("account-switcher")?.addEventListener("click", async (e) => {
      const useBtn = e.target.closest("[data-switch-account]");
      const removeBtn = e.target.closest("[data-remove-account]");
      if (useBtn) {
        await electron.setActiveAccount(useBtn.dataset.switchAccount);
      } else if (removeBtn) {
        await electron.removeAccount(removeBtn.dataset.removeAccount);
      }
    });
  }

  async function init() {
    initAppModeUi();
    initInstancesUi();
    initJavaPathUi();
    initPresetsUi();
    initInstalledModsUi();
    initModpacks();
    initAccountExtras();

    if (!api()) return;
    await refreshInstances();
    await applyActiveInstanceToHome();
    await refreshInstalledMods();
    await refreshPresets();

    api().onModsProgress?.((payload) => {
      const btn = document.querySelector(`[data-install="${payload.projectId}"]`);
      if (btn && payload.label) btn.textContent = payload.label;
    });
  }

  window.LauncherFeatures = {
    init,
    refreshInstances,
    refreshInstalledMods,
    refreshPresets,
    fetchModpacks,
    getActiveInstance,
    getInstanceState: () => instanceState,
    isModInstalled: isModInstalledLocal,
    syncSessionBanner,
    renderAccountSwitcher,
    applyAppMode,
    getAppMode,
    applyActiveInstanceToHome,
  };
})();
