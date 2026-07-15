/**
 * Resolve Space Client core + Fabric API jars and build fabric.addMods injection.
 * Jars stay under SpaceClient natives/bin — never copied into .minecraft/mods.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { URL } = require('url');

const SHIP_NAME = 'space-client-core.jar';
const RT_NAME = 'space_rt.jar';
const FABRIC_API_PREFIX = 'fabric-api-';

/** Pinned Fabric API builds for Space Client–supported versions. */
const FABRIC_API_BY_MC = {
  '1.21.1': '0.116.13+1.21.1',
  '1.21': '0.102.0+1.21',
  '1.21.2': '0.106.1+1.21.2',
  '1.21.3': '0.114.0+1.21.3',
  '1.21.4': '0.119.2+1.21.4',
};

function readJsonFile(filePath) {
  // PowerShell Set-Content often writes UTF-8 with BOM, which JSON.parse rejects.
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function defaultNativesDir() {
  if (process.env.SPACE_CLIENT_NATIVES) {
    return path.resolve(process.env.SPACE_CLIENT_NATIVES);
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'SpaceClient', 'natives');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'SpaceClient', 'natives');
  }
  return path.join(os.homedir(), '.local', 'share', 'SpaceClient', 'natives');
}

function defaultBinDir() {
  if (process.env.SPACE_CLIENT_BIN) {
    return path.resolve(process.env.SPACE_CLIENT_BIN);
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'SpaceClient', 'bin');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'SpaceClient', 'bin');
  }
  return path.join(os.homedir(), '.local', 'share', 'SpaceClient', 'bin');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

/**
 * Download via Electron Chromium stack when available (trusted system CAs).
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<boolean>} true if handled
 */
async function downloadViaElectron(url, destPath) {
  let net;
  try {
    net = require('electron').net;
  } catch {
    return false;
  }
  if (!net?.fetch) return false;

  const res = await net.fetch(url, {
    headers: { 'User-Agent': 'SpaceClient/1.0 (fabric-api)' },
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

/**
 * Download a file over https/http. Follows redirects.
 * @param {string} url
 * @param {string} destPath
 * @returns {Promise<void>}
 */
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
        headers: { 'User-Agent': 'SpaceClient/1.0 (fabric-api)' },
        timeout: 60000,
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

/**
 * Resolve the first-party Space Client jar (natives preferred, bin/space_rt.jar fallback).
 * @param {string} nativesPath
 * @returns {{ ok: boolean, jarPath?: string, error?: string }}
 */
function resolveCoreJar(nativesPath = defaultNativesDir()) {
  const candidates = [
    path.join(nativesPath, SHIP_NAME),
    path.join(defaultBinDir(), RT_NAME),
    path.join(defaultBinDir(), SHIP_NAME),
  ];

  for (const jarPath of candidates) {
    if (!fs.existsSync(jarPath)) continue;

    const manifestPath = path.join(path.dirname(jarPath), 'natives.manifest.json');
    if (path.basename(jarPath) === SHIP_NAME && fs.existsSync(manifestPath)) {
      try {
        const manifest = readJsonFile(manifestPath);
        const expected = manifest?.files?.[SHIP_NAME]?.sha256;
        if (expected) {
          const actual = sha256File(jarPath);
          if (actual.toLowerCase() !== String(expected).toLowerCase()) {
            return { ok: false, error: 'sha256 mismatch' };
          }
        }
      } catch (err) {
        return { ok: false, error: `manifest read failed: ${err.message}` };
      }
    }

    return { ok: true, jarPath };
  }

  return { ok: false, error: `missing ${SHIP_NAME} (and no ${RT_NAME} fallback)` };
}

/**
 * Ensure fabric-api jar exists for this Minecraft version under natives/deps.
 * @param {string} mcVersion
 * @param {string} nativesPath
 * @returns {Promise<{ ok: boolean, jarPath?: string, error?: string, downloaded?: boolean }>}
 */
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
 * Write a Fabric addMods list file (avoids Windows classpath / backslash pitfalls).
 * @param {string[]} jarPaths
 * @param {string} nativesPath
 * @returns {string} absolute path to the list file
 */
function writeAddModsList(jarPaths, nativesPath = defaultNativesDir()) {
  const listPath = path.join(nativesPath, 'fabric-addMods.txt');
  const body = jarPaths.map((p) => path.resolve(p)).join('\n') + '\n';
  fs.mkdirSync(path.dirname(listPath), { recursive: true });
  fs.writeFileSync(listPath, body, 'utf8');
  return listPath;
}

/**
 * @param {{ nativesPath?: string, mcVersion?: string }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   jarPath?: string,
 *   fabricApiPath?: string,
 *   addMods?: string[],
 *   jvmArg?: string,
 *   extraClasspath?: string[],
 *   error?: string,
 *   warnings?: string[],
 * }>}
 */
async function prepareFabricInjection(options = {}) {
  const nativesPath = options.nativesPath || defaultNativesDir();
  const mcVersion = options.mcVersion || '1.21.1';
  const warnings = [];

  const core = resolveCoreJar(nativesPath);
  if (!core.ok || !core.jarPath) {
    return { ok: false, error: core.error || `missing ${SHIP_NAME}`, warnings };
  }

  const api = await ensureFabricApi(mcVersion, nativesPath);
  if (!api.ok || !api.jarPath) {
    return {
      ok: false,
      jarPath: core.jarPath,
      error: `Fabric API required: ${api.error || 'unavailable'}`,
      warnings,
    };
  }

  if (api.downloaded) {
    warnings.push(`Downloaded Fabric API for Minecraft ${mcVersion}`);
  }

  const addMods = [api.jarPath, core.jarPath];
  const listPath = writeAddModsList(addMods, nativesPath);
  // @-list form is the most reliable across Windows path separators.
  // Prefer forward slashes in the JVM property value to avoid escape pitfalls.
  const listRef = path.resolve(listPath).replace(/\\/g, '/');
  const jvmArg = `-Dfabric.addMods=@${listRef}`;

  return {
    ok: true,
    jarPath: core.jarPath,
    fabricApiPath: api.jarPath,
    addMods,
    jvmArg,
    extraClasspath: addMods,
    warnings,
  };
}

/**
 * Sync resolve used by older callers — core jar only, no Fabric API fetch.
 * Prefer prepareFabricInjection for launch.
 * @returns {{ ok: boolean, jarPath?: string, extraClasspath?: string[], error?: string }}
 */
function verifyAndResolve(nativesPath = defaultNativesDir()) {
  const core = resolveCoreJar(nativesPath);
  if (!core.ok) return core;
  return {
    ok: true,
    jarPath: core.jarPath,
    extraClasspath: [core.jarPath],
  };
}

module.exports = {
  SHIP_NAME,
  RT_NAME,
  FABRIC_API_BY_MC,
  defaultNativesDir,
  defaultBinDir,
  verifyAndResolve,
  prepareFabricInjection,
  ensureFabricApi,
  resolveCoreJar,
};
