import { Image, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { ClothingItem, Category } from '../domain/types';
import { CategoryIcon } from './CategoryIcon';
import { colors, darkPalette, lightPalette, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

type OptionalCategory = 'hat' | 'accessory' | 'outerwear';

interface Props {
  top: ClothingItem;
  bottom: ClothingItem;
  shoes: ClothingItem;
  hat?: ClothingItem;
  accessory?: ClothingItem;
  outerwear?: ClothingItem;
  onPressItem?: (item: ClothingItem) => void;
  onRemoveExtra?: (category: OptionalCategory) => void;
  onSwapExtra?: (category: OptionalCategory) => void;
}

type LayerKey = 'outerwear' | 'top' | 'bottom' | 'shoes';

const layerOrder: LayerKey[] = ['outerwear', 'top', 'bottom', 'shoes'];

function labelFor(category: Category, language: 'tr' | 'en'): string {
  const map: Record<Category, [string, string]> = {
    top: ['Üst', 'Top'],
    bottom: ['Alt', 'Bottom'],
    shoes: ['Ayakkabı', 'Shoes'],
    hat: ['Şapka', 'Hat'],
    accessory: ['Aksesuar', 'Accessory'],
    outerwear: ['Mont', 'Jacket'],
  };
  const [tr, en] = map[category];
  return language === 'tr' ? tr : en;
}

function LayerCard({ item, category, onPress, badge, iconColor }: {
  item: ClothingItem;
  category: Category;
  onPress?: (item: ClothingItem) => void;
  badge?: string;
  iconColor: string;
}) {
  const { language } = useI18n();
  const lang = language === 'tr' ? 'tr' : 'en';
  const label = labelFor(category, lang);
  const meta = [item.primaryColor, item.subType].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`${label} · ${item.name || item.subType || label}`}
      onPress={() => onPress?.(item)}
      style={({ pressed }) => [styles.layerCard, pressed && styles.pressed]}
    >
      <Image source={{ uri: item.cutoutUri ?? item.thumbnailUri ?? item.photoUri }} style={styles.layerImage} resizeMode="cover" />
      <View style={styles.layerBody}>
        <View style={styles.layerHeader}>
          <View style={styles.layerIconWrap}>
            <CategoryIcon category={category} size={16} color={iconColor} />
          </View>
          <Text style={styles.layerLabel}>{label}</Text>
          {badge ? <Text style={styles.layerBadge}>{badge}</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.layerName}>
          {item.name || item.subType || label}
        </Text>
        {meta ? <Text numberOfLines={1} style={styles.layerMeta}>{meta}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function ExtraChip({ item, category, onPress, onRemove, onSwap, iconColor }: {
  item: ClothingItem;
  category: Category;
  onPress?: (item: ClothingItem) => void;
  onRemove?: () => void;
  onSwap?: () => void;
  iconColor: string;
}) {
  const { language } = useI18n();
  const lang = language === 'tr' ? 'tr' : 'en';
  const label = labelFor(category, lang);
  return (
    <View style={styles.extraChip}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`${label} · ${item.name || item.subType}`}
        onPress={() => onPress?.(item)}
        style={({ pressed }) => [styles.extraChipInner, pressed && styles.pressed]}
      >
        <Image source={{ uri: item.cutoutUri ?? item.thumbnailUri ?? item.photoUri }} style={styles.extraImage} resizeMode="cover" />
        <View style={styles.extraBody}>
          <View style={styles.extraHeader}>
            <CategoryIcon category={category} size={14} color={iconColor} />
            <Text style={styles.extraLabel}>{label}</Text>
          </View>
          <Text numberOfLines={1} style={styles.extraName}>{item.name || item.subType}</Text>
        </View>
      </Pressable>
      {(onSwap || onRemove) ? (
        <View style={styles.extraActions}>
          {onSwap ? (
            <Pressable onPress={onSwap} hitSlop={8} style={({ pressed }) => [styles.extraAction, pressed && styles.pressed]}>
              <Text style={styles.extraActionText}>↻</Text>
            </Pressable>
          ) : null}
          {onRemove ? (
            <Pressable onPress={onRemove} hitSlop={8} style={({ pressed }) => [styles.extraAction, styles.extraActionDanger, pressed && styles.pressed]}>
              <Text style={[styles.extraActionText, styles.extraActionTextDanger]}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function OutfitPreview(props: Props) {
  const { language } = useI18n();
  const scheme = useColorScheme();
  const iconColor = scheme === 'dark' ? darkPalette.primary : lightPalette.primary;
  const lang = language === 'tr' ? 'tr' : 'en';

  const layers: Array<{ key: LayerKey; item: ClothingItem; category: Category; badge?: string }> = [];
  if (props.outerwear) {
    layers.push({
      key: 'outerwear', item: props.outerwear, category: 'outerwear',
      badge: lang === 'tr' ? 'En üst kat' : 'Outer layer',
    });
  }
  layers.push({
    key: 'top', item: props.top, category: 'top',
    badge: props.outerwear ? (lang === 'tr' ? 'Mont altı' : 'Under layer') : undefined,
  });
  layers.push({ key: 'bottom', item: props.bottom, category: 'bottom' });
  layers.push({ key: 'shoes', item: props.shoes, category: 'shoes' });

  const extras: Array<{ item: ClothingItem; category: OptionalCategory }> = [];
  if (props.hat) extras.push({ item: props.hat, category: 'hat' });
  if (props.accessory) extras.push({ item: props.accessory, category: 'accessory' });

  return (
    <View style={styles.wrap}>
      {props.outerwear ? (
        <View style={styles.layerHint}>
          <Text style={styles.layerHintText}>
            {lang === 'tr'
              ? '🧥 Montun altına bir üst öneriliyor — yukarıdan aşağı sıralandı.'
              : '🧥 A layer under the jacket is included — sorted top to bottom.'}
          </Text>
        </View>
      ) : null}
      {layers.sort((a, b) => layerOrder.indexOf(a.key) - layerOrder.indexOf(b.key)).map((layer) => (
        <LayerCard
          key={layer.key}
          item={layer.item}
          category={layer.category}
          onPress={props.onPressItem}
          badge={layer.badge}
          iconColor={iconColor}
        />
      ))}
      {extras.length > 0 ? (
        <View style={styles.extrasRow}>
          {extras.map((entry) => (
            <ExtraChip
              key={entry.category}
              item={entry.item}
              category={entry.category}
              onPress={props.onPressItem}
              onRemove={props.onRemoveExtra ? () => props.onRemoveExtra!(entry.category) : undefined}
              onSwap={props.onSwapExtra ? () => props.onSwapExtra!(entry.category) : undefined}
              iconColor={iconColor}
            />
          ))}
        </View>
      ) : null}
      {props.outerwear && (props.onRemoveExtra || props.onSwapExtra) ? (
        <View style={styles.outerwearActions}>
          {props.onSwapExtra ? (
            <Pressable onPress={() => props.onSwapExtra!('outerwear')} hitSlop={8} style={({ pressed }) => [styles.outerwearAction, pressed && styles.pressed]}>
              <Text style={styles.outerwearActionText}>↻ {lang === 'tr' ? 'Mont değiştir' : 'Swap jacket'}</Text>
            </Pressable>
          ) : null}
          {props.onRemoveExtra ? (
            <Pressable onPress={() => props.onRemoveExtra!('outerwear')} hitSlop={8} style={({ pressed }) => [styles.outerwearAction, styles.outerwearActionDanger, pressed && styles.pressed]}>
              <Text style={[styles.outerwearActionText, styles.outerwearActionTextDanger]}>× {lang === 'tr' ? 'Montu kaldır' : 'Remove jacket'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  layerHint: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
  },
  layerHintText: { color: colors.primary, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  layerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  layerImage: {
    width: 84,
    height: 84,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  layerBody: { flex: 1, gap: 2 },
  layerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  layerIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerLabel: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  layerBadge: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    marginLeft: 'auto',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceMuted,
  },
  layerName: { color: colors.text, fontSize: 16, fontWeight: '900' },
  layerMeta: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  chevron: { color: colors.muted, fontSize: 26, fontWeight: '400', marginRight: 2 },
  pressed: { opacity: 0.72 },
  extrasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  extraChip: { flexGrow: 1, flexBasis: '45%', position: 'relative' },
  extraChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    paddingRight: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  extraImage: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  extraBody: { flex: 1, gap: 1 },
  extraHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  extraLabel: {
    color: colors.primary,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  extraName: { color: colors.text, fontSize: 12, fontWeight: '800' },
  extraActions: { position: 'absolute', top: 4, right: 4, flexDirection: 'row', gap: 4 },
  extraAction: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraActionDanger: { borderColor: colors.danger },
  extraActionText: { color: colors.text, fontSize: 12, fontWeight: '800', lineHeight: 14 },
  extraActionTextDanger: { color: colors.danger, fontSize: 14, lineHeight: 14 },
  outerwearActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  outerwearAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  outerwearActionDanger: { borderColor: colors.danger },
  outerwearActionText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  outerwearActionTextDanger: { color: colors.danger },
});
