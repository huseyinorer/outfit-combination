import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_LABELS, type ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';

export function ClothingCard({ item, onPress, onMenu, width }: {
  item: ClothingItem;
  onPress: () => void;
  onMenu: () => void;
  width: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name || CATEGORY_LABELS[item.category]} kaydını aç`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <Image source={{ uri: item.thumbnailUri ?? item.photoUri }} style={styles.image} resizeMode="cover" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name || 'Kıyafet'} seçenekleri`}
        hitSlop={8}
        onPress={onMenu}
        style={styles.menu}
      >
        <Text style={styles.menuText}>•••</Text>
      </Pressable>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.name}>{item.name || 'Adsız parça'}</Text>
        <Text numberOfLines={1} style={styles.meta}>
          {[item.primaryColor, item.subType].filter(Boolean).join(' · ') || CATEGORY_LABELS[item.category]}
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
    backgroundColor: 'rgba(255,252,246,0.92)',
  },
  menuText: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  image: { width: '100%', aspectRatio: 0.88, backgroundColor: '#ECE7DC' },
  body: { padding: spacing.sm, gap: 3 },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12 },
});

