import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { ContentFrame } from '../components/layout';
import { Notice, ScreenHeader } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import type { Category, ClothingItem } from '../domain/types';
import { CATEGORIES } from '../domain/types';
import { countWornByClothing } from '../data/database';
import { colors, darkPalette, lightPalette, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

interface Props {
  items: ClothingItem[];
  onBack: () => void;
}

interface Totals {
  perCategory: Record<Category, number>;
  totalPieces: number;
  totalPrice: number;
  totalWears: number;
}

export function StatsScreen({ items, onBack }: Props) {
  const { language } = useI18n();
  const l = (tr: string, en: string) => language === 'tr' ? tr : en;
  const scheme = useColorScheme();
  const iconColor = scheme === 'dark' ? darkPalette.primary : lightPalette.primary;
  const categoryLabel = (c: Category) =>
    ({ top: l('Üst', 'Top'), bottom: l('Alt', 'Bottom'), shoes: l('Ayakkabı', 'Shoes'), hat: l('Şapka', 'Hat'), accessory: l('Aksesuar', 'Accessory'), outerwear: l('Mont', 'Jacket') }[c]);
  const [wears, setWears] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setWears(await countWornByClothing());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totals = useMemo<Totals>(() => {
    const perCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
    let totalPrice = 0;
    let totalWears = 0;
    for (const item of items) {
      perCategory[item.category] += 1;
      if (typeof item.price === 'number') totalPrice += item.price;
      totalWears += wears.get(item.id) ?? 0;
    }
    return { perCategory, totalPieces: items.length, totalPrice, totalWears };
  }, [items, wears]);

  const ranked = useMemo(() => {
    return [...items]
      .map((item) => ({ item, wears: wears.get(item.id) ?? 0 }))
      .sort((a, b) => b.wears - a.wears);
  }, [items, wears]);

  const mostWorn = ranked.filter((r) => r.wears > 0).slice(0, 5);
  const deadStock = ranked.filter((r) => r.wears === 0).slice(0, 5);

  const costPerWearLeaders = useMemo(() => {
    return items
      .filter((item) => typeof item.price === 'number' && item.price! > 0)
      .map((item) => {
        const w = wears.get(item.id) ?? 0;
        const perWear = w > 0 ? item.price! / w : null;
        return { item, wears: w, perWear };
      })
      .filter((r) => r.perWear != null)
      .sort((a, b) => (a.perWear! - b.perWear!))
      .slice(0, 5);
  }, [items, wears]);

  const colorDistribution = useMemo(() => {
    const bucket = new Map<string, number>();
    for (const item of items) {
      const color = (item.primaryColor || l('belirsiz', 'unspecified')).trim().toLocaleLowerCase(language === 'tr' ? 'tr-TR' : 'en-US');
      bucket.set(color, (bucket.get(color) ?? 0) + 1);
    }
    return [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items, language]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={l('Dolap İstatistikleri', 'Wardrobe Stats')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={960} style={styles.content}>
          {items.length === 0 ? (
            <Notice>{l('Dolabın boş. Önce birkaç parça ekle.', 'Your wardrobe is empty. Add some items first.')}</Notice>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>{l('Toplam parça', 'Total pieces')}</Text>
                  <Text style={styles.summaryValue}>{totals.totalPieces}</Text>
                </View>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>{l('Toplam giyim', 'Total wears')}</Text>
                  <Text style={styles.summaryValue}>{totals.totalWears}</Text>
                </View>
                {totals.totalPrice > 0 ? (
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{l('Dolap değeri', 'Wardrobe value')}</Text>
                    <Text style={styles.summaryValue}>{Math.round(totals.totalPrice)}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{l('Kategori dağılımı', 'Category breakdown')}</Text>
                <View style={styles.categoryGrid}>
                  {CATEGORIES.map((category) => (
                    <View key={category} style={styles.categoryCell}>
                      <CategoryIcon category={category} size={22} color={iconColor} />
                      <Text style={styles.categoryLabel}>{categoryLabel(category)}</Text>
                      <Text style={styles.categoryCount}>{totals.perCategory[category]}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {mostWorn.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{l('En çok giyilen 5', 'Most worn 5')}</Text>
                  {mostWorn.map((row) => (
                    <View key={row.item.id} style={styles.rankRow}>
                      <Text style={styles.rankName}>{row.item.name || row.item.subType || categoryLabel(row.item.category)}</Text>
                      <Text style={styles.rankValue}>{row.wears}×</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{l('Hiç giyilmemiş · Dead stock', 'Never worn · Dead stock')}</Text>
                {deadStock.length === 0 ? (
                  <Text style={styles.sectionHint}>{l('Her parça en az bir kez giyilmiş. Harika.', 'Every piece has been worn at least once. Nice.')}</Text>
                ) : (
                  <>
                    {deadStock.map((row) => (
                      <View key={row.item.id} style={styles.rankRow}>
                        <Text style={styles.rankName}>{row.item.name || row.item.subType || categoryLabel(row.item.category)}</Text>
                        <Text style={styles.rankValueMuted}>0×</Text>
                      </View>
                    ))}
                    <Text style={styles.sectionHint}>
                      {l('Bu parçaları önümüzdeki kombinde deneyebilirsin.', 'You could try these in the next outfit.')}
                    </Text>
                  </>
                )}
              </View>

              {costPerWearLeaders.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{l('En verimli 5 (giyim başı maliyet)', 'Top 5 cost-per-wear')}</Text>
                  {costPerWearLeaders.map((row) => (
                    <View key={row.item.id} style={styles.rankRow}>
                      <Text style={styles.rankName}>{row.item.name || row.item.subType || categoryLabel(row.item.category)}</Text>
                      <Text style={styles.rankValue}>
                        {row.perWear!.toFixed(2)} {row.item.currency || (language === 'tr' ? 'TL' : 'USD')}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{l('Renk dağılımı', 'Color distribution')}</Text>
                {colorDistribution.map(([color, count]) => (
                  <View key={color} style={styles.rankRow}>
                    <Text style={styles.rankName}>{color}</Text>
                    <Text style={styles.rankValue}>{count}</Text>
                  </View>
                ))}
              </View>

              {loading ? <Notice>{l('Yükleniyor…', 'Loading…')}</Notice> : null}
            </>
          )}
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 48 },
  content: { padding: spacing.md, gap: spacing.lg },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryCard: {
    flex: 1, minWidth: 96,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.primarySoft, gap: 2,
  },
  summaryLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  summaryValue: { color: colors.text, fontSize: 24, fontWeight: '900' },
  section: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  sectionHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCell: {
    flexBasis: '30%', flexGrow: 1,
    padding: spacing.sm, borderRadius: radius.sm,
    backgroundColor: colors.primarySoft, gap: 2,
    alignItems: 'center',
  },
  categoryLabel: { color: colors.text, fontSize: 12, fontWeight: '800' },
  categoryCount: { color: colors.text, fontSize: 20, fontWeight: '900' },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rankName: { color: colors.text, fontSize: 14, fontWeight: '700', flex: 1, paddingRight: spacing.sm },
  rankValue: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  rankValueMuted: { color: colors.muted, fontSize: 14, fontWeight: '900' },
});
