#!/usr/bin/env node
/**
 * Bump Space Client semver, build the Electron app, and publish to GitHub Releases
 * so installed clients see the in-app update notification.
 *
 * Usage:
 *   node scripts/publish-app-update.js
 *   node scripts/publish-app-update.js --no-bump
 *   node scripts/publish-app-update.js --dry-run
 *
 * Requires GH_TOKEN or GITHUB_TOKEN with repo release write access.
 * Skipped when SPACE_SKIP_APP_PUBLISH=1.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(REPO_ROOT, 'package.json');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    skipBump: argv.includes('--no-bump'),
    reason: (() => {
      const i = argv.indexOf('--reason');
      return i >= 0 && argv[i + 1] ? argv[i + 1] : 'manual';
    })(),
  };
}

function bumpPatch(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)(.*)?$/);
  if (!match) {
    return `${version}.1`;
  }
  const patch = Number(match[3]) + 1;
  return `${match[1]}.${match[2]}.${patch}${match[4] || ''}`;
}

function readPkg() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

function writePkg(pkg) {
  fs.writeFileSync(PKG_PATH, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

function nativesManifestPath() {
  if (process.env.SPACE_CLIENT_NATIVES) {
    return path.join(path.resolve(process.env.SPACE_CLIENT_NATIVES), 'natives.manifest.json');
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'SpaceClient', 'natives', 'natives.manifest.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'SpaceClient', 'natives', 'natives.manifest.json');
  }
  return path.join(os.homedir(), '.local', 'share', 'SpaceClient', 'natives', 'natives.manifest.json');
}

function jarReleaseNote() {
  const manifestPath = nativesManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return 'Includes latest space-client-core.jar staging.';
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
    const entry = manifest?.files?.['space-client-core.jar'];
    if (!entry?.sha256) {
      return 'Includes latest space-client-core.jar staging.';
    }
    const short = String(entry.sha256).slice(0, 12);
    return `Includes space-client-core.jar (sha256 ${short}…).`;
  } catch {
    return 'Includes latest space-client-core.jar staging.';
  }
}

function hasPublishToken() {
  return !!(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
}

function platformBuildScript() {
  if (process.platform === 'win32') return 'build:win';
  if (process.platform === 'darwin') return 'build:mac';
  return 'build:linux';
}

function runPublish({ dryRun, skipBump, reason }) {
  if (process.env.SPACE_SKIP_APP_PUBLISH === '1') {
    console.log('[publish] Skipped (SPACE_SKIP_APP_PUBLISH=1).');
    return 0;
  }

  const pkg = readPkg();
  const oldVersion = pkg.version;
  const newVersion = skipBump ? oldVersion : bumpPatch(oldVersion);

  if (!skipBump && newVersion !== oldVersion) {
    pkg.version = newVersion;
    writePkg(pkg);
    console.log(`[publish] Bumped ${oldVersion} → ${newVersion} (reason: ${reason})`);
  } else {
    console.log(`[publish] Building version ${newVersion} (reason: ${reason})`);
  }

  const note = jarReleaseNote();
  console.log(`[publish] ${note}`);

  if (!hasPublishToken()) {
    console.warn('[publish] GH_TOKEN / GITHUB_TOKEN not set — publish may fail.');
    console.warn('[publish] Create a token with repo scope or run: gh auth login');
  }

  const buildScript = platformBuildScript();
  if (dryRun) {
    console.log(`[publish] Dry run — would run: npm run ${buildScript} -- --publish always`);
    if (!skipBump && newVersion !== oldVersion) {
      pkg.version = oldVersion;
      writePkg(pkg);
      console.log('[publish] Dry run — reverted version bump.');
    }
    return 0;
  }

  const env = { ...process.env };
  if (!String(env.NODE_OPTIONS || '').includes('--use-system-ca')) {
    env.NODE_OPTIONS = [env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ');
  }
  env.ELECTRON_BUILDER_PUBLISH_RELEASE_NOTES = note;

  console.log(`[publish] Building & publishing v${newVersion} (${buildScript})…`);

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npmCmd,
    ['run', buildScript, '--', '--publish', 'always'],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env,
      shell: process.platform === 'win32',
    }
  );

  if (result.status !== 0) {
    if (!skipBump && newVersion !== oldVersion) {
      pkg.version = oldVersion;
      writePkg(pkg);
      console.error('[publish] Rolled back version bump after failed build.');
    }
    return result.status || 1;
  }

  console.log(`[publish] Released v${newVersion} to GitHub Releases.`);
  console.log('[publish] Installed Space Client builds will show the update notification on next check.');
  return 0;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  process.exit(runPublish(args));
}

if (require.main === module) {
  main();
}

module.exports = { runPublish, bumpPatch };
