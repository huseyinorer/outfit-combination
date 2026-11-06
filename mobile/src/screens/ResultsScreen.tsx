import { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import { OutfitPreview } from '../components/OutfitPreview';
import { Notice, ScreenHeader } from '../components/ui';
import { resolveOutfitItems } from '../domain/outfitEngine';
import type { ClothingItem, OutfitSuggestion } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';

export function ResultsScreen({ items, suggestions, warning, onBack }: {
  items: ClothingItem[];
  suggestions: OutfitSuggestion[];
  warning?: string;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;

  const renderItem = ({ item, index }: ListRenderItemInfo<OutfitSuggestion>) => {
    const resolved = resolveOutfitItems(items, item);
    if (!resolved.top || !resolved.bottom || !resolved.shoes) return null;
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    const scale = scrollX.interpolate({ inputRange, outputRange: [0.94, 1, 0.94], extrapolate: 'clamp' });
    const opacity = scrollX.interpolate({ inputRange, outputRange: [0.6, 1, 0.6], extrapolate: 'clamp' });

    return (
      <Animated.View style={[styles.page, { width, opacity, transform: [{ scale }] }]}>
        <View style={styles.card}>
          <Text style={styles.counter}>{index + 1} / {suggestions.length}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <OutfitPreview top={resolved.top} bottom={resolved.bottom} shoes={resolved.shoes} />
          <Text style={styles.reason}>{item.reason}</Text>
          <View style={styles.idBox}>
            <Text style={styles.idText}>Üst · {resolved.top.name || resolved.top.id}</Text>
            <Text style={styles.idText}>Alt · {resolved.bottom.name || resolved.bottom.id}</Text>
            <Text style={styles.idText}>Ayakkabı · {resolved.shoes.name || resolved.shoes.id}</Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Kombinlerin" onBack={onBack} />
      {warning ? <View style={styles.noticeWrap}><Notice>{warning}</Notice></View> : null}
      <Animated.FlatList
        data={suggestions}
        keyExtractor={(item) => `${item.topId}|${item.bottomId}|${item.shoeId}`}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      />
      <Text style={styles.swipe}>Diğer kombinler için sağa–sola kaydır</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  noticeWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  page: { padding: spacing.md, justifyContent: 'center' },
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.md },
  counter: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 23, fontWeight: '900' },
  reason: { color: colors.text, fontSize: 15, lineHeight: 23 },
  idBox: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 3 },
  idText: { color: colors.muted, fontSize: 12 },
  swipe: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingBottom: spacing.md },
});

