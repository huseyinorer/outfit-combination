import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { ClothingItem } from '../domain/types';
import { colors, spacing } from '../theme/theme';
import { useI18n } from '../locales';

interface Props {
  item?: ClothingItem | null;
  items?: ClothingItem[];
  initialIndex?: number;
  onClose: () => void;
}

export function ImageViewerModal(props: Props) {
  const { language } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;

  const list = (props.items && props.items.length > 0)
    ? props.items
    : (props.item ? [props.item] : []);
  const visible = list.length > 0;
  const startIndex = Math.min(Math.max(0, props.initialIndex ?? 0), Math.max(0, list.length - 1));
  const [index, setIndex] = useState(startIndex);
  const listRef = useRef<FlatList<ClothingItem>>(null);
  const { width } = Dimensions.get('window');

  useEffect(() => {
    if (visible) setIndex(startIndex);
  }, [visible, startIndex]);

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(next, list.length - 1)));
  };

  const current = list[index];
  const multi = list.length > 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <View style={styles.backdrop}>
        <View style={styles.topBar}>
          <Text numberOfLines={1} style={styles.title}>
            {multi ? `${index + 1}/${list.length} · ` : ''}{current?.name || current?.subType || l('Kıyafet fotoğrafı', 'Clothing photo')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={l('Fotoğrafı kapat', 'Close photo')}
            onPress={props.onClose}
            hitSlop={12}
          >
            <Text style={styles.close}>{l('Kapat', 'Close')} ×</Text>
          </Pressable>
        </View>
        <FlatList
          ref={listRef}
          data={list}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(it) => it.id}
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item }) => (
            <View style={{ width, paddingHorizontal: spacing.md, flex: 1 }}>
              <Image source={{ uri: item.photoUri }} style={styles.image} resizeMode="contain" />
            </View>
          )}
          style={styles.pager}
        />
        {multi ? (
          <View style={styles.dots}>
            {list.map((it, i) => (
              <View key={it.id} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        ) : null}
        <Text style={styles.hint}>
          {multi
            ? l('Diğer parçalara kaydır · Kapat ile çık', 'Swipe for other pieces · tap Close to exit')
            : l('Kapatmak için Kapat düğmesine dokun', 'Tap Close to dismiss')}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 19, 17, 0.96)', paddingVertical: spacing.md },
  topBar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.md },
  title: { flex: 1, color: colors.white, fontSize: 17, fontWeight: '800' },
  close: { color: colors.white, fontSize: 15, fontWeight: '700' },
  pager: { flex: 1 },
  image: { flex: 1, width: '100%' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: spacing.xs },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { backgroundColor: '#FFFFFF', width: 20 },
  hint: { color: '#D9D5CD', textAlign: 'center', fontSize: 12, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
