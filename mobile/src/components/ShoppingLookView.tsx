import { useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category, ClothingItem, ShoppingLook, ShoppingProduct } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';
import { Notice } from './ui';

const SLOT_ORDER: Category[] = ['outerwear', 'top', 'bottom', 'shoes', 'hat', 'accessory'];
const SLOT_FIELD: Record<Category, 'topId' | 'bottomId' | 'shoeId' | 'outerwearId' | 'hatId' | 'accessoryId'> = {
  top: 'topId',
  bottom: 'bottomId',
  shoes: 'shoeId',
  outerwear: 'outerwearId',
  hat: 'hatId',
  accessory: 'accessoryId',
};

// React Native's URL polyfill does not implement every getter, so parse the host directly.
const hostOf = (url: string) => /^https?:\/\/([^/?#]+)/i.exec(url)?.[1]?.replace(/^www\./i, '') ?? url;

/**
 * The "complete with shopping" result shown together with the outfit: a board with the wardrobe
 * pieces and the currently chosen product for each piece to buy, then a product list per piece
 * (image preview, store, price, link). Tapping a product puts it on the board.
 */
export function ShoppingLookView({ look, items }: { look: ShoppingLook; items: ClothingItem[] }) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const categoryLabel = (category: Category) =>
    t(`category.${category}` as 'category.top' | 'category.bottom' | 'category.shoes' | 'category.hat' | 'category.accessory' | 'category.outerwear');
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  // Default pick per piece: the first product that has a preview image, else the first product.
  const [chosen, setChosen] = useState<Partial<Record<Category, string>>>(() => Object.fromEntries(
    look.pieces.map((piece) => [
      piece.category,
      (piece.products.find((product) => product.imageUrl) ?? piece.products[0])?.url,
    ]),
  ));

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(l('Bağlantı açılamadı', 'Could not open link'), url);
    }
  };

  type BoardTile = { key: Category; kind: 'buy' | 'own'; category: Category; label: string; image: string | null };
  const board = SLOT_ORDER.flatMap<BoardTile>((category) => {
    const piece = look.pieces.find((entry) => entry.category === category);
    if (piece) {
      const product = piece.products.find((entry) => entry.url === chosen[category]);
      return [{ key: category, kind: 'buy' as const, category, label: product?.name ?? piece.idealItem.name, image: product?.imageUrl || null }];
    }
    const id = look[SLOT_FIELD[category]];
    const item = id ? byId.get(id) : undefined;
    return item
      ? [{ key: category, kind: 'own' as const, category, label: item.name || categoryLabel(category), image: item.thumbnailUri ?? item.photoUri }]
      : [];
  });

  const productRow = (category: Category, product: ShoppingProduct) => {
    const selected = chosen[category] === product.url;
    return (
      <View key={product.url} style={[styles.productRow, selected && styles.productRowSelected]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={l(`${product.name} ürününü kombinde göster`, `Show ${product.name} in the outfit`)}
          onPress={() => setChosen((current) => ({ ...current, [category]: product.url }))}
          style={({ pressed }) => [styles.productMain, pressed && styles.pressed]}
        >
          {product.imageUrl ? (
            <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="cover" />
          ) : (
            <View style={[styles.productImage, styles.productImageEmpty]}>
              <Text style={styles.productImageEmptyText}>🛍</Text>
            </View>
          )}
          <View style={styles.productCopy}>
            <Text numberOfLines={2} style={styles.productName}>{product.name}</Text>
            <Text numberOfLines={1} style={styles.productStore}>{product.store || hostOf(product.url)}</Text>
            {product.price ? <Text style={styles.productPrice}>{product.price}</Text> : null}
            {selected ? <Text style={styles.productSelected}>{l('✓ Kombinde gösteriliyor', '✓ Shown in the outfit')}</Text> : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={l(`${product.name} ürününü mağazada aç`, `Open ${product.name} in the store`)}
          onPress={() => void open(product.url)}
          hitSlop={6}
          style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
        >
          <Text style={styles.openButtonText}>{l('Mağazada aç', 'Open store')}</Text>
          <Text style={styles.openButtonHost}>{hostOf(product.url)} ↗</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{l('🛍 ALIŞVERİŞLE TAMAMLANAN KOMBİN', '🛍 OUTFIT COMPLETED WITH SHOPPING')}</Text>
        <Text style={styles.title}>{look.title}</Text>
        <View style={styles.board}>
          {board.map((tile) => (
            <View key={tile.key} style={styles.tile}>
              <View style={[styles.tileImageWrap, tile.kind === 'buy' && styles.tileImageWrapBuy]}>
                {tile.image ? (
                  <Image source={{ uri: tile.image }} style={styles.tileImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.tilePlaceholder}>🛍</Text>
                )}
                <View style={[styles.tileBadge, tile.kind === 'buy' ? styles.tileBadgeBuy : styles.tileBadgeOwn]}>
                  <Text style={[styles.tileBadgeText, tile.kind === 'buy' && styles.tileBadgeTextBuy]}>
                    {tile.kind === 'buy' ? l('Alınacak', 'To buy') : l('Dolabında', 'Yours')}
                  </Text>
                </View>
              </View>
              <Text numberOfLines={2} style={styles.tileLabel}>{tile.label}</Text>
            </View>
          ))}
        </View>
        {look.reason ? <Text style={styles.reason}>{look.reason}</Text> : null}
      </View>

      {look.pieces.map((piece) => (
        <View key={piece.category} style={styles.card}>
          <Text style={styles.pieceCategory}>{categoryLabel(piece.category)} · {l('alınacak parça', 'piece to buy')}</Text>
          <Text style={styles.pieceName}>{piece.idealItem.name}</Text>
          {piece.idealItem.description ? <Text style={styles.pieceText}>{piece.idealItem.description}</Text> : null}
          {piece.products.length === 0 ? (
            <Notice>{l('Doğrulanabilen ürün bulunamadı. Aşağıdaki mağaza aramalarını deneyebilirsin.', 'No verifiable products were found. Try the store searches below.')}</Notice>
          ) : (
            <View style={styles.productList}>
              {piece.products.map((product) => productRow(piece.category, product))}
            </View>
          )}
          {piece.searchLinks.length > 0 ? (
            <>
              <Text style={styles.searchLabel}>{l('Daha fazlası için mağazalarda ara', 'More in stores')}: “{piece.idealItem.searchQuery || piece.idealItem.name}”</Text>
              <View style={styles.searchRow}>
                {piece.searchLinks.map((link) => (
                  <Pressable
                    key={link.url}
                    accessibilityRole="link"
                    onPress={() => void open(link.url)}
                    style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.searchButtonText}>{link.label} ↗</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </View>
      ))}
      <Text style={styles.disclaimer}>
        {l(
          'Ürünler AI web aramasıyla bulundu; görseller ürün sayfasından alındı. Fiyat ve stok mağazada değişmiş olabilir.',
          'Products were found with an AI web search; images come from the product pages. Price and stock may have changed in the store.',
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900' },
  reason: { color: colors.text, fontSize: 15, lineHeight: 22 },
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: 100, gap: 4 },
  tileImageWrap: {
    width: 100,
    height: 116,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  tileImageWrapBuy: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileImage: { width: '100%', height: '100%' },
  tilePlaceholder: { fontSize: 30 },
  tileBadge: { position: 'absolute', left: 4, bottom: 4, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tileBadgeOwn: { backgroundColor: colors.imageActionSurface },
  tileBadgeBuy: { backgroundColor: colors.primary },
  tileBadgeText: { color: colors.imageActionText, fontSize: 10, fontWeight: '900' },
  tileBadgeTextBuy: { color: colors.onPrimary },
  tileLabel: { color: colors.text, fontSize: 11, fontWeight: '700' },
  pieceCategory: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  pieceName: { color: colors.text, fontSize: 18, fontWeight: '900' },
  pieceText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  productList: { gap: spacing.sm, marginTop: spacing.xs },
  productRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  productRowSelected: { borderColor: colors.primary, borderWidth: 2 },
  productMain: { flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  productImage: { width: 76, height: 92, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  productImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  productImageEmptyText: { fontSize: 26 },
  productCopy: { flex: 1, gap: 3 },
  productName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  productStore: { color: colors.muted, fontSize: 12 },
  productPrice: { color: colors.text, fontSize: 15, fontWeight: '900' },
  productSelected: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.sm,
    minHeight: 40,
  },
  openButtonText: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  openButtonHost: { color: colors.muted, fontSize: 12 },
  searchLabel: { color: colors.muted, fontSize: 12, marginTop: spacing.xs },
  searchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  searchButton: { minHeight: 38, justifyContent: 'center', borderRadius: 20, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: spacing.md },
  searchButtonText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  disclaimer: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.7 },
});
