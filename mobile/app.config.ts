import type { ExpoConfig } from 'expo/config';
import appVersion from './app-version.json';

const easProjectId = '59dce122-82ee-47b4-a212-64ff019c662b';
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const directApkUpdatesEnabled = process.env.EXPO_PUBLIC_DIRECT_APK_UPDATES === 'true';

const config: ExpoConfig = {
  name: 'Outfit Combination',
  slug: 'outfit-combination',
  version: appVersion.version,
  scheme: 'outfitcombination',
  icon: './assets/icon.png',
  orientation: 'default',
  android: {
    package: 'com.krofosyonel.outfitcombination',
    permissions: [
      'CAMERA',
      'READ_MEDIA_IMAGES',
      ...(directApkUpdatesEnabled ? ['android.permission.REQUEST_INSTALL_PACKAGES'] : []),
    ],
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1F2122',
    },
  },
  ios: {
    bundleIdentifier: 'com.krofosyonel.outfitcombination',
    supportsTablet: true,
    buildNumber: appVersion.version,
    infoPlist: {
      NSCameraUsageDescription:
        'Kıyafet fotoğrafı çekmek için kamera erişimi gerekir. / Camera access is required to photograph clothing.',
      NSPhotoLibraryUsageDescription:
        'Kıyafet eklemek için galeri erişimi gerekir. / Photo library access is required to add clothing.',
      NSPhotoLibraryAddUsageDescription:
        'Kombin kartlarını kaydetmek için galeriye yazma izni gerekir. / Write access is required to save outfit cards to your library.',
      ITSAppUsesNonExemptEncryption: false,
      CFBundleAllowMixedLocalizations: true,
      CFBundleLocalizations: ['tr', 'en'],
      UIBackgroundModes: [],
      UIRequiresFullScreen: false,
    },
    config: {
      usesNonExemptEncryption: false,
    },
    associatedDomains: [],
  },
  plugins: [
    './plugins/with-outfit-theme.cjs',
    'expo-sqlite',
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: appEnvironment === 'development',
        },
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Kıyafet eklemek için galeri erişimi gerekir. / Photo library access is required to add clothing.',
        cameraPermission: 'Kıyafet fotoğrafı çekmek için kamera erişimi gerekir. / Camera access is required to photograph clothing.',
        microphonePermission: false,
      },
    ],
  ],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL
      ?? 'https://huseyinorer.github.io/outfit-combination/privacy.html',
    appEnvironment,
    internalTools: process.env.EXPO_PUBLIC_INTERNAL_TOOLS === 'true' || appEnvironment === 'development',
    eas: {
      projectId: easProjectId,
    },
  },
};

export default config;

