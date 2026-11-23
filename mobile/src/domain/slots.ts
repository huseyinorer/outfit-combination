import type { Category, ClothingItem, OutfitRequestExtras, OutfitSuggestion } from './types.ts';
import { CATEGORIES, REQUIRED_CATEGORIES } from './types.ts';

/**
 * What the user wants in one slot:
 * - pick: pieces the user chose from the wardrobe (one per slot, up to three accessories)
 * - ai:   main slot (top/bottom/shoes) — AI picks from the wardrobe
 * - auto: optional slot (outerwear/hat/accessory) — AI decides whether to add one
 * - none: optional slot left empty
 * - shop: bought new — the result becomes one shopping look with products
 */
export type SlotMode = 'pick' | 'ai' | 'auto' | 'none' | 'shop';

export interface SlotState {
  mode: SlotMode;
  itemIds: string[];
}

export type OutfitSlotsState = Record<Category, SlotState>;
export type Pins = Partial<Record<Category, string[]>>;

export const MAX_ACCESSORIES = 3;
export const MAX_SHOP_SLOTS = 3;
export const SLOT_ORDER: Category[] = ['top', 'bottom', 'shoes', 'outerwear', 'hat', 'accessory'];

export const isRequiredSlot = (category: Category) =>
  (REQUIRED_CATEGORIES as readonly Category[]).includes(category);

export const maxItemsFor = (category: Category) => (category === 'accessory' ? MAX_ACCESSORIES : 1);

export function defaultSlots(): OutfitSlotsState {
  return Object.fromEntries(
    CATEGORIES.map((category) => [category, { mode: isRequiredSlot(category) ? 'ai' : 'auto', itemIds: [] }]),
  ) as unknown as OutfitSlotsState;
}

/** Slots with one wardrobe piece already placed (from "Build outfits with this"). */
export function slotsWithPiece(item: ClothingItem): OutfitSlotsState {
  const slots = defaultSlots();
  slots[item.category] = { mode: 'pick', itemIds: [item.id] };
  return slots;
}

export function pinsOf(slots: OutfitSlotsState): Pins {
  const pins: Pins = {};
  for (const category of CATEGORIES) {
    const slot = slots[category];
    if (slot.mode === 'pick' && slot.itemIds.length > 0) pins[category] = slot.itemIds.slice(0, maxItemsFor(category));
  }
  return pins;
}

export function shopCategoriesOf(slots: OutfitSlotsState): Category[] {
  return SLOT_ORDER.filter((category) => slots[category].mode === 'shop');
}

/** Extras modes for the local (free) engine; picked extras are handled through pins. */
export function extrasOf(slots: OutfitSlotsState): OutfitRequestExtras {
  const mode = (category: 'hat' | 'accessory' | 'outerwear') =>
    slots[category].mode === 'none' || slots[category].mode === 'shop' ? 'exclude' as const : 'auto' as const;
  return { hat: mode('hat'), accessory: mode('accessory'), outerwear: mode('outerwear') };
}

/** Drops chosen pieces that no longer exist (deleted, or a different owner's wardrobe). */
export function sanitizeSlots(slots: OutfitSlotsState, items: ClothingItem[]): OutfitSlotsState {
  const byId = new Map(items.map((item) => [item.id, item]));
  const next = { ...slots };
  for (const category of CATEGORIES) {
    const slot = slots[category];
    if (slot.mode !== 'pick') continue;
    const itemIds = slot.itemIds.filter((id) => byId.get(id)?.category === category).slice(0, maxItemsFor(category));
    next[category] = itemIds.length > 0
      ? { mode: 'pick', itemIds }
      : { mode: isRequiredSlot(category) ? 'ai' : 'auto', itemIds: [] };
  }
  return next;
}

/** All accessories of a suggestion (new list field, falling back to the single legacy field). */
export function accessoryIdsOf(suggestion: Pick<OutfitSuggestion, 'accessoryId' | 'accessoryIds'>): string[] {
  const ids = suggestion.accessoryIds && suggestion.accessoryIds.length > 0
    ? suggestion.accessoryIds
    : suggestion.accessoryId ? [suggestion.accessoryId] : [];
  return [...new Set(ids)].slice(0, MAX_ACCESSORIES);
}
