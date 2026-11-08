# GitHub, EAS ve Render yayın akışı

Bu proje Android odaklı bir monorepo olarak hazırlanmıştır. Mobil dolap verisi ve fotoğraflar cihazda kalır; Render'daki API Google hesap oturumu, kullanıcı bazlı AI hakkı, OpenAI analizi, AI kombin önerisi ve uygulama sürüm bilgisini sunar. Neon hesap profili ve kalıcı günlük/aylık AI kullanım sayaçları için kullanılır; kişisel dolabın sunucu veritabanına kopyalanmaz.

## Otomatik akış

| Olay | Otomatik işlem | Telefona etkisi |
| --- | --- | --- |
| Pull request açılması | Mobil typecheck/test ve .NET build/test | Yayın yapılmaz |
| `main` dalına merge | Aynı kontroller ve Render deploy; ilk kurulum etkinleştirildikten sonra EAS Update | JS ve görseller uygulamanın sonraki açılışında OTA gelir |
| `app-version.json` sürümü yükseltilerek merge | Bunlara ek olarak EAS bir APK üretir ve GitHub Release'a `outfit-combination.apk` ekler | Uygulama yeni APK'yı bildirir; yalnız `minimumVersion` altındaki sürümler zorunlu güncellenir |

Native bağımlılık, Expo eklentisi, Android manifest/izin veya SDK değişikliği yeni APK gerektirir. Yalnız TypeScript, stil, metin ve asset değişiklikleri için sürümü yükseltmeden OTA yayın yeterlidir. Expo burada yalnız çoklu platform için değil; kamera/dosya/SQLite entegrasyonunu ve imzalı Android bulut derlemesiyle OTA kanalını yönetmek için kullanılır.

## 1. GitHub deposunu oluşturma

GitHub'da `outfit-combination` adında boş bir depo oluştur. Güncelleme bağlantısının BlueStacks'te giriş istemeden çalışması için en kolay seçenek deponun **public** olmasıdır. Kaynakta anahtar bulunmaz; sırlar GitHub ve Render ayarlarında kalır. Private depo kullanırsan Release APK bağlantısı tarayıcıda GitHub oturumu isteyebilir.

Proje kökünde:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination
git add .
git commit -m "Set up Outfit Combination CI and deployment"
git remote add origin https://github.com/huseyinorer/outfit-combination.git
git push -u origin main
```

Depoyu web arayüzü yerine GitHub CLI ile oluşturmak istersen `gh auth login` ardından `gh repo create outfit-combination --public --source . --remote origin --push` kullanabilirsin.

## 2. GitHub Actions ve Expo ayarı

1. Expo hesabında **Access tokens** sayfasından bir token oluştur.
2. GitHub deposunda **Settings > Secrets and variables > Actions > New repository secret** aç.
3. Adı `EXPO_TOKEN`, değeri oluşturduğun token olsun.
4. İlk push'ta yalnız testlerin çalışması normaldir. Render servisini kurup gerçek URL'yi öğrendikten sonra Expo projesinin **Environment variables > production** alanına aşağıdakini ekle:

```text
EXPO_PUBLIC_API_URL=https://outfit-combination-api.onrender.com
```

5. GitHub'da **Settings > Secrets and variables > Actions > Variables > New repository variable** altında `DEPLOY_ENABLED=true` ekle.
6. GitHub'da **Actions > Test, publish and release > Run workflow** ile süreci yeniden çalıştır.

Mevcut sürümün GitHub Release APK bağlantısı 5xx hatası verirse aynı ekranda `rebuild_apk` seçeneğini işaretleyip workflow'u çalıştır. İş akışı mevcut sürümü yeniden derler, `outfit-combination.apk` asset'ini güvenli şekilde değiştirir, boyutunu ve indirilebilirliğini doğrular.

Render hizmetinin gerçek adresi farklı oluşursa Expo değerini onunla değiştir. `DEPLOY_ENABLED` kapısı, ilk kurulum tamamlanmadan yanlış API adresli APK yayınlanmasını engeller; değişken `true` olduktan sonra her `main` merge'i otomatik yayınlanır.

EAS hesabında bu Android uygulaması için henüz imzalama anahtarı yoksa ilk seferi kendi PowerShell'inde etkileşimli çalıştır:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\mobile
npm install
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

EAS sorduğunda yeni Android keystore oluşturmasını seç. Bu bir defalık hazırlıktan sonra GitHub Actions aynı EAS kimliğini kullanarak etkileşimsiz APK üretebilir.

Workflow her `main` merge'inde OTA yayınlar. `mobile/app-version.json` ve `mobile/package.json` aynı sürümde değilse kontrol bilinçli olarak başarısız olur. Native APK çıkarmak istediğinde ikisini de örneğin `1.0.1` yapıp merge et.

## 3. Render API ayarı

1. Render Dashboard'da **New > Blueprint** seç ve GitHub deposunu bağla.
2. Kök dizindeki `render.yaml` algılanınca servisi oluştur.
3. Blueprint'in istediği gizli değerleri doldur:

```text
OPENAI_API_KEY=sk-...
AppSecurity__TokenSigningKey=en-az-32-bayt-rastgele-gizli-deger
UsageQuota__ConnectionString=Host=NEON_HOST;Database=neondb;Username=NEON_USER;Password=NEON_PASSWORD;SSL Mode=Require
MobileUpdate__AndroidDownloadUrl=https://github.com/huseyinorer/outfit-combination/releases/latest/download/outfit-combination.apk
```

`OpenAI__Model` varsayılan olarak `gpt-5.4-mini` ayarlanmıştır ve Render ortam değişkeninden değiştirilebilir. Anahtar yalnız Render backend'inde bulunur; APK'ya, Expo ortamına veya Git'e girmez.

`AppSecurity__TokenSigningKey` için parola kullanma; rastgele en az 32 bayt üret ve yalnız Render Secret olarak sakla. Üretim backend'i bu değer eksik veya kısa olduğunda bilinçli olarak açılmaz. Analiz ve kombin uçları yalnız sunucunun imzaladığı kurulum belirteçlerini kabul eder; mobil uygulama süresi dolan belirteci otomatik yeniler.

`UsageQuota__ConnectionString` için Neon Dashboard'daki **Connect** ekranından PostgreSQL bağlantı bilgilerini al ve Render Secret olarak ekle. Backend ilk AI isteğinde `ai_usage_quota` tablosunu ve indeksini otomatik oluşturur. Günlük ve aylık analiz/kombin sayaçları atomik artırılır; 13 aydan eski dönemler temizlenir. Production ortamında Neon bağlantısı yoksa veya doğrulanamıyorsa maliyeti korumak için OpenAI isteği gönderilmez.

### Google hesabını etkinleştirme

Hesap özelliği varsayılan olarak kapalıdır; üç ayar birlikte verilmeden backend eski kurulum belirteciyle çalışmaya devam eder. Önce `v1.2.0` veya daha yeni APK'nın telefona kurulduğunu doğrula. Ardından Google Cloud Console'da OAuth izin ekranını hazırla ve **Web application** türünde bir OAuth 2.0 istemcisi oluştur. Branding alanlarında şu adresleri kullan:

```text
Application home page: https://huseyinorer.github.io/outfit-combination/
Privacy policy: https://huseyinorer.github.io/outfit-combination/privacy.html
Terms of service: https://huseyinorer.github.io/outfit-combination/terms.html
Authorized domain: huseyinorer.github.io
```

**Web application** istemcisinin yetkili dönüş adresi birebir şu olmalı:

```text
https://outfit-combination-api.onrender.com/api/account/google/callback
```

Render **Environment** alanına üç değeri birlikte ekle:

```text
AccountAuth__GoogleClientId=....apps.googleusercontent.com
AccountAuth__GoogleClientSecret=...
AccountAuth__CallbackUrl=https://outfit-combination-api.onrender.com/api/account/google/callback
```

Kaydedip deploy et. `GET /api/account/config` yanıtı `{"enabled":true}` olduğunda Ayarlar'da **Hesabım** kartı görünür ve AI işlemleri Google oturumu ister. Eski APK'ların AI çağrısını kaybetmemesi için hesap zorunluluğunu yalnız `v1.2.0` yayınlandıktan sonra aç; herkese dağıtımda ayrıca `MobileUpdate__MinimumVersion=1.2.0` yap.

İkinci Neon veritabanı gerekmez. İlk Google girişinde `account_principals`, `app_users`, `account_oauth_attempts` ve `account_exchange_codes` tabloları aynı bağlantıda otomatik oluşur. Hesap silindiğinde e-posta/ad/Google kimliği kaldırılır; kota silip yeniden hesap açarak suistimal edilmesin diye profilden ayrılmış kullanım kimliği ve sayaçları en fazla 13 ay korunur. Google client secret yalnız Render'da bulunur; Expo veya GitHub değişkenine yazılmaz.

`render.yaml`, Frankfurt bölgesinde ücretsiz `free` web service planını seçer. Ödeme bilgisi gerekmez; ancak servis 15 dakika boşta kalınca kapanır ve ilk istek yaklaşık bir dakika bekleyebilir. Mobil analiz ve kombin istekleri bu soğuk başlangıca izin vermek için 90 saniye zaman aşımı kullanır. İlk istek yine de kesilirse fotoğraf taslağı kaybolmaz; yeniden denendiğinde uyanmış servis yanıt verir.

Render `After CI Checks Pass` modundadır. Böylece `main` değişikliği önce GitHub testlerinden geçer, sonra Docker ile ASP.NET API yayımlanır. Sağlık adresi:

```text
https://SERVIS-ADIN.onrender.com/health
```

Sürüm adresi:

```text
https://SERVIS-ADIN.onrender.com/api/version
```

## 4. BlueStacks'e ilk APK kurulumu

İlk başarılı sürüm iş akışından sonra GitHub deposunda **Releases > en yeni sürüm > outfit-combination.apk** dosyasını indir. APK'yı BlueStacks penceresine sürükleyip bırakabilir veya sağdaki **Install APK** düğmesinden seçebilirsin.

`v1.3.0` ve sonraki dahili APK'lar yeni sürümü uygulamanın içinde indirir, ilerlemeyi gösterir ve indirme bitince Android kurulum ekranını açar. Android ilk kullanımda **Bu kaynaktan uygulama yüklemeye izin ver** ayarını ve her güncellemede açık kurulum onayını ister; uygulama güvenlik nedeniyle sessiz kurulum veya otomatik onay yapamaz. `v1.2.0 → v1.3.0` geçişinde eski sürüm bu özelliği henüz içermediği için tarayıcıyla son bir kez güncelleme gerekir.

Normal güncellemeler **Daha sonra** ile ertelenebilir; güvenlik veya uyumluluk nedeniyle Render'daki `MobileUpdate__MinimumVersion` yükseltilirse eski sürüm zorunlu güncellenir. APK mevcut uygulamanın üzerine kurulduğu sürece SQLite dolabı ve fotoğraflar korunur. Uygulamayı önce kaldırırsan Android uygulama verisini de siler. Google Play için üretilen `production` profili `REQUEST_INSTALL_PACKAGES` iznini bilinçli olarak içermez; mağaza dağıtımında güncellemeler Play üzerinden yapılmalıdır.

## 5. Gizlilik politikasını yayınlama

Depo ayarlarında **Settings > Pages > Build and deployment > Source** alanını **GitHub Actions** yap. `main` dalına `privacy-site/` değişikliği geldiğinde `Publish privacy policy` workflow'u uygulama sayfasını ve yasal metinleri otomatik yayımlar:

```text
https://huseyinorer.github.io/outfit-combination/
https://huseyinorer.github.io/outfit-combination/privacy.html
https://huseyinorer.github.io/outfit-combination/terms.html
```

Play Console gizlilik politikası alanına `privacy.html` adresini yaz. Uygulamanın Ayarlar ekranı da aynı adrese gider. Mağaza başvurusundan önce geliştirici unvanını ve iletişim yöntemini `privacy-site/privacy.html`, uygulama içi politika ve Play Console ile birebir eşleştir. Data Safety cevap taslağı `docs/PLAY_DATA_SAFETY_TR.md` dosyasındadır.

## 6. Neon ne zaman gerekir?

Neon hesap profili ile kalıcı AI kullanım kotası için kullanılır. Dolap kayıtları ve fotoğraflar hâlâ telefondadır; Render veya Neon'a kişisel dolap kopyası yazılmaz. Çoklu cihaz senkronizasyonu veya bulut yedekleme daha sonra eklenirse metadata Neon'da, fotoğraflar ise obje depolama servisinde tutulmalıdır.
