import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContentFrame } from '../components/layout';
import { PrimaryButton, SecondaryButton } from '../components/ui';
import { colors, radius, spacing } from '../theme/theme';

const steps = [
  ['1', 'Dolabını oluştur', 'Kameradan veya galeriden kendi kıyafetlerini ekle. Galeriden aynı kategoride 20 fotoğrafa kadar kuyruk oluşturabilirsin.'],
  ['2', 'Kontrol sende', 'Asıl fotoğrafların cihazında kalır. Otomatik tanımayı kullanmadan önce ne paylaşılacağını görür ve açıkça karar verirsin.'],
  ['3', 'Gerçek parçalarla kombin', 'En az bir üst, alt ve ayakkabı eklediğinde kendi dolabından farklı kombinler hazırlanır. İnternet olmasa bile temel öneriler cihazında çalışır.'],
] as const;

export function OnboardingScreen({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <ContentFrame maxWidth={760} style={styles.content}>
        <Text style={styles.eyebrow}>OUTFIT COMBINATION</Text>
        <Text style={styles.title}>Dolabın, kararların, kombinlerin.</Text>
        <Text style={styles.lead}>Üç adımda başlayabilirsin.</Text>
        {steps.map(([number, title, body]) => (
          <View key={number} style={styles.card}>
            <Text style={styles.number}>{number}</Text>
            <View style={styles.copy}>
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.body}>{body}</Text>
            </View>
          </View>
        ))}
        <PrimaryButton title="İlk kıyafetimi ekle" onPress={onStart} />
        <SecondaryButton title="Şimdilik ana sayfaya geç" onPress={onSkip} />
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
