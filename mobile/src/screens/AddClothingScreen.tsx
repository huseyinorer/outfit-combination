import { useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { ClothingForm } from '../components/ClothingForm';
import { ContentFrame, StickyFooter } from '../components/layout';
import { Chip, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { getSetting, listCorrectionRules, recordAiCorrections, setSetting } from '../data/database';
import { applyLearnedCorrections } from '../domain/correctionLearning';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  EMPTY_ATTRIBUTES,
  type Category,
  type ClothingDraft,
  type ClothingItem,
} from '../domain/types';
import { analyzeClothing } from '../services/api';
import { createThumbnail, deleteStoredImage, finalizeImage, prepareSelectedImage } from '../services/imageStorage';
import { colors, radius, spacing } from '../theme/theme';

const guidance: Record<Category, string> = {
  top: 'Düz zemine ser, önden çek ve parçanın tamamını kadraja al.',
  bottom: 'Belden paçaya kadar tamamı görünsün; düz zeminde önden çek.',
  shoes: 'Ayakkabı çiftini yan yana koy; şekli ve rengi net görünsün.',
};

interface Props {
  apiUrl: string;
  initialCategory?: Category;
  initialDraft: ClothingDraft | null;
  initialQueue: ClothingDraft[];
  onPersistDraft: (draft: ClothingDraft | null) => Promise<void>;
  onPersistQueue: (queue: ClothingDraft[]) => Promise<void>;
  onSave: (item: ClothingItem) => Promise<void>;
  onComplete: () => void;
  onRequestAiAccess: () => Promise<boolean>;
  onAiUsageChanged: () => void;
  analysisRemaining?: number;
  onBack: () => void;
}

export function AddClothingScreen(props: Props) {
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState<ClothingDraft | null>(props.initialDraft);
  const [queue, setQueue] = useState<ClothingDraft[]>(props.initialQueue);
  const [category, setCategory] = useState<Category | null>(props.initialDraft?.category ?? props.initialCategory ?? null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisElapsed, setAnalysisElapsed] = useState(0);
  const [learnedApplied, setLearnedApplied] = useState(false);
  const [lastSource, setLastSource] = useState<'camera' | 'gallery'>('camera');
  const savingRef = useRef(false);
  const analysisRequestRef = useRef<AbortController | null>(null);
  const hasPhoto = Boolean(draft?.photoUri);
  const wide = width >= 900;
  const batchRemaining = (draft ? 1 : 0) + queue.length;
  const analysisMode = draft?.analysisMode
    ?? (draft?.aiAttributes || draft?.analysisError ? 'ai' : 'manual');

  useEffect(() => {
    getSetting('last_photo_source').then((value) => {
      if (value === 'gallery' || value === 'camera') setLastSource(value);
    });
    return () => analysisRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!analyzing) return undefined;
    const timer = setInterval(() => setAnalysisElapsed((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, [analyzing]);

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
    if (!await props.onRequestAiAccess()) {
      const next: ClothingDraft = { ...current, analysisMode: 'manual', analysisError: null };
      await persist(next);
      return;
    }
    analysisRequestRef.current?.abort();
    const controller = new AbortController();
    analysisRequestRef.current = controller;
    setAnalysisElapsed(0);
    setAnalyzing(true);
    const analyzingDraft: ClothingDraft = { ...current, analysisMode: 'ai', analysisError: null };
    try {
      await persist(analyzingDraft);
      const result = await analyzeClothing(props.apiUrl, analyzingDraft.category, analyzingDraft.photoUri, controller.signal);
      const aiAttributes = {
        name: result.name ?? '',
        subType: result.subType ?? '',
        primaryColor: result.primaryColor ?? '',
        secondaryColors: result.secondaryColors ?? [],
        pattern: result.pattern ?? '',
        styleTags: result.styleTags ?? [],
        seasons: result.seasons ?? [],
        description: result.description ?? '',
      };
      const attributes = applyLearnedCorrections(aiAttributes, await listCorrectionRules(analyzingDraft.category));
      setLearnedApplied(
        attributes.name !== aiAttributes.name
        || attributes.subType !== aiAttributes.subType
        || attributes.primaryColor !== aiAttributes.primaryColor
        || attributes.pattern !== aiAttributes.pattern,
      );
      await persist({
        ...analyzingDraft,
        attributes,
        aiAttributes,
        categoryConflict: result.categoryConflict,
        detectedCategory: result.detectedCategory,
        analysisError: null,
        analysisMode: 'ai',
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Analiz servisine ulaşılamadı.';
      await persist({ ...analyzingDraft, analysisMode: 'ai', analysisError: message });
    } finally {
      if (analysisRequestRef.current === controller) analysisRequestRef.current = null;
      setAnalyzing(false);
      props.onAiUsageChanged();
    }
  };

  const continueManually = async (current: ClothingDraft) => {
    analysisRequestRef.current?.abort();
    setAnalyzing(false);
    await persist({ ...current, analysisMode: 'manual', analysisError: null });
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
        analysisMode: 'undecided',
      };
      setLearnedApplied(false);
      await persist(next);
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
    if (!result.canceled && result.assets[0]) {
      setLastSource('gallery');
      await setSetting('last_photo_source', 'gallery');
      await acceptAsset(result.assets[0].uri);
    }
  };

  const pickMultipleFromLibrary = async () => {
    if (!category || hasPhoto) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Galeri izni gerekli', 'Birden fazla fotoğraf seçebilmek için galeri izni vermelisin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 20,
    });
    if (result.canceled || result.assets.length === 0) return;

    setBusy(true);
    const prepared: ClothingDraft[] = [];
    try {
      for (const asset of result.assets) {
        const id = Crypto.randomUUID();
        prepared.push({
          id,
          category,
          photoUri: await prepareSelectedImage(asset.uri, id),
          attributes: { ...EMPTY_ATTRIBUTES },
          aiAttributes: null,
          categoryConflict: false,
          detectedCategory: null,
          analysisError: null,
          analysisMode: 'undecided',
        });
      }
      const [first, ...remaining] = prepared;
      if (!first) return;
      setLearnedApplied(false);
      setLastSource('gallery');
      await setSetting('last_photo_source', 'gallery');
      setQueue(remaining);
      await props.onPersistQueue(remaining);
      await persist(first);
    } catch (error) {
      prepared.forEach((item) => deleteStoredImage(item.photoUri));
      Alert.alert('Toplu ekleme hazırlanamadı', error instanceof Error ? error.message : 'Bilinmeyen hata');
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Kamera izni gerekli', 'Fotoğraf çekebilmek için kamera izni vermelisin.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, cameraType: ImagePicker.CameraType.back });
    if (!result.canceled && result.assets[0]) {
      setLastSource('camera');
      await setSetting('last_photo_source', 'camera');
      await acceptAsset(result.assets[0].uri);
    }
  };

  const openSource = (source: 'camera' | 'gallery') => {
    const open = source === 'camera' ? takePhoto : pickFromLibrary;
    if (!hasPhoto) {
      void open();
      return;
    }
    Alert.alert(
      'Fotoğrafı değiştir',
      'Yeni fotoğraf başarıyla hazırlanana kadar mevcut taslak korunur. Devam edilsin mi?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Değiştir', onPress: () => void open() },
      ],
    );
  };

  const analysisMessage = analysisElapsed < 4
    ? 'Fotoğraf güvenli biçimde gönderiliyor…'
    : analysisElapsed < 18
      ? 'AI kıyafetin renk ve tarzını inceliyor…'
      : 'Ücretsiz sunucu uyanıyor olabilir; fotoğrafın ve taslağın güvende.';

  const save = async () => {
    if (!draft || savingRef.current) return;
    savingRef.current = true;
    setBusy(true);
    try {
      const photoUri = await finalizeImage(draft.photoUri, draft.id);
      let thumbnailUri: string | null = null;
      try { thumbnailUri = await createThumbnail(photoUri, draft.id); }
      catch { thumbnailUri = null; }
      const now = new Date().toISOString();
      await props.onSave({
        id: draft.id,
        category: draft.category,
        ...draft.attributes,
        photoUri,
        thumbnailUri,
        cutoutUri: null,
        createdAt: now,
        updatedAt: now,
      });
      try { await recordAiCorrections(draft.category, draft.aiAttributes, draft.attributes); }
      catch {
        // Öğrenme kaydı ana kıyafet kaydını başarısız göstermesin.
      }
      deleteStoredImage(draft.photoUri);
      const [next, ...remaining] = queue;
      setQueue(remaining);
      await props.onPersistQueue(remaining);
      if (next) {
        setCategory(next.category);
        setLearnedApplied(false);
        await persist(next);
      } else {
        setDraft(null);
        await props.onPersistDraft(null);
        props.onComplete();
      }
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ContentFrame maxWidth={1080} style={styles.content}>
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
            <PrimaryButton
              title={lastSource === 'camera' ? 'Kamerayla çek · Son kullanılan' : 'Galeriden seç · Son kullanılan'}
              onPress={() => openSource(lastSource)}
              disabled={busy}
            />
            <SecondaryButton
              title={lastSource === 'camera' ? 'Galeriden seç' : 'Kamerayla çek'}
              onPress={() => openSource(lastSource === 'camera' ? 'gallery' : 'camera')}
              disabled={busy}
            />
            <SecondaryButton
              title="Galeriden toplu ekle · En fazla 20"
              onPress={() => void pickMultipleFromLibrary()}
              disabled={busy}
            />
            {busy ? <View style={styles.busyRow}><ActivityIndicator color={colors.primary} /><Text style={styles.analysisText}>Fotoğraf hazırlanıyor…</Text></View> : null}
          </>
        ) : draft ? (
          <>
            {batchRemaining > 1 ? <Notice>Toplu ekleme kuyruğu: bu parçayla birlikte {batchRemaining} fotoğraf kaldı.</Notice> : null}
            {analysisMode === 'undecided' ? (
              <Notice>
                Fotoğrafın hazır. AI ile özellikleri otomatik çıkarabilir veya fotoğrafı göndermeden alanları ücretsiz olarak elle doldurabilirsin.
              </Notice>
            ) : null}
            {analysisMode === 'undecided' && props.analysisRemaining === 0 ? (
              <Notice tone="error">AI fotoğraf analizi hakkın doldu. Fotoğrafın güvende; elle doldurarak ücretsiz devam edebilirsin.</Notice>
            ) : null}
            <View style={[styles.reviewLayout, wide && styles.reviewLayoutWide]}>
              <View style={styles.mediaColumn}>
                <Image source={{ uri: draft.photoUri }} style={styles.preview} resizeMode="contain" />
                {analyzing ? (
                  <View style={styles.analysisBox}>
                    <ActivityIndicator color={colors.primary} />
                    <View style={styles.analysisCopy}>
                      <Text style={styles.analysisTitle}>Analiz sürüyor · {analysisElapsed} sn</Text>
                      <Text style={styles.analysisText}>{analysisMessage}</Text>
                    </View>
                  </View>
                ) : null}
                {draft.categoryConflict ? (
                  <Notice tone="error">
                    Model bu parçayı {draft.detectedCategory ? CATEGORY_LABELS[draft.detectedCategory] : 'farklı bir kategori'} olarak algıladı. Seçtiğin kategoriyi kontrol et.
                  </Notice>
                ) : null}
                {learnedApplied ? <Notice>Önceki düzeltmelerine göre bazı AI alanları telefonda otomatik düzeltildi.</Notice> : null}
                {draft.analysisError ? <Notice tone="error">{draft.analysisError}</Notice> : null}
                {draft.analysisError ? (
                  <SecondaryButton title="Yeniden dene" onPress={() => runAnalysis(draft)} disabled={analyzing || busy} />
                ) : null}
              </View>
              <View style={styles.formColumn}>
                {analysisMode === 'undecided' ? (
                  <Notice>Devam etmek için aşağıdan AI analizini veya elle doldurmayı seç.</Notice>
                ) : !analyzing ? (
                  <ClothingForm value={draft.attributes} onChange={(attributes) => persist({ ...draft, attributes })} />
                ) : (
                  <Notice>Analiz tamamlandığında alanlar burada düzenlenebilir olacak. İstersen beklemeden elle devam edebilirsin.</Notice>
                )}
              </View>
            </View>
            <Text style={styles.storageNote}>Fotoğraf kalıcı uygulama alanına alındı. Kaydet düğmesine art arda basmak ikinci kayıt oluşturmaz.</Text>
          </>
        ) : null}
        </ContentFrame>
      </ScrollView>
      {draft ? (
        <StickyFooter>
          {analysisMode === 'undecided' ? (
            <>
              <SecondaryButton title="Elle doldur · Ücretsiz" onPress={() => void continueManually(draft)} disabled={busy} style={styles.footerButton} />
              <PrimaryButton
                title={`AI ile analiz et${props.analysisRemaining === undefined ? '' : ` · ${props.analysisRemaining} hak`}`}
                onPress={() => void runAnalysis(draft)}
                loading={analyzing}
                disabled={busy || props.analysisRemaining === 0}
                style={styles.footerButton}
              />
            </>
          ) : analyzing ? (
            <SecondaryButton title="Beklemeden elle devam et" onPress={() => continueManually(draft)} style={styles.footerButton} />
          ) : (
            <SecondaryButton title="Fotoğrafı değiştir" onPress={() => openSource(lastSource)} disabled={busy} style={styles.footerButton} />
          )}
          {analysisMode !== 'undecided' ? (
            <PrimaryButton title="Kaydet" onPress={save} loading={busy} disabled={analyzing} style={styles.footerButton} />
          ) : null}
        </StickyFooter>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  content: { padding: spacing.md, gap: spacing.md },
  heading: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: spacing.md },
  subheading: { color: colors.muted, fontSize: 15 },
  categoryList: { gap: spacing.md, marginTop: spacing.md },
  selectedCategory: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectedCategoryText: { color: colors.text, fontSize: 23, fontWeight: '900' },
  guideCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: '#EEE7D8', gap: spacing.sm },
  guideTitle: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  guideText: { color: colors.text, fontSize: 17, lineHeight: 25, fontWeight: '600' },
  reviewLayout: { gap: spacing.lg },
  reviewLayoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mediaColumn: { flex: 0.9, minWidth: 280, gap: spacing.md },
  formColumn: { flex: 1.1, minWidth: 280 },
  preview: { width: '100%', height: 330, borderRadius: radius.lg, backgroundColor: '#EDE8DE' },
  analysisBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  analysisCopy: { flex: 1, gap: 4 },
  analysisTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  analysisText: { color: colors.primary, fontWeight: '700', lineHeight: 20 },
  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  footerButton: { flex: 1 },
  storageNote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});

