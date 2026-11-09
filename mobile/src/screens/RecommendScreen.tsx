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
  ) => Promise<void>;
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
    setBusy(true);
    setError(null);
    try {
      const excluded = await listDislikedOutfitKeys();
      await props.onResults(
        completeSuggestions(props.items, preferences, [], excluded),
        l('Hızlı Kombin ile ücretsiz seçenekler hazırlandı.', 'Free options were created with Quick Outfits.'),
        preferences,
      );
    } finally {
      setBusy(false);
    }
  };

  const submitAi = async () => {
    if (busy || missing.length > 0) return;
    setBusy(true);
    setElapsed(0);
    setError(null);
    try {
      if (!await props.onRequestAiAccess()) {
        setError(l('AI ile kombin oluşturma başlatılmadı. Hızlı Kombin seçeneğini ücretsiz kullanabilirsin.', 'AI outfit creation was not started. You can use Quick Outfits for free.'));
        return;
      }
      try {
        const response = await requestOutfits(props.apiUrl, preferences, props.items, language);
        const checked = completeSuggestions(props.items, preferences, response.suggestions, await listDislikedOutfitKeys());
        const mobileCompleted = checked.some((x) => x.source === 'local');
        await props.onResults(
          checked,
          response.warning ?? (response.usedFallback || mobileCompleted ? l('En iyi seçenekleri tamamlamak için Hızlı Kombin desteği kullanıldı.', 'Quick Outfits helped complete the best options.') : undefined),
          preferences,
        );
      } catch {
        const local = completeSuggestions(props.items, preferences, [], await listDislikedOutfitKeys());
        await props.onResults(
          local,
          l('AI şu anda yanıt vermiyor. Beklememen için Hızlı Kombin seçenekleri hazırlandı.', 'AI is not responding right now. Quick Outfits were prepared so you do not have to wait.'),
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
                {l(`Kombin hazırlamak için ${missing.map(categoryLabel).join(', ')} kategorisinden en az bir parça ekle.`, `Add at least one item in ${missing.map(categoryLabel).join(', ')} to create an outfit.`)}
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
                    : l(`✦ AI kombinlerini hazırlıyor · ${elapsed} sn. Gerekirse Hızlı Kombin otomatik devreye girecek.`, `✦ AI is creating your outfits · ${elapsed} sec. Quick Outfits will step in automatically if needed.`)}
                </Notice>
              ) : null}
              {error ? <Notice tone="error">{error}</Notice> : null}
              {props.outfitRemaining === 0 ? (
                <Notice tone="error">{l('AI kombin kredin bitti. Hızlı Kombin ücretsiz olarak kullanılabilir.', 'Your AI outfit credits are used up. Quick Outfits remain free.')}</Notice>
              ) : null}
              {props.outfitRemaining !== undefined && props.outfitRemaining > 0 ? (
                <Text style={styles.credit}>{l(`Kalan AI kombin kredin: ${props.outfitRemaining} 🪙`, `AI outfit credits left: ${props.outfitRemaining} 🪙`)}</Text>
              ) : null}
              <Text style={styles.privacy}>{l('Kombin oluştururken kıyafet fotoğrafların paylaşılmaz.', 'Your clothing photos are never shared while creating outfits.')}</Text>
            </>
          )}
        </ContentFrame>
      </ScrollView>
      {missing.length === 0 ? (
        <StickyFooter>
          <SecondaryButton title={l('⚡ Hızlı Kombin · Ücretsiz', '⚡ Quick Outfits · Free')} onPress={() => void submitLocal()} disabled={busy} style={styles.footerButton} />
          <PrimaryButton
            title={l('✦ AI ile Kombin Bul · 1 🪙', '✦ Find Outfits with AI · 1 🪙')}
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
  credit: { color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  footerButton: { flex: 1 },
});
