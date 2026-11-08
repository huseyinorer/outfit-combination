import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContentFrame } from '../components/layout';
import { ScreenHeader, SecondaryButton } from '../components/ui';
import { PRIVACY_CONTACT_URL, PRIVACY_POLICY_VERSION } from '../domain/privacy';
import { useI18n } from '../locales';
import { colors, radius, spacing } from '../theme/theme';

const documents = {
  tr: {
    privacy: {
      title: 'Gizlilik Politikası',
      sections: [
        ['Veri sorumlusu ve iletişim', 'Outfit Combination, Hüseyin Örer tarafından geliştirilir. Gizlilik taleplerini uygulamadaki destek bağlantısından iletebilirsin.'],
        ['Telefonda saklanan veriler', 'Kıyafet fotoğrafları, özellikler, taslaklar, favoriler, düzeltmeler ve giyim geçmişi uygulamanın özel yerel alanında tutulur. Her hesap bu telefonda ayrı bir yerel dolap görür; hesap değiştirmek başka dolabı silmez.'],
        ['Hesap verileri', 'Google ile girişte doğrulanmış Google kimliği ve temel profil bilgileri; e-posta ile girişte doğrulanmış e-posta adresi işlenir. Sunucu iç kimlik olarak rastgele bir kullanıcı UUID’si kullanır. Parolalar tutulmaz; e-posta girişi kısa süreli tek kullanımlık kodla yapılır.'],
        ['Akıllı özellikler', 'Açık izninle küçültülmüş kıyafet fotoğrafı bir kez analiz edilir. Kombin isteğinde fotoğraf, dosya yolu, görsel URL’si veya base64 gönderilmez; yalnızca rastgele kıyafet ID’leri, metinsel özellikler ve tercihlerin kullanılır.'],
        ['Kota ve kötüye kullanım önleme', 'AI kullanım sayaçları hem hesaba hem uygulama kurulumuna uygulanır. Hesap değiştirerek maliyet sınırlarının sıfırlanmasını önlemek için takma adlı sayaçlar profil silindikten sonra en fazla 13 ay saklanabilir.'],
        ['Saklama ve silme', 'Backend dolabını veya kıyafet fotoğraflarını kalıcı olarak saklamaz. Hesap profilini ya da bu cihazdaki tüm yerel kayıtları Ayarlar’dan silebilirsin. Uygulamayı kaldırmak yerel fotoğrafları ve SQLite kayıtlarını siler.'],
        ['Hizmet sağlayıcılar', 'Google isteğe bağlı kimlik doğrulama, e-posta sağlayıcısı tek kullanımlık kod teslimi, Render API barındırma, Neon hesap ve kota sayacı, OpenAI ise görsel ve metin analizi sağlar. Veriler Türkiye dışında işlenebilir. Gizli anahtarlar yalnızca backend ortamında bulunur.'],
      ],
    },
    terms: {
      title: 'Kullanım Koşulları',
      sections: [
        ['Hizmetin kapsamı', 'Uygulama kişisel gardırop yönetimi ve kombin önerisi sağlar. Öneriler otomatik üretilir; profesyonel, sağlık veya güvenlik tavsiyesi değildir.'],
        ['Hesap ve güvenlik', 'Doğrulama kodunu ve cihaz erişimini korumak senin sorumluluğundadır. Hizmeti kötüye kullanmak, kota veya güvenlik önlemlerini aşmaya çalışmak yasaktır.'],
        ['İçerik ve fotoğraflar', 'Yüklediğin kıyafet fotoğrafları üzerinde gerekli hakka sahip olmalısın. Fotoğraflar yerel dolabında kalır; yalnızca seçtiğinde tek seferlik analiz için işlenir.'],
        ['Kullanılabilirlik ve değişiklikler', 'Ücretsiz sunucu uykuya geçebilir ve akıllı özellikler geçici olarak kullanılamayabilir. Elle kayıt ve yerel kombin motoru internet olmadan çalışmaya devam eder. Özellikler ve limitler güvenlik veya maliyet gereksinimleriyle değişebilir.'],
        ['Hesap kapatma', 'Hesabını uygulamadan silebilirsin. Yerel dolabın ayrıca silinmedikçe telefonda kalır. Uygulamayı kaldırmadan önce saklamak istediğin verilerin sorumluluğu sana aittir.'],
      ],
    },
    support: 'Gizlilik talebi / destek',
    version: 'Sürüm',
  },
  en: {
    privacy: {
      title: 'Privacy Policy',
      sections: [
        ['Controller and contact', 'Outfit Combination is developed by Hüseyin Örer. Privacy requests can be submitted through the support link in the app.'],
        ['Data stored on the phone', 'Clothing photos, attributes, drafts, favorites, corrections, and wear history stay in the app’s private local storage. Each account sees a separate local wardrobe on this phone; switching accounts does not delete another wardrobe.'],
        ['Account data', 'Google sign-in processes the verified Google identity and basic profile details. Email sign-in processes a verified email address. The server uses a random internal user UUID. Passwords are not stored; email access uses a short-lived one-time code.'],
        ['Smart features', 'With your explicit permission, a reduced clothing photo is analyzed once. Outfit requests never contain photos, file paths, image URLs, or base64; they use random clothing IDs, text attributes, and your preferences.'],
        ['Quota and abuse prevention', 'AI counters apply to both the account and app installation. Pseudonymous counters may remain for up to 13 months after profile deletion to prevent limits from being reset by switching accounts.'],
        ['Retention and deletion', 'The backend does not permanently store your wardrobe or clothing photos. You can delete the account profile or all local records from Settings. Uninstalling removes local photos and SQLite records.'],
        ['Providers', 'Google provides optional authentication, the email provider delivers one-time codes, Render hosts the API, Neon stores account and quota data, and OpenAI provides image and text analysis. Data may be processed outside Türkiye. Secrets remain only in the backend environment.'],
      ],
    },
    terms: {
      title: 'Terms of Use',
      sections: [
        ['Service scope', 'The app provides personal wardrobe management and outfit suggestions. Suggestions are automated and are not professional, health, or safety advice.'],
        ['Account and security', 'You are responsible for protecting verification codes and device access. Misusing the service or attempting to bypass quotas or safeguards is prohibited.'],
        ['Content and photos', 'You must have the right to use clothing photos you add. Photos remain in the local wardrobe and are processed for one-time analysis only when you choose it.'],
        ['Availability and changes', 'The free server may sleep and smart features can be temporarily unavailable. Manual entry and the local outfit engine continue to work offline. Features and limits may change for security or cost reasons.'],
        ['Account closure', 'You can delete your account in the app. The local wardrobe remains on the phone unless separately deleted. You are responsible for any data you want to retain before uninstalling.'],
      ],
    },
    support: 'Privacy request / support',
    version: 'Version',
  },
} as const;

export function PrivacyPolicyScreen({ document, onBack }: { document: 'privacy' | 'terms'; onBack: () => void }) {
  const { language } = useI18n();
  const copy = documents[language];
  const selected = copy[document];
  return (
    <View style={styles.screen}>
      <ScreenHeader title={selected.title} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={780} style={styles.content}>
          <Text style={styles.title}>Outfit Combination · {selected.title}</Text>
          <Text style={styles.version}>{copy.version}: {PRIVACY_POLICY_VERSION}</Text>
          {selected.sections.map(([title, body]) => (
            <View key={title} style={styles.card}>
              <Text style={styles.heading}>{title}</Text>
              <Text style={styles.body}>{body}</Text>
            </View>
          ))}
          <SecondaryButton title={copy.support} onPress={() => void Linking.openURL(PRIVACY_CONTACT_URL)} />
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 48 },
  content: { padding: spacing.md, gap: spacing.md },
  title: { color: colors.text, fontSize: 25, fontWeight: '900' },
  version: { color: colors.muted, fontSize: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  heading: { color: colors.text, fontSize: 17, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
});
