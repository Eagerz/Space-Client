#!/usr/bin/env node
/**
 * Builds mods/space-client-core with Gradle and stages space-client-core.jar
 * into the launcher natives directory (never .minecraft/mods).
 *
 * Usage: node scripts/build-space-client-core.js
 * Requires: JDK 21+ (JAVA_HOME or java on PATH)
 */

'use strict';

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MOD_DIR = path.join(REPO_ROOT, 'mods', 'space-client-core');
const SHIP_NAME = 'space-client-core.jar';
const RT_NAME = 'space_rt.jar';

function binDir() {
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

function nativesDir() {
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

function findJava() {
  if (process.env.JAVA_HOME) {
    const bin = process.platform === 'win32'
      ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
      : path.join(process.env.JAVA_HOME, 'bin', 'java');
    if (fs.existsSync(bin)) return bin;
  }
  return process.platform === 'win32' ? 'java.exe' : 'java';
}

function assertJdk21(javaBin) {
  const probe = spawnSync(javaBin, ['-version'], { encoding: 'utf8' });
  const text = `${probe.stderr || ''}\n${probe.stdout || ''}`;
  if (probe.error) {
    console.error('[mods] JDK not found. Set JAVA_HOME to a JDK 21+ install.');
    console.error(probe.error.message);
    process.exit(1);
  }
  const match = text.match(/version\s+"(\d+)/i);
  const major = match ? Number(match[1]) : 0;
  if (major < 21) {
    console.error(`[mods] JDK 21+ required for Minecraft 1.21+ (found major=${major || 'unknown'}).`);
    process.exit(1);
  }
  console.log(`[mods] Using Java: ${javaBin}`);
}

function runGradle() {
  const isWin = process.platform === 'win32';
  const gradlew = path.join(MOD_DIR, isWin ? 'gradlew.bat' : 'gradlew');
  if (!fs.existsSync(gradlew)) {
    console.error(`[mods] Missing Gradle wrapper: ${gradlew}`);
    process.exit(1);
  }

  console.log('[mods] Running gradlew remapJar …');
  // Quote wrapper path: spawnSync + shell on Windows splits on spaces otherwise.
  const gradlewArg = isWin ? `"${gradlew}"` : gradlew;
  const result = spawnSync(gradlewArg, ['remapJar', '--no-daemon'], {
    cwd: MOD_DIR,
    stdio: 'inherit',
    // Windows paths with spaces (e.g. "Space Client") need shell.
    shell: isWin,
    env: process.env,
  });

  if (result.status !== 0) {
    console.error('[mods] Gradle build failed.');
    process.exit(result.status || 1);
  }
}

function pickBuiltJar() {
  const libs = path.join(MOD_DIR, 'build', 'libs');
  if (!fs.existsSync(libs)) {
    console.error(`[mods] Missing build output dir: ${libs}`);
    process.exit(1);
  }

  const jars = fs.readdirSync(libs)
    .filter((name) => name.endsWith('.jar'))
    .filter((name) => !name.endsWith('-sources.jar'))
    .filter((name) => !name.endsWith('-dev.jar'))
    .filter((name) => !name.includes('-sources'))
    .map((name) => ({ name, full: path.join(libs, name), mtime: fs.statSync(path.join(libs, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  // Prefer remapped ship jar (archives_base_name-version.jar)
  const preferred = jars.find((j) => /^space-client-core-\d/.test(j.name) && !j.name.includes('-dev'));
  const chosen = preferred || jars[0];
  if (!chosen) {
    console.error('[mods] No remapped jar found under build/libs.');
    process.exit(1);
  }
  return chosen.full;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function stageJar(builtJar) {
  const digest = sha256File(builtJar);

  const destDir = nativesDir();
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, SHIP_NAME);
  fs.copyFileSync(builtJar, dest);

  const manifestPath = path.join(destDir, 'natives.manifest.json');
  let manifest = { files: {} };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      manifest = { files: {} };
    }
  }
  if (!manifest.files || typeof manifest.files !== 'object') {
    manifest.files = {};
  }
  manifest.files[SHIP_NAME] = {
    sha256: digest,
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const rtDir = binDir();
  fs.mkdirSync(rtDir, { recursive: true });
  const rtPath = path.join(rtDir, RT_NAME);
  fs.copyFileSync(builtJar, rtPath);
  try {
    fs.chmodSync(rtPath, 0o444);
  } catch {
    // best-effort read-only
  }
  fs.writeFileSync(path.join(rtDir, 'space_rt.sha256'), `${digest}\n`, 'utf8');

  console.log(`[mods] Staged ${dest}`);
  console.log(`[mods] Provisioned ${rtPath}`);
  console.log(`[mods] SHA-256 ${digest}`);
  console.log(`[mods] Manifest ${manifestPath}`);
}

function shouldPublishAppUpdate() {
  if (process.argv.includes('--no-publish')) return false;
  if (process.argv.includes('--publish')) return true;
  if (process.env.SPACE_SKIP_APP_PUBLISH === '1') return false;
  // Default: stage jar only — publishing releases during local crash fixes is noisy.
  return false;
}

function publishAppUpdate() {
  const publishScript = path.join(__dirname, 'publish-app-update.js');
  console.log('[mods] Publishing app update so installed clients see the notification…');
  const result = spawnSync(process.execPath, [publishScript, '--reason', 'jar-build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    console.error('[mods] App publish failed (jar was still staged).');
    process.exit(result.status || 1);
  }
}

function main() {
  if (!fs.existsSync(MOD_DIR)) {
    console.error(`[mods] Mod project missing: ${MOD_DIR}`);
    process.exit(1);
  }
  assertJdk21(findJava());
  runGradle();
  const built = pickBuiltJar();
  console.log(`[mods] Built ${built}`);
  stageJar(built);
  console.log('[mods] Done. Launcher injects from natives — do not copy to .minecraft/mods.');
  if (shouldPublishAppUpdate()) {
    publishAppUpdate();
  }
}

main();
