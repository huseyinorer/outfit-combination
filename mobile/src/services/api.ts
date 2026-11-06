import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import type {
  Category,
  ClothingAttributes,
  ClothingItem,
  OutfitPreferences,
  OutfitResult,
  OutfitSuggestion,
} from '../domain/types';

interface AnalyzeResponse extends ClothingAttributes {
  categoryConflict: boolean;
  detectedCategory: Category | null;
}

const cleanBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/$/, '');

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? `API hatası (${response.status})`;
  } catch {
    return `API hatası (${response.status})`;
  }
}

export async function checkApiHealth(baseUrl: string): Promise<boolean> {
  const cleanUrl = cleanBaseUrl(baseUrl);
  if (!cleanUrl) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await expoFetch(`${cleanUrl}/health`, { signal: controller.signal });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: string };
    return body.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeClothing(
  baseUrl: string,
  category: Category,
  photoUri: string,
  externalSignal?: AbortSignal,
): Promise<AnalyzeResponse> {
  if (!cleanBaseUrl(baseUrl)) throw new Error('API adresi ayarlanmamış.');
  const form = new FormData();
  form.append('category', category);
  const photo = new File(photoUri);
  if (!photo.exists) throw new Error('Analiz edilecek fotoğraf bulunamadı.');
  form.append('photo', photo);

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  // Render Free can take about a minute to wake after an idle period.
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await expoFetch(`${cleanBaseUrl(baseUrl)}/api/analyze`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as AnalyzeResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Analiz zaman aşımına uğradı. Fotoğraf güvende; yeniden deneyebilirsin.');
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
): Promise<OutfitResult> {
  if (!cleanBaseUrl(baseUrl)) throw new Error('API adresi ayarlanmamış.');
  const controller = new AbortController();
  // Allow the first request to include a possible Render Free cold start.
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    // Bu gövde bilinçli olarak fotoğraf, URI, dosya yolu ve base64 içermez.
    const response = await expoFetch(`${cleanBaseUrl(baseUrl)}/api/outfits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences, wardrobe: wardrobe.map(toApiItem) }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await readError(response));
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
      throw new Error('Kombin isteği zaman aşımına uğradı.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

