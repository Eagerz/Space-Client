# Space Bedrock (mobile companion)

Expo app for Minecraft Bedrock — no Java mods, cosmetics, or Space+.

## Run

```bash
cd mobile
cp .env.example .env   # optional; defaults to https://api.spaceclient.app
npm start
```

Then press `a` for Android emulator / Expo Go, or scan the QR code on a device.

## Publish a mobile release (CI)

Android APKs are built by `.github/workflows/mobile-release.yml` on **`mobile-v*`** tags (separate from desktop Electron `v*` tags).

```bash
git tag mobile-v1.0.0
git push origin mobile-v1.0.0
```

Or run **Mobile Release (Space Bedrock)** → **Run workflow** and enter `1.0.0`.

The release asset is named:

`Space-Bedrock-<version>-android.apk`

(e.g. `Space-Bedrock-1.0.0-android.apk`). That release is **not** marked as GitHub “latest”, so desktop `/releases/latest` stays on the Electron launcher.

Optional secrets for a Play-store keystore: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Without them, CI signs with Expo’s debug keystore (sideload / first ship only). iOS IPA is skipped until Apple signing secrets exist.

## Features

- **Home** — Open Bedrock with phone-tier graphics tweaks
- **Bridge** — Join a Space Bridge code via `minecraft://` deep link
- **Account** — Microsoft device-code sign-in
- **Settings** — Phone performance: Low / Mid / High (launcher UI + Bedrock Video recommendations)
- **Android in-app updates** — Sideload builds check `android-arm64` in a cloud manifest, download via `DownloadManager` into app-scoped storage, then open the system installer through `FileProvider`

## Android APK updates (sideload)

Native module: `mobile/modules/space-apk-updater` (Kotlin + `provider_paths.xml`).

1. App compares remote `versionCode` to local `BuildConfig.VERSION_CODE`.
2. If remote is **strictly greater**, Settings → **Download & install** enqueues the APK.
3. Android shows: “Do you want to install an update to this existing application?”

Manifest URL (override with `EXPO_PUBLIC_UPDATE_MANIFEST_URL`):

`https://api.spaceclient.app/v1/mobile/android-update.json`

Example body:

```json
{
  "android-arm64": {
    "version": "1.0.1",
    "versionCode": 10001,
    "apkUrl": "https://github.com/Eagerz/space-client/releases/download/mobile-v1.0.1/Space-Bedrock-1.0.1-android.apk",
    "sha256": "…"
  }
}
```

CI uploads `android-update.json` on every `mobile-v*` release. If the API host is not configured, the app falls back to scanning GitHub `mobile-v*` releases.

Requires a **dev client / release APK** (not Expo Go). Users must allow **Install unknown apps** for Space Bedrock.

## Phone tier

| Tier | Launcher | Game |
|------|----------|------|
| Low | No motion / blur | Aggressive Video cuts; Android may patch `options.txt` |
| Mid | Light blur | Balanced recommendations |
| High | Full Deep Space visuals | Prefer quality |

iOS cannot write Minecraft’s sandbox settings — the app shows a checklist instead.
