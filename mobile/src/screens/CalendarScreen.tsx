import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContentFrame } from '../components/layout';
import { Notice, ScreenHeader } from '../components/ui';
import type { ClothingItem, WornOutfit } from '../domain/types';
import { listWornOutfits } from '../data/database';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

interface Props {
  items: ClothingItem[];
  onBack: () => void;
}

const dayMs = 24 * 60 * 60 * 1000;

function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  return d;
}

function monthLabel(date: Date, language: string): string {
  const names = language === 'tr'
    ? ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[date.getMonth()]} ${date.getFullYear()}`;
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function CalendarScreen({ items, onBack }: Props) {
  const { language } = useI18n();
  const l = (tr: string, en: string) => language === 'tr' ? tr : en;
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [worn, setWorn] = useState<WornOutfit[]>([]);
  const [selected, setSelected] = useState<string | null>(dayKey(new Date()));

  useEffect(() => {
    void (async () => setWorn(await listWornOutfits(200)))();
  }, []);

  const wornByDay = useMemo(() => {
    const map = new Map<string, WornOutfit[]>();
    for (const outfit of worn) {
      const key = dayKey(new Date(outfit.wornAt));
      const list = map.get(key) ?? [];
      list.push(outfit);
      map.set(key, list);
    }
    return map;
  }, [worn]);

  const byItemId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const grid = useMemo(() => {
    const firstDow = (monthStart.getDay() + 6) % 7;
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const cells: Array<{ key: string; date: Date } | null> = [];
    for (let i = 0; i < firstDow; i += 1) cells.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), d);
      cells.push({ key: dayKey(date), date });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthStart]);

  const weekdays = language === 'tr'
    ? ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']
    : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  const todayKey = dayKey(new Date());
  const selectedWorn = selected ? wornByDay.get(selected) ?? [] : [];

  const describe = (outfit: WornOutfit): string => {
    const top = byItemId.get(outfit.topId)?.name;
    const bottom = byItemId.get(outfit.bottomId)?.name;
    const shoes = byItemId.get(outfit.shoeId)?.name;
    return [top, bottom, shoes].filter(Boolean).join(' · ') || outfit.title;
  };

  const now = Date.now();
  const totalWornThisMonth = [...wornByDay.entries()]
    .filter(([key]) => key.startsWith(dayKey(monthStart).slice(0, 7)))
    .reduce((n, [, list]) => n + list.length, 0);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={l('Kombin Takvimi', 'Outfit Calendar')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={720} style={styles.content}>
          <View style={styles.header}>
            <Pressable onPress={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))} hitSlop={8} accessibilityRole="button">
              <Text style={styles.navArrow}>‹</Text>
            </Pressable>
            <Text style={styles.monthText}>{monthLabel(monthStart, language)}</Text>
            <Pressable onPress={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))} hitSlop={8} accessibilityRole="button">
              <Text style={styles.navArrow}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
          </View>

          <View style={styles.grid}>
            {grid.map((cell, idx) => {
              if (!cell) return <View key={`empty-${idx}`} style={styles.cellEmpty} />;
              const hasWorn = (wornByDay.get(cell.key)?.length ?? 0) > 0;
              const isToday = cell.key === todayKey;
              const isSelected = cell.key === selected;
              const isFuture = cell.date.getTime() > now + dayMs;
              return (
                <Pressable
                  key={cell.key}
                  onPress={() => setSelected(cell.key)}
                  style={[
                    styles.cell,
                    isToday && styles.cellToday,
                    isSelected && styles.cellSelected,
                    isFuture && styles.cellFuture,
                  ]}
                >
                  <Text style={[styles.cellText, isSelected && styles.cellTextSelected]}>{cell.date.getDate()}</Text>
                  {hasWorn ? <View style={styles.cellDot} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>{l('Bu ay giyilen kombin', 'Outfits worn this month')}</Text>
            <Text style={styles.summaryValue}>{totalWornThisMonth}</Text>
          </View>

          {selected ? (
            <View style={styles.detail}>
              <Text style={styles.detailTitle}>{selected}</Text>
              {selectedWorn.length === 0 ? (
                <Notice>
                  {l('Bu günde kayıtlı giyim yok. Kombinde "Bugün giydim" basarak ekleyebilirsin.', 'No worn outfit recorded. Use "Wore today" on an outfit to log one.')}
                </Notice>
              ) : (
                selectedWorn.map((outfit, idx) => (
                  <View key={outfit.id ?? idx} style={styles.outfitRow}>
                    <Text style={styles.outfitTitle}>{outfit.title}</Text>
                    <Text style={styles.outfitMeta}>{describe(outfit)}</Text>
                  </View>
                ))
              )}
            </View>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navArrow: { color: colors.primary, fontSize: 28, fontWeight: '900', width: 44, textAlign: 'center' },
  monthText: { color: colors.text, fontSize: 18, fontWeight: '900' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekday: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  cellEmpty: { width: `${100 / 7}%`, aspectRatio: 1 },
  cellToday: { backgroundColor: colors.primarySoft, borderRadius: radius.sm },
  cellSelected: { backgroundColor: colors.primary, borderRadius: radius.sm },
  cellFuture: { opacity: 0.6 },
  cellText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  cellTextSelected: { color: colors.onPrimary, fontWeight: '900' },
  cellDot: { position: 'absolute', bottom: 4, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  summary: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  summaryLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  summaryValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  detail: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  detailTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  outfitRow: { gap: 2, paddingVertical: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  outfitTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  outfitMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
