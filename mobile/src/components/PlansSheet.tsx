import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AccountUser } from '../services/accountAuth';
import { trialDaysLeft } from '../domain/plan';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';
import { PrimaryButton, SecondaryButton } from './ui';

interface Props {
  visible: boolean;
  user: AccountUser | null;
  onClose: () => void;
}

/**
 * Explains the three plans (trial, free, premium) and what each one includes. The premium
 * purchase itself is not wired to Google Play Billing yet, so the button says so honestly.
 */
export function PlansSheet({ visible, user, onClose }: Props) {
  const { language } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const tier = user?.tier ?? 'free';
  const daysLeft = trialDaysLeft(user);

  const plans = [
    {
      key: 'trial',
      title: l('🎁 Deneme · ilk 14 gün', '🎁 Trial · first 14 days'),
      lines: [
        l('Günde 40 AI fotoğraf analizi', '40 AI photo analyses a day'),
        l('Günde 5 AI kombin kredisi', '5 AI outfit credits a day'),
        l('Alışveriş önerileri', 'Shopping suggestions'),
        l('Sınırsız Hızlı Kombin', 'Unlimited Quick Outfits'),
      ],
    },
    {
      key: 'free',
      title: l('Ücretsiz · deneme sonrası', 'Free · after the trial'),
      lines: [
        l('Günde 3 AI fotoğraf analizi', '3 AI photo analyses a day'),
        l('Günde 1 AI kombin', '1 AI outfit a day'),
        l('Sınırsız Hızlı Kombin', 'Unlimited Quick Outfits'),
        l('Dolabın ve geçmişin hep seninle', 'Your wardrobe and history stay with you'),
      ],
    },
    {
      key: 'premium',
      title: l('⭐ Premium', '⭐ Premium'),
      lines: [
        l('Günde 50 AI fotoğraf analizi', '50 AI photo analyses a day'),
        l('Günde 20 AI kombin kredisi', '20 AI outfit credits a day'),
        l('Alışveriş önerileri ve ürün görselleri', 'Shopping suggestions with product images'),
        l('Sınırsız Hızlı Kombin', 'Unlimited Quick Outfits'),
      ],
    },
  ];

  const upgrade = () => {
    Alert.alert(
      l('Premium çok yakında', 'Premium is coming soon'),
      l(
        'Premium abonelik Google Play üzerinden açılacak. O zamana kadar deneme ve ücretsiz plan haklarını kullanmaya devam edebilirsin.',
        'Premium will be available through Google Play soon. Until then you can keep using your trial and free plan.',
      ),
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel={l('Kapat', 'Close')} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{l('Planlar', 'Plans')}</Text>
          <Text style={styles.current}>
            {tier === 'premium'
              ? l('Premium kullanıyorsun. Teşekkürler!', 'You are on Premium. Thank you!')
              : tier === 'trial'
                ? l(`Denemedesin: ${daysLeft} gün kaldı.`, `You are on the trial: ${daysLeft} days left.`)
                : l('Ücretsiz plandasın. Hızlı Kombin her zaman sınırsız.', 'You are on the free plan. Quick Outfits are always unlimited.')}
          </Text>
          <ScrollView contentContainerStyle={styles.list}>
            {plans.map((plan) => (
              <View key={plan.key} style={[styles.plan, plan.key === tier && styles.planCurrent]}>
                <View style={styles.planHeader}>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  {plan.key === tier ? <Text style={styles.planBadge}>{l('Şu anki', 'Current')}</Text> : null}
                </View>
                {plan.lines.map((line) => <Text key={line} style={styles.planLine}>✓ {line}</Text>)}
              </View>
            ))}
          </ScrollView>
          {tier !== 'premium' ? <PrimaryButton title={l('⭐ Premium\'a geç', '⭐ Go Premium')} onPress={upgrade} /> : null}
          <SecondaryButton title={l('Kapat', 'Close')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24, 23, 20, 0.54)' },
  sheet: {
    maxHeight: '90%',
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  handle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.border },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  current: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  list: { gap: spacing.sm, paddingBottom: spacing.sm },
  plan: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: spacing.md, gap: 4 },
  planCurrent: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  planTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  planBadge: { color: colors.onPrimary, backgroundColor: colors.primary, borderRadius: 10, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, fontWeight: '900' },
  planLine: { color: colors.text, fontSize: 13, lineHeight: 19 },
});
