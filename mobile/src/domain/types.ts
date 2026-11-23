export const CATEGORIES = ['top', 'bottom', 'shoes', 'hat', 'accessory', 'outerwear'] as const;
export type Category = (typeof CATEGORIES)[number];

export const REQUIRED_CATEGORIES = ['top', 'bottom', 'shoes'] as const satisfies ReadonlyArray<Category>;
export const OPTIONAL_CATEGORIES = ['hat', 'accessory', 'outerwear'] as const satisfies ReadonlyArray<Category>;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Üst',
  bottom: 'Alt',
  shoes: 'Ayakkabı',
  hat: 'Şapka',
  accessory: 'Aksesuar',
  outerwear: 'Mont',
};

export interface ClothingAttributes {
  name: string;
  subType: string;
  primaryColor: string;
  secondaryColors: string[];
  pattern: string;
  styleTags: string[];
  seasons: string[];
  description: string;
  /** Cut/volume, e.g. slim, regular, relaxed, oversized. Optional for items saved before it existed. */
  fit?: string;
  fabric?: string;
  /** "1" (very casual) … "5" (formal), or empty. */
  formality?: string;
}

export interface ClothingItem extends ClothingAttributes {
  id: string;
  category: Category;
  photoUri: string;
  thumbnailUri: string | null;
  cutoutUri: string | null;
  photoHash?: string | null;
  price?: number | null;
  currency?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClothingDraft {
  id: string;
  category: Category;
  photoUri: string;
  photoHash?: string | null;
  attributes: ClothingAttributes;
  aiAttributes?: ClothingAttributes | null;
  categoryConflict: boolean;
  detectedCategory: Category | null;
  analysisError: string | null;
  analysisMode?: 'undecided' | 'ai' | 'manual';
}

export interface OutfitPreferences {
  destination: string;
  look: string;
  tone: string;
}

export interface OutfitSuggestion {
  title: string;
  topId: string;
  bottomId: string;
  shoeId: string;
  hatId?: string | null;
  accessoryId?: string | null;
  /** Up to three accessories; accessoryId mirrors the first one. */
  accessoryIds?: string[] | null;
  outerwearId?: string | null;
  reason: string;
  source?: 'ai' | 'local';
}

export interface OutfitRequestExtras {
  hat?: 'auto' | 'include' | 'exclude';
  accessory?: 'auto' | 'include' | 'exclude';
  outerwear?: 'auto' | 'include' | 'exclude';
}

export interface OutfitRequestContext {
  temperatureC?: number;
  isRaining?: boolean;
  season?: string;
}

export interface OutfitKeyTriple {
  topId: string;
  bottomId: string;
  shoeId: string;
}

export interface FavoriteOutfit extends OutfitSuggestion {
  id: string;
  createdAt: string;
}

export interface OutfitResult {
  suggestions: OutfitSuggestion[];
  usedFallback: boolean;
  warning?: string;
  shopping?: ShoppingLook | null;
}

export interface ShoppingProduct {
  name: string;
  store: string;
  price: string;
  url: string;
  /** Preview image from the product page; empty when the store did not expose one. */
  imageUrl?: string;
}

export interface ShoppingHistoryEntry {
  batchId: string;
  suggestedAt: string;
  preferences: OutfitPreferences;
  look: ShoppingLook;
}

/** Everything the results screen needs, as produced by the outfit screen. */
export interface OutfitResultsPayload {
  suggestions: OutfitSuggestion[];
  warning?: string;
  preferences: OutfitPreferences;
  /** Pieces the user fixed per slot; "show another set" keeps them. */
  pins?: Partial<Record<Category, string[]>>;
  shopping?: ShoppingLook | null;
  extras?: OutfitRequestExtras;
  /** IDs of the pieces the request could use (weather filter); null means the whole wardrobe. */
  poolIds?: string[] | null;
}

/** One piece to buy: what it should be, products found for it and store search links. */
export interface ShoppingPiece {
  category: Category;
  idealItem: { name: string; description: string; searchQuery: string };
  products: ShoppingProduct[];
  searchLinks: Array<{ label: string; url: string }>;
}

/** One outfit where the `shopCategories` pieces are to be bought; other IDs come from the wardrobe. */
export interface ShoppingLook {
  shopCategories: Category[];
  title: string;
  reason: string;
  topId?: string | null;
  bottomId?: string | null;
  shoeId?: string | null;
  outerwearId?: string | null;
  hatId?: string | null;
  accessoryId?: string | null;
  accessoryIds?: string[] | null;
  pieces: ShoppingPiece[];
}

export type OutfitFeedbackValue = 'like' | 'dislike';

/** Why the user disliked an outfit; sent to the AI so it learns the reason, not just the combo. */
export type OutfitDislikeReason = 'colors' | 'occasion' | 'weather' | 'style';

export interface OutfitDislike extends OutfitKeyTriple {
  reason: OutfitDislikeReason | null;
}

export interface WornOutfit extends OutfitSuggestion {
  id: string;
  wornAt: string;
}

export interface SuggestedOutfitHistoryEntry extends OutfitSuggestion {
  id: string;
  batchId: string;
  suggestedAt: string;
  position: number;
  preferences: OutfitPreferences;
}

export interface CorrectionRule {
  category: Category;
  field: 'name' | 'subType' | 'primaryColor' | 'pattern';
  originalValue: string;
  correctedValue: string;
  occurrences: number;
}

export const EMPTY_ATTRIBUTES: ClothingAttributes = {
  name: '',
  subType: '',
  primaryColor: '',
  secondaryColors: [],
  pattern: '',
  styleTags: [],
  seasons: [],
  description: '',
  fit: '',
  fabric: '',
  formality: '',
};

