import { subjectSegmenterModule } from '../../modules/outfit-subject-segmenter/src';
import { adoptProcessedImage } from './imageStorage';
import { reportError } from './observability';

export interface BackgroundRemovalResult {
  resultUri: string;
  usedNativeModule: boolean;
}

const TIMEOUT_MS = 90_000;

export function isBackgroundRemovalAvailable(): boolean {
  return subjectSegmenterModule !== null;
}

export function prepareBackgroundRemoval(): void {
  subjectSegmenterModule?.prepare().catch(() => undefined);
}

export async function removeBackground(photoUri: string): Promise<BackgroundRemovalResult> {
  if (!subjectSegmenterModule) return { resultUri: photoUri, usedNativeModule: false };
  try {
    const processed = await Promise.race([
      subjectSegmenterModule.removeBackground(photoUri),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Background removal timed out')), TIMEOUT_MS)),
    ]);
    const baseName = (photoUri.split('/').pop() ?? 'photo').replace(/\.[^.]+$/, '');
    const resultUri = await adoptProcessedImage(processed, `${baseName}-bg-${Date.now()}`);
    return { resultUri, usedNativeModule: true };
  } catch (error) {
    console.warn('[bg-removal] failed', error instanceof Error ? error.message : String(error));
    reportError(error, { stage: 'backgroundRemoval.process' });
    return { resultUri: photoUri, usedNativeModule: false };
  }
}
