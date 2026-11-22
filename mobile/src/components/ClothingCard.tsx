import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { type ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

export function ClothingCard({ item, onPress, onMenu, width, wears, incomplete }: {
  item: ClothingItem;
  onPress: () => void;
  onMenu: () => void;
  width: number;
  wears?: number;
  /** Shows a "missing details" badge on the photo. */
  incomplete?: boolean;
}) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const categoryLabel = t(`category.${item.category}` as 'category.top' | 'category.bottom' | 'category.shoes');
  const wearCount = wears ?? 0;
  const perWear = (typeof item.price === 'number' && item.price > 0 && wearCount > 0)
    ? item.price / wearCount
    : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={l(`${item.name || categoryLabel} kaydını aç`, `Open ${item.name || categoryLabel}`)}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <Image
        accessible
        accessibilityIgnoresInvertColors
        accessibilityLabel={l(`${item.name || categoryLabel} fotoğrafı`, `Photo of ${item.name || categoryLabel}`)}
        source={{ uri: item.thumbnailUri ?? item.photoUri }}
        style={styles.image}
        resizeMode="cover"
      />
      {incomplete ? (
        <View style={styles.imageOverlay} pointerEvents="none">
          <View style={styles.incompleteBadge} accessibilityLabel={l('Eksik bilgi var', 'Missing details')}>
            <Text style={styles.incompleteBadgeText}>{l('⚠ Eksik bilgi', '⚠ Missing info')}</Text>
          </View>
        </View>
      ) : null}
      {wearCount > 0 ? (
        <View style={styles.wearBadge}>
          <Text style={styles.wearBadgeText}>×{wearCount}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={l(`${item.name || 'Kıyafet'} seçenekleri`, `${item.name || 'Clothing'} options`)}
        hitSlop={8}
        onPress={onMenu}
        style={styles.menu}
      >
        <Text style={styles.menuText}>•••</Text>
      </Pressable>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.name}>{item.name || l('Adsız parça', 'Unnamed item')}</Text>
        <Text numberOfLines={1} style={styles.meta}>
          {[item.primaryColor, item.subType].filter(Boolean).join(' · ') || categoryLabel}
        </Text>
        {perWear != null ? (
          <Text numberOfLines={1} style={styles.perWear}>
            {perWear.toFixed(2)} {item.currency || (language === 'tr' ? 'TL' : 'USD')} / {l('giyim', 'wear')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.78 },
  menu: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.imageActionSurface,
  },
  menuText: { color: colors.imageActionText, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  image: { width: '100%', aspectRatio: 0.88, backgroundColor: colors.surfaceMuted },
  body: { padding: spacing.sm, gap: 3 },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12 },
  perWear: { color: colors.primary, fontSize: 11, fontWeight: '900', marginTop: 2 },
  wearBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    minWidth: 32,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: colors.imageActionSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wearBadgeText: { color: colors.imageActionText, fontSize: 12, fontWeight: '900' },
  imageOverlay: { position: 'absolute', left: 0, right: 0, top: 0, aspectRatio: 0.88 },
  incompleteBadge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incompleteBadgeText: { color: colors.text, fontSize: 11, fontWeight: '900' },
});

