import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Category, ClothingItem } from '../domain/types';
import { MAX_SHOP_SLOTS, isRequiredSlot, maxItemsFor, type SlotMode, type SlotState } from '../domain/slots';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';
import { PrimaryButton } from './ui';

interface Props {
  category: Category | null;
  slot: SlotState | null;
  items: ClothingItem[];
  /** How many other slots are already set to shopping (max three in total). */
  otherShopSlots: number;
  onChange: (slot: SlotState) => void;
  onAddItem: (category: Category) => void;
  onClose: () => void;
}

/**
 * Bottom sheet for one outfit slot: pick pieces from the wardrobe, let AI choose, ask for a
 * shopping suggestion, or (optional slots) leave it out. One choice per row, like a radio list.
 */
export function SlotSheet({ category, slot, items, otherShopSlots, onChange, onAddItem, onClose }: Props) {
  const { language, t } = useI18n();
  const l = (turkish: string, english: string) => language === 'tr' ? turkish : english;
  if (!category || !slot) return null;

  const required = isRequiredSlot(category);
  const max = maxItemsFor(category);
  const pool = items.filter((item) => item.category === category);
  const label = t(`category.${category}` as 'category.top' | 'category.bottom' | 'category.shoes' | 'category.hat' | 'category.accessory' | 'category.outerwear');
  const shopBlocked = slot.mode !== 'shop' && otherShopSlots >= MAX_SHOP_SLOTS;

  const options: Array<{ mode: SlotMode; title: string; hint: string; disabled?: boolean }> = [
    {
      mode: required ? 'ai' : 'auto',
      title: required ? l('✦ AI dolabımdan seçsin', '✦ Let AI pick from my wardrobe') : l('✦ AI karar versin', '✦ Let AI decide'),
      hint: required
        ? l('Diğer parçalara en uygun olanı AI seçer.', 'AI picks the one that suits the rest best.')
        : l('Havaya ve kombine uyuyorsa AI ekler, uymuyorsa boş bırakır.', 'AI adds one if it suits the weather and outfit.'),
    },
    {
      mode: 'pick',
      title: max > 1
        ? l(`👕 Dolabımdan seçeceğim (en fazla ${max})`, `👕 I'll choose from my wardrobe (up to ${max})`)
        : l('👕 Dolabımdan seçeceğim', "👕 I'll choose from my wardrobe"),
      hint: l('Seçtiğin parça sabit kalır, kombinler onun etrafında şekillenir.', 'Your piece stays fixed and the outfits are built around it.'),
      disabled: pool.length === 0,
    },
    {
      mode: 'shop',
      title: l('🛍 Alışverişte öner · +1 🪙', '🛍 Suggest from stores · +1 🪙'),
      hint: shopBlocked
        ? l(`En fazla ${MAX_SHOP_SLOTS} parça alışverişe bırakılabilir.`, `Up to ${MAX_SHOP_SLOTS} pieces can be left to shopping.`)
        : l('Kombinine en uygun parçayı satın alman için AI sana tavsiyede bulunur; mağazalardaki ürünleri görselleriyle listeler.', 'AI recommends the piece that best completes your outfit to buy, and lists store products with images.'),
      disabled: shopBlocked,
    },
  ];
  if (!required) {
    options.push({ mode: 'none', title: l('— Olmasın', '— Leave it out'), hint: l('Bu kombinde kullanılmaz.', 'Not used in this outfit.') });
  }

  const selectMode = (mode: SlotMode) => {
    if (mode === 'pick') {
      onChange({ mode: 'pick', itemIds: slot.mode === 'pick' ? slot.itemIds : [] });
      return;
    }
    onChange({ mode, itemIds: [] });
    onClose();
  };

  const toggleItem = (id: string) => {
    if (max === 1) {
      onChange({ mode: 'pick', itemIds: [id] });
      onClose();
      return;
    }
    const selected = slot.itemIds.includes(id);
    if (!selected && slot.itemIds.length >= max) return;
    onChange({ mode: 'pick', itemIds: selected ? slot.itemIds.filter((value) => value !== id) : [...slot.itemIds, id] });
  };

  const close = () => {
    // A "choose" slot left without any piece falls back to AI.
    if (slot.mode === 'pick' && slot.itemIds.length === 0) onChange({ mode: required ? 'ai' : 'auto', itemIds: [] });
    onClose();
  };

  return (
    <Modal animationType="slide" transparent visible onRequestClose={close} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel={l('Kapat', 'Close')} onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{label}</Text>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const selected = slot.mode === option.mode;
              return (
                <Pressable
                  key={option.mode}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: option.disabled }}
                  disabled={option.disabled}
                  onPress={() => selectMode(option.mode)}
                  style={({ pressed }) => [styles.option, selected && styles.optionSelected, option.disabled && styles.disabled, pressed && styles.pressed]}
                >
                  <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionHint}>{option.hint}</Text>
                  </View>
                </Pressable>
              );
            })}

            {pool.length === 0 ? (
              <Pressable accessibilityRole="button" onPress={() => { onClose(); onAddItem(category); }} style={styles.addLink}>
                <Text style={styles.addLinkText}>{l(`Dolabında ${label.toLocaleLowerCase('tr-TR')} yok · + Parça ekle`, `No ${label.toLowerCase()} in your wardrobe · + Add one`)}</Text>
              </Pressable>
            ) : null}

            {slot.mode === 'pick' ? (
              <>
                <Text style={styles.gridTitle}>
                  {max > 1
                    ? l(`Parçalarını seç (${slot.itemIds.length}/${max})`, `Choose your pieces (${slot.itemIds.length}/${max})`)
                    : l('Bir parça seç', 'Choose a piece')}
                </Text>
                <View style={styles.grid}>
                  {pool.map((item) => {
                    const selected = slot.itemIds.includes(item.id);
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        accessibilityLabel={item.name || label}
                        onPress={() => toggleItem(item.id)}
                        style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && styles.pressed]}
                      >
                        <Image source={{ uri: item.thumbnailUri ?? item.photoUri }} style={styles.tileImage} resizeMode="cover" />
                        {selected ? <View style={styles.tileCheck}><Text style={styles.tileCheckText}>✓</Text></View> : null}
                        <Text numberOfLines={2} style={styles.tileName}>{item.name || item.subType || label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>
          <PrimaryButton title={l('Tamam', 'Done')} onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24, 23, 20, 0.54)' },
  sheet: {
    maxHeight: '88%',
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  handle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.border },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  body: { gap: spacing.sm, paddingBottom: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.sm,
    minHeight: 60,
  },
  optionSelected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  optionHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  addLink: { paddingVertical: spacing.xs },
  addLinkText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  gridTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: 100, gap: 4, borderRadius: radius.sm, borderWidth: 2, borderColor: 'transparent', padding: 2 },
  tileSelected: { borderColor: colors.primary },
  tileImage: { width: '100%', height: 110, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  tileCheck: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  tileCheckText: { color: colors.onPrimary, fontSize: 13, fontWeight: '900' },
  tileName: { color: colors.text, fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
