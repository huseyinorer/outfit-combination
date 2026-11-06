import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_LABELS, type ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';

export function ClothingCard({ item, onPress }: { item: ClothingItem; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name || CATEGORY_LABELS[item.category]} kaydını aç`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Image source={{ uri: item.photoUri }} style={styles.image} resizeMode="cover" />
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
    width: '48%',
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.78 },
  image: { width: '100%', aspectRatio: 0.88, backgroundColor: '#ECE7DC' },
  body: { padding: spacing.sm, gap: 3 },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12 },
});

