import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ClothingItem } from '../domain/types';
import { colors, spacing } from '../theme/theme';
import { useI18n } from '../locales';

export function ImageViewerModal({ item, onClose }: {
  item: ClothingItem | null;
  onClose: () => void;
}) {
  const { language } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  return (
    <Modal visible={Boolean(item)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel={l('Fotoğrafı kapat', 'Close photo')} style={styles.backdrop} onPress={onClose}>
        <View style={styles.topBar}>
          <Text numberOfLines={1} style={styles.title}>{item?.name || item?.subType || l('Kıyafet fotoğrafı', 'Clothing photo')}</Text>
          <Text style={styles.close}>{l('Kapat', 'Close')} ×</Text>
        </View>
        {item ? <Image source={{ uri: item.photoUri }} style={styles.image} resizeMode="contain" /> : null}
        <Text style={styles.hint}>{l('Kapatmak için boş alana dokun', 'Tap outside to close')}</Text>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 19, 17, 0.96)', padding: spacing.md },
  topBar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, color: colors.white, fontSize: 17, fontWeight: '800' },
  close: { color: colors.white, fontSize: 15, fontWeight: '700' },
  image: { flex: 1, width: '100%' },
  hint: { color: '#D9D5CD', textAlign: 'center', fontSize: 12, paddingVertical: spacing.sm },
});
