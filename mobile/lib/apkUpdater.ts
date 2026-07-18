import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getApiBase } from '@/lib/api';
import {
  canRequestPackageInstalls,
  downloadAndInstall,
  getNativeVersionCode,
  isApkUpdaterAvailable,
  openUnknownSourcesSettings,
} from 'space-apk-updater';

/** Public cloud update manifest (android-arm64 block). */
export type AndroidArm64Manifest = {
  version: string;
  versionCode: number;
  apkUrl: string;
  sha256?: string;
  notes?: string;
};

export type UpdateManifest = {
  'android-arm64'?: AndroidArm64Manifest;
  android?: AndroidArm64Manifest;
};

export type UpdateCheckResult =
  | { status: 'unsupported' }
  | { status: 'up-to-date'; localVersionCode: number; remoteVersionCode: number }
  | {
      status: 'available';
      localVersionCode: number;
      remote: AndroidArm64Manifest;
    }
  | { status: 'error'; message: string };

function getManifestUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_UPDATE_MANIFEST_URL?.trim();
  if (fromEnv) return fromEnv;
  return `${getApiBase()}/v1/mobile/android-update.json`;
}

/** Local versionCode: native BuildConfig when available, else expo config. */
export function getLocalVersionCode(): number {
  if (Platform.OS === 'android' && isApkUpdaterAvailable()) {
    const native = getNativeVersionCode();
    if (native > 0) return native;
  }
  const fromExpo =
    Constants.expoConfig?.android?.versionCode ??
    (Constants as { nativeBuildVersion?: string }).nativeBuildVersion;
  const n = Number(fromExpo);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function fetchUpdateManifest(): Promise<UpdateManifest> {
  const url = getManifestUrl();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      return (await res.json()) as UpdateManifest;
    }
  } catch {
    // fall through to GitHub
  }
  return fetchManifestFromGitHubReleases();
}

/**
 * Fallback when API host has no manifest yet: scan recent mobile-v* GitHub releases
 * for Space-Bedrock-*-android.apk and synthesize an android-arm64 block.
 */
async function fetchManifestFromGitHubReleases(): Promise<UpdateManifest> {
  const repo = process.env.EXPO_PUBLIC_GITHUB_REPO?.trim() || 'Eagerz/space-client';
  const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Update manifest HTTP ${res.status}`);
  }
  const releases = (await res.json()) as Array<{
    tag_name?: string;
    assets?: Array<{ name?: string; browser_download_url?: string }>;
  }>;
  if (!Array.isArray(releases)) {
    throw new Error('Unexpected GitHub releases response.');
  }

  const ordered = [
    ...releases.filter((r) => /^mobile-v/i.test(r.tag_name || '')),
    ...releases.filter((r) => !/^mobile-v/i.test(r.tag_name || '')),
  ];

  for (const release of ordered) {
    const asset = (release.assets || []).find((a) => {
      const n = String(a.name || '').toLowerCase();
      return n.endsWith('.apk') && /space[-_]?bedrock/.test(n);
    });
    if (!asset?.browser_download_url) continue;

    const tag = String(release.tag_name || '');
    const version = tag.replace(/^mobile-v/i, '').replace(/^v/i, '');
    const core = version.split(/[-+]/)[0] || '0.0.0';
    const [maj, min, pat] = core.split('.').map((x) => Number(x) || 0);
    const versionCode = maj * 10000 + min * 100 + pat;

    return {
      'android-arm64': {
        version: core,
        versionCode,
        apkUrl: asset.browser_download_url,
        notes: `From GitHub release ${tag}`,
      },
    };
  }

  throw new Error('No Space Bedrock Android APK found in recent releases.');
}

function pickAndroidBlock(manifest: UpdateManifest): AndroidArm64Manifest | null {
  const block = manifest['android-arm64'] || manifest.android;
  if (!block?.apkUrl || typeof block.versionCode !== 'number') return null;
  return block;
}

/**
 * Compare remote android-arm64.versionCode against local BuildConfig.VERSION_CODE.
 * Triggers update UI only when remote is strictly greater.
 */
export async function checkForApkUpdate(): Promise<UpdateCheckResult> {
  if (Platform.OS !== 'android' || !isApkUpdaterAvailable()) {
    return { status: 'unsupported' };
  }

  const localVersionCode = getLocalVersionCode();

  try {
    const manifest = await fetchUpdateManifest();
    const remote = pickAndroidBlock(manifest);
    if (!remote) {
      return { status: 'error', message: 'Manifest missing android-arm64 block.' };
    }
    if (remote.versionCode > localVersionCode) {
      return { status: 'available', localVersionCode, remote };
    }
    return {
      status: 'up-to-date',
      localVersionCode,
      remoteVersionCode: remote.versionCode,
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Could not check for updates.',
    };
  }
}

/**
 * Download APK via Android DownloadManager into app-scoped storage,
 * then launch the system package installer through FileProvider.
 */
export async function startApkUpdate(remote: AndroidArm64Manifest): Promise<void> {
  if (!isApkUpdaterAvailable()) {
    throw new Error('In-app updates require a native Android build (not Expo Go).');
  }

  if (!canRequestPackageInstalls()) {
    await openUnknownSourcesSettings();
    throw new Error(
      'Allow “Install unknown apps” for Space Bedrock, then tap Update again.'
    );
  }

  const fileName = `Space-Bedrock-${remote.version}-android.apk`;
  await downloadAndInstall(remote.apkUrl, fileName);
}

export { canRequestPackageInstalls, openUnknownSourcesSettings, isApkUpdaterAvailable };
