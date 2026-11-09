import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import Constants from 'expo-constants';
import { isSecureApiBaseUrl, normalizeApiBaseUrl } from '../domain/apiUrl';
import type {
  Category,
  ClothingAttributes,
  ClothingItem,
  OutfitPreferences,
  OutfitResult,
  OutfitSuggestion,
} from '../domain/types';
import { accountAuthenticatedFetch } from './accountAuth';
import type { AppLanguage } from '../locales';

interface AnalyzeResponse extends ClothingAttributes {
  categoryConflict: boolean;
  detectedCategory: Category | null;
}

const cleanBaseUrl = normalizeApiBaseUrl;
const allowHttpApi = String(Constants.expoConfig?.extra?.appEnvironment ?? 'development') === 'development';

function checkedBaseUrl(value: string, language: AppLanguage = 'tr'): string {
  const cleanUrl = cleanBaseUrl(value);
  if (!cleanUrl) throw new Error(language === 'tr' ? 'Sunucu adresi ayarlanmamış.' : 'The service address is not configured.');
  if (!allowHttpApi && !isSecureApiBaseUrl(cleanUrl)) throw new Error(language === 'tr' ? 'Bu sürüm güvenli bir HTTPS sunucu adresi gerektiriyor.' : 'This build requires a secure HTTPS service address.');
  return cleanUrl;
}

async function readError(response: Response, language: AppLanguage): Promise<string> {
  try {
    const body = (await response.json()) as { code?: string; message?: string; error?: string };
    if (language === 'en') {
      const messages: Record<string, string> = {
        account_session_required: 'Sign in to use AI features.',
        ai_quota_exceeded: 'Your AI credits are used up. Quick Outfits remain available.',
        quota_service_unavailable: 'Usage credits cannot be verified, so no paid request was sent.',
        missing_category: 'Add at least one item in every main category.',
      };
      const localized = body.code ? messages[body.code] : undefined;
      if (localized) return localized;
      return body.error ?? `Service error (${response.status})`;
    }
    return body.message ?? body.error ?? `API hatası (${response.status})`;
  } catch {
    return language === 'tr' ? `API hatası (${response.status})` : `Service error (${response.status})`;
  }
}

export async function checkApiHealth(baseUrl: string): Promise<boolean> {
  return (await getApiHealth(baseUrl)).online;
}

export async function getApiHealth(baseUrl: string): Promise<{ online: boolean; quotaPersistent: boolean }> {
  const cleanUrl = cleanBaseUrl(baseUrl);
  if (!cleanUrl) return { online: false, quotaPersistent: false };
  if (!allowHttpApi && !isSecureApiBaseUrl(cleanUrl)) return { online: false, quotaPersistent: false };
  const controller = new AbortController();
  // Render Free may need about a minute to wake after an idle period.
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await expoFetch(`${cleanUrl}/health`, { signal: controller.signal });
    if (!response.ok) return { online: false, quotaPersistent: false };
    const body = (await response.json()) as { status?: string; quotaPersistence?: string };
    return { online: body.status === 'ok', quotaPersistent: body.quotaPersistence === 'postgres' };
  } catch {
    return { online: false, quotaPersistent: false };
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeClothing(
  baseUrl: string,
  category: Category,
  photoUri: string,
  language: AppLanguage,
  externalSignal?: AbortSignal,
): Promise<AnalyzeResponse> {
  checkedBaseUrl(baseUrl, language);
  const form = new FormData();
  form.append('category', category);
  form.append('language', language);
  const photo = new File(photoUri);
  if (!photo.exists) throw new Error(language === 'tr' ? 'Analiz edilecek fotoğraf bulunamadı.' : 'The photo to analyze could not be found.');
  form.append('photo', photo);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  // Render Free can take about a minute to wake after an idle period.
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await accountAuthenticatedFetch(baseUrl, '/api/analyze', {
      method: 'POST',
      body: form,
    }, controller.signal, language);
    if (!response.ok) throw new Error(await readError(response, language));
    return (await response.json()) as AnalyzeResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(language === 'tr' ? 'Analiz zaman aşımına uğradı. Fotoğraf güvende; yeniden deneyebilirsin.' : 'Analysis timed out. Your photo is safe; try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

const toApiItem = (item: ClothingItem) => ({
  id: item.id,
  category: item.category,
  name: item.name,
  subType: item.subType,
  primaryColor: item.primaryColor,
  secondaryColors: item.secondaryColors,
  pattern: item.pattern,
  styleTags: item.styleTags,
  seasons: item.seasons,
  description: item.description,
});

export async function requestOutfits(
  baseUrl: string,
  preferences: OutfitPreferences,
  wardrobe: ClothingItem[],
  language: AppLanguage,
): Promise<OutfitResult> {
  checkedBaseUrl(baseUrl, language);
  const controller = new AbortController();
  // Allow the first request to include a possible Render Free cold start.
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    // Bu gövde bilinçli olarak fotoğraf, URI, dosya yolu ve base64 içermez.
    const response = await accountAuthenticatedFetch(baseUrl, '/api/outfits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, preferences, wardrobe: wardrobe.map(toApiItem) }),
    }, controller.signal, language);
    if (!response.ok) throw new Error(await readError(response, language));
    const body = (await response.json()) as {
      suggestions: OutfitSuggestion[];
      usedFallback?: boolean;
      warning?: string;
    };
    return {
      suggestions: body.suggestions,
      usedFallback: body.usedFallback ?? false,
      warning: body.warning,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(language === 'tr' ? 'Kombin isteği zaman aşımına uğradı.' : 'The outfit request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

