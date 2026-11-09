import { AppState, Linking } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { normalizeApiBaseUrl } from '../domain/apiUrl';
import type { AppLanguage } from '../locales';
import { installationAuthenticatedFetch } from './installationAuth';
import { deleteSecureSession, getSecureSession, setSecureSession } from './secureSessionStorage';

const SESSION_KEY = 'account_session_v1';
const CONFIG_TTL_MS = 5 * 60 * 1_000;
const CONFIG_TIMEOUT_MS = 12_000;
const REQUEST_TIMEOUT_MS = 90_000;

export type AccountTier = 'free' | 'premium';

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
  pictureUrl: string | null;
  tier: AccountTier;
}

export function normalizeTier(value: unknown): AccountTier {
  return value === 'premium' ? 'premium' : 'free';
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
  googleEnabled?: boolean;
  emailEnabled?: boolean;
}

export interface AccountState {
  enabled: boolean;
  googleEnabled: boolean;
  emailEnabled: boolean;
  user: AccountUser | null;
  usage: AccountUsage | null;
  stale?: boolean;
}

interface ConfigCache {
  enabled: boolean;
  googleEnabled: boolean;
  emailEnabled: boolean;
  expiresAt: number;
}

const configCache = new Map<string, ConfigCache>();
let initialLinkChecked = false;

const message = (language: AppLanguage, turkish: string, english: string) => language === 'tr' ? turkish : english;

function cleanUrl(baseUrl: string, language: AppLanguage = 'tr'): string {
  const value = normalizeApiBaseUrl(baseUrl);
  if (!value) throw new Error(message(language, 'Sunucu adresi ayarlanmamış.', 'The service address is not configured.'));
  return value;
}

async function withTimeout(url: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await expoFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readError(
  response: Response,
  fallback: string,
  language: AppLanguage = 'tr',
): Promise<string> {
  try {
    const body = (await response.json()) as { code?: string; message?: string };
    if (language === 'en') {
      const localized: Record<string, string> = {
        email_auth_unavailable: 'Email sign-in is not available yet.',
        account_store_unavailable: 'The account service is temporarily unavailable.',
        invalid_email: 'Enter a valid email address.',
        email_code_throttled: 'Wait a short while before requesting another code.',
        email_delivery_failed: 'The sign-in code could not be delivered. Try again shortly.',
        invalid_email_code: 'The code is invalid or expired. Request a new code.',
      };
      return (body.code ? localized[body.code] : undefined) ?? fallback;
    }
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function accountConfig(baseUrl: string, force = false, language: AppLanguage = 'tr'): Promise<ConfigCache> {
  const cleanBaseUrl = cleanUrl(baseUrl, language);
  const cached = configCache.get(cleanBaseUrl);
  if (!force && cached && cached.expiresAt > Date.now()) return cached;
  // Do not keep the first screen blocked for an entire Render Free cold start.
  // A retry wakes the service while guest/local features remain immediately available.
  const response = await withTimeout(`${cleanBaseUrl}/api/account/config`, undefined, CONFIG_TIMEOUT_MS);
  if (response.status === 404) {
    const unavailable = { enabled: false, googleEnabled: false, emailEnabled: false, expiresAt: Date.now() + CONFIG_TTL_MS };
    configCache.set(cleanBaseUrl, unavailable);
    return unavailable;
  }
  if (!response.ok) throw new Error(await readError(
    response,
    message(language, 'Hesap servisine ulaşılamadı.', 'The account service could not be reached.'),
    language,
  ));
  const body = (await response.json()) as { enabled?: boolean; googleEnabled?: boolean; emailEnabled?: boolean };
  const result = {
    enabled: body.enabled === true,
    googleEnabled: body.googleEnabled === true || (body.enabled === true && body.googleEnabled === undefined),
    emailEnabled: body.emailEnabled === true,
    expiresAt: Date.now() + CONFIG_TTL_MS,
  };
  configCache.set(cleanBaseUrl, result);
  return result;
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
    const session = value as StoredSession;
    session.user = { ...session.user, tier: normalizeTier((session.user as { tier?: unknown }).tier) };
    return session;
  } catch {
    return null;
  }
}

async function storedSession(baseUrl: string): Promise<StoredSession | null> {
  const session = parseSession(await getSecureSession(SESSION_KEY), baseUrl);
  if (!session) await deleteSecureSession(SESSION_KEY);
  return session;
}

async function saveSession(session: StoredSession): Promise<void> {
  await setSecureSession(SESSION_KEY, JSON.stringify(session));
}

export async function loadAccountState(
  baseUrl: string,
  language: AppLanguage = 'tr',
  forceConfigurationRefresh = false,
): Promise<AccountState> {
  const cleanBaseUrl = cleanUrl(baseUrl, language);
  const session = await storedSession(cleanBaseUrl);
  let config: ConfigCache;
  try {
    config = await accountConfig(cleanBaseUrl, forceConfigurationRefresh, language);
  } catch {
    if (session) return {
      enabled: true,
      googleEnabled: session.googleEnabled ?? true,
      emailEnabled: session.emailEnabled ?? false,
      user: session.user,
      usage: session.usage,
      stale: true,
    };
    throw new Error(message(
      language,
      'Hesap servisine şu anda ulaşılamıyor. İnternet bağlantını kontrol et.',
      'The account service is unavailable. Check your internet connection.',
    ));
  }
  if (!config.enabled) return { enabled: false, googleEnabled: false, emailEnabled: false, user: null, usage: null };
  if (!session) return { ...config, user: null, usage: null };

  try {
    const response = await withTimeout(`${cleanBaseUrl}/api/account/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (response.status === 401 || response.status === 404) {
      await deleteSecureSession(SESSION_KEY);
      return { ...config, user: null, usage: null };
    }
    if (!response.ok) return { ...config, user: session.user, usage: session.usage, stale: true };
    const body = (await response.json()) as { user: AccountUser; usage: AccountUsage | null };
    const normalizedUser: AccountUser = { ...body.user, tier: normalizeTier(body.user.tier) };
    const refreshed = {
      ...session,
      user: normalizedUser,
      usage: body.usage,
      googleEnabled: config.googleEnabled,
      emailEnabled: config.emailEnabled,
    };
    await saveSession(refreshed);
    return { ...config, user: normalizedUser, usage: body.usage };
  } catch {
    return { ...config, user: session.user, usage: session.usage, stale: true };
  }
}

function waitForAccountLink(language: AppLanguage): { promise: Promise<string>; cancel: () => void } {
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
        resolve(accountCodeFromLink(url, language));
      } catch (error) {
        reject(error);
      }
    });
    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') leftApp = true;
      if (state === 'active' && leftApp && !returnTimer) {
        returnTimer = setTimeout(() => {
          cleanup();
          reject(new Error(message(language, 'Google ile giriş tamamlanmadı. Yeniden deneyebilirsin.', 'Google sign-in was not completed. Try again.')));
        }, 1_500);
      }
    });
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(message(language, 'Google ile giriş süresi doldu. Yeniden deneyebilirsin.', 'Google sign-in timed out. Try again.')));
    }, 3 * 60 * 1_000);
  });
  return {
    promise,
    cancel: cleanup,
  };
}

function accountCodeFromLink(url: string, language: AppLanguage): string {
  const parsed = new URL(url);
  const error = parsed.searchParams.get('error');
  if (error) throw new Error(error === 'cancelled'
    ? message(language, 'Google ile giriş iptal edildi.', 'Google sign-in was cancelled.')
    : message(language, 'Google ile giriş tamamlanamadı.', 'Google sign-in could not be completed.'));
  const code = parsed.searchParams.get('code');
  if (!code) throw new Error(message(language, 'Uygulama geçerli bir oturum kodu alamadı.', 'The app did not receive a valid sign-in code.'));
  return code;
}

async function completeAccountCode(baseUrl: string, code: string, language: AppLanguage): Promise<AccountState> {
  const completeResponse = await installationAuthenticatedFetch(baseUrl, '/api/account/google/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }, undefined, language);
  if (!completeResponse.ok) throw new Error(await readError(
    completeResponse,
    message(language, 'Google oturumu tamamlanamadı.', 'Google sign-in could not be completed.'),
    language,
  ));
  const session = (await completeResponse.json()) as StoredSession;
  const normalizedUser: AccountUser = { ...session.user, tier: normalizeTier(session.user?.tier) };
  const stored: StoredSession = { ...session, user: normalizedUser, baseUrl };
  await saveSession(stored);
  const config = await accountConfig(baseUrl, false, language);
  const configured = { ...stored, googleEnabled: config.googleEnabled, emailEnabled: config.emailEnabled };
  await saveSession(configured);
  return { ...config, user: configured.user, usage: configured.usage };
}

export async function signInWithGoogle(baseUrl: string, language: AppLanguage = 'tr'): Promise<AccountState> {
  const cleanBaseUrl = cleanUrl(baseUrl, language);
  const config = await accountConfig(cleanBaseUrl, true, language);
  if (!config.googleEnabled) throw new Error(message(language, 'Google ile giriş şu anda kullanılamıyor.', 'Google sign-in is currently unavailable.'));
  const startResponse = await installationAuthenticatedFetch(cleanBaseUrl, '/api/account/google/start', {
    method: 'POST',
  }, undefined, language);
  if (!startResponse.ok) throw new Error(await readError(
    startResponse,
    message(language, 'Google ile giriş başlatılamadı.', 'Google sign-in could not be started.'),
    language,
  ));
  const start = (await startResponse.json()) as { authorizationUrl?: string };
  if (!start.authorizationUrl) throw new Error(message(language, 'Sunucu geçerli bir Google giriş adresi döndürmedi.', 'The service did not return a valid Google sign-in address.'));

  const link = waitForAccountLink(language);
  try {
    await Linking.openURL(start.authorizationUrl);
  } catch (error) {
    link.cancel();
    throw error;
  }
  const code = await link.promise;
  return completeAccountCode(cleanBaseUrl, code, language);
}

export async function completeInitialAccountSignIn(baseUrl: string, language: AppLanguage = 'tr'): Promise<AccountState | null> {
  if (initialLinkChecked) return null;
  initialLinkChecked = true;
  const url = await Linking.getInitialURL();
  if (!url?.toLowerCase().startsWith('outfitcombination://auth')) return null;
  return completeAccountCode(cleanUrl(baseUrl, language), accountCodeFromLink(url, language), language);
}

export async function ensureAccountForAi(baseUrl: string, language: AppLanguage = 'tr'): Promise<AccountState> {
  const state = await loadAccountState(baseUrl, language);
  if (!state.enabled || state.user) return state;
  throw new Error(message(language, 'AI özelliklerini kullanmak için hesabına giriş yap.', 'Sign in to use AI features.'));
}

export async function requestEmailSignInCode(
  baseUrl: string,
  email: string,
  language: 'tr' | 'en',
): Promise<void> {
  const cleanBaseUrl = cleanUrl(baseUrl, language);
  const config = await accountConfig(cleanBaseUrl, true, language);
  if (!config.emailEnabled) throw new Error(message(language, 'E-posta ile giriş şu anda kullanılamıyor.', 'Email sign-in is currently unavailable.'));
  const response = await installationAuthenticatedFetch(cleanBaseUrl, '/api/account/email/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, language }),
  }, undefined, language);
  if (!response.ok) throw new Error(await readError(
    response,
    message(language, 'Giriş kodu gönderilemedi.', 'The sign-in code could not be sent.'),
    language,
  ));
}

export async function completeEmailSignIn(
  baseUrl: string,
  email: string,
  code: string,
  language: AppLanguage = 'tr',
): Promise<AccountState> {
  const cleanBaseUrl = cleanUrl(baseUrl, language);
  const response = await installationAuthenticatedFetch(cleanBaseUrl, '/api/account/email/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  }, undefined, language);
  if (!response.ok) throw new Error(await readError(
    response,
    message(language, 'Giriş kodu doğrulanamadı.', 'The sign-in code could not be verified.'),
    language,
  ));
  const session = (await response.json()) as StoredSession;
  const normalizedUser: AccountUser = { ...session.user, tier: normalizeTier(session.user?.tier) };
  const stored: StoredSession = { ...session, user: normalizedUser, baseUrl: cleanBaseUrl };
  await saveSession(stored);
  const config = await accountConfig(cleanBaseUrl, false, language);
  const configured = { ...stored, googleEnabled: config.googleEnabled, emailEnabled: config.emailEnabled };
  await saveSession(configured);
  return { ...config, user: configured.user, usage: configured.usage };
}

export async function signOutAccount(): Promise<void> {
  await deleteSecureSession(SESSION_KEY);
}

export async function deleteAccount(baseUrl: string, language: AppLanguage = 'tr'): Promise<void> {
  const cleanBaseUrl = cleanUrl(baseUrl, language);
  const session = await storedSession(cleanBaseUrl);
  if (!session) throw new Error(message(language, 'Silinecek aktif hesap oturumu bulunamadı.', 'There is no active account session to delete.'));
  const response = await withTimeout(`${cleanBaseUrl}/api/account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok && response.status !== 404)
    throw new Error(await readError(response, message(language, 'Hesap silinemedi.', 'The account could not be deleted.'), language));
  await deleteSecureSession(SESSION_KEY);
}

export async function accountAuthenticatedFetch(
  baseUrl: string,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
  language: AppLanguage = 'tr',
): Promise<Response> {
  const cleanBaseUrl = cleanUrl(baseUrl, language);
  if (!(await accountConfig(cleanBaseUrl, false, language)).enabled)
    return installationAuthenticatedFetch(cleanBaseUrl, path, init, signal, language);

  const session = await storedSession(cleanBaseUrl);
  if (!session) throw new Error(message(language, 'Bu AI özelliğini kullanmak için hesabına giriş yap.', 'Sign in to use this AI feature.'));
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  const response = await expoFetch(`${cleanBaseUrl}${path}`, { ...init, headers, signal });
  if (response.status === 401) await deleteSecureSession(SESSION_KEY);
  return response;
}
