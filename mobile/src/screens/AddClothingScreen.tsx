import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { ClothingForm } from '../components/ClothingForm';
import { Chip, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  EMPTY_ATTRIBUTES,
  type Category,
  type ClothingDraft,
  type ClothingItem,
} from '../domain/types';
import { analyzeClothing } from '../services/api';
import { deleteStoredImage, finalizeImage, prepareSelectedImage } from '../services/imageStorage';
import { colors, radius, spacing } from '../theme/theme';

const guidance: Record<Category, string> = {
  top: 'Düz zemine ser, önden çek ve parçanın tamamını kadraja al.',
  bottom: 'Belden paçaya kadar tamamı görünsün; düz zeminde önden çek.',
  shoes: 'Ayakkabı çiftini yan yana koy; şekli ve rengi net görünsün.',
};

interface Props {
  apiUrl: string;
  demoMode: boolean;
  initialCategory?: Category;
  initialDraft: ClothingDraft | null;
  onPersistDraft: (draft: ClothingDraft | null) => Promise<void>;
  onSave: (item: ClothingItem) => Promise<void>;
  onBack: () => void;
}

export function AddClothingScreen(props: Props) {
  const [draft, setDraft] = useState<ClothingDraft | null>(props.initialDraft);
  const [category, setCategory] = useState<Category | null>(props.initialDraft?.category ?? props.initialCategory ?? null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [manualMode, setManualMode] = useState(props.demoMode || Boolean(props.initialDraft?.analysisError));
  const savingRef = useRef(false);
  const hasPhoto = Boolean(draft?.photoUri);

  const stepTitle = useMemo(() => {
    if (!category) return 'Kategori seç';
    if (!hasPhoto) return `${CATEGORY_LABELS[category]} fotoğrafı`;
    return 'Kontrol et ve kaydet';
  }, [category, hasPhoto]);

  const persist = async (next: ClothingDraft) => {
    setDraft(next);
    await props.onPersistDraft(next);
  };

  const runAnalysis = async (current: ClothingDraft) => {
    if (props.demoMode) {
      const next = { ...current, analysisError: 'Demo modunda görsel analizi yapılmaz. Alanları elle tamamla.' };
      setManualMode(true);
      await persist(next);
      return;
    }
    setAnalyzing(true);
    try {
      const result = await analyzeClothing(props.apiUrl, current.category, current.photoUri);
      await persist({
        ...current,
        attributes: {
          name: result.name ?? '',
          subType: result.subType ?? '',
          primaryColor: result.primaryColor ?? '',
          secondaryColors: result.secondaryColors ?? [],
          pattern: result.pattern ?? '',
          styleTags: result.styleTags ?? [],
          seasons: result.seasons ?? [],
          description: result.description ?? '',
        },
        categoryConflict: result.categoryConflict,
        detectedCategory: result.detectedCategory,
        analysisError: null,
      });
      setManualMode(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analiz servisine ulaşılamadı.';
      await persist({ ...current, analysisError: message });
      setManualMode(true);
    } finally {
      setAnalyzing(false);
    }
  };

  const acceptAsset = async (uri: string) => {
    if (!category) return;
    setBusy(true);
    try {
      const id = draft?.id ?? Crypto.randomUUID();
      const photoUri = await prepareSelectedImage(uri, id);
      const next: ClothingDraft = {
        id,
        category,
        photoUri,
        attributes: { ...EMPTY_ATTRIBUTES },
        categoryConflict: false,
        detectedCategory: null,
        analysisError: null,
      };
      await persist(next);
      await runAnalysis(next);
    } catch (error) {
      Alert.alert('Fotoğraf hazırlanamadı', error instanceof Error ? error.message : 'Bilinmeyen hata');
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Galeri izni gerekli', 'Fotoğraf seçebilmek için galeri izni vermelisin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled && result.assets[0]) await acceptAsset(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Kamera izni gerekli', 'Fotoğraf çekebilmek için kamera izni vermelisin.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, cameraType: ImagePicker.CameraType.back });
    if (!result.canceled && result.assets[0]) await acceptAsset(result.assets[0].uri);
  };

  const save = async () => {
    if (!draft || savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    try {
      const photoUri = await finalizeImage(draft.photoUri, draft.id);
      const now = new Date().toISOString();
      await props.onSave({
        id: draft.id,
        category: draft.category,
        ...draft.attributes,
        photoUri,
        cutoutUri: null,
        createdAt: now,
        updatedAt: now,
      });
      deleteStoredImage(draft.photoUri);
      await props.onPersistDraft(null);
    } catch (error) {
      Alert.alert('Kaydedilemedi', error instanceof Error ? error.message : 'Bilinmeyen hata');
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={stepTitle} onBack={props.onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!category ? (
          <>
            <Text style={styles.heading}>Ne ekliyorsun?</Text>
            <Text style={styles.subheading}>Önce ana kategoriyi seç.</Text>
            <View style={styles.categoryList}>
              {CATEGORIES.map((value) => (
                <PrimaryButton key={value} title={CATEGORY_LABELS[value]} onPress={() => setCategory(value)} />
              ))}
            </View>
          </>
        ) : !hasPhoto ? (
          <>
            <View style={styles.selectedCategory}>
              <Text style={styles.selectedCategoryText}>{CATEGORY_LABELS[category]}</Text>
              <Chip label="Değiştir" selected={false} onPress={() => setCategory(null)} />
            </View>
            <View style={styles.guideCard}>
              <Text style={styles.guideTitle}>Daha iyi sonuç için</Text>
              <Text style={styles.guideText}>{guidance[category]}</Text>
            </View>
            <PrimaryButton title="Kamerayla çek" onPress={takePhoto} disabled={busy} />
            <SecondaryButton title="Galeriden seç" onPress={pickFromLibrary} disabled={busy} />
            {busy ? <ActivityIndicator color={colors.primary} /> : null}
          </>
        ) : draft ? (
          <>
            <Image source={{ uri: draft.photoUri }} style={styles.preview} resizeMode="contain" />
            {analyzing ? (
              <View style={styles.analysisBox}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.analysisText}>Fotoğraf bir kez analiz ediliyor…</Text>
              </View>
            ) : null}
            {draft.categoryConflict ? (
              <Notice tone="error">
                Model bu parçayı {draft.detectedCategory ? CATEGORY_LABELS[draft.detectedCategory] : 'farklı bir kategori'} olarak algıladı. Seçtiğin kategoriyi kontrol et.
              </Notice>
            ) : null}
            {draft.analysisError ? <Notice tone="error">{draft.analysisError}</Notice> : null}
            {draft.analysisError && !props.demoMode ? (
              <View style={styles.row}>
                <SecondaryButton title="Yeniden dene" onPress={() => runAnalysis(draft)} disabled={analyzing || busy} style={styles.rowButton} />
                <SecondaryButton title="Elle tamamla" onPress={() => setManualMode(true)} style={styles.rowButton} />
              </View>
            ) : null}
            {(manualMode || !analyzing) ? (
              <ClothingForm value={draft.attributes} onChange={(attributes) => persist({ ...draft, attributes })} />
            ) : null}
            <PrimaryButton title="Kaydet" onPress={save} loading={busy} disabled={analyzing} />
            <SecondaryButton title="Fotoğrafı değiştir" onPress={pickFromLibrary} disabled={busy || analyzing} />
            <Text style={styles.storageNote}>Fotoğraf kalıcı uygulama alanına alındı. Kaydet düğmesine art arda basmak ikinci kayıt oluşturmaz.</Text>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 48, gap: spacing.md },
  heading: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: spacing.md },
  subheading: { color: colors.muted, fontSize: 15 },
  categoryList: { gap: spacing.md, marginTop: spacing.md },
  selectedCategory: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectedCategoryText: { color: colors.text, fontSize: 23, fontWeight: '900' },
  guideCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#EEE7D8', gap: spacing.sm },
  guideTitle: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  guideText: { color: colors.text, fontSize: 17, lineHeight: 25, fontWeight: '600' },
  preview: { width: '100%', height: 330, borderRadius: radius.lg, backgroundColor: '#EDE8DE' },
  analysisBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  analysisText: { color: colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowButton: { flex: 1 },
  storageNote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});

