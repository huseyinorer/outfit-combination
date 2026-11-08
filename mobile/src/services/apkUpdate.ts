import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  canRequestPackageInstalls,
  isUpdateInstallerSupported,
  openInstaller,
  openUnknownAppsSettings,
} from '../../modules/outfit-update-installer/src';
import type { AppLanguage } from '../locales';

export interface ApkDownloadProgress {
  bytesWritten: number;
  totalBytes: number | null;
  fraction: number | null;
}

export async function isDirectApkInstallAvailable(): Promise<boolean> {
  return Platform.OS === 'android' && isUpdateInstallerSupported();
}

function safeVersion(version: string): string {
  return version.replace(/[^0-9A-Za-z._-]/g, '-');
}

export async function downloadApk(
  url: string,
  version: string,
  onProgress: (progress: ApkDownloadProgress) => void,
  language: AppLanguage = 'tr',
): Promise<string> {
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  if (Platform.OS !== 'android') throw new Error(l('Doğrudan güncelleme yalnızca Android için kullanılabilir.', 'Direct updates are available only on Android.'));
  if (!url.toLowerCase().startsWith('https://')) throw new Error(l('Güncelleme bağlantısı güvenli değil.', 'The update link is not secure.'));
  if (!FileSystem.cacheDirectory) throw new Error(l('Güncelleme için geçici depolama alanı açılamadı.', 'Temporary update storage could not be opened.'));

  const destination = `${FileSystem.cacheDirectory}outfit-combination-${safeVersion(version)}.apk`;
  await FileSystem.deleteAsync(destination, { idempotent: true });

  const download = FileSystem.createDownloadResumable(
    url,
    destination,
    {},
    ({ totalBytesExpectedToWrite, totalBytesWritten }) => {
      const hasTotal = totalBytesExpectedToWrite > 0;
      onProgress({
        bytesWritten: totalBytesWritten,
        totalBytes: hasTotal ? totalBytesExpectedToWrite : null,
        fraction: hasTotal
          ? Math.max(0, Math.min(1, totalBytesWritten / totalBytesExpectedToWrite))
          : null,
      });
    },
  );

  const result = await download.downloadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(l('Güncelleme dosyası indirilemedi. Bağlantını kontrol edip yeniden dene.', 'The update could not be downloaded. Check your connection and try again.'));
  }

  return FileSystem.getContentUriAsync(result.uri);
}

export async function launchApkInstaller(
  contentUri: string,
  openSettingsWhenMissing = true,
): Promise<'opened' | 'permission-required'> {
  if (!await canRequestPackageInstalls()) {
    if (openSettingsWhenMissing) await openUnknownAppsSettings();
    return 'permission-required';
  }
  await openInstaller(contentUri);
  return 'opened';
}
