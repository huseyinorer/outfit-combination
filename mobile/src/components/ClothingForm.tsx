import { StyleSheet, View } from 'react-native';
import type { ClothingAttributes } from '../domain/types';
import { spacing } from '../theme/theme';
import { Field } from './ui';
import { useI18n } from '../locales';

interface Props {
  value: ClothingAttributes;
  onChange: (value: ClothingAttributes) => void;
}

const list = (text: string) => text.split(',').map((x) => x.trim()).filter(Boolean);

export function ClothingForm({ value, onChange }: Props) {
  const { language } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const set = <K extends keyof ClothingAttributes>(key: K, next: ClothingAttributes[K]) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <View style={styles.container}>
      <Field label={l('Kısa ad', 'Short name')} value={value.name} onChangeText={(text) => set('name', text)} placeholder={l('Lacivert çizgili gömlek', 'Navy striped shirt')} />
      <Field label={l('Alt tür', 'Subtype')} value={value.subType} onChangeText={(text) => set('subType', text)} placeholder={l('Gömlek, chino, sneaker...', 'Shirt, chino, sneaker...')} />
      <Field label={l('Ana renk', 'Primary color')} value={value.primaryColor} onChangeText={(text) => set('primaryColor', text)} placeholder={l('Lacivert', 'Navy')} />
      <Field
        label={l('İkincil renkler', 'Secondary colors')}
        value={value.secondaryColors.join(', ')}
        onChangeText={(text) => set('secondaryColors', list(text))}
        placeholder={l('Beyaz, gri', 'White, gray')}
        hint={l('Birden fazlaysa virgülle ayır.', 'Separate multiple values with commas.')}
      />
      <Field label={l('Desen', 'Pattern')} value={value.pattern} onChangeText={(text) => set('pattern', text)} placeholder={l('Düz, ince çizgili...', 'Solid, pinstriped...')} />
      <Field
        label={l('Tarz etiketleri', 'Style tags')}
        value={value.styleTags.join(', ')}
        onChangeText={(text) => set('styleTags', list(text))}
        placeholder={l('Smart casual, rahat', 'Smart casual, relaxed')}
        hint={l('Virgülle ayır.', 'Separate with commas.')}
      />
      <Field
        label={l('Mevsim', 'Season')}
        value={value.seasons.join(', ')}
        onChangeText={(text) => set('seasons', list(text))}
        placeholder={l('İlkbahar, yaz', 'Spring, summer')}
        hint={l('Virgülle ayır.', 'Separate with commas.')}
      />
      <Field
        label={l('Kısa açıklama', 'Short description')}
        value={value.description}
        onChangeText={(text) => set('description', text)}
        placeholder={l('İnce kumaşlı, açık yakalı...', 'Lightweight fabric, open collar...')}
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { gap: spacing.md } });

