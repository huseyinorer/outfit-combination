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
}

export interface ClothingItem extends ClothingAttributes {
  id: string;
  category: Category;
  photoUri: string;
  thumbnailUri: string | null;
  cutoutUri: string | null;
  photoHash?: string | null;
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
  outerwearId?: string | null;
  reason: string;
  source?: 'ai' | 'local';
}

export interface OutfitRequestExtras {
  hat?: 'auto' | 'include' | 'exclude';
  accessory?: 'auto' | 'include' | 'exclude';
  outerwear?: 'auto' | 'include' | 'exclude';
}

export interface FavoriteOutfit extends OutfitSuggestion {
  id: string;
  createdAt: string;
}

export interface OutfitResult {
  suggestions: OutfitSuggestion[];
  usedFallback: boolean;
  warning?: string;
}

export type OutfitFeedbackValue = 'like' | 'dislike';

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
};

