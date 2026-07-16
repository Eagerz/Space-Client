/**
 * Space Launcher — Fabric performance mod injection.
 * Downloads/caches Sodium-stack jars under SpaceLauncher/natives and injects via
 * -Dfabric.addMods. No ClickGUI / legacy client core jar.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const FABRIC_API_PREFIX = 'fabric-api-';
const USER_AGENT = 'SpaceLauncher/1.0 (performance-mods)';

/** Pinned Fabric API builds for supported Minecraft versions. */
const FABRIC_API_BY_MC = {
  '1.21.1': '0.116.13+1.21.1',
  '1.21': '0.102.0+1.21',
  '1.21.2': '0.106.1+1.21.2',
  '1.21.3': '0.114.0+1.21.3',
  '1.21.4': '0.119.2+1.21.4',
};

/**
 * Modrinth project IDs for performance mods.
 * Resolved at launch for the selected Minecraft + Fabric loader.
 */
const PERF_MOD_CATALOG = {
  sodium: { id: 'AANobbMI', name: 'Sodium' },
  lithium: { id: 'gvQqBUqZ', name: 'Lithium' },
  'ferrite-core': { id: 'uXXizFIs', name: 'FerriteCore' },
  entityculling: { id: 'NNAgCjsB', name: 'Entity Culling' },
  immediatelyfast: { id: '5ZwdcRci', name: 'ImmediatelyFast' },
  moreculling: { id: '51shyZVL', name: 'MoreCulling' },
  modernfix: { id: 'nmDcB62a', name: 'ModernFix' },
};

/** @typedef {'off'|'lite'|'standard'|'max'} PerfPackId */

const PERF_PACKS = {
  off: {
    id: 'off',
    label: 'Vanilla Fabric',
    desc: 'Fabric loader only — no performance jars',
    mods: [],
    spacePlusOnly: false,
  },
  lite: {
    id: 'lite',
    label: 'Lite Boost',
    desc: 'Sodium + Lithium + FerriteCore — best for low-end PCs',
    mods: ['sodium', 'lithium', 'ferrite-core'],
    spacePlusOnly: false,
  },
  standard: {
    id: 'standard',
    label: 'Standard Boost',
    desc: 'Lite plus Entity Culling & ImmediatelyFast',
    mods: ['sodium', 'lithium', 'ferrite-core', 'entityculling', 'immediatelyfast'],
    spacePlusOnly: false,
  },
  max: {
    id: 'max',
    label: 'Max Boost',
    desc: 'Full stack including MoreCulling & ModernFix — Space+ exclusive',
    mods: [
      'sodium',
      'lithium',
      'ferrite-core',
      'entityculling',
      'immediatelyfast',
      'moreculling',
      'modernfix',
    ],
    spacePlusOnly: true,
  },
};

function defaultNativesDir() {
  if (process.env.SPACE_LAUNCHER_NATIVES || process.env.SPACE_CLIENT_NATIVES) {
    return path.resolve(process.env.SPACE_LAUNCHER_NATIVES || process.env.SPACE_CLIENT_NATIVES);
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'SpaceLauncher', 'natives');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'SpaceLauncher', 'natives');
  }
  return path.join(os.homedir(), '.local', 'share', 'SpaceLauncher', 'natives');
}

function defaultBinDir() {
  if (process.env.SPACE_LAUNCHER_BIN || process.env.SPACE_CLIENT_BIN) {
    return path.resolve(process.env.SPACE_LAUNCHER_BIN || process.env.SPACE_CLIENT_BIN);
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'SpaceLauncher', 'bin');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'SpaceLauncher', 'bin');
  }
  return path.join(os.homedir(), '.local', 'share', 'SpaceLauncher', 'bin');
}

function fabricApiMavenUrl(apiVersion) {
  const enc = encodeURIComponent(apiVersion);
  return `https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/${enc}/fabric-api-${enc}.jar`;
}

function fabricApiJarName(apiVersion) {
  return `${FABRIC_API_PREFIX}${apiVersion}.jar`;
}

function ensureSystemCa() {
  try {
    const tls = require('tls');
    if (typeof tls.setDefaultCACertificates === 'function' && typeof tls.getCACertificates === 'function') {
      tls.setDefaultCACertificates(tls.getCACertificates('system'));
    }
  } catch {
    /* ignore */
  }
}

async function downloadViaElectron(url, destPath) {
  let net;
  try {
    net = require('electron').net;
  } catch {
    return false;
  }
  if (!net?.fetch) return false;

  const res = await net.fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.partial`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, destPath);
  return true;
}

async function downloadFile(url, destPath, redirectsLeft = 5) {
  ensureSystemCa();

  if (await downloadViaElectron(url, destPath)) {
    return;
  }

  await new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.get(
      url,
      {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 90000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects fetching ${url}`));
            return;
          }
          const next = new URL(res.headers.location, url).toString();
          downloadFile(next, destPath, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          return;
        }

        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const tmp = `${destPath}.partial`;
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            try {
              fs.renameSync(tmp, destPath);
              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });
        out.on('error', (err) => {
          try {
            fs.unlinkSync(tmp);
          } catch {
            /* ignore */
          }
          reject(err);
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
    req.on('error', reject);
  });
}

async function fetchJson(url) {
  ensureSystemCa();
  let net;
  try {
    net = require('electron').net;
  } catch {
    net = null;
  }

  if (net?.fetch) {
    const res = await net.fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  return new Promise((resolve, reject) => {
    const lib = url.startsWith('http:') ? http : https;
    const req = lib.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 30000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        fetchJson(new URL(res.headers.location, url).toString()).then(resolve, reject);
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
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`Timeout for ${url}`)));
  });
}

async function ensureFabricApi(mcVersion, nativesPath = defaultNativesDir()) {
  const apiVersion = FABRIC_API_BY_MC[String(mcVersion || '').trim()];
  if (!apiVersion) {
    return {
      ok: false,
      error: `No Fabric API pin for Minecraft ${mcVersion}. Prefer 1.21.1.`,
    };
  }

  const depsDir = path.join(nativesPath, 'deps');
  const jarPath = path.join(depsDir, fabricApiJarName(apiVersion));
  if (fs.existsSync(jarPath) && fs.statSync(jarPath).size > 0) {
    return { ok: true, jarPath, downloaded: false };
  }

  try {
    await downloadFile(fabricApiMavenUrl(apiVersion), jarPath);
    if (!fs.existsSync(jarPath) || fs.statSync(jarPath).size === 0) {
      return { ok: false, error: 'Fabric API download produced an empty file' };
    }
    return { ok: true, jarPath, downloaded: true };
  } catch (err) {
    try {
      if (fs.existsSync(jarPath)) fs.unlinkSync(jarPath);
    } catch {
      /* ignore */
    }
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Resolve the best Fabric primary jar for a Modrinth project + MC version.
 * @param {string} projectId
 * @param {string} mcVersion
 * @returns {Promise<{ ok: boolean, file?: { url: string, filename: string, hashes?: object }, error?: string }>}
 */
async function resolveModrinthJar(projectId, mcVersion) {
  const url =
    `https://api.modrinth.com/v2/project/${encodeURIComponent(projectId)}/version` +
    `?loaders=${encodeURIComponent(JSON.stringify(['fabric']))}` +
    `&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`;

  try {
    const versions = await fetchJson(url);
    if (!Array.isArray(versions) || !versions.length) {
      return { ok: false, error: `No Fabric build for ${projectId} on ${mcVersion}` };
    }
    const preferred =
      versions.find((v) => v.version_type === 'release') ||
      versions.find((v) => v.version_type === 'beta') ||
      versions[0];
    const file =
      preferred.files?.find((f) => f.primary) ||
      preferred.files?.find((f) => String(f.filename || '').endsWith('.jar')) ||
      preferred.files?.[0];
    if (!file?.url || !file?.filename) {
      return { ok: false, error: `No jar file listed for ${projectId}` };
    }
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function ensurePerfMod(modKey, mcVersion, nativesPath) {
  const meta = PERF_MOD_CATALOG[modKey];
  if (!meta) return { ok: false, error: `Unknown perf mod: ${modKey}` };

  const cacheDir = path.join(nativesPath, 'perf', mcVersion);
  fs.mkdirSync(cacheDir, { recursive: true });

  const resolved = await resolveModrinthJar(meta.id, mcVersion);
  if (!resolved.ok || !resolved.file) {
    return { ok: false, error: `${meta.name}: ${resolved.error}` };
  }

  const jarPath = path.join(cacheDir, resolved.file.filename);
  if (fs.existsSync(jarPath) && fs.statSync(jarPath).size > 0) {
    return { ok: true, jarPath, name: meta.name, downloaded: false };
  }

  try {
    await downloadFile(resolved.file.url, jarPath);
    if (resolved.file.hashes?.sha512) {
      const actual = crypto.createHash('sha512').update(fs.readFileSync(jarPath)).digest('hex');
      if (actual !== resolved.file.hashes.sha512) {
        try {
          fs.unlinkSync(jarPath);
        } catch {
          /* ignore */
        }
        return { ok: false, error: `${meta.name}: sha512 mismatch` };
      }
    }
    return { ok: true, jarPath, name: meta.name, downloaded: true };
  } catch (err) {
    return { ok: false, error: `${meta.name}: ${err?.message || String(err)}` };
  }
}

function writeAddModsList(jarPaths, nativesPath = defaultNativesDir()) {
  const listPath = path.join(nativesPath, 'fabric-addMods.txt');
  const body = jarPaths.map((p) => path.resolve(p)).join('\n') + '\n';
  fs.mkdirSync(path.dirname(listPath), { recursive: true });
  fs.writeFileSync(listPath, body, 'utf8');
  return listPath;
}

function normalizePackId(packId) {
  const id = String(packId || 'standard').toLowerCase();
  return PERF_PACKS[id] ? id : 'standard';
}

/**
 * @param {{
 *   nativesPath?: string,
 *   mcVersion?: string,
 *   perfPack?: string,
 *   spacePlus?: boolean,
 *   onProgress?: (msg: string) => void,
 * }} [options]
 */
async function prepareFabricInjection(options = {}) {
  const nativesPath = options.nativesPath || defaultNativesDir();
  const mcVersion = options.mcVersion || '1.21.1';
  const warnings = [];
  const log = typeof options.onProgress === 'function' ? options.onProgress : () => {};

  let packId = normalizePackId(options.perfPack);
  let pack = PERF_PACKS[packId];

  if (pack.spacePlusOnly && !options.spacePlus) {
    warnings.push('Max Boost requires Space+ — falling back to Standard Boost');
    packId = 'standard';
    pack = PERF_PACKS.standard;
  }

  const api = await ensureFabricApi(mcVersion, nativesPath);
  if (!api.ok || !api.jarPath) {
    return {
      ok: false,
      error: `Fabric API required: ${api.error || 'unavailable'}`,
      warnings,
    };
  }
  if (api.downloaded) {
    warnings.push(`Downloaded Fabric API for Minecraft ${mcVersion}`);
    log('Downloaded Fabric API');
  }

  const addMods = [api.jarPath];
  const resolvedMods = [];

  for (const modKey of pack.mods) {
    log(`Preparing ${PERF_MOD_CATALOG[modKey]?.name || modKey}…`);
    const result = await ensurePerfMod(modKey, mcVersion, nativesPath);
    if (!result.ok || !result.jarPath) {
      warnings.push(result.error || `Failed ${modKey}`);
      continue;
    }
    if (result.downloaded) {
      warnings.push(`Downloaded ${result.name}`);
    }
    addMods.push(result.jarPath);
    resolvedMods.push({ key: modKey, name: result.name, jarPath: result.jarPath });
  }

  // Fabric-only (off pack): still inject Fabric API so loader is consistent.
  if (packId === 'off') {
    // api only
  }

  const listPath = writeAddModsList(addMods, nativesPath);
  const listRef = path.resolve(listPath).replace(/\\/g, '/');
  const jvmArg = `-Dfabric.addMods=@${listRef}`;

  return {
    ok: true,
    packId,
    packLabel: pack.label,
    fabricApiPath: api.jarPath,
    addMods,
    resolvedMods,
    jvmArg,
    extraClasspath: addMods,
    warnings,
  };
}

/** Legacy no-op shim — core jar no longer required. */
function verifyAndResolve() {
  return { ok: true, jarPath: null, extraClasspath: [] };
}

function resolveCoreJar() {
  return { ok: false, error: 'legacy client core jar removed — Space Launcher uses performance packs only' };
}

module.exports = {
  FABRIC_API_BY_MC,
  PERF_PACKS,
  PERF_MOD_CATALOG,
  defaultNativesDir,
  defaultBinDir,
  verifyAndResolve,
  prepareFabricInjection,
  ensureFabricApi,
  resolveCoreJar,
  normalizePackId,
};
