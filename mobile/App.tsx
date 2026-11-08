import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Platform,
  Pressable,
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
  activateWardrobeOwner,
  deleteSetting,
  getPendingDraft,
  getPendingQueue,
  getSetting,
  initializeDatabase,
  insertClothing,
  listClothing,
  listFavoriteOutfits,
  listDeletedClothing,
  moveAccountWardrobeToLocal,
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
import { clearInstallationAccess } from './src/services/installationAuth';
import { fetchMobileVersion, getCurrentAppVersion } from './src/services/version';
import {
  completeInitialAccountSignIn,
  deleteAccount,
  ensureAccountForAi,
  loadAccountState,
  completeEmailSignIn,
  requestEmailSignInCode,
  signInWithGoogle,
  signOutAccount,
  type AccountState,
} from './src/services/accountAuth';
import { LocalizationProvider, deviceLanguage, translate, type AppLanguage } from './src/locales';
import { AddClothingScreen } from './src/screens/AddClothingScreen';
import { EditClothingScreen } from './src/screens/EditClothingScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecommendScreen } from './src/screens/RecommendScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { PrivacyPolicyScreen } from './src/screens/PrivacyPolicyScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { colors } from './src/theme/theme';

type Screen =
  | { name: 'auth'; returnTo?: 'home' | 'settings' }
  | { name: 'home' }
  | { name: 'add'; category?: Category; resume?: boolean }
  | { name: 'edit'; item: ClothingItem }
  | { name: 'recommend' }
  | { name: 'results'; suggestions: OutfitSuggestion[]; preferences: OutfitPreferences; warning?: string }
  | { name: 'favorites' }
  | { name: 'history' }
  | { name: 'settings' }
  | { name: 'privacy'; returnTo?: 'auth' | 'settings'; authReturnTo?: 'home' | 'settings'; document?: 'privacy' | 'terms' }
  | { name: 'onboarding' };

const bundledApiUrl = normalizeApiBaseUrl(String(Constants.expoConfig?.extra?.apiBaseUrl ?? ''));
const internalToolsEnabled = Constants.expoConfig?.extra?.internalTools === true;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'auth' });
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteOutfit[]>([]);
  const [pendingDraft, setPendingDraftState] = useState<ClothingDraft | null>(null);
  const [pendingQueue, setPendingQueueState] = useState<ClothingDraft[]>([]);
  const [recentlyDeleted, setRecentlyDeleted] = useState<ClothingItem | null>(null);
  const [aiConsentGranted, setAiConsentGranted] = useState(false);
  const [account, setAccount] = useState<AccountState>({
    enabled: false,
    googleEnabled: false,
    emailEnabled: false,
    user: null,
    usage: null,
  });
  const [language, setLanguageState] = useState<AppLanguage>(deviceLanguage);
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
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(language, key, values);
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const changeLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    void setSetting('language', nextLanguage);
  }, []);

  const refresh = async () => setItems(await listClothing());
  const refreshFavorites = async () => setFavorites(await listFavoriteOutfits());
  const reloadWardrobeState = async () => {
    const [nextItems, nextFavorites, draft, queue] = await Promise.all([
      listClothing(),
      listFavoriteOutfits(),
      getPendingDraft(),
      getPendingQueue(),
    ]);
    setItems(nextItems);
    setFavorites(nextFavorites);
    setPendingDraftState(draft);
    setPendingQueueState(queue);
    return { items: nextItems, draft };
  };

  const activateAccountWardrobe = async (nextAccount: AccountState, claimLocal: boolean) => {
    const activation = await activateWardrobeOwner(nextAccount.user?.id ?? null, claimLocal && Boolean(nextAccount.user));
    const abandonedDeletes = await listDeletedClothing();
    for (const item of abandonedDeletes) {
      await removeClothing(item.id);
      deleteStoredImage(item.photoUri);
      deleteStoredImage(item.thumbnailUri);
      deleteStoredImage(item.cutoutUri);
    }
    const state = await reloadWardrobeState();
    setAccount(nextAccount);
    return { ...state, claimedLocalWardrobe: activation.claimedLocalWardrobe };
  };
  const refreshAccount = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const completed = await completeInitialAccountSignIn(apiUrl, language);
      const nextAccount = completed ?? await loadAccountState(apiUrl, language);
      await activateAccountWardrobe(nextAccount, Boolean(completed));
    } catch {
      setAccount((current) => current.user ? { ...current, stale: true } : current);
    }
  }, [apiUrl, language]);

  const goBack = useCallback(() => {
    if (screen.name === 'results') {
      setScreen({ name: 'recommend' });
      return;
    }
    if (screen.name === 'privacy') {
      setScreen(screen.returnTo === 'auth'
        ? { name: 'auth', returnTo: screen.authReturnTo }
        : { name: 'settings' });
      return;
    }
    if (screen.name === 'auth' && screen.returnTo) {
      setScreen(screen.returnTo === 'settings' ? { name: 'settings' } : { name: 'home' });
      return;
    }
    if (screen.name !== 'home' && screen.name !== 'auth') setScreen({ name: 'home' });
  }, [screen]);

  useEffect(() => {
    const start = async () => {
      try {
        await initializeDatabase();
        const [storedApi, storedConsent, onboarding, authGate, storedLanguage] = await Promise.all([
          getSetting('api_url'),
          getSetting('ai_consent_version'),
          getSetting('onboarding_completed'),
          getSetting('auth_gate_completed'),
          getSetting('language'),
        ]);
        if (storedLanguage === 'tr' || storedLanguage === 'en') setLanguageState(storedLanguage);
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

        let nextAccount: AccountState = {
          enabled: false,
          googleEnabled: false,
          emailEnabled: false,
          user: null,
          usage: null,
        };
        if (resolvedApiUrl) {
          try {
            nextAccount = await completeInitialAccountSignIn(resolvedApiUrl, storedLanguage === 'en' ? 'en' : 'tr')
              ?? await loadAccountState(resolvedApiUrl, storedLanguage === 'en' ? 'en' : 'tr');
          } catch {
            // Hesap servisi kapalıyken misafir kullanım yolu açık kalır.
          }
        }
        await activateAccountWardrobe(nextAccount, Boolean(nextAccount.user));

        const wardrobeState = await reloadWardrobeState();
        const canEnterApp = Boolean(nextAccount.user) || authGate === 'true';
        if (!canEnterApp) {
          setScreen({ name: 'auth' });
        } else if (onboarding !== 'true' && wardrobeState.items.length === 0 && !wardrobeState.draft) {
          setScreen({ name: 'onboarding' });
        } else {
          setScreen({ name: 'home' });
        }

        void Promise.all(wardrobeState.items.filter((item) => !item.thumbnailUri).map(async (item) => {
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
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'home' || (screen.name === 'auth' && !screen.returnTo)) return false;
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
    tactileSuccess(l('Kıyafet dolabına eklendi.', 'Clothing added to your wardrobe.'));
  };

  const saveEditedItem = async (item: ClothingItem) => {
    await updateClothing(item);
    await refresh();
    tactileSuccess(l('Değişiklikler kaydedildi.', 'Changes saved.'));
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

  const flushPendingDelete = async () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
    if (deletedItemRef.current) await finalizeDeletedItem(deletedItemRef.current);
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
    tactileSuccess(l('Kıyafet geri getirildi.', 'Clothing restored.'));
  };

  const toggleFavorite = async (suggestion: OutfitSuggestion) => {
    try {
      const key = outfitKey(suggestion);
      const existing = favorites.find((favorite) => outfitKey(favorite) === key);
      if (existing) {
        await removeFavoriteOutfit(existing.id);
        tactileSuccess(l('Kombin favorilerden çıkarıldı.', 'Outfit removed from favorites.'));
      } else {
        await saveFavoriteOutfit(suggestion);
        tactileSuccess(l('Kombin favorilere eklendi.', 'Outfit added to favorites.'));
      }
      await refreshFavorites();
    } catch (error) {
      Alert.alert(l('Favori güncellenemedi', 'Could not update favorite'), error instanceof Error ? error.message : t('common.unknownError'));
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
    tactileSuccess(l('Akıllı özellik izni kapatıldı.', 'Smart feature permission turned off.'));
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
        l('Akıllı özelliklere izin ver', 'Allow smart features'),
        language === 'tr' ? AI_DISCLOSURE : 'When you choose photo analysis, the reduced image is processed once to identify clothing attributes. Outfit requests contain only preferences and text attributes, never photos or file paths. Original wardrobe photos stay on your phone. You can withdraw this permission at any time.',
        [
          { text: l('Yalnızca telefonda devam et', 'Continue only on this phone'), style: 'cancel', onPress: () => finish(false) },
          {
            text: l('İzin ver', 'Allow'),
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
    if (account.enabled && !account.user) {
      setScreen({ name: 'auth', returnTo: 'home' });
      return false;
    }
    if (!await requestAiConsent()) return false;
    try {
      const nextAccount = await ensureAccountForAi(apiUrl, language);
      setAccount(nextAccount);
      return !nextAccount.enabled || Boolean(nextAccount.user);
    } catch (error) {
      Alert.alert(t('settings.signIn'), error instanceof Error ? error.message : t('common.unknownError'));
      return false;
    }
  };

  const finishAuthentication = async (nextAccount: AccountState) => {
    await flushPendingDelete();
    const owner = await activateAccountWardrobe(nextAccount, true);
    await setSetting('auth_gate_completed', 'true');
    tactileSuccess(t('auth.welcome', { name: nextAccount.user?.displayName.split(/\s+/)[0] || '' }));
    if (owner.claimedLocalWardrobe) tactileSuccess(t('auth.localClaimed'));
    const onboarding = await getSetting('onboarding_completed');
    setScreen(onboarding === 'true' || owner.items.length > 0 || owner.draft
      ? { name: 'home' }
      : { name: 'onboarding' });
  };

  const authenticateWithGoogle = async () => {
    await finishAuthentication(await signInWithGoogle(apiUrl, language));
  };

  const requestEmailCode = async (email: string) => {
    await requestEmailSignInCode(apiUrl, email, language);
  };

  const authenticateWithEmail = async (email: string, code: string) => {
    await finishAuthentication(await completeEmailSignIn(apiUrl, email, code, language));
  };

  const continueAsGuest = async () => {
    await flushPendingDelete();
    await signOutAccount();
    const owner = await activateAccountWardrobe({ ...account, user: null, usage: null }, false);
    await setSetting('auth_gate_completed', 'true');
    const onboarding = await getSetting('onboarding_completed');
    setScreen(onboarding === 'true' || owner.items.length > 0 || owner.draft
      ? { name: 'home' }
      : { name: 'onboarding' });
  };

  const retryAccountConfiguration = async () => {
    if (!apiUrl) throw new Error(t('auth.unavailable'));
    const nextAccount = await loadAccountState(apiUrl, language, true);
    setAccount(nextAccount);
  };

  const disconnectAccount = async () => {
    await flushPendingDelete();
    await signOutAccount();
    const nextAccount = { ...account, user: null, usage: null };
    await activateAccountWardrobe(nextAccount, false);
    await deleteSetting('auth_gate_completed');
    setScreen({ name: 'auth' });
    tactileSuccess(l('Bu cihazdaki hesap oturumu kapatıldı.', 'Signed out on this device.'));
  };

  const removeAccount = async () => {
    try {
      await flushPendingDelete();
      const deletedUserId = account.user?.id;
      await deleteAccount(apiUrl, language);
      if (deletedUserId) await moveAccountWardrobeToLocal(deletedUserId);
      const nextAccount = { ...account, user: null, usage: null };
      await activateAccountWardrobe(nextAccount, false);
      await deleteSetting('auth_gate_completed');
      setScreen({ name: 'auth' });
      tactileSuccess(l('Hesap profilin sunucudan silindi.', 'Your account profile was deleted from the service.'));
    } catch (error) {
      Alert.alert(l('Hesap silinemedi', 'Could not delete account'), error instanceof Error ? error.message : t('common.unknownError'));
    }
  };

  const deleteAllLocalData = async () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
    deletedItemRef.current = null;
    setRecentlyDeleted(null);
    await Promise.all([signOutAccount(), clearInstallationAccess()]);
    await clearAllUserData();
    let imageCleanupFailed = false;
    try { deleteAllStoredImages(); }
    catch { imageCleanupFailed = true; }

    setItems([]);
    setFavorites([]);
    setPendingDraftState(null);
    setPendingQueueState([]);
    setAiConsentGranted(false);
    await activateWardrobeOwner(null);
    setAccount((current) => ({ ...current, user: null, usage: null }));
    setApiUrl(bundledApiUrl);
    setScreen({ name: 'auth' });
    if (imageCleanupFailed) {
      Alert.alert(l('Kayıtlar silindi', 'Records deleted'), l('Dolap kayıtları silindi ancak bazı fotoğraf dosyaları temizlenemedi. Uygulamayı yeniden kurmak kalan dosyaları temizler.', 'Wardrobe records were deleted, but some photo files could not be removed. Reinstalling the app removes the remaining files.'));
    } else {
      tactileSuccess(l('Bu cihazdaki tüm uygulama verileri silindi.', 'All app data on this device was deleted.'));
    }
  };

  const completeOnboarding = async (startAdding: boolean) => {
    await setSetting('onboarding_completed', 'true');
    setScreen(startAdding ? { name: 'add' } : { name: 'home' });
  };

  if (!ready) {
    return (
      <LocalizationProvider language={language} onLanguageChange={changeLanguage}>
        <View style={styles.center}>
          <StatusBar style="dark" />
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loading}>{t('startup.loading')}</Text>
        </View>
      </LocalizationProvider>
    );
  }

  if (startupError) {
    return (
      <LocalizationProvider language={language} onLanguageChange={changeLanguage}>
        <View style={styles.center}>
          <StatusBar style="dark" />
          <Text style={styles.errorTitle}>{t('startup.error')}</Text>
          <Text style={styles.errorText}>{startupError}</Text>
        </View>
      </LocalizationProvider>
    );
  }

  let content: ReactNode;
  switch (screen.name) {
    case 'auth':
      content = (
        <AuthScreen
          account={account}
          onGoogle={authenticateWithGoogle}
          onRequestEmailCode={requestEmailCode}
          onCompleteEmail={authenticateWithEmail}
          onGuest={continueAsGuest}
          onRetry={retryAccountConfiguration}
          onBack={screen.returnTo ? goBack : undefined}
          onPrivacy={() => setScreen({ name: 'privacy', returnTo: 'auth', authReturnTo: screen.returnTo, document: 'privacy' })}
          onTerms={() => setScreen({ name: 'privacy', returnTo: 'auth', authReturnTo: screen.returnTo, document: 'terms' })}
        />
      );
      break;
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
    case 'history':
      content = <HistoryScreen items={items} onBack={goBack} />;
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
          onSignIn={async () => setScreen({ name: 'auth', returnTo: 'settings' })}
          onSignOut={disconnectAccount}
          onDeleteAccount={removeAccount}
          onRefreshAccount={refreshAccount}
          onGrantAiConsent={grantAiConsent}
          onRevokeAiConsent={revokeAiConsent}
          onDeleteAllData={deleteAllLocalData}
          onPrivacy={() => setScreen({ name: 'privacy', returnTo: 'settings', document: 'privacy' })}
          onTerms={() => setScreen({ name: 'privacy', returnTo: 'settings', document: 'terms' })}
          onBack={goBack}
        />
      );
      break;
    case 'privacy':
      content = <PrivacyPolicyScreen document={screen.document ?? 'privacy'} onBack={goBack} />;
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
          onSignIn={async () => setScreen({ name: 'auth', returnTo: 'home' })}
          onFavorites={() => setScreen({ name: 'favorites' })}
          onHistory={() => setScreen({ name: 'history' })}
          favoriteCount={favorites.length}
          account={account}
        />
      );
  }

  return (
    <LocalizationProvider language={language} onLanguageChange={changeLanguage}>
      <View style={styles.safeArea}>
        <StatusBar style="dark" />
        {content}
        {recentlyDeleted ? (
          <View style={styles.undoBar}>
            <Text numberOfLines={1} style={styles.undoText}>
              {t('feedback.deleted', { name: recentlyDeleted.name || t('common.clothing') })}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void undoDelete()} hitSlop={10}>
              <Text style={styles.undoAction}>{t('feedback.undo')}</Text>
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
      </View>
    </LocalizationProvider>
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

