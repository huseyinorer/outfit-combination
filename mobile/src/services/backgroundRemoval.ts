import { Platform } from 'react-native';
import { reportError } from './observability';

export interface BackgroundRemovalResult {
  resultUri: string;
  usedNativeModule: boolean;
}

type NativeApi = (uri: string) => Promise<string>;

let cached: NativeApi | null | undefined;

function loadNative(): NativeApi | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    cached = null;
    return cached;
  }
  try {
    const mod = require('react-native-background-remover') as { removeBackground?: NativeApi };
    cached = typeof mod?.removeBackground === 'function' ? mod.removeBackground : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function isBackgroundRemovalAvailable(): boolean {
  return loadNative() !== null;
}

export async function removeBackground(photoUri: string): Promise<BackgroundRemovalResult> {
  const native = loadNative();
  if (!native) {
    return { resultUri: photoUri, usedNativeModule: false };
  }
  try {
    const resultUri = await native(photoUri);
    if (!resultUri || resultUri === photoUri) {
      return { resultUri: photoUri, usedNativeModule: false };
    }
    return { resultUri, usedNativeModule: true };
  } catch (error) {
    reportError(error, { stage: 'backgroundRemoval.process' });
    return { resultUri: photoUri, usedNativeModule: false };
  }
}
