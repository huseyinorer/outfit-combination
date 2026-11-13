import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
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

const DAY_OPTIONS = [2, 3, 5, 7, 10];

export function PackingScreen({ items, onBack }: Props) {
  const { language } = useI18n();
  const l = (tr: string, en: string) => language === 'tr' ? tr : en;
  const scheme = useColorScheme();
  const iconColor = scheme === 'dark' ? darkPalette.primary : lightPalette.primary;
  const categoryLabel = (c: Category): string =>
    ({ top: l('Üst', 'Top'), bottom: l('Alt', 'Bottom'), shoes: l('Ayakkabı', 'Shoes'), hat: l('Şapka', 'Hat'), accessory: l('Aksesuar', 'Accessory'), outerwear: l('Mont', 'Jacket') }[c]);
  const [days, setDays] = useState<number>(5);
  const [season, setSeason] = useState<WeatherSeason | 'auto'>('auto');
  const [plan, setPlan] = useState<OutfitSuggestion[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (season === 'auto') return items;
    const pseudo: WeatherSnapshot = {
      temperatureC: season === 'summer' ? 28 : season === 'winter' ? 2 : season === 'autumn' ? 18 : 20,
      precipitationMm: 0,
      isRaining: false,
      season,
      locationLabel: null,
      fetchedAt: new Date().toISOString(),
    };
    return items.filter((item) => matchesWeather(item.seasons, pseudo));
  }, [items, season]);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const generate = () => {
    const suggestions = buildLocalSuggestions(filtered, { destination: 'Fark etmez', look: 'Fark etmez', tone: 'Fark etmez' });
    setPlan(suggestions.slice(0, days));
    setChecked(new Set());
  };

  const uniqueItems = useMemo(() => {
    if (!plan) return [] as ClothingItem[];
    const ids = new Set<string>();
    for (const outfit of plan) {
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
  }, [plan, byId]);

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

  return (
    <View style={styles.screen}>
      <ScreenHeader title={l('Bavul Modu', 'Packing Mode')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={820} style={styles.content}>
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

          <PrimaryButton title={l('Bavul listemi hazırla', 'Generate my packing list')} onPress={generate} disabled={filtered.length === 0} />

          {filtered.length === 0 ? (
            <Notice tone="error">{l('Seçtiğin havaya uygun dolabında yeterli parça yok.', 'Not enough matching items in your wardrobe for this weather.')}</Notice>
          ) : null}

          {plan ? (
            plan.length < days ? (
              <Notice>
                {l(`Dolabından ${plan.length} benzersiz kombin çıktı; ${days} güne tam yetmiyor olabilir.`, `Your wardrobe produced ${plan.length} unique outfits; may be short of ${days} days.`)}
              </Notice>
            ) : null
          ) : null}

          {plan && plan.length > 0 ? (
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
                {plan.map((outfit, idx) => {
                  const top = byId.get(outfit.topId);
                  const bottom = byId.get(outfit.bottomId);
                  const shoes = byId.get(outfit.shoeId);
                  return (
                    <View key={`${outfit.topId}-${outfit.bottomId}-${outfit.shoeId}-${idx}`} style={styles.dayRow}>
                      <Text style={styles.dayNumber}>{l(`Gün ${idx + 1}`, `Day ${idx + 1}`)}</Text>
                      <Text style={styles.dayDesc}>
                        {[top?.name, bottom?.name, shoes?.name].filter(Boolean).join(' · ')}
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
});
