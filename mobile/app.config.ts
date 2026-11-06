import type { ExpoConfig } from 'expo/config';
import appVersion from './app-version.json';

const easProjectId = '59dce122-82ee-47b4-a212-64ff019c662b';

const config: ExpoConfig = {
  name: 'Outfit Combination',
  slug: 'outfit-combination',
  version: appVersion.version,
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  android: {
    package: 'com.krofosyonel.outfitcombination',
    permissions: ['CAMERA', 'READ_MEDIA_IMAGES'],
  },
  plugins: [
    'expo-updates',
    'expo-sqlite',
    [
      'expo-build-properties',
      {
        android: {
          usesCleartextTraffic: true,
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
    appEnvironment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    eas: {
      projectId: easProjectId,
    },
  },
};

export default config;

