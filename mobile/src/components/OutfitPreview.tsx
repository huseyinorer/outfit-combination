import { Image, StyleSheet, Text, View } from 'react-native';
import type { ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';

interface Props {
  top: ClothingItem;
  bottom: ClothingItem;
  shoes: ClothingItem;
}

function BoardPiece({ item, large = false }: { item: ClothingItem; large?: boolean }) {
  return (
    <View style={[styles.boardPiece, large && styles.boardPieceLarge]}>
      <Image source={{ uri: item.photoUri }} style={styles.boardImage} resizeMode="contain" />
      <Text numberOfLines={1} style={styles.pieceLabel}>{item.name || item.subType}</Text>
    </View>
  );
}

function Figure({ top, bottom, shoes }: Props) {
  return (
    <View style={styles.figure}>
      <View style={styles.head} />
      <View style={styles.body} />
      <View style={styles.legs} />
      <Image source={{ uri: top.cutoutUri! }} style={styles.figureTop} resizeMode="contain" />
      <Image source={{ uri: bottom.cutoutUri! }} style={styles.figureBottom} resizeMode="contain" />
      <Image source={{ uri: shoes.cutoutUri! }} style={styles.figureShoes} resizeMode="contain" />
    </View>
  );
}

export function OutfitPreview(props: Props) {
  const canUseFigure = Boolean(props.top.cutoutUri && props.bottom.cutoutUri && props.shoes.cutoutUri);
  if (canUseFigure) return <Figure {...props} />;

  return (
    <View style={styles.board}>
      <BoardPiece item={props.top} large />
      <View style={styles.boardColumn}>
        <BoardPiece item={props.bottom} />
        <BoardPiece item={props.shoes} />
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
});

