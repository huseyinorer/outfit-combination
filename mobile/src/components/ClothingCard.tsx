import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { type ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

export function ClothingCard({ item, onPress, onMenu, width }: {
  item: ClothingItem;
  onPress: () => void;
  onMenu: () => void;
  width: number;
}) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const categoryLabel = t(`category.${item.category}` as 'category.top' | 'category.bottom' | 'category.shoes');
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
});

