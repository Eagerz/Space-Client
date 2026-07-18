import { requireNativeModule, Platform } from 'expo-modules-core';

export type InstallResult = {
  success: boolean;
  path?: string;
  downloadId?: number;
};

type SpaceApkUpdaterNative = {
  getVersionCode(): number;
  canRequestPackageInstalls(): boolean;
  openUnknownSourcesSettings(): Promise<boolean>;
  installApk(absolutePath: string): Promise<InstallResult>;
  downloadAndInstall(apkUrl: string, fileName?: string | null): Promise<InstallResult>;
};

function loadNative(): SpaceApkUpdaterNative | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireNativeModule<SpaceApkUpdaterNative>('SpaceApkUpdater');
  } catch {
    return null;
  }
}

const Native = loadNative();

export function isApkUpdaterAvailable(): boolean {
  return Native != null;
}

export function getNativeVersionCode(): number {
  if (!Native) return 0;
  return Native.getVersionCode();
}

export function canRequestPackageInstalls(): boolean {
  if (!Native) return false;
  return Native.canRequestPackageInstalls();
}

export async function openUnknownSourcesSettings(): Promise<boolean> {
  if (!Native) return false;
  return Native.openUnknownSourcesSettings();
}

export async function installApk(absolutePath: string): Promise<InstallResult> {
  if (!Native) throw new Error('APK updater is Android-only.');
  return Native.installApk(absolutePath);
}

export async function downloadAndInstall(
  apkUrl: string,
  fileName?: string
): Promise<InstallResult> {
  if (!Native) throw new Error('APK updater is Android-only.');
  return Native.downloadAndInstall(apkUrl, fileName ?? null);
}
