import type { ExpoConfig } from 'expo/config';
import appVersion from './app-version.json';

const easProjectId = '59dce122-82ee-47b4-a212-64ff019c662b';
const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

const config: ExpoConfig = {
  name: 'Outfit Combination',
  slug: 'outfit-combination',
  version: appVersion.version,
  icon: './assets/icon.png',
  orientation: 'default',
  userInterfaceStyle: 'light',
  android: {
    package: 'com.krofosyonel.outfitcombination',
    permissions: ['CAMERA', 'READ_MEDIA_IMAGES'],
    softwareKeyboardLayoutMode: 'resize',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#F7F3EA',
    },
  },
  plugins: [
    'expo-updates',
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
        photosPermission: 'Kıyafet fotoğraflarını dolabına eklemek için galeri erişimi gerekir.',
        cameraPermission: 'Kıyafet fotoğrafı çekmek için kamera erişimi gerekir.',
        microphonePermission: false,
      },
    ],
  ],
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: `https://u.expo.dev/${easProjectId}`,
    checkAutomatically: 'ON_LOAD',
    fallbackToCacheTimeout: 0,
  },
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL
      ?? 'https://huseyinorer.github.io/outfit-combination/',
    appEnvironment,
    eas: {
      projectId: easProjectId,
    },
  },
};

export default config;

