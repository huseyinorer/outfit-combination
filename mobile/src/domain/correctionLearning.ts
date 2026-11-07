import type { ClothingAttributes, CorrectionRule } from './types';

const learnableFields = ['name', 'subType', 'primaryColor', 'pattern'] as const;

export function applyLearnedCorrections(
  attributes: ClothingAttributes,
  rules: CorrectionRule[],
): ClothingAttributes {
  const corrected: ClothingAttributes = { ...attributes };
  for (const field of learnableFields) {
    const value = corrected[field].trim();
    const rule = rules.find((candidate) =>
      candidate.field === field
      && candidate.occurrences >= 2
      && candidate.originalValue.localeCompare(value, 'tr', { sensitivity: 'accent' }) === 0);
    if (rule) corrected[field] = rule.correctedValue;
  }
  return corrected;
}
