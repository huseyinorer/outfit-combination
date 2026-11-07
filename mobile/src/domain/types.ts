export const CATEGORIES = ['top', 'bottom', 'shoes'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  top: 'Üst',
  bottom: 'Alt',
  shoes: 'Ayakkabı',
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
  createdAt: string;
  updatedAt: string;
}

export interface ClothingDraft {
  id: string;
  category: Category;
  photoUri: string;
  attributes: ClothingAttributes;
  aiAttributes?: ClothingAttributes | null;
  categoryConflict: boolean;
  detectedCategory: Category | null;
  analysisError: string | null;
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
  reason: string;
  source?: 'ai' | 'local';
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

