# Google Play Data Safety taslağı

Bu belge Play Console'a doğrudan yüklenmez. Form doldurulurken mevcut uygulama sürümüyle yeniden doğrulanmalıdır.

## Mevcut veri akışı

- Kullanıcı Google ile giriş yaparsa Google hesap kimliği, doğrulanmış e-posta, görünen ad ve isteğe bağlı profil fotoğrafı URL'si Neon'da saklanır. Parolasız e-posta yolunu kullanırsa doğrulanmış e-posta adresi ve kısa ömürlü kod kaydı işlenir. Parola, Google erişim belirteci veya Google yenileme belirteci saklanmaz.
- Telefon, kişi listesi, konum, reklam kimliği veya ödeme bilgisi toplanmaz.
- Kıyafet fotoğrafları, dolap kayıtları, favoriler, kombin geri bildirimi, kombin öneri geçmişi ve giyim geçmişi uygulamanın özel yerel alanında saklanır. Aynı cihazdaki hesaplar ayrı yerel dolaplar görür; bu içerikler hesaba veya Neon'a yüklenmez.
- Kullanıcı gerçek AI moduna açıkça onay verirse küçültülmüş kıyafet fotoğrafı analiz amacıyla Render backend ve OpenAI API'ye aktarılır.
- Kombin önerisinde fotoğraf gönderilmez; tercih, rastgele kıyafet ID'si ve metinsel özellikler gönderilir.
- Rastgele kurulum UUID'si, rastgele iç hesap UUID'si ve günlük/aylık analiz-kombin kullanım sayıları Neon'da en fazla 13 ay saklanır. Kota hem hesaba hem kuruluma uygulanır; farklı hesapla giriş yapmak cihaz hakkını yenilemez.
- Uygulama içi `Tüm yerel verilerimi sil` işlemi cihazdaki tüm yerel dolapları ve uygulama verisini siler. `Hesabımı kalıcı olarak sil` Google kimliği, e-posta, ad ve profil URL'sini Neon'dan siler; profilden ayrılmış takma adlı kimlik eşleştirmesi ve kullanım sayaçları kota sıfırlama suistimalini önlemek için en fazla 13 ay tutulabilir.

## Form için önerilen beyanlar

Play Console "zorunlu mu" alanı tek seçimlidir (Evet/Hayır). Veri AI akışı için zorunlu, yerel akış için isteğe bağlıdır; her satır için uygulamada yolun **temel akışında** zorunluluğu olup olmadığına bakılır. Uygulamanın temel akışı yerel modu içerdiği için fotoğraf ve içerik satırlarında **Hayır** seçilir; AI açıkça seçilen bir ek özelliktir ve forma "toplama isteğe bağlı" olarak beyan edilir.

| Play veri türü | Toplanıyor/aktarılıyor | Amaç | Zorunlu mu? |
| --- | --- | --- | --- |
| Fotoğraflar | Yalnız AI analizi seçildiğinde işlenir | Uygulama işlevselliği | Hayır (elle giriş yolu var) |
| Kullanıcı tarafından oluşturulan içerik / diğer içerik | Kıyafet özellikleri ve kombin tercihleri | Uygulama işlevselliği | Hayır (yerel motor var) |
| Uygulama etkileşimleri | Takma adlı analiz/kombin sayaçları | Güvenlik, dolandırıcılığı önleme ve maliyet kontrolü | Hayır (yalnız AI özelliği seçildiğinde toplanır) |
| Cihaz veya diğer kimlikler | Uygulamanın ürettiği rastgele kurulum UUID'si | Güvenlik ve kötüye kullanım önleme | Hayır (yalnız AI özelliği seçildiğinde toplanır) |
| E-posta adresi, kullanıcı kimliği ve ad | Kullanıcı Google veya parolasız e-posta ile giriş yaparsa | Hesap yönetimi, güvenlik ve AI hakkı yönetimi | Hayır (yerel özellikler için gerekmez) |

## Güvenlik cevapları

- Aktarım sırasında HTTPS şifrelemesi: Evet.
- Android APK'daki hesap ve kurulum erişim belirteçleri cihazda Android Keystore anahtarıyla şifrelenir.
- Kullanıcı veri silme talebinde bulunabilir: Evet. Yerel veriler ve sunucu hesabı uygulama içinden ayrı ayrı silinebilir.
- Veriler reklam veya pazarlama amacıyla kullanılmaz.
- Veriler satılmaz.
- OpenAI API'ye gönderilen içerik model eğitimi amacıyla kullanılmaz; kötüye kullanım izleme kayıtları sağlayıcının güncel politikasına göre 30 güne kadar tutulabilir.

## Yayından önce tamamlanacak alanlar

- Play Console geliştirici unvanını gizlilik politikasındaki adla birebir eşleştir.
- Bir destek e-postası eklenirse politika ve uygulama içi metni güncelle.
- E-posta doğrulama sağlayıcısının adı ve veri işleme şartlarını mağaza beyanından önce son yapılandırmayla doğrula.
- GitHub Pages politikasının herkese açık açıldığını doğrula.
- Yeni SDK, analitik, hata izleme veya ödeme özelliği eklenirse bu formu yeniden değerlendir.
