package app.spaceclient.apkupdater

import androidx.core.content.FileProvider

/** Dedicated FileProvider so manifest merge does not collide with Expo's default provider. */
class ApkFileProvider : FileProvider()
