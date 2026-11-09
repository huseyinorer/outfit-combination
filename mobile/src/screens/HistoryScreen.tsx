import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContentFrame } from '../components/layout';
import { OutfitPreview } from '../components/OutfitPreview';
import { Notice, ScreenHeader } from '../components/ui';
import { listSuggestionHistory, listWornOutfits } from '../data/database';
import { resolveOutfitItems } from '../domain/outfitEngine';
import type {
  ClothingItem,
  OutfitPreferences,
  OutfitSuggestion,
  SuggestedOutfitHistoryEntry,
  WornOutfit,
} from '../domain/types';
import { useI18n } from '../locales';
import { colors, radius, spacing } from '../theme/theme';

interface Props {
  items: ClothingItem[];
  onBack: () => void;
  onOpenSuggestions: (suggestions: OutfitSuggestion[], preferences: OutfitPreferences) => void;
}

type Tab = 'suggested' | 'worn';

interface SuggestionBatch {
  id: string;
  suggestedAt: string;
  preferences: OutfitPreferences;
  entries: SuggestedOutfitHistoryEntry[];
}

export function HistoryScreen({ items, onBack, onOpenSuggestions }: Props) {
  const { language } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const [tab, setTab] = useState<Tab>('suggested');
  const [suggested, setSuggested] = useState<SuggestedOutfitHistoryEntry[]>([]);
  const [worn, setWorn] = useState<WornOutfit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void Promise.all([listSuggestionHistory(), listWornOutfits()])
      .then(([nextSuggested, nextWorn]) => {
        if (!mounted) return;
        setSuggested(nextSuggested);
        setWorn(nextWorn);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const batches = useMemo(() => {
    const grouped = new Map<string, SuggestionBatch>();
    for (const entry of suggested) {
      const resolved = resolveOutfitItems(items, entry);
      if (!resolved.top || !resolved.bottom || !resolved.shoes) continue;
      const existing = grouped.get(entry.batchId);
      if (existing) existing.entries.push(entry);
      else grouped.set(entry.batchId, {
        id: entry.batchId,
        suggestedAt: entry.suggestedAt,
        preferences: entry.preferences,
        entries: [entry],
      });
    }
    return [...grouped.values()];
  }, [items, suggested]);

  const locale = language === 'tr' ? 'tr-TR' : 'en-US';
  const dateLabel = (value: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));

  const preferenceTranslations: Record<string, [string, string]> = {
    'Fark etmez': ['Fark etmez', 'Any'], Any: ['Fark etmez', 'Any'],
    'Günlük': ['Günlük', 'Daily'], Daily: ['Günlük', 'Daily'],
    'İş/ofis': ['İş/ofis', 'Work/office'], 'Work/office': ['İş/ofis', 'Work/office'],
    'Arkadaş buluşması': ['Arkadaş buluşması', 'Meeting friends'], 'Meeting friends': ['Arkadaş buluşması', 'Meeting friends'],
    'Akşam yemeği': ['Akşam yemeği', 'Dinner'], Dinner: ['Akşam yemeği', 'Dinner'],
    'Özel gün': ['Özel gün', 'Special occasion'], 'Special occasion': ['Özel gün', 'Special occasion'],
    Spor: ['Spor', 'Sporty'], Sporty: ['Spor', 'Sporty'],
    Rahat: ['Rahat', 'Relaxed'], Relaxed: ['Rahat', 'Relaxed'],
    'Smart casual': ['Smart casual', 'Smart casual'],
    Klasik: ['Klasik', 'Classic'], Classic: ['Klasik', 'Classic'],
    Açık: ['Açık', 'Light'], Light: ['Açık', 'Light'],
    Koyu: ['Koyu', 'Dark'], Dark: ['Koyu', 'Dark'],
    Karışık: ['Karışık', 'Mixed'], Mixed: ['Karışık', 'Mixed'],
  };
  const localizedPreference = (value: string) => preferenceTranslations[value]?.[language === 'tr' ? 0 : 1] ?? value;
  const preferenceLabel = (preferences: OutfitPreferences) => [
    preferences.destination,
    preferences.look,
    preferences.tone,
  ].filter(Boolean).map(localizedPreference).join(' · ');

  const suggestionThumbnail = (entry: SuggestedOutfitHistoryEntry) => {
    const resolved = resolveOutfitItems(items, entry);
    if (!resolved.top || !resolved.bottom || !resolved.shoes) return null;
    return (
      <View key={entry.id} style={styles.outfitTile}>
        <View style={styles.photoRow}>
          {[resolved.top, resolved.bottom, resolved.shoes].map((piece) => (
            <Image
              key={piece.id}
              source={{ uri: piece.thumbnailUri ?? piece.photoUri }}
              resizeMode="contain"
              style={styles.photo}
            />
          ))}
        </View>
        <Text numberOfLines={1} style={styles.outfitTitle}>{entry.title}</Text>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={l('Kombin geçmişi', 'Outfit history')} onBack={onBack} />
      <View style={styles.tabs}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'suggested' }}
          onPress={() => setTab('suggested')}
          style={[styles.tab, tab === 'suggested' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'suggested' && styles.tabTextActive]}>
            {l('Önerilenler', 'Suggestions')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'worn' }}
          onPress={() => setTab('worn')}
          style={[styles.tab, tab === 'worn' && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === 'worn' && styles.tabTextActive]}>
            {l('Giydiklerim', 'Worn')}
          </Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={900} style={styles.content}>
          {loading ? <Notice>{l('Geçmişin hazırlanıyor…', 'Loading your history…')}</Notice> : null}

          {!loading && tab === 'suggested' && batches.length === 0 ? (
            <Notice>{l('Henüz kayıtlı kombin önerin yok. Oluşturduğun kombinler burada tarih sırasıyla görünecek.', 'You have no saved suggestions yet. New outfits will appear here in date order.')}</Notice>
          ) : null}

          {tab === 'suggested' ? batches.map((batch) => {
            const usedAi = batch.entries.some((entry) => entry.source === 'ai');
            return (
              <Pressable
                key={batch.id}
                accessibilityRole="button"
                accessibilityLabel={l('Bu önerileri yeniden aç', 'Open these suggestions again')}
                onPress={() => onOpenSuggestions(batch.entries, batch.preferences)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={styles.header}>
                  <View style={styles.headerCopy}>
                    <Text style={styles.date}>{dateLabel(batch.suggestedAt)}</Text>
                    <Text numberOfLines={2} style={styles.preferences}>{preferenceLabel(batch.preferences)}</Text>
                  </View>
                  <View style={styles.sourceBadge}>
                    <Text style={styles.sourceText}>{usedAi ? l('✦ AI destekli', '✦ AI-powered') : l('⚡ Hızlı', '⚡ Quick')}</Text>
                  </View>
                </View>
                <View style={styles.outfitGrid}>{batch.entries.map(suggestionThumbnail)}</View>
                <Text style={styles.openHint}>{l(`${batch.entries.length} kombini yeniden görüntüle →`, `View ${batch.entries.length} outfits again →`)}</Text>
              </Pressable>
            );
          }) : null}

          {!loading && tab === 'worn' && worn.length === 0 ? (
            <Notice>{l('Henüz “Bugün giydim” olarak işaretlediğin kombin yok.', 'You have not marked an outfit as “Wore today” yet.')}</Notice>
          ) : null}

          {tab === 'worn' ? worn.map((entry) => {
            const resolved = resolveOutfitItems(items, entry);
            if (!resolved.top || !resolved.bottom || !resolved.shoes) return null;
            return (
              <View key={entry.id} style={styles.card}>
                <View style={styles.headerCopy}>
                  <Text style={styles.title}>{entry.title}</Text>
                  <Text style={styles.date}>{dateLabel(entry.wornAt)}</Text>
                </View>
                <OutfitPreview
                  top={resolved.top}
                  bottom={resolved.bottom}
                  shoes={resolved.shoes}
                  hat={resolved.hat}
                  accessory={resolved.accessory}
                  outerwear={resolved.outerwear}
                />
                <Text style={styles.reason}>{entry.reason}</Text>
              </View>
            );
          }) : null}
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  tabs: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.background },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tabActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tabText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  tabTextActive: { color: colors.primary },
  scrollContent: { paddingBottom: 48 },
  content: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.surface },
  pressed: { opacity: 0.72 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerCopy: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  date: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  preferences: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  sourceBadge: { borderRadius: 99, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.primarySoft },
  sourceText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  outfitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  outfitTile: { flexGrow: 1, flexBasis: 180, maxWidth: 260, gap: spacing.xs, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.background },
  photoRow: { height: 88, flexDirection: 'row', gap: 4 },
  photo: { flex: 1, height: '100%', borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  outfitTitle: { color: colors.text, fontSize: 12, fontWeight: '800' },
  openHint: { color: colors.primary, fontSize: 13, fontWeight: '900', textAlign: 'right' },
  reason: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
