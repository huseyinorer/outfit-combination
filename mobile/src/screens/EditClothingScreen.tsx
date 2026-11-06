import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { ClothingForm } from '../components/ClothingForm';
import { DangerButton, PrimaryButton, ScreenHeader } from '../components/ui';
import type { ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';

export function EditClothingScreen({ item, onSave, onDelete, onBack }: {
  item: ClothingItem;
  onSave: (item: ClothingItem) => Promise<void>;
  onDelete: (item: ClothingItem) => Promise<void>;
  onBack: () => void;
}) {
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

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try { await onSave({ ...item, ...attributes, updatedAt: new Date().toISOString() }); }
    finally { setBusy(false); }
  };

  const confirmDelete = () => Alert.alert('Kıyafeti sil', 'Fotoğraf ve kayıt telefondan kalıcı olarak silinecek.', [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Sil', style: 'destructive', onPress: () => onDelete(item) },
  ]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Kıyafeti düzenle" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Image source={{ uri: item.photoUri }} style={styles.image} resizeMode="contain" />
        <ClothingForm value={attributes} onChange={setAttributes} />
        <PrimaryButton title="Değişiklikleri kaydet" onPress={save} loading={busy} />
        <DangerButton title="Kıyafeti sil" onPress={confirmDelete} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.md },
  image: { width: '100%', height: 290, borderRadius: radius.lg, backgroundColor: '#EDE8DE' },
});

