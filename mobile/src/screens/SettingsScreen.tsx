import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip, Field, Notice, PrimaryButton, ScreenHeader } from '../components/ui';
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

  const save = async () => {
    setBusy(true);
    try { await onSave(demo, url.trim().replace(/\/$/, '')); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Ayarlar" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Çalışma modu</Text>
          <View style={styles.row}>
            <Chip label="Demo modu" selected={demo} onPress={() => setDemo(true)} />
            <Chip label="Gerçek AI" selected={!demo} onPress={() => setDemo(false)} />
          </View>
          <Text style={styles.text}>Demo modunda fotoğraf bilgilerini elle girersin; kombinler tamamen telefonda hazırlanır.</Text>
        </View>
        <Field
          label="Backend API adresi"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://192.168.1.100:5080"
          hint="Telefon ve bilgisayar aynı Wi-Fi ağındayken bilgisayarın IPv4 adresini kullan."
        />
        {!demo && !url.trim() ? <Notice tone="error">Gerçek AI modu için API adresi gerekli.</Notice> : null}
        <Notice>API anahtarı bu uygulamaya yazılmaz. Yalnızca bilgisayarda çalışan backend ortam değişkeninde bulunur.</Notice>
        <PrimaryButton title="Ayarları kaydet" onPress={save} loading={busy} disabled={!demo && !url.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  text: { color: colors.muted, fontSize: 14, lineHeight: 21 },
});

