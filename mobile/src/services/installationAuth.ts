import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import { getSetting, setSetting } from '../data/database';
import { normalizeApiBaseUrl } from '../domain/apiUrl';

const INSTALLATION_ID_KEY = 'installation_id';
const ACCESS_KEY = 'installation_access';
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1_000;

interface StoredAccess {
  baseUrl: string;
  accessToken: string;
  expiresAt: string;
}

const registrationPromises = new Map<string, Promise<string>>();

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

async function register(baseUrl: string, signal?: AbortSignal): Promise<string> {
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
    let message = `Uygulama erişimi hazırlanamadı (${response.status}).`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Sunucunun JSON olmayan hata yanıtında güvenli varsayılan mesajı koru.
    }
    throw new Error(message);
  }

  const body = (await response.json()) as Partial<StoredAccess>;
  if (!body.accessToken || !body.expiresAt) throw new Error('Sunucu geçerli bir uygulama erişimi döndürmedi.');
  const access: StoredAccess = { baseUrl, accessToken: body.accessToken, expiresAt: body.expiresAt };
  await setSetting(ACCESS_KEY, JSON.stringify(access));
  return access.accessToken;
}

async function getAccessToken(baseUrl: string, forceRefresh = false, signal?: AbortSignal): Promise<string> {
  const cleanUrl = normalizeApiBaseUrl(baseUrl);
  if (!cleanUrl) throw new Error('API adresi ayarlanmamış.');

  if (!forceRefresh) {
    const stored = parseStoredAccess(await getSetting(ACCESS_KEY), cleanUrl);
    if (stored) return stored.accessToken;
  }

  const existing = registrationPromises.get(cleanUrl);
  if (existing) return existing;
  const pending = register(cleanUrl, signal).finally(() => registrationPromises.delete(cleanUrl));
  registrationPromises.set(cleanUrl, pending);
  return pending;
}

export async function authenticatedFetch(
  baseUrl: string,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const cleanUrl = normalizeApiBaseUrl(baseUrl);
  const send = async (forceRefresh: boolean) => {
    const token = await getAccessToken(cleanUrl, forceRefresh, signal);
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return expoFetch(`${cleanUrl}${path}`, { ...init, headers, signal });
  };

  let response = await send(false);
  if (response.status === 401) response = await send(true);
  return response;
}
