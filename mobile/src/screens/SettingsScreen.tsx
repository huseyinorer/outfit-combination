import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { ContentFrame } from '../components/layout';
import { Chip, DangerButton, Field, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { isSecureApiBaseUrl, isValidApiBaseUrl, normalizeApiBaseUrl } from '../domain/apiUrl';
import { AI_DISCLOSURE } from '../domain/privacy';
import { getApiHealth } from '../services/api';
import { colors, radius, spacing } from '../theme/theme';

export function SettingsScreen({ demoMode, apiUrl, aiConsentGranted, onSave, onGrantAiConsent, onRevokeAiConsent, onDeleteAllData, onPrivacy, onBack }: {
  demoMode: boolean;
  apiUrl: string;
  aiConsentGranted: boolean;
  onSave: (demoMode: boolean, apiUrl: string) => Promise<void>;
  onGrantAiConsent: () => Promise<void>;
  onRevokeAiConsent: () => Promise<void>;
  onDeleteAllData: () => Promise<void>;
  onPrivacy: () => void;
  onBack: () => void;
}) {
  const [demo, setDemo] = useState(demoMode);
  const [url, setUrl] = useState(normalizeApiBaseUrl(apiUrl));
  const [busy, setBusy] = useState(false);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [advanced, setAdvanced] = useState(!normalizeApiBaseUrl(apiUrl));
  const [connection, setConnection] = useState<'idle' | 'checking' | 'online' | 'degraded' | 'offline' | 'invalid'>('idle');
  const normalizedUrl = normalizeApiBaseUrl(url);
  const allowHttpApi = String(Constants.expoConfig?.extra?.appEnvironment ?? 'development') === 'development';
  const validUrl = isValidApiBaseUrl(url) && (allowHttpApi || isSecureApiBaseUrl(url));

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

  useEffect(() => {
    if (apiUrl) void testConnection();
    // The initial bundled/stored URL is checked once when this screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setBusy(true);
    try { await onSave(demo, normalizedUrl); }
    finally { setBusy(false); }
  };

  const grantConsent = async () => {
    setPrivacyBusy(true);
    try { await onGrantAiConsent(); }
    finally { setPrivacyBusy(false); }
  };

  const revokeConsent = async () => {
    setPrivacyBusy(true);
    try {
      await onRevokeAiConsent();
      setDemo(true);
    } finally {
      setPrivacyBusy(false);
    }
  };

  const confirmDeleteAll = () => {
    Alert.alert(
      'Tüm yerel verileri sil',
      'Kıyafetler, fotoğraflar, favoriler, taslak ve ayarlar bu cihazdan kalıcı olarak silinecek.',
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
                  try { await onDeleteAllData(); }
                  catch (error) {
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

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScreenHeader title="Ayarlar" onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ContentFrame maxWidth={760} style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Çalışma modu</Text>
          <View style={styles.row}>
            <Chip label="Demo modu" selected={demo} onPress={() => setDemo(true)} />
            <Chip label="Gerçek AI" selected={!demo} onPress={() => setDemo(false)} />
          </View>
          <Text style={styles.text}>Demo modunda fotoğraf bilgilerini elle girersin; kombinler tamamen telefonda hazırlanır.</Text>
        </View>
        <View style={styles.connectionCard}>
          <View style={styles.connectionRow}>
            <View style={[styles.dot, connection === 'online' ? styles.dotOnline : connection === 'offline' ? styles.dotOffline : connection === 'degraded' ? styles.dotWarning : styles.dotIdle]} />
            <Text style={styles.connectionText}>
              {connection === 'checking'
                ? 'Backend kontrol ediliyor; Render uyanıyor olabilir…'
                : connection === 'online'
                  ? 'Backend bağlı'
                  : connection === 'degraded'
                    ? 'Backend bağlı; kalıcı AI kotası yapılandırılmamış'
                  : connection === 'offline'
                    ? 'Backend 90 saniye içinde yanıt vermedi'
                    : connection === 'invalid'
                      ? 'Backend adresi geçersiz'
                      : 'Backend henüz kontrol edilmedi'}
            </Text>
          </View>
          <SecondaryButton title={connection === 'checking' ? 'Kontrol ediliyor…' : 'Bağlantıyı test et'} onPress={testConnection} disabled={connection === 'checking'} />
        </View>
        <Pressable onPress={() => setAdvanced((value) => !value)} style={styles.advancedToggle}>
          <Text style={styles.advancedText}>{advanced ? 'Gelişmiş ayarları gizle' : 'Gelişmiş ayarları göster'}</Text>
          <Text style={styles.advancedIcon}>{advanced ? '−' : '+'}</Text>
        </Pressable>
        {advanced ? (
          <Field
            label="Backend API adresi"
            value={url}
            onChangeText={(value) => { setUrl(value); setConnection('idle'); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://outfit-combination-api.onrender.com"
            hint="Üretimde Render HTTPS adresi; yerel geliştirmede bilgisayarın IPv4 adresi kullanılır."
          />
        ) : null}
        {!demo && !validUrl ? <Notice tone="error">Gerçek AI modu için geçerli bir HTTPS API adresi gerekli. HTTP yalnız geliştirme sürümünde kullanılabilir.</Notice> : null}
        {url.trim() !== normalizedUrl ? <Notice>Adresin sonundaki boşluk ve ek parametre kaydederken otomatik temizlenecek.</Notice> : null}
        <Notice>API anahtarı bu uygulamaya yazılmaz; yalnızca güvenli backend ortam değişkeninde bulunur.</Notice>
        <View style={styles.card}>
          <Text style={styles.title}>Gizlilik ve veriler</Text>
          <Text style={styles.text}>{AI_DISCLOSURE}</Text>
          <SecondaryButton title="Gizlilik politikası ve KVKK" onPress={onPrivacy} />
          <Notice>
            {aiConsentGranted
              ? 'AI veri paylaşım onayı etkin. İstediğin zaman geri çekebilirsin.'
              : 'AI veri paylaşım onayı verilmedi. Demo ve yerel kombin özellikleri veri göndermeden çalışır.'}
          </Notice>
          {aiConsentGranted ? (
            <SecondaryButton title="AI onayını geri çek" onPress={() => void revokeConsent()} disabled={privacyBusy} />
          ) : (
            <SecondaryButton title="AI paylaşımına onay ver" onPress={() => void grantConsent()} disabled={privacyBusy} />
          )}
          <Text style={styles.deleteHint}>Aşağıdaki işlem yalnızca bu cihazdaki uygulama verilerini siler; geri alınamaz.</Text>
          <DangerButton title="Tüm yerel verilerimi sil" onPress={confirmDeleteAll} disabled={privacyBusy} />
        </View>
        <PrimaryButton title="Ayarları kaydet" onPress={save} loading={busy} disabled={!demo && !validUrl} />
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
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  text: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  connectionCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  connectionText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  dot: { width: 11, height: 11, borderRadius: 6 },
  dotOnline: { backgroundColor: colors.primary },
  dotOffline: { backgroundColor: colors.danger },
  dotWarning: { backgroundColor: '#B7791F' },
  dotIdle: { backgroundColor: colors.muted },
  advancedToggle: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.sm },
  advancedText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  advancedIcon: { color: colors.primary, fontSize: 24, fontWeight: '600' },
  deleteHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});

