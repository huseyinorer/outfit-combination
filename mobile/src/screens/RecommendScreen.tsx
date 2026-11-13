import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ContentFrame, StickyFooter } from '../components/layout';
import { Chip, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { completeSuggestions, getMissingCategories } from '../domain/outfitEngine';
import {
  OPTIONAL_CATEGORIES,
  type Category,
  type ClothingItem,
  type OptionalCategory,
  type OutfitPreferences,
  type OutfitRequestExtras,
  type OutfitSuggestion,
} from '../domain/types';
import { requestOutfits } from '../services/api';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';
import { getSetting, listDislikedOutfitKeys, setSetting } from '../data/database';
import { getCachedWeather, loadFreshWeather, matchesWeather, type WeatherSnapshot } from '../services/weather';

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
  const categoryLabel = (value: Category) =>
    t(`category.${value}` as 'category.top' | 'category.bottom' | 'category.shoes' | 'category.hat' | 'category.accessory' | 'category.outerwear');
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
  const [extras, setExtrasState] = useState<OutfitRequestExtras>({ hat: 'auto', accessory: 'auto', outerwear: 'auto' });

  const [extrasTipSeen, setExtrasTipSeen] = useState(true);

  useEffect(() => {
    void (async () => {
      const raw = await getSetting('outfit_extras_preference');
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<Record<OptionalCategory, 'auto' | 'include' | 'exclude'>>;
          setExtrasState((current) => ({
            hat: parsed.hat ?? current.hat ?? 'auto',
            accessory: parsed.accessory ?? current.accessory ?? 'auto',
            outerwear: parsed.outerwear ?? current.outerwear ?? 'auto',
          }));
        } catch {
          // malformed setting; ignore and keep defaults
        }
      }
      const tipSeen = await getSetting('extras_tip_seen');
      setExtrasTipSeen(tipSeen === '1');
    })();
  }, []);

  const dismissExtrasTip = () => {
    setExtrasTipSeen(true);
    void setSetting('extras_tip_seen', '1');
  };

  const setExtras = (next: OutfitRequestExtras) => {
    setExtrasState(next);
    void setSetting('outfit_extras_preference', JSON.stringify(next));
  };
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherFilter, setWeatherFilter] = useState(false);
  const weatherAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await getSetting('weather_filter_enabled');
      if (stored === '1') setWeatherFilter(true);
      const cached = await getCachedWeather();
      if (cached) setWeather(cached);
    })();
    return () => weatherAbortRef.current?.abort();
  }, []);

  const refreshWeather = async () => {
    weatherAbortRef.current?.abort();
    const controller = new AbortController();
    weatherAbortRef.current = controller;
    setWeatherBusy(true);
    try {
      const snapshot = await loadFreshWeather(controller.signal);
      if (!controller.signal.aborted) setWeather(snapshot);
    } finally {
      if (weatherAbortRef.current === controller) weatherAbortRef.current = null;
      setWeatherBusy(false);
    }
  };

  const toggleWeatherFilter = async () => {
    const next = !weatherFilter;
    setWeatherFilter(next);
    await setSetting('weather_filter_enabled', next ? '1' : '0');
    if (next && !weather) void refreshWeather();
  };

  const filteredItems = useMemo(() => {
    if (!weatherFilter || !weather) return props.items;
    return props.items.filter((item) => matchesWeather(item.seasons, weather));
  }, [props.items, weather, weatherFilter]);

  const missing = useMemo(() => getMissingCategories(filteredItems), [filteredItems]);
  const availableExtras = useMemo<OptionalCategory[]>(
    () => OPTIONAL_CATEGORIES.filter((category) => filteredItems.some((item) => item.category === category)),
    [filteredItems],
  );
  const extraModeLabels: Record<'auto' | 'include' | 'exclude', string> = {
    auto: l('Otomatik', 'Auto'),
    include: l('Ekle', 'Include'),
    exclude: l('Ekleme', 'Skip'),
  };
  const extraModeExplanations: Record<'auto' | 'include' | 'exclude', string> = {
    auto: l('Kombine uyuyorsa AI ekler.', 'AI adds it when it fits the outfit.'),
    include: l('Dolabından en uygun parçayı mutlaka ekler.', 'Always adds the best fit from your wardrobe.'),
    exclude: l('Bu öneride dışarıda bırakılır.', 'Left out of this outfit.'),
  };
  const countByCategory = useMemo<Record<OptionalCategory, number>>(() => ({
    hat: filteredItems.filter((item) => item.category === 'hat').length,
    accessory: filteredItems.filter((item) => item.category === 'accessory').length,
    outerwear: filteredItems.filter((item) => item.category === 'outerwear').length,
  }), [filteredItems]);
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
        completeSuggestions(filteredItems, preferences, [], excluded, extras),
        weatherFilter && weather
          ? l(`Hızlı Kombin · bugünün havasına (${Math.round(weather.temperatureC)}°C) uygun parçalardan.`, `Quick Outfits · from items matching today's weather (${Math.round(weather.temperatureC)}°C).`)
          : l('Hızlı Kombin ile ücretsiz seçenekler hazırlandı.', 'Free options were created with Quick Outfits.'),
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
        const response = await requestOutfits(props.apiUrl, preferences, filteredItems, language, extras);
        const checked = completeSuggestions(filteredItems, preferences, response.suggestions, await listDislikedOutfitKeys(), extras);
        const mobileCompleted = checked.some((x) => x.source === 'local');
        await props.onResults(
          checked,
          response.warning ?? (response.usedFallback || mobileCompleted ? l('En iyi seçenekleri tamamlamak için Hızlı Kombin desteği kullanıldı.', 'Quick Outfits helped complete the best options.') : undefined),
          preferences,
        );
      } catch {
        const local = completeSuggestions(filteredItems, preferences, [], await listDislikedOutfitKeys(), extras);
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
              <WeatherCard
                weather={weather}
                enabled={weatherFilter}
                busy={weatherBusy}
                onToggle={() => void toggleWeatherFilter()}
                onRefresh={() => void refreshWeather()}
                filteredCount={filteredItems.length}
                totalCount={props.items.length}
                language={language}
              />
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
              {availableExtras.length > 0 && !extrasTipSeen ? (
                <View style={styles.extrasTooltip}>
                  <Text style={styles.extrasTooltipTitle}>{l('✨ Ekstralar hazır', '✨ Extras are ready')}</Text>
                  <Text style={styles.extrasTooltipText}>
                    {l(
                      'Şapka, aksesuar ve montun için üç seçeneğin var: AI\'a bırak, hep ekle veya bu kombinde kullanma.',
                      'For hats, accessories and jackets you have three choices: let AI decide, always include, or skip for this outfit.',
                    )}
                  </Text>
                  <Pressable onPress={dismissExtrasTip} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.extrasTooltipAction}>{l('Anladım', 'Got it')}</Text>
                  </Pressable>
                </View>
              ) : null}
              {availableExtras.length > 0 ? (
                <View style={styles.question}>
                  <Text style={styles.number}>0{questions.length + 1}</Text>
                  <Text style={styles.questionTitle}>{l('Ekstralar', 'Extras')}</Text>
                  <Text style={styles.extrasHint}>
                    {l('Her ekstra için üç mod var: Otomatik, Ekle, Ekleme. Seçiminin altında ne yapacağı yazar.', 'Each extra has three modes: Auto, Include, Skip. The current mode\'s meaning appears below.')}
                  </Text>
                  {availableExtras.map((category) => {
                    const selectedMode = (extras[category] ?? 'auto') as 'auto' | 'include' | 'exclude';
                    return (
                      <View key={category} style={styles.extraRow}>
                        <View style={styles.extraHeader}>
                          <Text style={styles.extraLabel}>{categoryLabel(category)}</Text>
                          <Text style={styles.extraCount}>{l(`${countByCategory[category]} parça`, `${countByCategory[category]} items`)}</Text>
                        </View>
                        <View style={styles.options}>
                          {(['auto', 'include', 'exclude'] as const).map((mode) => (
                            <Chip
                              key={mode}
                              label={extraModeLabels[mode]}
                              selected={selectedMode === mode}
                              onPress={() => setExtras({ ...extras, [category]: mode })}
                            />
                          ))}
                        </View>
                        <Text style={styles.extraExplanation}>{extraModeExplanations[selectedMode]}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
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

function seasonLabel(season: WeatherSnapshot['season'], language: string): string {
  const map = language === 'tr'
    ? { summer: 'yaz parçaları', autumn: 'geçiş parçaları', winter: 'kış parçaları', spring: 'ilkbahar parçaları' }
    : { summer: 'summer items', autumn: 'transitional items', winter: 'winter items', spring: 'spring items' };
  return map[season];
}

function weatherEmoji(season: WeatherSnapshot['season'], raining: boolean): string {
  if (raining) return '🌧️';
  if (season === 'summer') return '☀️';
  if (season === 'winter') return '❄️';
  if (season === 'autumn') return '🍂';
  return '🌤️';
}

interface WeatherCardProps {
  weather: WeatherSnapshot | null;
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  filteredCount: number;
  totalCount: number;
  language: string;
}

function WeatherCard({ weather, enabled, busy, onToggle, onRefresh, filteredCount, totalCount, language }: WeatherCardProps) {
  const l = (tr: string, en: string) => language === 'tr' ? tr : en;
  const hiddenCount = Math.max(0, totalCount - filteredCount);

  return (
    <View style={[styles.weatherCard, enabled && styles.weatherCardOn]}>
      <View style={styles.weatherTop}>
        <View style={styles.weatherLeft}>
          <Text style={styles.weatherEmoji}>
            {weather ? weatherEmoji(weather.season, weather.isRaining) : '🌍'}
          </Text>
          <View style={styles.weatherTextCol}>
            {busy ? (
              <View style={styles.weatherBusyRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.weatherTitle}>{l('Hava durumu alınıyor…', 'Fetching weather…')}</Text>
              </View>
            ) : weather ? (
              <>
                <Text style={styles.weatherTitle}>
                  {Math.round(weather.temperatureC)}°C
                  {weather.locationLabel ? ` · ${weather.locationLabel}` : ''}
                </Text>
                <Text style={styles.weatherSub}>
                  {enabled
                    ? l(`${seasonLabel(weather.season, language)} öneriliyor`, `recommending ${seasonLabel(weather.season, language)}`)
                    : l('Hava durumuna göre filtrelemek için aç', 'Turn on to filter by weather')}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.weatherTitle}>{l('Bugünün havasına göre filtrele', 'Filter by today\'s weather')}</Text>
                <Text style={styles.weatherSub}>
                  {l('Konum izni ister, sadece filtre için kullanılır.', 'Asks for location, only used for filtering.')}
                </Text>
              </>
            )}
          </View>
        </View>
        <Pressable
          onPress={onToggle}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled }}
          style={[styles.toggleTrack, enabled && styles.toggleTrackOn]}
          hitSlop={8}
        >
          <View style={[styles.toggleThumb, enabled && styles.toggleThumbOn]} />
        </Pressable>
      </View>
      {enabled && weather && hiddenCount > 0 ? (
        <Text style={styles.weatherHidden}>
          {l(`Bu havaya uymadığı için ${hiddenCount} parça hariç tutuldu.`, `${hiddenCount} items were hidden as they do not match this weather.`)}
        </Text>
      ) : null}
      {enabled && weather ? (
        <Pressable onPress={onRefresh} hitSlop={8} accessibilityRole="button">
          <Text style={styles.weatherRefresh}>{l('Hava durumunu yenile', 'Refresh weather')}</Text>
        </Pressable>
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
  extrasHint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  extrasTooltip: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    gap: spacing.xs,
  },
  extrasTooltipTitle: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  extrasTooltipText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  extrasTooltipAction: { color: colors.primary, fontSize: 13, fontWeight: '800', alignSelf: 'flex-end', paddingTop: 4 },
  extraRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  extraHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  extraLabel: { color: colors.text, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  extraCount: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  extraExplanation: { color: colors.primary, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  number: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  questionTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  missingCard: { borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
  missingTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  missingText: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  privacy: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  credit: { color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  footerButton: { flex: 1 },
  weatherCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  weatherCardOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  weatherTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weatherLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weatherEmoji: { fontSize: 30 },
  weatherTextCol: { flex: 1, gap: 2 },
  weatherTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  weatherSub: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  weatherBusyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weatherHidden: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  weatherRefresh: { color: colors.primary, fontSize: 12, fontWeight: '800', alignSelf: 'flex-start' },
  toggleTrack: {
    width: 46, height: 28, borderRadius: 14,
    backgroundColor: colors.border,
    padding: 2, justifyContent: 'center',
  },
  toggleTrackOn: { backgroundColor: colors.primary },
  toggleThumb: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surface,
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
});
