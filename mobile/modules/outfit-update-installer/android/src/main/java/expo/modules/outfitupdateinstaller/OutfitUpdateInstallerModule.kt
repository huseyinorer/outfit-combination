package expo.modules.outfitupdateinstaller

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OutfitUpdateInstallerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OutfitUpdateInstaller")

    AsyncFunction<Boolean>("isSupported") {
      val activity = appContext.throwingActivity
      @Suppress("DEPRECATION")
      val packageInfo = activity.packageManager.getPackageInfo(
        activity.packageName,
        PackageManager.GET_PERMISSIONS
      )
      packageInfo.requestedPermissions?.contains(Manifest.permission.REQUEST_INSTALL_PACKAGES) == true
    }

    AsyncFunction<Boolean>("canRequestPackageInstalls") {
      val activity = appContext.throwingActivity
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.packageManager.canRequestPackageInstalls()
    }

    AsyncFunction("openUnknownAppsSettings") {
      val activity = appContext.throwingActivity
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent = Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${activity.packageName}")
        )
        activity.runOnUiThread { activity.startActivity(intent) }
      }
    }

    AsyncFunction("openInstaller") { contentUri: String ->
      val activity = appContext.throwingActivity
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(Uri.parse(contentUri), "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.runOnUiThread { activity.startActivity(intent) }
    }
  }
}
