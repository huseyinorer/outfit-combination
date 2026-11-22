import type { Category, ClothingAttributes } from './types.ts';

/** Fields the outfit AI relies on; an item missing any of them gets weaker suggestions. */
export type DetailField = 'subType' | 'primaryColor' | 'seasons' | 'formality' | 'fabric' | 'fit';

const FIELDS_BY_CATEGORY: Record<Category, DetailField[]> = {
  top: ['subType', 'primaryColor', 'seasons', 'formality', 'fabric', 'fit'],
  bottom: ['subType', 'primaryColor', 'seasons', 'formality', 'fabric', 'fit'],
  outerwear: ['subType', 'primaryColor', 'seasons', 'formality', 'fabric', 'fit'],
  shoes: ['subType', 'primaryColor', 'seasons', 'formality', 'fabric'],
  hat: ['subType', 'primaryColor', 'seasons', 'formality'],
  accessory: ['subType', 'primaryColor', 'formality'],
};

const LABELS: Record<DetailField, { tr: string; en: string }> = {
  subType: { tr: 'alt tür', en: 'subtype' },
  primaryColor: { tr: 'ana renk', en: 'primary color' },
  seasons: { tr: 'mevsim', en: 'season' },
  formality: { tr: 'resmiyet', en: 'formality' },
  fabric: { tr: 'kumaş', en: 'fabric' },
  fit: { tr: 'kalıp', en: 'fit' },
};

const isEmpty = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.every((entry) => !entry.trim()) : !value?.trim();

export function missingDetails(item: ClothingAttributes & { category: Category }): DetailField[] {
  return (FIELDS_BY_CATEGORY[item.category] ?? []).filter((field) => isEmpty(item[field]));
}

export function isIncomplete(item: ClothingAttributes & { category: Category }): boolean {
  return missingDetails(item).length > 0;
}

export function detailLabels(fields: DetailField[], language: 'tr' | 'en'): string {
  return fields.map((field) => LABELS[field][language]).join(', ');
}

/**
 * Fills only the empty fields of `current` from an AI analysis, so values the user typed or
 * corrected are never overwritten.
 */
export function fillMissingAttributes(
  current: ClothingAttributes,
  analysis: Partial<ClothingAttributes>,
): ClothingAttributes {
  const next: ClothingAttributes = { ...current };
  const keys: Array<keyof ClothingAttributes> = [
    'name', 'subType', 'primaryColor', 'secondaryColors', 'pattern', 'styleTags', 'seasons',
    'description', 'fit', 'fabric', 'formality',
  ];
  for (const key of keys) {
    const incoming = analysis[key];
    if (incoming === undefined || isEmpty(incoming) || !isEmpty(current[key])) continue;
    (next as unknown as Record<string, unknown>)[key] = Array.isArray(incoming) ? [...incoming] : incoming;
  }
  return next;
}
