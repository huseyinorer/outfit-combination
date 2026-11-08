import React from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CATEGORY_LABELS, type Category, type ClothingDraft, type ClothingItem } from '../domain/types';
import { ClothingActionSheet } from '../components/ClothingActionSheet';
import { ClothingCard } from '../components/ClothingCard';
import { Chip, Notice, PrimaryButton, SecondaryButton } from '../components/ui';
import type { AccountState } from '../services/accountAuth';
import { colors, radius, spacing } from '../theme/theme';

type Filter = 'all' | Category;

interface Props {
  items: ClothingItem[];
  pendingDraft: ClothingDraft | null;
  pendingQueueCount: number;
  onAdd: (category?: Category) => void;
  onRecommend: () => void;
  onOpen: (item: ClothingItem) => void;
  onDelete: (item: ClothingItem) => Promise<void>;
  onResumeDraft: () => void;
  onSettings: () => void;
  onSignIn: () => Promise<void>;
  onFavorites: () => void;
  favoriteCount: number;
  account: AccountState;
}

export function HomeScreen(props: Props) {
  const { width } = useWindowDimensions();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [menuItem, setMenuItem] = React.useState<ClothingItem | null>(null);
  const [accountBusy, setAccountBusy] = React.useState(false);
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
  const analysisRemaining = props.account.usage
    ? Math.max(0, Math.min(
      props.account.usage.dailyAnalysisLimit - props.account.usage.dailyAnalysisUsed,
      props.account.usage.monthlyAnalysisLimit - props.account.usage.monthlyAnalysisUsed,
    ))
    : null;
  const outfitRemaining = props.account.usage
    ? Math.max(0, Math.min(
      props.account.usage.dailyOutfitLimit - props.account.usage.dailyOutfitUsed,
      props.account.usage.monthlyOutfitLimit - props.account.usage.monthlyOutfitUsed,
    ))
    : null;
  const initials = props.account.user?.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR'))
    .join('') || '';

  const signIn = async () => {
    setAccountBusy(true);
    try {
      await props.onSignIn();
    } finally {
      setAccountBusy(false);
    }
  };

  const deleteFromMenu = (item: ClothingItem) => {
    void props.onDelete(item).catch((error: unknown) => {
      Alert.alert('Silinemedi', error instanceof Error ? error.message : 'Bilinmeyen hata');
    });
  };

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>KİŞİSEL GARDIROP</Text>
          <Text style={styles.title}>Outfit Combination</Text>
        </View>
        <Pressable
          accessibilityLabel="Profil ve ayarlar"
          accessibilityRole="button"
          hitSlop={8}
          onPress={props.onSettings}
          style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
        >
          {props.account.user?.pictureUrl ? (
            <Image source={{ uri: props.account.user.pictureUrl }} style={styles.profileImage} />
          ) : initials ? (
            <Text style={styles.profileInitials}>{initials}</Text>
          ) : (
            <View style={styles.profileGlyph}>
              <View style={styles.profileHead} />
              <View style={styles.profileBody} />
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Text style={styles.prompt}>Bu akşam ne giysem?</Text>
        <PrimaryButton title="Kombin Öner" onPress={props.onRecommend} style={styles.actionButton} />
        <SecondaryButton title="Kıyafet Ekle" onPress={() => props.onAdd()} style={styles.actionButton} />
      </View>

      {props.account.enabled ? (
        props.account.user ? (
          <Pressable
            accessibilityRole="button"
            onPress={props.onSettings}
            style={({ pressed }) => [styles.accountCard, pressed && styles.pressed]}
          >
            <View style={styles.accountCopy}>
              <Text style={styles.accountEyebrow}>HESABIN</Text>
              <Text numberOfLines={1} style={styles.accountTitle}>
                Merhaba, {props.account.user.displayName.split(/\s+/)[0] || props.account.user.displayName}
              </Text>
              <Text style={styles.accountText}>
                {analysisRemaining !== null && outfitRemaining !== null
                  ? `Fotoğraf tanıma ${analysisRemaining} · Kombin önerisi ${outfitRemaining} hak`
                  : 'Hesap ve kullanım ayrıntılarını görüntüle'}
              </Text>
            </View>
            <Text style={styles.accountChevron}>›</Text>
          </Pressable>
        ) : (
          <View style={styles.signInCard}>
            <View style={styles.accountCopy}>
              <Text style={styles.accountEyebrow}>AKILLI ÖZELLİKLER</Text>
              <Text style={styles.accountTitle}>Kullanım haklarını hesabında koru</Text>
              <Text style={styles.accountText}>
                Kıyafetlerini otomatik tanıtmak ve kişisel kombin önerileri almak için Google ile devam et.
                Dolabın bu cihazda kalır.
              </Text>
            </View>
            <PrimaryButton title="Google ile devam et" onPress={() => void signIn()} loading={accountBusy} />
          </View>
        )
      ) : null}

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
            onMenu={() => setMenuItem(item)}
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
      <ClothingActionSheet
        item={menuItem}
        onClose={() => setMenuItem(null)}
        onEdit={props.onOpen}
        onDelete={deleteFromMenu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  listContent: { alignSelf: 'center', paddingBottom: 48, gap: 12 },
  headerContent: { gap: spacing.lg, marginBottom: spacing.sm },
  gridRow: { gap: 12 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900', marginTop: 3 },
  profileButton: {
    width: 48,
    height: 48,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  profileImage: { width: '100%', height: '100%' },
  profileInitials: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  profileGlyph: { width: 24, height: 25, alignItems: 'center', justifyContent: 'flex-end' },
  profileHead: { position: 'absolute', top: 1, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  profileBody: { width: 20, height: 11, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: colors.primary },
  pressed: { opacity: 0.72 },
  actions: { gap: spacing.sm },
  prompt: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  actionButton: { width: '100%' },
  accountCard: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#BFD2C5',
    padding: spacing.lg,
    backgroundColor: colors.primarySoft,
  },
  signInCard: {
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#D8C3A8',
    padding: spacing.lg,
    backgroundColor: '#F4E9DA',
  },
  accountCopy: { flex: 1, gap: 5 },
  accountEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  accountTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  accountText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  accountChevron: { color: colors.primary, fontSize: 32, fontWeight: '500' },
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
