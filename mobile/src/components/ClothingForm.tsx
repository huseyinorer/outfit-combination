import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category, ClothingAttributes } from '../domain/types';
import { colorOptions, fabricOptions, patternOptions, styleTagOptions, subtypeOptions, swatchFor } from '../domain/clothingOptions';
import { colors, radius, spacing } from '../theme/theme';
import { SelectField } from './SelectField';
import { Chip, Field } from './ui';
import { useI18n } from '../locales';

interface Props {
  value: ClothingAttributes;
  onChange: (value: ClothingAttributes) => void;
  /** Narrows the type list to the item's category. */
  category?: Category;
  /** Fields whose current value came from the AI analysis; they get a small "✦ AI" mark. */
  aiFilled?: ReadonlySet<keyof ClothingAttributes>;
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('tr-TR') === b.trim().toLocaleLowerCase('tr-TR');

/** Icons for the style tags, matched on the start of the tag in either language. */
const STYLE_ICONS: Array<[string[], string]> = [
  [['minimal'], '⚪'],
  [['smart casual'], '👔'],
  [['klasik', 'classic'], '🎩'],
  [['sokak', 'street'], '🛹'],
  [['spor', 'sport'], '🏃'],
  [['resmi', 'formal'], '🤵'],
  [['iş-günlük', 'business'], '💼'],
  [['rahat', 'relaxed'], '😌'],
  [['şık', 'elegant'], '✨'],
  [['preppy'], '🎓'],
  [['workwear'], '🛠️'],
  [['utility'], '🧰'],
  [['bohem', 'boho'], '🌼'],
  [['vintage'], '📻'],
];
export const styleIcon = (tag: string) => {
  const normalized = tag.trim().toLocaleLowerCase('tr-TR');
  return STYLE_ICONS.find(([keys]) => keys.some((key) => normalized.startsWith(key)))?.[1] ?? '🏷️';
};

/**
 * Clothing details in three steps: the required basics (name, type, color), style tags as
 * tappable chips, and the remaining details — usually filled by AI — in a collapsed section.
 */
export function ClothingForm({ value, onChange, aiFilled, category }: Props) {
  const { language } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const set = <K extends keyof ClothingAttributes>(key: K, next: ClothingAttributes[K]) => {
    onChange({ ...value, [key]: next });
  };
  const label = (text: string, key: keyof ClothingAttributes, required = false) =>
    `${text}${required ? ' *' : ''}${aiFilled?.has(key) ? ' · ✦ AI' : ''}`;
  const lang = language === 'tr' ? 'tr' : 'en';
  const single = (next: string | string[]) => (Array.isArray(next) ? next[0] ?? '' : next);
  const many = (next: string | string[]) => (Array.isArray(next) ? next : next ? [next] : []);

  const fitOptions = language === 'tr' ? ['Dar', 'Normal', 'Rahat', 'Oversize'] : ['Slim', 'Regular', 'Relaxed', 'Oversized'];
  const seasonOptions = language === 'tr'
    ? ['İlkbahar', 'Yaz', 'Sonbahar', 'Kış', '4 mevsim']
    : ['Spring', 'Summer', 'Autumn', 'Winter', 'All season'];
  const formalityOptions = [
    { value: '1', label: l('1 · Çok rahat', '1 · Very casual') },
    { value: '2', label: l('2 · Günlük', '2 · Casual') },
    { value: '3', label: l('3 · Smart casual', '3 · Smart casual') },
    { value: '4', label: l('4 · İş', '4 · Business') },
    { value: '5', label: l('5 · Resmi', '5 · Formal') },
  ];

  const fit = value.fit ?? '';
  const customFit = fit && !fitOptions.some((option) => same(option, fit)) ? fit : null;
  const extraSeasons = value.seasons.filter((season) => !seasonOptions.some((option) => same(option, season)));
  const toggleSeason = (season: string) => {
    const selected = value.seasons.some((entry) => same(entry, season));
    set('seasons', selected ? value.seasons.filter((entry) => !same(entry, season)) : [...value.seasons, season]);
  };
  const styleOptions = styleTagOptions(lang);
  const extraStyles = value.styleTags.filter((tag) => !styleOptions.some((option) => same(option, tag)));
  const toggleStyle = (tag: string) => {
    const selected = value.styleTags.some((entry) => same(entry, tag));
    if (!selected && value.styleTags.length >= 5) return;
    set('styleTags', selected ? value.styleTags.filter((entry) => !same(entry, tag)) : [...value.styleTags, tag]);
  };

  // A short summary of what the collapsed details contain, so it is clear what is inside.
  const detailSummary = [
    fit,
    value.seasons.join(', '),
    value.formality ? l(`resmiyet ${value.formality}`, `formality ${value.formality}`) : '',
    value.fabric ?? '',
    value.pattern,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{l('Temel bilgiler', 'Basics')}</Text>
        <Field
          label={label(l('Ad', 'Name'), 'name', true)}
          value={value.name}
          onChangeText={(text) => set('name', text)}
          placeholder={l('ör. Lacivert keten gömlek', 'e.g. Navy linen shirt')}
        />
        <SelectField
          label={label(l('Tür', 'Type'), 'subType', true)}
          options={subtypeOptions(category, lang).map((entry) => ({ value: entry }))}
          value={value.subType}
          onChange={(next) => set('subType', single(next))}
          placeholder={l('Gömlek, jean, sneaker…', 'Shirt, jeans, sneakers…')}
        />
        <SelectField
          label={label(l('Ana renk', 'Main color'), 'primaryColor', true)}
          options={colorOptions(lang)}
          value={value.primaryColor}
          onChange={(next) => set('primaryColor', single(next))}
          placeholder={l('Renk seç', 'Choose a color')}
          colorOf={swatchFor}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{label(l('Tarz', 'Style'), 'styleTags')}</Text>
        <Text style={styles.sectionHint}>{l('Bu parçayı en iyi anlatanlara dokun (en fazla 5).', 'Tap the ones that describe this piece (up to 5).')}</Text>
        <View style={styles.chips}>
          {styleOptions.map((tag) => (
            <Chip
              key={tag}
              label={`${styleIcon(tag)} ${tag}`}
              selected={value.styleTags.some((entry) => same(entry, tag))}
              onPress={() => toggleStyle(tag)}
            />
          ))}
          {extraStyles.map((tag) => (
            <Chip key={tag} label={`${styleIcon(tag)} ${tag}`} selected onPress={() => toggleStyle(tag)} />
          ))}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsOpen }}
        onPress={() => setDetailsOpen((open) => !open)}
        style={({ pressed }) => [styles.detailsToggle, detailsOpen && styles.detailsToggleOpen, pressed && styles.pressed]}
      >
        <View style={styles.detailsCopy}>
          <Text style={styles.detailsTitle}>{l('Detaylar · AI doldurur, istersen düzelt', 'Details · filled by AI, edit if needed')}</Text>
          <Text numberOfLines={2} style={styles.detailsSummary}>
            {detailSummary || l('Kalıp, mevsim, resmiyet, kumaş, desen, ikincil renk, not', 'Fit, season, formality, fabric, pattern, secondary colors, note')}
          </Text>
        </View>
        <Text style={styles.detailsChevron}>{detailsOpen ? '⌃' : '⌄'}</Text>
      </Pressable>

      {detailsOpen ? (
        <View style={styles.section}>
          <View style={styles.group}>
            <Text style={styles.groupLabel}>{label(l('Kalıp', 'Fit'), 'fit')}</Text>
            <View style={styles.chips}>
              {fitOptions.map((option) => (
                <Chip key={option} label={option} selected={same(fit, option)} onPress={() => set('fit', same(fit, option) ? '' : option)} />
              ))}
              {customFit ? <Chip label={customFit} selected onPress={() => set('fit', '')} /> : null}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>{label(l('Mevsim', 'Season'), 'seasons')}</Text>
            <View style={styles.chips}>
              {seasonOptions.map((option) => (
                <Chip key={option} label={option} selected={value.seasons.some((entry) => same(entry, option))} onPress={() => toggleSeason(option)} />
              ))}
              {extraSeasons.map((season) => (
                <Chip key={season} label={season} selected onPress={() => toggleSeason(season)} />
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>{label(l('Resmiyet', 'Formality'), 'formality')}</Text>
            <View style={styles.chips}>
              {formalityOptions.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={value.formality === option.value}
                  onPress={() => set('formality', value.formality === option.value ? '' : option.value)}
                />
              ))}
            </View>
          </View>

          <SelectField
            label={label(l('Kumaş', 'Fabric'), 'fabric')}
            options={fabricOptions(lang).map((entry) => ({ value: entry }))}
            value={value.fabric ?? ''}
            onChange={(next) => set('fabric', single(next))}
            placeholder={l('Pamuk, denim, yün…', 'Cotton, denim, wool…')}
          />
          <SelectField
            label={label(l('Desen', 'Pattern'), 'pattern')}
            options={patternOptions(lang).map((entry) => ({ value: entry }))}
            value={value.pattern}
            onChange={(next) => set('pattern', single(next))}
            placeholder={l('Düz, çizgili, kareli…', 'Solid, striped, checked…')}
          />
          <SelectField
            label={label(l('İkincil renkler', 'Secondary colors'), 'secondaryColors')}
            options={colorOptions(lang)}
            value={value.secondaryColors}
            onChange={(next) => set('secondaryColors', many(next))}
            multiple
            max={4}
            placeholder={l('İsteğe bağlı', 'Optional')}
            colorOf={swatchFor}
          />
          <Field
            label={label(l('Not', 'Note'), 'description')}
            value={value.description}
            onChangeText={(text) => set('description', text)}
            placeholder={l('İnce kumaşlı, açık yakalı…', 'Lightweight, open collar…')}
            multiline
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  section: { gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  sectionHint: { color: colors.muted, fontSize: 12 },
  group: { gap: spacing.sm },
  groupLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  detailsToggleOpen: { borderWidth: 2 },
  detailsCopy: { flex: 1, gap: 2 },
  detailsTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  detailsSummary: { color: colors.muted, fontSize: 12 },
  detailsChevron: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  pressed: { opacity: 0.7 },
});
