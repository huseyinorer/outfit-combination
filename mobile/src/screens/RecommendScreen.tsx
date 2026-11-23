import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { CategoryIcon } from '../components/CategoryIcon';
import { ContentFrame, StickyFooter } from '../components/layout';
import { SlotSheet } from '../components/SlotSheet';
import { Chip, Field, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { completeSuggestions } from '../domain/outfitEngine';
import {
  SLOT_ORDER,
  defaultSlots,
  extrasOf,
  isRequiredSlot,
  pinsOf,
  sanitizeSlots,
  shopCategoriesOf,
  slotsWithPiece,
  type OutfitSlotsState,
  type SlotState,
} from '../domain/slots';
import type {
  Category,
  ClothingItem,
  OutfitDislike,
  OutfitKeyTriple,
  OutfitPreferences,
  OutfitResultsPayload,
} from '../domain/types';
import { requestOutfits } from '../services/api';
import { colors, darkPalette, lightPalette, radius, spacing } from '../theme/theme';
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

type Step = 'choose' | 'full' | 'slots';

// Kept for the app session so "back" from the results screen restores the user's setup.
const sessionDraft: { step: Step | null; slots: OutfitSlotsState | null; note: string } = { step: null, slots: null, note: '' };

interface Props {
  items: ClothingItem[];
  apiUrl: string;
  /** Wardrobe piece to start from ("Build outfits with this"): opens the slot screen with it. */
  initialPieceId?: string | null;
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
  const { width } = useWindowDimensions();
  const iconColor = useColorScheme() === 'dark' ? darkPalette.primary : lightPalette.primary;
  const any = l('Fark etmez', 'Any');
  const destinations = language === 'tr'
    ? ['Günlük', 'İş/ofis', 'Arkadaş buluşması', 'Akşam yemeği', 'Özel gün']
    : ['Daily', 'Work/office', 'Meeting friends', 'Dinner', 'Special occasion'];
  const looks = language === 'tr' ? ['Fark etmez', 'Spor', 'Rahat', 'Smart casual', 'Klasik'] : ['Any', 'Sporty', 'Relaxed', 'Smart casual', 'Classic'];
  const tones = language === 'tr' ? ['Fark etmez', 'Açık', 'Koyu', 'Karışık'] : ['Any', 'Light', 'Dark', 'Mixed'];
  const preferencesKey = `outfit_preferences_last:${language}`;

  const initialPiece = props.initialPieceId ? props.items.find((item) => item.id === props.initialPieceId) ?? null : null;
  const [step, setStepState] = useState<Step>(() => (initialPiece ? 'slots' : sessionDraft.step ?? 'choose'));
  const [slots, setSlotsState] = useState<OutfitSlotsState>(() => sanitizeSlots(
    initialPiece ? slotsWithPiece(initialPiece) : sessionDraft.slots ?? defaultSlots(),
    props.items,
  ));
  const [note, setNoteState] = useState(sessionDraft.note);
  const [noteOpen, setNoteOpen] = useState(Boolean(sessionDraft.note));
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [preferences, setPreferencesState] = useState<OutfitPreferences>({ destination: destinations[0] ?? any, look: any, tone: any });
  const [sheetCategory, setSheetCategory] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const setStep = (next: Step) => {
    sessionDraft.step = next;
    setStepState(next);
    setError(null);
  };
  const setSlots = (next: OutfitSlotsState) => {
    sessionDraft.slots = next;
    setSlotsState(next);
  };
  const setNote = (value: string) => {
    sessionDraft.note = value;
    setNoteState(value);
  };
  const setPreferences = (next: OutfitPreferences) => {
    setPreferencesState(next);
    void setSetting(preferencesKey, JSON.stringify(next));
  };

  useEffect(() => {
    if (initialPiece) {
      // Coming back from the results screen should reopen this same slot setup.
      sessionDraft.slots = slots;
      sessionDraft.step = 'slots';
    }
    void (async () => {
      const last = await getSetting(preferencesKey);
      if (last) {
        try {
          const parsed = JSON.parse(last) as Partial<OutfitPreferences>;
          setPreferencesState((current) => ({
            destination: parsed.destination && destinations.includes(parsed.destination) ? parsed.destination : current.destination,
            look: parsed.look && looks.includes(parsed.look) ? parsed.look : current.look,
            tone: parsed.tone && tones.includes(parsed.tone) ? parsed.tone : current.tone,
          }));
        } catch {
          // malformed setting; keep defaults
        }
      }
      const cached = await getCachedWeather();
      if (cached) setWeather(cached);
      else {
        try {
          setWeather(await loadFreshWeather());
        } catch {
          // Weather is optional; the AI simply gets the season from the calendar.
        }
      }
    })();
    return () => requestRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferencesKey]);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [busy]);

  // "AI prepares everything" uses the default slots; the slot screen uses the user's setup.
  const activeSlots = step === 'full' ? defaultSlots() : slots;
  const shopCategories = shopCategoriesOf(activeSlots);
  const shoppingMode = shopCategories.length > 0;
  const missingInWardrobe = SLOT_ORDER.filter((category) =>
    isRequiredSlot(category)
    && activeSlots[category].mode !== 'shop'
    && !props.items.some((item) => item.category === category));
  const aiCost = 1 + shopCategories.length;
  const notEnoughCredits = props.outfitRemaining !== undefined && props.outfitRemaining < aiCost;
  const pins = pinsOf(activeSlots);
  const pinnedIds = new Set(Object.values(pins).flat());
  const extras = extrasOf(activeSlots);

  // Quick Outfits use only in-season pieces when that still leaves a full outfit.
  const quickPool = useMemo(() => {
    if (!weather) return props.items;
    const seasonal = props.items.filter((item) => pinnedIds.has(item.id) || matchesWeather(item.seasons, weather));
    const complete = (['top', 'bottom', 'shoes'] as Category[]).every((category) => seasonal.some((item) => item.category === category));
    return complete ? seasonal : props.items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.items, weather, JSON.stringify(pins)]);

  const submitLocal = async () => {
    if (busy || missingInWardrobe.length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const local = completeSuggestions(quickPool, preferences, [], await listDislikedOutfitKeys(), extras, pins);
      if (local.length === 0) {
        setError(l('Bu seçimlerle dolabından kombin çıkmadı. Bir slotu "AI seçsin" yapmayı dene.', 'No outfit fits these choices. Try setting a slot to "Let AI pick".'));
        return;
      }
      await props.onResults({
        suggestions: local,
        warning: l('Hızlı Kombin ile ücretsiz seçenekler hazırlandı.', 'Free options were created with Quick Outfits.'),
        preferences,
        pins,
        extras,
        poolIds: quickPool === props.items ? null : quickPool.map((item) => item.id),
      });
    } finally {
      setBusy(false);
    }
  };

  const submitAi = async () => {
    if (busy || missingInWardrobe.length > 0 || notEnoughCredits) return;
    setBusy(true);
    setElapsed(0);
    setError(null);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      if (!await props.onRequestAiAccess()) {
        setError(l('AI başlatılmadı. Ücretsiz Hızlı Kombin\'i kullanabilirsin.', 'AI was not started. You can use the free Quick Outfits.'));
        return;
      }
      setAiRunning(true);
      try {
        const [avoid, disliked] = await Promise.all([recentOutfitsToAvoid(), recentDislikes()]);
        const response = await requestOutfits(
          props.apiUrl,
          preferences,
          props.items,
          language,
          extras,
          weather ? { temperatureC: weather.temperatureC, isRaining: weather.isRaining, season: weather.season } : undefined,
          avoid,
          { note: note.trim(), disliked, slots: activeSlots, signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (shoppingMode) {
          if (!response.shopping) {
            setError(response.warning ?? l('Alışveriş önerisi şu anda hazırlanamadı; kredin iade edildi.', 'The shopping suggestion could not be prepared; your credits were refunded.'));
            return;
          }
          await props.onResults({ suggestions: [], warning: response.warning, preferences, pins, shopping: response.shopping, extras });
          return;
        }
        const checked = completeSuggestions(props.items, preferences, response.suggestions, await listDislikedOutfitKeys(), extras, pins);
        const mobileCompleted = checked.some((x) => x.source === 'local');
        await props.onResults({
          suggestions: checked,
          warning: response.warning ?? (response.usedFallback || mobileCompleted ? l('Eksik kalan seçenekler Hızlı Kombin ile tamamlandı.', 'Quick Outfits completed the missing options.') : undefined),
          preferences,
          pins,
          extras,
        });
      } catch (requestError) {
        const cancelled = controller.signal.aborted;
        if (shoppingMode || cancelled) {
          setError(cancelled
            ? l('İptal ettin. Tamamlanmadan iptal edilen isteklerin kredisi iade edilir.', 'Cancelled. Credits for requests cancelled before they finish are refunded.')
            : requestError instanceof Error ? requestError.message : l('AI şu anda yanıt vermiyor.', 'AI is not responding right now.'));
          return;
        }
        const local = completeSuggestions(quickPool, preferences, [], await listDislikedOutfitKeys(), extras, pins);
        await props.onResults({
          suggestions: local,
          warning: l('AI şu anda yanıt vermiyor; beklememen için Hızlı Kombin seçenekleri hazırlandı.', 'AI is not responding; Quick Outfits were prepared so you do not have to wait.'),
          preferences,
          pins,
          extras,
        });
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setAiRunning(false);
      setBusy(false);
      props.onAiUsageChanged();
    }
  };

  const progressSteps = shoppingMode
    ? [l('Dolabın hazırlanıyor', 'Preparing your wardrobe'), l('Kombin kuruluyor', 'Building the outfit'), l('Mağazalarda ürün aranıyor', 'Searching stores'), l('Ürün görselleri alınıyor', 'Fetching product images')]
    : [l('Dolabın hazırlanıyor', 'Preparing your wardrobe'), l('Parçalar inceleniyor', 'Reviewing your pieces'), l('Renk ve resmiyet eşleştiriliyor', 'Matching colors and formality'), l('Son dokunuşlar yapılıyor', 'Adding the finishing touches')];
  const progressIndex = elapsed < 4 ? 0 : elapsed < 15 ? 1 : elapsed < 35 ? 2 : 3;

  const weatherLine = weather
    ? l(
      `${weatherIcon(weather)} ${Math.round(weather.temperatureC)}°C${weather.isRaining ? ' · yağmurlu' : ''}${weather.locationLabel ? ` · ${weather.locationLabel}` : ''} — öneriler bu havaya göre`,
      `${weatherIcon(weather)} ${Math.round(weather.temperatureC)}°C${weather.isRaining ? ' · rainy' : ''}${weather.locationLabel ? ` · ${weather.locationLabel}` : ''} — suggestions fit this weather`,
    )
    : null;

  const occasionBlock = (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{l('Nereye?', 'Where to?')}</Text>
      <View style={styles.chips}>
        {destinations.map((option) => (
          <Chip key={option} label={option} selected={preferences.destination === option} onPress={() => setPreferences({ ...preferences, destination: option })} />
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setFineTuneOpen((open) => !open)} hitSlop={6}>
        <Text style={styles.link}>
          {fineTuneOpen ? l('İnce ayarı gizle ⌃', 'Hide fine-tuning ⌃') : l(`İnce ayar: tarz ${preferences.look.toLocaleLowerCase('tr-TR')}, ton ${preferences.tone.toLocaleLowerCase('tr-TR')} ⌄`, `Fine-tune: style ${preferences.look.toLowerCase()}, tone ${preferences.tone.toLowerCase()} ⌄`)}
        </Text>
      </Pressable>
      {fineTuneOpen ? (
        <>
          <Text style={styles.subTitle}>{l('Tarz', 'Style')}</Text>
          <View style={styles.chips}>
            {looks.map((option) => (
              <Chip key={option} label={option} selected={preferences.look === option} onPress={() => setPreferences({ ...preferences, look: option })} />
            ))}
          </View>
          <Text style={styles.subTitle}>{l('Renk tonu', 'Color tone')}</Text>
          <View style={styles.chips}>
            {tones.map((option) => (
              <Chip key={option} label={option} selected={preferences.tone === option} onPress={() => setPreferences({ ...preferences, tone: option })} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );

  const noteBlock = noteOpen ? (
    <View style={styles.block}>
      <Field
        label={l('Not (isteğe bağlı)', 'Note (optional)')}
        value={note}
        onChangeText={(text) => setNote(text.slice(0, 300))}
        placeholder={l('ör. Çok yürüyeceğim · Mülakata gidiyorum · Koyu renkler olsun', 'e.g. I will walk a lot · Job interview · Dark colors please')}
        multiline
        maxLength={300}
      />
    </View>
  ) : (
    <Pressable accessibilityRole="button" onPress={() => setNoteOpen(true)} style={({ pressed }) => [styles.addNote, pressed && styles.pressed]}>
      <Text style={styles.addNoteText}>{l('📝 + Not ekle (ör. "çok yürüyeceğim")', '📝 + Add a note (e.g. "I will walk a lot")')}</Text>
    </Pressable>
  );

  const slotCard = (category: Category) => {
    const slot = activeSlots[category];
    const chosen = slot.itemIds
      .map((id) => props.items.find((item) => item.id === id))
      .filter((item): item is ClothingItem => Boolean(item));
    const missing = missingInWardrobe.includes(category);
    const state = missing
      ? { icon: '⚠', text: l('Dolabında yok', 'Not in wardrobe'), style: styles.slotWarn }
      : slot.mode === 'ai' ? { icon: '✦', text: l('AI seçsin', 'AI picks'), style: null }
        : slot.mode === 'auto' ? { icon: '✦', text: l('AI karar versin', 'AI decides'), style: null }
          : slot.mode === 'none' ? { icon: '—', text: l('Olmasın', 'None'), style: styles.slotMuted }
            : slot.mode === 'shop' ? { icon: '🛍', text: l('Alışverişte öner', 'From stores'), style: styles.slotShop }
              : null;
    return (
      <Pressable
        key={category}
        accessibilityRole="button"
        accessibilityLabel={`${categoryLabel(category)}: ${state?.text ?? chosen.map((item) => item.name).join(', ')}`}
        onPress={() => setSheetCategory(category)}
        style={({ pressed }) => [styles.slot, { width: slotWidth }, state?.style, slot.mode === 'pick' && styles.slotPicked, pressed && styles.pressed]}
      >
        <View style={styles.slotBody}>
          {slot.mode === 'pick' && chosen.length > 0 ? (
            <View style={styles.slotImages}>
              {chosen.map((item) => (
                <Image key={item.id} source={{ uri: item.thumbnailUri ?? item.photoUri }} style={[styles.slotImage, chosen.length > 1 && styles.slotImageSmall]} resizeMode="cover" />
              ))}
            </View>
          ) : (
            <>
              <CategoryIcon category={category} size={26} color={iconColor} />
              <Text style={styles.slotState}>{state?.icon} {state?.text}</Text>
            </>
          )}
        </View>
        <Text numberOfLines={1} style={styles.slotLabel}>
          {categoryLabel(category).toLocaleUpperCase(language === 'tr' ? 'tr-TR' : 'en-US')}
          {slot.mode === 'pick' && chosen.length === 1 ? ` · ${chosen[0]?.name ?? ''}` : ''}
        </Text>
      </Pressable>
    );
  };

  const columns = width >= 700 ? 6 : 3;
  const slotWidth = (Math.min(width, 1120) - spacing.md * 2 - spacing.sm * (columns - 1)) / columns;
  const counts = {
    mine: SLOT_ORDER.filter((category) => activeSlots[category].mode === 'pick').length,
    shop: shopCategories.length,
  };

  const headerBack = () => {
    if (step === 'choose') props.onBack();
    else setStep('choose');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('home.recommend')} onBack={headerBack} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <ContentFrame maxWidth={1120} style={styles.content}>
          {weatherLine ? <Text style={styles.weather}>{weatherLine}</Text> : null}

          {step === 'choose' ? (
            <>
              <Text style={styles.lead}>{l('Nasıl bir kombin istersin?', 'How should we build your outfit?')}</Text>
              <Pressable accessibilityRole="button" onPress={() => setStep('full')} style={({ pressed }) => [styles.bigChoice, styles.bigChoicePrimary, pressed && styles.pressed]}>
                <Text style={styles.bigChoiceIcon}>✦</Text>
                <View style={styles.bigChoiceCopy}>
                  <Text style={[styles.bigChoiceTitle, styles.bigChoiceTitlePrimary]}>{l('AI benim için hazırlasın', 'Let AI prepare it')}</Text>
                  <Text style={[styles.bigChoiceText, styles.bigChoiceTextPrimary]}>{l('Dolabındaki parçalardan, havaya ve gideceğin yere göre.', 'From your wardrobe, for the weather and where you are going.')}</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setStep('slots')} style={({ pressed }) => [styles.bigChoice, pressed && styles.pressed]}>
                <Text style={styles.bigChoiceIcon}>🧩</Text>
                <View style={styles.bigChoiceCopy}>
                  <Text style={styles.bigChoiceTitle}>{l('Bazı parçaları ben seçeyim', "I'll choose some pieces")}</Text>
                  <Text style={styles.bigChoiceText}>{l('Kendi parçanı koy; kalanını AI dolabından seçsin ya da alışveriş önersin.', 'Place your own pieces; AI fills the rest from your wardrobe or suggests what to buy.')}</Text>
                </View>
              </Pressable>
            </>
          ) : null}

          {step === 'full' ? (
            <>
              {occasionBlock}
              {noteBlock}
              <Pressable accessibilityRole="button" onPress={() => setStep('slots')} hitSlop={6}>
                <Text style={styles.link}>{l('🧩 Bazı parçaları ben seçmek istiyorum ›', "🧩 I'd rather choose some pieces ›")}</Text>
              </Pressable>
            </>
          ) : null}

          {step === 'slots' ? (
            <>
              {occasionBlock}
              <View style={styles.block}>
                <Text style={styles.blockTitle}>{l('Parçalar', 'Pieces')}</Text>
                <Text style={styles.hint}>{l('Bir slota dokun: kendi parçanı seç, AI\'a bırak ya da alışveriş önerisi iste.', 'Tap a slot: choose your piece, leave it to AI or ask for a shopping suggestion.')}</Text>
                <View style={styles.slotGrid}>{SLOT_ORDER.map(slotCard)}</View>
              </View>
              {noteBlock}
            </>
          ) : null}

          {step !== 'choose' && missingInWardrobe.length > 0 ? (
            <Notice tone="error">
              {l(
                `Dolabında ${missingInWardrobe.map(categoryLabel).join(', ')} yok. Slota dokunup "Alışverişte öner"i seç ya da parça ekle.`,
                `No ${missingInWardrobe.map(categoryLabel).join(', ')} in your wardrobe. Tap the slot and choose "Suggest from stores", or add one.`,
              )}
            </Notice>
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {step !== 'choose' && notEnoughCredits && props.outfitRemaining !== 0 ? (
            <Notice tone="error">{l(`Bu istek ${aiCost} 🪙 tutuyor, kalan kredin ${props.outfitRemaining}.`, `This costs ${aiCost} 🪙 and you have ${props.outfitRemaining} left.`)}</Notice>
          ) : null}
          {step !== 'choose' && props.outfitRemaining === 0 ? (
            <Notice tone="error">{l('AI kredin bitti. Ücretsiz Hızlı Kombin kullanılabilir.', 'Your AI credits are used up. Quick Outfits remain free.')}</Notice>
          ) : null}
        </ContentFrame>
      </ScrollView>

      {step !== 'choose' ? (
        <StickyFooter>
          {aiRunning ? (
            <View style={styles.progressBox}>
              <View style={styles.progressHeader}>
                <ActivityIndicator color={colors.primary} />
                <View style={styles.progressCopy}>
                  <Text style={styles.progressTitle}>✦ {progressSteps[progressIndex]}… · {elapsed} {l('sn', 'sec')}</Text>
                  <View style={styles.progressDots}>
                    {progressSteps.map((label, index) => (
                      <View key={label} style={[styles.progressDot, index <= progressIndex && styles.progressDotActive]} />
                    ))}
                  </View>
                </View>
              </View>
              <SecondaryButton title={l('İptal et', 'Cancel')} onPress={() => requestRef.current?.abort()} />
            </View>
          ) : (
            <View style={styles.footer}>
              {step === 'slots' ? (
                <Text style={styles.summary}>
                  {[
                    counts.mine > 0 ? l(`${counts.mine} slot senden`, `${counts.mine} from you`) : null,
                    counts.shop > 0 ? l(`${counts.shop} alışveriş`, `${counts.shop} to buy`) : null,
                    l('kalanı AI', 'rest by AI'),
                  ].filter(Boolean).join(' · ')}
                  {shoppingMode ? l(' — sonuç: ürünleriyle tek kombin', ' — result: one outfit with products') : l(' — sonuç: 3 kombin', ' — result: 3 outfits')}
                </Text>
              ) : null}
              <View style={styles.footerButtons}>
                {!shoppingMode ? (
                  <SecondaryButton title={l('⚡ Hızlı · Ücretsiz', '⚡ Quick · Free')} onPress={() => void submitLocal()} disabled={busy || missingInWardrobe.length > 0} style={styles.footerButton} />
                ) : null}
                <PrimaryButton
                  title={shoppingMode ? l(`🛍 Kombini oluştur · ${aiCost} 🪙`, `🛍 Build outfit · ${aiCost} 🪙`) : l(`✦ Kombin bul · ${aiCost} 🪙`, `✦ Find outfits · ${aiCost} 🪙`)}
                  onPress={() => void submitAi()}
                  loading={busy}
                  disabled={missingInWardrobe.length > 0 || notEnoughCredits || props.outfitRemaining === 0}
                  style={styles.footerButton}
                />
              </View>
            </View>
          )}
        </StickyFooter>
      ) : null}

      {sheetCategory ? (
        <SlotSheet
          category={sheetCategory}
          slot={slots[sheetCategory]}
          items={props.items}
          otherShopSlots={shopCategoriesOf(slots).filter((category) => category !== sheetCategory).length}
          onChange={(slot: SlotState) => setSlots({ ...slots, [sheetCategory]: slot })}
          onAddItem={props.onAddCategory}
          onClose={() => setSheetCategory(null)}
        />
      ) : null}
    </View>
  );
}

function weatherIcon(weather: WeatherSnapshot): string {
  if (weather.isRaining) return '🌧️';
  if (weather.season === 'summer') return '☀️';
  if (weather.season === 'winter') return '❄️';
  if (weather.season === 'autumn') return '🍂';
  return '🌤️';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 32 },
  content: { padding: spacing.md, gap: spacing.md },
  weather: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  lead: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: spacing.xs },
  bigChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 104,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  bigChoicePrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  bigChoiceIcon: { fontSize: 30, width: 40, textAlign: 'center' },
  bigChoiceCopy: { flex: 1, gap: 4 },
  bigChoiceTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  bigChoiceTitlePrimary: { color: colors.onPrimary },
  bigChoiceText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  bigChoiceTextPrimary: { color: colors.onPrimary, opacity: 0.9 },
  block: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  blockTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  subTitle: { color: colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.xs },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  link: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  addNote: { minHeight: 44, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, paddingHorizontal: spacing.md },
  addNoteText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    minHeight: 128,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 6,
    gap: 4,
  },
  slotPicked: { borderStyle: 'solid', borderColor: colors.primary },
  slotShop: { borderColor: colors.accent, backgroundColor: colors.primarySoft },
  slotMuted: { opacity: 0.6 },
  slotWarn: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  slotBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  slotImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center' },
  slotImage: { width: 76, height: 84, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  slotImageSmall: { width: 40, height: 44 },
  slotState: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  slotLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  footer: { flex: 1, gap: spacing.xs },
  footerButtons: { flexDirection: 'row', gap: spacing.sm },
  footerButton: { flex: 1 },
  summary: { color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  progressBox: { flex: 1, gap: spacing.sm },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressCopy: { flex: 1, gap: 6 },
  progressTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  progressDots: { flexDirection: 'row', gap: 6 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressDotActive: { backgroundColor: colors.primary },
  pressed: { opacity: 0.7 },
});
