import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import { useI18n } from '../locales';

interface ButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({ title, onPress, disabled, loading, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{title}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, disabled, loading, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        (disabled || loading) && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryText}>{title}</Text>}
    </Pressable>
  );
}

export function DangerButton({ title, onPress, disabled, style }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed, style]}
    >
      <Text style={styles.dangerText}>{title}</Text>
    </Pressable>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
}

export function Field({ label, hint, multiline, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
        {...inputProps}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  return (
    <View style={[styles.notice, tone === 'error' && styles.noticeError]}>
      <Text style={[styles.noticeText, tone === 'error' && styles.noticeTextError]}>{children}</Text>
    </View>
  );
}

export function ScreenHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: ReactNode }) {
  const { t } = useI18n();
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" onPress={onBack} hitSlop={12} style={styles.backButton}>
        <Text style={styles.backText}>{t('common.back')}</Text>
      </Pressable>
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerAction}>{action}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryText: { color: colors.white, fontSize: 17, fontWeight: '700' },
  secondaryButton: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  dangerButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  dangerText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  chip: {
    minHeight: 42,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: colors.white },
  field: { gap: spacing.xs },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  hint: { color: colors.muted, fontSize: 12 },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  noticeError: { backgroundColor: '#F8E2DF' },
  noticeText: { color: colors.primary, fontSize: 14, lineHeight: 20 },
  noticeTextError: { color: colors.danger },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  backButton: { width: 72, minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '800' },
  headerAction: { width: 72, alignItems: 'flex-end' },
});

