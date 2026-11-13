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
import { DangerButton, Field, PrimaryButton, ScreenHeader } from '../components/ui';
import type { ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';
import { countWornByClothing } from '../data/database';

export function EditClothingScreen({ item, onSave, onDelete, onBack }: {
  item: ClothingItem;
  onSave: (item: ClothingItem) => Promise<void>;
  onDelete: (item: ClothingItem) => Promise<void>;
  onBack: () => void;
}) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const { width } = useWindowDimensions();
  const [attributes, setAttributes] = useState({
    name: item.name,
    subType: item.subType,
    primaryColor: item.primaryColor,
    secondaryColors: item.secondaryColors,
    pattern: item.pattern,
    styleTags: item.styleTags,
    seasons: item.seasons,
    description: item.description,
  });
  const [busy, setBusy] = useState(false);
  const [priceText, setPriceText] = useState<string>(item.price != null ? String(item.price) : '');
  const [currency, setCurrency] = useState<string>(item.currency ?? (language === 'tr' ? 'TL' : 'USD'));
  const [wearCount, setWearCount] = useState<number>(0);
  const wide = width >= 900;

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

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({
        ...item,
        ...attributes,
        price: parsedPrice,
        currency: parsedPrice != null ? currency.trim() || null : null,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      Alert.alert(l('Kaydedilemedi', 'Could not save'), error instanceof Error ? error.message : t('common.unknownError'));
      setBusy(false);
    }
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
    l('Kayıt dolaptan kaldırılacak. Ana sayfadaki bildirimin ardından 8 saniye içinde geri alabilirsin.', 'The item will be removed. You can undo it from the home screen for 8 seconds.'),
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
            <ClothingForm value={attributes} onChange={setAttributes} />
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
        <PrimaryButton title={l('Değişiklikleri kaydet', 'Save changes')} onPress={save} loading={busy} style={styles.footerSave} />
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
