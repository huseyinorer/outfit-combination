import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { ContentFrame } from '../components/layout';
import { Chip, Notice, PrimaryButton, ScreenHeader } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import { buildLocalSuggestions } from '../domain/outfitEngine';
import type { Category, ClothingItem, OutfitSuggestion } from '../domain/types';
import { matchesWeather, type WeatherSnapshot, type WeatherSeason } from '../services/weather';
import { colors, darkPalette, lightPalette, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

interface Props {
  items: ClothingItem[];
  onBack: () => void;
}

interface ManualDraft {
  topId: string | null;
  bottomId: string | null;
  shoeId: string | null;
  outerwearId: string | null;
  hatId: string | null;
  accessoryId: string | null;
}

const EMPTY_DRAFT: ManualDraft = { topId: null, bottomId: null, shoeId: null, outerwearId: null, hatId: null, accessoryId: null };
const DAY_OPTIONS = [2, 3, 5, 7, 10];
type Mode = 'auto' | 'manual';
type ManualSlot = 'top' | 'bottom' | 'shoes' | 'outerwear' | 'hat' | 'accessory';

export function PackingScreen({ items, onBack }: Props) {
  const { language } = useI18n();
  const l = (tr: string, en: string) => language === 'tr' ? tr : en;
  const scheme = useColorScheme();
  const iconColor = scheme === 'dark' ? darkPalette.primary : lightPalette.primary;
  const categoryLabel = (c: Category): string =>
    ({ top: l('Üst', 'Top'), bottom: l('Alt', 'Bottom'), shoes: l('Ayakkabı', 'Shoes'), hat: l('Şapka', 'Hat'), accessory: l('Aksesuar', 'Accessory'), outerwear: l('Mont', 'Jacket') }[c]);

  const [mode, setMode] = useState<Mode>('auto');
  const [days, setDays] = useState<number>(5);
  const [season, setSeason] = useState<WeatherSeason | 'auto'>('auto');
  const [autoPlan, setAutoPlan] = useState<OutfitSuggestion[] | null>(null);
  const [manualPlan, setManualPlan] = useState<OutfitSuggestion[]>([]);
  const [draft, setDraft] = useState<ManualDraft>(EMPTY_DRAFT);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (season === 'auto') return items;
    const pseudo: WeatherSnapshot = {
      temperatureC: season === 'summer' ? 28 : season === 'winter' ? 2 : season === 'autumn' ? 18 : 20,
      precipitationMm: 0, isRaining: false, season, locationLabel: null,
      fetchedAt: new Date().toISOString(),
    };
    return items.filter((item) => matchesWeather(item.seasons, pseudo));
  }, [items, season]);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const pools: Record<ManualSlot, ClothingItem[]> = useMemo(() => ({
    top: filtered.filter((item) => item.category === 'top'),
    bottom: filtered.filter((item) => item.category === 'bottom'),
    shoes: filtered.filter((item) => item.category === 'shoes'),
    outerwear: filtered.filter((item) => item.category === 'outerwear'),
    hat: filtered.filter((item) => item.category === 'hat'),
    accessory: filtered.filter((item) => item.category === 'accessory'),
  }), [filtered]);

  const generateAuto = () => {
    const suggestions = buildLocalSuggestions(filtered, { destination: 'Fark etmez', look: 'Fark etmez', tone: 'Fark etmez' });
    setAutoPlan(suggestions.slice(0, days));
    setChecked(new Set());
  };

  const activePlan: OutfitSuggestion[] = useMemo(() => {
    if (mode === 'manual') return manualPlan;
    return autoPlan ?? [];
  }, [mode, manualPlan, autoPlan]);

  const draftReady = draft.topId && draft.bottomId && draft.shoeId;

  const addManualOutfit = () => {
    if (!draft.topId || !draft.bottomId || !draft.shoeId) return;
    const top = byId.get(draft.topId);
    const bottom = byId.get(draft.bottomId);
    const shoes = byId.get(draft.shoeId);
    if (!top || !bottom || !shoes) return;
    const outfit: OutfitSuggestion = {
      title: [top.name, bottom.name].filter(Boolean).join(' & ') || l('Elle kombin', 'Manual outfit'),
      topId: draft.topId,
      bottomId: draft.bottomId,
      shoeId: draft.shoeId,
      hatId: draft.hatId ?? undefined,
      accessoryId: draft.accessoryId ?? undefined,
      outerwearId: draft.outerwearId ?? undefined,
      reason: l('Elle eklenen bir bavul kombini.', 'A manually added packing outfit.'),
      source: 'local',
    };
    setManualPlan((current) => [...current, outfit]);
    setDraft(EMPTY_DRAFT);
    setChecked(new Set());
  };

  const removeManualAt = (index: number) => {
    setManualPlan((current) => current.filter((_, i) => i !== index));
    setChecked(new Set());
  };

  const uniqueItems = useMemo(() => {
    const ids = new Set<string>();
    for (const outfit of activePlan) {
      ids.add(outfit.topId);
      ids.add(outfit.bottomId);
      ids.add(outfit.shoeId);
      if (outfit.hatId) ids.add(outfit.hatId);
      if (outfit.accessoryId) ids.add(outfit.accessoryId);
      if (outfit.outerwearId) ids.add(outfit.outerwearId);
    }
    const result: ClothingItem[] = [];
    for (const id of ids) {
      const item = byId.get(id);
      if (item) result.push(item);
    }
    return result;
  }, [activePlan, byId]);

  const groupedByCategory = useMemo(() => {
    const map: Record<Category, ClothingItem[]> = { top: [], bottom: [], shoes: [], hat: [], accessory: [], outerwear: [] };
    for (const item of uniqueItems) map[item.category].push(item);
    return map;
  }, [uniqueItems]);

  const toggle = (id: string) => setChecked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const setDraftSlot = (slot: ManualSlot, id: string | null) => {
    const key = `${slot}Id` as keyof ManualDraft;
    setDraft((current) => ({ ...current, [key]: id }));
  };

  const draftHasOuterwearNoTop = !!draft.outerwearId && !draft.topId;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={l('Bavul Modu', 'Packing Mode')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={820} style={styles.content}>
          <View style={styles.tabRow}>
            <Pressable
              onPress={() => setMode('auto')}
              style={[styles.tab, mode === 'auto' && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'auto' }}
            >
              <Text style={[styles.tabText, mode === 'auto' && styles.tabTextActive]}>
                {l('Otomatik', 'Automatic')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('manual')}
              style={[styles.tab, mode === 'manual' && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === 'manual' }}
            >
              <Text style={[styles.tabText, mode === 'manual' && styles.tabTextActive]}>
                {l('Elle Kur', 'Manual')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>{l('Hava tipi', 'Weather')}</Text>
            <View style={styles.chipRow}>
              <Chip label={l('Otomatik', 'Any')} selected={season === 'auto'} onPress={() => setSeason('auto')} />
              <Chip label={l('🌞 Yaz', '🌞 Summer')} selected={season === 'summer'} onPress={() => setSeason('summer')} />
              <Chip label={l('🍂 Sonbahar', '🍂 Autumn')} selected={season === 'autumn'} onPress={() => setSeason('autumn')} />
              <Chip label={l('❄️ Kış', '❄️ Winter')} selected={season === 'winter'} onPress={() => setSeason('winter')} />
              <Chip label={l('🌷 İlkbahar', '🌷 Spring')} selected={season === 'spring'} onPress={() => setSeason('spring')} />
            </View>
          </View>

          {mode === 'auto' ? (
            <>
              <Text style={styles.lead}>
                {l('Kaç günlük bir seyahat planlıyorsun? Dolabından bu güne yetecek kombin sepetini çıkaralım.', 'How many days are you traveling? We\'ll pick enough outfits from your wardrobe.')}
              </Text>
              <View style={styles.block}>
                <Text style={styles.blockTitle}>{l('Gün sayısı', 'Days')}</Text>
                <View style={styles.chipRow}>
                  {DAY_OPTIONS.map((d) => (
                    <Chip key={d} label={`${d} ${l('gün', 'days')}`} selected={days === d} onPress={() => setDays(d)} />
                  ))}
                </View>
              </View>
              <PrimaryButton title={l('Bavul listemi hazırla', 'Generate my packing list')} onPress={generateAuto} disabled={filtered.length === 0} />
              {filtered.length === 0 ? (
                <Notice tone="error">{l('Seçtiğin havaya uygun dolabında yeterli parça yok.', 'Not enough matching items in your wardrobe for this weather.')}</Notice>
              ) : null}
              {autoPlan && autoPlan.length < days ? (
                <Notice>
                  {l(`Dolabından ${autoPlan.length} benzersiz kombin çıktı; ${days} güne tam yetmiyor olabilir.`, `Your wardrobe produced ${autoPlan.length} unique outfits; may be short of ${days} days.`)}
                </Notice>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.lead}>
                {l('Her kombin için üst, alt ve ayakkabı seç. Monta altına bir üst eklemeyi unutma.', 'Pick a top, bottom and shoes for each outfit. Don\'t forget a layer under a jacket.')}
              </Text>

              {(['top', 'bottom', 'shoes', 'outerwear', 'hat', 'accessory'] as ManualSlot[]).map((slot) => {
                const pool = pools[slot];
                const slotId = draft[`${slot}Id` as keyof ManualDraft];
                const required = slot === 'top' || slot === 'bottom' || slot === 'shoes';
                if (pool.length === 0) return null;
                return (
                  <View key={slot} style={styles.block}>
                    <View style={styles.slotHeader}>
                      <CategoryIcon category={slot} size={18} color={iconColor} />
                      <Text style={styles.slotTitle}>
                        {categoryLabel(slot)}{required ? ' *' : ''}
                      </Text>
                      {slotId ? (
                        <Pressable onPress={() => setDraftSlot(slot, null)} hitSlop={8}>
                          <Text style={styles.clearLink}>{l('Temizle', 'Clear')}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                      {pool.map((item) => {
                        const selected = slotId === item.id;
                        return (
                          <Pressable
                            key={item.id}
                            onPress={() => setDraftSlot(slot, selected ? null : item.id)}
                            style={[styles.thumbCell, selected && styles.thumbCellSelected]}
                          >
                            <Image source={{ uri: item.thumbnailUri ?? item.photoUri }} style={styles.thumbImage} />
                            <Text numberOfLines={1} style={styles.thumbLabel}>
                              {item.name || item.subType || categoryLabel(item.category)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                );
              })}

              {draftHasOuterwearNoTop ? (
                <Notice tone="error">
                  {l('Mont seçtin ama altına bir üst seçmedin. Mont içi için üstten bir parça ekle.', 'You picked a jacket but no top underneath. Add a top to go under it.')}
                </Notice>
              ) : null}

              <PrimaryButton
                title={l('Bu kombini bavula ekle', 'Add this outfit to packing')}
                onPress={addManualOutfit}
                disabled={!draftReady}
              />

              {manualPlan.length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>
                    {l(`Elle eklenen kombinler · ${manualPlan.length}`, `Manual outfits · ${manualPlan.length}`)}
                  </Text>
                  {manualPlan.map((outfit, idx) => {
                    const top = byId.get(outfit.topId);
                    const bottom = byId.get(outfit.bottomId);
                    const shoes = byId.get(outfit.shoeId);
                    const outer = outfit.outerwearId ? byId.get(outfit.outerwearId) : null;
                    return (
                      <View key={`${outfit.topId}-${outfit.bottomId}-${idx}`} style={styles.manualOutfitRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.manualOutfitTitle}>
                            {l(`Kombin ${idx + 1}`, `Outfit ${idx + 1}`)}
                          </Text>
                          <Text style={styles.manualOutfitMeta}>
                            {[top?.name, bottom?.name, shoes?.name, outer ? `+ ${outer.name}` : null].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <Pressable onPress={() => removeManualAt(idx)} hitSlop={8}>
                          <Text style={styles.removeLink}>{l('Sil', 'Remove')}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </>
          )}

          {activePlan.length > 0 ? (
            <>
              <View style={styles.block}>
                <Text style={styles.blockTitle}>
                  {l(`Bavul checklist · ${uniqueItems.length} parça`, `Packing checklist · ${uniqueItems.length} items`)}
                </Text>
                <Text style={styles.sectionHint}>{l('Bavula koydukça işaretle; kalanları unutma.', 'Tick each item as you pack it.')}</Text>
                {(['top', 'bottom', 'shoes', 'outerwear', 'hat', 'accessory'] as Category[]).map((category) => {
                  const list = groupedByCategory[category];
                  if (list.length === 0) return null;
                  return (
                    <View key={category} style={styles.catBlock}>
                      <View style={styles.catHeader}>
                        <CategoryIcon category={category} size={18} color={iconColor} />
                        <Text style={styles.catTitle}>{categoryLabel(category)} · {list.length}</Text>
                      </View>
                      {list.map((item) => (
                        <Pressable
                          key={item.id}
                          onPress={() => toggle(item.id)}
                          style={styles.checkRow}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: checked.has(item.id) }}
                        >
                          <View style={[styles.checkbox, checked.has(item.id) && styles.checkboxOn]}>
                            {checked.has(item.id) ? <Text style={styles.checkboxTick}>✓</Text> : null}
                          </View>
                          <Text style={[styles.checkText, checked.has(item.id) && styles.checkTextDone]}>
                            {item.name || item.subType || categoryLabel(item.category)}
                            {item.primaryColor ? ` · ${item.primaryColor}` : ''}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })}
              </View>

              <View style={styles.block}>
                <Text style={styles.blockTitle}>{l('Günlük kombin planı', 'Daily outfit plan')}</Text>
                {activePlan.map((outfit, idx) => {
                  const top = byId.get(outfit.topId);
                  const bottom = byId.get(outfit.bottomId);
                  const shoes = byId.get(outfit.shoeId);
                  const outer = outfit.outerwearId ? byId.get(outfit.outerwearId) : null;
                  return (
                    <View key={`${outfit.topId}-${outfit.bottomId}-${outfit.shoeId}-${idx}`} style={styles.dayRow}>
                      <Text style={styles.dayNumber}>{l(`Gün ${idx + 1}`, `Day ${idx + 1}`)}</Text>
                      <Text style={styles.dayDesc}>
                        {[top?.name, bottom?.name, shoes?.name, outer ? `+ ${outer.name}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 48 },
  content: { padding: spacing.md, gap: spacing.md },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  tabTextActive: { color: colors.onPrimary, fontWeight: '900' },
  lead: { color: colors.text, fontSize: 15, lineHeight: 22 },
  block: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  blockTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  catBlock: { gap: 4, paddingTop: spacing.xs },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  catTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  checkbox: {
    width: 22, height: 22, borderRadius: 4,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxTick: { color: colors.onPrimary, fontSize: 14, fontWeight: '900' },
  checkText: { color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 },
  checkTextDone: { color: colors.muted, textDecorationLine: 'line-through' },
  dayRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'baseline', paddingVertical: 4 },
  dayNumber: { color: colors.primary, fontSize: 12, fontWeight: '900', minWidth: 54 },
  dayDesc: { color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 },
  slotHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  slotTitle: { color: colors.text, fontSize: 13, fontWeight: '900', flex: 1 },
  clearLink: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  thumbRow: { gap: spacing.sm, paddingVertical: 4 },
  thumbCell: {
    width: 92,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 4,
    gap: 2,
    backgroundColor: colors.surface,
  },
  thumbCellSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  thumbImage: { width: '100%', height: 92, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  thumbLabel: { color: colors.text, fontSize: 11, fontWeight: '700' },
  manualOutfitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  manualOutfitTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  manualOutfitMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  removeLink: { color: colors.danger, fontSize: 12, fontWeight: '800' },
});
