import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ContentFrame, StickyFooter } from '../components/layout';
import { Chip, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { completeSuggestions, getMissingCategories } from '../domain/outfitEngine';
import {
  type Category,
  type ClothingItem,
  type OutfitPreferences,
  type OutfitSuggestion,
} from '../domain/types';
import { requestOutfits } from '../services/api';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';
import { listDislikedOutfitKeys } from '../data/database';

interface Props {
  items: ClothingItem[];
  apiUrl: string;
  onBack: () => void;
  onRequestAiAccess: () => Promise<boolean>;
  onAiUsageChanged: () => void;
  outfitRemaining?: number;
  onAddCategory: (category: Category) => void;
  onResults: (
    suggestions: OutfitSuggestion[],
    warning: string | undefined,
    preferences: OutfitPreferences,
  ) => void;
}

export function RecommendScreen(props: Props) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const categoryLabel = (value: Category) => t(`category.${value}` as 'category.top' | 'category.bottom' | 'category.shoes');
  const any = l('Fark etmez', 'Any');
  const questions = language === 'tr' ? [
    { key: 'destination' as const, title: 'Nereye gidiyorsun?', options: ['Fark etmez', 'Günlük', 'İş/ofis', 'Arkadaş buluşması', 'Akşam yemeği', 'Özel gün'] },
    { key: 'look' as const, title: 'Nasıl görünmek istiyorsun?', options: ['Fark etmez', 'Spor', 'Rahat', 'Smart casual', 'Klasik'] },
    { key: 'tone' as const, title: 'Hangi tonları tercih edersin?', options: ['Fark etmez', 'Açık', 'Koyu', 'Karışık'] },
  ] : [
    { key: 'destination' as const, title: 'Where are you going?', options: ['Any', 'Daily', 'Work/office', 'Meeting friends', 'Dinner', 'Special occasion'] },
    { key: 'look' as const, title: 'How do you want to look?', options: ['Any', 'Sporty', 'Relaxed', 'Smart casual', 'Classic'] },
    { key: 'tone' as const, title: 'Which tones do you prefer?', options: ['Any', 'Light', 'Dark', 'Mixed'] },
  ];
  const { width } = useWindowDimensions();
  const [preferences, setPreferences] = useState<OutfitPreferences>({
    destination: any,
    look: any,
    tone: any,
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

  const submitLocal = async () => {
    if (busy || missing.length > 0) return;
    setError(null);
    const excluded = await listDislikedOutfitKeys();
    props.onResults(
      completeSuggestions(props.items, preferences, [], excluded),
      l('Kombinler fotoğraf ve özelliklerin cihazından gönderilmeden yerel kurallarla hazırlandı.', 'Outfits were created with local rules without sending photos or attributes off your device.'),
      preferences,
    );
  };

  const submitAi = async () => {
    if (busy || missing.length > 0) return;
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      if (!await props.onRequestAiAccess()) {
        setError(l('Akıllı öneri kullanılmadı. Ücretsiz yerel öneriyi seçebilirsin.', 'Smart suggestions were not used. You can choose the free local option.'));
        return;
      }
      try {
        const response = await requestOutfits(props.apiUrl, preferences, props.items, language);
        const checked = completeSuggestions(props.items, preferences, response.suggestions, await listDislikedOutfitKeys());
        const mobileCompleted = checked.some((x) => x.source === 'local');
        props.onResults(
          checked,
          response.warning ?? (response.usedFallback || mobileCompleted ? l('Bazı öneriler yerel kurallarla tamamlandı.', 'Some suggestions were completed with local rules.') : undefined),
          preferences,
        );
      } catch (apiError) {
        const local = completeSuggestions(props.items, preferences, [], await listDislikedOutfitKeys());
        const message = apiError instanceof Error ? apiError.message : l('Bağlantı kurulamadı.', 'Could not connect.');
        props.onResults(
          local,
          l(`Akıllı öneri servisine ulaşılamadı (${message}). Yerel öneriler gösteriliyor.`, `The smart suggestion service is unavailable (${message}). Showing local suggestions.`),
          preferences,
        );
      }
    } finally {
      setBusy(false);
      props.onAiUsageChanged();
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('home.recommend')} onBack={props.onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={1120} style={styles.content}>
          {missing.length > 0 ? (
            <View style={styles.missingCard}>
              <Text style={styles.missingTitle}>{l('Önce dolabını tamamlayalım', 'Complete your wardrobe first')}</Text>
              <Text style={styles.missingText}>
                {l(`Kombin için ${missing.map(categoryLabel).join(', ')} kategorisinden en az bir parça gerekli. Bu durumda akıllı öneri isteği gönderilmez.`, `Add at least one item in ${missing.map(categoryLabel).join(', ')}. No smart request is sent while a category is missing.`)}
              </Text>
              {missing.map((category) => (
                <SecondaryButton key={category} title={`${categoryLabel(category)} ${l('ekle', 'add')}`} onPress={() => props.onAddCategory(category)} />
              ))}
            </View>
          ) : (
            <>
              <Text style={styles.lead}>{l('Üç kısa seçim yap; dolabındaki gerçek parçalardan seçenekler hazırlayalım.', 'Make three quick choices and we will use real items from your wardrobe.')}</Text>
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
                    ? l(`Seçimlerin hazırlanıyor · ${elapsed} sn`, `Preparing your choices · ${elapsed} sec`)
                    : l(`Akıllı öneri bekleniyor · ${elapsed} sn. Ulaşılamazsa yerel kombinler otomatik gösterilecek.`, `Waiting for smart suggestions · ${elapsed} sec. Local outfits will appear automatically if unavailable.`)}
                </Notice>
              ) : null}
              {error ? <Notice tone="error">{error}</Notice> : null}
              {props.outfitRemaining === 0 ? (
                <Notice tone="error">{l('Akıllı kombin hakkın doldu. Yerel öneri ücretsiz olarak kullanılabilir.', 'Your smart outfit credits are used up. Local suggestions remain free.')}</Notice>
              ) : null}
              <Text style={styles.privacy}>{l('Bu istekte sunucuya yalnızca seçimlerin, kıyafet ID’leri ve yazılı özellikler gider; fotoğraf ve dosya yolu gönderilmez.', 'Only your choices, clothing IDs, and text attributes are sent; photos and file paths are never included.')}</Text>
            </>
          )}
        </ContentFrame>
      </ScrollView>
      {missing.length === 0 ? (
        <StickyFooter>
          <SecondaryButton title={l('Yerel öner · Ücretsiz', 'Local suggestions · Free')} onPress={() => void submitLocal()} disabled={busy} style={styles.footerButton} />
          <PrimaryButton
            title={`${l('Akıllı öner', 'Smart suggestions')}${props.outfitRemaining === undefined ? '' : ` · ${props.outfitRemaining} ${l('hak', 'credits')}`}`}
            onPress={() => void submitAi()}
            loading={busy}
            disabled={props.outfitRemaining === 0}
            style={styles.footerButton}
          />
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
