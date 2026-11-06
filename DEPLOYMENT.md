# GitHub, EAS ve Render yayın akışı

Bu proje Android odaklı bir monorepo olarak hazırlanmıştır. Mobil dolap verisi ve fotoğraflar cihazda kalır; Render'daki API yalnızca OpenAI analizi, AI kombin önerisi ve uygulama sürüm bilgisini sunar. Bu nedenle ilk sürümde Neon veya başka bir sunucu veritabanı gerekmez.

## Otomatik akış

| Olay | Otomatik işlem | Telefona etkisi |
| --- | --- | --- |
| Pull request açılması | Mobil typecheck/test ve .NET build/test | Yayın yapılmaz |
| `main` dalına merge | Aynı kontroller ve Render deploy; ilk kurulum etkinleştirildikten sonra EAS Update | JS ve görseller uygulamanın sonraki açılışında OTA gelir |
| `app-version.json` sürümü yükseltilerek merge | Bunlara ek olarak EAS bir APK üretir ve GitHub Release'a `outfit-combination.apk` ekler | Uygulama açılışta yeni APK'yı zorunlu gösterir |

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
MobileUpdate__AndroidDownloadUrl=https://github.com/huseyinorer/outfit-combination/releases/latest/download/outfit-combination.apk
```

`OpenAI__Model` varsayılan olarak `gpt-5.4-mini` ayarlanmıştır ve Render ortam değişkeninden değiştirilebilir. Anahtar yalnız Render backend'inde bulunur; APK'ya, Expo ortamına veya Git'e girmez.

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

İlk başarılı sürüm iş akışından sonra GitHub deposunda **Releases > v1.0.0 > outfit-combination.apk** dosyasını indir. APK'yı BlueStacks penceresine sürükleyip bırakabilir veya sağdaki **Install APK** düğmesinden seçebilirsin.

Uygulama daha sonra yeni native sürüm görürse **APK'yı indir** düğmesini gösterir. İndirilen APK mevcut uygulamanın üzerine kurulduğu sürece SQLite dolabı ve fotoğraflar korunur. Uygulamayı önce kaldırırsan Android uygulama verisini de siler.

## 5. Neon ne zaman gerekir?

Şu anda gerekmez. Dolap kayıtları SQLite'ta, fotoğraflar telefonun kalıcı uygulama alanındadır; Render dosya sistemine kullanıcı verisi yazılmaz. Üyelik, birden çok cihaz arasında senkronizasyon veya bulut yedekleme eklenirse Neon Postgres o aşamada anlamlı olur. O durumda fotoğraflar yine Neon'a değil bir obje depolama servisine konmalıdır.
