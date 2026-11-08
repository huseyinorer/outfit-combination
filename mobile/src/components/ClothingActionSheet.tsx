import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { type ClothingItem } from '../domain/types';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

export function ClothingActionSheet({
  item,
  onClose,
  onEdit,
  onDelete,
}: {
  item: ClothingItem | null;
  onClose: () => void;
  onEdit: (item: ClothingItem) => void;
  onDelete: (item: ClothingItem) => void;
}) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  const categoryLabel = (category: ClothingItem['category']) => t(`category.${category}` as 'category.top' | 'category.bottom' | 'category.shoes');
  return (
    <Modal
      animationType="fade"
      statusBarTranslucent
      transparent
      visible={Boolean(item)}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel={l('Kıyafet menüsünü kapat', 'Close clothing menu')}
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        {item ? (
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.itemRow}>
              <Image
                source={{ uri: item.thumbnailUri ?? item.photoUri }}
                resizeMode="cover"
                style={styles.thumbnail}
              />
              <View style={styles.itemCopy}>
                <Text numberOfLines={1} style={styles.itemName}>
                  {item.name || categoryLabel(item.category)}
                </Text>
                <Text numberOfLines={1} style={styles.itemMeta}>
                  {[categoryLabel(item.category), item.primaryColor, item.subType].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onEdit(item);
              }}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <View style={styles.editIcon}><View style={styles.editIconLine} /></View>
              <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>{t('common.edit')}</Text>
                <Text style={styles.actionText}>{l('Kıyafet bilgilerini ve özelliklerini güncelle', 'Update clothing details and attributes')}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                onDelete(item);
              }}
              style={({ pressed }) => [styles.action, styles.deleteAction, pressed && styles.pressed]}
            >
              <View style={styles.deleteIcon}>
                <View style={styles.deleteLid} />
                <View style={styles.deleteBin} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={styles.deleteTitle}>{l('Dolaptan kaldır', 'Remove from wardrobe')}</Text>
                <Text style={styles.deleteText}>{l('8 saniye içinde geri alabilirsin', 'You can undo within 8 seconds')}</Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: 'rgba(24, 23, 20, 0.54)',
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  handle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  thumbnail: { width: 62, height: 62, borderRadius: radius.sm, backgroundColor: '#ECE7DC' },
  itemCopy: { flex: 1, gap: 4 },
  itemName: { color: colors.text, fontSize: 18, fontWeight: '900' },
  itemMeta: { color: colors.muted, fontSize: 13 },
  action: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  actionCopy: { flex: 1, gap: 3 },
  actionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  actionText: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  chevron: { color: colors.primary, fontSize: 28, fontWeight: '500' },
  editIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    transform: [{ rotate: '-35deg' }],
  },
  editIconLine: { width: 13, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  deleteAction: { borderColor: '#E7C3BE', backgroundColor: '#FFF7F5' },
  deleteTitle: { color: colors.danger, fontSize: 16, fontWeight: '800' },
  deleteText: { color: '#8B5A54', fontSize: 12 },
  deleteIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  deleteLid: { width: 14, height: 3, borderRadius: 2, backgroundColor: colors.danger, marginBottom: 2 },
  deleteBin: { width: 12, height: 14, borderRadius: 3, borderWidth: 2, borderColor: colors.danger },
  cancel: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  cancelText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.68 },
});
