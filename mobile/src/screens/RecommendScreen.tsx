import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ContentFrame, StickyFooter } from '../components/layout';
import { Chip, Field, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { completeSuggestions, getMissingCategories } from '../domain/outfitEngine';
import {
  OPTIONAL_CATEGORIES,
  type Category,
  type ClothingItem,
  type OptionalCategory,
  type OutfitDislike,
  type OutfitKeyTriple,
  type OutfitPreferences,
  type OutfitRequestExtras,
  type OutfitResultsPayload,
} from '../domain/types';
import { requestOutfits } from '../services/api';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';
import {
  getSetting,
  listDislikedOutfitKeys,
  listDislikedOutfits,
  listSuggestionHistory,
  listWornOutfits,
  setSetting,
} from '../data/database';
import { getCachedWeather, loadFreshWeather, matchesWeather, type WeatherSnapshot } from '../services/weather';

/**
 * Combinations the AI should not propose again: disliked ones, outfits worn in the last two
 * weeks and the last few suggestion batches. Best effort — a read failure just sends nothing.
 */
async function recentOutfitsToAvoid(): Promise<OutfitKeyTriple[]> {
  try {
    const [disliked, worn, history] = await Promise.all([
      listDislikedOutfitKeys(),
      listWornOutfits(60),
      listSuggestionHistory(3),
    ]);
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const keys = new Set<string>(disliked);
    worn.filter((entry) => Date.parse(entry.wornAt) >= twoWeeksAgo)
      .forEach((entry) => keys.add(`${entry.topId}|${entry.bottomId}|${entry.shoeId}`));
    history.forEach((entry) => keys.add(`${entry.topId}|${entry.bottomId}|${entry.shoeId}`));
    return [...keys].slice(0, 200).map((key) => {
      const [topId = '', bottomId = '', shoeId = ''] = key.split('|');
      return { topId, bottomId, shoeId };
    });
  } catch {
    return [];
  }
}

async function recentDislikes(): Promise<OutfitDislike[]> {
  try {
    return await listDislikedOutfits(30);
  } catch {
    return [];
  }
}

type ExtraMode = 'auto' | 'include' | 'exclude';

// Kept for the app session so "back" from the results screen restores what the user typed.
const sessionDraft: { note: string; shopCategories: Category[] } = { note: '', shopCategories: [] };

interface Preset {
  label: string;
  value: OutfitPreferences;
}

interface Props {
  items: ClothingItem[];
  apiUrl: string;
  /** Piece to build every outfit around ("outfit with this item"). */
  initialAnchorId?: string | null;
  onBack: () => void;
  onRequestAiAccess: () => Promise<boolean>;
  onAiUsageChanged: () => void;
  outfitRemaining?: number;
  onAddCategory: (category: Category) => void;
  onResults: (payload: OutfitResultsPayload) => Promise<void>;
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
  const presets: Preset[] = language === 'tr' ? [
    { label: '💼 Ofis günü', value: { destination: 'İş/ofis', look: 'Smart casual', tone: 'Fark etmez' } },
    { label: '☕ Hafta sonu', value: { destination: 'Günlük', look: 'Rahat', tone: 'Fark etmez' } },
    { label: '🍷 Akşam yemeği', value: { destination: 'Akşam yemeği', look: 'Klasik', tone: 'Koyu' } },
    { label: '🎉 Özel gün', value: { destination: 'Özel gün', look: 'Klasik', tone: 'Fark etmez' } },
  ] : [
    { label: '💼 Office day', value: { destination: 'Work/office', look: 'Smart casual', tone: 'Any' } },
    { label: '☕ Weekend', value: { destination: 'Daily', look: 'Relaxed', tone: 'Any' } },
    { label: '🍷 Dinner', value: { destination: 'Dinner', look: 'Classic', tone: 'Dark' } },
    { label: '🎉 Special day', value: { destination: 'Special occasion', look: 'Classic', tone: 'Any' } },
  ];
  const preferencesKey = `outfit_preferences_last:${language}`;
  const { width } = useWindowDimensions();
  const [preferences, setPreferencesState] = useState<OutfitPreferences>({ destination: any, look: any, tone: any });
  const [extras, setExtrasState] = useState<OutfitRequestExtras>({ hat: 'auto', accessory: 'auto', outerwear: 'auto' });
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [anchorId, setAnchorId] = useState<string | null>(props.initialAnchorId ?? null);
  const [note, setNoteState] = useState(sessionDraft.note);
  const setNote = (value: string) => {
    sessionDraft.note = value;
    setNoteState(value);
  };
  const [shopCategories, setShopCategoriesState] = useState<Category[]>(sessionDraft.shopCategories);
  const setShopCategories = (update: Category[] | ((current: Category[]) => Category[])) => {
    setShopCategoriesState((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      sessionDraft.shopCategories = next;
      return next;
    });
  };
  const maxShopCategories = 3;
  const toggleShopCategory = (category: Category) => {
    setShopCategories((current) => {
      if (current.includes(category)) return current.filter((value) => value !== category);
      if (current.length >= maxShopCategories) return current;
      return [...current, category];
    });
  };
  // The fixed piece can never be bought at the same time.
  useEffect(() => {
    const anchorCategory = anchorId ? props.items.find((item) => item.id === anchorId)?.category : undefined;
    if (anchorCategory) setShopCategories((current) => current.filter((value) => value !== anchorCategory));
  }, [anchorId, props.items]);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      const raw = await getSetting('outfit_extras_preference');
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<Record<OptionalCategory, ExtraMode>>;
          setExtrasState((current) => ({
            hat: parsed.hat ?? current.hat ?? 'auto',
            accessory: parsed.accessory ?? current.accessory ?? 'auto',
            outerwear: parsed.outerwear ?? current.outerwear ?? 'auto',
          }));
        } catch {
          // malformed setting; ignore and keep defaults
        }
      }
      // Restore the last choices, keeping only values that still exist in this language.
      const last = await getSetting(preferencesKey);
      if (last) {
        try {
          const parsed = JSON.parse(last) as Partial<OutfitPreferences>;
          setPreferencesState((current) => {
            const next = { ...current };
            for (const question of questions) {
              const value = parsed[question.key];
              if (value && question.options.includes(value)) next[question.key] = value;
            }
            return next;
          });
        } catch {
          // malformed setting; keep defaults
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferencesKey]);

  const setPreferences = (next: OutfitPreferences) => {
    setPreferencesState(next);
    void setSetting(preferencesKey, JSON.stringify(next));
  };

  const setExtras = (next: OutfitRequestExtras) => {
    setExtrasState(next);
    void setSetting('outfit_extras_preference', JSON.stringify(next));
  };
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherFilter, setWeatherFilter] = useState(false);
  const weatherAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await getSetting('weather_filter_enabled');
      if (stored === '1') setWeatherFilter(true);
      const cached = await getCachedWeather();
      if (cached) {
        setWeather(cached);
      } else {
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
      }
    })();
    return () => {
      weatherAbortRef.current?.abort();
      requestRef.current?.abort();
    };
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

  const anchorItem = useMemo(
    () => (anchorId ? props.items.find((item) => item.id === anchorId) ?? null : null),
    [anchorId, props.items],
  );

  const filteredItems = useMemo(() => {
    if (!weatherFilter || !weather) return props.items;
    // The chosen piece always stays, even when its season does not match the weather filter.
    return props.items.filter((item) => item.id === anchorId || matchesWeather(item.seasons, weather));
  }, [props.items, weather, weatherFilter, anchorId]);

  const missing = useMemo(() => getMissingCategories(filteredItems), [filteredItems]);
  // A missing main category can still be bought: then only the shopping look is created.
  const missingAfterShopping = missing.filter((category) => !shopCategories.includes(category));
  const wardrobeComplete = missing.length === 0;
  const aiCost = (wardrobeComplete ? 1 : 0) + shopCategories.length;
  const notEnoughCredits = props.outfitRemaining !== undefined && props.outfitRemaining < aiCost;
  const poolIds = weatherFilter && weather ? filteredItems.map((item) => item.id) : null;
  const [advancedOpen, setAdvancedOpen] = useState(() => Boolean(sessionDraft.note || sessionDraft.shopCategories.length > 0));
  const availableExtras = useMemo<OptionalCategory[]>(
    () => OPTIONAL_CATEGORIES.filter((category) => filteredItems.some((item) => item.category === category)),
    [filteredItems],
  );
  const extraModeLabels: Record<ExtraMode, string> = {
    auto: l('Otomatik', 'Auto'),
    include: l('Ekle', 'Include'),
    exclude: l('Ekleme', 'Skip'),
  };
  const extraModeExplanations: Record<ExtraMode, string> = {
    auto: l('Kombine uyuyorsa AI ekler.', 'AI adds it when it fits the outfit.'),
    include: l('Dolabından en uygun parçayı mutlaka ekler.', 'Always adds the best fit from your wardrobe.'),
    exclude: l('Bu öneride dışarıda bırakılır.', 'Left out of this outfit.'),
  };
  const countByCategory = useMemo<Record<OptionalCategory, number>>(() => ({
    hat: filteredItems.filter((item) => item.category === 'hat').length,
    accessory: filteredItems.filter((item) => item.category === 'accessory').length,
    outerwear: filteredItems.filter((item) => item.category === 'outerwear').length,
  }), [filteredItems]);
  const extrasSummary = availableExtras
    .map((category) => `${categoryLabel(category)}: ${extraModeLabels[(extras[category] ?? 'auto') as ExtraMode]}`)
    .join(' · ');
  const wide = width >= 900;

  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [busy]);

  const quickResults = async (warning: string) => {
    const local = completeSuggestions(filteredItems, preferences, [], await listDislikedOutfitKeys(), extras, anchorId);
    await props.onResults({ suggestions: local, warning, preferences, anchorId, extras, poolIds });
  };

  const submitLocal = async () => {
    if (busy || missing.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await quickResults(weatherFilter && weather
        ? l(`Hızlı Kombin · bugünün havasına (${Math.round(weather.temperatureC)}°C) uygun parçalardan.`, `Quick Outfits · from items matching today's weather (${Math.round(weather.temperatureC)}°C).`)
        : l('Hızlı Kombin ile ücretsiz seçenekler hazırlandı.', 'Free options were created with Quick Outfits.'));
    } finally {
      setBusy(false);
    }
  };

  const submitAi = async () => {
    if (busy || missingAfterShopping.length > 0 || notEnoughCredits) return;
    setBusy(true);
    setElapsed(0);
    setError(null);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      if (!await props.onRequestAiAccess()) {
        setError(l('AI ile kombin oluşturma başlatılmadı. Hızlı Kombin seçeneğini ücretsiz kullanabilirsin.', 'AI outfit creation was not started. You can use Quick Outfits for free.'));
        return;
      }
      setAiRunning(true);
      try {
        const [avoid, disliked] = await Promise.all([recentOutfitsToAvoid(), recentDislikes()]);
        const response = await requestOutfits(
          props.apiUrl,
          preferences,
          filteredItems,
          language,
          extras,
          weather
            ? { temperatureC: weather.temperatureC, isRaining: weather.isRaining, season: weather.season }
            : undefined,
          avoid,
          { anchorId, note, disliked, shopCategories, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (!wardrobeComplete && !response.shopping) {
          // Shopping-only request (a main category is missing) and no look came back: stay here.
          setError(response.warning ?? l('Alışveriş önerisi şu anda hazırlanamadı. Biraz sonra tekrar dene.', 'The shopping suggestion could not be prepared right now. Try again shortly.'));
          return;
        }
        const checked =completeSuggestions(filteredItems, preferences, response.suggestions, await listDislikedOutfitKeys(), extras, anchorId);
        const mobileCompleted = checked.some((x) => x.source === 'local');
        await props.onResults({
          suggestions: checked,
          warning: response.warning ?? (response.usedFallback || mobileCompleted ? l('En iyi seçenekleri tamamlamak için Hızlı Kombin desteği kullanıldı.', 'Quick Outfits helped complete the best options.') : undefined),
          preferences,
          anchorId,
          shopping: response.shopping ?? null,
          extras,
          poolIds,
        });
      } catch {
        if (controller.signal.aborted) {
          // The server stops the AI call when the app disconnects and refunds the credits of a call
          // that did not finish; a reply that was already complete is still counted.
          const cancelled = l(
            'AI isteğini iptal ettin. Tamamlanmadan iptal edilen isteklerin kredisi iade edilir.',
            'You cancelled the AI request. Credits for requests cancelled before they finish are refunded.',
          );
          if (wardrobeComplete) await quickResults(`${cancelled} ${l('Hızlı Kombin seçenekleri hazırlandı.', 'Quick Outfits were prepared.')}`);
          else setError(cancelled);
          return;
        }
        if (!wardrobeComplete) {
          setError(l('Alışveriş önerisi şu anda hazırlanamadı. Biraz sonra tekrar dene.', 'The shopping suggestion could not be prepared right now. Try again shortly.'));
          return;
        }
        await quickResults(l('AI şu anda yanıt vermiyor. Beklememen için Hızlı Kombin seçenekleri hazırlandı.', 'AI is not responding right now. Quick Outfits were prepared so you do not have to wait.'));
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setAiRunning(false);
      setBusy(false);
      props.onAiUsageChanged();
    }
  };

  const cancelAi = () => requestRef.current?.abort();

  const progressSteps = [
    l('Dolabın hazırlanıyor', 'Preparing your wardrobe'),
    l('Parçalar inceleniyor', 'Reviewing your pieces'),
    l('Renk ve resmiyet eşleştiriliyor', 'Matching colors and formality'),
    l('Son dokunuşlar yapılıyor', 'Adding the finishing touches'),
  ];
  const progressIndex = elapsed < 4 ? 0 : elapsed < 12 ? 1 : elapsed < 25 ? 2 : 3;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('home.recommend')} onBack={props.onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <ContentFrame maxWidth={1120} style={styles.content}>
          <WeatherCard
            weather={weather}
            busy={weatherBusy}
            filterEnabled={weatherFilter}
            onToggleFilter={() => void toggleWeatherFilter()}
            onRefresh={() => void refreshWeather()}
            filteredCount={filteredItems.length}
            totalCount={props.items.length}
            language={language}
          />
          {anchorItem ? (
            <View style={styles.anchorCard}>
              <Image source={{ uri: anchorItem.thumbnailUri ?? anchorItem.photoUri }} style={styles.anchorImage} resizeMode="cover" />
              <View style={styles.anchorCopy}>
                <Text style={styles.anchorEyebrow}>{l('BU PARÇAYLA KOMBİN', 'OUTFITS WITH THIS PIECE')}</Text>
                <Text numberOfLines={1} style={styles.anchorName}>{anchorItem.name || anchorItem.subType || categoryLabel(anchorItem.category)}</Text>
                <Text style={styles.anchorHint}>{l('Her öneride bu parça yer alacak.', 'Every suggestion will include this piece.')}</Text>
              </View>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setAnchorId(null)} style={({ pressed }) => [styles.anchorRemove, pressed && styles.pressed]}>
                <Text style={styles.anchorRemoveText}>{l('Kaldır', 'Remove')}</Text>
              </Pressable>
            </View>
          ) : null}
          {missingAfterShopping.length > 0 ? (
            <View style={styles.missingCard}>
              <Text style={styles.missingTitle}>{l('Önce dolabını tamamlayalım', 'Complete your wardrobe first')}</Text>
              <Text style={styles.missingText}>
                {l(
                  `Kombin hazırlamak için ${missing.map(categoryLabel).join(', ')} kategorisinden en az bir parça ekle ya da eksik parçayı AI'ın alışveriş önerisiyle tamamla.`,
                  `Add at least one item in ${missing.map(categoryLabel).join(', ')}, or let AI complete the missing piece with a shopping suggestion.`,
                )}
              </Text>
              {missing.map((category) => (
                <SecondaryButton key={category} title={`${categoryLabel(category)} ${l('ekle', 'add')}`} onPress={() => props.onAddCategory(category)} />
              ))}
              {missing.length <= maxShopCategories ? (
                <PrimaryButton
                  title={l(`🛍 Alışverişle tamamla · ${missing.length} 🪙`, `🛍 Complete with shopping · ${missing.length} 🪙`)}
                  onPress={() => {
                    setShopCategories(missing);
                    setAdvancedOpen(true);
                  }}
                />
              ) : null}
            </View>
          ) : (
            <>
              <View style={styles.presetBlock}>
                <Text style={styles.lead}>{l('Hızlı başla ya da aşağıdan kendin seç.', 'Start with a preset or choose below.')}</Text>
                <View style={styles.options}>
                  {presets.map((preset) => (
                    <Chip
                      key={preset.label}
                      label={preset.label}
                      selected={preset.value.destination === preferences.destination
                        && preset.value.look === preferences.look
                        && preset.value.tone === preferences.tone}
                      onPress={() => setPreferences(preset.value)}
                    />
                  ))}
                </View>
              </View>
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
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: advancedOpen }}
                onPress={() => setAdvancedOpen((open) => !open)}
                style={({ pressed }) => [styles.question, styles.extrasHeader, pressed && styles.pressed]}
              >
                <View style={styles.extrasHeaderCopy}>
                  <Text style={styles.questionTitle}>{l('Daha fazla seçenek', 'More options')}</Text>
                  <Text numberOfLines={2} style={styles.extrasSummary}>
                    {[
                      shopCategories.length > 0
                        ? `🛍 ${shopCategories.map(categoryLabel).join(', ')}`
                        : l('🛍 Alışverişle tamamla', '🛍 Complete with shopping'),
                      note.trim() ? l('📝 Not eklendi', '📝 Note added') : l('📝 Not', '📝 Note'),
                      availableExtras.length > 0 ? l('Ekstralar', 'Extras') : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={styles.extrasChevron}>{advancedOpen ? '⌃' : '⌄'}</Text>
              </Pressable>
              {advancedOpen ? (
              <>
              <View style={styles.question}>
                <Text style={styles.questionTitle}>{l('🛍 Alışverişle tamamla (isteğe bağlı)', '🛍 Complete with shopping (optional)')}</Text>
                <Text style={styles.extrasSummary}>
                  {l(
                    `En fazla ${maxShopCategories} kategori seç; AI kombinin geri kalanını dolabından kurar, seçtiğin her parça için mağazalarda satılan uygun ürünleri görselleriyle listeler. Kategori başına +1 🪙.`,
                    `Pick up to ${maxShopCategories} categories; AI builds the rest from your wardrobe and lists matching store products with images for each one. +1 🪙 per category.`,
                  )}
                </Text>
                <View style={styles.options}>
                  <Chip label={l('Yok', 'None')} selected={shopCategories.length === 0} onPress={() => setShopCategories([])} />
                  {(['top', 'bottom', 'shoes', 'outerwear', 'accessory', 'hat'] as Category[])
                    .filter((category) => category !== anchorItem?.category)
                    .map((category) => (
                      <Chip
                        key={category}
                        label={categoryLabel(category)}
                        selected={shopCategories.includes(category)}
                        onPress={() => toggleShopCategory(category)}
                      />
                    ))}
                </View>
                {shopCategories.length > 0 ? (
                  <Text style={styles.extraExplanation}>
                    {shopCategories.length >= maxShopCategories
                      ? l(`En fazla ${maxShopCategories} kategori seçilebilir. `, `You can pick up to ${maxShopCategories} categories. `)
                      : ''}
                    {l('Yalnızca "AI ile Kombin Bul" ile çalışır; her kategori için web araması yapıldığından biraz daha uzun sürer.', 'Only works with "Find Outfits with AI"; each category adds a web search, so it takes a bit longer.')}
                  </Text>
                ) : null}
              </View>
              <View style={styles.question}>
                <Field
                  label={l('Eklemek istediğin bir şey var mı? (isteğe bağlı)', 'Anything else? (optional)')}
                  value={note}
                  onChangeText={(text) => setNote(text.slice(0, 300))}
                  placeholder={l('ör. Çok yürüyeceğim · Mülakata gidiyorum · Bordo ayakkabımı giymek istiyorum', 'e.g. I will walk a lot · Job interview · I want to wear my burgundy shoes')}
                  hint={l('Yalnızca AI ile kombin bulurken kullanılır.', 'Only used when finding outfits with AI.')}
                  multiline
                  maxLength={300}
                />
              </View>
              {availableExtras.length > 0 ? (
                <View style={styles.question}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: extrasOpen }}
                    onPress={() => setExtrasOpen((open) => !open)}
                    style={({ pressed }) => [styles.extrasHeader, pressed && styles.pressed]}
                  >
                    <View style={styles.extrasHeaderCopy}>
                      <Text style={styles.questionTitle}>{l('Ekstralar', 'Extras')}</Text>
                      <Text numberOfLines={2} style={styles.extrasSummary}>{extrasSummary}</Text>
                    </View>
                    <Text style={styles.extrasChevron}>{extrasOpen ? '⌃' : '⌄'}</Text>
                  </Pressable>
                  {extrasOpen ? availableExtras.map((category) => {
                    const selectedMode = (extras[category] ?? 'auto') as ExtraMode;
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
                  }) : null}
                </View>
              ) : null}
              </>
              ) : null}
              {error ? <Notice tone="error">{error}</Notice> : null}
              {notEnoughCredits && props.outfitRemaining !== 0 ? (
                <Notice tone="error">
                  {l(
                    `Bu istek ${aiCost} 🪙 tutuyor, kalan kredin ${props.outfitRemaining}. Alışveriş kategorisi sayısını azaltabilirsin.`,
                    `This request costs ${aiCost} 🪙 and you have ${props.outfitRemaining} left. Pick fewer shopping categories.`,
                  )}
                </Notice>
              ) : null}
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
      {missingAfterShopping.length === 0 ? (
        <StickyFooter>
          {aiRunning ? (
            <View style={styles.progressBox}>
              <View style={styles.progressHeader}>
                <ActivityIndicator color={colors.primary} />
                <View style={styles.progressCopy}>
                  <Text style={styles.progressTitle}>✦ {progressSteps[progressIndex]}… · {elapsed} {l('sn', 'sec')}</Text>
                  <View style={styles.progressDots}>
                    {progressSteps.map((step, index) => (
                      <View key={step} style={[styles.progressDot, index <= progressIndex && styles.progressDotActive]} />
                    ))}
                  </View>
                </View>
              </View>
              <SecondaryButton title={l('İptal et · Hızlı Kombin göster', 'Cancel · Show Quick Outfits')} onPress={cancelAi} />
            </View>
          ) : (
            <>
              {wardrobeComplete ? (
                <SecondaryButton title={l('⚡ Hızlı Kombin · Ücretsiz', '⚡ Quick Outfits · Free')} onPress={() => void submitLocal()} disabled={busy} style={styles.footerButton} />
              ) : null}
              <PrimaryButton
                title={wardrobeComplete
                  ? l(`✦ AI ile Kombin Bul · ${aiCost} 🪙`, `✦ Find Outfits with AI · ${aiCost} 🪙`)
                  : l(`🛍 Alışveriş önerisi al · ${aiCost} 🪙`, `🛍 Get shopping suggestion · ${aiCost} 🪙`)}
                onPress={() => void submitAi()}
                loading={busy}
                disabled={props.outfitRemaining === 0 || notEnoughCredits}
                style={styles.footerButton}
              />
            </>
          )}
        </StickyFooter>
      ) : null}
    </View>
  );
}

function seasonLabel(season: WeatherSnapshot['season'], language: string): string {
  const map = language === 'tr'
    ? { summer: 'yaz', autumn: 'sonbahar', winter: 'kış', spring: 'ilkbahar' }
    : { summer: 'summer', autumn: 'autumn', winter: 'winter', spring: 'spring' };
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
  busy: boolean;
  filterEnabled: boolean;
  onToggleFilter: () => void;
  onRefresh: () => void;
  filteredCount: number;
  totalCount: number;
  language: string;
}

/**
 * Shows today's weather (always sent to the AI) and, separately, the optional filter that
 * hides out-of-season pieces from both AI and Quick Outfits.
 */
function WeatherCard({ weather, busy, filterEnabled, onToggleFilter, onRefresh, filteredCount, totalCount, language }: WeatherCardProps) {
  const l = (tr: string, en: string) => language === 'tr' ? tr : en;
  const hiddenCount = Math.max(0, totalCount - filteredCount);

  return (
    <View style={styles.weatherCard}>
      <View style={styles.weatherTop}>
        <View style={styles.weatherLeft}>
          <Text style={styles.weatherEmoji}>{weather ? weatherEmoji(weather.season, weather.isRaining) : '🌍'}</Text>
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
                  {weather.isRaining ? l(' · yağmurlu', ' · rainy') : ''}
                  {weather.locationLabel ? ` · ${weather.locationLabel}` : ''}
                </Text>
                <Text style={styles.weatherSub}>{l('AI önerileri bu havaya göre hazırlar.', 'AI tailors suggestions to this weather.')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.weatherTitle}>{l('Hava durumu yok', 'No weather yet')}</Text>
                <Text style={styles.weatherSub}>{l('Konum izni verirsen öneriler havaya göre hazırlanır.', 'Allow location so suggestions match the weather.')}</Text>
              </>
            )}
          </View>
        </View>
        {!busy ? (
          <Pressable onPress={onRefresh} hitSlop={8} accessibilityRole="button">
            <Text style={styles.weatherRefresh}>{weather ? l('Yenile', 'Refresh') : l('Al', 'Get')}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.filterRow}>
        <View style={styles.weatherTextCol}>
          <Text style={styles.filterTitle}>{l('Sadece mevsime uygun parçaları kullan', 'Only use in-season pieces')}</Text>
          <Text style={styles.weatherSub}>
            {filterEnabled && weather
              ? hiddenCount > 0
                ? l(`${seasonLabel(weather.season, language)} için uymayan ${hiddenCount} parça kullanılmayacak.`, `${hiddenCount} pieces that do not suit ${seasonLabel(weather.season, language)} will be left out.`)
                : l('Tüm parçaların bu mevsime uygun.', 'All your pieces suit this season.')
              : l('Kapalıyken tüm dolabın kullanılır.', 'When off, your whole wardrobe is used.')}
          </Text>
        </View>
        <Pressable
          onPress={onToggleFilter}
          accessibilityRole="switch"
          accessibilityState={{ checked: filterEnabled }}
          style={[styles.toggleTrack, filterEnabled && styles.toggleTrackOn]}
          hitSlop={8}
        >
          <View style={[styles.toggleThumb, filterEnabled && styles.toggleThumbOn]} />
        </Pressable>
      </View>
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
  pressed: { opacity: 0.7 },
  presetBlock: { gap: spacing.sm },
  anchorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    padding: spacing.sm,
  },
  anchorImage: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  anchorCopy: { flex: 1, gap: 2 },
  anchorEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  anchorName: { color: colors.text, fontSize: 16, fontWeight: '900' },
  anchorHint: { color: colors.muted, fontSize: 12 },
  anchorRemove: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  anchorRemoveText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  extrasHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  extrasHeaderCopy: { flex: 1, gap: 4 },
  extrasSummary: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  extrasChevron: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  progressBox: { flex: 1, gap: spacing.sm },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressCopy: { flex: 1, gap: 6 },
  progressTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  progressDots: { flexDirection: 'row', gap: 6 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressDotActive: { backgroundColor: colors.primary },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  filterTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  weatherCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  weatherTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weatherLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weatherEmoji: { fontSize: 30 },
  weatherTextCol: { flex: 1, gap: 2 },
  weatherTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  weatherSub: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  weatherBusyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
