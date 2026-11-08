import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { MobileVersionInfo, VersionDecision } from '../domain/version';
import { downloadApk, isDirectApkInstallAvailable, launchApkInstaller } from '../services/apkUpdate';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

type UpdatePhase = 'idle' | 'downloading' | 'permission' | 'installer' | 'error';

interface UpdateGateProps {
  currentVersion: string;
  info: MobileVersionInfo | null;
  decision: VersionDecision | null;
  dismissed: boolean;
  onDismiss: () => void;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UpdateGate({
  currentVersion,
  info,
  decision,
  dismissed,
  onDismiss,
}: UpdateGateProps) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [fraction, setFraction] = useState<number | null>(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canInstallDirectly, setCanInstallDirectly] = useState<boolean | null>(
    Platform.OS === 'android' ? null : false,
  );
  const contentUriRef = useRef<string | null>(null);
  const leftForPermissionRef = useRef(false);
  const visible = Boolean(
    info?.androidDownloadUrl
      && decision?.updateAvailable
      && (!dismissed || decision.updateRequired),
  );

  const openInstaller = useCallback(async (contentUri: string, openSettingsWhenMissing: boolean) => {
    try {
      const result = await launchApkInstaller(contentUri, openSettingsWhenMissing);
      setPhase(result === 'opened' ? 'installer' : 'permission');
      if (result === 'permission-required') {
        leftForPermissionRef.current = AppState.currentState !== 'active';
      }
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : l('Kurulum ekranı açılamadı.', 'Could not open the installer.'));
      setPhase('error');
    }
  }, [language]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      void isDirectApkInstallAvailable().then(setCanInstallDirectly).catch(() => setCanInstallDirectly(false));
    }
  }, []);

  useEffect(() => {
    if (phase !== 'permission') return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') leftForPermissionRef.current = true;
      if (state === 'active' && leftForPermissionRef.current && contentUriRef.current) {
        leftForPermissionRef.current = false;
        void openInstaller(contentUriRef.current, false);
      }
    });
    return () => subscription.remove();
  }, [openInstaller, phase]);

  useEffect(() => {
    setPhase('idle');
    setFraction(0);
    setDownloadedBytes(0);
    setTotalBytes(null);
    setError(null);
    contentUriRef.current = null;
  }, [info?.latestVersion]);

  if (!info || !decision) return null;

  const startUpdate = async () => {
    if (!info.androidDownloadUrl) return;
    if (canInstallDirectly === null) return;
    if (!canInstallDirectly) {
      try {
        await Linking.openURL(info.androidDownloadUrl);
      } catch {
        setError(l('Güncelleme bağlantısı açılamadı. İnternet bağlantını kontrol edip yeniden dene.', 'Could not open the update link. Check your connection and try again.'));
        setPhase('error');
      }
      return;
    }

    setError(null);
    setFraction(0);
    setDownloadedBytes(0);
    setTotalBytes(null);
    setPhase('downloading');
    try {
      const contentUri = await downloadApk(info.androidDownloadUrl, info.latestVersion, (progress) => {
        setFraction(progress.fraction);
        setDownloadedBytes(progress.bytesWritten);
        setTotalBytes(progress.totalBytes);
      }, language);
      contentUriRef.current = contentUri;
      setFraction(1);
      await openInstaller(contentUri, true);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : l('Güncelleme indirilemedi.', 'Could not download the update.'));
      setPhase('error');
    }
  };

  const retryInstaller = () => {
    if (contentUriRef.current) void openInstaller(contentUriRef.current, true);
    else void startUpdate();
  };

  const busy = phase === 'downloading';
  const closeAllowed = !decision.updateRequired && !busy;
  const progressLabel = totalBytes
    ? `${formatMegabytes(downloadedBytes)} / ${formatMegabytes(totalBytes)}`
    : downloadedBytes > 0
      ? l(`${formatMegabytes(downloadedBytes)} indirildi`, `${formatMegabytes(downloadedBytes)} downloaded`)
      : l('İndirme hazırlanıyor…', 'Preparing download…');

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      statusBarTranslucent
      transparent
      visible={visible}
      onRequestClose={closeAllowed ? onDismiss : () => undefined}
    >
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.card}>
          <Text style={styles.eyebrow}>{t('update.eyebrow')}</Text>
          <Text style={styles.title}>
            {decision.updateRequired ? t('update.required') : t('update.ready')}
          </Text>

          {phase === 'downloading' ? (
            <>
              <Text style={styles.body}>{l('Güncelleme uygulamadan çıkmadan indiriliyor.', 'The update is downloading without leaving the app.')}</Text>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: Math.round((fraction ?? 0) * 100) }}
                style={styles.progressTrack}
              >
                <View style={[styles.progressFill, { width: `${Math.round((fraction ?? 0) * 100)}%` }]} />
              </View>
              <View style={styles.progressRow}>
                <Text style={styles.progressText}>{progressLabel}</Text>
                {fraction === null ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.progressPercent}>{Math.round(fraction * 100)}%</Text>
                )}
              </View>
            </>
          ) : phase === 'permission' ? (
            <>
              <Text style={styles.body}>
                {l('Android, ilk uygulama içi güncellemede bu kaynaktan kuruluma izin vermeni ister. İzni açıp geri döndüğünde kurulum otomatik devam eder.', 'Android asks you to allow installation from this source the first time. Return after enabling it and installation will continue automatically.')}
              </Text>
              <Pressable style={styles.primaryButton} onPress={retryInstaller}>
                <Text style={styles.primaryLabel}>{l('İzin ekranını yeniden aç', 'Open permission screen again')}</Text>
              </Pressable>
            </>
          ) : phase === 'installer' ? (
            <>
              <Text style={styles.body}>
                {l('Güncelleme indirildi. Android kurulum ekranında “Güncelle” seçeneğine dokunarak işlemi tamamla.', 'The update is downloaded. Tap “Update” on the Android installer screen to finish.')}
              </Text>
              <Pressable style={styles.primaryButton} onPress={retryInstaller}>
                <Text style={styles.primaryLabel}>{l('Kurulum ekranını aç', 'Open installer')}</Text>
              </Pressable>
            </>
          ) : phase === 'error' ? (
            <>
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error ?? l('Güncelleme tamamlanamadı.', 'The update could not be completed.')}</Text>
              </View>
              <Pressable style={styles.primaryButton} onPress={() => void startUpdate()}>
                <Text style={styles.primaryLabel}>{t('common.retry')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.body}>
                {l(`Sürüm ${info.latestVersion} hazır. İndirme bitince Android yalnızca kurulum onayını isteyecek; dolabın ve fotoğrafların korunacak.`, `Version ${info.latestVersion} is ready. Android will only request installation approval after download; your wardrobe and photos will be preserved.`)}
              </Text>
              <Pressable
                disabled={canInstallDirectly === null}
                style={[styles.primaryButton, canInstallDirectly === null && styles.disabledButton]}
                onPress={() => void startUpdate()}
              >
                <Text style={styles.primaryLabel}>
                  {canInstallDirectly === null ? t('update.preparing') : canInstallDirectly ? t('update.download') : t('update.open')}
                </Text>
              </Pressable>
            </>
          )}

          {closeAllowed ? (
            <Pressable style={styles.secondaryButton} onPress={onDismiss}>
              <Text style={styles.secondaryLabel}>{t('common.later')}</Text>
            </Pressable>
          ) : null}
          <Text style={styles.versionText}>{t('update.installed', { version: currentVersion })}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(24, 23, 20, 0.68)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.text, fontSize: 24, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  progressTrack: { height: 10, overflow: 'hidden', borderRadius: 8, backgroundColor: colors.primarySoft },
  progressFill: { height: '100%', borderRadius: 8, backgroundColor: colors.primary },
  progressRow: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  progressText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  progressPercent: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  errorBox: { borderRadius: radius.sm, padding: spacing.md, backgroundColor: '#F8E2DF' },
  errorText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  primaryLabel: { color: colors.white, fontSize: 16, fontWeight: '900' },
  disabledButton: { opacity: 0.55 },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { color: colors.text, fontSize: 15, fontWeight: '800' },
  versionText: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
