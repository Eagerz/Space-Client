package app.spaceclient.apkupdater

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * In-app APK updater for Space Bedrock sideload builds.
 *
 * Pipeline:
 * 1. DownloadManager → app-scoped external files / Download
 * 2. FileProvider content URI (Android 7+)
 * 3. ACTION_VIEW / ACTION_INSTALL_PACKAGE → system install prompt
 */
class SpaceApkUpdaterModule : Module() {
  private data class PendingDownload(val promise: Promise, val expectedFile: File)

  private val pendingDownloads = ConcurrentHashMap<Long, PendingDownload>()

  private val downloadReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
      val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
      val pending = pendingDownloads.remove(id) ?: return
      val appContext = appContext.reactContext ?: run {
        pending.promise.reject("E_NO_CONTEXT", "React context unavailable", null)
        return
      }
      try {
        assertDownloadSuccess(appContext, id)
        val file = when {
          pending.expectedFile.exists() && pending.expectedFile.length() > 1024L ->
            pending.expectedFile
          else -> {
            val localUri = queryDownloadUri(appContext, id)
              ?: throw IllegalStateException("Download finished but file URI was missing.")
            uriToFile(localUri)
              ?: throw IllegalStateException("Could not resolve downloaded APK path.")
          }
        }
        if (!file.exists() || file.length() < 1024) {
          throw IllegalStateException("Downloaded APK is missing or too small.")
        }
        launchInstallIntent(appContext, file)
        pending.promise.resolve(
          mapOf(
            "success" to true,
            "downloadId" to id,
            "path" to file.absolutePath,
          )
        )
      } catch (err: Exception) {
        pending.promise.reject("E_DOWNLOAD_INSTALL", err.message ?: "Download/install failed", err)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("SpaceApkUpdater")

    OnCreate {
      val ctx = appContext.reactContext ?: return@OnCreate
      val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ContextCompat.registerReceiver(
          ctx,
          downloadReceiver,
          filter,
          ContextCompat.RECEIVER_NOT_EXPORTED
        )
      } else {
        @Suppress("DEPRECATION")
        ctx.registerReceiver(downloadReceiver, filter)
      }
    }

    OnDestroy {
      try {
        appContext.reactContext?.unregisterReceiver(downloadReceiver)
      } catch (_: Exception) {
        // already unregistered
      }
      pendingDownloads.clear()
    }

    Function("getVersionCode") {
      val ctx = appContext.reactContext ?: return@Function 0
      val pm = ctx.packageManager
      val pkg = ctx.packageName
      val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(pkg, 0)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.longVersionCode.toInt()
      } else {
        @Suppress("DEPRECATION")
        info.versionCode
      }
    }

    Function("canRequestPackageInstalls") {
      val ctx = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function true
      ctx.packageManager.canRequestPackageInstalls()
    }

    AsyncFunction("openUnknownSourcesSettings") { promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.reject("E_NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      try {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${ctx.packageName}")
          )
        } else {
          Intent(Settings.ACTION_SECURITY_SETTINGS)
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
        promise.resolve(true)
      } catch (err: Exception) {
        promise.reject("E_SETTINGS", err.message ?: "Could not open settings", err)
      }
    }

    /**
     * Install an APK already on disk (cache / files / external-files).
     * @param absolutePath Absolute filesystem path to the .apk
     */
    AsyncFunction("installApk") { absolutePath: String, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.reject("E_NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      try {
        val file = File(absolutePath)
        if (!file.exists()) {
          promise.reject("E_MISSING", "APK not found at $absolutePath", null)
          return@AsyncFunction
        }
        ensureInstallPermission(ctx)
        launchInstallIntent(ctx, file)
        promise.resolve(mapOf("success" to true, "path" to file.absolutePath))
      } catch (err: Exception) {
        promise.reject("E_INSTALL", err.message ?: "Install intent failed", err)
      }
    }

    /**
     * Download an APK via DownloadManager into app-scoped storage, then open the installer.
     * @param apkUrl HTTPS URL of the APK
     * @param fileName Optional destination file name (defaults to space-bedrock-update.apk)
     */
    AsyncFunction("downloadAndInstall") { apkUrl: String, fileName: String?, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.reject("E_NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      try {
        ensureInstallPermission(ctx)
        val safeName = sanitizeFileName(fileName ?: "space-bedrock-update.apk")
        val destDir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
          ?: ctx.cacheDir
        if (!destDir.exists()) destDir.mkdirs()

        // Remove a previous attempt so DownloadManager can overwrite cleanly.
        File(destDir, safeName).takeIf { it.exists() }?.delete()

        val request = DownloadManager.Request(Uri.parse(apkUrl))
          .setTitle("Space Bedrock update")
          .setDescription("Downloading APK…")
          .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setAllowedOverMetered(true)
          .setAllowedOverRoaming(true)
          .setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, safeName)

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
          @Suppress("DEPRECATION")
          request.allowScanningByMediaScanner()
        }

        val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val expectedFile = File(destDir, safeName)
        val id = dm.enqueue(request)
        pendingDownloads[id] = PendingDownload(promise, expectedFile)
      } catch (err: Exception) {
        promise.reject("E_ENQUEUE", err.message ?: "Failed to start download", err)
      }
    }
  }

  private fun ensureInstallPermission(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (ctx.packageManager.canRequestPackageInstalls()) return
    throw IllegalStateException(
      "Install unknown apps is disabled. Open settings and allow Space Bedrock to install updates."
    )
  }

  private fun launchInstallIntent(ctx: Context, apkFile: File) {
    val authority = "${ctx.packageName}.apkupdater.fileprovider"
    val contentUri = FileProvider.getUriForFile(ctx, authority, apkFile)

    // Prefer ACTION_VIEW (modern). Fall back to ACTION_INSTALL_PACKAGE on older APIs.
    val action =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) Intent.ACTION_VIEW
      else Intent.ACTION_INSTALL_PACKAGE

    val intent = Intent(action).apply {
      setDataAndType(contentUri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      if (action == Intent.ACTION_INSTALL_PACKAGE) {
        putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
        putExtra(Intent.EXTRA_RETURN_RESULT, true)
      }
    }

    val resInfoList =
      ctx.packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
    for (resolveInfo in resInfoList) {
      ctx.grantUriPermission(
        resolveInfo.activityInfo.packageName,
        contentUri,
        Intent.FLAG_GRANT_READ_URI_PERMISSION
      )
    }

    ctx.startActivity(intent)
  }

  private fun assertDownloadSuccess(ctx: Context, downloadId: Long) {
    val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    val query = DownloadManager.Query().setFilterById(downloadId)
    dm.query(query).use { cursor ->
      if (!cursor.moveToFirst()) {
        throw IllegalStateException("DownloadManager has no row for id=$downloadId")
      }
      val statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
      val status = if (statusIdx >= 0) cursor.getInt(statusIdx) else -1
      if (status != DownloadManager.STATUS_SUCCESSFUL) {
        val reasonIdx = cursor.getColumnIndex(DownloadManager.COLUMN_REASON)
        val reason = if (reasonIdx >= 0) cursor.getInt(reasonIdx) else -1
        throw IllegalStateException("Download failed (status=$status reason=$reason)")
      }
    }
  }

  private fun queryDownloadUri(ctx: Context, downloadId: Long): Uri? {
    val dm = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    val query = DownloadManager.Query().setFilterById(downloadId)
    dm.query(query).use { cursor ->
      if (!cursor.moveToFirst()) return null
      val uriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
      if (uriIdx < 0) return null
      val uriString = cursor.getString(uriIdx) ?: return null
      return Uri.parse(uriString)
    }
  }

  private fun uriToFile(uri: Uri): File? {
    return when (uri.scheme) {
      "file" -> uri.path?.let { File(it) }
      "content" -> {
        // DownloadManager content URIs often encode a real file path under external-files.
        uri.path?.let { path ->
          // content://.../raw:/storage/... or /storage/...
          val marker = "/raw:"
          val idx = path.indexOf(marker)
          if (idx >= 0) File(path.substring(idx + marker.length))
          else null
        }
      }
      else -> null
    }
  }

  private fun sanitizeFileName(name: String): String {
    val base = name.substringAfterLast('/').substringAfterLast('\\')
    val cleaned = base.replace(Regex("[^A-Za-z0-9._-]"), "_")
    return if (cleaned.endsWith(".apk", ignoreCase = true)) cleaned else "$cleaned.apk"
  }
}
