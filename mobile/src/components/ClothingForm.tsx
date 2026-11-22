import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClothingAttributes } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { Chip, Field } from './ui';
import { useI18n } from '../locales';

interface Props {
  value: ClothingAttributes;
  onChange: (value: ClothingAttributes) => void;
  /** Fields whose current value came from the AI analysis; they get a small "✦ AI" mark. */
  aiFilled?: ReadonlySet<keyof ClothingAttributes>;
}

const list = (text: string) => text.split(',').map((x) => x.trim()).filter(Boolean);
const same = (a: string, b: string) => a.trim().toLocaleLowerCase('tr-TR') === b.trim().toLocaleLowerCase('tr-TR');

const COLORS: Array<{ tr: string; en: string; hex: string }> = [
  { tr: 'Siyah', en: 'Black', hex: '#1d1d1f' },
  { tr: 'Beyaz', en: 'White', hex: '#ffffff' },
  { tr: 'Gri', en: 'Grey', hex: '#9a9a9a' },
  { tr: 'Antrasit', en: 'Charcoal', hex: '#3b3e42' },
  { tr: 'Lacivert', en: 'Navy', hex: '#1f2a4d' },
  { tr: 'Mavi', en: 'Blue', hex: '#2f6fd1' },
  { tr: 'Açık mavi', en: 'Light blue', hex: '#a9c8ef' },
  { tr: 'Bej', en: 'Beige', hex: '#d9c6a5' },
  { tr: 'Krem', en: 'Cream', hex: '#f1e8d2' },
  { tr: 'Deve tüyü', en: 'Camel', hex: '#b5854b' },
  { tr: 'Kahverengi', en: 'Brown', hex: '#6b4429' },
  { tr: 'Haki', en: 'Khaki', hex: '#7b7a4a' },
  { tr: 'Yeşil', en: 'Green', hex: '#2f7a4a' },
  { tr: 'Bordo', en: 'Burgundy', hex: '#6d1f2c' },
  { tr: 'Kırmızı', en: 'Red', hex: '#c8282d' },
  { tr: 'Pembe', en: 'Pink', hex: '#e9a1b8' },
  { tr: 'Sarı', en: 'Yellow', hex: '#ecc94b' },
  { tr: 'Turuncu', en: 'Orange', hex: '#e07b2e' },
  { tr: 'Mor', en: 'Purple', hex: '#6b3fa0' },
];

export function ClothingForm({ value, onChange, aiFilled }: Props) {
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
  const colorName = (entry: (typeof COLORS)[number]) => (language === 'tr' ? entry.tr : entry.en);

  return (
    <View style={styles.container}>
      <Field label={label(l('Kısa ad', 'Short name'), 'name')} value={value.name} onChangeText={(text) => set('name', text)} placeholder={l('Lacivert çizgili gömlek', 'Navy striped shirt')} />
      <Field label={label(l('Alt tür', 'Subtype'), 'subType')} value={value.subType} onChangeText={(text) => set('subType', text)} placeholder={l('Gömlek, chino, sneaker...', 'Shirt, chino, sneaker...')} />

      <View style={styles.group}>
        <Text style={styles.groupLabel}>{label(l('Ana renk', 'Primary color'), 'primaryColor')}</Text>
        <View style={styles.swatches}>
          {COLORS.map((entry) => {
            const selected = same(value.primaryColor, entry.tr) || same(value.primaryColor, entry.en);
            return (
              <Pressable
                key={entry.en}
                accessibilityRole="button"
                accessibilityLabel={colorName(entry)}
                accessibilityState={{ selected }}
                onPress={() => set('primaryColor', selected ? '' : colorName(entry))}
                style={[styles.swatchWrap, selected && styles.swatchWrapSelected]}
              >
                <View style={[styles.swatch, { backgroundColor: entry.hex }]} />
              </Pressable>
            );
          })}
        </View>
        <Field
          label={l('Renk adı', 'Color name')}
          value={value.primaryColor}
          onChangeText={(text) => set('primaryColor', text)}
          placeholder={l('Listede yoksa yaz: ekru, adaçayı...', 'Not listed? Type it: ecru, sage...')}
        />
      </View>

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

      <Field label={label(l('Kumaş', 'Fabric'), 'fabric')} value={value.fabric ?? ''} onChangeText={(text) => set('fabric', text)} placeholder={l('Pamuk, denim, yün, triko...', 'Cotton, denim, wool, knit...')} />

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
          <Field label={label(l('Desen', 'Pattern'), 'pattern')} value={value.pattern} onChangeText={(text) => set('pattern', text)} placeholder={l('Düz, ince çizgili...', 'Solid, pinstriped...')} />
          <Field
            label={label(l('İkincil renkler', 'Secondary colors'), 'secondaryColors')}
            value={value.secondaryColors.join(', ')}
            onChangeText={(text) => set('secondaryColors', list(text))}
            placeholder={l('Beyaz, gri', 'White, gray')}
            hint={l('Birden fazlaysa virgülle ayır.', 'Separate multiple values with commas.')}
          />
          <Field
            label={label(l('Tarz etiketleri', 'Style tags'), 'styleTags')}
            value={value.styleTags.join(', ')}
            onChangeText={(text) => set('styleTags', list(text))}
            placeholder={l('Smart casual, rahat', 'Smart casual, relaxed')}
            hint={l('Virgülle ayır.', 'Separate with commas.')}
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
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  swatchWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchWrapSelected: { borderColor: colors.primary },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  moreToggle: { minHeight: 44, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  moreToggleText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
