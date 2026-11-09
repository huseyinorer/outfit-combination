import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClothingItem, Category } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
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

function BoardPiece({ item, large = false, onPress }: {
  item: ClothingItem;
  large?: boolean;
  onPress?: (item: ClothingItem) => void;
}) {
  const { language } = useI18n();
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={language === 'tr' ? `${item.name || item.subType} fotoğrafını büyüt` : `Enlarge ${item.name || item.subType} photo`}
      onPress={() => onPress?.(item)}
      style={({ pressed }) => [styles.boardPiece, large && styles.boardPieceLarge, pressed && styles.pressed]}
    >
      <Image source={{ uri: item.photoUri }} style={styles.boardImage} resizeMode="contain" />
      <Text numberOfLines={1} style={styles.pieceLabel}>{item.name || item.subType}</Text>
    </Pressable>
  );
}

function Figure({ top, bottom, shoes, onPressItem }: Props) {
  return (
    <View style={styles.figure}>
      <View style={styles.head} />
      <View style={styles.body} />
      <View style={styles.legs} />
      <Pressable onPress={() => onPressItem?.(top)} style={styles.figureTop}>
        <Image source={{ uri: top.cutoutUri! }} style={styles.figureImage} resizeMode="contain" />
      </Pressable>
      <Pressable onPress={() => onPressItem?.(bottom)} style={styles.figureBottom}>
        <Image source={{ uri: bottom.cutoutUri! }} style={styles.figureImage} resizeMode="contain" />
      </Pressable>
      <Pressable onPress={() => onPressItem?.(shoes)} style={styles.figureShoes}>
        <Image source={{ uri: shoes.cutoutUri! }} style={styles.figureImage} resizeMode="contain" />
      </Pressable>
    </View>
  );
}

export function OutfitPreview(props: Props) {
  const canUseFigure = Boolean(props.top.cutoutUri && props.bottom.cutoutUri && props.shoes.cutoutUri);
  const extras: Array<{ item: ClothingItem; category: Category }> = [];
  if (props.hat) extras.push({ item: props.hat, category: 'hat' });
  if (props.accessory) extras.push({ item: props.accessory, category: 'accessory' });
  if (props.outerwear) extras.push({ item: props.outerwear, category: 'outerwear' });

  return (
    <View style={styles.wrap}>
      {canUseFigure ? (
        <Figure {...props} />
      ) : (
        <View style={styles.board}>
          <BoardPiece item={props.top} large onPress={props.onPressItem} />
          <View style={styles.boardColumn}>
            <BoardPiece item={props.bottom} onPress={props.onPressItem} />
            <BoardPiece item={props.shoes} onPress={props.onPressItem} />
          </View>
        </View>
      )}
      {extras.length > 0 ? (
        <View style={styles.extrasRow}>
          {extras.map((entry) => (
            <ExtraThumb
              key={entry.category}
              item={entry.item}
              category={entry.category}
              onPress={props.onPressItem}
              onRemove={props.onRemoveExtra ? () => props.onRemoveExtra!(entry.category as OptionalCategory) : undefined}
              onSwap={props.onSwapExtra ? () => props.onSwapExtra!(entry.category as OptionalCategory) : undefined}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ExtraThumb({ item, category, onPress, onRemove, onSwap }: {
  item: ClothingItem;
  category: Category;
  onPress?: (item: ClothingItem) => void;
  onRemove?: () => void;
  onSwap?: () => void;
}) {
  const { language } = useI18n();
  const labels: Record<Category, [string, string]> = {
    top: ['Üst', 'Top'],
    bottom: ['Alt', 'Bottom'],
    shoes: ['Ayakkabı', 'Shoes'],
    hat: ['Şapka', 'Hat'],
    accessory: ['Aksesuar', 'Accessory'],
    outerwear: ['Mont', 'Jacket'],
  };
  const [tr, en] = labels[category];
  return (
    <View style={styles.extraThumbWrap}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={language === 'tr' ? `${tr} · ${item.name || item.subType}` : `${en} · ${item.name || item.subType}`}
        onPress={() => onPress?.(item)}
        style={({ pressed }) => [styles.extraThumb, pressed && styles.pressed]}
      >
        <Image source={{ uri: item.cutoutUri ?? item.photoUri }} style={styles.extraThumbImage} resizeMode="contain" />
        <View style={styles.extraThumbMeta}>
          <Text style={styles.extraThumbTag}>{language === 'tr' ? tr : en}</Text>
          <Text numberOfLines={1} style={styles.extraThumbName}>{item.name || item.subType}</Text>
        </View>
      </Pressable>
      {(onRemove || onSwap) ? (
        <View style={styles.extraThumbActions}>
          {onSwap ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={language === 'tr' ? `${tr} değiştir` : `Swap ${en}`}
              onPress={onSwap}
              hitSlop={8}
              style={({ pressed }) => [styles.extraThumbAction, pressed && styles.pressed]}
            >
              <Text style={styles.extraThumbActionText}>↻</Text>
            </Pressable>
          ) : null}
          {onRemove ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={language === 'tr' ? `${tr} kaldır` : `Remove ${en}`}
              onPress={onRemove}
              hitSlop={8}
              style={({ pressed }) => [styles.extraThumbAction, styles.extraThumbActionDanger, pressed && styles.pressed]}
            >
              <Text style={[styles.extraThumbActionText, styles.extraThumbActionTextDanger]}>×</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  extrasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  extraThumbWrap: { flexGrow: 1, flexBasis: '30%', position: 'relative' },
  extraThumb: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  extraThumbActions: { position: 'absolute', top: 4, right: 4, flexDirection: 'row', gap: 4 },
  extraThumbAction: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  extraThumbActionDanger: { borderColor: colors.danger },
  extraThumbActionText: { color: colors.text, fontSize: 14, fontWeight: '800', lineHeight: 16 },
  extraThumbActionTextDanger: { color: colors.danger, fontSize: 16, lineHeight: 16 },
  extraThumbImage: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  extraThumbMeta: { flex: 1, gap: 2 },
  extraThumbTag: { color: colors.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  extraThumbName: { color: colors.text, fontSize: 13, fontWeight: '800' },
  board: {
    height: 320,
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
  },
  boardColumn: { flex: 1, gap: spacing.sm },
  boardPiece: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.xs,
  },
  boardPieceLarge: { flex: 1.08 },
  boardImage: { flex: 1, width: '100%' },
  pieceLabel: { color: colors.text, fontSize: 12, fontWeight: '700', padding: 5 },
  pressed: { opacity: 0.75 },
  figure: {
    height: 360,
    alignItems: 'center',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  head: { position: 'absolute', top: 15, width: 52, height: 52, borderRadius: 28, backgroundColor: colors.figure },
  body: { position: 'absolute', top: 68, width: 132, height: 132, borderRadius: 55, backgroundColor: colors.figure },
  legs: { position: 'absolute', top: 188, width: 92, height: 135, borderRadius: 30, backgroundColor: colors.figure },
  figureTop: { position: 'absolute', top: 58, width: 178, height: 145 },
  figureBottom: { position: 'absolute', top: 170, width: 150, height: 145 },
  figureShoes: { position: 'absolute', top: 298, width: 164, height: 55 },
  figureImage: { width: '100%', height: '100%' },
});
