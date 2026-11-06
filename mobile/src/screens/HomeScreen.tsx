import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CATEGORY_LABELS, type Category, type ClothingDraft, type ClothingItem } from '../domain/types';
import { ClothingCard } from '../components/ClothingCard';
import { Chip, Notice, PrimaryButton, SecondaryButton } from '../components/ui';
import { colors, radius, spacing } from '../theme/theme';

type Filter = 'all' | Category;

interface Props {
  items: ClothingItem[];
  pendingDraft: ClothingDraft | null;
  demoMode: boolean;
  onAdd: (category?: Category) => void;
  onRecommend: () => void;
  onOpen: (item: ClothingItem) => void;
  onResumeDraft: () => void;
  onSettings: () => void;
}

export function HomeScreen(props: Props) {
  const [filter, setFilter] = React.useState<Filter>('all');
  const visible = filter === 'all' ? props.items : props.items.filter((x) => x.category === filter);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.eyebrow}>KİŞİSEL GARDIROP</Text>
          <Text style={styles.title}>Outfit Combination</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={props.onSettings} style={styles.settings}>
          <Text style={styles.settingsText}>Ayarlar</Text>
        </Pressable>
      </View>

      <View style={[styles.modeBadge, props.demoMode ? styles.demoBadge : styles.aiBadge]}>
        <Text style={styles.modeText}>{props.demoMode ? 'Demo modu · AI kapalı' : 'AI modu · Backend kullanılır'}</Text>
      </View>

      <View style={styles.actions}>
        <Text style={styles.prompt}>Bu akşam ne giysem?</Text>
        <PrimaryButton title="Kombin Öner" onPress={props.onRecommend} style={styles.actionButton} />
        <SecondaryButton title="Kıyafet Ekle" onPress={() => props.onAdd()} style={styles.actionButton} />
      </View>

      {props.pendingDraft ? (
        <Pressable onPress={props.onResumeDraft} style={styles.draftCard}>
          <Text style={styles.draftTitle}>Yarım kalan kıyafet</Text>
          <Text style={styles.draftText}>Fotoğrafın güvende. Düzenlemeye devam et →</Text>
        </Pressable>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Dolabım</Text>
        <Text style={styles.count}>{props.items.length} parça</Text>
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

      {props.items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>◇</Text>
          <Text style={styles.emptyTitle}>Dolabın henüz boş</Text>
          <Text style={styles.emptyText}>İlk parçanı ekle; fotoğrafın yalnızca telefonunda kalıcı olarak saklanır.</Text>
          <PrimaryButton title="İlk kıyafetimi ekle" onPress={() => props.onAdd()} />
        </View>
      ) : visible.length === 0 ? (
        <Notice>Bu filtrede henüz parça yok.</Notice>
      ) : (
        <View style={styles.grid}>
          {visible.map((item) => <ClothingCard key={item.id} item={item} onPress={() => props.onOpen(item)} />)}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.lg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900', marginTop: 3 },
  settings: { minHeight: 44, justifyContent: 'center', paddingLeft: spacing.md },
  settingsText: { color: colors.primary, fontWeight: '700' },
  modeBadge: { alignSelf: 'flex-start', borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12 },
  demoBadge: { backgroundColor: '#F3DFC9' },
  aiBadge: { backgroundColor: colors.primarySoft },
  modeText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  actions: { gap: spacing.sm },
  prompt: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 2 },
  actionButton: { width: '100%' },
  draftCard: { borderRadius: radius.md, backgroundColor: '#F4E5D4', padding: spacing.md, gap: 4 },
  draftTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  draftText: { color: colors.muted, fontSize: 13 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: -10 },
  sectionTitle: { color: colors.text, fontSize: 23, fontWeight: '900' },
  count: { color: colors.muted, fontSize: 13 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  empty: { borderRadius: radius.lg, backgroundColor: colors.surface, padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
  emptyIcon: { color: colors.primary, fontSize: 48 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});

