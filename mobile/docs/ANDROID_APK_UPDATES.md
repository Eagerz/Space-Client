# Space Bedrock — Android in-app APK updater

Sideload-only update path (not Play Store). Uses Android `DownloadManager` + `FileProvider` + package installer intent.

## Native pieces (`modules/space-apk-updater`)

| File | Role |
|------|------|
| `SpaceApkUpdaterModule.kt` | versionCode, DownloadManager, install intent |
| `ApkFileProvider.kt` | Dedicated FileProvider subclass |
| `res/xml/provider_paths.xml` | cache / files / external-files paths |
| `AndroidManifest.xml` | `REQUEST_INSTALL_PACKAGES` + provider |

Authority: `${applicationId}.apkupdater.fileprovider`

## Manifest merge (what prebuild injects)

```xml
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />

<application>
  <provider
    android:name="app.spaceclient.apkupdater.ApkFileProvider"
    android:authorities="${applicationId}.apkupdater.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
      android:name="android.support.FILE_PROVIDER_PATHS"
      android:resource="@xml/provider_paths" />
  </provider>
</application>
```

## JS API

```ts
import { checkForApkUpdate, startApkUpdate } from '@/lib/apkUpdater';

const result = await checkForApkUpdate();
if (result.status === 'available') {
  await startApkUpdate(result.remote);
}
```

Update only when `remote.versionCode > localVersionCode`.
