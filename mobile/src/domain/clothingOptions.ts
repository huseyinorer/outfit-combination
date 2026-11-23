import type { Category } from './types.ts';

/** Fashion color palette with swatches, used by the color dropdowns. */
export const COLOR_PALETTE: Array<{ tr: string; en: string; hex: string }> = [
  { tr: 'Siyah', en: 'Black', hex: '#1d1d1f' },
  { tr: 'Beyaz', en: 'White', hex: '#ffffff' },
  { tr: 'Kırık beyaz', en: 'Off-white', hex: '#f4f1e8' },
  { tr: 'Ekru', en: 'Ecru', hex: '#ece3cf' },
  { tr: 'Krem', en: 'Cream', hex: '#f1e8d2' },
  { tr: 'Bej', en: 'Beige', hex: '#d9c6a5' },
  { tr: 'Kum', en: 'Sand', hex: '#cdb891' },
  { tr: 'Taş', en: 'Stone', hex: '#b8ae9c' },
  { tr: 'Vizon', en: 'Taupe', hex: '#8f8073' },
  { tr: 'Deve tüyü', en: 'Camel', hex: '#b5854b' },
  { tr: 'Taba', en: 'Tan', hex: '#a0683a' },
  { tr: 'Kahverengi', en: 'Brown', hex: '#6b4429' },
  { tr: 'Çikolata', en: 'Chocolate', hex: '#4a2c1d' },
  { tr: 'Hardal', en: 'Mustard', hex: '#c99a2e' },
  { tr: 'Sarı', en: 'Yellow', hex: '#ecc94b' },
  { tr: 'Turuncu', en: 'Orange', hex: '#e07b2e' },
  { tr: 'Kiremit', en: 'Rust', hex: '#a9472a' },
  { tr: 'Kırmızı', en: 'Red', hex: '#c8282d' },
  { tr: 'Bordo', en: 'Burgundy', hex: '#6d1f2c' },
  { tr: 'Pembe', en: 'Pink', hex: '#e9a1b8' },
  { tr: 'Pudra', en: 'Blush', hex: '#e8c4bd' },
  { tr: 'Fuşya', en: 'Fuchsia', hex: '#c2287a' },
  { tr: 'Lila', en: 'Lilac', hex: '#c3a6d8' },
  { tr: 'Lavanta', en: 'Lavender', hex: '#a99bd4' },
  { tr: 'Mor', en: 'Purple', hex: '#6b3fa0' },
  { tr: 'Lacivert', en: 'Navy', hex: '#1f2a4d' },
  { tr: 'Saks mavisi', en: 'Cobalt', hex: '#1f4fb5' },
  { tr: 'Mavi', en: 'Blue', hex: '#2f6fd1' },
  { tr: 'Açık mavi', en: 'Light blue', hex: '#a9c8ef' },
  { tr: 'Bebe mavisi', en: 'Baby blue', hex: '#cfe2f5' },
  { tr: 'İndigo', en: 'Indigo', hex: '#33407a' },
  { tr: 'Petrol', en: 'Teal', hex: '#1f5d66' },
  { tr: 'Turkuaz', en: 'Turquoise', hex: '#2fb5b0' },
  { tr: 'Mint', en: 'Mint', hex: '#a8dcc4' },
  { tr: 'Yeşil', en: 'Green', hex: '#2f7a4a' },
  { tr: 'Zümrüt', en: 'Emerald', hex: '#1a6b4f' },
  { tr: 'Haki', en: 'Khaki', hex: '#7b7a4a' },
  { tr: 'Zeytin yeşili', en: 'Olive', hex: '#5d5f2e' },
  { tr: 'Adaçayı', en: 'Sage', hex: '#9bab8d' },
  { tr: 'Açık gri', en: 'Light grey', hex: '#c9c9c9' },
  { tr: 'Gri', en: 'Grey', hex: '#9a9a9a' },
  { tr: 'Füme', en: 'Smoke', hex: '#5f6166' },
  { tr: 'Antrasit', en: 'Charcoal', hex: '#3b3e42' },
  { tr: 'Gümüş', en: 'Silver', hex: '#c0c3c8' },
  { tr: 'Altın', en: 'Gold', hex: '#c8a44a' },
];

export function colorOptions(language: 'tr' | 'en') {
  return COLOR_PALETTE.map((entry) => ({ value: language === 'tr' ? entry.tr : entry.en, color: entry.hex }));
}

/** Swatch for any stored color name in either language (case-insensitive, "koyu lacivert" too). */
export function swatchFor(name: string): string | undefined {
  const normalized = name.trim().toLocaleLowerCase('tr-TR');
  if (!normalized) return undefined;
  const exact = COLOR_PALETTE.find((entry) =>
    entry.tr.toLocaleLowerCase('tr-TR') === normalized || entry.en.toLowerCase() === normalized);
  if (exact) return exact.hex;
  return COLOR_PALETTE.find((entry) =>
    normalized.includes(entry.tr.toLocaleLowerCase('tr-TR')) || normalized.includes(entry.en.toLowerCase()))?.hex;
}

const SUBTYPES: Record<Category, { tr: string[]; en: string[] }> = {
  top: {
    tr: ['Tişört', 'Gömlek', 'Oxford gömlek', 'Keten gömlek', 'Polo yaka', 'Bluz', 'Atlet', 'Crop top', 'Sweatshirt', 'Hoodie', 'Kazak', 'Triko', 'Balıkçı yaka', 'Hırka', 'Overshirt'],
    en: ['T-shirt', 'Shirt', 'Oxford shirt', 'Linen shirt', 'Polo', 'Blouse', 'Tank top', 'Crop top', 'Sweatshirt', 'Hoodie', 'Sweater', 'Knit top', 'Turtleneck', 'Cardigan', 'Overshirt'],
  },
  bottom: {
    tr: ['Jean', 'Chino', 'Kumaş pantolon', 'Kargo pantolon', 'Jogger', 'Eşofman altı', 'Şort', 'Bermuda', 'Etek', 'Mini etek', 'Midi etek', 'Tayt', 'Palazzo'],
    en: ['Jeans', 'Chinos', 'Trousers', 'Cargo pants', 'Joggers', 'Sweatpants', 'Shorts', 'Bermuda shorts', 'Skirt', 'Mini skirt', 'Midi skirt', 'Leggings', 'Wide-leg pants'],
  },
  shoes: {
    tr: ['Sneaker', 'Koşu ayakkabısı', 'Loafer', 'Oxford', 'Derby', 'Bot', 'Chelsea bot', 'Çizme', 'Sandalet', 'Terlik', 'Espadril', 'Topuklu ayakkabı', 'Babet'],
    en: ['Sneakers', 'Running shoes', 'Loafers', 'Oxfords', 'Derbies', 'Boots', 'Chelsea boots', 'Tall boots', 'Sandals', 'Slides', 'Espadrilles', 'Heels', 'Flats'],
  },
  outerwear: {
    tr: ['Mont', 'Şişme mont', 'Kaban', 'Palto', 'Trençkot', 'Blazer ceket', 'Deri ceket', 'Denim ceket', 'Bomber ceket', 'Parka', 'Yelek', 'Yağmurluk'],
    en: ['Jacket', 'Puffer jacket', 'Coat', 'Overcoat', 'Trench coat', 'Blazer', 'Leather jacket', 'Denim jacket', 'Bomber jacket', 'Parka', 'Vest', 'Raincoat'],
  },
  hat: {
    tr: ['Kep', 'Bere', 'Fötr', 'Bucket şapka', 'Hasır şapka', 'Kasket'],
    en: ['Cap', 'Beanie', 'Fedora', 'Bucket hat', 'Straw hat', 'Flat cap'],
  },
  accessory: {
    tr: ['Saat', 'Kemer', 'Çanta', 'Sırt çantası', 'Atkı', 'Şal', 'Güneş gözlüğü', 'Kolye', 'Bilezik', 'Yüzük', 'Küpe', 'Kravat', 'Papyon', 'Cüzdan'],
    en: ['Watch', 'Belt', 'Bag', 'Backpack', 'Scarf', 'Shawl', 'Sunglasses', 'Necklace', 'Bracelet', 'Ring', 'Earrings', 'Tie', 'Bow tie', 'Wallet'],
  },
};

export function subtypeOptions(category: Category | undefined, language: 'tr' | 'en'): string[] {
  if (!category) return [...new Set(Object.values(SUBTYPES).flatMap((entry) => entry[language]))];
  return SUBTYPES[category][language];
}

export function patternOptions(language: 'tr' | 'en'): string[] {
  return language === 'tr'
    ? ['Düz', 'Çizgili', 'İnce çizgili', 'Kareli', 'Ekose', 'Puantiye', 'Çiçekli', 'Kamuflaj', 'Baskılı', 'Logolu', 'Balıksırtı', 'Pied-de-poule', 'Hayvan deseni', 'Geometrik', 'Batik']
    : ['Solid', 'Striped', 'Pinstripe', 'Checked', 'Plaid', 'Polka dot', 'Floral', 'Camouflage', 'Printed', 'Logo', 'Herringbone', 'Houndstooth', 'Animal print', 'Geometric', 'Tie-dye'];
}

export function fabricOptions(language: 'tr' | 'en'): string[] {
  return language === 'tr'
    ? ['Pamuk', 'Denim', 'Keten', 'Yün', 'Kaşmir', 'Triko', 'Polyester', 'Viskon', 'İpek', 'Saten', 'Kadife', 'Tüvit', 'Polar', 'Deri', 'Suni deri', 'Süet', 'Kanvas', 'Teknik kumaş', 'Naylon']
    : ['Cotton', 'Denim', 'Linen', 'Wool', 'Cashmere', 'Knit', 'Polyester', 'Viscose', 'Silk', 'Satin', 'Velvet', 'Tweed', 'Fleece', 'Leather', 'Faux leather', 'Suede', 'Canvas', 'Technical fabric', 'Nylon'];
}

export function styleTagOptions(language: 'tr' | 'en'): string[] {
  return language === 'tr'
    ? ['Minimal', 'Smart casual', 'Klasik', 'Sokak', 'Spor', 'Resmi', 'İş-günlük', 'Rahat', 'Şık', 'Preppy', 'Workwear', 'Utility', 'Bohem', 'Vintage']
    : ['Minimal', 'Smart casual', 'Classic', 'Streetwear', 'Sporty', 'Formal', 'Business casual', 'Relaxed', 'Elegant', 'Preppy', 'Workwear', 'Utility', 'Boho', 'Vintage'];
}
