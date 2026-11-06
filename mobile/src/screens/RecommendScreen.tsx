import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { completeSuggestions, getMissingCategories } from '../domain/outfitEngine';
import {
  CATEGORY_LABELS,
  type Category,
  type ClothingItem,
  type OutfitPreferences,
  type OutfitSuggestion,
} from '../domain/types';
import { requestOutfits } from '../services/api';
import { colors, radius, spacing } from '../theme/theme';

const questions = [
  {
    key: 'destination' as const,
    title: 'Nereye gidiyorsun?',
    options: ['Fark etmez', 'Günlük', 'İş/ofis', 'Arkadaş buluşması', 'Akşam yemeği', 'Özel gün'],
  },
  {
    key: 'look' as const,
    title: 'Nasıl görünmek istiyorsun?',
    options: ['Fark etmez', 'Spor', 'Rahat', 'Smart casual', 'Klasik'],
  },
  {
    key: 'tone' as const,
    title: 'Hangi tonları tercih edersin?',
    options: ['Fark etmez', 'Açık', 'Koyu', 'Karışık'],
  },
];

interface Props {
  items: ClothingItem[];
  demoMode: boolean;
  apiUrl: string;
  onBack: () => void;
  onAddCategory: (category: Category) => void;
  onResults: (suggestions: OutfitSuggestion[], warning?: string) => void;
}

export function RecommendScreen(props: Props) {
  const [preferences, setPreferences] = useState<OutfitPreferences>({
    destination: 'Fark etmez',
    look: 'Fark etmez',
    tone: 'Fark etmez',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = useMemo(() => getMissingCategories(props.items), [props.items]);

  const submit = async () => {
    if (busy || missing.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      if (props.demoMode) {
        props.onResults(completeSuggestions(props.items, preferences), 'Demo modu: kombinler telefondaki yerel kurallarla hazırlandı.');
        return;
      }
      try {
        const response = await requestOutfits(props.apiUrl, preferences, props.items);
        const checked = completeSuggestions(props.items, preferences, response.suggestions);
        const mobileCompleted = checked.some((x) => x.source === 'local');
        props.onResults(
          checked,
          response.warning ?? (response.usedFallback || mobileCompleted ? 'Bazı öneriler yerel kurallarla tamamlandı.' : undefined),
        );
      } catch (apiError) {
        const local = completeSuggestions(props.items, preferences);
        const message = apiError instanceof Error ? apiError.message : 'API bağlantısı kurulamadı.';
        props.onResults(local, `AI servisine ulaşılamadı (${message}). Yerel öneriler gösteriliyor.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Kombin Öner" onBack={props.onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        {missing.length > 0 ? (
          <View style={styles.missingCard}>
            <Text style={styles.missingTitle}>Önce dolabını tamamlayalım</Text>
            <Text style={styles.missingText}>
              Kombin için {missing.map((x) => CATEGORY_LABELS[x]).join(', ')} kategorisinden en az bir parça gerekli. Bu durumda AI çağrısı yapılmaz.
            </Text>
            {missing.map((category) => (
              <SecondaryButton key={category} title={`${CATEGORY_LABELS[category]} ekle`} onPress={() => props.onAddCategory(category)} />
            ))}
          </View>
        ) : (
          <>
            <Text style={styles.lead}>Üç kısa seçim yap; dolabındaki gerçek parçalardan seçenekler hazırlayalım.</Text>
            {questions.map((question, index) => (
              <View key={question.key} style={styles.question}>
                <Text style={styles.number}>0{index + 1}</Text>
                <Text style={styles.questionTitle}>{question.title}</Text>
                <View style={styles.options}>
                  {question.options.map((option) => (
                    <Chip
                      key={option}
                      label={option}
                      selected={preferences[question.key] === option}
                      onPress={() => setPreferences({ ...preferences, [question.key]: option })}
                    />
                  ))}
                </View>
              </View>
            ))}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <PrimaryButton title="Kombinleri hazırla" onPress={submit} loading={busy} />
            <Text style={styles.privacy}>Bu istekte sunucuya yalnızca seçimlerin, kıyafet ID’leri ve yazılı özellikler gider; fotoğraf ve dosya yolu gönderilmez.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.lg },
  lead: { color: colors.text, fontSize: 18, lineHeight: 27, fontWeight: '600' },
  question: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  number: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  questionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  missingCard: { borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  missingTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  missingText: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  privacy: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});

