import React from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { CATEGORIES, type Category, type ClothingDraft, type ClothingItem } from '../domain/types';
import { ClothingActionSheet } from '../components/ClothingActionSheet';
import { ClothingCard } from '../components/ClothingCard';
import { ActionCard } from '../components/ActionCard';
import { CategoryIcon } from '../components/CategoryIcon';
import { Chip, Notice, PrimaryButton, SecondaryButton } from '../components/ui';
import type { AccountState } from '../services/accountAuth';
import { colors, darkPalette, lightPalette, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

type Filter = 'all' | Category | 'recent' | 'summer' | 'winter';

interface Props {
  items: ClothingItem[];
  pendingDraft: ClothingDraft | null;
  pendingQueueCount: number;
  onAdd: (category?: Category) => void;
  onRecommend: () => void;
  onOpen: (item: ClothingItem) => void;
  onDelete: (item: ClothingItem) => Promise<void>;
  onResumeDraft: () => void;
  onCancelDraft: () => Promise<void>;
  onSettings: () => void;
  onSignIn: () => Promise<void>;
  onFavorites: () => void;
  onHistory: () => void;
  favoriteCount: number;
  account: AccountState;
  onRefresh?: () => Promise<void>;
}

export function HomeScreen(props: Props) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const { width } = useWindowDimensions();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [filter, setFilter] = React.useState<Filter>('all');
  const [search, setSearch] = React.useState('');
  const [menuItem, setMenuItem] = React.useState<ClothingItem | null>(null);
  const [accountBusy, setAccountBusy] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const refresh = React.useCallback(async () => {
    if (!props.onRefresh) return;
    setRefreshing(true);
    try { await props.onRefresh(); } finally { setRefreshing(false); }
  }, [props.onRefresh]);
  const normalizedSearch = search.trim().toLocaleLowerCase(language === 'tr' ? 'tr-TR' : 'en-US');
  const visible = props.items.filter((item) => {
    const filterMatches = filter === 'all'
      || (filter === 'recent' && Date.now() - Date.parse(item.createdAt) <= 30 * 24 * 60 * 60 * 1_000)
      || (filter === 'summer' && item.seasons.some((season) => /yaz|summer/i.test(season)))
      || (filter === 'winter' && item.seasons.some((season) => /kış|kis|winter/i.test(season)))
      || item.category === filter;
    if (!filterMatches) return false;
    if (!normalizedSearch) return true;
    return [item.name, item.subType, item.primaryColor, item.pattern, ...item.styleTags, ...item.seasons]
      .join(' ')
      .toLocaleLowerCase(language === 'tr' ? 'tr-TR' : 'en-US')
      .includes(normalizedSearch);
  });
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
    .map((part) => part[0]?.toLocaleUpperCase(language === 'tr' ? 'tr-TR' : 'en-US'))
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
      Alert.alert(l('Silinemedi', 'Could not delete'), error instanceof Error ? error.message : t('common.unknownError'));
    });
  };

  const cancelPendingDraft = () => {
    void props.onCancelDraft().catch((error: unknown) => {
      Alert.alert(l('İptal edilemedi', 'Could not cancel'), error instanceof Error ? error.message : t('common.unknownError'));
    });
  };

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>{t('home.eyebrow')}</Text>
          <Text style={styles.title}>Outfit Combination</Text>
        </View>
        <Pressable
          accessibilityLabel={t('home.profile')}
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
        <Text style={styles.prompt}>{t('home.prompt')}</Text>
        <ActionCard
          variant="primary"
          icon="sparkle"
          title={t('home.recommend')}
          hint={t('home.recommendHint')}
          onPress={props.onRecommend}
        />
        <ActionCard
          variant="secondary"
          icon="plus"
          title={t('home.add')}
          hint={t('home.addHint')}
          onPress={() => props.onAdd()}
        />
      </View>

      {props.account.enabled ? (
        props.account.user ? (
          <Pressable
            accessibilityRole="button"
            onPress={props.onSettings}
            style={({ pressed }) => [styles.accountCard, pressed && styles.pressed]}
          >
            <View style={styles.accountCopy}>
              <Text style={styles.accountEyebrow}>{t('home.account')}</Text>
              <Text numberOfLines={1} style={styles.accountTitle}>
                {t('home.hello', { name: props.account.user.displayName.split(/\s+/)[0] || props.account.user.displayName })}
              </Text>
              <Text style={styles.accountText}>
                {analysisRemaining !== null && outfitRemaining !== null
                  ? t('home.usage', { analysis: analysisRemaining, outfit: outfitRemaining })
                  : t('home.accountDetails')}
              </Text>
            </View>
            <Text style={styles.accountChevron}>›</Text>
          </Pressable>
        ) : (
          <View style={styles.signInCard}>
            <View style={styles.accountCopy}>
              <Text style={styles.accountEyebrow}>{l('✦ AI ÖZELLİKLERİ', '✦ AI FEATURES')}</Text>
              <Text style={styles.accountTitle}>{t('home.guestBannerTitle')}</Text>
              <Text style={styles.accountText}>{t('home.guestBannerText')}</Text>
            </View>
            <PrimaryButton title={t('home.signIn')} onPress={() => void signIn()} loading={accountBusy} />
          </View>
        )
      ) : null}

      {props.pendingDraft ? (
        <View style={styles.draftCard}>
          <Pressable onPress={props.onResumeDraft} style={({ pressed }) => [styles.draftCopy, pressed && styles.pressed]}>
            <Text style={styles.draftTitle}>{t('home.pending')}</Text>
            <Text style={styles.draftText}>
              {props.pendingQueueCount > 0 ? t('home.pendingQueue', { count: props.pendingQueueCount }) : t('home.pendingText')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.cancelPending')}
            hitSlop={6}
            onPress={cancelPendingDraft}
            style={({ pressed }) => [styles.cancelDraftButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelDraftText}>{t('home.cancelPending')}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.readiness, readyForOutfits ? styles.readinessReady : styles.readinessMissing]}>
        <View style={styles.readinessCounts}>
          <Text style={styles.readinessCount}>{t('category.top')} {counts.top}</Text>
          <Text style={styles.readinessCount}>{t('category.bottom')} {counts.bottom}</Text>
          <Text style={styles.readinessCount}>{t('category.shoes')} {counts.shoes}</Text>
        </View>
        <Text style={styles.readinessText}>
          {readyForOutfits ? t('home.ready') : t('home.missing')}
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('home.wardrobe')}</Text>
        <View style={styles.sectionMeta}>
          <Pressable onPress={props.onFavorites} hitSlop={8}>
            <Text style={styles.favoriteLink}>♡ {t('home.favorites', { count: props.favoriteCount })}</Text>
          </Pressable>
          <Pressable onPress={props.onHistory} hitSlop={8}>
            <Text style={styles.favoriteLink}>{l('◷ Tarihçe', '◷ History')}</Text>
          </Pressable>
          <Text style={styles.count}>{t('home.pieces', { count: props.items.length })}</Text>
        </View>
      </View>

      <View style={styles.filters}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={l('Renk, tür veya tarz ara', 'Search color, type, or style')}
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        <Chip label={t('common.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
        {CATEGORIES.map((category) => (
          <Chip
            key={category}
            label={t(`category.${category}` as 'category.top' | 'category.bottom' | 'category.shoes' | 'category.hat' | 'category.accessory' | 'category.outerwear')}
            selected={filter === category}
            onPress={() => setFilter(category)}
            leading={(selected) => (
              <CategoryIcon
                category={category}
                size={16}
                color={selected
                  ? (scheme === 'dark' ? darkPalette.onPrimary : lightPalette.onPrimary)
                  : (scheme === 'dark' ? darkPalette.primary : lightPalette.primary)}
              />
            )}
          />
        ))}
        <Chip label={l('Yeni eklenenler', 'Recently added')} selected={filter === 'recent'} onPress={() => setFilter('recent')} />
        <Chip label={l('Yaz', 'Summer')} selected={filter === 'summer'} onPress={() => setFilter('summer')} />
        <Chip label={l('Kış', 'Winter')} selected={filter === 'winter'} onPress={() => setFilter('winter')} />
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
        refreshing={refreshing}
        onRefresh={props.onRefresh ? refresh : undefined}
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
            <View style={styles.emptyIconRow}>
              {(['top', 'bottom', 'shoes', 'hat', 'accessory', 'outerwear'] as Category[]).map((category) => (
                <View key={category} style={styles.emptyIconBubble}>
                  <CategoryIcon
                    category={category}
                    size={22}
                    color={scheme === 'dark' ? darkPalette.primary : lightPalette.primary}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('home.emptyText')}</Text>
            <View style={styles.emptySteps}>
              <Text style={styles.emptyStep}>{l('1. Fotoğrafını çek', '1. Snap a photo')}</Text>
              <Text style={styles.emptyStep}>{l('2. AI parçayı tanısın', '2. Let AI tag the piece')}</Text>
              <Text style={styles.emptyStep}>{l('3. Kombinleri gör', '3. Get outfit ideas')}</Text>
            </View>
            <PrimaryButton title={t('home.firstItem')} onPress={() => props.onAdd()} />
          </View>
        ) : <Notice>{t('home.filterEmpty')}</Notice>}
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
    borderColor: colors.successBorder,
    padding: spacing.lg,
    backgroundColor: colors.primarySoft,
  },
  signInCard: {
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    padding: spacing.lg,
    backgroundColor: colors.warningSoft,
  },
  accountCopy: { flex: 1, gap: 5 },
  accountEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  accountTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  accountText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  accountChevron: { color: colors.primary, fontSize: 32, fontWeight: '500' },
  draftCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.warningSoft, padding: spacing.sm, gap: spacing.sm },
  draftCopy: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: spacing.xs, gap: 4 },
  draftTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  draftText: { color: colors.muted, fontSize: 13 },
  cancelDraftButton: { minWidth: 76, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: spacing.sm, backgroundColor: colors.dangerSoft },
  cancelDraftText: { color: colors.danger, fontSize: 13, fontWeight: '900' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  sectionMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  favoriteLink: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  sectionTitle: { color: colors.text, fontSize: 23, fontWeight: '900' },
  count: { color: colors.muted, fontSize: 13 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  searchInput: { width: '100%', minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surface, color: colors.text, fontSize: 15 },
  readiness: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  readinessReady: { backgroundColor: colors.primarySoft },
  readinessMissing: { backgroundColor: colors.warningSoft },
  readinessCounts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  readinessCount: { color: colors.text, fontSize: 14, fontWeight: '800' },
  readinessText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  empty: { borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
  emptyIcon: { color: colors.primary, fontSize: 48 },
  emptyIconRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  emptyIconBubble: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  emptySteps: { gap: 4, alignItems: 'flex-start' },
  emptyStep: { color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.1 },
});
