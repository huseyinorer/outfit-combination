import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ImageViewerModal } from '../components/ImageViewerModal';
import { ContentFrame } from '../components/layout';
import { OutfitPreview } from '../components/OutfitPreview';
import { Notice, ScreenHeader, SecondaryButton } from '../components/ui';
import { resolveOutfitItems } from '../domain/outfitEngine';
import type { ClothingItem, FavoriteOutfit } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

export function FavoritesScreen({ items, favorites, onToggleFavorite, onBack }: {
  items: ClothingItem[];
  favorites: FavoriteOutfit[];
  onToggleFavorite: (favorite: FavoriteOutfit) => Promise<void>;
  onBack: () => void;
}) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const { width } = useWindowDimensions();
  const [viewerItem, setViewerItem] = useState<ClothingItem | null>(null);
  const wide = width >= 900;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={l('Favori kombinler', 'Favorite outfits')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={1120} style={styles.content}>
          {favorites.length === 0 ? (
            <Notice>{l('Henüz favori kombin yok. Sonuç ekranındaki kalp simgesine dokunarak ekleyebilirsin.', 'You have no favorite outfits yet. Tap the heart on a result card to add one.')}</Notice>
          ) : (
            <View style={styles.grid}>
              {favorites.map((favorite) => {
                const resolved = resolveOutfitItems(items, favorite);
                if (!resolved.top || !resolved.bottom || !resolved.shoes) return null;
                return (
                  <View key={favorite.id} style={[styles.card, wide && styles.cardWide]}>
                    <Text style={styles.title}>{favorite.title}</Text>
                    <OutfitPreview
                      top={resolved.top}
                      bottom={resolved.bottom}
                      shoes={resolved.shoes}
                      hat={resolved.hat}
                      accessory={resolved.accessory}
                      outerwear={resolved.outerwear}
                      onPressItem={setViewerItem}
                    />
                    <Text style={styles.reason}>{favorite.reason}</Text>
                    <SecondaryButton title={t('result.favoriteRemove')} onPress={() => void onToggleFavorite(favorite)} />
                  </View>
                );
              })}
            </View>
          )}
        </ContentFrame>
      </ScrollView>
      <ImageViewerModal item={viewerItem} onClose={() => setViewerItem(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 48 },
  content: { padding: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { width: '100%', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.md },
  cardWide: { width: '49%' },
  title: { color: colors.text, fontSize: 21, fontWeight: '900' },
  reason: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
