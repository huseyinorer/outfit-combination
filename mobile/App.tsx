import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { UpdateGate } from './src/components/UpdateGate';
import {
  getPendingDraft,
  getSetting,
  initializeDatabase,
  insertClothing,
  listClothing,
  removeClothing,
  savePendingDraft,
  setSetting,
  updateClothing,
} from './src/data/database';
import type { Category, ClothingDraft, ClothingItem, OutfitSuggestion } from './src/domain/types';
import { evaluateVersion, type MobileVersionInfo, type VersionDecision } from './src/domain/version';
import { deleteStoredImage } from './src/services/imageStorage';
import { fetchMobileVersion, getCurrentAppVersion } from './src/services/version';
import { AddClothingScreen } from './src/screens/AddClothingScreen';
import { EditClothingScreen } from './src/screens/EditClothingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RecommendScreen } from './src/screens/RecommendScreen';
import { ResultsScreen } from './src/screens/ResultsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme/theme';

type Screen =
  | { name: 'home' }
  | { name: 'add'; category?: Category; resume?: boolean }
  | { name: 'edit'; item: ClothingItem }
  | { name: 'recommend' }
  | { name: 'results'; suggestions: OutfitSuggestion[]; warning?: string }
  | { name: 'settings' };

const bundledApiUrl = String(Constants.expoConfig?.extra?.apiBaseUrl ?? '');

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [pendingDraft, setPendingDraftState] = useState<ClothingDraft | null>(null);
  const [demoMode, setDemoMode] = useState(true);
  const [apiUrl, setApiUrl] = useState(bundledApiUrl);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [versionInfo, setVersionInfo] = useState<MobileVersionInfo | null>(null);
  const [versionDecision, setVersionDecision] = useState<VersionDecision | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const currentVersion = getCurrentAppVersion();

  const refresh = async () => setItems(await listClothing());

  useEffect(() => {
    const start = async () => {
      try {
        await initializeDatabase();
        const [storedItems, draft, storedDemo, storedApi] = await Promise.all([
          listClothing(),
          getPendingDraft(),
          getSetting('demo_mode'),
          getSetting('api_url'),
        ]);
        setItems(storedItems);
        setPendingDraftState(draft);
        setDemoMode(storedDemo === null ? true : storedDemo === 'true');
        setApiUrl(storedApi ?? bundledApiUrl);
      } catch (error) {
        setStartupError(error instanceof Error ? error.message : 'Veritabanı açılamadı.');
      } finally {
        setReady(true);
      }
    };
    start();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const versionApiUrl = bundledApiUrl || apiUrl;
    if (!versionApiUrl) return;

    fetchMobileVersion(versionApiUrl)
      .then((info) => {
        setVersionInfo(info);
        setVersionDecision(evaluateVersion(currentVersion, info));
      })
      .catch(() => {
        // Sürüm sunucusu kapalıyken demo ve yerel özellikler kullanılabilsin.
      });
  }, [apiUrl, currentVersion, ready]);

  const persistDraft = async (draft: ClothingDraft | null) => {
    await savePendingDraft(draft);
    setPendingDraftState(draft);
  };

  const saveNewItem = async (item: ClothingItem) => {
    await insertClothing(item);
    await refresh();
    setScreen({ name: 'home' });
  };

  const saveEditedItem = async (item: ClothingItem) => {
    await updateClothing(item);
    await refresh();
    setScreen({ name: 'home' });
  };

  const deleteItem = async (item: ClothingItem) => {
    await removeClothing(item.id);
    deleteStoredImage(item.photoUri);
    deleteStoredImage(item.cutoutUri);
    await refresh();
    setScreen({ name: 'home' });
  };

  const saveSettings = async (nextDemo: boolean, nextApiUrl: string) => {
    await Promise.all([
      setSetting('demo_mode', String(nextDemo)),
      setSetting('api_url', nextApiUrl),
    ]);
    setDemoMode(nextDemo);
    setApiUrl(nextApiUrl);
    setScreen({ name: 'home' });
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
          demoMode={demoMode}
          initialCategory={screen.category}
          initialDraft={screen.resume ? pendingDraft : null}
          onPersistDraft={persistDraft}
          onSave={saveNewItem}
          onBack={() => setScreen({ name: 'home' })}
        />
      );
      break;
    case 'edit':
      content = (
        <EditClothingScreen
          item={screen.item}
          onSave={saveEditedItem}
          onDelete={deleteItem}
          onBack={() => setScreen({ name: 'home' })}
        />
      );
      break;
    case 'recommend':
      content = (
        <RecommendScreen
          items={items}
          demoMode={demoMode}
          apiUrl={apiUrl}
          onBack={() => setScreen({ name: 'home' })}
          onAddCategory={(category) => setScreen({ name: 'add', category })}
          onResults={(suggestions, warning) => setScreen({ name: 'results', suggestions, warning })}
        />
      );
      break;
    case 'results':
      content = (
        <ResultsScreen
          items={items}
          suggestions={screen.suggestions}
          warning={screen.warning}
          onBack={() => setScreen({ name: 'recommend' })}
        />
      );
      break;
    case 'settings':
      content = <SettingsScreen demoMode={demoMode} apiUrl={apiUrl} onSave={saveSettings} onBack={() => setScreen({ name: 'home' })} />;
      break;
    default:
      content = (
        <HomeScreen
          items={items}
          pendingDraft={pendingDraft}
          demoMode={demoMode}
          onAdd={(category) => setScreen({ name: 'add', category })}
          onRecommend={() => setScreen({ name: 'recommend' })}
          onOpen={(item) => setScreen({ name: 'edit', item })}
          onResumeDraft={() => setScreen({ name: 'add', resume: true })}
          onSettings={() => setScreen({ name: 'settings' })}
        />
      );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {content}
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
  safeArea: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, backgroundColor: colors.background },
  loading: { color: colors.text, fontSize: 16, fontWeight: '700' },
  errorTitle: { color: colors.text, fontSize: 23, fontWeight: '900' },
  errorText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
});

