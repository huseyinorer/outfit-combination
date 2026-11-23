import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';
import { PrimaryButton } from './ui';

export interface SelectOption {
  value: string;
  /** Optional swatch shown as a small dot next to the name (colors). */
  color?: string;
}

interface Props {
  label: string;
  options: SelectOption[];
  /** Single value (string) or several values (string[]) when `multiple` is set. */
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  max?: number;
  placeholder?: string;
  /** Value shown with a swatch even when it is not in the list (e.g. a color the AI named). */
  colorOf?: (value: string) => string | undefined;
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('tr-TR') === b.trim().toLocaleLowerCase('tr-TR');

/**
 * A dropdown-style field: tap to open a searchable list (radio for one value, checkboxes for
 * several). Values that are not in the list can still be typed in and added.
 */
export function SelectField({ label, options, value, onChange, multiple = false, max, placeholder, colorOf }: Props) {
  const { language } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const values = Array.isArray(value) ? value : value ? [value] : [];

  // Custom values (not in the list) are shown first so they can be seen and removed.
  const allOptions = useMemo(() => {
    const custom = values.filter((entry) => !options.some((option) => same(option.value, entry)))
      .map((entry) => ({ value: entry, color: colorOf?.(entry) }));
    return [...custom, ...options];
  }, [options, values, colorOf]);
  const filtered = query.trim()
    ? allOptions.filter((option) => option.value.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR')))
    : allOptions;
  const canAddCustom = query.trim().length > 0 && !allOptions.some((option) => same(option.value, query));
  const swatch = (entry: string) => options.find((option) => same(option.value, entry))?.color ?? colorOf?.(entry);

  const isSelected = (entry: string) => values.some((current) => same(current, entry));
  const choose = (entry: string) => {
    if (!multiple) {
      onChange(isSelected(entry) ? '' : entry);
      setQuery('');
      setOpen(false);
      return;
    }
    if (isSelected(entry)) onChange(values.filter((current) => !same(current, entry)));
    else if (!max || values.length < max) onChange([...values, entry]);
    setQuery('');
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${values.join(', ') || placeholder || ''}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <View style={styles.triggerValues}>
          {values.length === 0 ? (
            <Text style={styles.placeholder}>{placeholder ?? l('Seç', 'Choose')}</Text>
          ) : values.map((entry) => (
            <View key={entry} style={styles.valueChip}>
              {swatch(entry) ? <View style={[styles.dot, { backgroundColor: swatch(entry) }]} /> : null}
              <Text style={styles.valueText}>{entry}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.overlay}>
          <Pressable accessibilityLabel={l('Kapat', 'Close')} onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>
              {label}{multiple && max ? ` (${values.length}/${max})` : ''}
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={l('Ara ya da yeni yaz…', 'Search or type a new one…')}
              placeholderTextColor={colors.muted}
              style={styles.search}
            />
            <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
              {canAddCustom ? (
                <Pressable accessibilityRole="button" onPress={() => choose(query.trim())} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                  <Text style={styles.addText}>+ “{query.trim()}” {l('ekle', 'add')}</Text>
                </Pressable>
              ) : null}
              {filtered.map((option) => {
                const selected = isSelected(option.value);
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole={multiple ? 'checkbox' : 'radio'}
                    accessibilityState={multiple ? { checked: selected } : { selected }}
                    onPress={() => choose(option.value)}
                    style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed]}
                  >
                    <View style={[multiple ? styles.check : styles.radio, selected && styles.markOn]}>
                      {selected ? (multiple ? <Text style={styles.checkMark}>✓</Text> : <View style={styles.radioDot} />) : null}
                    </View>
                    {option.color ? <View style={[styles.dotLarge, { backgroundColor: option.color }]} /> : null}
                    <Text style={styles.rowText}>{option.value}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {multiple ? <PrimaryButton title={l('Tamam', 'Done')} onPress={() => { setQuery(''); setOpen(false); }} /> : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { color: colors.text, fontSize: 14, fontWeight: '800' },
  trigger: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  triggerValues: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  placeholder: { color: colors.muted, fontSize: 15 },
  valueChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, backgroundColor: colors.primarySoft, paddingHorizontal: 10, paddingVertical: 4 },
  valueText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chevron: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24, 23, 20, 0.54)' },
  sheet: {
    maxHeight: '82%',
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  handle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.border },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  search: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: colors.background, fontSize: 15 },
  list: { gap: 4, paddingBottom: spacing.sm },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  rowSelected: { backgroundColor: colors.primarySoft },
  rowText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  addText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  check: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  markOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
  checkMark: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  dotLarge: { width: 20, height: 20, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  pressed: { opacity: 0.7 },
});
