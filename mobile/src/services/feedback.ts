import { Alert, Platform, ToastAndroid, Vibration } from 'react-native';

export function tactileSuccess(message: string): void {
  Vibration.vibrate(18);
  if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  else Alert.alert(message);
}
