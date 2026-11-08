import { deleteSetting, getSetting, setSetting } from '../data/database';
import { secureSessionModule } from '../../modules/outfit-secure-session/src';

export async function getSecureSession(key: string): Promise<string | null> {
  if (!secureSessionModule) return getSetting(key);
  const secured = await secureSessionModule.getItem(key);
  if (secured) return secured;

  const legacy = await getSetting(key);
  if (legacy) {
    await secureSessionModule.setItem(key, legacy);
    await deleteSetting(key);
  }
  return legacy;
}

export async function setSecureSession(key: string, value: string): Promise<void> {
  if (!secureSessionModule) {
    await setSetting(key, value);
    return;
  }
  await secureSessionModule.setItem(key, value);
  await deleteSetting(key);
}

export async function deleteSecureSession(key: string): Promise<void> {
  await secureSessionModule?.deleteItem(key);
  await deleteSetting(key);
}
