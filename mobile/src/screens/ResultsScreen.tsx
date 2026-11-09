import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { OutfitPreview } from '../components/OutfitPreview';
import { ContentFrame, StickyFooter } from '../components/layout';
import { Notice, ScreenHeader, SecondaryButton } from '../components/ui';
import { buildLocalSuggestions, outfitKey, resolveOutfitItems } from '../domain/outfitEngine';
import type {
  ClothingItem,
  FavoriteOutfit,
  OutfitPreferences,
  OutfitSuggestion,
} from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { getOutfitFeedback, markOutfitWorn, setOutfitFeedback } from '../data/database';
import type { OutfitFeedbackValue } from '../domain/types';
import { useI18n } from '../locales';
import { tactileSuccess } from '../services/feedback';
import { hapticTick } from '../services/haptics';

interface Props {
  items: ClothingItem[];
  suggestions: OutfitSuggestion[];
  preferences: OutfitPreferences;
  favorites: FavoriteOutfit[];
  warning?: string;
  onToggleFavorite: (suggestion: OutfitSuggestion) => Promise<void>;
  onBack: () => void;
}

export function ResultsScreen(props: Props) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const { width } = useWindowDimensions();
  const [displayed, setDisplayed] = useState(props.suggestions);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerContext, setViewerContext] = useState<{ items: ClothingItem[]; initialIndex: number } | null>(null);
  const [seenKeys, setSeenKeys] = useState(() => new Set(props.suggestions.map(outfitKey)));
  const [pinned, setPinned] = useState<Partial<Record<'topId' | 'bottomId' | 'shoeId', string>>>({});
  const [feedback, setFeedback] = useState<Record<string, OutfitFeedbackValue | undefined>>({});
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<OutfitSuggestion>>(null);
  const favoriteKeys = useMemo(() => new Set(props.favorites.map(outfitKey)), [props.favorites]);

  useEffect(() => {
    setDisplayed(props.suggestions);
    setSeenKeys(new Set(props.suggestions.map(outfitKey)));
    setActiveIndex(0);
  }, [props.suggestions]);

  useEffect(() => {
    let active = true;
    void Promise.all(displayed.map(async (suggestion) => [outfitKey(suggestion), await getOutfitFeedback(suggestion)] as const))
      .then((values) => {
        if (!active) return;
        setFeedback(Object.fromEntries(values.filter(([, value]) => value !== null)) as Record<string, OutfitFeedbackValue>);
      });
    return () => { active = false; };
  }, [displayed]);

  const showAnotherSet = () => {
    const matchesPins = (suggestion: OutfitSuggestion) => Object.entries(pinned)
      .every(([field, id]) => !id || suggestion[field as 'topId' | 'bottomId' | 'shoeId'] === id);
    let next = buildLocalSuggestions(props.items, props.preferences, seenKeys).filter(matchesPins).slice(0, 3);
    let nextSeen = new Set(seenKeys);
    if (next.length === 0) {
      next = buildLocalSuggestions(props.items, props.preferences).filter(matchesPins).slice(0, 3);
      nextSeen = new Set<string>();
    }
    if (next.length === 0) return;
    next.forEach((suggestion) => nextSeen.add(outfitKey(suggestion)));
    setSeenKeys(nextSeen);
    setDisplayed(next);
    setActiveIndex(0);
    scrollX.setValue(0);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
  };

  const replacePiece = (
    suggestion: OutfitSuggestion,
    field: 'topId' | 'bottomId' | 'shoeId',
    category: ClothingItem['category'],
  ) => {
    const candidates = props.items.filter((item) => item.category === category && item.id !== suggestion[field]);
    const alternative = candidates.find((item) => !displayed.some((shown) => {
      const changed = { ...suggestion, [field]: item.id };
      return outfitKey(shown) === outfitKey(changed);
    })) ?? candidates[0];
    if (!alternative) {
      tactileSuccess(t('result.noAlternative'));
      return;
    }
    const next = {
      ...suggestion,
      [field]: alternative.id,
      title: l('Kişisel seçimin', 'Your custom outfit'),
      reason: l(`${alternative.name || alternative.subType || 'Yeni parça'} ile kombinini istediğin gibi güncelledin.`, `You updated the outfit with ${alternative.name || alternative.subType || 'a new item'}.`),
      source: 'local' as const,
    };
    setDisplayed((current) => current.map((item) => item === suggestion ? next : item));
    setPinned((current) => current[field] ? { ...current, [field]: alternative.id } : current);
  };

  const extraFieldFor = (category: 'hat' | 'accessory' | 'outerwear'): 'hatId' | 'accessoryId' | 'outerwearId' =>
    category === 'hat' ? 'hatId' : category === 'accessory' ? 'accessoryId' : 'outerwearId';

  const removeExtra = (suggestion: OutfitSuggestion, category: 'hat' | 'accessory' | 'outerwear') => {
    const field = extraFieldFor(category);
    hapticTick('light');
    const next = { ...suggestion, [field]: null };
    setDisplayed((current) => current.map((shown) => shown === suggestion ? next : shown));
  };

  const swapExtra = (suggestion: OutfitSuggestion, category: 'hat' | 'accessory' | 'outerwear') => {
    const field = extraFieldFor(category);
    const currentId = suggestion[field];
    const candidates = props.items.filter((entry) => entry.category === category && entry.id !== currentId);
    if (candidates.length === 0) {
      tactileSuccess(t('result.noAlternative'));
      return;
    }
    const alternative = candidates[0];
    if (!alternative) return;
    hapticTick('select');
    const next = { ...suggestion, [field]: alternative.id };
    setDisplayed((current) => current.map((shown) => shown === suggestion ? next : shown));
  };

  const togglePin = (field: 'topId' | 'bottomId' | 'shoeId', id: string) => {
    setPinned((current) => current[field] === id
      ? { ...current, [field]: undefined }
      : { ...current, [field]: id });
  };

  const saveFeedback = async (suggestion: OutfitSuggestion, value: OutfitFeedbackValue) => {
    await setOutfitFeedback(suggestion, value);
    setFeedback((current) => ({ ...current, [outfitKey(suggestion)]: value }));
    tactileSuccess(value === 'like' ? t('result.like') : t('result.dislike'));
  };

  const saveWorn = async (suggestion: OutfitSuggestion) => {
    await markOutfitWorn(suggestion);
    tactileSuccess(t('result.wornSaved'));
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(Math.max(0, Math.min(index, displayed.length - 1)));
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<OutfitSuggestion>) => {
    const resolved = resolveOutfitItems(props.items, item);
    if (!resolved.top || !resolved.bottom || !resolved.shoes) return null;
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const scale = scrollX.interpolate({ inputRange, outputRange: [0.94, 1, 0.94], extrapolate: 'clamp' });
    const opacity = scrollX.interpolate({ inputRange, outputRange: [0.6, 1, 0.6], extrapolate: 'clamp' });
    const favorite = favoriteKeys.has(outfitKey(item));
    const currentFeedback = feedback[outfitKey(item)];

    const pieceRow = (
      label: string,
      clothing: ClothingItem,
      field: 'topId' | 'bottomId' | 'shoeId',
      category: ClothingItem['category'],
    ) => {
      const isPinned = pinned[field] === clothing.id;
      return (
        <View style={styles.pieceRow}>
          <Text numberOfLines={1} style={styles.idText}>{label}</Text>
          <Pressable onPress={() => togglePin(field, clothing.id)} style={[styles.smallAction, isPinned && styles.smallActionActive]}>
            <Text style={[styles.smallActionText, isPinned && styles.smallActionTextActive]}>{isPinned ? '●' : '○'} {isPinned ? t('result.unlock') : t('result.lock')}</Text>
          </Pressable>
          <Pressable onPress={() => replacePiece(item, field, category)} style={styles.smallAction}>
            <Text style={styles.smallActionText}>↻ {t('result.replace')}</Text>
          </Pressable>
        </View>
      );
    };

    return (
      <Animated.View style={[styles.page, { width, opacity, transform: [{ scale }] }]}>
        <ScrollView style={styles.pageScroller} contentContainerStyle={styles.pageScrollContent} showsVerticalScrollIndicator={false}>
          <ContentFrame maxWidth={820}>
            <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.titleWrap}>
                <View style={styles.counterRow}>
                  {index === 0 && displayed.length > 1 ? (
                    <View style={styles.pickBadge}>
                      <Text style={styles.pickBadgeText}>{l('★ Editörün seçimi', '★ Editor’s pick')}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.counter}>
                    {index + 1} / {displayed.length} · {item.source === 'ai' ? l('✦ AI', '✦ AI') : l('⚡ Hızlı', '⚡ Quick')}
                  </Text>
                </View>
                <Text style={styles.title}>{item.title}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={favorite ? t('result.favoriteRemove') : t('result.favoriteAdd')}
                onPress={() => { hapticTick(favorite ? 'light' : 'success'); void props.onToggleFavorite(item); }}
                style={({ pressed }) => [styles.favoriteButton, favorite && styles.favoriteButtonActive, pressed && styles.pressed]}
              >
                <Text style={[styles.favoriteIcon, favorite && styles.favoriteIconActive]}>{favorite ? '♥' : '♡'}</Text>
              </Pressable>
            </View>
            <OutfitPreview
              top={resolved.top}
              bottom={resolved.bottom}
              shoes={resolved.shoes}
              hat={resolved.hat}
              accessory={resolved.accessory}
              outerwear={resolved.outerwear}
              onPressItem={(piece) => {
                const pieces = [resolved.top, resolved.bottom, resolved.shoes, resolved.hat, resolved.accessory, resolved.outerwear]
                  .filter((p): p is ClothingItem => Boolean(p));
                const idx = pieces.findIndex((p) => p.id === piece.id);
                setViewerContext({ items: pieces, initialIndex: idx >= 0 ? idx : 0 });
              }}
              onRemoveExtra={(category) => removeExtra(item, category)}
              onSwapExtra={(category) => swapExtra(item, category)}
            />
            <Text style={styles.photoHint}>{t('result.enlarge')}</Text>
            <Text style={styles.reason}>{item.reason}</Text>
            <View style={styles.feedbackRow}>
              <Pressable
                onPress={() => void saveFeedback(item, 'like')}
                style={[styles.feedbackButton, currentFeedback === 'like' && styles.feedbackButtonActive]}
              >
                <Text style={styles.feedbackText}>👍 {t('result.like')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveFeedback(item, 'dislike')}
                style={[styles.feedbackButton, currentFeedback === 'dislike' && styles.feedbackButtonActive]}
              >
                <Text style={styles.feedbackText}>👎 {t('result.dislike')}</Text>
              </Pressable>
              <Pressable onPress={() => void saveWorn(item)} style={styles.feedbackButton}>
                <Text style={styles.feedbackText}>✓ {t('result.woreToday')}</Text>
              </Pressable>
            </View>
            <View style={styles.idBox}>
              {pieceRow(t('result.top', { name: resolved.top.name || resolved.top.subType || t('category.top') }), resolved.top, 'topId', 'top')}
              {pieceRow(t('result.bottom', { name: resolved.bottom.name || resolved.bottom.subType || t('category.bottom') }), resolved.bottom, 'bottomId', 'bottom')}
              {pieceRow(t('result.shoes', { name: resolved.shoes.name || resolved.shoes.subType || t('category.shoes') }), resolved.shoes, 'shoeId', 'shoes')}
            </View>
            </View>
          </ContentFrame>
        </ScrollView>
      </Animated.View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('result.title')} onBack={props.onBack} />
      {props.warning ? (
        <ContentFrame maxWidth={820} style={styles.noticeWrap}><Notice>{props.warning}</Notice></ContentFrame>
      ) : null}
      {displayed.length > 0 ? (
        <>
          <Animated.FlatList
            ref={listRef}
            data={displayed}
            extraData={{ favorites: props.favorites, feedback, pinned }}
            keyExtractor={outfitKey}
            renderItem={renderItem}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            onMomentumScrollEnd={onMomentumScrollEnd}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
            scrollEventThrottle={16}
          />
          <View style={styles.pagination}>
            {displayed.map((suggestion, index) => (
              <View key={outfitKey(suggestion)} style={[styles.dot, index === activeIndex && styles.dotActive]} />
            ))}
          </View>
          <Text style={styles.swipe}>{t('result.swipe')}</Text>
          <StickyFooter>
            <SecondaryButton title={t('result.more')} onPress={showAnotherSet} style={styles.footerButton} />
          </StickyFooter>
        </>
      ) : (
        <ContentFrame maxWidth={720} style={styles.emptyWrap}>
          <Notice tone="error">{t('result.empty')}</Notice>
        </ContentFrame>
      )}
      <ImageViewerModal
        items={viewerContext?.items ?? []}
        initialIndex={viewerContext?.initialIndex ?? 0}
        onClose={() => setViewerContext(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  noticeWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  page: { height: '100%' },
  pageScroller: { flex: 1 },
  pageScrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.md },
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleWrap: { flex: 1, gap: 3 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  counter: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  pickBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pickBadgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  title: { color: colors.text, fontSize: 23, fontWeight: '900' },
  favoriteButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  favoriteButtonActive: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  favoriteIcon: { color: colors.primary, fontSize: 28, lineHeight: 32 },
  favoriteIconActive: { color: colors.danger },
  photoHint: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: -8 },
  reason: { color: colors.text, fontSize: 15, lineHeight: 23 },
  feedbackRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  feedbackButton: { minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: spacing.sm, backgroundColor: colors.background },
  feedbackButtonActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  feedbackText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  idBox: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, gap: spacing.sm },
  pieceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  idText: { flex: 1, minWidth: 120, color: colors.muted, fontSize: 12 },
  smallAction: { minHeight: 34, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 9, backgroundColor: colors.surface },
  smallActionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  smallActionText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  smallActionTextActive: { color: colors.text },
  pagination: { minHeight: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 20, backgroundColor: colors.primary },
  swipe: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingBottom: spacing.sm },
  footerButton: { flex: 1 },
  emptyWrap: { padding: spacing.md },
  pressed: { opacity: 0.7 },
});
