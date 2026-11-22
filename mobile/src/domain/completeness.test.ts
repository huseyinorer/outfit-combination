import assert from 'node:assert/strict';
import test from 'node:test';
import { fillMissingAttributes, isIncomplete, missingDetails } from './completeness.ts';
import { EMPTY_ATTRIBUTES } from './types.ts';

const full = {
  ...EMPTY_ATTRIBUTES,
  subType: 'oxford gömlek',
  primaryColor: 'lacivert',
  seasons: ['ilkbahar'],
  formality: '3',
  fabric: 'pamuk',
  fit: 'slim',
};

test('eksiksiz üst parça tamam sayılır, eski kayıttaki boş alanlar eksik görünür', () => {
  assert.equal(isIncomplete({ ...full, category: 'top' }), false);
  assert.deepEqual(missingDetails({ ...full, fit: undefined, fabric: '', category: 'top' }), ['fabric', 'fit']);
});

test('ayakkabıda kalıp, aksesuarda kumaş ve mevsim istenmez', () => {
  assert.equal(isIncomplete({ ...full, fit: '', category: 'shoes' }), false);
  assert.equal(isIncomplete({ ...full, fit: '', fabric: '', seasons: [], category: 'accessory' }), false);
});

test('AI sonucu yalnızca boş alanları doldurur', () => {
  const merged = fillMissingAttributes(
    { ...full, fit: '', primaryColor: 'bordo' },
    { primaryColor: 'kırmızı', fit: 'rahat', fabric: 'keten' },
  );
  assert.equal(merged.primaryColor, 'bordo');
  assert.equal(merged.fit, 'rahat');
  assert.equal(merged.fabric, 'pamuk');
});
