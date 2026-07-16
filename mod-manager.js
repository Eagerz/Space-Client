/**
 * Real Modrinth mod / modpack install into an instance's .minecraft folder.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const zlib = require('zlib');

const MODRINTH_API = 'https://api.modrinth.com/v2';
const MANIFEST_NAME = 'space-client-mods.json';
const USER_AGENT = 'SpaceClient/1.0.1 (launcher; Eagerz/space-client)';

function ensureSystemCa() {
  try {
    const tls = require('tls');
    if (typeof tls.setDefaultCACertificates === 'function' && typeof tls.getCACertificates === 'function') {
      tls.setDefaultCACertificates(tls.getCACertificates('system'));
    }
  } catch {
    // best-effort
  }
}

function modsDir(gamePath) {
  const dir = path.join(gamePath, 'mods');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function manifestPath(gamePath) {
  return path.join(gamePath, MANIFEST_NAME);
}

function readManifest(gamePath) {
  try {
    const p = manifestPath(gamePath);
    if (!fs.existsSync(p)) return { mods: {} };
    const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
    const data = JSON.parse(raw);
    return { mods: data.mods && typeof data.mods === 'object' ? data.mods : {} };
  } catch {
    return { mods: {} };
  }
}

function writeManifest(gamePath, manifest) {
  fs.mkdirSync(gamePath, { recursive: true });
  fs.writeFileSync(manifestPath(gamePath), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function fetchJson(url) {
  ensureSystemCa();
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchJson(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

function downloadFile(url, destPath, expectedSha1) {
  ensureSystemCa();
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tmp = `${destPath}.partial`;
    const parsed = new URL(url);
    const lib = parsed.protocol === 'http:' ? http : https;

    const doGet = (currentUrl, redirects = 0) => {
      if (redirects > 5) {
        reject(new Error('Too many redirects'));
        return;
      }
      const req = lib.get(
        currentUrl,
        { headers: { 'User-Agent': USER_AGENT } },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            doGet(res.headers.location, redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Download failed HTTP ${res.statusCode}`));
            return;
          }
          const hash = crypto.createHash('sha1');
          const out = fs.createWriteStream(tmp);
          res.on('data', (chunk) => hash.update(chunk));
          res.pipe(out);
          out.on('finish', () => {
            out.close(() => {
              const digest = hash.digest('hex');
              if (expectedSha1 && digest !== expectedSha1) {
                try {
                  fs.unlinkSync(tmp);
                } catch {
                  // ignore
                }
                reject(new Error(`SHA1 mismatch for ${path.basename(destPath)}`));
                return;
              }
              try {
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                fs.renameSync(tmp, destPath);
                resolve({ path: destPath, sha1: digest });
              } catch (err) {
                reject(err);
              }
            });
          });
          out.on('error', reject);
        }
      );
      req.on('error', reject);
      req.setTimeout(120000, () => req.destroy(new Error('Download timed out')));
    };

    doGet(url);
  });
}

function pickPrimaryFile(version) {
  const files = version?.files || [];
  return files.find((f) => f.primary) || files[0] || null;
}

async function getCompatibleVersion(projectId, loader, gameVersion) {
  const versions = await fetchJson(`${MODRINTH_API}/project/${projectId}/version`);
  if (!Array.isArray(versions)) return null;
  const loaderKey = String(loader || 'fabric').toLowerCase();
  return (
    versions.find(
      (v) =>
        (loaderKey === 'vanilla' || v.loaders?.includes(loaderKey)) &&
        v.game_versions?.includes(gameVersion)
    ) || null
  );
}

function listInstalled(gamePath) {
  const manifest = readManifest(gamePath);
  const dir = modsDir(gamePath);
  const mods = Object.entries(manifest.mods).map(([projectId, meta]) => {
    const fileName = meta.fileName;
    const jarPath = path.join(dir, fileName);
    const disabledPath = `${jarPath}.disabled`;
    const enabled = fs.existsSync(jarPath);
    const present = enabled || fs.existsSync(disabledPath);
    return {
      projectId,
      ...meta,
      enabled,
      present,
      filePath: enabled ? jarPath : disabledPath,
    };
  });
  return { mods };
}

async function installMod({ gamePath, projectId, slug, loader, gameVersion, onProgress }) {
  if (!gamePath) throw new Error('Missing game path');
  if (!projectId) throw new Error('Missing project id');

  onProgress?.({ phase: 'resolve', label: 'Finding compatible version…' });
  const version = await getCompatibleVersion(projectId, loader, gameVersion);
  if (!version) {
    throw new Error(`No compatible version for ${loader} ${gameVersion}`);
  }

  const file = pickPrimaryFile(version);
  if (!file?.url || !file?.filename) {
    throw new Error('Compatible version has no downloadable file');
  }

  const dir = modsDir(gamePath);
  const dest = path.join(dir, file.filename);

  // Remove previous jar for this project if filename changed.
  const manifest = readManifest(gamePath);
  const previous = manifest.mods[projectId];
  if (previous?.fileName && previous.fileName !== file.filename) {
    for (const candidate of [path.join(dir, previous.fileName), path.join(dir, `${previous.fileName}.disabled`)]) {
      try {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      } catch {
        // ignore
      }
    }
  }

  onProgress?.({ phase: 'download', label: `Downloading ${file.filename}…` });
  await downloadFile(file.url, dest, file.hashes?.sha1);

  // Ensure enabled (remove .disabled sibling).
  try {
    const disabled = `${dest}.disabled`;
    if (fs.existsSync(disabled)) fs.unlinkSync(disabled);
  } catch {
    // ignore
  }

  let projectTitle = slug || projectId;
  try {
    const project = await fetchJson(`${MODRINTH_API}/project/${projectId}`);
    if (project?.title) projectTitle = project.title;
  } catch {
    // optional
  }

  manifest.mods[projectId] = {
    slug: slug || version.project_id || projectId,
    title: projectTitle,
    versionId: version.id,
    versionNumber: version.version_number,
    fileName: file.filename,
    sha1: file.hashes?.sha1 || null,
    loader: loader || 'fabric',
    gameVersion,
    projectType: 'mod',
    installedAt: Date.now(),
    updatedAt: Date.now(),
  };
  writeManifest(gamePath, manifest);

  onProgress?.({ phase: 'done', label: 'Installed' });
  return { success: true, mod: manifest.mods[projectId] };
}

function removeMod(gamePath, projectId) {
  const manifest = readManifest(gamePath);
  const meta = manifest.mods[projectId];
  if (!meta) return { success: false, error: 'Mod is not installed.' };

  const dir = modsDir(gamePath);
  for (const candidate of [path.join(dir, meta.fileName), path.join(dir, `${meta.fileName}.disabled`)]) {
    try {
      if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
    } catch {
      // ignore
    }
  }
  delete manifest.mods[projectId];
  writeManifest(gamePath, manifest);
  return { success: true };
}

function setModEnabled(gamePath, projectId, enabled) {
  const manifest = readManifest(gamePath);
  const meta = manifest.mods[projectId];
  if (!meta?.fileName) return { success: false, error: 'Mod is not installed.' };

  const dir = modsDir(gamePath);
  const jarPath = path.join(dir, meta.fileName);
  const disabledPath = `${jarPath}.disabled`;

  try {
    if (enabled) {
      if (fs.existsSync(disabledPath) && !fs.existsSync(jarPath)) {
        fs.renameSync(disabledPath, jarPath);
      }
    } else if (fs.existsSync(jarPath) && !fs.existsSync(disabledPath)) {
      fs.renameSync(jarPath, disabledPath);
    }
  } catch (err) {
    return { success: false, error: err.message };
  }

  return { success: true, enabled: Boolean(enabled) };
}

/**
 * Minimal .mrpack (zip) installer: downloads pack file, extracts overrides + mods from index.
 * Uses Node zlib inflate for stored/deflate entries via a tiny ZIP reader.
 */
async function installModpack({ gamePath, projectId, slug, loader, gameVersion, onProgress }) {
  onProgress?.({ phase: 'resolve', label: 'Finding modpack version…' });
  const version = await getCompatibleVersion(projectId, loader || 'fabric', gameVersion);
  if (!version) throw new Error(`No compatible modpack for ${loader} ${gameVersion}`);

  const file = pickPrimaryFile(version);
  if (!file?.url) throw new Error('Modpack has no downloadable file');

  const tmpDir = path.join(gamePath, '.space-client-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const packPath = path.join(tmpDir, file.filename || 'pack.mrpack');

  onProgress?.({ phase: 'download', label: 'Downloading modpack…' });
  await downloadFile(file.url, packPath, file.hashes?.sha1);

  onProgress?.({ phase: 'extract', label: 'Reading modpack index…' });
  const index = await readMrpackIndex(packPath);
  if (!index) throw new Error('Invalid modpack (missing modrinth.index.json)');

  const files = Array.isArray(index.files) ? index.files : [];
  let i = 0;
  for (const entry of files) {
    i += 1;
    const rel = String(entry.path || '').replace(/\\/g, '/');
    if (!rel || rel.includes('..')) continue;
    const downloads = entry.downloads || [];
    const url = downloads[0];
    if (!url) continue;
    const dest = path.join(gamePath, rel);
    onProgress?.({
      phase: 'download',
      label: `Modpack file ${i}/${files.length}`,
      detail: path.basename(rel),
    });
    await downloadFile(url, dest, entry.hashes?.sha1);
  }

  // Extract overrides/ folder from the zip if present.
  onProgress?.({ phase: 'extract', label: 'Applying overrides…' });
  await extractMrpackOverrides(packPath, gamePath);

  const manifest = readManifest(gamePath);
  manifest.mods[`pack:${projectId}`] = {
    slug: slug || projectId,
    title: index.name || slug || projectId,
    versionId: version.id,
    versionNumber: version.version_number,
    fileName: file.filename,
    sha1: file.hashes?.sha1 || null,
    loader: loader || 'fabric',
    gameVersion,
    projectType: 'modpack',
    installedAt: Date.now(),
    updatedAt: Date.now(),
  };
  writeManifest(gamePath, manifest);

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  onProgress?.({ phase: 'done', label: 'Modpack installed' });
  return { success: true, mod: manifest.mods[`pack:${projectId}`] };
}

/** Very small ZIP central-directory reader for mrpack (supports store + deflate). */
async function readMrpackIndex(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const entries = parseZipEntries(buf);
  const indexEntry = entries.find((e) => e.name === 'modrinth.index.json');
  if (!indexEntry) return null;
  const data = inflateZipEntry(buf, indexEntry);
  return JSON.parse(data.toString('utf8'));
}

async function extractMrpackOverrides(zipPath, gamePath) {
  const buf = fs.readFileSync(zipPath);
  const entries = parseZipEntries(buf);
  for (const entry of entries) {
    if (!entry.name.startsWith('overrides/') || entry.name.endsWith('/')) continue;
    const rel = entry.name.slice('overrides/'.length);
    if (!rel || rel.includes('..')) continue;
    const dest = path.join(gamePath, rel);
    const data = inflateZipEntry(buf, entry);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
  }
}

function parseZipEntries(buf) {
  // Find End of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const total = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let n = 0; n < total; n += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const compression = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeader = buf.readUInt32LE(offset + 42);
    const name = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
    entries.push({ name, compression, compSize, localHeader });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function inflateZipEntry(buf, entry) {
  const local = entry.localHeader;
  if (buf.readUInt32LE(local) !== 0x04034b50) {
    throw new Error(`Bad local header for ${entry.name}`);
  }
  const nameLen = buf.readUInt16LE(local + 26);
  const extraLen = buf.readUInt16LE(local + 28);
  const dataStart = local + 30 + nameLen + extraLen;
  const compressed = buf.slice(dataStart, dataStart + entry.compSize);
  if (entry.compression === 0) return compressed;
  if (entry.compression === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`Unsupported ZIP compression ${entry.compression}`);
}

module.exports = {
  listInstalled,
  installMod,
  removeMod,
  setModEnabled,
  installModpack,
  getCompatibleVersion,
  MANIFEST_NAME,
};
