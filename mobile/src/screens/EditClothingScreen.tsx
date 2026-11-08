import { useState } from 'react';
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
import { DangerButton, PrimaryButton, ScreenHeader } from '../components/ui';
import type { ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

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
  const wide = width >= 900;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({ ...item, ...attributes, updatedAt: new Date().toISOString() });
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
  image: { width: '100%', height: 330, borderRadius: radius.lg, backgroundColor: '#EDE8DE' },
  photoNote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  deleteAction: { minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  deleteActionText: { color: colors.danger, fontSize: 16, fontWeight: '800' },
  footerDelete: { flex: 0.35 },
  footerSave: { flex: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
