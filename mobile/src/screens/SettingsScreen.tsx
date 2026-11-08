import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { ContentFrame } from '../components/layout';
import { DangerButton, Field, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { isSecureApiBaseUrl, isValidApiBaseUrl, normalizeApiBaseUrl } from '../domain/apiUrl';
import { AI_DISCLOSURE } from '../domain/privacy';
import { getApiHealth } from '../services/api';
import type { AccountState } from '../services/accountAuth';
import { colors, radius, spacing } from '../theme/theme';

type ConnectionState = 'idle' | 'checking' | 'online' | 'degraded' | 'offline' | 'invalid';

interface Props {
  apiUrl: string;
  aiConsentGranted: boolean;
  currentVersion: string;
  internalToolsEnabled: boolean;
  account: AccountState;
  onSaveApiUrl: (apiUrl: string) => Promise<void>;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onRefreshAccount: () => void | Promise<void>;
  onGrantAiConsent: () => Promise<void>;
  onRevokeAiConsent: () => Promise<void>;
  onDeleteAllData: () => Promise<void>;
  onPrivacy: () => void;
  onBack: () => void;
}

export function SettingsScreen(props: Props) {
  const [url, setUrl] = useState(normalizeApiBaseUrl(props.apiUrl));
  const [busy, setBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const normalizedUrl = normalizeApiBaseUrl(url);
  const allowHttpApi = String(Constants.expoConfig?.extra?.appEnvironment ?? 'development') === 'development';
  const validUrl = isValidApiBaseUrl(url) && (allowHttpApi || isSecureApiBaseUrl(url));

  useEffect(() => {
    if (props.account.enabled) void props.onRefreshAccount();
  }, [props.account.enabled, props.onRefreshAccount]);

  const testConnection = async () => {
    if (!validUrl) {
      setConnection('invalid');
      return;
    }
    setUrl(normalizedUrl);
    setConnection('checking');
    const health = await getApiHealth(normalizedUrl);
    setConnection(!health.online ? 'offline' : health.quotaPersistent ? 'online' : 'degraded');
  };

  const saveApiUrl = async () => {
    if (!validUrl) {
      setConnection('invalid');
      return;
    }
    setBusy(true);
    try {
      await props.onSaveApiUrl(normalizedUrl);
    } finally {
      setBusy(false);
    }
  };

  const grantConsent = async () => {
    setPrivacyBusy(true);
    try {
      await props.onGrantAiConsent();
    } finally {
      setPrivacyBusy(false);
    }
  };

  const revokeConsent = async () => {
    setPrivacyBusy(true);
    try {
      await props.onRevokeAiConsent();
    } finally {
      setPrivacyBusy(false);
    }
  };

  const signIn = async () => {
    setAccountBusy(true);
    try {
      await props.onSignIn();
    } finally {
      setAccountBusy(false);
    }
  };

  const signOut = async () => {
    setAccountBusy(true);
    try {
      await props.onSignOut();
    } finally {
      setAccountBusy(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Hesabı kalıcı olarak sil',
      'Google bağlantın ve hesap profilin silinecek. Telefonundaki dolabın ve fotoğrafların etkilenmez. Kullanım sınırlarının kötüye kullanılmasını önlemek için kimliğinle ilişkilendirilmeyen kullanım kayıtları en fazla 13 ay saklanabilir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hesabı sil',
          style: 'destructive',
          onPress: async () => {
            setAccountBusy(true);
            try {
              await props.onDeleteAccount();
            } finally {
              setAccountBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmDeleteAll = () => {
    Alert.alert(
      'Tüm yerel verileri sil',
      'Kıyafetler, fotoğraflar, favoriler, taslaklar ve ayarlar bu cihazdan kalıcı olarak silinecek.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Devam et',
          style: 'destructive',
          onPress: () => Alert.alert(
            'Son onay',
            'Bu işlem geri alınamaz. Tüm Outfit Combination verileri silinsin mi?',
            [
              { text: 'Vazgeç', style: 'cancel' },
              {
                text: 'Her şeyi sil',
                style: 'destructive',
                onPress: async () => {
                  setPrivacyBusy(true);
                  try {
                    await props.onDeleteAllData();
                  } catch (error) {
                    Alert.alert('Veriler silinemedi', error instanceof Error ? error.message : 'Bilinmeyen hata');
                    setPrivacyBusy(false);
                  }
                },
              },
            ],
          ),
        },
      ],
    );
  };

  const connectionText = connection === 'checking'
    ? 'Sunucu kontrol ediliyor; ücretsiz Render servisi uyanıyor olabilir…'
    : connection === 'online'
      ? 'Sunucu bağlı ve kalıcı kullanım sayacı etkin.'
      : connection === 'degraded'
        ? 'Sunucu bağlı; kalıcı kullanım sayacı yapılandırılmamış.'
        : connection === 'offline'
          ? 'Sunucu 90 saniye içinde yanıt vermedi.'
          : connection === 'invalid'
            ? 'API adresi geçersiz.'
            : 'Bağlantı henüz kontrol edilmedi.';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Ayarlar" onBack={props.onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ContentFrame maxWidth={760} style={styles.content}>
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Akıllı özellikler</Text>
              <View style={[styles.statusBadge, props.aiConsentGranted && styles.statusBadgeActive]}>
                <Text style={[styles.statusText, props.aiConsentGranted && styles.statusTextActive]}>
                  {props.aiConsentGranted ? 'İzin açık' : 'İzin kapalı'}
                </Text>
              </View>
            </View>
            <Text style={styles.text}>{AI_DISCLOSURE}</Text>
            <Notice>
              Bu izin kapalıyken kıyafetlerini elle kaydedebilir ve kombinlerini telefonunda ücretsiz hazırlayabilirsin.
            </Notice>
            {props.aiConsentGranted ? (
              <SecondaryButton title="Akıllı özellik iznini kapat" onPress={() => void revokeConsent()} disabled={privacyBusy} />
            ) : (
              <PrimaryButton title="Akıllı özelliklere izin ver" onPress={() => void grantConsent()} loading={privacyBusy} />
            )}
            <Pressable accessibilityRole="button" onPress={props.onPrivacy} hitSlop={8}>
              <Text style={styles.inlineLink}>Verilerinin nasıl kullanıldığını gör</Text>
            </Pressable>
          </View>

          {props.account.enabled ? (
            <View style={styles.card}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Hesabım</Text>
                {props.account.user ? (
                  <View style={[styles.statusBadge, styles.statusBadgeActive]}>
                    <Text style={[styles.statusText, styles.statusTextActive]}>Bağlı</Text>
                  </View>
                ) : null}
              </View>
              {props.account.user ? (
                <>
                  <View>
                    <Text style={styles.accountName}>{props.account.user.displayName}</Text>
                    <Text style={styles.accountEmail}>{props.account.user.email}</Text>
                  </View>
                  {props.account.usage ? (
                    <View style={styles.usageGrid}>
                      <View style={styles.usageCard}>
                        <Text style={styles.usageLabel}>FOTOĞRAF TANIMA</Text>
                        <Text style={styles.usageValue}>
                          {Math.max(0, Math.min(
                            props.account.usage.dailyAnalysisLimit - props.account.usage.dailyAnalysisUsed,
                            props.account.usage.monthlyAnalysisLimit - props.account.usage.monthlyAnalysisUsed,
                          ))} hak
                        </Text>
                        <Text style={styles.usageDetail}>
                          Bugün {props.account.usage.dailyAnalysisUsed}/{props.account.usage.dailyAnalysisLimit} · Bu ay {props.account.usage.monthlyAnalysisUsed}/{props.account.usage.monthlyAnalysisLimit}
                        </Text>
                      </View>
                      <View style={styles.usageCard}>
                        <Text style={styles.usageLabel}>KOMBİN ÖNERİSİ</Text>
                        <Text style={styles.usageValue}>
                          {Math.max(0, Math.min(
                            props.account.usage.dailyOutfitLimit - props.account.usage.dailyOutfitUsed,
                            props.account.usage.monthlyOutfitLimit - props.account.usage.monthlyOutfitUsed,
                          ))} hak
                        </Text>
                        <Text style={styles.usageDetail}>
                          Bugün {props.account.usage.dailyOutfitUsed}/{props.account.usage.dailyOutfitLimit} · Bu ay {props.account.usage.monthlyOutfitUsed}/{props.account.usage.monthlyOutfitLimit}
                        </Text>
                      </View>
                    </View>
                  ) : <Notice>Kullanım hakları şu anda yüklenemedi.</Notice>}
                  {props.account.stale ? <Notice>Son bilinen hesap bilgileri gösteriliyor; sunucuya şu anda ulaşılamadı.</Notice> : null}
                  <SecondaryButton title="Hesaptan çık" onPress={() => void signOut()} disabled={accountBusy} />
                  <DangerButton title="Hesabımı kalıcı olarak sil" onPress={confirmDeleteAccount} disabled={accountBusy} />
                </>
              ) : (
                <>
                  <Text style={styles.text}>Akıllı özellik haklarını hesabında korumak ve farklı kurulumlarda kaybetmemek için Google ile devam et.</Text>
                  <PrimaryButton title="Google ile giriş yap" onPress={() => void signIn()} loading={accountBusy} />
                </>
              )}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.title}>Gizlilik ve veriler</Text>
            <Text style={styles.text}>Dolabın ve asıl kıyafet fotoğrafların yalnızca bu cihazın uygulamaya ayrılmış alanında tutulur.</Text>
            <SecondaryButton title="Gizlilik politikasını görüntüle" onPress={props.onPrivacy} />
            <Text style={styles.deleteHint}>Aşağıdaki işlem yalnızca bu cihazdaki verileri siler ve geri alınamaz.</Text>
            <DangerButton title="Tüm yerel verilerimi sil" onPress={confirmDeleteAll} disabled={privacyBusy} />
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Uygulama hakkında</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Sürüm</Text>
              <Text style={styles.infoValue}>{props.currentVersion}</Text>
            </View>
          </View>

          {props.internalToolsEnabled ? (
            <View style={styles.internalCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: developerToolsOpen }}
                onPress={() => setDeveloperToolsOpen((value) => !value)}
                style={styles.internalHeader}
              >
                <View style={styles.internalHeading}>
                  <Text style={styles.internalEyebrow}>YALNIZCA GELİŞTİRME DERLEMESİ</Text>
                  <Text style={styles.title}>Geliştirici araçları</Text>
                </View>
                <Text style={styles.expandIcon}>{developerToolsOpen ? '−' : '+'}</Text>
              </Pressable>
              {developerToolsOpen ? (
                <View style={styles.internalBody}>
                  <Field
                    label="Backend API adresi"
                    value={url}
                    onChangeText={(value) => {
                      setUrl(value);
                      setConnection('idle');
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="https://outfit-combination-api.onrender.com"
                    hint="Dağıtımda HTTPS, yerel geliştirmede bilgisayarın IPv4 adresini kullan."
                  />
                  {!validUrl ? <Notice tone="error">Geçerli bir API adresi gir.</Notice> : null}
                  <View style={styles.connectionRow}>
                    <View style={[
                      styles.dot,
                      connection === 'online' && styles.dotOnline,
                      connection === 'offline' && styles.dotOffline,
                      connection === 'degraded' && styles.dotWarning,
                    ]} />
                    <Text style={styles.connectionText}>{connectionText}</Text>
                  </View>
                  <SecondaryButton
                    title={connection === 'checking' ? 'Kontrol ediliyor…' : 'Bağlantıyı test et'}
                    onPress={() => void testConnection()}
                    disabled={connection === 'checking' || !validUrl}
                  />
                  <PrimaryButton title="API adresini kaydet" onPress={() => void saveApiUrl()} loading={busy} disabled={!validUrl} />
                </View>
              ) : null}
            </View>
          ) : null}
        </ContentFrame>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 48 },
  content: { padding: spacing.md, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  text: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  statusBadge: { borderRadius: 99, backgroundColor: '#E9E5DC', paddingHorizontal: 10, paddingVertical: 6 },
  statusBadgeActive: { backgroundColor: colors.primarySoft },
  statusText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  statusTextActive: { color: colors.primary },
  inlineLink: { color: colors.primary, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  deleteHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoLabel: { color: colors.muted, fontSize: 14 },
  infoValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  accountName: { color: colors.text, fontSize: 17, fontWeight: '900' },
  accountEmail: { color: colors.muted, fontSize: 13, marginTop: 3 },
  usageGrid: { gap: spacing.sm },
  usageCard: { borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.primarySoft, gap: 5 },
  usageLabel: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  usageValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  usageDetail: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  internalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#C9B789',
    backgroundColor: '#F8F1DF',
    overflow: 'hidden',
  },
  internalHeader: { minHeight: 72, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  internalHeading: { flex: 1, gap: 4 },
  internalEyebrow: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  expandIcon: { color: colors.primary, fontSize: 26, fontWeight: '700' },
  internalBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  connectionText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.muted },
  dotOnline: { backgroundColor: colors.primary },
  dotOffline: { backgroundColor: colors.danger },
  dotWarning: { backgroundColor: '#B7791F' },
});
