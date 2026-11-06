import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeSuggestions,
  getMissingCategories,
  resolveOutfitItems,
  validateAiSuggestions,
} from './outfitEngine.ts';
import type { Category, ClothingItem, OutfitPreferences } from './types.ts';

const preferences: OutfitPreferences = {
  destination: 'arkadaş buluşması',
  look: 'smart casual',
  tone: 'koyu',
};

const item = (id: string, category: Category, color = 'lacivert'): ClothingItem => ({
  id,
  category,
  name: id,
  subType: category,
  primaryColor: color,
  secondaryColors: [],
  pattern: 'düz',
  styleTags: ['smart casual'],
  seasons: ['dört mevsim'],
  description: '',
  photoUri: `file:///${id}.jpg`,
  cutoutUri: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

test('boş kategori AI çağrısından önce saptanır', () => {
  assert.deepEqual(getMissingCategories([item('t1', 'top'), item('b1', 'bottom')]), ['shoes']);
});

test('yalnız bir üçlü mümkünse tek kombin döner', () => {
  const wardrobe = [item('t1', 'top'), item('b1', 'bottom'), item('s1', 'shoes')];
  assert.equal(completeSuggestions(wardrobe, preferences).length, 1);
});

test('en az üç üçlü mümkünse üç farklı kombin döner', () => {
  const wardrobe = [
    item('t1', 'top'),
    item('t2', 'top', 'siyah'),
    item('t3', 'top', 'gri'),
    item('b1', 'bottom'),
    item('b2', 'bottom', 'siyah'),
    item('s1', 'shoes'),
    item('s2', 'shoes', 'siyah'),
  ];
  const result = completeSuggestions(wardrobe, preferences);
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map((x) => `${x.topId}|${x.bottomId}|${x.shoeId}`)).size, 3);
});

test('modelin yanlış ID ve kategori dönüşü elenir, yerel kuralla tamamlanır', () => {
  const wardrobe = [
    item('t1', 'top'),
    item('t2', 'top'),
    item('b1', 'bottom'),
    item('s1', 'shoes'),
    item('s2', 'shoes'),
  ];
  const bad = [
    { title: 'Hatalı', topId: 'yok', bottomId: 'b1', shoeId: 's1', reason: 'Hatalı.' },
    { title: 'Kategori hatası', topId: 'b1', bottomId: 't1', shoeId: 's1', reason: 'Hatalı.' },
  ];
  assert.equal(validateAiSuggestions(wardrobe, bad).length, 0);
  assert.equal(completeSuggestions(wardrobe, preferences, bad).length, 3);
});

test('modelin tekrarladığı üçlü yalnız bir kez gösterilir', () => {
  const wardrobe = [
    item('t1', 'top'), item('t2', 'top'), item('b1', 'bottom'),
    item('s1', 'shoes'), item('s2', 'shoes'),
  ];
  const duplicate = {
    title: 'Tekrar', topId: 't1', bottomId: 'b1', shoeId: 's1', reason: 'Uyumlu.',
  };
  assert.equal(validateAiSuggestions(wardrobe, [duplicate, duplicate]).length, 1);
  const completed = completeSuggestions(wardrobe, preferences, [duplicate, duplicate]);
  assert.equal(completed.length, 3);
  assert.equal(new Set(completed.map((x) => `${x.topId}|${x.bottomId}|${x.shoeId}`)).size, 3);
});

test('API kesintisinde elle kaydedilen kayıtlar ve fotoğraflar ID ile eşleşir', () => {
  const wardrobe = [item('t1', 'top'), item('b1', 'bottom'), item('s1', 'shoes')];
  const [suggestion] = completeSuggestions(wardrobe, preferences);
  assert.ok(suggestion);
  const resolved = resolveOutfitItems(wardrobe, suggestion);
  assert.equal(resolved.top?.photoUri, 'file:///t1.jpg');
  assert.equal(resolved.bottom?.photoUri, 'file:///b1.jpg');
  assert.equal(resolved.shoes?.photoUri, 'file:///s1.jpg');
});

