# Outfit Combination

Türkçe, tek kullanıcılı bir kişisel gardırop ve kombin öneri uygulaması. Mobil uygulama kıyafet kayıtlarını SQLite'ta, fotoğrafları uygulamanın kalıcı belge alanında tutar. Backend yalnızca fotoğraf analizi ve metinsel gardırop verisinden kombin önerisi için kullanılır.

## Proje yapısı

- `mobile/`: React Native + Expo SDK 58 + TypeScript
- `api/`: ASP.NET Core 8 Web API
- `api/OutfitCombination.Api.Tests/`: ek test paketi istemeyen küçük backend test koşucusu

GitHub Actions, EAS OTA/APK ve Render otomatik dağıtım kurulumu için [DEPLOYMENT.md](./DEPLOYMENT.md) dosyasını izle. İlk sürümde Neon gerekmez; kullanıcı verisi cihazdaki SQLite ve kalıcı dosya alanında kalır.

Uygulama ilk açılışta **Demo modu** ile başlar. Demo modunda API anahtarı ve çalışan bilgisayar gerekmez: kendi fotoğrafını çekebilir/seçebilir, alanları elle girebilir ve kayıtlı kıyafetlerden yerel kurallarla kombin alabilirsin. Örnek kıyafetler dolaba otomatik eklenmez.

## Hazır özellikler

- Üst, Alt ve Ayakkabı filtreli fotoğraf odaklı Dolabım ekranı
- Kamera/galeri, kategoriye özel çekim yönlendirmesi ve görüntü yönünü normalize eden tek seferlik yeniden boyutlandırma
- Kamera/galeri geçici yolundan bağımsız, uygulama belge alanında kalıcı fotoğraf
- Analiz kesilirse SQLite'ta yarım kalan taslak, `Yeniden dene` ve `Elle tamamla`
- AI alanlarını onaylama/düzeltme; kayıt düzenleme ve fotoğrafla birlikte silme
- Aynı kayıt için benzersiz ID ve çift Kaydet dokunuşuna karşı kilit
- Üç tercihle AI veya yerel kombin üretimi
- AI kombin isteğinde yalnız metinsel özellikler ve ID'ler; fotoğraf/base64/URI/dosya yolu yok
- ID, kategori ve tekrar doğrulaması; sınırlı AI yeniden denemesi; yerel tamamlama
- Bir üçlü mümkünse bir, iki üçlü mümkünse iki, en az üç mümkünse üç farklı sonuç
- Gerçek fotoğraflı, animasyonlu yatay sonuç kartları

Güvenilir bir arka plan ayırma modeli bu küçük ilk sürüme eklenmedi. Bu nedenle `cutoutUri` hazır değilken dikdörtgen fotoğraflar 2D figürün üstüne yığılmaz; üç gerçek parça düzenli bir **kombin panosu** olarak gösterilir. `OutfitPreview` bileşeni, ileride güvenilir şeffaf kopyalar üretildiğinde üst/alt/ayakkabıyı figürün doğru bölgelerine yerleştirecek yolu da içerir.

## 1. Demo modunda mobil uygulamayı çalıştırma

Gerekenler: Node.js LTS, fiziksel Android telefon ve geliştirme sırasında Expo uyumlu istemci veya development build.

PowerShell'de:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\mobile
npm install
npx expo install --fix
npm run typecheck
npm test
npx expo start --clear
```

Bu çalışma ortamında npm yalnız önbellekten kurulum yapabildiği için yeni eklenen `expo-updates` paketi indirilemedi. Normal internet bağlantılı PowerShell'de `npm install` çalıştırıldığında paket ve `package-lock.json` otomatik tamamlanır. Ardından `npx expo install --fix`, Expo SDK 58 ile uyumlu yama sürümlerini doğrular.

Uygulamada **Ayarlar > Demo modu** seçili kalsın. Kıyafet eklerken analiz yapılmaz; alanları elle doldurup kaydedebilirsin. Uygulamayı kapatıp açtığında SQLite kayıtları ve kalıcı fotoğraflar korunur.

## 2. Backend ve gerçek AI modu

Backend tek sağlayıcı olarak OpenAI Responses API kullanır. Görsel `input_image` veri URL'siyle yalnız analiz çağrısında gönderilir. Her iki AI yanıtı da `text.format` içindeki katı `json_schema` ile alınır. Uygulama, OpenAI'nin resmi [görsel girdi](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses) ve [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) belgelerindeki REST sözleşmesine göre yazıldı.

Bu bilgisayarda .NET 8 SDK `8.0.427` kurulu. PowerShell'de:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\api
$env:OPENAI_API_KEY="kendi-anahtarin"
$env:OpenAI__Model="gpt-5.4-mini"
dotnet restore
dotnet build
dotnet run --urls http://0.0.0.0:5080
```

Model adı koda gömülü değildir; görsel okuyabilen ve hesabında erişilebilir bir model adı `OpenAI__Model` ile verilir. API anahtarını `appsettings.json`, mobil `.env`, kaynak kodu veya Git'e yazma. İstersen standart `OPENAI_API_KEY` yerine yalnız backend tarafından okunan `$env:OpenAI__ApiKey` de kullanabilirsin.

Bilgisayarda sağlık kontrolü:

```powershell
Invoke-RestMethod http://localhost:5080/health
```

## 3. Telefonu aynı yerel ağdaki API'ye bağlama

Bu geliştirme oturumunda bilgisayarın etkin Ethernet IPv4 adresi `192.168.1.110` olarak görüldü. DHCP nedeniyle değişebilir; güncel adresi bulmak için:

```powershell
ipconfig
```

Telefon ve bilgisayar aynı modem/LAN üzerinde olmalı. Windows Güvenlik Duvarı sorarsa `dotnet` için yalnız **Özel ağlar** erişimine izin ver. Telefonda tarayıcıdan `http://192.168.1.110:5080/health` açılabilmeli. Telefonda `localhost`, telefonu ifade ettiği için kullanılmaz. Preview APK'nın yerel HTTP API'ye erişebilmesi için Android cleartext LAN trafiği `expo-build-properties` ile açıkça etkinleştirilmiştir; gerçek internet dağıtımında HTTPS backend kullanılması gerekir.

İki yapılandırma yolu vardır:

1. Geliştirme varsayılanı:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\mobile
$env:EXPO_PUBLIC_API_URL="http://192.168.1.110:5080"
npx expo start --clear
```

2. Kurulu APK: Uygulamayı aç, **Ayarlar > Backend API adresi** alanına `http://192.168.1.110:5080` yaz ve **Gerçek AI** modunu seç. Adres SQLite'ta saklanır; yeni APK gerekmez.

Yerel backend bilgisayarda çalışmıyorsa veya bilgisayar kapalıysa:

- Dolabı görüntüleme, kayıtları düzenleme/silme ve kalıcılık çalışır.
- Kamera/galeriden fotoğraf ekleyip **Elle tamamla** ile kaydetme çalışır.
- Kombinler API hatasından sonra telefondaki yerel kurallarla hazırlanır.
- Yalnız gerçek görsel analizi ve AI tarafından yazılan kombin gerekçeleri kullanılamaz.

## 4. Doğrudan kurulabilir APK üretme

`mobile/eas.json` içindeki `preview` profili Android `apk` üretir. EAS projesi `59dce122-82ee-47b4-a212-64ff019c662b` ile yapılandırıldı. Bu oturumdaki npm ağ kısıtı nedeniyle yeni native paket indirilemediğinden APK üretilmedi.

EAS bulut derlemesi için:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\mobile
npm install
npx expo install --fix
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

İlk Android derlemesinde EAS sorarsa yeni Android imzalama anahtarı oluşturmasını seçebilirsin. Derleme sonunda verilen bağlantıyı telefonda aç, APK'yı indir ve Android'in istediği `Bu kaynaktan uygulama yükle` iznini ver. APK kurulumu backend'i telefona kurmaz; gerçek AI için bilgisayardaki `dotnet run` işlemi ayrıca açık kalmalıdır.

USB/ADB sonradan kurulursa indirilen APK şu biçimde kurulabilir:

```powershell
adb install -r .\outfit-combination-preview.apk
```

## 5. Kontroller

Mobil saf kombin motoru paket kurulumu gerektirmeden Node 24 ile çalıştırılabilir:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\mobile
npm test
```

Backend test koşucusu:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\api
dotnet run --project .\OutfitCombination.Api.Tests\OutfitCombination.Api.Tests.csproj
```

Test kapsamı:

- Eksik ana kategori ve AI çağrısının atlanması
- Yalnız bir mümkün üçlü
- En az üç farklı üçlü
- Modelin var olmayan veya yanlış kategoride ID döndürmesi
- Modelin aynı üçlüyü tekrarlaması
- API kesintisinde elle oluşturulan kayıtlarla yerel kombin ve sonuç fotoğraflarının ID eşleşmesi

Bu oturumda mobil TypeScript kontrolü başarılı, `npm test` sonucu 9/9 başarılı ve .NET Release derlemesi 0 hata/0 uyarıyla tamamlandı. Backend test koşucusu 5/5 geçti. Yerel HTTP portu çalışma ortamı güvenliği tarafından engellendiği için çalışan sürece gerçek HTTP isteği gönderilemedi; `/api/version` için sürüm dosyasının yayın çıktısına kopyalanması test edildi. SQLite kalıcılığı, kamera yönü ve gerçek cihazdaki panoya yerleşim fiziksel Android/BlueStacks üzerinde henüz doğrulanmadı.

## 6. İlk kabul senaryosu

1. APK'yı aç ve önce Demo modunda 3 Üst, 2 Alt, 2 Ayakkabı ekle; her fotoğrafın alanlarını elle tamamla.
2. Uygulamayı Android son uygulamalar ekranından tamamen kapatıp yeniden aç; `Dolabım` başlığında 7 parça göründüğünü doğrula.
3. `Kombin Öner` > `Arkadaş buluşması` > `Smart casual` > `Koyu` seç.
4. Üç karta sağa–sola kaydır. Kart altındaki Üst/Alt/Ayakkabı adlarının, kartta gösterilen üç gerçek fotoğrafla birebir eşleştiğini doğrula.
5. Sonra backend'i çalıştır, API adresini kaydet ve Gerçek AI moduna geçerek bir yeni kıyafetin otomatik analizini dene.

