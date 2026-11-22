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
import { countWornByClothing, getSetting, setSetting } from '../data/database';
import { isIncomplete } from '../domain/completeness';

type Filter = 'all' | Category | 'recent' | 'summer' | 'winter' | 'incomplete';

interface Props {
  items: ClothingItem[];
  pendingDraft: ClothingDraft | null;
  pendingQueueCount: number;
  onAdd: (category?: Category) => void;
  onRecommend: () => void;
  onOpen: (item: ClothingItem) => void;
  onOutfitWith: (item: ClothingItem) => void;
  onDelete: (item: ClothingItem) => Promise<void>;
  onResumeDraft: () => void;
  onCancelDraft: () => Promise<void>;
  onSettings: () => void;
  onSignIn: () => Promise<void>;
  onFavorites: () => void;
  onHistory: () => void;
  onStats: () => void;
  onCalendar: () => void;
  onPacking: () => void;
  onAnalyzeIncomplete: (items: ClothingItem[], onProgress: (done: number, total: number) => void) => Promise<void>;
  analysisRemaining?: number;
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
  const [wearCounts, setWearCounts] = React.useState<Map<string, number>>(new Map());
  const [analysisProgress, setAnalysisProgress] = React.useState<{ done: number; total: number } | null>(null);
  const incompleteItems = React.useMemo(() => props.items.filter(isIncomplete), [props.items]);
  const incompleteIds = React.useMemo(() => new Set(incompleteItems.map((item) => item.id)), [incompleteItems]);
  // "Hide for now" remembers how many incomplete items there were; the banner returns only when
  // that number grows (e.g. a new item was saved without details).
  const [bannerHiddenAt, setBannerHiddenAt] = React.useState<number | null>(null);
  React.useEffect(() => {
    void getSetting('incomplete_banner_hidden_count').then((value) => {
      const parsed = value ? Number(value) : NaN;
      setBannerHiddenAt(Number.isFinite(parsed) ? parsed : null);
    });
  }, []);
  const showIncompleteBanner = incompleteItems.length > 0
    && (bannerHiddenAt === null || incompleteItems.length > bannerHiddenAt);
  const hideIncompleteBanner = () => {
    setBannerHiddenAt(incompleteItems.length);
    void setSetting('incomplete_banner_hidden_count', String(incompleteItems.length));
  };

  React.useEffect(() => {
    if (filter === 'incomplete' && incompleteItems.length === 0) setFilter('all');
  }, [filter, incompleteItems.length]);

  React.useEffect(() => {
    void (async () => setWearCounts(await countWornByClothing()))();
  }, [props.items.length]);
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
      || (filter === 'incomplete' && incompleteIds.has(item.id))
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

  const analyzeIncomplete = () => {
    if (analysisProgress) return;
    const count = props.analysisRemaining === undefined
      ? incompleteItems.length
      : Math.min(incompleteItems.length, props.analysisRemaining);
    Alert.alert(
      l('Eksikleri AI ile tamamla', 'Complete with AI'),
      count < incompleteItems.length
        ? l(
          `Kredin ${count} parçaya yetiyor; ${count} analiz kredisi kullanılacak. Kalanları elle doldurabilirsin. Girdiğin bilgiler değişmez, yalnızca boş alanlar doldurulur.`,
          `Your credits cover ${count} items; ${count} analysis credits will be used. Fill the rest manually. Your existing details stay; only empty fields are filled.`,
        )
        : l(
          `${count} parça fotoğrafından analiz edilecek ve ${count} analiz kredisi kullanılacak. Girdiğin bilgiler değişmez, yalnızca boş alanlar doldurulur.`,
          `${count} items will be analyzed from their photos, using ${count} analysis credits. Your existing details stay; only empty fields are filled.`,
        ),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: l('Analiz et', 'Analyze'),
          onPress: () => {
            setAnalysisProgress({ done: 0, total: count });
            void props.onAnalyzeIncomplete(incompleteItems, (done, total) => setAnalysisProgress({ done, total }))
              .finally(() => setAnalysisProgress(null));
          },
        },
      ],
    );
  };

  const fillManually = () => {
    const [first] = incompleteItems;
    if (incompleteItems.length === 1 && first) props.onOpen(first);
    else setFilter('incomplete');
  };

  const cancelPendingDraft = () => {
    void props.onCancelDraft().catch((error: unknown) => {
      Alert.alert(l('İptal edilemedi', 'Could not cancel'), error instanceof Error ? error.message : t('common.unknownError'));
    });
  };

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.topBar}>
        {props.account.user && analysisRemaining !== null && outfitRemaining !== null ? (
          <View style={styles.tokenPill}>
            <View style={styles.tokenSlot}>
              <Text style={styles.tokenSlotLabel}>{l('✦ Analiz', '✦ Analyze')}</Text>
              <Text style={styles.tokenSlotValue}>{analysisRemaining}</Text>
            </View>
            <View style={styles.tokenDivider} />
            <View style={styles.tokenSlot}>
              <Text style={styles.tokenSlotLabel}>{l('🪙 Kombin', '🪙 Outfit')}</Text>
              <Text style={styles.tokenSlotValue}>{outfitRemaining}</Text>
            </View>
          </View>
        ) : props.account.enabled && !props.account.user ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => void signIn()}
            style={({ pressed }) => [styles.signInPill, pressed && styles.pressed]}
          >
            <Text style={styles.tokenEyebrow}>{l('✦ AI ÖZELLİKLERİ', '✦ AI FEATURES')}</Text>
            <Text style={styles.tokenValue}>{t('home.signIn')}</Text>
          </Pressable>
        ) : <View style={styles.tokenPillSpacer} />}
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
        <View style={styles.actionsRow}>
          <ActionCard
            variant="primary"
            icon="sparkle"
            layout="stack"
            title={t('home.recommend')}
            hint={t('home.recommendHint')}
            onPress={props.onRecommend}
          />
          <ActionCard
            variant="secondary"
            icon="plus"
            layout="stack"
            title={t('home.add')}
            hint={t('home.addHint')}
            onPress={() => props.onAdd()}
          />
        </View>
      </View>

      {accountBusy ? null : null}

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

      <View style={styles.toolsRow}>
        <Pressable onPress={props.onStats} style={({ pressed }) => [styles.toolTile, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.toolEmoji}>📊</Text>
          <Text style={styles.toolLabel}>{l('İstatistik', 'Stats')}</Text>
        </Pressable>
        <Pressable onPress={props.onCalendar} style={({ pressed }) => [styles.toolTile, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.toolEmoji}>📅</Text>
          <Text style={styles.toolLabel}>{l('Takvim', 'Calendar')}</Text>
        </Pressable>
        <Pressable onPress={props.onPacking} style={({ pressed }) => [styles.toolTile, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.toolEmoji}>🧳</Text>
          <Text style={styles.toolLabel}>{l('Bavul', 'Packing')}</Text>
        </Pressable>
      </View>

      {showIncompleteBanner ? (
        <View accessibilityRole="alert" style={styles.incompleteCard}>
          <Text style={styles.incompleteTitle}>
            {l(`⚠ ${incompleteItems.length} parçada eksik bilgi var`, `⚠ ${incompleteItems.length} items are missing details`)}
          </Text>
          <Text style={styles.incompleteText}>
            {l(
              'Kalıp, kumaş, resmiyet veya mevsim gibi bilgiler eksik olduğunda kombin önerileri zayıflar. Eksikleri AI ile tamamlat ya da kendin doldur.',
              'Outfit suggestions get weaker when fit, fabric, formality or season is missing. Let AI complete them or fill them in yourself.',
            )}
          </Text>
          <View style={styles.incompleteActions}>
            <PrimaryButton
              title={analysisProgress
                ? l(`Analiz ediliyor ${analysisProgress.done}/${analysisProgress.total}`, `Analyzing ${analysisProgress.done}/${analysisProgress.total}`)
                : l('✦ AI ile analiz et', '✦ Analyze with AI')}
              onPress={analyzeIncomplete}
              loading={Boolean(analysisProgress)}
              style={styles.incompleteButton}
            />
            <SecondaryButton
              title={l('Elle doldur', 'Fill in manually')}
              onPress={fillManually}
              disabled={Boolean(analysisProgress)}
              style={styles.incompleteButton}
            />
          </View>
          <Pressable accessibilityRole="button" onPress={hideIncompleteBanner} hitSlop={6} disabled={Boolean(analysisProgress)}>
            <Text style={styles.incompleteHide}>
              {l('Şimdilik gizle (eksik parçalar "⚠ Eksik bilgili" filtresinde kalır)', 'Hide for now (incomplete items stay under the "⚠ Missing details" filter)')}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
        {incompleteItems.length > 0 ? (
          <Chip
            label={l(`⚠ Eksik bilgili (${incompleteItems.length})`, `⚠ Missing details (${incompleteItems.length})`)}
            selected={filter === 'incomplete'}
            onPress={() => setFilter('incomplete')}
          />
        ) : null}
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
            wears={wearCounts.get(item.id) ?? 0}
            incomplete={incompleteIds.has(item.id)}
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
        onOutfitWith={props.onOutfitWith}
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
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
  tokenPill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tokenPillSpacer: { flex: 1 },
  signInPill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    gap: 2,
  },
  tokenSlot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 0 },
  tokenSlotLabel: { color: colors.muted, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  tokenSlotValue: { color: colors.text, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  tokenDivider: { width: 1, height: 26, backgroundColor: colors.border },
  tokenEyebrow: { color: colors.muted, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  tokenValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
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
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
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
  toolsRow: { flexDirection: 'row', gap: spacing.sm },
  incompleteCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    gap: spacing.sm,
  },
  incompleteTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  incompleteText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  incompleteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  incompleteButton: { flexGrow: 1, flexBasis: 140 },
  incompleteHide: { color: colors.muted, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  toolTile: {
    flex: 1,
    minHeight: 68,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
  },
  toolEmoji: { fontSize: 22 },
  toolLabel: { color: colors.text, fontSize: 12, fontWeight: '800' },
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
