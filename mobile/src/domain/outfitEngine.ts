import type {
  Category,
  ClothingItem,
  OutfitPreferences,
  OutfitRequestExtras,
  OutfitSuggestion,
} from './types.ts';
import { REQUIRED_CATEGORIES } from './types.ts';
import { MAX_ACCESSORIES, accessoryIdsOf, type Pins } from './slots.ts';

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

    const optionalOk = (['hat', 'outerwear'] as const).every((category) => {
      const id = category === 'hat' ? candidate.hatId : candidate.outerwearId;
      if (!id) return true;
      return byId.get(id)?.category === category;
    }) && accessoryIdsOf(candidate).every((id) => byId.get(id)?.category === 'accessory');
    if (!optionalOk) return false;

    seen.add(key);
    return true;
  }).map((candidate) => {
    const top = byId.get(candidate.topId);
    const accessoryIds = accessoryIdsOf(candidate);
    const normalized = { ...candidate, accessoryIds, accessoryId: accessoryIds[0] ?? null };
    return normalized.outerwearId && top && isOuterLayer(top) ? { ...normalized, outerwearId: null } : normalized;
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

const OUTER_LAYER_WORDS = [
  'ceket', 'mont', 'kaban', 'palto', 'trençkot', 'blazer', 'bomber', 'parka', 'yelek', 'hırka',
  'overshirt', 'jacket', 'coat', 'trench', 'puffer', 'gilet', 'cardigan', 'shacket',
];

/** True when a top is itself a jacket/coat, so a separate outerwear piece would double up. */
export function isOuterLayer(item: Pick<ClothingItem, 'name' | 'subType'>): boolean {
  const text = normalize(`${item.subType} ${item.name}`);
  return OUTER_LAYER_WORDS.some((word) => text.includes(word));
}

function pickExtra(
  pool: ClothingItem[],
  triple: Triple,
  preferences: OutfitPreferences,
  mode: 'auto' | 'include' | 'exclude' | undefined,
): ClothingItem | null {
  if (mode === 'exclude') return null;
  if (pool.length === 0) return null;
  if (mode !== 'include' && pool[0]?.category === 'outerwear' && isOuterLayer(triple.top)) return null;
  const sorted = [...pool].sort((a, b) => scoreExtra(b, triple, preferences) - scoreExtra(a, triple, preferences));
  return sorted[0] ?? null;
}

function makeLocalSuggestion(
  triple: Triple,
  english: boolean,
  extras: { hat: ClothingItem | null; accessories: ClothingItem[]; outerwear: ClothingItem | null },
): OutfitSuggestion {
  const colors = [triple.top.primaryColor, triple.bottom.primaryColor, triple.shoes.primaryColor]
    .filter(Boolean)
    .join(', ');
  const activeExtras: Array<{ item: ClothingItem; trLabel: string; enLabel: string }> = [];
  if (extras.hat) activeExtras.push({ item: extras.hat, trLabel: 'şapka', enLabel: 'hat' });
  if (extras.outerwear) activeExtras.push({ item: extras.outerwear, trLabel: 'mont', enLabel: 'jacket' });
  for (const accessory of extras.accessories) activeExtras.push({ item: accessory, trLabel: 'aksesuar', enLabel: 'accessory' });

  const baseReasonTr = `${triple.top.name || 'Üst'}, ${triple.bottom.name || 'alt'} ve ${triple.shoes.name || 'ayakkabı'} ${colors ? `${colors} tonlarıyla ` : ''}dengeli ve kullanışlı bir bütün oluşturuyor.`;
  const baseReasonEn = `${triple.top.name || 'Top'}, ${triple.bottom.name || 'bottom'}, and ${triple.shoes.name || 'shoes'} create a balanced, practical outfit${colors ? ` with ${colors} tones` : ''}.`;
  const extrasReasonTr = activeExtras.length > 0
    ? ` Ekstra olarak ${activeExtras.map((e) => `${e.trLabel} (${e.item.name || e.item.subType || e.trLabel})`).join(', ')} tamamlıyor.`
    : '';
  const extrasReasonEn = activeExtras.length > 0
    ? ` A ${activeExtras.map((e) => `${e.enLabel} (${e.item.name || e.item.subType || e.enLabel})`).join(', ')} rounds the look out.`
    : '';

  const base: OutfitSuggestion = {
    title: `${triple.top.name || (english ? 'Top' : 'Üst')} & ${triple.bottom.name || (english ? 'Bottom' : 'Alt')}`,
    topId: triple.top.id,
    bottomId: triple.bottom.id,
    shoeId: triple.shoes.id,
    reason: english ? baseReasonEn + extrasReasonEn : baseReasonTr + extrasReasonTr,
    source: 'local',
  };
  if (extras.hat) base.hatId = extras.hat.id;
  if (extras.accessories.length > 0) {
    base.accessoryIds = extras.accessories.slice(0, MAX_ACCESSORIES).map((item) => item.id);
    base.accessoryId = base.accessoryIds[0];
  }
  if (extras.outerwear) base.outerwearId = extras.outerwear.id;
  return base;
}

export function buildLocalSuggestions(
  items: ClothingItem[],
  preferences: OutfitPreferences,
  excludedKeys = new Set<string>(),
  extras: OutfitRequestExtras = {},
  pins: Pins = {},
): OutfitSuggestion[] {
  const pinned = (category: Category) => (pins[category] ?? [])
    .map((id) => items.find((item) => item.id === id && item.category === category))
    .filter((item): item is ClothingItem => Boolean(item));
  // A slot the user filled is narrowed to their choice; extras they chose are always added.
  const slot = (category: Category) => {
    const chosen = pinned(category);
    return chosen.length > 0 ? chosen.slice(0, 1) : items.filter((item) => item.category === category);
  };
  const tops = pinned('outerwear').length > 0
    ? (() => {
      const plain = slot('top').filter((item) => !isOuterLayer(item));
      return plain.length > 0 ? plain : slot('top');
    })()
    : slot('top');
  const bottoms = slot('bottom');
  const shoes = slot('shoes');
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
  const chosenAccessories = pinned('accessory').slice(0, MAX_ACCESSORIES);
  return selected.map((triple) => {
    const pickedAccessory = pickExtra(accessories, triple, preferences, extras.accessory);
    return makeLocalSuggestion(triple, english, {
      hat: pinned('hat')[0] ?? pickExtra(hats, triple, preferences, extras.hat),
      accessories: chosenAccessories.length > 0 ? chosenAccessories : pickedAccessory ? [pickedAccessory] : [],
      outerwear: pinned('outerwear')[0] ?? pickExtra(outerwear, triple, preferences, extras.outerwear),
    });
  });
}

export function completeSuggestions(
  items: ClothingItem[],
  preferences: OutfitPreferences,
  aiCandidates: OutfitSuggestion[] = [],
  excludedKeys = new Set<string>(),
  extras: OutfitRequestExtras = {},
  pins: Pins = {},
): OutfitSuggestion[] {
  const pinnedIds = (category: Category) => (pins[category] ?? [])
    .filter((id) => items.some((item) => item.id === id && item.category === category));
  // Required slots the user filled count as a single option when sizing the result.
  const narrowed = items.filter((item) => {
    if (!(REQUIRED_CATEGORIES as readonly Category[]).includes(item.category)) return true;
    const chosen = pinnedIds(item.category);
    return chosen.length === 0 || item.id === chosen[0];
  });
  const possible = countPossibleOutfits(narrowed);
  if (possible === 0) return [];

  const containsPins = (suggestion: OutfitSuggestion) => {
    const accessories = accessoryIdsOf(suggestion);
    return (Object.keys(pins) as Category[]).every((category) => {
      const chosen = pinnedIds(category);
      if (chosen.length === 0) return true;
      if (category === 'accessory') return chosen.every((id) => accessories.includes(id));
      const field = category === 'top' ? suggestion.topId
        : category === 'bottom' ? suggestion.bottomId
          : category === 'shoes' ? suggestion.shoeId
            : category === 'hat' ? suggestion.hatId
              : suggestion.outerwearId;
      return field === chosen[0];
    });
  };
  const target = Math.min(3, possible);
  const validAi = validateAiSuggestions(items, aiCandidates)
    .filter(containsPins)
    .filter((suggestion) => !excludedKeys.has(outfitKey(suggestion)))
    .slice(0, target)
    .map((suggestion) => ({ ...suggestion, source: 'ai' as const }));
  const seen = new Set(validAi.map(outfitKey));
  const localExcluded = new Set([...excludedKeys, ...seen]);
  let local = buildLocalSuggestions(items, preferences, localExcluded, extras, pins);
  if (validAi.length + local.length < target && excludedKeys.size > 0) {
    local = [...local, ...buildLocalSuggestions(items, preferences, seen, extras, pins)
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
    accessories: accessoryIdsOf(suggestion)
      .map((id) => byId.get(id))
      .filter((item): item is ClothingItem => Boolean(item)),
    outerwear: suggestion.outerwearId ? byId.get(suggestion.outerwearId) : undefined,
  };
}
