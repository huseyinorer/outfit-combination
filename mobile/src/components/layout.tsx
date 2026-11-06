import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, spacing } from '../theme/theme';

export function ContentFrame({
  children,
  maxWidth = 920,
  style,
}: {
  children: ReactNode;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.frame, { maxWidth }, style]}>{children}</View>;
}

export function StickyFooter({ children }: { children: ReactNode }) {
  return (
    <View style={styles.footer}>
      <ContentFrame style={styles.footerContent}>{children}</ContentFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', alignSelf: 'center' },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  footerContent: { flexDirection: 'row', gap: spacing.sm },
});
