package expo.modules.outfitsecuresession

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class OutfitSecureSessionModule : Module() {
  private val alias = "outfit_combination_session_v1"
  private val preferencesName = "outfit_secure_session"

  override fun definition() = ModuleDefinition {
    Name("OutfitSecureSession")

    AsyncFunction("setItem") { key: String, value: String ->
      requireValidKey(key)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
      cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
      val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
      check(preferences().edit()
        .putString("${key}_iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
        .putString("${key}_data", Base64.encodeToString(encrypted, Base64.NO_WRAP))
        .commit()) { "Secure session could not be saved" }
    }

    AsyncFunction<String?>("getItem") { key: String ->
      requireValidKey(key)
      val ivValue = preferences().getString("${key}_iv", null)
      val encryptedValue = preferences().getString("${key}_data", null)
      if (ivValue == null || encryptedValue == null) {
        null
      } else {
        try {
          val cipher = Cipher.getInstance("AES/GCM/NoPadding")
          val iv = Base64.decode(ivValue, Base64.NO_WRAP)
          cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, iv))
          cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
          val clear = cipher.doFinal(Base64.decode(encryptedValue, Base64.NO_WRAP))
          String(clear, Charsets.UTF_8)
        } catch (_: Exception) {
          preferences().edit().remove("${key}_iv").remove("${key}_data").commit()
          null
        }
      }
    }

    AsyncFunction("deleteItem") { key: String ->
      requireValidKey(key)
      check(preferences().edit().remove("${key}_iv").remove("${key}_data").commit()) {
        "Secure session could not be deleted"
      }
    }
  }

  private fun preferences() = appContext.reactContext
    ?.getSharedPreferences(preferencesName, android.content.Context.MODE_PRIVATE)
    ?: throw IllegalStateException("Android application context is unavailable")

  private fun requireValidKey(key: String) {
    require(key.matches(Regex("[A-Za-z0-9_.-]{1,80}"))) { "Invalid secure storage key" }
  }

  private fun encryptionKey(): SecretKey {
    val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build()
    )
    return generator.generateKey()
  }
}
