import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContentFrame } from '../components/layout';
import { PrimaryButton, SecondaryButton } from '../components/ui';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

export function OnboardingScreen({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const { language, t } = useI18n();
  const steps = language === 'tr' ? [
    ['1', 'Dolabını oluştur', 'Üst, alt ve ayakkabı; dilersen şapka, aksesuar ve mont da ekle. Kameradan ya da galeriden ekleyebilir; aynı kategoride 20 fotoğrafa kadar kuyruk yapabilirsin.'],
    ['2', 'Kontrol sende', 'Asıl fotoğrafların cihazında kalır. AI analizini yalnızca istediğinde kullanırsın.'],
    ['3', 'Gerçek parçalarla kombin', 'En az bir üst, alt ve ayakkabı yeter; şapka veya mont istersen ekstra olarak eklenir. Temel öneriler çevrimdışı da çalışır.'],
  ] : [
    ['1', 'Build your wardrobe', 'Add tops, bottoms, shoes and optionally hats, accessories, jackets from the camera or gallery. Queue up to 20 photos in the same category.'],
    ['2', 'You stay in control', 'Original photos stay on your device. AI analysis runs only when you choose it.'],
    ['3', 'Outfits using real items', 'A top, bottom and pair of shoes is enough; hats and jackets slot in as extras. Basic suggestions also work offline.'],
  ];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <ContentFrame maxWidth={760} style={styles.content}>
        <Text style={styles.eyebrow}>OUTFIT COMBINATION</Text>
        <Text style={styles.title}>{t('onboarding.title')}</Text>
        <Text style={styles.lead}>{t('onboarding.subtitle')}</Text>
        {steps.map(([number, title, body]) => (
          <View key={number} style={styles.card}>
            <Text style={styles.number}>{number}</Text>
            <View style={styles.copy}>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.body}>{body}</Text>
            </View>
          </View>
        ))}
        <PrimaryButton title={t('onboarding.start')} onPress={onStart} />
        <SecondaryButton title={t('onboarding.skip')} onPress={onSkip} />
      </ContentFrame>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xl },
  content: { padding: spacing.lg, gap: spacing.md },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  lead: { color: colors.muted, fontSize: 17, marginBottom: spacing.sm },
  card: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  number: { color: colors.primary, fontSize: 25, fontWeight: '900' },
  copy: { flex: 1, gap: 5 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
});
