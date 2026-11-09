import type {
  Category,
  ClothingItem,
  OptionalCategory,
  OutfitPreferences,
  OutfitRequestExtras,
  OutfitSuggestion,
} from './types.ts';
import { OPTIONAL_CATEGORIES, REQUIRED_CATEGORIES } from './types.ts';

const NORMAL_COLORS = new Set([
  'siyah',
  'beyaz',
  'gri',
  'bej',
  'krem',
  'lacivert',
  'kahverengi',
  'ekru',
  'black', 'white', 'gray', 'grey', 'beige', 'cream', 'navy', 'brown', 'ecru',
]);
const LIGHT_COLORS = new Set(['beyaz', 'bej', 'krem', 'ekru', 'açık mavi', 'pudra', 'sarı', 'white', 'beige', 'cream', 'ecru', 'light blue', 'yellow']);
const DARK_COLORS = new Set(['siyah', 'lacivert', 'antrasit', 'bordo', 'koyu gri', 'kahverengi', 'black', 'navy', 'charcoal', 'burgundy', 'dark gray', 'dark grey', 'brown']);

const destinationStyles: Record<string, string[]> = {
  'iş/ofis': ['klasik', 'smart casual', 'resmi', 'minimal'],
  'arkadaş buluşması': ['rahat', 'smart casual', 'günlük', 'spor'],
  'akşam yemeği': ['smart casual', 'klasik', 'şık'],
  'özel gün': ['klasik', 'şık', 'resmi'],
  günlük: ['günlük', 'rahat', 'spor'],
  daily: ['daily', 'casual', 'relaxed', 'sporty'],
  'work/office': ['classic', 'smart casual', 'formal', 'minimal'],
  'meeting friends': ['relaxed', 'smart casual', 'casual', 'sporty'],
  dinner: ['smart casual', 'classic', 'elegant'],
  'special occasion': ['classic', 'elegant', 'formal'],
};

interface Triple {
  top: ClothingItem;
  bottom: ClothingItem;
  shoes: ClothingItem;
  score: number;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('tr-TR');
export const outfitKey = (suggestion: Pick<OutfitSuggestion, 'topId' | 'bottomId' | 'shoeId'>) =>
  `${suggestion.topId}|${suggestion.bottomId}|${suggestion.shoeId}`;

export function getMissingCategories(items: ClothingItem[]): Category[] {
  return (REQUIRED_CATEGORIES as readonly Category[]).filter(
    (category) => !items.some((item) => item.category === category),
  );
}

export function countPossibleOutfits(items: ClothingItem[]): number {
  const count = (category: Category) => items.filter((item) => item.category === category).length;
  return count('top') * count('bottom') * count('shoes');
}

export function validateAiSuggestions(
  items: ClothingItem[],
  candidates: OutfitSuggestion[],
): OutfitSuggestion[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const top = byId.get(candidate.topId);
    const bottom = byId.get(candidate.bottomId);
    const shoes = byId.get(candidate.shoeId);
    const key = outfitKey(candidate);
    const requiredOk =
      top?.category === 'top' &&
      bottom?.category === 'bottom' &&
      shoes?.category === 'shoes' &&
      !seen.has(key);
    if (!requiredOk) return false;

    const optionalOk = (OPTIONAL_CATEGORIES as readonly OptionalCategory[]).every((category) => {
      const field = `${category}Id` as 'hatId' | 'accessoryId' | 'outerwearId';
      const id = candidate[field];
      if (!id) return true;
      return byId.get(id)?.category === category;
    });
    if (!optionalOk) return false;

    seen.add(key);
    return true;
  });
}

function includesAny(values: string[], expected: string[]): boolean {
  const normalized = values.map(normalize);
  return expected.some((needle) => normalized.some((value) => value.includes(normalize(needle))));
}

function colorScore(items: ClothingItem[], tone: string): number {
  const colors = items.map((item) => normalize(item.primaryColor)).filter(Boolean);
  let score = 0;
  for (let index = 0; index < colors.length; index += 1) {
    const color = colors[index] ?? '';
    if (NORMAL_COLORS.has(color)) score += 0.7;
    if ((tone === 'açık' || tone === 'light') && LIGHT_COLORS.has(color)) score += 1.8;
    if ((tone === 'koyu' || tone === 'dark') && DARK_COLORS.has(color)) score += 1.8;
  }
  if ((tone === 'karışık' || tone === 'mixed') && new Set(colors).size > 1) score += 1.5;
  if (new Set(colors).size === 1 && colors.length === 3) score -= 0.5;
  return score;
}

function scoreTriple(triple: Omit<Triple, 'score'>, preferences: OutfitPreferences): number {
  const pieces = [triple.top, triple.bottom, triple.shoes];
  const styles = pieces.flatMap((item) => item.styleTags);
  let score = colorScore(pieces, normalize(preferences.tone));

  if (!['Fark etmez', 'Any'].includes(preferences.look) && includesAny(styles, [preferences.look])) score += 4;
  const expected = destinationStyles[normalize(preferences.destination)] ?? [];
  if (includesAny(styles, expected)) score += 2.5;

  const patterns = pieces.map((item) => normalize(item.pattern)).filter(Boolean);
  if (patterns.filter((pattern) => !['düz', 'desensiz'].includes(pattern)).length > 1) score -= 0.8;
  return score;
}

function scoreExtra(item: ClothingItem, triple: Triple, preferences: OutfitPreferences): number {
  let score = colorScore([...[triple.top, triple.bottom, triple.shoes], item], normalize(preferences.tone)) * 0.4;
  const styles = item.styleTags;
  const expected = destinationStyles[normalize(preferences.destination)] ?? [];
  if (includesAny(styles, expected)) score += 1.5;
  if (!['Fark etmez', 'Any'].includes(preferences.look) && includesAny(styles, [preferences.look])) score += 2;
  return score;
}

function pickExtra(
  pool: ClothingItem[],
  triple: Triple,
  preferences: OutfitPreferences,
  mode: 'auto' | 'include' | 'exclude' | undefined,
): ClothingItem | null {
  if (mode === 'exclude') return null;
  if (pool.length === 0) return mode === 'include' ? null : null;
  const sorted = [...pool].sort((a, b) => scoreExtra(b, triple, preferences) - scoreExtra(a, triple, preferences));
  return sorted[0] ?? null;
}

function makeLocalSuggestion(
  triple: Triple,
  english: boolean,
  extras: { hat: ClothingItem | null; accessory: ClothingItem | null; outerwear: ClothingItem | null },
): OutfitSuggestion {
  const colors = [triple.top.primaryColor, triple.bottom.primaryColor, triple.shoes.primaryColor]
    .filter(Boolean)
    .join(', ');
  const base: OutfitSuggestion = {
    title: `${triple.top.name || (english ? 'Top' : 'Üst')} & ${triple.bottom.name || (english ? 'Bottom' : 'Alt')}`,
    topId: triple.top.id,
    bottomId: triple.bottom.id,
    shoeId: triple.shoes.id,
    reason: english
      ? `${triple.top.name || 'Top'}, ${triple.bottom.name || 'bottom'}, and ${triple.shoes.name || 'shoes'} create a balanced, practical outfit${colors ? ` with ${colors} tones` : ''}.`
      : `${triple.top.name || 'Üst'}, ${triple.bottom.name || 'alt'} ve ${triple.shoes.name || 'ayakkabı'} ${colors ? `${colors} tonlarıyla ` : ''}dengeli ve kullanışlı bir bütün oluşturuyor.`,
    source: 'local',
  };
  if (extras.hat) base.hatId = extras.hat.id;
  if (extras.accessory) base.accessoryId = extras.accessory.id;
  if (extras.outerwear) base.outerwearId = extras.outerwear.id;
  return base;
}

export function buildLocalSuggestions(
  items: ClothingItem[],
  preferences: OutfitPreferences,
  excludedKeys = new Set<string>(),
  extras: OutfitRequestExtras = {},
): OutfitSuggestion[] {
  const tops = items.filter((item) => item.category === 'top');
  const bottoms = items.filter((item) => item.category === 'bottom');
  const shoes = items.filter((item) => item.category === 'shoes');
  const hats = items.filter((item) => item.category === 'hat');
  const accessories = items.filter((item) => item.category === 'accessory');
  const outerwear = items.filter((item) => item.category === 'outerwear');
  const triples: Triple[] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        const base = { top, bottom, shoes: shoe };
        triples.push({ ...base, score: scoreTriple(base, preferences) });
      }
    }
  }

  const available = triples
    .filter((triple) =>
      !excludedKeys.has(`${triple.top.id}|${triple.bottom.id}|${triple.shoes.id}`),
    )
    .sort((a, b) => b.score - a.score);
  const selected: Triple[] = [];

  while (available.length > 0) {
    available.sort((a, b) => {
      const diversity = (candidate: Triple) =>
        selected.reduce((penalty, picked) => {
          return (
            penalty +
            (candidate.top.id === picked.top.id ? 1.2 : 0) +
            (candidate.bottom.id === picked.bottom.id ? 1 : 0) +
            (candidate.shoes.id === picked.shoes.id ? 0.8 : 0)
          );
        }, 0);
      return b.score - diversity(b) - (a.score - diversity(a));
    });
    const next = available.shift();
    if (next) selected.push(next);
  }

  const english = ['Any', 'Daily', 'Work/office', 'Meeting friends', 'Dinner', 'Special occasion'].includes(preferences.destination);
  return selected.map((triple) => makeLocalSuggestion(triple, english, {
    hat: pickExtra(hats, triple, preferences, extras.hat),
    accessory: pickExtra(accessories, triple, preferences, extras.accessory),
    outerwear: pickExtra(outerwear, triple, preferences, extras.outerwear),
  }));
}

export function completeSuggestions(
  items: ClothingItem[],
  preferences: OutfitPreferences,
  aiCandidates: OutfitSuggestion[] = [],
  excludedKeys = new Set<string>(),
  extras: OutfitRequestExtras = {},
): OutfitSuggestion[] {
  const possible = countPossibleOutfits(items);
  if (possible === 0) return [];

  const target = Math.min(3, possible);
  const validAi = validateAiSuggestions(items, aiCandidates)
    .filter((suggestion) => !excludedKeys.has(outfitKey(suggestion)))
    .slice(0, target)
    .map((suggestion) => ({ ...suggestion, source: 'ai' as const }));
  const seen = new Set(validAi.map(outfitKey));
  const localExcluded = new Set([...excludedKeys, ...seen]);
  let local = buildLocalSuggestions(items, preferences, localExcluded, extras);
  if (validAi.length + local.length < target && excludedKeys.size > 0) {
    local = [...local, ...buildLocalSuggestions(items, preferences, seen, extras)
      .filter((suggestion) => !local.some((existing) => outfitKey(existing) === outfitKey(suggestion)))];
  }
  return [...validAi, ...local].slice(0, target);
}

export function resolveOutfitItems(items: ClothingItem[], suggestion: OutfitSuggestion) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    top: byId.get(suggestion.topId),
    bottom: byId.get(suggestion.bottomId),
    shoes: byId.get(suggestion.shoeId),
    hat: suggestion.hatId ? byId.get(suggestion.hatId) : undefined,
    accessory: suggestion.accessoryId ? byId.get(suggestion.accessoryId) : undefined,
    outerwear: suggestion.outerwearId ? byId.get(suggestion.outerwearId) : undefined,
  };
}
