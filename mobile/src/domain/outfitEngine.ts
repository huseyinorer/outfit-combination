import type {
  Category,
  ClothingItem,
  OutfitPreferences,
  OutfitSuggestion,
} from './types.ts';

const NORMAL_COLORS = new Set([
  'siyah',
  'beyaz',
  'gri',
  'bej',
  'krem',
  'lacivert',
  'kahverengi',
  'ekru',
]);
const LIGHT_COLORS = new Set(['beyaz', 'bej', 'krem', 'ekru', 'açık mavi', 'pudra', 'sarı']);
const DARK_COLORS = new Set(['siyah', 'lacivert', 'antrasit', 'bordo', 'koyu gri', 'kahverengi']);

const destinationStyles: Record<string, string[]> = {
  'iş/ofis': ['klasik', 'smart casual', 'resmi', 'minimal'],
  'arkadaş buluşması': ['rahat', 'smart casual', 'günlük', 'spor'],
  'akşam yemeği': ['smart casual', 'klasik', 'şık'],
  'özel gün': ['klasik', 'şık', 'resmi'],
  günlük: ['günlük', 'rahat', 'spor'],
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
  return (['top', 'bottom', 'shoes'] as Category[]).filter(
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
    const valid =
      top?.category === 'top' &&
      bottom?.category === 'bottom' &&
      shoes?.category === 'shoes' &&
      !seen.has(key);
    if (valid) seen.add(key);
    return valid;
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
    if (tone === 'açık' && LIGHT_COLORS.has(color)) score += 1.8;
    if (tone === 'koyu' && DARK_COLORS.has(color)) score += 1.8;
  }
  if (tone === 'karışık' && new Set(colors).size > 1) score += 1.5;
  if (new Set(colors).size === 1 && colors.length === 3) score -= 0.5;
  return score;
}

function scoreTriple(triple: Omit<Triple, 'score'>, preferences: OutfitPreferences): number {
  const pieces = [triple.top, triple.bottom, triple.shoes];
  const styles = pieces.flatMap((item) => item.styleTags);
  let score = colorScore(pieces, normalize(preferences.tone));

  if (preferences.look !== 'Fark etmez' && includesAny(styles, [preferences.look])) score += 4;
  const expected = destinationStyles[normalize(preferences.destination)] ?? [];
  if (includesAny(styles, expected)) score += 2.5;

  const patterns = pieces.map((item) => normalize(item.pattern)).filter(Boolean);
  if (patterns.filter((pattern) => !['düz', 'desensiz'].includes(pattern)).length > 1) score -= 0.8;
  return score;
}

function makeLocalSuggestion(triple: Triple): OutfitSuggestion {
  const colors = [triple.top.primaryColor, triple.bottom.primaryColor, triple.shoes.primaryColor]
    .filter(Boolean)
    .join(', ');
  return {
    title: `${triple.top.name || 'Üst'} & ${triple.bottom.name || 'Alt'}`,
    topId: triple.top.id,
    bottomId: triple.bottom.id,
    shoeId: triple.shoes.id,
    reason: `${triple.top.name || 'Üst'}, ${triple.bottom.name || 'alt'} ve ${triple.shoes.name || 'ayakkabı'} ${colors ? `${colors} tonlarıyla ` : ''}dengeli ve kullanışlı bir bütün oluşturuyor.`,
    source: 'local',
  };
}

export function buildLocalSuggestions(
  items: ClothingItem[],
  preferences: OutfitPreferences,
  excludedKeys = new Set<string>(),
): OutfitSuggestion[] {
  const tops = items.filter((item) => item.category === 'top');
  const bottoms = items.filter((item) => item.category === 'bottom');
  const shoes = items.filter((item) => item.category === 'shoes');
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

  return selected.map(makeLocalSuggestion);
}

export function completeSuggestions(
  items: ClothingItem[],
  preferences: OutfitPreferences,
  aiCandidates: OutfitSuggestion[] = [],
): OutfitSuggestion[] {
  const possible = countPossibleOutfits(items);
  if (possible === 0) return [];

  const target = Math.min(3, possible);
  const validAi = validateAiSuggestions(items, aiCandidates)
    .slice(0, target)
    .map((suggestion) => ({ ...suggestion, source: 'ai' as const }));
  const seen = new Set(validAi.map(outfitKey));
  const local = buildLocalSuggestions(items, preferences, seen);
  return [...validAi, ...local].slice(0, target);
}

export function resolveOutfitItems(items: ClothingItem[], suggestion: OutfitSuggestion) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    top: byId.get(suggestion.topId),
    bottom: byId.get(suggestion.bottomId),
    shoes: byId.get(suggestion.shoeId),
  };
}

