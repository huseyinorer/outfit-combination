import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ClothingForm } from '../components/ClothingForm';
import { ContentFrame, StickyFooter } from '../components/layout';
import { Chip, DangerButton, Field, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { detailLabels, fillMissingAttributes, missingDetails, missingRequiredFields, requiredLabels } from '../domain/completeness';
import { CATEGORIES, type Category, type ClothingAttributes, type ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';
import { countWornByClothing } from '../data/database';

export function EditClothingScreen({ item, onSave, onDelete, onAnalyze, onBack }: {
  item: ClothingItem;
  /** categoryChanged: the item moved to another category (outfits using it are cleaned up). */
  onSave: (item: ClothingItem, categoryChanged?: boolean) => Promise<void>;
  onDelete: (item: ClothingItem) => Promise<void>;
  /** Analyzes the saved photo with AI; resolves null when the user did not allow AI. */
  onAnalyze: (item: ClothingItem) => Promise<ClothingAttributes | null>;
  onBack: () => void;
}) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const { width } = useWindowDimensions();
  const [attributes, setAttributes] = useState<ClothingAttributes>({
    name: item.name,
    subType: item.subType,
    primaryColor: item.primaryColor,
    secondaryColors: item.secondaryColors,
    pattern: item.pattern,
    styleTags: item.styleTags,
    seasons: item.seasons,
    description: item.description,
    fit: item.fit ?? '',
    fabric: item.fabric ?? '',
    formality: item.formality ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<Category>(item.category);
  const categoryLabel = (value: Category) =>
    t(`category.${value}` as 'category.top' | 'category.bottom' | 'category.shoes' | 'category.hat' | 'category.accessory' | 'category.outerwear');
  const [priceText, setPriceText] = useState<string>(item.price != null ? String(item.price) : '');
  const [currency, setCurrency] = useState<string>(item.currency ?? (language === 'tr' ? 'TL' : 'USD'));
  const [wearCount, setWearCount] = useState<number>(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisNote, setAnalysisNote] = useState<string | null>(null);
  const missing = missingDetails({ ...attributes, category });
  const wide = width >= 900;

  const analyzeWithAi = async () => {
    if (analyzing || busy) return;
    setAnalyzing(true);
    setAnalysisNote(null);
    try {
      // Pass the current edits so they can be saved if the user has to sign in first.
      const analysis = await onAnalyze({
        ...item,
        ...attributes,
        category,
        price: parsedPrice,
        currency: parsedPrice != null ? currency.trim() || null : null,
      });
      if (!analysis) return;
      setAttributes((current) => fillMissingAttributes(current, analysis));
      setAnalysisNote(l(
        'Boş alanlar AI ile dolduruldu. Kontrol edip "Değişiklikleri kaydet"e dokun.',
        'Empty fields were filled by AI. Review them and tap "Save changes".',
      ));
    } catch (error) {
      Alert.alert(l('Analiz edilemedi', 'Could not analyze'), error instanceof Error ? error.message : t('common.unknownError'));
    } finally {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const counts = await countWornByClothing();
      setWearCount(counts.get(item.id) ?? 0);
    })();
  }, [item.id]);

  const parsedPrice = (() => {
    const cleaned = priceText.replace(',', '.').trim();
    if (!cleaned) return null;
    const value = Number(cleaned);
    return Number.isFinite(value) && value >= 0 ? value : null;
  })();
  const costPerWear = parsedPrice != null && wearCount > 0 ? parsedPrice / wearCount : null;

  const persist = async () => {
    setBusy(true);
    try {
      await onSave({
        ...item,
        ...attributes,
        category,
        price: parsedPrice,
        currency: parsedPrice != null ? currency.trim() || null : null,
        updatedAt: new Date().toISOString(),
      }, category !== item.category);
    } catch (error) {
      Alert.alert(l('Kaydedilemedi', 'Could not save'), error instanceof Error ? error.message : t('common.unknownError'));
      setBusy(false);
    }
  };

  const requiredMissing = missingRequiredFields(attributes);

  const save = async () => {
    if (busy || requiredMissing.length > 0) return;
    if (category === item.category) {
      await persist();
      return;
    }
    Alert.alert(
      l('Kategori değişiyor', 'Category changes'),
      l(
        `Bu parça "${categoryLabel(item.category)}" yerine "${categoryLabel(category)}" olarak kaydedilecek. Onu eski yerinde kullanan favori, geçmiş ve giydiğin kombinler kaldırılacak; ekstra olarak kullanıldığı kombinlerden yalnızca bu parça çıkarılacak.`,
        `This piece will be saved as "${categoryLabel(category)}" instead of "${categoryLabel(item.category)}". Favorite, history and worn outfits that used it in its old place will be removed; where it was an extra, only this piece is taken out.`,
      ),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: l('Değiştir ve kaydet', 'Change and save'), onPress: () => void persist() },
      ],
    );
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDelete(item);
    } catch (error) {
      Alert.alert(l('Silinemedi', 'Could not delete'), error instanceof Error ? error.message : t('common.unknownError'));
      setBusy(false);
    }
  };

  const confirmDelete = () => Alert.alert(
    l('Kıyafeti sil', 'Delete clothing'),
    l('Kayıt dolaptan kaldırılacak.', 'The item will be removed from your wardrobe.'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void remove() },
    ],
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader
        title={l('Kıyafeti düzenle', 'Edit clothing')}
        onBack={onBack}
        action={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={l('Kıyafeti sil', 'Delete clothing')}
            disabled={busy}
            hitSlop={10}
            onPress={confirmDelete}
            style={({ pressed }) => [styles.deleteAction, busy && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.deleteActionText}>{t('common.delete')}</Text>
          </Pressable>
        )}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ContentFrame maxWidth={1080} style={[styles.content, wide && styles.contentWide]}>
          <View style={styles.mediaColumn}>
            <Image source={{ uri: item.photoUri }} style={styles.image} resizeMode="contain" />
            <Text style={styles.photoNote}>{l('Kombinlerde bu kayıtla eşleşen gerçek fotoğraf kullanılır.', 'Outfits use the real photo linked to this record.')}</Text>
          </View>
          <View style={styles.formColumn}>
            {missing.length > 0 ? (
              <View accessibilityRole="alert" style={styles.missingCard}>
                <Text style={styles.missingTitle}>{l('⚠ Eksik bilgi var', '⚠ Missing details')}</Text>
                <Text style={styles.missingText}>
                  {l(
                    `Eksik: ${detailLabels(missing, 'tr')}. Bu bilgiler kombin önerilerini iyileştirir. AI ile tamamlatabilir ya da aşağıdaki alanları kendin doldurabilirsin.`,
                    `Missing: ${detailLabels(missing, 'en')}. These improve outfit suggestions. Let AI complete them or fill in the fields below yourself.`,
                  )}
                </Text>
                <SecondaryButton
                  title={analyzing ? l('Analiz ediliyor…', 'Analyzing…') : l('✦ AI ile analiz et', '✦ Analyze with AI')}
                  onPress={() => void analyzeWithAi()}
                  loading={analyzing}
                  disabled={busy}
                />
              </View>
            ) : null}
            {analysisNote ? <Text style={styles.analysisNote}>{analysisNote}</Text> : null}
            <View style={styles.categorySection}>
              <Text style={styles.categoryTitle}>{l('Kategori', 'Category')}</Text>
              <View style={styles.categoryChips}>
                {CATEGORIES.map((value) => (
                  <Chip key={value} label={categoryLabel(value)} selected={category === value} onPress={() => setCategory(value)} />
                ))}
              </View>
              {category !== item.category ? (
                <Text style={styles.categoryHint}>
                  {l(`"${categoryLabel(item.category)}" → "${categoryLabel(category)}" olarak değiştirilecek. Kaydetmeden önce onay istenir.`, `Will change from "${categoryLabel(item.category)}" to "${categoryLabel(category)}". You'll be asked to confirm.`)}
                </Text>
              ) : null}
            </View>
            {requiredMissing.length > 0 ? (
              <Text style={styles.requiredNote}>
                {l(`Kaydetmek için doldur: ${requiredLabels(requiredMissing, 'tr')}`, `To save, fill in: ${requiredLabels(requiredMissing, 'en')}`)}
              </Text>
            ) : null}
            <ClothingForm category={category} value={attributes} onChange={setAttributes} />
            <View style={styles.priceSection}>
              <Text style={styles.priceHeading}>{l('Fiyat ve giyim başı maliyet', 'Price and cost-per-wear')}</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceField}>
                  <Field
                    label={l('Fiyat (opsiyonel)', 'Price (optional)')}
                    value={priceText}
                    onChangeText={setPriceText}
                    placeholder={l('ör. 450', 'e.g. 45')}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.currencyField}>
                  <Field
                    label={l('Para', 'Currency')}
                    value={currency}
                    onChangeText={setCurrency}
                    placeholder="TL"
                  />
                </View>
              </View>
              <View style={styles.statRow}>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>{l('Toplam giyim', 'Total wears')}</Text>
                  <Text style={styles.statValue}>{wearCount}</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statLabel}>{l('Giyim başı', 'Per wear')}</Text>
                  <Text style={styles.statValue}>
                    {costPerWear != null
                      ? `${costPerWear.toFixed(2)} ${currency.trim() || (language === 'tr' ? 'TL' : 'USD')}`
                      : '—'}
                  </Text>
                </View>
              </View>
              {parsedPrice != null && wearCount === 0 ? (
                <Text style={styles.priceHint}>
                  {l('Henüz giyilmemiş. Kombinde "Bugün giydim" basıldıkça giyim başı maliyet düşer.', 'Not worn yet. Tap "Wore today" on an outfit and this will drop.')}
                </Text>
              ) : null}
            </View>
          </View>
        </ContentFrame>
      </ScrollView>
      <StickyFooter>
        <DangerButton title={t('common.delete')} onPress={confirmDelete} disabled={busy} style={styles.footerDelete} />
        <PrimaryButton title={l('Değişiklikleri kaydet', 'Save changes')} onPress={save} loading={busy} disabled={requiredMissing.length > 0} style={styles.footerSave} />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  content: { padding: spacing.md, gap: spacing.lg },
  contentWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mediaColumn: { flex: 0.9, minWidth: 280, gap: spacing.sm },
  formColumn: { flex: 1.1, minWidth: 280 },
  image: { width: '100%', height: 330, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  photoNote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  deleteAction: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  deleteActionText: { color: colors.danger, fontSize: 16, fontWeight: '800' },
  footerDelete: { flex: 0.35 },
  footerSave: { flex: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  requiredNote: { color: colors.danger, fontSize: 13, fontWeight: '800', marginBottom: spacing.sm },
  categorySection: { gap: spacing.sm, marginBottom: spacing.md },
  categoryTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  categoryHint: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  missingCard: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSoft,
    gap: spacing.sm,
  },
  missingTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  missingText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  analysisNote: { color: colors.primary, fontSize: 13, fontWeight: '700', marginBottom: spacing.md },
  priceSection: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  priceHeading: { color: colors.text, fontSize: 14, fontWeight: '900' },
  priceRow: { flexDirection: 'row', gap: spacing.sm },
  priceField: { flex: 2 },
  currencyField: { flex: 1 },
  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  statCell: { flex: 1, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 2 },
  priceHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
});
