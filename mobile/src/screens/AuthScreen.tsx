import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Chip, Notice, PrimaryButton, SecondaryButton } from '../components/ui';
import { useI18n } from '../locales';
import type { AccountState } from '../services/accountAuth';
import { colors, radius, spacing } from '../theme/theme';

interface Props {
  account: AccountState;
  onGoogle: () => Promise<void>;
  onRequestEmailCode: (email: string) => Promise<void>;
  onCompleteEmail: (email: string, code: string) => Promise<void>;
  onGuest: () => Promise<void>;
  onRetry: () => Promise<void>;
  onBack?: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}

export function AuthScreen(props: Props) {
  const { language, setLanguage, t } = useI18n();
  const [mode, setMode] = useState<'choices' | 'email' | 'code'>('choices');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAfter, setResendAfter] = useState(0);

  useEffect(() => {
    if (resendAfter <= 0) return undefined;
    const timer = setInterval(() => setResendAfter((value) => Math.max(0, value - 1)), 1_000);
    return () => clearInterval(timer);
  }, [resendAfter > 0]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(async () => {
    await props.onRequestEmailCode(email.trim());
    setResendAfter(60);
    setMode('code');
  });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          <View style={styles.topRow}>
            {props.onBack ? (
              <Pressable accessibilityRole="button" onPress={props.onBack} hitSlop={8} style={styles.backButton}>
                <Text style={styles.backLabel}>{t('common.back')}</Text>
              </Pressable>
            ) : <View />}
            <View style={styles.languageRow}>
              <Chip label="🇹🇷 Türkçe" selected={language === 'tr'} onPress={() => setLanguage('tr')} />
              <Chip label="🇬🇧 English" selected={language === 'en'} onPress={() => setLanguage('en')} />
            </View>
          </View>

          <View style={styles.brandMark}>
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="contain"
              source={require('../../assets/adaptive-icon.png')}
              style={styles.brandLogo}
            />
          </View>
          <Text style={styles.eyebrow}>{t('auth.eyebrow')}</Text>
          <Text style={styles.title}>{t('auth.title')}</Text>
          <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>

          {error ? <Notice tone="error">{error}</Notice> : null}
          {!props.account.enabled && mode === 'choices' ? <Notice>{t('auth.unavailable')}</Notice> : null}

          {mode === 'choices' ? (
            <View style={styles.actions}>
              {props.account.googleEnabled ? (
                <PrimaryButton title={t('auth.google')} onPress={() => void run(props.onGoogle)} loading={busy} />
              ) : null}
              {props.account.emailEnabled ? (
                <SecondaryButton title={t('auth.email')} onPress={() => setMode('email')} disabled={busy} />
              ) : null}
              {!props.account.enabled ? (
                <SecondaryButton title={t('common.retry')} onPress={() => void run(props.onRetry)} loading={busy} />
              ) : null}
            </View>
          ) : mode === 'email' ? (
            <View style={styles.form}>
              <Text style={styles.label}>{t('auth.emailLabel')}</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={colors.muted}
                value={email}
                onChangeText={setEmail}
                editable={!busy}
                style={styles.input}
              />
              <PrimaryButton title={t('auth.sendCode')} onPress={sendCode} loading={busy} disabled={!email.trim()} />
              <Pressable onPress={() => setMode('choices')} disabled={busy} style={styles.textButton}>
                <Text style={styles.textButtonLabel}>{t('common.back')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <Notice>{t('auth.codeSent', { email: email.trim() })}</Notice>
              <Text style={styles.label}>{t('auth.codeLabel')}</Text>
              <TextInput
                autoComplete="one-time-code"
                keyboardType="number-pad"
                maxLength={6}
                placeholder={t('auth.codePlaceholder')}
                placeholderTextColor={colors.muted}
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                editable={!busy}
                style={[styles.input, styles.codeInput]}
              />
              <PrimaryButton
                title={t('auth.verify')}
                onPress={() => void run(() => props.onCompleteEmail(email.trim(), code))}
                loading={busy}
                disabled={code.length !== 6}
              />
              <SecondaryButton
                title={resendAfter > 0 ? t('auth.resendWait', { seconds: resendAfter }) : t('auth.resend')}
                onPress={sendCode}
                disabled={busy || resendAfter > 0}
              />
              <Pressable onPress={() => { setMode('email'); setCode(''); setResendAfter(0); }} disabled={busy} style={styles.textButton}>
                <Text style={styles.textButtonLabel}>{t('auth.changeEmail')}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.divider}><View style={styles.dividerLine} /><Text style={styles.dividerText}>•••</Text><View style={styles.dividerLine} /></View>
          <Pressable disabled={busy} onPress={() => void run(props.onGuest)} style={({ pressed }) => [styles.guestButton, pressed && styles.pressed]}>
            <Text style={styles.guestLabel}>{t('auth.guest')}</Text>
          </Pressable>
          <Text style={styles.guestNote}>{t('auth.guestNote')}</Text>

          <View style={styles.legalRow}>
            <Pressable onPress={props.onPrivacy}><Text style={styles.legalLink}>{t('auth.privacy')}</Text></Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable onPress={props.onTerms}><Text style={styles.legalLink}>{t('auth.terms')}</Text></Pressable>
          </View>
          {busy ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.md, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface },
  topRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  languageRow: { flexDirection: 'row', gap: spacing.xs },
  backButton: { minHeight: 40, justifyContent: 'center', paddingRight: spacing.sm },
  backLabel: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  brandMark: { width: 88, height: 88, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 28, backgroundColor: colors.primarySoft },
  brandLogo: { width: 82, height: 82 },
  eyebrow: { color: colors.accent, textAlign: 'center', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: colors.text, textAlign: 'center', fontSize: 29, lineHeight: 35, fontWeight: '900' },
  subtitle: { color: colors.muted, textAlign: 'center', fontSize: 14, lineHeight: 21 },
  actions: { gap: spacing.sm },
  form: { gap: spacing.sm },
  label: { color: colors.text, fontSize: 14, fontWeight: '800' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.background, color: colors.text, fontSize: 16 },
  codeInput: { textAlign: 'center', fontSize: 25, fontWeight: '800', letterSpacing: 8 },
  textButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { color: colors.border, letterSpacing: 4 },
  guestButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  guestLabel: { color: colors.text, textAlign: 'center', fontSize: 14, fontWeight: '800' },
  guestNote: { color: colors.muted, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  legalLink: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  legalDot: { color: colors.muted },
  pressed: { opacity: 0.7 },
});
