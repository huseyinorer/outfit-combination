import { StyleSheet, View } from 'react-native';
import type { ClothingAttributes } from '../domain/types';
import { spacing } from '../theme/theme';
import { Field } from './ui';

interface Props {
  value: ClothingAttributes;
  onChange: (value: ClothingAttributes) => void;
}

const list = (text: string) => text.split(',').map((x) => x.trim()).filter(Boolean);

export function ClothingForm({ value, onChange }: Props) {
  const set = <K extends keyof ClothingAttributes>(key: K, next: ClothingAttributes[K]) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <View style={styles.container}>
      <Field label="Kısa ad" value={value.name} onChangeText={(text) => set('name', text)} placeholder="Lacivert çizgili gömlek" />
      <Field label="Alt tür" value={value.subType} onChangeText={(text) => set('subType', text)} placeholder="Gömlek, chino, sneaker..." />
      <Field label="Ana renk" value={value.primaryColor} onChangeText={(text) => set('primaryColor', text)} placeholder="Lacivert" />
      <Field
        label="İkincil renkler"
        value={value.secondaryColors.join(', ')}
        onChangeText={(text) => set('secondaryColors', list(text))}
        placeholder="Beyaz, gri"
        hint="Birden fazlaysa virgülle ayır."
      />
      <Field label="Desen" value={value.pattern} onChangeText={(text) => set('pattern', text)} placeholder="Düz, ince çizgili..." />
      <Field
        label="Tarz etiketleri"
        value={value.styleTags.join(', ')}
        onChangeText={(text) => set('styleTags', list(text))}
        placeholder="Smart casual, rahat"
        hint="Virgülle ayır."
      />
      <Field
        label="Mevsim"
        value={value.seasons.join(', ')}
        onChangeText={(text) => set('seasons', list(text))}
        placeholder="İlkbahar, yaz"
        hint="Virgülle ayır."
      />
      <Field
        label="Kısa açıklama"
        value={value.description}
        onChangeText={(text) => set('description', text)}
        placeholder="İnce kumaşlı, açık yakalı..."
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({ container: { gap: spacing.md } });

