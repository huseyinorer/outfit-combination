import { requireOptionalNativeModule } from 'expo-modules-core';

interface SecureSessionNativeModule {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  deleteItem(key: string): Promise<void>;
}

export const secureSessionModule = requireOptionalNativeModule<SecureSessionNativeModule>('OutfitSecureSession');
