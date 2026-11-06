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
  const { width } = useWindowDimensions();
  const [displayed, setDisplayed] = useState(props.suggestions);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerItem, setViewerItem] = useState<ClothingItem | null>(null);
  const [seenKeys, setSeenKeys] = useState(() => new Set(props.suggestions.map(outfitKey)));
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<OutfitSuggestion>>(null);
  const favoriteKeys = useMemo(() => new Set(props.favorites.map(outfitKey)), [props.favorites]);

  useEffect(() => {
    setDisplayed(props.suggestions);
    setSeenKeys(new Set(props.suggestions.map(outfitKey)));
    setActiveIndex(0);
  }, [props.suggestions]);

  const showAnotherSet = () => {
    let next = buildLocalSuggestions(props.items, props.preferences, seenKeys).slice(0, 3);
    let nextSeen = new Set(seenKeys);
    if (next.length === 0) {
      next = buildLocalSuggestions(props.items, props.preferences).slice(0, 3);
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

    return (
      <Animated.View style={[styles.page, { width, opacity, transform: [{ scale }] }]}>
        <ScrollView style={styles.pageScroller} contentContainerStyle={styles.pageScrollContent} showsVerticalScrollIndicator={false}>
          <ContentFrame maxWidth={820}>
            <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.titleWrap}>
                <Text style={styles.counter}>{index + 1} / {displayed.length}</Text>
                <Text style={styles.title}>{item.title}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={favorite ? 'Favoriden çıkar' : 'Favoriye ekle'}
                onPress={() => void props.onToggleFavorite(item)}
                style={({ pressed }) => [styles.favoriteButton, favorite && styles.favoriteButtonActive, pressed && styles.pressed]}
              >
                <Text style={[styles.favoriteIcon, favorite && styles.favoriteIconActive]}>{favorite ? '♥' : '♡'}</Text>
              </Pressable>
            </View>
            <OutfitPreview
              top={resolved.top}
              bottom={resolved.bottom}
              shoes={resolved.shoes}
              onPressItem={setViewerItem}
            />
            <Text style={styles.photoHint}>Büyütmek için bir fotoğrafa dokun.</Text>
            <Text style={styles.reason}>{item.reason}</Text>
            <View style={styles.idBox}>
              <Text style={styles.idText}>Üst · {resolved.top.name || resolved.top.id}</Text>
              <Text style={styles.idText}>Alt · {resolved.bottom.name || resolved.bottom.id}</Text>
              <Text style={styles.idText}>Ayakkabı · {resolved.shoes.name || resolved.shoes.id}</Text>
            </View>
            </View>
          </ContentFrame>
        </ScrollView>
      </Animated.View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Kombinlerin" onBack={props.onBack} />
      {props.warning ? (
        <ContentFrame maxWidth={820} style={styles.noticeWrap}><Notice>{props.warning}</Notice></ContentFrame>
      ) : null}
      {displayed.length > 0 ? (
        <>
          <Animated.FlatList
            ref={listRef}
            data={displayed}
            extraData={props.favorites}
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
          <Text style={styles.swipe}>Diğer kombinler için sağa–sola kaydır</Text>
          <StickyFooter>
            <SecondaryButton title="Başka 3 kombin" onPress={showAnotherSet} style={styles.footerButton} />
          </StickyFooter>
        </>
      ) : (
        <ContentFrame maxWidth={720} style={styles.emptyWrap}>
          <Notice tone="error">Bu dolaptan geçerli bir kombin oluşturulamadı.</Notice>
        </ContentFrame>
      )}
      <ImageViewerModal item={viewerItem} onClose={() => setViewerItem(null)} />
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
  counter: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 23, fontWeight: '900' },
  favoriteButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  favoriteButtonActive: { backgroundColor: '#F8E2DF', borderColor: '#D7A6A1' },
  favoriteIcon: { color: colors.primary, fontSize: 28, lineHeight: 32 },
  favoriteIconActive: { color: colors.danger },
  photoHint: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: -8 },
  reason: { color: colors.text, fontSize: 15, lineHeight: 23 },
  idBox: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 3 },
  idText: { color: colors.muted, fontSize: 12 },
  pagination: { minHeight: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 20, backgroundColor: colors.primary },
  swipe: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingBottom: spacing.sm },
  footerButton: { flex: 1 },
  emptyWrap: { padding: spacing.md },
  pressed: { opacity: 0.7 },
});
