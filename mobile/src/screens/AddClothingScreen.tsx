import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { CategoryIcon } from '../components/CategoryIcon';
import { ClothingForm } from '../components/ClothingForm';
import { ContentFrame, StickyFooter } from '../components/layout';
import { Chip, Notice, PrimaryButton, ScreenHeader, SecondaryButton } from '../components/ui';
import { findClothingByPhotoHash, getSetting, listCorrectionRules, recordAiCorrections, setSetting } from '../data/database';
import { applyLearnedCorrections } from '../domain/correctionLearning';
import {
  CATEGORIES,
  EMPTY_ATTRIBUTES,
  type Category,
  type ClothingDraft,
  type ClothingItem,
} from '../domain/types';
import { analyzeClothing } from '../services/api';
import { hapticTick } from '../services/haptics';
import { createThumbnail, deleteStoredImage, finalizeImage, imageContentHash, prepareSelectedImage } from '../services/imageStorage';
import { isBackgroundRemovalAvailable, removeBackground } from '../services/backgroundRemoval';
import { colors, darkPalette, lightPalette, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

const guidance: Record<Category, string> = {
  top: 'Düz zemine ser, önden çek ve parçanın tamamını kadraja al.',
  bottom: 'Belden paçaya kadar tamamı görünsün; düz zeminde önden çek.',
  shoes: 'Ayakkabı çiftini yan yana koy; şekli ve rengi net görünsün.',
  hat: 'Şapkayı düz zemine koy, tepe ve kenarları kadraja al.',
  accessory: 'Takı, saat ya da aksesuarı düz, sade zeminde yakın çek.',
  outerwear: 'Montu asılı ya da düz ser; yakayı, kesimi ve rengi kadrajda tut.',
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
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const categoryLabel = (value: Category) =>
    t(`category.${value}` as 'category.top' | 'category.bottom' | 'category.shoes' | 'category.hat' | 'category.accessory' | 'category.outerwear');
  const localizedGuidance: Record<Category, string> = language === 'tr' ? guidance : {
    top: 'Lay it flat, shoot from the front, and keep the whole item in frame.',
    bottom: 'Show it from waist to hem; lay it flat and shoot from the front.',
    shoes: 'Place the pair side by side so their shape and color are clear.',
    hat: 'Place the hat on a flat surface; keep the crown and brim in frame.',
    accessory: 'Shoot the piece — jewelry, watch or accessory — close up on a plain surface.',
    outerwear: 'Hang it or lay it flat; keep the collar, cut and color in frame.',
  };
  const { width } = useWindowDimensions();
  const scheme = useColorScheme();
  const iconColor = scheme === 'dark' ? darkPalette.primary : lightPalette.primary;
  const [draft, setDraft] = useState<ClothingDraft | null>(props.initialDraft);
  const [queue, setQueue] = useState<ClothingDraft[]>(props.initialQueue);
  const [batchTotal, setBatchTotal] = useState<number>(props.initialQueue.length > 0 ? props.initialQueue.length + 1 : 0);
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
    if (!category) return l('Kategori seç', 'Choose category');
    if (!hasPhoto) return `${categoryLabel(category)} ${l('fotoğrafı', 'photo')}`;
    return l('Kontrol et ve kaydet', 'Review and save');
  }, [category, hasPhoto, language]);

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
      const result = await analyzeClothing(props.apiUrl, analyzingDraft.category, analyzingDraft.photoUri, language, controller.signal);
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
      const analyzed: ClothingDraft = {
        ...analyzingDraft,
        attributes,
        aiAttributes,
        categoryConflict: result.categoryConflict,
        detectedCategory: result.detectedCategory,
        analysisError: null,
        analysisMode: 'ai',
      };
      await persist(analyzed);
      if (result.categoryConflict && result.detectedCategory && result.detectedCategory !== analyzed.category) {
        promptCategoryConfirm(analyzed, result.detectedCategory);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : l('Analiz servisine ulaşılamadı.', 'The analysis service is unavailable.');
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

  const applyDetectedCategory = async (current: ClothingDraft, detected: Category) => {
    setCategory(detected);
    await persist({
      ...current,
      category: detected,
      categoryConflict: false,
    });
  };

  const promptCategoryConfirm = (current: ClothingDraft, detected: Category) => {
    const detectedLabel = categoryLabel(detected);
    const currentLabel = categoryLabel(current.category);
    Alert.alert(
      l(`AI bunu "${detectedLabel}" olarak algıladı`, `AI detected this as "${detectedLabel}"`),
      l(
        `Sen "${currentLabel}" kategorisini seçmiştin. Kategoriyi "${detectedLabel}" olarak güncellemek ister misin? Diğer bilgiler korunur.`,
        `You chose "${currentLabel}". Would you like to update the category to "${detectedLabel}"? Other details are kept.`,
      ),
      [
        {
          text: l(`Hayır, "${currentLabel}" kalsın`, `No, keep "${currentLabel}"`),
          style: 'cancel',
        },
        {
          text: l(`Evet, "${detectedLabel}" olarak güncelle`, `Yes, update to "${detectedLabel}"`),
          onPress: () => { void applyDetectedCategory(current, detected); },
        },
      ],
    );
  };

  const acceptAsset = async (uri: string) => {
    if (!category) return;
    setBusy(true);
    try {
      const id = draft?.id ?? Crypto.randomUUID();
      let photoUri = await prepareSelectedImage(uri, id);
      const bgEnabled = (await getSetting('bg_removal_enabled')) === '1';
      if (bgEnabled && isBackgroundRemovalAvailable()) {
        try {
          const bgResult = await removeBackground(photoUri);
          if (bgResult.usedNativeModule && bgResult.resultUri !== photoUri) {
            deleteStoredImage(photoUri);
            photoUri = bgResult.resultUri;
          }
        } catch {
          // Fall back to the original photo on any segmenter error.
        }
      }
      const photoHash = imageContentHash(photoUri);
      const duplicate = photoHash ? await findClothingByPhotoHash(photoHash) : null;
      if (duplicate) {
        deleteStoredImage(photoUri);
        Alert.alert(l('Bu fotoğraf zaten dolabında', 'This photo is already in your wardrobe'), l(`${duplicate.name || 'Kıyafet'} kaydını açıp düzenleyebilirsin.`, `You can open and edit ${duplicate.name || 'the existing item'}.`));
        return;
      }
      const next: ClothingDraft = {
        id,
        category,
        photoUri,
        photoHash,
        attributes: { ...EMPTY_ATTRIBUTES },
        categoryConflict: false,
        detectedCategory: null,
        analysisError: null,
        analysisMode: 'undecided',
      };
      setLearnedApplied(false);
      await persist(next);
    } catch (error) {
      Alert.alert(l('Fotoğraf hazırlanamadı', 'Could not prepare photo'), error instanceof Error ? error.message : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(l('Galeri izni gerekli', 'Gallery permission required'), l('Fotoğraf seçebilmek için galeri izni vermelisin.', 'Allow gallery access to choose a photo.'));
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
      Alert.alert(l('Galeri izni gerekli', 'Gallery permission required'), l('Birden fazla fotoğraf seçebilmek için galeri izni vermelisin.', 'Allow gallery access to choose multiple photos.'));
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
        const photoUri = await prepareSelectedImage(asset.uri, id);
        const photoHash = imageContentHash(photoUri);
        const duplicate = photoHash ? await findClothingByPhotoHash(photoHash) : null;
        if (duplicate || prepared.some((draftItem) => draftItem.photoHash && draftItem.photoHash === photoHash)) {
          deleteStoredImage(photoUri);
          continue;
        }
        prepared.push({
          id,
          category,
          photoUri,
          photoHash,
          attributes: { ...EMPTY_ATTRIBUTES },
          aiAttributes: null,
          categoryConflict: false,
          detectedCategory: null,
          analysisError: null,
          analysisMode: 'undecided',
        });
      }
      const [first, ...remaining] = prepared;
      if (!first) {
        Alert.alert(l('Yeni fotoğraf bulunamadı', 'No new photos found'), l('Seçtiğin fotoğrafların tamamı zaten dolabında.', 'All selected photos are already in your wardrobe.'));
        return;
      }
      setLearnedApplied(false);
      setLastSource('gallery');
      await setSetting('last_photo_source', 'gallery');
      setQueue(remaining);
      setBatchTotal(prepared.length);
      await props.onPersistQueue(remaining);
      await persist(first);
    } catch (error) {
      prepared.forEach((item) => deleteStoredImage(item.photoUri));
      Alert.alert(l('Toplu ekleme hazırlanamadı', 'Could not prepare bulk add'), error instanceof Error ? error.message : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(l('Kamera izni gerekli', 'Camera permission required'), l('Fotoğraf çekebilmek için kamera izni vermelisin.', 'Allow camera access to take a photo.'));
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
      l('Fotoğrafı değiştir', 'Replace photo'),
      l('Yeni fotoğraf başarıyla hazırlanana kadar mevcut taslak korunur. Devam edilsin mi?', 'The current draft stays safe until the new photo is ready. Continue?'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: l('Değiştir', 'Replace'), onPress: () => void open() },
      ],
    );
  };

  const analysisMessage = analysisElapsed < 4
    ? 'Fotoğraf AI analizi için hazırlanıyor…'
    : analysisElapsed < 18
      ? 'AI kıyafetin renk ve tarzını inceliyor…'
      : 'AI yanıtı biraz uzun sürüyor; fotoğrafın ve taslağın güvende.';

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
        photoHash: draft.photoHash ?? imageContentHash(photoUri),
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
      Alert.alert(l('Kaydedilemedi', 'Could not save'), error instanceof Error ? error.message : t('common.unknownError'));
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
            <Text style={styles.heading}>{l('Ne ekliyorsun?', 'What are you adding?')}</Text>
            <Text style={styles.subheading}>{l('Önce ana kategoriyi seç.', 'Choose the main category first.')}</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => { hapticTick('select'); setCategory(value); }}
                  accessibilityRole="button"
                  accessibilityLabel={categoryLabel(value)}
                  style={({ pressed }) => [styles.categoryCard, pressed && styles.categoryCardPressed]}
                >
                  <View style={styles.categoryIconWrap}>
                    <CategoryIcon category={value} color={iconColor} size={48} />
                  </View>
                  <Text style={styles.categoryCardLabel}>{categoryLabel(value)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : !hasPhoto ? (
          <>
            <View style={styles.selectedCategory}>
              <View style={styles.selectedCategoryLeft}>
                <View style={styles.selectedCategoryIcon}>
                  <CategoryIcon category={category} color={iconColor} size={28} />
                </View>
                <Text style={styles.selectedCategoryText}>{categoryLabel(category)}</Text>
              </View>
              <Chip label={l('Değiştir', 'Change')} selected={false} onPress={() => setCategory(null)} />
            </View>
            <Text style={styles.guideHint}>{l('💡 ', '💡 ')}{localizedGuidance[category]}</Text>
            <PrimaryButton
              title={lastSource === 'camera' ? l('📸 Kameradan çek · Son kullanılan', '📸 Take photo · Last used') : l('🖼 Galeriden seç · Son kullanılan', '🖼 Choose from gallery · Last used')}
              onPress={() => openSource(lastSource)}
              disabled={busy}
            />
            <SecondaryButton
              title={lastSource === 'camera' ? l('🖼 Galeriden seç', '🖼 Choose from gallery') : l('📸 Kameradan çek', '📸 Take photo')}
              onPress={() => openSource(lastSource === 'camera' ? 'gallery' : 'camera')}
              disabled={busy}
            />
            <SecondaryButton
              title={l('🗂 Toplu ekle · En fazla 20', '🗂 Bulk add · Up to 20')}
              onPress={() => void pickMultipleFromLibrary()}
              disabled={busy}
            />
            {busy ? <View style={styles.busyRow}><ActivityIndicator color={colors.primary} /><Text style={styles.analysisText}>{l('Fotoğraf hazırlanıyor…', 'Preparing photo…')}</Text></View> : null}
          </>
        ) : draft ? (
          <>
            {batchRemaining > 1 ? (
              <View style={styles.batchProgress}>
                <View style={styles.batchProgressHeader}>
                  <Text style={styles.batchProgressLabel}>{l('Toplu ekleme', 'Bulk add')}</Text>
                  <Text style={styles.batchProgressCount}>
                    {batchTotal > 0 ? `${batchTotal - batchRemaining + 1}/${batchTotal}` : `${batchRemaining}`}
                  </Text>
                </View>
                <View style={styles.batchProgressTrack}>
                  <View
                    style={[
                      styles.batchProgressFill,
                      { width: batchTotal > 0 ? `${((batchTotal - batchRemaining + 1) / batchTotal) * 100}%` : '0%' },
                    ]}
                  />
                </View>
                <Text style={styles.batchProgressHint}>
                  {l('Her parçayı onayladıkça sıradaki fotoğraf gelir.', 'Confirm each item to load the next photo.')}
                </Text>
              </View>
            ) : null}
            {analysisMode === 'undecided' ? (
              <Notice>
                {l('Fotoğrafın hazır. AI renk, tür ve tarz alanlarını senin için doldurabilir; istersen bilgileri ücretsiz olarak kendin girebilirsin.', 'Your photo is ready. AI can fill in color, type, and style, or you can enter the details yourself for free.')}
              </Notice>
            ) : null}
            {analysisMode === 'undecided' && props.analysisRemaining === 0 ? (
              <Notice tone="error">{l('AI analiz kredin bitti. Fotoğrafın güvende; bilgileri kendin girerek ücretsiz devam edebilirsin.', 'Your AI analysis credits are used up. Your photo is safe; enter the details yourself for free.')}</Notice>
            ) : null}
            {analysisMode === 'undecided' && props.analysisRemaining !== undefined && props.analysisRemaining > 0 ? (
              <Text style={styles.creditNote}>{l(`Kalan AI analiz kredin: ${props.analysisRemaining} 🪙`, `AI analysis credits left: ${props.analysisRemaining} 🪙`)}</Text>
            ) : null}
            <View style={[styles.reviewLayout, wide && styles.reviewLayoutWide]}>
              <View style={styles.mediaColumn}>
                <Image source={{ uri: draft.photoUri }} style={styles.preview} resizeMode="contain" />
                {analyzing ? (
                  <View style={styles.analysisBox}>
                    <ActivityIndicator color={colors.primary} />
                    <View style={styles.analysisCopy}>
                      <Text style={styles.analysisTitle}>{l('Analiz sürüyor', 'Analysis in progress')} · {analysisElapsed} {l('sn', 'sec')}</Text>
                      <Text style={styles.analysisText}>{language === 'tr' ? analysisMessage : analysisElapsed < 4 ? 'Preparing the photo for AI analysis…' : analysisElapsed < 18 ? 'AI is checking its colors and style…' : 'AI is taking a little longer; your photo and draft are safe.'}</Text>
                    </View>
                  </View>
                ) : null}
                {draft.categoryConflict && draft.detectedCategory ? (
                  <View style={styles.conflictBox}>
                    <Text style={styles.conflictText}>
                      {l(
                        `AI bu parçayı "${categoryLabel(draft.detectedCategory)}" olarak algıladı; sen "${categoryLabel(draft.category)}" seçtin.`,
                        `AI detected this as "${categoryLabel(draft.detectedCategory)}" but you chose "${categoryLabel(draft.category)}".`,
                      )}
                    </Text>
                    <View style={styles.conflictActions}>
                      <SecondaryButton
                        title={l(`"${categoryLabel(draft.detectedCategory)}" olarak güncelle`, `Update to "${categoryLabel(draft.detectedCategory)}"`)}
                        onPress={() => void applyDetectedCategory(draft, draft.detectedCategory as Category)}
                        style={styles.conflictButton}
                      />
                    </View>
                  </View>
                ) : null}
                {learnedApplied ? <Notice>{l('Önceki düzeltmelerine göre bazı alanlar telefonda otomatik düzeltildi.', 'Some fields were corrected on your phone using your previous edits.')}</Notice> : null}
                {draft.analysisError ? <Notice tone="error">{draft.analysisError}</Notice> : null}
                {draft.analysisError ? (
                  <SecondaryButton title={l('✦ AI ile tekrar dene · 1 🪙', '✦ Try AI again · 1 🪙')} onPress={() => runAnalysis(draft)} disabled={analyzing || busy || props.analysisRemaining === 0} />
                ) : null}
              </View>
              <View style={styles.formColumn}>
                {analysisMode === 'undecided' ? (
                  <Notice>{l('AI ile otomatik doldurmayı veya bilgileri kendin girmeyi seç.', 'Choose AI autofill or enter the details yourself.')}</Notice>
                ) : !analyzing ? (
                  <ClothingForm value={draft.attributes} onChange={(attributes) => persist({ ...draft, attributes })} />
                ) : (
                  <Notice>{l('Analiz tamamlandığında alanlar burada düzenlenebilir olacak. İstersen beklemeden elle devam edebilirsin.', 'Fields will be editable when analysis finishes, or you can continue manually now.')}</Notice>
                )}
              </View>
            </View>
            <Text style={styles.storageNote}>{l('Fotoğraf kalıcı uygulama alanına alındı. Kaydet düğmesine art arda basmak ikinci kayıt oluşturmaz.', 'The photo is in persistent app storage. Tapping Save repeatedly will not create a duplicate record.')}</Text>
          </>
        ) : null}
        </ContentFrame>
      </ScrollView>
      {draft ? (
        <StickyFooter>
          {analysisMode === 'undecided' ? (
            <>
              <SecondaryButton title={l('Bilgileri kendim gireceğim · Ücretsiz', 'Enter details myself · Free')} onPress={() => void continueManually(draft)} disabled={busy} style={styles.footerButton} />
              <PrimaryButton
                title={l('✦ AI ile analiz et · 1 🪙', '✦ Analyze with AI · 1 🪙')}
                onPress={() => void runAnalysis(draft)}
                loading={analyzing}
                disabled={busy || props.analysisRemaining === 0}
                style={styles.footerButton}
              />
            </>
          ) : analyzing ? (
            <SecondaryButton title={l('Beklemeden elle devam et', 'Continue manually now')} onPress={() => continueManually(draft)} style={styles.footerButton} />
          ) : (
            <SecondaryButton title={l('Fotoğrafı değiştir', 'Replace photo')} onPress={() => openSource(lastSource)} disabled={busy} style={styles.footerButton} />
          )}
          {analysisMode !== 'undecided' ? (
            <PrimaryButton title={t('common.save')} onPress={save} loading={busy} disabled={analyzing} style={styles.footerButton} />
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
  categoryGrid: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 132,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  categoryCardPressed: { opacity: 0.75, borderColor: colors.primary },
  categoryIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCardLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  selectedCategory: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  selectedCategoryLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  selectedCategoryIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedCategoryText: { color: colors.text, fontSize: 22, fontWeight: '900' },
  guideHint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  batchProgress: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    gap: spacing.xs,
  },
  batchProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  batchProgressLabel: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  batchProgressCount: { color: colors.text, fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  batchProgressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  batchProgressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  batchProgressHint: { color: colors.muted, fontSize: 11.5, lineHeight: 17 },
  guideCard: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.warningSoft, gap: spacing.sm },
  guideTitle: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  guideText: { color: colors.text, fontSize: 17, lineHeight: 25, fontWeight: '600' },
  reviewLayout: { gap: spacing.lg },
  reviewLayoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mediaColumn: { flex: 0.9, minWidth: 280, gap: spacing.md },
  formColumn: { flex: 1.1, minWidth: 280 },
  preview: { width: '100%', height: 330, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  analysisBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  analysisCopy: { flex: 1, gap: 4 },
  analysisTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  analysisText: { color: colors.primary, fontWeight: '700', lineHeight: 20 },
  busyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  footerButton: { flex: 1 },
  storageNote: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  creditNote: { color: colors.primary, fontSize: 13, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  conflictBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    gap: spacing.sm,
  },
  conflictText: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  conflictActions: { flexDirection: 'row', gap: spacing.sm },
  conflictButton: { flex: 1 },
});

