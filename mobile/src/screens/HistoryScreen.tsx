import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ContentFrame } from '../components/layout';
import { OutfitPreview } from '../components/OutfitPreview';
import { Notice, ScreenHeader } from '../components/ui';
import { listWornOutfits } from '../data/database';
import { resolveOutfitItems } from '../domain/outfitEngine';
import type { ClothingItem, WornOutfit } from '../domain/types';
import { useI18n } from '../locales';
import { colors, radius, spacing } from '../theme/theme';

export function HistoryScreen({ items, onBack }: { items: ClothingItem[]; onBack: () => void }) {
  const { language } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const [history, setHistory] = useState<WornOutfit[]>([]);

  useEffect(() => {
    void listWornOutfits().then(setHistory);
  }, []);

  return (
    <View style={styles.screen}>
      <ScreenHeader title={l('Giyim geçmişi', 'Wear history')} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ContentFrame maxWidth={900} style={styles.content}>
          {history.length === 0 ? <Notice>{l('Henüz “Bugün giydim” olarak işaretlediğin kombin yok.', 'You have not marked an outfit as “Wore today” yet.')}</Notice> : null}
          {history.map((entry) => {
            const resolved = resolveOutfitItems(items, entry);
            if (!resolved.top || !resolved.bottom || !resolved.shoes) return null;
            const date = new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(entry.wornAt));
            return (
              <View key={entry.id} style={styles.card}>
                <View style={styles.header}>
                  <Text style={styles.title}>{entry.title}</Text>
                  <Text style={styles.date}>{date}</Text>
                </View>
                <OutfitPreview top={resolved.top} bottom={resolved.bottom} shoes={resolved.shoes} />
                <Text style={styles.reason}>{entry.reason}</Text>
              </View>
            );
          })}
        </ContentFrame>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 48 },
  content: { padding: spacing.md, gap: spacing.md },
  card: { gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.surface },
  header: { gap: 4 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  date: { color: colors.muted, fontSize: 12 },
  reason: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
