# Mimari genel bakış

Bu belge Outfit Combination monorepo'sunun çalışan parçalarını, bileşenlerin birbirine nasıl bağlandığını ve mahrem veri akışlarını özetler. Katkıcı için hızlı bir giriş; `README.md` ve `DEPLOYMENT.md` nasıl kurulacağını anlatırken bu belge **neden böyle** ve **ne nerede duruyor** sorusuna odaklanır.

## Bileşenler

```
+-----------+   HTTPS JSON    +------------------+   SQL   +------------------+
|  Android  | --------------> |  Render API      | ------> |  Neon PostgreSQL |
|  (Expo)   | <-------------- |  (ASP.NET 8)     | <------ |  hesap + kota    |
+-----+-----+                 +--------+---------+         +------------------+
      |                                |
      | SQLite + dosya                 | HTTPS multipart (sadece analizde)
      v                                v
+-----------+                 +------------------+
|  Cihaz    |                 |  OpenAI API      |
|  dolabı   |                 |  (Responses)     |
+-----------+                 +------------------+
```

- **Mobil (`mobile/`)** — React Native + Expo SDK 58. TypeScript. Dolap kayıtları ve kıyafet fotoğrafları yalnız cihazda saklanır (SQLite + uygulamanın özel dosya alanı).
- **API (`api/`)** — ASP.NET Core 8 minimal API. Hesap oturumları, kurulum belirteçleri, kota muhasebesi, OpenAI çağrıları, sürüm bilgisi.
- **Neon PostgreSQL** — Hesap profili, kimlik eşleştirmesi, geçici OAuth/e-posta kodları, günlük/aylık AI kullanım sayaçları. Kişisel dolap buraya yazılmaz.
- **OpenAI Responses API** — Yalnız analiz isteğinde küçültülmüş kıyafet fotoğrafı gönderilir. Kombin isteğinde yalnız ID + metin özellikler.
- **Render** — Frankfurt free plan, Docker build, `checksPass` ile otomatik deploy, cold start ~60sn.
- **Expo + EAS + GitHub Actions** — PR'lar testleri çalıştırır, `main` merge'ü OTA yayınlar, `app-version.json` artınca APK üretir.

## Veri konumları özeti

| Veri | Yer | Neden |
| --- | --- | --- |
| Kıyafet fotoğrafı | Cihaz: `expo-file-system` kalıcı dosya alanı | Mahremiyet; sunucuya kopyalanmaz |
| Dolap metadatası (kategori, renk, mevsim, vb.) | Cihaz: SQLite `clothing_items` | Offline çalışır, hesabı değişen cihaz başka bir dolap görür |
| Kombin geçmişi, favoriler, giyim tarihi | Cihaz: SQLite | Hesaba bağlı ama cihazda kalır |
| Hesap profili (e-posta, ad, Google `sub`) | Neon: `app_users`, `account_identity_links` | Hesap oturumu için gerekli |
| AI kullanım sayaçları | Neon: `ai_usage_quota` | Hem hesap hem kurulum UUID'sine karşı atomik kontrol |
| Geçici OAuth/e-posta kodu | Neon: `account_login_attempts`, `email_otp_challenges` | Kısa ömürlü (<10 dk), kodun kendisi açık metin değil |
| Hesap/kurulum access token | Cihaz: Android Keystore ile şifreli dosya depolama | Repo dışı, cihaz kilidine bağlı |

## Kurulum ve hesap UUID akışı

Her APK kurulumu bir kez rastgele **kurulum UUID**'si üretir ve cihazda saklar.

1. Uygulama ilk açılışta `/api/installations/register`'a kurulum UUID'sini gönderir, karşılığında kısa ömürlü **kurulum access token** alır.
2. Kullanıcı Google veya e-posta ile giriş yaptığında, API ayrı bir **hesap UUID**'si üretir. Google `sub` veya doğrulanmış e-posta `account_identity_links` tablosunda hesap UUID'sine bağlanır.
3. Hesap girişi tamamlandığında `/api/account/*/complete` **kullanıcı access token**'ı döner — bu token hem hesap UUID'si hem o anki kurulum UUID'si için imzalıdır.
4. AI uçları (`/api/analyze`, `/api/outfits`) sunucu yapılandırmasına göre ya kurulum ya kullanıcı token'ı ister. Production'da hesap sağlayıcılarından en az biri etkinse kullanıcı token'ı zorunludur.
5. Kullanıcı başka cihaza geçerse Google `sub` veya e-posta aynı hesap UUID'sine çözülür, ama kurulum UUID'si yenidir. Her iki UUID de kotaya katılır (aşağıya bak).

Bu ayrım; profilde ad/e-posta değişse bile uygulamanın dahili hesap kimliğinin değişmeyeceği anlamına gelir. Hesap silindiğinde profil silinir ama kimlik eşleştirme ve kota sayaçları en fazla 13 ay kalır — aynı hesabı silip açarak kotayı sıfırlama suistimali engellenir.

## Çift konulu kota algoritması

Her AI çağrısı atomik olarak **hem** hesap UUID'sinin **hem** kurulum UUID'sinin sayaçlarını okur. Daha sıkı olan sınır uygulanır.

```
günlük_hesap_kullanılan < günlük_limit
          VE
günlük_kurulum_kullanılan < günlük_limit
          VE (aynı kontrol aylık için)
```

Yalnız dört koşul da geçerse sayaçlar bir arttırılır ve istek OpenAI'a geçer. OpenAI hatası dönerse sayaç `RefundAsync` ile geri alınır. Böylece:

- **Hesabını değiştirmek cihaz hakkını yenilemez** — kurulum sayaçları bağımsız.
- **Aynı hesabı başka cihazda açmak hesap hakkını çoğaltmaz** — hesap sayaçları her cihaz için ortak.
- **Hesapsız (misafir) kullanıcı için** hesap UUID'si alanı kurulum UUID'si değeri alır, yani yalnız kurulum kuyruğu üstünde sayaç tutulur.

Varsayılan limitler `UsageQuotaOptions`'ta: günlük 20 analiz / 60 kombin, aylık 300 analiz / 900 kombin.

## Auth akışları

### Google (Web application istemcisi)

```
Mobil ---- POST /api/account/google/start ----> API (yeni state + attempt)
       <------ authorizationUrl --------------
Mobil tarayıcıyı açar
     ---> accounts.google.com/o/oauth2/auth
         (callback: /api/account/google/callback)
API code'u Google'la ExchangeAsync yapar, kısa ömürlü exchangeCode üretir,
tarayıcıyı `outfitcombination://auth?code=...` adresine yönlendirir.
Mobil deep-link'ten code alır
     ---- POST /api/account/google/complete {code} --->
         <---- {accessToken, user, usage} ------
```

Google client secret ve refresh token mobile hiç inmez. Yalnız kısa ömürlü `exchangeCode` deep-link'te geçer.

### Şifresiz e-posta

```
Mobil ---- POST /api/account/email/start {email} --->
API 6 haneli kodu Resend uyumlu sağlayıcıyla gönderir
Kullanıcı kodu uygulamaya girer
Mobil ---- POST /api/account/email/complete {email, code} --->
           <---- {accessToken, user, usage} ------
```

Kod veritabanına **açık metin değil** PBKDF2 hash olarak yazılır, 10 dk içinde en fazla 5 deneme hakkı verilir, yeniden gönderme için soğuma süresi uygulanır.

### Hesapsız (misafir) yolu

Google ve e-posta sağlayıcıları hiç yapılandırılmamışsa development modu, yalnız kurulum token'ıyla AI uçlarına erişime izin verir. Production bu modda **başlamaz**.

## Dolap sahipliği ve hesap geçişi

`clothing_items.ownerId` üç biçimden birini tutar:

- `local` — hesapsız misafir.
- `account:<uuid>` — Google veya e-posta ile giriş yapmış hesap.

Hesap geçişi:

- İlk Google/e-posta girişi, henüz hiçbir hesap için dolap yoksa, **mevcut misafir dolabı bir kez sahiplenir** (`activateWardrobeOwner(userId, claimExistingLocalWardrobe = true)`). Bu tek seferlik; `app_settings` içindeki `local_wardrobe_claimed_by` değeri korur.
- Sonradan farklı bir hesaba geçmek diğer hesabın dolabını **silmez veya taşımaz**. Her hesap kendi kayıtlarını görür.
- Çıkış ise mevcut hesabı yerele geri taşımaz; dolabı o hesaba bağlı tutar, misafir dolabı boş gelir (yeni misafir oturumu).

## Mobil güncelleme kanalları

- **Expo OTA** — Yalnız TypeScript, stil, metin ve asset değişikleri. `mobile/app-version.json` ve `mobile/package.json` aynı sürümde kalır. `main` merge'inde `DEPLOY_ENABLED=true` ise otomatik yayınlanır.
- **APK (dahili)** — Native bağımlılık, Expo eklenti, Android manifest/izin veya SDK değişiminde. `app-version.json` sürümü artınca EAS bir APK üretir ve GitHub Release'a `outfit-combination.apk` olarak koyar.
- **Mobil güncelleyici** — `v1.3.0`+ APK'da uygulama bu asset'i içinde indirir, kurulum ekranını açar. Store `production` profilinde `REQUEST_INSTALL_PACKAGES` izni dahil edilmez.
- **Zorlu güncelleme** — `/api/version` `minimumVersion` döner. Mobil bu değerin altındaysa güncellemeyi erteleyemez.

## Log ve observability

- API `Logging.Console` ile stdout'a yazar. Render bu çıktıyı kendi log görüntüleyicisinde tutar. 
- AI isteklerinde süre ve hatalar `ILogger.LogWarning` ile loglanır; `LogAiInteraction` yardımcısı istek türü (analyze/outfit), kurulum UUID özeti (ilk 8 karakter), süre, hata kategorisini yapısal alanlar olarak çıktıya verir.
- Mobil tarafta kritik hata noktaları `console.warn`'a yazar. Opsiyonel Sentry entegrasyonu için `services/observability.ts` hazırdır; `EXPO_PUBLIC_SENTRY_DSN` verilince başlatılır.

## Testler

### Mobil

`mobile/src/domain/*.test.ts` saf fonksiyon testleri — `outfitEngine`, `apiUrl`, `correctionLearning`, `version`. `node --test` ile çalışır.

### Backend

`api/OutfitCombination.Api.Tests` kendi test koşucusuyla çalışır (ek paket gerekmez). Üst düzey senaryolar:

- Analiz: eksik kategori, yanlış içerik tipi, oversized gövde, imza uyumsuzluğu.
- Kombin: eksik kategori, geçersiz ID, yinelenen kombin, yerel kurallara düşme.
- Belirteç: tahrif edilmiş, süresi dolmuş, kullanıcıya karşı kurulum doğrulaması.
- Kota: hesap+kurulum atomik tüketim/iade.

## Önemli dizin haritası

```
api/
  Program.cs              — endpoint tanımları + auth middleware + rate limiter
  Models/Contracts.cs     — JSON sözleşmeleri
  Services/
    AccountStore.cs             — Neon hesap + kimlik + OAuth/OTP + silme
    InstallationTokenService.cs — HMAC imzalı token üretim/doğrulama
    PersistentUsageQuotaService.cs — Neon üstünde çift konulu kota
    OpenAiWardrobeService.cs    — analiz + kombin OpenAI çağrıları
    GoogleOAuthService.cs       — Web OAuth exchange
    EmailOtpSender.cs           — Resend uyumlu kod gönderimi
    MobileVersionService.cs     — app-version.json yükleyici
    OutfitRules.cs              — yerel kombin kuralları ve AI yanıtı doğrulama

mobile/
  App.tsx
  app.config.ts           — Expo config, platform ayarları
  app-version.json        — native sürüm; APK üretimi bu değere bağlı
  src/
    data/database.ts      — SQLite şeması + sorgular + hesap sahipliği
    domain/               — saf iş mantığı ve testleri
    services/             — API, auth, yerel dosya, APK güncelleme, Sentry (opsiyonel)
    screens/              — ekran bileşenleri
    components/           — paylaşımlı UI
    theme/                — tema değişkenleri (açık/koyu/sistem)
    locales/              — tr/en çeviriler
```

## Yaygın değişiklik tarifleri

- **Yalnız metin / stil / lokalizasyon** → OTA ile yeter. `app-version.json` artırma.
- **Yeni Android izni, native modül, Expo eklenti** → `app-version.json` + `package.json` sürümünü eşit şekilde artır; EAS yeni APK üretir.
- **Yeni AI prompt veya model** → Backend-only; `OpenAiWardrobeService.cs` + `OpenAI__Model` env.
- **Yeni kota alanı** → `UsageQuotaOptions` + `PersistentUsageQuotaService` + mobil `UsageSnapshot` tüketicisi.
- **Yeni hesap sağlayıcısı** → `AccountStore` kimlik bağlama + `Program.cs` endpoint + `account/config` JSON + mobil `accountAuth.ts`.
