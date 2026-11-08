import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import { getSetting, setSetting } from '../data/database';
import { normalizeApiBaseUrl } from '../domain/apiUrl';
import type { AppLanguage } from '../locales';
import { deleteSecureSession, getSecureSession, setSecureSession } from './secureSessionStorage';

const INSTALLATION_ID_KEY = 'installation_id';
const ACCESS_KEY = 'installation_access';
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1_000;

interface StoredAccess {
  baseUrl: string;
  accessToken: string;
  expiresAt: string;
}

const registrationPromises = new Map<string, Promise<string>>();
const message = (language: AppLanguage, turkish: string, english: string) => language === 'tr' ? turkish : english;

async function installationId(): Promise<string> {
  const stored = await getSetting(INSTALLATION_ID_KEY);
  if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
  const created = Crypto.randomUUID();
  await setSetting(INSTALLATION_ID_KEY, created);
  return created;
}

function parseStoredAccess(raw: string | null, baseUrl: string): StoredAccess | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAccess>;
    if (
      parsed.baseUrl !== baseUrl
      || typeof parsed.accessToken !== 'string'
      || typeof parsed.expiresAt !== 'string'
      || Date.parse(parsed.expiresAt) <= Date.now() + REFRESH_MARGIN_MS
    ) return null;
    return parsed as StoredAccess;
  } catch {
    return null;
  }
}

async function register(baseUrl: string, signal: AbortSignal | undefined, language: AppLanguage): Promise<string> {
  const response = await expoFetch(`${baseUrl}/api/installations/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installationId: await installationId(),
      appVersion: Constants.expoConfig?.version ?? 'unknown',
    }),
    signal,
  });
  if (!response.ok) {
    let errorMessage = message(language, `Uygulama erişimi hazırlanamadı (${response.status}).`, `App access could not be prepared (${response.status}).`);
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message && language === 'tr') errorMessage = body.message;
    } catch {
      // Sunucunun JSON olmayan hata yanıtında güvenli varsayılan mesajı koru.
    }
    throw new Error(errorMessage);
  }

  const body = (await response.json()) as Partial<StoredAccess>;
  if (!body.accessToken || !body.expiresAt) throw new Error(message(language, 'Sunucu geçerli bir uygulama erişimi döndürmedi.', 'The service did not return valid app access.'));
  const access: StoredAccess = { baseUrl, accessToken: body.accessToken, expiresAt: body.expiresAt };
  await setSecureSession(ACCESS_KEY, JSON.stringify(access));
  return access.accessToken;
}

async function getAccessToken(
  baseUrl: string,
  forceRefresh = false,
  signal?: AbortSignal,
  language: AppLanguage = 'tr',
): Promise<string> {
  const cleanUrl = normalizeApiBaseUrl(baseUrl);
  if (!cleanUrl) throw new Error(message(language, 'Sunucu adresi ayarlanmamış.', 'The service address is not configured.'));

  if (!forceRefresh) {
    const stored = parseStoredAccess(await getSecureSession(ACCESS_KEY), cleanUrl);
    if (stored) return stored.accessToken;
  }

  const existing = registrationPromises.get(cleanUrl);
  if (existing) return existing;
  const pending = register(cleanUrl, signal, language).finally(() => registrationPromises.delete(cleanUrl));
  registrationPromises.set(cleanUrl, pending);
  return pending;
}

export async function installationAuthenticatedFetch(
  baseUrl: string,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  language: AppLanguage = 'tr',
): Promise<Response> {
  const cleanUrl = normalizeApiBaseUrl(baseUrl);
  const send = async (forceRefresh: boolean) => {
    const token = await getAccessToken(cleanUrl, forceRefresh, signal, language);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return expoFetch(`${cleanUrl}${path}`, { ...init, headers, signal });
  };

  let response = await send(false);
  if (response.status === 401) response = await send(true);
  return response;
}

export async function clearInstallationAccess(): Promise<void> {
  await deleteSecureSession(ACCESS_KEY);
}
