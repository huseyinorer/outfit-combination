package expo.modules.outfitsubjectsegmenter

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.google.android.gms.common.moduleinstall.InstallStatusListener
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.math.max
import kotlin.math.min

private const val PROGRESS_EVENT = "onPrepareProgress"

class OutfitSubjectSegmenterModule : Module() {
  private var segmenter: SubjectSegmenter? = null

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context is not available")

  private fun client(): SubjectSegmenter {
    segmenter?.let { return it }
    val options = SubjectSegmenterOptions.Builder()
      .enableForegroundBitmap()
      .build()
    return SubjectSegmentation.getClient(options).also { segmenter = it }
  }

  override fun definition() = ModuleDefinition {
    Name("OutfitSubjectSegmenter")

    Events(PROGRESS_EVENT)

    AsyncFunction("prepare") { promise: Promise ->
      ensureModel(
        onReady = { promise.resolve(true) },
        onError = { error -> promise.reject("ERR_MODEL_UNAVAILABLE", error.message, error) },
        onProgress = { downloaded, total ->
          sendEvent(PROGRESS_EVENT, mapOf("bytesDownloaded" to downloaded, "totalBytes" to total))
        },
      )
    }

    AsyncFunction("removeBackground") { uri: String, promise: Promise ->
      ensureModel(
        onReady = { segment(uri, promise, retriesLeft = 2) },
        onError = { error -> promise.reject("ERR_MODEL_UNAVAILABLE", error.message, error) },
      )
    }

    OnDestroy {
      segmenter?.close()
      segmenter = null
    }
  }

  private fun ensureModel(
    onReady: () -> Unit,
    onError: (Exception) -> Unit,
    onProgress: (downloaded: Double, total: Double) -> Unit = { _, _ -> },
  ) {
    val installer = ModuleInstall.getClient(context)
    val api = client()
    installer.areModulesAvailable(api)
      .addOnSuccessListener { availability ->
        if (availability.areModulesAvailable()) {
          onReady()
          return@addOnSuccessListener
        }
        val listener = object : InstallStatusListener {
          override fun onInstallStatusUpdated(update: ModuleInstallStatusUpdate) {
            update.progressInfo?.let { info ->
              onProgress(info.bytesDownloaded.toDouble(), info.totalBytesToDownload.toDouble())
            }
            when (update.installState) {
              ModuleInstallStatusUpdate.InstallState.STATE_COMPLETED -> {
                installer.unregisterListener(this)
                // A client created before the download keeps its failed module load; start fresh.
                resetClient()
                onReady()
              }
              ModuleInstallStatusUpdate.InstallState.STATE_FAILED,
              ModuleInstallStatusUpdate.InstallState.STATE_CANCELED -> {
                installer.unregisterListener(this)
                onError(IllegalStateException("Model download ended with state ${update.installState}"))
              }
              else -> Unit
            }
          }
        }
        val request = ModuleInstallRequest.newBuilder()
          .addApi(api)
          .setListener(listener)
          .build()
        installer.installModules(request)
          .addOnSuccessListener { response ->
            if (response.areModulesAlreadyInstalled()) {
              installer.unregisterListener(listener)
              onReady()
            }
          }
          .addOnFailureListener { error ->
            installer.unregisterListener(listener)
            onError(error)
          }
      }
      .addOnFailureListener { error -> onError(error) }
  }

  private fun resetClient() {
    segmenter?.close()
    segmenter = null
  }

  private fun segment(uri: String, promise: Promise, retriesLeft: Int) {
    val bitmap = try {
      decode(uri)
    } catch (error: Exception) {
      promise.reject("ERR_DECODE", error.message, error)
      return
    }
    client().process(InputImage.fromBitmap(bitmap, 0))
      .addOnSuccessListener { result ->
        val foreground = result.foregroundBitmap
        if (foreground == null) {
          promise.reject("ERR_NO_SUBJECT", "No subject was found in the photo", null)
          return@addOnSuccessListener
        }
        try {
          val cropped = cropToSubject(foreground)
          if (cropped == null) {
            promise.reject("ERR_NO_SUBJECT", "The subject mask was empty", null)
            return@addOnSuccessListener
          }
          val file = File(context.cacheDir, "subject-${System.currentTimeMillis()}.png")
          FileOutputStream(file).use { cropped.compress(Bitmap.CompressFormat.PNG, 100, it) }
          promise.resolve(Uri.fromFile(file).toString())
        } catch (error: Exception) {
          promise.reject("ERR_SAVE", error.message, error)
        }
      }
      .addOnFailureListener { error ->
        // Right after an on-demand install Play services may need a moment before the module loads.
        if (retriesLeft > 0 && error.message?.contains("Failed to load", ignoreCase = true) == true) {
          resetClient()
          Handler(Looper.getMainLooper()).postDelayed({ segment(uri, promise, retriesLeft - 1) }, 1_500)
        } else {
          promise.reject("ERR_SEGMENT", error.message, error)
        }
      }
  }

  private fun decode(uri: String): Bitmap {
    val options = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
    val stream = context.contentResolver.openInputStream(Uri.parse(uri))
      ?: throw IllegalArgumentException("Cannot open $uri")
    return stream.use { BitmapFactory.decodeStream(it, null, options) }
      ?: throw IllegalArgumentException("Cannot decode $uri")
  }

  private fun cropToSubject(source: Bitmap): Bitmap? {
    val width = source.width
    val height = source.height
    val pixels = IntArray(width * height)
    source.getPixels(pixels, 0, width, 0, 0, width, height)
    var left = width
    var top = height
    var right = -1
    var bottom = -1
    for (y in 0 until height) {
      val row = y * width
      for (x in 0 until width) {
        if ((pixels[row + x] ushr 24) > 16) {
          if (x < left) left = x
          if (x > right) right = x
          if (y < top) top = y
          if (y > bottom) bottom = y
        }
      }
    }
    if (right < left || bottom < top) return null
    val pad = (max(right - left, bottom - top) * 0.04f).toInt()
    val x0 = max(0, left - pad)
    val y0 = max(0, top - pad)
    val x1 = min(width - 1, right + pad)
    val y1 = min(height - 1, bottom + pad)
    return Bitmap.createBitmap(source, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
  }
}
