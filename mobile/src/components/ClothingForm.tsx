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
  /** Narrows the subtype list to the item's category. */
  category?: Category;
  /** Fields whose current value came from the AI analysis; they get a small "✦ AI" mark. */
  aiFilled?: ReadonlySet<keyof ClothingAttributes>;
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('tr-TR') === b.trim().toLocaleLowerCase('tr-TR');

export function ClothingForm({ value, onChange, aiFilled, category }: Props) {
  const { language } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const [moreOpen, setMoreOpen] = useState(false);
  const set = <K extends keyof ClothingAttributes>(key: K, next: ClothingAttributes[K]) => {
    onChange({ ...value, [key]: next });
  };
  const label = (text: string, key: keyof ClothingAttributes) => aiFilled?.has(key) ? `${text} · ✦ AI` : text;

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
  // Seasons the AI or an older version wrote that are not among the chips stay visible and removable.
  const extraSeasons = value.seasons.filter((season) => !seasonOptions.some((option) => same(option, season)));
  const toggleSeason = (season: string) => {
    const selected = value.seasons.some((entry) => same(entry, season));
    set('seasons', selected ? value.seasons.filter((entry) => !same(entry, season)) : [...value.seasons, season]);
  };
  const lang = language === 'tr' ? 'tr' : 'en';
  const single = (next: string | string[]) => (Array.isArray(next) ? next[0] ?? '' : next);
  const many = (next: string | string[]) => (Array.isArray(next) ? next : next ? [next] : []);

  return (
    <View style={styles.container}>
      <Field label={label(l('Kısa ad', 'Short name'), 'name')} value={value.name} onChangeText={(text) => set('name', text)} placeholder={l('Lacivert çizgili gömlek', 'Navy striped shirt')} />
      <SelectField
        label={label(l('Alt tür', 'Subtype'), 'subType')}
        options={subtypeOptions(category, lang).map((entry) => ({ value: entry }))}
        value={value.subType}
        onChange={(next) => set('subType', single(next))}
        placeholder={l('Gömlek, chino, sneaker…', 'Shirt, chinos, sneakers…')}
      />

      <SelectField
        label={label(l('Ana renk', 'Primary color'), 'primaryColor')}
        options={colorOptions(lang)}
        value={value.primaryColor}
        onChange={(next) => set('primaryColor', single(next))}
        placeholder={l('Renk seç', 'Choose a color')}
        colorOf={swatchFor}
      />

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
            <Chip
              key={option}
              label={option}
              selected={value.seasons.some((entry) => same(entry, option))}
              onPress={() => toggleSeason(option)}
            />
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

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOpen }}
        onPress={() => setMoreOpen((open) => !open)}
        style={({ pressed }) => [styles.moreToggle, pressed && styles.pressed]}
      >
        <Text style={styles.moreToggleText}>
          {moreOpen ? l('Daha az ayrıntı ⌃', 'Fewer details ⌃') : l('Daha fazla ayrıntı (desen, ikincil renk, tarz, not) ⌄', 'More details (pattern, secondary colors, style, note) ⌄')}
        </Text>
      </Pressable>

      {moreOpen ? (
        <>
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
          <SelectField
            label={label(l('Tarz etiketleri', 'Style tags'), 'styleTags')}
            options={styleTagOptions(lang).map((entry) => ({ value: entry }))}
            value={value.styleTags}
            onChange={(next) => set('styleTags', many(next))}
            multiple
            max={5}
            placeholder={l('Smart casual, rahat…', 'Smart casual, relaxed…')}
          />
          <Field
            label={label(l('Kısa açıklama', 'Short description'), 'description')}
            value={value.description}
            onChangeText={(text) => set('description', text)}
            placeholder={l('İnce kumaşlı, açık yakalı...', 'Lightweight fabric, open collar...')}
            multiline
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  group: { gap: spacing.sm },
  groupLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  moreToggle: { minHeight: 44, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  moreToggleText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
