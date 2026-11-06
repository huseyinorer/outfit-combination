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

export async function analyzeClothing(
  baseUrl: string,
  category: Category,
  photoUri: string,
): Promise<AnalyzeResponse> {
  if (!cleanBaseUrl(baseUrl)) throw new Error('API adresi ayarlanmamış.');
  const form = new FormData();
  form.append('category', category);
  form.append(
    'photo',
    { uri: photoUri, name: 'clothing.jpg', type: 'image/jpeg' } as unknown as Blob,
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${cleanBaseUrl(baseUrl)}/api/analyze`, {
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
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    // Bu gövde bilinçli olarak fotoğraf, URI, dosya yolu ve base64 içermez.
    const response = await fetch(`${cleanBaseUrl(baseUrl)}/api/outfits`, {
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

