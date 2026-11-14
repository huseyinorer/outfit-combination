import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export interface PrepareProgressEvent {
  bytesDownloaded: number;
  totalBytes: number;
}

type SubjectSegmenterEvents = {
  onPrepareProgress: (event: PrepareProgressEvent) => void;
};

declare class SubjectSegmenterNativeModule extends NativeModule<SubjectSegmenterEvents> {
  prepare(): Promise<boolean>;
  removeBackground(uri: string): Promise<string>;
}

export const subjectSegmenterModule = requireOptionalNativeModule<SubjectSegmenterNativeModule>('OutfitSubjectSegmenter');
