import { Alert, Platform, ToastAndroid } from 'react-native';
import { hapticTick } from './haptics';

export function tactileSuccess(message: string): void {
  hapticTick('success');
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}
