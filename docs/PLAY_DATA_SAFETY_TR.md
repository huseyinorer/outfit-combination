# Google Play Data Safety taslağı

Bu belge Play Console'a doğrudan yüklenmez. Form doldurulurken mevcut uygulama sürümüyle yeniden doğrulanmalıdır.

## Mevcut veri akışı

- Hesap, e-posta, telefon, kişi listesi, konum, reklam kimliği veya ödeme bilgisi toplanmaz.
- Kıyafet fotoğrafları ve dolap kayıtları uygulamanın özel yerel alanında saklanır.
- Kullanıcı gerçek AI moduna açıkça onay verirse küçültülmüş kıyafet fotoğrafı analiz amacıyla Render backend ve OpenAI API'ye aktarılır.
- Kombin önerisinde fotoğraf gönderilmez; tercih, rastgele kıyafet ID'si ve metinsel özellikler gönderilir.
- Takma adlı kurulum UUID'si ile günlük/aylık analiz ve kombin kullanım sayıları Neon'da en fazla 13 ay saklanır.
- Uygulama içi `Tüm yerel verilerimi sil` işlemi cihazdaki tüm kullanıcı verisini siler.

## Form için önerilen beyanlar

| Play veri türü | Toplanıyor/aktarılıyor | Amaç | Zorunlu mu? |
| --- | --- | --- | --- |
| Fotoğraflar | Yalnız AI analizi seçildiğinde işlenir | Uygulama işlevselliği | Hayır; demo modu var |
| Kullanıcı tarafından oluşturulan içerik / diğer içerik | Kıyafet özellikleri ve kombin tercihleri | Uygulama işlevselliği | Hayır; yerel motor var |
| Uygulama etkileşimleri | Takma adlı analiz/kombin sayaçları | Güvenlik, dolandırıcılığı önleme ve maliyet kontrolü | AI kullanımı için evet |
| Cihaz veya diğer kimlikler | Uygulamanın ürettiği rastgele kurulum UUID'si | Güvenlik ve kötüye kullanım önleme | AI kullanımı için evet |

## Güvenlik cevapları

- Aktarım sırasında HTTPS şifrelemesi: Evet.
- Kullanıcı veri silme talebinde bulunabilir: Evet, yerel veriler uygulama içinden silinir. Hesap bulunmadığından hesap silme akışı yoktur.
- Veriler reklam veya pazarlama amacıyla kullanılmaz.
- Veriler satılmaz.
- OpenAI API'ye gönderilen içerik model eğitimi amacıyla kullanılmaz; kötüye kullanım izleme kayıtları sağlayıcının güncel politikasına göre 30 güne kadar tutulabilir.

## Yayından önce tamamlanacak alanlar

- Play Console geliştirici unvanını gizlilik politikasındaki adla birebir eşleştir.
- Bir destek e-postası eklenirse politika ve uygulama içi metni güncelle.
- GitHub Pages politikasının herkese açık açıldığını doğrula.
- Yeni SDK, analitik, hata izleme, hesap veya ödeme özelliği eklenirse bu formu yeniden değerlendir.
