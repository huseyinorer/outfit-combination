import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ContentFrame, StickyFooter } from '../components/layout';
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
  onRequestAiConsent: () => Promise<boolean>;
  onAddCategory: (category: Category) => void;
  onResults: (
    suggestions: OutfitSuggestion[],
    warning: string | undefined,
    preferences: OutfitPreferences,
  ) => void;
}

export function RecommendScreen(props: Props) {
  const { width } = useWindowDimensions();
  const [preferences, setPreferences] = useState<OutfitPreferences>({
    destination: 'Fark etmez',
    look: 'Fark etmez',
    tone: 'Fark etmez',
  });
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const missing = useMemo(() => getMissingCategories(props.items), [props.items]);
  const wide = width >= 900;

  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [busy]);

  const submit = async () => {
    if (busy || missing.length > 0) return;
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      if (props.demoMode) {
        props.onResults(
          completeSuggestions(props.items, preferences),
          'Demo modu: kombinler telefondaki yerel kurallarla hazırlandı.',
          preferences,
        );
        return;
      }
      if (!await props.onRequestAiConsent()) {
        props.onResults(
          completeSuggestions(props.items, preferences),
          'AI paylaşım onayı verilmedi; kombinler tamamen telefonda hazırlandı.',
          preferences,
        );
        return;
      }
      try {
        const response = await requestOutfits(props.apiUrl, preferences, props.items);
        const checked = completeSuggestions(props.items, preferences, response.suggestions);
        const mobileCompleted = checked.some((x) => x.source === 'local');
        props.onResults(
          checked,
          response.warning ?? (response.usedFallback || mobileCompleted ? 'Bazı öneriler yerel kurallarla tamamlandı.' : undefined),
          preferences,
        );
      } catch (apiError) {
        const local = completeSuggestions(props.items, preferences);
        const message = apiError instanceof Error ? apiError.message : 'API bağlantısı kurulamadı.';
        props.onResults(
          local,
          `AI servisine ulaşılamadı (${message}). Yerel öneriler gösteriliyor.`,
          preferences,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Kombin Öner" onBack={props.onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={1120} style={styles.content}>
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
              <View style={[styles.questions, wide && styles.questionsWide]}>
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
              </View>
              {busy ? (
                <Notice>
                  {elapsed < 5
                    ? `Seçimlerin hazırlanıyor · ${elapsed} sn`
                    : `AI ve ücretsiz backend yanıtı bekleniyor · ${elapsed} sn. Ulaşılamazsa yerel kombinler otomatik gösterilecek.`}
                </Notice>
              ) : null}
              {error ? <Notice tone="error">{error}</Notice> : null}
              <Text style={styles.privacy}>Bu istekte sunucuya yalnızca seçimlerin, kıyafet ID’leri ve yazılı özellikler gider; fotoğraf ve dosya yolu gönderilmez.</Text>
            </>
          )}
        </ContentFrame>
      </ScrollView>
      {missing.length === 0 ? (
        <StickyFooter>
          <PrimaryButton title="Kombinleri hazırla" onPress={() => void submit()} loading={busy} style={styles.footerButton} />
        </StickyFooter>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 32 },
  content: { padding: spacing.md, gap: spacing.lg },
  lead: { color: colors.text, fontSize: 18, lineHeight: 27, fontWeight: '600' },
  questions: { gap: spacing.md },
  questionsWide: { flexDirection: 'row', alignItems: 'stretch' },
  question: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  number: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  questionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  missingCard: { borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  missingTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  missingText: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  privacy: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  footerButton: { flex: 1 },
});
