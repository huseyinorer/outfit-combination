import Constants from 'expo-constants';
import type { MobileVersionInfo } from '../domain/version';

const cleanBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/$/, '');

export function getCurrentAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

export async function fetchMobileVersion(
  baseUrl: string,
  timeoutMs = 90_000,
): Promise<MobileVersionInfo> {
  const cleanUrl = cleanBaseUrl(baseUrl);
  if (!cleanUrl) throw new Error('Sürüm kontrolü için API adresi ayarlanmamış.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${cleanUrl}/api/version`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Sürüm servisi yanıt vermedi (${response.status}).`);
    return (await response.json()) as MobileVersionInfo;
  } finally {
    clearTimeout(timeout);
  }
}
