import { AppState, Linking } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { deleteSetting, getSetting, setSetting } from '../data/database';
import { normalizeApiBaseUrl } from '../domain/apiUrl';
import { installationAuthenticatedFetch } from './installationAuth';

const SESSION_KEY = 'account_session_v1';
const CONFIG_TTL_MS = 5 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 90_000;

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
  pictureUrl: string | null;
}

export interface AccountUsage {
  dailyAnalysisUsed: number;
  dailyAnalysisLimit: number;
  monthlyAnalysisUsed: number;
  monthlyAnalysisLimit: number;
  dailyOutfitUsed: number;
  dailyOutfitLimit: number;
  monthlyOutfitUsed: number;
  monthlyOutfitLimit: number;
}

interface StoredSession {
  baseUrl: string;
  accessToken: string;
  expiresAt: string;
  user: AccountUser;
  usage: AccountUsage | null;
}

export interface AccountState {
  enabled: boolean;
  user: AccountUser | null;
  usage: AccountUsage | null;
  stale?: boolean;
}

interface ConfigCache {
  enabled: boolean;
  expiresAt: number;
}

const configCache = new Map<string, ConfigCache>();
let initialLinkChecked = false;

function cleanUrl(baseUrl: string): string {
  const value = normalizeApiBaseUrl(baseUrl);
  if (!value) throw new Error('API adresi ayarlanmamış.');
  return value;
}

async function withTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await expoFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function accountConfig(baseUrl: string, force = false): Promise<boolean> {
  const cleanBaseUrl = cleanUrl(baseUrl);
  const cached = configCache.get(cleanBaseUrl);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.enabled;
  const response = await withTimeout(`${cleanBaseUrl}/api/account/config`);
  if (response.status === 404) {
    configCache.set(cleanBaseUrl, { enabled: false, expiresAt: Date.now() + CONFIG_TTL_MS });
    return false;
  }
  if (!response.ok) throw new Error(await readError(response, 'Hesap servisine ulaşılamadı.'));
  const body = (await response.json()) as { enabled?: boolean };
  const enabled = body.enabled === true;
  configCache.set(cleanBaseUrl, { enabled, expiresAt: Date.now() + CONFIG_TTL_MS });
  return enabled;
}

function parseSession(raw: string | null, baseUrl: string): StoredSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredSession>;
    if (
      value.baseUrl !== baseUrl
      || typeof value.accessToken !== 'string'
      || typeof value.expiresAt !== 'string'
      || Date.parse(value.expiresAt) <= Date.now()
      || !value.user
      || typeof value.user.id !== 'string'
    ) return null;
    return value as StoredSession;
  } catch {
    return null;
  }
}

async function storedSession(baseUrl: string): Promise<StoredSession | null> {
  const session = parseSession(await getSetting(SESSION_KEY), baseUrl);
  if (!session) await deleteSetting(SESSION_KEY);
  return session;
}

async function saveSession(session: StoredSession): Promise<void> {
  await setSetting(SESSION_KEY, JSON.stringify(session));
}

export async function loadAccountState(baseUrl: string): Promise<AccountState> {
  const cleanBaseUrl = cleanUrl(baseUrl);
  const enabled = await accountConfig(cleanBaseUrl);
  if (!enabled) return { enabled: false, user: null, usage: null };
  const session = await storedSession(cleanBaseUrl);
  if (!session) return { enabled: true, user: null, usage: null };

  try {
    const response = await withTimeout(`${cleanBaseUrl}/api/account/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (response.status === 401 || response.status === 404) {
      await deleteSetting(SESSION_KEY);
      return { enabled: true, user: null, usage: null };
    }
    if (!response.ok) return { enabled: true, user: session.user, usage: session.usage, stale: true };
    const body = (await response.json()) as { user: AccountUser; usage: AccountUsage | null };
    const refreshed = { ...session, user: body.user, usage: body.usage };
    await saveSession(refreshed);
    return { enabled: true, user: body.user, usage: body.usage };
  } catch {
    return { enabled: true, user: session.user, usage: session.usage, stale: true };
  }
}

function waitForAccountLink(): { promise: Promise<string>; cancel: () => void } {
  let subscription: ReturnType<typeof Linking.addEventListener> | null = null;
  let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let returnTimer: ReturnType<typeof setTimeout> | null = null;
  let leftApp = false;
  const cleanup = () => {
    subscription?.remove();
    subscription = null;
    appStateSubscription?.remove();
    appStateSubscription = null;
    if (timeout) clearTimeout(timeout);
    timeout = null;
    if (returnTimer) clearTimeout(returnTimer);
    returnTimer = null;
  };
  const promise = new Promise<string>((resolve, reject) => {
    subscription = Linking.addEventListener('url', ({ url }) => {
      if (!url.toLowerCase().startsWith('outfitcombination://auth')) return;
      cleanup();
      try {
        resolve(accountCodeFromLink(url));
      } catch (error) {
        reject(error);
      }
    });
    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') leftApp = true;
      if (state === 'active' && leftApp && !returnTimer) {
        returnTimer = setTimeout(() => {
          cleanup();
          reject(new Error('Google ile giriş tamamlanmadı. Yeniden deneyebilirsin.'));
        }, 1_500);
      }
    });
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Google ile giriş süresi doldu. Yeniden deneyebilirsin.'));
    }, 3 * 60 * 1_000);
  });
  return {
    promise,
    cancel: cleanup,
  };
}

function accountCodeFromLink(url: string): string {
  const parsed = new URL(url);
  const error = parsed.searchParams.get('error');
  if (error) throw new Error(error === 'cancelled' ? 'Google ile giriş iptal edildi.' : 'Google ile giriş tamamlanamadı.');
  const code = parsed.searchParams.get('code');
  if (!code) throw new Error('Uygulama geçerli bir oturum kodu alamadı.');
  return code;
}

async function completeAccountCode(baseUrl: string, code: string): Promise<AccountState> {
  const completeResponse = await installationAuthenticatedFetch(baseUrl, '/api/account/google/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!completeResponse.ok) throw new Error(await readError(completeResponse, 'Google oturumu tamamlanamadı.'));
  const session = (await completeResponse.json()) as StoredSession;
  const stored: StoredSession = { ...session, baseUrl };
  await saveSession(stored);
  return { enabled: true, user: stored.user, usage: stored.usage };
}

export async function signInWithGoogle(baseUrl: string): Promise<AccountState> {
  const cleanBaseUrl = cleanUrl(baseUrl);
  if (!await accountConfig(cleanBaseUrl, true)) return { enabled: false, user: null, usage: null };
  const startResponse = await installationAuthenticatedFetch(cleanBaseUrl, '/api/account/google/start', {
    method: 'POST',
  });
  if (!startResponse.ok) throw new Error(await readError(startResponse, 'Google ile giriş başlatılamadı.'));
  const start = (await startResponse.json()) as { authorizationUrl?: string };
  if (!start.authorizationUrl) throw new Error('Sunucu geçerli bir Google giriş adresi döndürmedi.');

  const link = waitForAccountLink();
  try {
    await Linking.openURL(start.authorizationUrl);
  } catch (error) {
    link.cancel();
    throw error;
  }
  const code = await link.promise;
  return completeAccountCode(cleanBaseUrl, code);
}

export async function completeInitialAccountSignIn(baseUrl: string): Promise<AccountState | null> {
  if (initialLinkChecked) return null;
  initialLinkChecked = true;
  const url = await Linking.getInitialURL();
  if (!url?.toLowerCase().startsWith('outfitcombination://auth')) return null;
  return completeAccountCode(cleanUrl(baseUrl), accountCodeFromLink(url));
}

export async function ensureAccountForAi(baseUrl: string): Promise<AccountState> {
  const state = await loadAccountState(baseUrl);
  if (!state.enabled || state.user) return state;
  return signInWithGoogle(baseUrl);
}

export async function signOutAccount(): Promise<void> {
  await deleteSetting(SESSION_KEY);
}

export async function deleteAccount(baseUrl: string): Promise<void> {
  const cleanBaseUrl = cleanUrl(baseUrl);
  const session = await storedSession(cleanBaseUrl);
  if (!session) throw new Error('Silinecek aktif hesap oturumu bulunamadı.');
  const response = await withTimeout(`${cleanBaseUrl}/api/account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok && response.status !== 404)
    throw new Error(await readError(response, 'Hesap silinemedi.'));
  await deleteSetting(SESSION_KEY);
}

export async function accountAuthenticatedFetch(
  baseUrl: string,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const cleanBaseUrl = cleanUrl(baseUrl);
  if (!await accountConfig(cleanBaseUrl))
    return installationAuthenticatedFetch(cleanBaseUrl, path, init, signal);

  const session = await storedSession(cleanBaseUrl);
  if (!session) throw new Error('AI özelliğini kullanmak için Google hesabınla giriş yap.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  const response = await expoFetch(`${cleanBaseUrl}${path}`, { ...init, headers, signal });
  if (response.status === 401) await deleteSetting(SESSION_KEY);
  return response;
}
