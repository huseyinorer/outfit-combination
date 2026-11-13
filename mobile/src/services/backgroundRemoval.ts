import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { reportError } from './observability';

export interface BackgroundRemovalResult {
  resultUri: string;
  usedNativeModule: boolean;
}

type SegmenterModule = {
  process: (uri: string) => Promise<{ maskUri?: string; resultUri?: string }>;
};

let cachedModule: SegmenterModule | null | undefined;

function loadNativeSegmenter(): SegmenterModule | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    const mod = require('@react-native-ml-kit/subject-segmentation') as unknown;
    if (mod && typeof (mod as { default?: unknown }).default === 'object') {
      cachedModule = (mod as { default: SegmenterModule }).default;
    } else if (mod && typeof (mod as SegmenterModule).process === 'function') {
      cachedModule = mod as SegmenterModule;
    } else {
      cachedModule = null;
    }
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export function isBackgroundRemovalAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return loadNativeSegmenter() !== null;
}

export async function removeBackground(photoUri: string): Promise<BackgroundRemovalResult> {
  const native = loadNativeSegmenter();
  if (!native) {
    return { resultUri: photoUri, usedNativeModule: false };
  }
  try {
    const result = await native.process(photoUri);
    const nextUri = result.resultUri ?? result.maskUri;
    if (!nextUri) {
      return { resultUri: photoUri, usedNativeModule: false };
    }
    const info = await FileSystem.getInfoAsync(nextUri);
    if (!info.exists) {
      return { resultUri: photoUri, usedNativeModule: false };
    }
    return { resultUri: nextUri, usedNativeModule: true };
  } catch (error) {
    reportError(error, { stage: 'backgroundRemoval.process' });
    return { resultUri: photoUri, usedNativeModule: false };
  }
}
