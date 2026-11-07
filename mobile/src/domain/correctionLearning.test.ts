import assert from 'node:assert/strict';
import test from 'node:test';
import { applyLearnedCorrections } from './correctionLearning.ts';
import { EMPTY_ATTRIBUTES } from './types.ts';

test('aynı AI düzeltmesi iki kez yapıldığında sonraki analizde yerel olarak uygulanır', () => {
  const corrected = applyLearnedCorrections(
    { ...EMPTY_ATTRIBUTES, primaryColor: 'koyu mavi', subType: 'spor ayakkabı' },
    [
      {
        category: 'shoes',
        field: 'primaryColor',
        originalValue: 'Koyu Mavi',
        correctedValue: 'Lacivert',
        occurrences: 2,
      },
    ],
  );
  assert.equal(corrected.primaryColor, 'Lacivert');
  assert.equal(corrected.subType, 'spor ayakkabı');
});

test('tek düzeltme otomatik öğrenme için yeterli değildir', () => {
  const corrected = applyLearnedCorrections(
    { ...EMPTY_ATTRIBUTES, pattern: 'çizgili' },
    [
      {
        category: 'top',
        field: 'pattern',
        originalValue: 'çizgili',
        correctedValue: 'ince çizgili',
        occurrences: 1,
      },
    ],
  );
  assert.equal(corrected.pattern, 'çizgili');
});
