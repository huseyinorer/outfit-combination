import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { colors, radius, spacing } from '../theme/theme';

type Variant = 'primary' | 'secondary';
type Icon = 'sparkle' | 'plus';

interface Props {
  title: string;
  hint?: string;
  onPress: () => void;
  variant?: Variant;
  icon: Icon;
  accessibilityLabel?: string;
  disabled?: boolean;
}

export function ActionCard({ title, hint, onPress, variant = 'primary', icon, accessibilityLabel, disabled }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();

  const isPrimary = variant === 'primary';
  const bg = isPrimary ? colors.primary : colors.surface;
  const textColor = isPrimary ? colors.onPrimary : colors.text;
  const hintColor = isPrimary ? colors.onPrimary : colors.muted;
  const borderColor = isPrimary ? colors.primary : colors.border;
  const iconBg = isPrimary ? 'rgba(255,255,255,0.14)' : colors.primarySoft;
  const iconColor = isPrimary ? colors.onPrimary : colors.primary;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        style={[
          styles.card,
          { backgroundColor: bg, borderColor },
          disabled && styles.disabled,
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          <ActionIcon icon={icon} color={iconColor as string} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
          {hint ? <Text style={[styles.hint, { color: hintColor }]}>{hint}</Text> : null}
        </View>
        <Text style={[styles.chevron, { color: textColor }]}>›</Text>
      </Pressable>
    </Animated.View>
  );
}

function ActionIcon({ icon, color }: { icon: Icon; color: string }) {
  if (icon === 'sparkle') {
    return (
      <Svg width={28} height={28} viewBox="0 0 32 32" fill="none">
        <Path
          d="M16 3 L18.2 12.8 L28 14.5 L18.2 16.2 L16 26 L13.8 16.2 L4 14.5 L13.8 12.8 Z"
          fill={color}
        />
        <Circle cx={26} cy={7} r={1.6} fill={color} />
        <Circle cx={6} cy={25} r={1.4} fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={28} height={28} viewBox="0 0 32 32" fill="none">
      <Path d="M16 6 L16 26 M6 16 L26 16" stroke={color} strokeWidth={3.2} strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 72,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '900', letterSpacing: -0.1 },
  hint: { fontSize: 12, lineHeight: 17 },
  chevron: { fontSize: 28, fontWeight: '900', opacity: 0.6, marginRight: 4 },
  disabled: { opacity: 0.55 },
});
