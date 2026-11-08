import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { UpdateGate } from './src/components/UpdateGate';
import {
  clearAllUserData,
  deleteSetting,
  getPendingDraft,
  getPendingQueue,
  getSetting,
  initializeDatabase,
  insertClothing,
  listClothing,
  listFavoriteOutfits,
  listDeletedClothing,
  removeClothing,
  removeFavoriteOutfit,
  savePendingDraft,
  savePendingQueue,
  saveFavoriteOutfit,
  setSetting,
  softDeleteClothing,
  restoreClothing,
  updateClothing,
} from './src/data/database';
import { outfitKey } from './src/domain/outfitEngine';
import { normalizeApiBaseUrl } from './src/domain/apiUrl';
import { AI_CONSENT_VERSION, AI_DISCLOSURE } from './src/domain/privacy';
import type {
  Category,
  ClothingDraft,
  ClothingItem,
  FavoriteOutfit,
  OutfitPreferences,
  OutfitSuggestion,
} from './src/domain/types';
import { evaluateVersion, type MobileVersionInfo, type VersionDecision } from './src/domain/version';
import { tactileSuccess } from './src/services/feedback';
import { createThumbnail, deleteAllStoredImages, deleteStoredImage } from './src/services/imageStorage';
import { fetchMobileVersion, getCurrentAppVersion } from './src/services/version';
import {
  completeInitialAccountSignIn,
  deleteAccount,
  ensureAccountForAi,
  loadAccountState,
  signInWithGoogle,
  signOutAccount,
  type AccountState,
} from './src/services/accountAuth';
import { AddClothingScreen } from './src/screens/AddClothingScreen';
import { EditClothingScreen } from './src/screens/EditClothingScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecommendScreen } from './src/screens/RecommendScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { PrivacyPolicyScreen } from './src/screens/PrivacyPolicyScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { colors } from './src/theme/theme';

type Screen =
  | { name: 'home' }
  | { name: 'add'; category?: Category; resume?: boolean }
  | { name: 'edit'; item: ClothingItem }
  | { name: 'recommend' }
  | { name: 'results'; suggestions: OutfitSuggestion[]; preferences: OutfitPreferences; warning?: string }
  | { name: 'favorites' }
  | { name: 'settings' }
  | { name: 'privacy' }
  | { name: 'onboarding' };

const bundledApiUrl = normalizeApiBaseUrl(String(Constants.expoConfig?.extra?.apiBaseUrl ?? ''));
const internalToolsEnabled = Constants.expoConfig?.extra?.internalTools === true;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteOutfit[]>([]);
  const [pendingDraft, setPendingDraftState] = useState<ClothingDraft | null>(null);
  const [pendingQueue, setPendingQueueState] = useState<ClothingDraft[]>([]);
  const [recentlyDeleted, setRecentlyDeleted] = useState<ClothingItem | null>(null);
  const [aiConsentGranted, setAiConsentGranted] = useState(false);
  const [account, setAccount] = useState<AccountState>({ enabled: false, user: null, usage: null });
  const [apiUrl, setApiUrl] = useState(bundledApiUrl);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [versionInfo, setVersionInfo] = useState<MobileVersionInfo | null>(null);
  const [versionDecision, setVersionDecision] = useState<VersionDecision | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const currentVersion = getCurrentAppVersion();
  const deletedItemRef = useRef<ClothingItem | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionCheckInFlightRef = useRef(false);

  const refresh = async () => setItems(await listClothing());
  const refreshFavorites = async () => setFavorites(await listFavoriteOutfits());
  const refreshAccount = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const completed = await completeInitialAccountSignIn(apiUrl);
      setAccount(completed ?? await loadAccountState(apiUrl));
    } catch {
      setAccount((current) => current.user ? { ...current, stale: true } : current);
    }
  }, [apiUrl]);

  const goBack = useCallback(() => {
    if (screen.name === 'results') {
      setScreen({ name: 'recommend' });
      return;
    }
    if (screen.name === 'privacy') {
      setScreen({ name: 'settings' });
      return;
    }
    if (screen.name !== 'home') setScreen({ name: 'home' });
  }, [screen.name]);

  useEffect(() => {
    const start = async () => {
      try {
        await initializeDatabase();
        const abandonedDeletes = await listDeletedClothing();
        for (const item of abandonedDeletes) {
          await removeClothing(item.id);
          deleteStoredImage(item.photoUri);
          deleteStoredImage(item.thumbnailUri);
          deleteStoredImage(item.cutoutUri);
        }
        const [storedItems, storedFavorites, draft, queue, storedApi, storedConsent, onboarding] = await Promise.all([
          listClothing(),
          listFavoriteOutfits(),
          getPendingDraft(),
          getPendingQueue(),
          getSetting('api_url'),
          getSetting('ai_consent_version'),
          getSetting('onboarding_completed'),
        ]);
        setItems(storedItems);
        setFavorites(storedFavorites);
        setPendingDraftState(draft);
        setPendingQueueState(queue);
        setAiConsentGranted(storedConsent === AI_CONSENT_VERSION);
        const resolvedApiUrl = internalToolsEnabled
          ? normalizeApiBaseUrl(storedApi ?? bundledApiUrl)
          : bundledApiUrl;
        setApiUrl(resolvedApiUrl);
        if (internalToolsEnabled && storedApi !== null && storedApi !== resolvedApiUrl) {
          await setSetting('api_url', resolvedApiUrl);
        } else if (!internalToolsEnabled && storedApi !== null) {
          await deleteSetting('api_url');
        }
        if (onboarding !== 'true' && storedItems.length === 0 && !draft) setScreen({ name: 'onboarding' });

        void Promise.all(storedItems.filter((item) => !item.thumbnailUri).map(async (item) => {
          try {
            const thumbnailUri = await createThumbnail(item.photoUri, item.id);
            await updateClothing({ ...item, thumbnailUri });
          } catch {
            // Eski bir fotoğraf bozuksa tam boy görsel kullanılmaya devam eder.
          }
        })).then(refresh);
      } catch (error) {
        setStartupError(error instanceof Error ? error.message : 'Veritabanı açılamadı.');
      } finally {
        setReady(true);
      }
    };
    start();
  }, []);

  const checkVersion = useCallback(async () => {
    if (!ready || versionCheckInFlightRef.current) return;
    const versionApiUrl = apiUrl || bundledApiUrl;
    if (!versionApiUrl) return;

    versionCheckInFlightRef.current = true;
    try {
      const info = await fetchMobileVersion(versionApiUrl);
      setVersionInfo(info);
      setVersionDecision(evaluateVersion(currentVersion, info));
    } catch {
      // Sürüm sunucusu kapalıyken elle kayıt ve yerel kombin özellikleri çalışmaya devam eder.
    } finally {
      versionCheckInFlightRef.current = false;
    }
  }, [apiUrl, currentVersion, ready]);

  useEffect(() => {
    if (!ready) return undefined;
    void checkVersion();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkVersion();
    });
    return () => subscription.remove();
  }, [checkVersion, ready]);

  useEffect(() => {
    if (ready && apiUrl) void refreshAccount();
  }, [apiUrl, ready, refreshAccount]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'home') return false;
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [goBack, screen.name]);

  useEffect(() => () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
  }, []);

  const persistDraft = async (draft: ClothingDraft | null) => {
    await savePendingDraft(draft);
    setPendingDraftState(draft);
  };

  const persistQueue = async (queue: ClothingDraft[]) => {
    await savePendingQueue(queue);
    setPendingQueueState(queue);
  };

  const saveNewItem = async (item: ClothingItem) => {
    await insertClothing(item);
    await refresh();
    tactileSuccess('Kıyafet dolabına eklendi.');
  };

  const saveEditedItem = async (item: ClothingItem) => {
    await updateClothing(item);
    await refresh();
    tactileSuccess('Değişiklikler kaydedildi.');
    setScreen({ name: 'home' });
  };

  const finalizeDeletedItem = async (item: ClothingItem) => {
    await removeClothing(item.id);
    deleteStoredImage(item.photoUri);
    deleteStoredImage(item.thumbnailUri);
    deleteStoredImage(item.cutoutUri);
    if (deletedItemRef.current?.id === item.id) {
      deletedItemRef.current = null;
      setRecentlyDeleted(null);
    }
  };

  const deleteItem = async (item: ClothingItem) => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    if (deletedItemRef.current) await finalizeDeletedItem(deletedItemRef.current);
    await softDeleteClothing(item.id);
    deletedItemRef.current = item;
    setRecentlyDeleted(item);
    await Promise.all([refresh(), refreshFavorites()]);
    setScreen({ name: 'home' });
    deleteTimerRef.current = setTimeout(() => {
      void finalizeDeletedItem(item);
    }, 8_000);
  };

  const undoDelete = async () => {
    const item = deletedItemRef.current;
    if (!item) return;
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
    await restoreClothing(item.id);
    deletedItemRef.current = null;
    setRecentlyDeleted(null);
    await Promise.all([refresh(), refreshFavorites()]);
    tactileSuccess('Kıyafet geri getirildi.');
  };

  const toggleFavorite = async (suggestion: OutfitSuggestion) => {
    try {
      const key = outfitKey(suggestion);
      const existing = favorites.find((favorite) => outfitKey(favorite) === key);
      if (existing) {
        await removeFavoriteOutfit(existing.id);
        tactileSuccess('Kombin favorilerden çıkarıldı.');
      } else {
        await saveFavoriteOutfit(suggestion);
        tactileSuccess('Kombin favorilere eklendi.');
      }
      await refreshFavorites();
    } catch (error) {
      Alert.alert('Favori güncellenemedi', error instanceof Error ? error.message : 'Bilinmeyen hata');
    }
  };

  const saveApiUrl = async (nextApiUrl: string) => {
    if (!internalToolsEnabled) return;
    const normalizedApiUrl = normalizeApiBaseUrl(nextApiUrl);
    await setSetting('api_url', normalizedApiUrl);
    setApiUrl(normalizedApiUrl);
    tactileSuccess('API adresi kaydedildi.');
    setScreen({ name: 'home' });
  };

  const grantAiConsent = async () => {
    setAiConsentGranted(true);
    try {
      await setSetting('ai_consent_version', AI_CONSENT_VERSION);
    } catch (error) {
      setAiConsentGranted(false);
      throw error;
    }
  };

  const revokeAiConsent = async () => {
    await deleteSetting('ai_consent_version');
    setAiConsentGranted(false);
    tactileSuccess('Akıllı özellik izni kapatıldı.');
  };

  const requestAiConsent = async (): Promise<boolean> => {
    if (aiConsentGranted) return true;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      Alert.alert(
        'Akıllı özelliklere izin ver',
        AI_DISCLOSURE,
        [
          { text: 'Yalnızca telefonda devam et', style: 'cancel', onPress: () => finish(false) },
          {
            text: 'İzin ver',
            onPress: () => {
              finish(true);
              void grantAiConsent().catch(() => {
                // Onay bu istek için geçerli; kalıcı kayıt başarısızsa sonraki kullanımda yeniden sorulur.
              });
            },
          },
        ],
        { cancelable: true, onDismiss: () => finish(false) },
      );
    });
  };

  const requestAiAccess = async (): Promise<boolean> => {
    if (!await requestAiConsent()) return false;
    try {
      const nextAccount = await ensureAccountForAi(apiUrl);
      setAccount(nextAccount);
      return !nextAccount.enabled || Boolean(nextAccount.user);
    } catch (error) {
      Alert.alert('Google ile giriş yapılamadı', error instanceof Error ? error.message : 'Bilinmeyen hata');
      return false;
    }
  };

  const connectAccount = async () => {
    try {
      const nextAccount = await signInWithGoogle(apiUrl);
      setAccount(nextAccount);
      tactileSuccess('Google hesabın bağlandı.');
    } catch (error) {
      Alert.alert('Google ile giriş yapılamadı', error instanceof Error ? error.message : 'Bilinmeyen hata');
    }
  };

  const disconnectAccount = async () => {
    await signOutAccount();
    setAccount((current) => ({ enabled: current.enabled, user: null, usage: null }));
    tactileSuccess('Bu cihazdaki hesap oturumu kapatıldı.');
  };

  const removeAccount = async () => {
    try {
      await deleteAccount(apiUrl);
      setAccount((current) => ({ enabled: current.enabled, user: null, usage: null }));
      tactileSuccess('Hesap profilin sunucudan silindi.');
    } catch (error) {
      Alert.alert('Hesap silinemedi', error instanceof Error ? error.message : 'Bilinmeyen hata');
    }
  };

  const deleteAllLocalData = async () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
    deletedItemRef.current = null;
    setRecentlyDeleted(null);
    await clearAllUserData();
    let imageCleanupFailed = false;
    try { deleteAllStoredImages(); }
    catch { imageCleanupFailed = true; }

    setItems([]);
    setFavorites([]);
    setPendingDraftState(null);
    setPendingQueueState([]);
    setAiConsentGranted(false);
    setAccount((current) => ({ enabled: current.enabled, user: null, usage: null }));
    setApiUrl(bundledApiUrl);
    setScreen({ name: 'home' });
    if (imageCleanupFailed) {
      Alert.alert('Kayıtlar silindi', 'Dolap kayıtları silindi ancak bazı fotoğraf dosyaları temizlenemedi. Uygulamayı yeniden kurmak kalan dosyaları temizler.');
    } else {
      tactileSuccess('Bu cihazdaki tüm uygulama verileri silindi.');
    }
  };

  const completeOnboarding = async (startAdding: boolean) => {
    await setSetting('onboarding_completed', 'true');
    setScreen(startAdding ? { name: 'add' } : { name: 'home' });
  };

  if (!ready) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loading}>Dolabın hazırlanıyor…</Text>
      </View>
    );
  }

  if (startupError) {
    return (
      <View style={styles.center}>
        <StatusBar style="dark" />
        <Text style={styles.errorTitle}>Uygulama açılamadı</Text>
        <Text style={styles.errorText}>{startupError}</Text>
      </View>
    );
  }

  let content: ReactNode;
  switch (screen.name) {
    case 'add':
      content = (
        <AddClothingScreen
          apiUrl={apiUrl}
          initialCategory={screen.category}
          initialDraft={screen.resume ? pendingDraft : null}
          initialQueue={screen.resume ? pendingQueue : []}
          onPersistDraft={persistDraft}
          onPersistQueue={persistQueue}
          onSave={saveNewItem}
          onComplete={() => setScreen({ name: 'home' })}
          onRequestAiAccess={requestAiAccess}
          onAiUsageChanged={() => void refreshAccount()}
          analysisRemaining={account.user && account.usage
            ? Math.max(0, Math.min(
              account.usage.dailyAnalysisLimit - account.usage.dailyAnalysisUsed,
              account.usage.monthlyAnalysisLimit - account.usage.monthlyAnalysisUsed,
            ))
            : undefined}
          onBack={goBack}
        />
      );
      break;
    case 'edit':
      content = (
        <EditClothingScreen
          item={screen.item}
          onSave={saveEditedItem}
          onDelete={deleteItem}
          onBack={goBack}
        />
      );
      break;
    case 'recommend':
      content = (
        <RecommendScreen
          items={items}
          apiUrl={apiUrl}
          onRequestAiAccess={requestAiAccess}
          onAiUsageChanged={() => void refreshAccount()}
          outfitRemaining={account.user && account.usage
            ? Math.max(0, Math.min(
              account.usage.dailyOutfitLimit - account.usage.dailyOutfitUsed,
              account.usage.monthlyOutfitLimit - account.usage.monthlyOutfitUsed,
            ))
            : undefined}
          onBack={goBack}
          onAddCategory={(category) => setScreen({ name: 'add', category })}
          onResults={(suggestions, warning, preferences) => setScreen({ name: 'results', suggestions, warning, preferences })}
        />
      );
      break;
    case 'results':
      content = (
        <ResultsScreen
          items={items}
          suggestions={screen.suggestions}
          preferences={screen.preferences}
          favorites={favorites}
          warning={screen.warning}
          onToggleFavorite={toggleFavorite}
          onBack={goBack}
        />
      );
      break;
    case 'favorites':
      content = (
        <FavoritesScreen
          items={items}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onBack={goBack}
        />
      );
      break;
    case 'settings':
      content = (
        <SettingsScreen
          apiUrl={apiUrl}
          aiConsentGranted={aiConsentGranted}
          currentVersion={currentVersion}
          internalToolsEnabled={internalToolsEnabled}
          account={account}
          onSaveApiUrl={saveApiUrl}
          onSignIn={connectAccount}
          onSignOut={disconnectAccount}
          onDeleteAccount={removeAccount}
          onRefreshAccount={refreshAccount}
          onGrantAiConsent={grantAiConsent}
          onRevokeAiConsent={revokeAiConsent}
          onDeleteAllData={deleteAllLocalData}
          onPrivacy={() => setScreen({ name: 'privacy' })}
          onBack={goBack}
        />
      );
      break;
    case 'privacy':
      content = <PrivacyPolicyScreen onBack={goBack} />;
      break;
    case 'onboarding':
      content = <OnboardingScreen onStart={() => void completeOnboarding(true)} onSkip={() => void completeOnboarding(false)} />;
      break;
    default:
      content = (
        <HomeScreen
          items={items}
          pendingDraft={pendingDraft}
          pendingQueueCount={pendingQueue.length}
          onAdd={(category) => setScreen({ name: 'add', category })}
          onRecommend={() => setScreen({ name: 'recommend' })}
          onOpen={(item) => setScreen({ name: 'edit', item })}
          onDelete={deleteItem}
          onResumeDraft={() => setScreen({ name: 'add', resume: true })}
          onSettings={() => setScreen({ name: 'settings' })}
          onSignIn={connectAccount}
          onFavorites={() => setScreen({ name: 'favorites' })}
          favoriteCount={favorites.length}
          account={account}
        />
      );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {content}
      {recentlyDeleted ? (
        <View style={styles.undoBar}>
          <Text numberOfLines={1} style={styles.undoText}>{recentlyDeleted.name || 'Kıyafet'} silindi.</Text>
          <Pressable accessibilityRole="button" onPress={() => void undoDelete()} hitSlop={10}>
            <Text style={styles.undoAction}>GERİ AL</Text>
          </Pressable>
        </View>
      ) : null}
      <UpdateGate
        currentVersion={currentVersion}
        info={versionInfo}
        decision={versionDecision}
        dismissed={updateDismissed}
        onDismiss={() => setUpdateDismissed(true)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 24 : 0,
    backgroundColor: colors.background,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, backgroundColor: colors.background },
  loading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  errorTitle: { color: colors.text, fontSize: 23, fontWeight: '900' },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  undoBar: { position: 'absolute', left: 16, right: 16, bottom: 18, minHeight: 54, borderRadius: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: '#25231F' },
  undoText: { flex: 1, color: colors.white, fontSize: 14, fontWeight: '700' },
  undoAction: { color: '#CFE8D7', fontSize: 13, fontWeight: '900', letterSpacing: .5 },
});

