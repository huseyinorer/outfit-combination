import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContentFrame } from '../components/layout';
import { Chip, Field, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { checkApiHealth } from '../services/api';
import { colors, radius, spacing } from '../theme/theme';

export function SettingsScreen({ demoMode, apiUrl, onSave, onBack }: {
  demoMode: boolean;
  apiUrl: string;
  onSave: (demoMode: boolean, apiUrl: string) => Promise<void>;
  onBack: () => void;
}) {
  const [demo, setDemo] = useState(demoMode);
  const [url, setUrl] = useState(apiUrl);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(!apiUrl);
  const [connection, setConnection] = useState<'idle' | 'checking' | 'online' | 'offline'>('idle');

  const testConnection = async () => {
    if (!url.trim()) {
      setConnection('offline');
      return;
    }
    setConnection('checking');
    setConnection(await checkApiHealth(url) ? 'online' : 'offline');
  };

  useEffect(() => {
    if (apiUrl) void testConnection();
    // The initial bundled/stored URL is checked once when this screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setBusy(true);
    try { await onSave(demo, url.trim().replace(/\/$/, '')); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Ayarlar" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
            <View style={[styles.dot, connection === 'online' ? styles.dotOnline : connection === 'offline' ? styles.dotOffline : styles.dotIdle]} />
            <Text style={styles.connectionText}>
              {connection === 'checking' ? 'Backend kontrol ediliyor…' : connection === 'online' ? 'Backend bağlı' : connection === 'offline' ? 'Backend şu an yanıt vermiyor' : 'Backend henüz kontrol edilmedi'}
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
        {!demo && !url.trim() ? <Notice tone="error">Gerçek AI modu için API adresi gerekli.</Notice> : null}
        <Notice>API anahtarı bu uygulamaya yazılmaz; yalnızca güvenli backend ortam değişkeninde bulunur.</Notice>
        <PrimaryButton title="Ayarları kaydet" onPress={save} loading={busy} disabled={!demo && !url.trim()} />
        </ContentFrame>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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
  dotIdle: { backgroundColor: colors.muted },
  advancedToggle: { minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.sm },
  advancedText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  advancedIcon: { color: colors.primary, fontSize: 24, fontWeight: '600' },
});

