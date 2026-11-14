import { requireOptionalNativeModule } from 'expo-modules-core';

interface SubjectSegmenterNativeModule {
  prepare(): Promise<boolean>;
  removeBackground(uri: string): Promise<string>;
}

export const subjectSegmenterModule = requireOptionalNativeModule<SubjectSegmenterNativeModule>('OutfitSubjectSegmenter');
