import { requireOptionalNativeModule } from 'expo-modules-core';

interface UpdateInstallerNativeModule {
  isSupported(): Promise<boolean>;
  canRequestPackageInstalls(): Promise<boolean>;
  openUnknownAppsSettings(): Promise<void>;
  openInstaller(contentUri: string): Promise<void>;
}

const nativeModule = requireOptionalNativeModule<UpdateInstallerNativeModule>('OutfitUpdateInstaller');

function requireInstaller(): UpdateInstallerNativeModule {
  if (!nativeModule) {
    throw new Error('Bu sürüm uygulama içinden kurulumu desteklemiyor. Yeni APK ile tekrar dene.');
  }
  return nativeModule;
}

export async function isUpdateInstallerSupported(): Promise<boolean> {
  return nativeModule ? nativeModule.isSupported() : false;
}

export async function canRequestPackageInstalls(): Promise<boolean> {
  return requireInstaller().canRequestPackageInstalls();
}

export async function openUnknownAppsSettings(): Promise<void> {
  await requireInstaller().openUnknownAppsSettings();
}

export async function openInstaller(contentUri: string): Promise<void> {
  await requireInstaller().openInstaller(contentUri);
}
