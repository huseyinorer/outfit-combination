import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CATEGORY_LABELS, type Category, type ClothingDraft, type ClothingItem } from '../domain/types';
import { ClothingCard } from '../components/ClothingCard';
import { Chip, Notice, PrimaryButton, SecondaryButton } from '../components/ui';
import { colors, radius, spacing } from '../theme/theme';

type Filter = 'all' | Category;

interface Props {
  items: ClothingItem[];
  pendingDraft: ClothingDraft | null;
  pendingQueueCount: number;
  demoMode: boolean;
  onAdd: (category?: Category) => void;
  onRecommend: () => void;
  onOpen: (item: ClothingItem) => void;
  onDelete: (item: ClothingItem) => Promise<void>;
  onResumeDraft: () => void;
  onSettings: () => void;
  onModePress: () => void;
  onFavorites: () => void;
  favoriteCount: number;
}

export function HomeScreen(props: Props) {
  const { width } = useWindowDimensions();
  const [filter, setFilter] = React.useState<Filter>('all');
  const visible = filter === 'all' ? props.items : props.items.filter((item) => item.category === filter);
  const contentWidth = Math.min(Math.max(width - spacing.md * 2, 280), 1120);
  const columns = contentWidth >= 1000 ? 4 : contentWidth >= 680 ? 3 : 2;
  const cardWidth = (contentWidth - 12 * (columns - 1)) / columns;
  const counts = {
    top: props.items.filter((item) => item.category === 'top').length,
    bottom: props.items.filter((item) => item.category === 'bottom').length,
    shoes: props.items.filter((item) => item.category === 'shoes').length,
  };
  const readyForOutfits = counts.top > 0 && counts.bottom > 0 && counts.shoes > 0;

  const openMenu = (item: ClothingItem) => Alert.alert(
    item.name || CATEGORY_LABELS[item.category],
    'Bu kıyafet için ne yapmak istiyorsun?',
    [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Düzenle', onPress: () => props.onOpen(item) },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => void props.onDelete(item).catch((error: unknown) => {
          Alert.alert('Silinemedi', error instanceof Error ? error.message : 'Bilinmeyen hata');
        }),
      },
    ],
  );

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>KİŞİSEL GARDIROP</Text>
          <Text style={styles.title}>Outfit Combination</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={props.onSettings} style={styles.settings}>
          <Text style={styles.settingsText}>Ayarlar</Text>
        </Pressable>
      </View>

      <Pressable onPress={props.onModePress} style={[styles.modeBadge, props.demoMode ? styles.demoBadge : styles.aiBadge]}>
        <Text style={styles.modeText}>{props.demoMode ? 'Demo modu · AI kapalı' : 'AI modu · Backend kullanılır'}</Text>
        <Text style={styles.modeHint}>Değiştirmek için dokun</Text>
      </Pressable>

      <View style={styles.actions}>
        <Text style={styles.prompt}>Bu akşam ne giysem?</Text>
        <PrimaryButton title="Kombin Öner" onPress={props.onRecommend} style={styles.actionButton} />
        <SecondaryButton title="Kıyafet Ekle" onPress={() => props.onAdd()} style={styles.actionButton} />
      </View>

      {props.pendingDraft ? (
        <Pressable onPress={props.onResumeDraft} style={styles.draftCard}>
          <Text style={styles.draftTitle}>Yarım kalan kıyafet</Text>
          <Text style={styles.draftText}>
            Fotoğrafın güvende{props.pendingQueueCount > 0 ? ` · Kuyrukta ${props.pendingQueueCount} fotoğraf daha var` : ''}. Devam et →
          </Text>
        </Pressable>
      ) : null}

      <View style={[styles.readiness, readyForOutfits ? styles.readinessReady : styles.readinessMissing]}>
        <View style={styles.readinessCounts}>
          <Text style={styles.readinessCount}>Üst {counts.top}</Text>
          <Text style={styles.readinessCount}>Alt {counts.bottom}</Text>
          <Text style={styles.readinessCount}>Ayakkabı {counts.shoes}</Text>
        </View>
        <Text style={styles.readinessText}>
          {readyForOutfits ? '✓ Kombin oluşturmaya hazır' : 'Kombin için her kategoriden en az bir parça ekle.'}
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Dolabım</Text>
        <View style={styles.sectionMeta}>
          <Pressable onPress={props.onFavorites} hitSlop={8}>
            <Text style={styles.favoriteLink}>Favoriler {props.favoriteCount}</Text>
          </Pressable>
          <Text style={styles.count}>{props.items.length} parça</Text>
        </View>
      </View>

      <View style={styles.filters}>
        <Chip label="Tümü" selected={filter === 'all'} onPress={() => setFilter('all')} />
        {(['top', 'bottom', 'shoes'] as Category[]).map((category) => (
          <Chip
            key={category}
            label={CATEGORY_LABELS[category]}
            selected={filter === category}
            onPress={() => setFilter(category)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        key={columns}
        data={visible}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ClothingCard
            item={item}
            width={cardWidth}
            onPress={() => props.onOpen(item)}
            onMenu={() => openMenu(item)}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={props.items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>◇</Text>
            <Text style={styles.emptyTitle}>Dolabın henüz boş</Text>
            <Text style={styles.emptyText}>İlk parçanı ekle; fotoğrafın telefonunun uygulama alanında saklanır.</Text>
            <PrimaryButton title="İlk kıyafetimi ekle" onPress={() => props.onAdd()} />
          </View>
        ) : <Notice>Bu filtrede henüz parça yok.</Notice>}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.listContent, { width: contentWidth }]}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  listContent: { alignSelf: 'center', paddingBottom: 48, gap: 12 },
  headerContent: { gap: spacing.lg, marginBottom: spacing.sm },
  gridRow: { gap: 12 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900', marginTop: 3 },
  settings: { minHeight: 44, justifyContent: 'center', paddingLeft: spacing.md },
  settingsText: { color: colors.primary, fontWeight: '700' },
  modeBadge: { alignSelf: 'flex-start', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12 },
  demoBadge: { backgroundColor: '#F3DFC9' },
  aiBadge: { backgroundColor: colors.primarySoft },
  modeText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  modeHint: { color: colors.muted, fontSize: 10, marginTop: 2 },
  actions: { gap: spacing.sm },
  prompt: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  actionButton: { width: '100%' },
  draftCard: { borderRadius: radius.md, backgroundColor: '#F4E5D4', padding: spacing.md, gap: 4 },
  draftTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  draftText: { color: colors.muted, fontSize: 13 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  favoriteLink: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 23, fontWeight: '900' },
  count: { color: colors.muted, fontSize: 13 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  readiness: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  readinessReady: { backgroundColor: colors.primarySoft },
  readinessMissing: { backgroundColor: '#F4E5D4' },
  readinessCounts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  readinessCount: { color: colors.text, fontSize: 14, fontWeight: '800' },
  readinessText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  empty: { borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
  emptyIcon: { color: colors.primary, fontSize: 48 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
