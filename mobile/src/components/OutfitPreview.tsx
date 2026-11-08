import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

interface Props {
  top: ClothingItem;
  bottom: ClothingItem;
  shoes: ClothingItem;
  onPressItem?: (item: ClothingItem) => void;
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
  if (canUseFigure) return <Figure {...props} />;

  return (
    <View style={styles.board}>
      <BoardPiece item={props.top} large onPress={props.onPressItem} />
      <View style={styles.boardColumn}>
        <BoardPiece item={props.bottom} onPress={props.onPressItem} />
        <BoardPiece item={props.shoes} onPress={props.onPressItem} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    height: 320,
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: '#EEE9DF',
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
    backgroundColor: '#EEE9DF',
  },
  head: { position: 'absolute', top: 15, width: 52, height: 52, borderRadius: 28, backgroundColor: '#D8D1C5' },
  body: { position: 'absolute', top: 68, width: 132, height: 132, borderRadius: 55, backgroundColor: '#D8D1C5' },
  legs: { position: 'absolute', top: 188, width: 92, height: 135, borderRadius: 30, backgroundColor: '#D8D1C5' },
  figureTop: { position: 'absolute', top: 58, width: 178, height: 145 },
  figureBottom: { position: 'absolute', top: 170, width: 150, height: 145 },
  figureShoes: { position: 'absolute', top: 298, width: 164, height: 55 },
  figureImage: { width: '100%', height: '100%' },
});
