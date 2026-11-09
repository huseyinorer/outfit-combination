import * as Haptics from 'expo-haptics';

export type HapticLevel = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'select';

export function hapticTick(level: HapticLevel = 'light') {
  try {
    switch (level) {
      case 'light':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case 'select':
        void Haptics.selectionAsync();
        break;
    }
  } catch {
    // Haptics not supported on this device; silently ignore.
  }
}
