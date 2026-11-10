import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { ContentFrame } from '../components/layout';
import { DangerButton, Field, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { isSecureApiBaseUrl, isValidApiBaseUrl, normalizeApiBaseUrl } from '../domain/apiUrl';
import { getApiHealth } from '../services/api';
import type { AccountState } from '../services/accountAuth';
import { exportWardrobe, importWardrobe } from '../services/wardrobeExport';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useI18n } from '../locales';
import {
  colors,
  radius,
  spacing,
  type AppColorScheme,
  type AppThemePreference,
} from '../theme/theme';

type ConnectionState = 'idle' | 'checking' | 'online' | 'degraded' | 'offline' | 'invalid';

interface Props {
  apiUrl: string;
  aiConsentGranted: boolean;
  currentVersion: string;
  internalToolsEnabled: boolean;
  account: AccountState;
  themePreference: AppThemePreference;
  colorScheme: AppColorScheme;
  onThemeChange: (preference: AppThemePreference) => void;
  onSaveApiUrl: (apiUrl: string) => Promise<void>;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onRefreshAccount: () => void | Promise<void>;
  onRefreshWardrobe?: () => void | Promise<void>;
  onGrantAiConsent: () => Promise<void>;
  onRevokeAiConsent: () => Promise<void>;
  onDeleteAllData: () => Promise<void>;
  onPrivacy: () => void;
  onTerms: () => void;
  onBack: () => void;
}

export function SettingsScreen(props: Props) {
  const { language, languagePreference, setLanguage, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const [url, setUrl] = useState(normalizeApiBaseUrl(props.apiUrl));
  const [busy, setBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [exportBusy, setExportBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const normalizedUrl = normalizeApiBaseUrl(url);
  const allowHttpApi = String(Constants.expoConfig?.extra?.appEnvironment ?? 'development') === 'development';
  const validUrl = isValidApiBaseUrl(url) && (allowHttpApi || isSecureApiBaseUrl(url));

  useEffect(() => {
    void props.onRefreshAccount();
  }, [props.onRefreshAccount]);

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

  const exportMyWardrobe = async () => {
    setExportBusy(true);
    try {
      const result = await exportWardrobe();
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.fileUri, {
            mimeType: 'application/json',
            UTI: 'public.json',
            dialogTitle: l('Dolap aktarımını kaydet', 'Save wardrobe export'),
          });
        } else {
          await Share.share({
            title: l('Dolap aktarımı', 'Wardrobe export'),
            message: l(
              'Outfit Combination dolap aktarım dosyası',
              'Outfit Combination wardrobe export file',
            ),
            url: result.fileUri,
          });
        }
      } catch {
        // Paylaşım iptal edildiyse sessiz geç; kullanıcı yolu zaten alert'te görür.
      }
      Alert.alert(
        l('Dolap dışa aktarıldı', 'Wardrobe exported'),
        t('settings.exportDone', {
          count: String(result.clothingCount),
          favorites: String(result.favoriteCount),
          path: result.fileUri,
        }),
      );
    } catch (error) {
      Alert.alert(
        l('Dolap dışa aktarılamadı', 'Export failed'),
        error instanceof Error ? error.message : t('common.unknownError'),
      );
    } finally {
      setExportBusy(false);
    }
  };

  const importMyWardrobe = async () => {
    if (importBusy) return;
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (pick.canceled || !pick.assets || pick.assets.length === 0) return;
      const asset = pick.assets[0];
      if (!asset) return;
      setImportBusy(true);
      const result = await importWardrobe(asset.uri);
      await props.onRefreshWardrobe?.();
      Alert.alert(
        l('Dolap içe aktarıldı', 'Wardrobe imported'),
        l(
          `Eklenen parça: ${result.insertedClothing}\nAtlanan parça: ${result.skippedClothing}\nEklenen favori: ${result.insertedFavorites}\nAtlanan favori: ${result.skippedFavorites}`,
          `Added items: ${result.insertedClothing}\nSkipped items: ${result.skippedClothing}\nAdded favorites: ${result.insertedFavorites}\nSkipped favorites: ${result.skippedFavorites}`,
        ),
      );
    } catch (error) {
      Alert.alert(
        l('Dolap içe aktarılamadı', 'Import failed'),
        error instanceof Error ? error.message : t('common.unknownError'),
      );
    } finally {
      setImportBusy(false);
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
      l('Hesabı kalıcı olarak sil', 'Permanently delete account'),
      l(
        'Hesap profilin silinecek. Bu telefondaki dolabın ve fotoğrafların etkilenmez. Kötüye kullanımı önleyen anonim kullanım kayıtları en fazla 13 ay saklanabilir.',
        'Your account profile will be deleted. The wardrobe and photos on this phone will not be affected. Anonymous usage records may be retained for up to 13 months to prevent abuse.',
      ),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAccount'),
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
      l('Tüm yerel verileri sil', 'Delete all local data'),
      l(
        'Kıyafetler, fotoğraflar, favoriler, taslaklar, kombin geçmişi ve ayarlar bu cihazdan kalıcı olarak silinecek.',
        'Clothing, photos, favorites, drafts, outfit history, and settings will be permanently deleted from this device.',
      ),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: l('Devam et', 'Continue'),
          style: 'destructive',
          onPress: () => Alert.alert(
            l('Son onay', 'Final confirmation'),
            l('Bu işlem geri alınamaz. Tüm Outfit Combination verileri silinsin mi?', 'This cannot be undone. Delete all Outfit Combination data?'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: l('Her şeyi sil', 'Delete everything'),
                style: 'destructive',
                onPress: async () => {
                  setPrivacyBusy(true);
                  try {
                    await props.onDeleteAllData();
                  } catch (error) {
                    Alert.alert(l('Veriler silinemedi', 'Could not delete data'), error instanceof Error ? error.message : t('common.unknownError'));
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
    ? l('Sunucu kontrol ediliyor; ücretsiz servis uyanıyor olabilir…', 'Checking the service; the free server may be waking up…')
    : connection === 'online'
      ? l('Sunucu bağlı ve kalıcı kullanım sayacı etkin.', 'Service connected and persistent usage counting is active.')
      : connection === 'degraded'
        ? l('Sunucu bağlı; kalıcı kullanım sayacı yapılandırılmamış.', 'Service connected; persistent usage counting is not configured.')
        : connection === 'offline'
          ? l('Sunucu 90 saniye içinde yanıt vermedi.', 'The service did not respond within 90 seconds.')
          : connection === 'invalid'
            ? l('API adresi geçersiz.', 'The API address is invalid.')
            : l('Bağlantı henüz kontrol edilmedi.', 'The connection has not been checked yet.');

  const preferenceOption = (
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.preferenceOption, selected && styles.preferenceOptionSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.preferenceLabel, selected && styles.preferenceLabelSelected]}>
        {selected ? '✓ ' : ''}{label}
      </Text>
    </Pressable>
  );

  const segmentedOption = (
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.segmentedOption, selected && styles.segmentedOptionSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.segmentedLabel, selected && styles.segmentedLabelSelected]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title={t('settings.title')} onBack={props.onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ContentFrame maxWidth={760} style={styles.content}>
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{l('✦ AI özellikleri', '✦ AI features')}</Text>
              <View style={[styles.statusBadge, props.aiConsentGranted && styles.statusBadgeActive]}>
                <Text style={[styles.statusText, props.aiConsentGranted && styles.statusTextActive]}>
                  {props.aiConsentGranted ? l('AI açık', 'AI enabled') : l('AI kapalı', 'AI disabled')}
                </Text>
              </View>
            </View>
            <Text style={styles.text}>{l('Fotoğrafını AI ile analiz etmeyi veya dolabından AI ile kombin oluşturmayı yalnızca sen seçtiğinde kullanırız. Kombin oluştururken fotoğrafların paylaşılmaz.', 'AI is used only when you choose photo analysis or AI outfit creation. Your photos are never shared while creating outfits.')}</Text>
            <Notice>
              {l('AI kapalıyken kıyafetlerini elle kaydedebilir ve Hızlı Kombin özelliğini ücretsiz kullanabilirsin.', 'When AI is off, you can still save clothing manually and use Quick Outfits for free.')}
            </Notice>
            {props.aiConsentGranted ? (
              <SecondaryButton title={l('AI özelliklerini kapat', 'Turn off AI features')} onPress={() => void revokeConsent()} disabled={privacyBusy} />
            ) : (
              <PrimaryButton title={l('AI özelliklerine izin ver', 'Allow AI features')} onPress={() => void grantConsent()} loading={privacyBusy} />
            )}
            <Pressable accessibilityRole="button" onPress={props.onPrivacy} hitSlop={8}>
              <Text style={styles.inlineLink}>{l('Verilerinin nasıl kullanıldığını gör', 'See how your data is used')}</Text>
            </Pressable>
          </View>

          {props.account.enabled ? (
            <View style={styles.card}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{t('settings.account')}</Text>
                {props.account.user ? (
                  <View style={[styles.statusBadge, styles.statusBadgeActive]}>
                    <Text style={[styles.statusText, styles.statusTextActive]}>{l('Bağlı', 'Connected')}</Text>
                  </View>
                ) : null}
              </View>
              {props.account.user ? (
                <>
                  <View style={styles.accountIdentity}>
                    <Text style={styles.accountName}>{props.account.user.displayName}</Text>
                    <Text style={styles.accountEmail}>{props.account.user.email}</Text>
                    <View style={styles.tierRow}>
                      <View
                        style={[styles.tierBadge, props.account.user.tier === 'premium' && styles.tierBadgePremium]}
                        accessibilityRole="text"
                        accessibilityLabel={props.account.user.tier === 'premium' ? t('settings.tier.premium') : t('settings.tier.free')}
                      >
                        <Text style={[styles.tierBadgeText, props.account.user.tier === 'premium' && styles.tierBadgeTextPremium]}>
                          {props.account.user.tier === 'premium' ? t('settings.tier.premium') : t('settings.tier.free')}
                        </Text>
                      </View>
                    </View>
                    {props.account.user.tier === 'premium' ? null : (
                      <Text style={styles.tierPerks}>{t('settings.tier.premiumPerks')}</Text>
                    )}
                  </View>
                  {props.account.usage ? (
                    <View style={styles.usageGrid}>
                      <View style={styles.usageCard}>
                        <Text style={styles.usageLabel}>{l('✦ AI FOTOĞRAF ANALİZİ', '✦ AI PHOTO ANALYSIS')}</Text>
                        <Text style={styles.usageValue}>
                          {Math.max(0, Math.min(
                            props.account.usage.dailyAnalysisLimit - props.account.usage.dailyAnalysisUsed,
                            props.account.usage.monthlyAnalysisLimit - props.account.usage.monthlyAnalysisUsed,
                          ))} 🪙
                        </Text>
                        <Text style={styles.usageDetail}>
                          {l('Her analiz 1 🪙', 'Each analysis costs 1 🪙')} · {l('Bugün', 'Today')} {props.account.usage.dailyAnalysisUsed}/{props.account.usage.dailyAnalysisLimit} · {l('Bu ay', 'This month')} {props.account.usage.monthlyAnalysisUsed}/{props.account.usage.monthlyAnalysisLimit}
                        </Text>
                      </View>
                      <View style={styles.usageCard}>
                        <Text style={styles.usageLabel}>{l('✦ AI İLE KOMBİN', '✦ AI OUTFITS')}</Text>
                        <Text style={styles.usageValue}>
                          {Math.max(0, Math.min(
                            props.account.usage.dailyOutfitLimit - props.account.usage.dailyOutfitUsed,
                            props.account.usage.monthlyOutfitLimit - props.account.usage.monthlyOutfitUsed,
                          ))} 🪙
                        </Text>
                        <Text style={styles.usageDetail}>
                          {l('Her istek 1 🪙', 'Each request costs 1 🪙')} · {l('Bugün', 'Today')} {props.account.usage.dailyOutfitUsed}/{props.account.usage.dailyOutfitLimit} · {l('Bu ay', 'This month')} {props.account.usage.monthlyOutfitUsed}/{props.account.usage.monthlyOutfitLimit}
                        </Text>
                      </View>
                    </View>
                  ) : <Notice>{l('AI kredilerin şu anda yüklenemedi.', 'AI credits could not be loaded.')}</Notice>}
                  {props.account.stale ? <Notice>{l('Hesap bilgilerin şu anda yenilenemedi; son bilinen değerler gösteriliyor.', 'Your account could not be refreshed, so the last known values are shown.')}</Notice> : null}
                  <SecondaryButton title={t('settings.signOut')} onPress={() => void signOut()} disabled={accountBusy} />
                  <DangerButton title={t('settings.deleteAccount')} onPress={confirmDeleteAccount} disabled={accountBusy} />
                </>
              ) : (
                <>
                  <Text style={styles.text}>{t('settings.guestText')}</Text>
                  <PrimaryButton title={t('settings.signIn')} onPress={() => void signIn()} loading={accountBusy} />
                </>
              )}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.title}>{t('settings.export')}</Text>
            <Text style={styles.text}>{t('settings.exportText')}</Text>
            <PrimaryButton
              title={exportBusy ? t('settings.exporting') : t('settings.export')}
              onPress={() => void exportMyWardrobe()}
              loading={exportBusy}
            />
            <Text style={styles.deleteHint}>{t('settings.importText')}</Text>
            <SecondaryButton
              title={importBusy ? l('Geri yükleniyor…', 'Restoring…') : l('Dolap dosyasından geri yükle', 'Restore from export file')}
              onPress={() => void importMyWardrobe()}
              loading={importBusy}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{l('Gizlilik ve veriler', 'Privacy and data')}</Text>
            <Text style={styles.text}>{l('Dolabın ve asıl kıyafet fotoğrafların yalnızca bu cihazın uygulamaya ayrılmış alanında tutulur.', 'Your wardrobe and original clothing photos are stored only in the app area on this device.')}</Text>
            <SecondaryButton title={t('settings.privacy')} onPress={props.onPrivacy} />
            <SecondaryButton title={t('settings.terms')} onPress={props.onTerms} />
            <Text style={styles.deleteHint}>{l('Aşağıdaki işlem yalnızca bu cihazdaki verileri siler ve geri alınamaz.', 'The action below deletes data only from this device and cannot be undone.')}</Text>
            <DangerButton title={t('settings.deleteData')} onPress={confirmDeleteAll} disabled={privacyBusy} />
          </View>

          <View style={styles.card}>
            <View style={styles.compactPrefRow}>
              <Text style={styles.compactPrefLabel}>{l('Tema', 'Theme')}</Text>
              <View accessibilityRole="radiogroup" style={styles.segmented}>
                {segmentedOption(l('Sistem', 'System'), props.themePreference === 'system', () => props.onThemeChange('system'))}
                {segmentedOption(l('Açık', 'Light'), props.themePreference === 'light', () => props.onThemeChange('light'))}
                {segmentedOption(l('Koyu', 'Dark'), props.themePreference === 'dark', () => props.onThemeChange('dark'))}
              </View>
            </View>
            <View style={styles.compactPrefRow}>
              <Text style={styles.compactPrefLabel}>{l('Dil', 'Language')}</Text>
              <View accessibilityRole="radiogroup" style={styles.segmented}>
                {segmentedOption(l('Sistem', 'System'), languagePreference === 'system', () => setLanguage('system'))}
                {segmentedOption('TR', languagePreference === 'tr', () => setLanguage('tr'))}
                {segmentedOption('EN', languagePreference === 'en', () => setLanguage('en'))}
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{l('Uygulama hakkında', 'About the app')}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{l('Sürüm', 'Version')}</Text>
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
                  <Text style={styles.internalEyebrow}>{l('YALNIZCA GELİŞTİRME DERLEMESİ', 'DEVELOPMENT BUILD ONLY')}</Text>
                  <Text style={styles.title}>{l('Geliştirici araçları', 'Developer tools')}</Text>
                </View>
                <Text style={styles.expandIcon}>{developerToolsOpen ? '−' : '+'}</Text>
              </Pressable>
              {developerToolsOpen ? (
                <View style={styles.internalBody}>
                  <Field
                    label={l('Sunucu adresi', 'Service address')}
                    value={url}
                    onChangeText={(value) => {
                      setUrl(value);
                      setConnection('idle');
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder="https://outfit-combination-api.onrender.com"
                    hint={l('Dağıtımda HTTPS, yerel geliştirmede bilgisayarın IPv4 adresini kullan.', 'Use HTTPS in distribution and the computer IPv4 address for local development.')}
                  />
                  {!validUrl ? <Notice tone="error">{l('Geçerli bir sunucu adresi gir.', 'Enter a valid service address.')}</Notice> : null}
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
                    title={connection === 'checking' ? l('Kontrol ediliyor…', 'Checking…') : l('Bağlantıyı test et', 'Test connection')}
                    onPress={() => void testConnection()}
                    disabled={connection === 'checking' || !validUrl}
                  />
                  <PrimaryButton title={l('Sunucu adresini kaydet', 'Save service address')} onPress={() => void saveApiUrl()} loading={busy} disabled={!validUrl} />
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
  statusBadge: { borderRadius: 99, backgroundColor: colors.surfaceMuted, paddingHorizontal: 10, paddingVertical: 6 },
  statusBadgeActive: { backgroundColor: colors.primarySoft },
  statusText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  statusTextActive: { color: colors.primary },
  inlineLink: { color: colors.primary, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  deleteHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoLabel: { color: colors.muted, fontSize: 14 },
  infoValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  accountIdentity: { gap: 6 },
  accountName: { color: colors.text, fontSize: 17, fontWeight: '900' },
  accountEmail: { color: colors.muted, fontSize: 13, marginTop: 3 },
  tierRow: { flexDirection: 'row', marginTop: 4 },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.border },
  tierBadgePremium: { backgroundColor: colors.primarySoft },
  tierBadgeText: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  tierBadgeTextPremium: { color: colors.primary },
  tierPerks: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  usageGrid: { gap: spacing.sm },
  usageCard: { borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.primarySoft, gap: 5 },
  usageLabel: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  usageValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  usageDetail: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  preferenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preferenceOption: { minHeight: 48, flexGrow: 1, flexBasis: 150, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: colors.surface },
  preferenceOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  preferenceLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  preferenceLabelSelected: { color: colors.primary },
  compactPrefRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  compactPrefLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', width: 54 },
  segmented: { flex: 1, flexDirection: 'row', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  segmentedOption: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentedOptionSelected: { backgroundColor: colors.primary },
  segmentedLabel: { color: colors.text, fontSize: 12.5, fontWeight: '800' },
  segmentedLabelSelected: { color: colors.onPrimary },
  pressed: { opacity: 0.72 },
  internalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.developerBorder,
    backgroundColor: colors.developerSurface,
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
