/**
 * Saved launch presets / loadouts.
 */

'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function storePath() {
  return path.join(app.getPath('userData'), 'SpaceClient', 'presets.json');
}

function readStore() {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return { presets: [] };
    const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    return { presets: Array.isArray(data.presets) ? data.presets : [] };
  } catch {
    return { presets: [] };
  }
}

function writeStore(store) {
  const dir = path.dirname(storePath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storePath(), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function listPresets() {
  return readStore();
}

function createPreset(input = {}) {
  const store = readStore();
  const now = new Date().toISOString();
  const preset = {
    id: `preset-${crypto.randomBytes(4).toString('hex')}`,
    name: String(input.name || 'New Preset').trim().slice(0, 64) || 'New Preset',
    instanceId: input.instanceId || null,
    version: input.version || '1.21.1',
    loader: input.loader || 'fabric',
    memoryGb: Number.isFinite(Number(input.memoryGb)) ? Number(input.memoryGb) : 4,
    javaPath: input.javaPath || null,
    serverHost: input.serverHost || null,
    notes: String(input.notes || '').slice(0, 240),
    createdAt: now,
    updatedAt: now,
  };
  store.presets.unshift(preset);
  writeStore(store);
  return { success: true, preset, presets: store.presets };
}

function updatePreset(id, patch = {}) {
  const store = readStore();
  const idx = store.presets.findIndex((p) => p.id === id);
  if (idx < 0) return { success: false, error: 'Preset not found.' };
  const preset = store.presets[idx];
  for (const key of ['name', 'instanceId', 'version', 'loader', 'javaPath', 'serverHost', 'notes']) {
    if (patch[key] !== undefined) preset[key] = patch[key];
  }
  if (patch.memoryGb != null) {
    const n = Number(patch.memoryGb);
    if (Number.isFinite(n)) preset.memoryGb = Math.min(16, Math.max(2, Math.round(n)));
  }
  if (preset.name) preset.name = String(preset.name).trim().slice(0, 64) || preset.name;
  preset.updatedAt = new Date().toISOString();
  store.presets[idx] = preset;
  writeStore(store);
  return { success: true, preset, presets: store.presets };
}

function deletePreset(id) {
  const store = readStore();
  const next = store.presets.filter((p) => p.id !== id);
  if (next.length === store.presets.length) {
    return { success: false, error: 'Preset not found.' };
  }
  store.presets = next;
  writeStore(store);
  return { success: true, presets: store.presets };
}

module.exports = {
  listPresets,
  createPreset,
  updatePreset,
  deletePreset,
};
