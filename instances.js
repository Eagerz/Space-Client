/**
 * Named Minecraft instances (profiles) for Space Client.
 * Each instance has its own .minecraft directory, version, loader, RAM, and Java path.
 */

'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEGACY_MINECRAFT = () => path.join(app.getPath('userData'), 'SpaceClient', '.minecraft');

function rootDir() {
  return path.join(app.getPath('userData'), 'SpaceClient');
}

function storePath() {
  return path.join(rootDir(), 'instances.json');
}

function instanceGamePath(instanceId) {
  return path.join(rootDir(), 'instances', instanceId, '.minecraft');
}

/** @returns {{ id: string, name: string, version: string, loader: string, memoryGb: number, javaPath: string | null, createdAt: string, updatedAt: string }} */
function createDefaultInstance(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: overrides.id || 'default',
    name: overrides.name || 'Space Client',
    version: overrides.version || '1.21.1',
    loader: overrides.loader || 'fabric',
    memoryGb: Number.isFinite(overrides.memoryGb) ? overrides.memoryGb : 4,
    javaPath: overrides.javaPath || null,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };
}

function ensureStore() {
  const dir = rootDir();
  fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(storePath())) {
    const legacy = LEGACY_MINECRAFT();
    const def = createDefaultInstance();
    // Prefer migrating the legacy single .minecraft into the default instance folder.
    const target = instanceGamePath(def.id);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(legacy) && !fs.existsSync(target)) {
      try {
        fs.renameSync(legacy, target);
      } catch {
        // If rename fails (cross-device), keep using legacy path via symlink-like copy fallback.
        try {
          fs.cpSync(legacy, target, { recursive: true });
        } catch (err) {
          console.warn('[instances] Could not migrate legacy .minecraft:', err.message);
          fs.mkdirSync(target, { recursive: true });
        }
      }
    } else {
      fs.mkdirSync(target, { recursive: true });
    }

    const store = { activeId: def.id, instances: [def] };
    writeStore(store);
    return store;
  }

  return readStore();
}

function readStore() {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    if (!data.instances || !Array.isArray(data.instances) || data.instances.length === 0) {
      const def = createDefaultInstance();
      return { activeId: def.id, instances: [def] };
    }
    if (!data.activeId || !data.instances.some((i) => i.id === data.activeId)) {
      data.activeId = data.instances[0].id;
    }
    return data;
  } catch (err) {
    console.warn('[instances] Failed to read store:', err.message);
    const def = createDefaultInstance();
    return { activeId: def.id, instances: [def] };
  }
}

function writeStore(store) {
  fs.mkdirSync(rootDir(), { recursive: true });
  fs.writeFileSync(storePath(), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function publicInstance(inst) {
  return {
    id: inst.id,
    name: inst.name,
    version: inst.version,
    loader: inst.loader,
    memoryGb: inst.memoryGb,
    javaPath: inst.javaPath || null,
    gamePath: getGamePath(inst.id),
    createdAt: inst.createdAt,
    updatedAt: inst.updatedAt,
  };
}

function listInstances() {
  const store = ensureStore();
  return {
    activeId: store.activeId,
    instances: store.instances.map(publicInstance),
  };
}

function getInstance(id) {
  const store = ensureStore();
  const inst = store.instances.find((i) => i.id === id);
  return inst ? publicInstance(inst) : null;
}

function getActiveInstance() {
  const store = ensureStore();
  const inst = store.instances.find((i) => i.id === store.activeId) || store.instances[0];
  return publicInstance(inst);
}

function getGamePath(instanceId) {
  const id = instanceId || ensureStore().activeId;
  const gamePath = instanceGamePath(id);
  fs.mkdirSync(gamePath, { recursive: true });
  // Fall back to legacy path if migration never happened and default is empty-ish.
  if (id === 'default') {
    const legacy = LEGACY_MINECRAFT();
    if (!fs.existsSync(gamePath) && fs.existsSync(legacy)) return legacy;
  }
  return gamePath;
}

function setActiveInstance(id) {
  const store = ensureStore();
  if (!store.instances.some((i) => i.id === id)) {
    return { success: false, error: 'Instance not found.' };
  }
  store.activeId = id;
  writeStore(store);
  return { success: true, ...listInstances() };
}

function createInstance(input = {}) {
  const store = ensureStore();
  const name = String(input.name || 'New Instance').trim().slice(0, 64) || 'New Instance';
  const id = `inst-${crypto.randomBytes(4).toString('hex')}`;
  const inst = createDefaultInstance({
    id,
    name,
    version: input.version || '1.21.1',
    loader: input.loader || 'fabric',
    memoryGb: Number.isFinite(Number(input.memoryGb)) ? Number(input.memoryGb) : 4,
    javaPath: input.javaPath || null,
  });
  fs.mkdirSync(instanceGamePath(id), { recursive: true });
  store.instances.push(inst);
  if (input.activate !== false) store.activeId = id;
  writeStore(store);
  return { success: true, instance: publicInstance(inst), ...listInstances() };
}

function updateInstance(id, patch = {}) {
  const store = ensureStore();
  const idx = store.instances.findIndex((i) => i.id === id);
  if (idx < 0) return { success: false, error: 'Instance not found.' };

  const inst = store.instances[idx];
  if (patch.name != null) inst.name = String(patch.name).trim().slice(0, 64) || inst.name;
  if (patch.version != null) inst.version = String(patch.version).trim();
  if (patch.loader != null) inst.loader = String(patch.loader).toLowerCase();
  if (patch.memoryGb != null) {
    const n = Number(patch.memoryGb);
    if (Number.isFinite(n)) inst.memoryGb = Math.min(16, Math.max(2, Math.round(n)));
  }
  if (patch.javaPath !== undefined) {
    inst.javaPath = patch.javaPath ? String(patch.javaPath) : null;
  }
  inst.updatedAt = new Date().toISOString();
  store.instances[idx] = inst;
  writeStore(store);
  return { success: true, instance: publicInstance(inst), ...listInstances() };
}

function deleteInstance(id) {
  const store = ensureStore();
  if (store.instances.length <= 1) {
    return { success: false, error: 'Cannot delete the last instance.' };
  }
  if (!store.instances.some((i) => i.id === id)) {
    return { success: false, error: 'Instance not found.' };
  }
  store.instances = store.instances.filter((i) => i.id !== id);
  if (store.activeId === id) store.activeId = store.instances[0].id;
  writeStore(store);

  // Best-effort cleanup of instance files (keep user data safer: only remove empty-ish dirs later).
  try {
    const dir = path.join(rootDir(), 'instances', id);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[instances] Failed to remove instance folder:', err.message);
  }

  return { success: true, ...listInstances() };
}

function duplicateInstance(id) {
  const store = ensureStore();
  const source = store.instances.find((i) => i.id === id);
  if (!source) return { success: false, error: 'Instance not found.' };

  const created = createInstance({
    name: `${source.name} Copy`,
    version: source.version,
    loader: source.loader,
    memoryGb: source.memoryGb,
    javaPath: source.javaPath,
    activate: false,
  });
  if (!created.success) return created;

  // Copy game files (mods etc.) best-effort.
  try {
    const srcPath = getGamePath(id);
    const destPath = getGamePath(created.instance.id);
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    }
  } catch (err) {
    console.warn('[instances] Duplicate copy warning:', err.message);
  }

  return created;
}

module.exports = {
  listInstances,
  getInstance,
  getActiveInstance,
  getGamePath,
  setActiveInstance,
  createInstance,
  updateInstance,
  deleteInstance,
  duplicateInstance,
  ensureStore,
};
