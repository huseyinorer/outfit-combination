import {
  Appearance,
  DynamicColorIOS,
  Platform,
  PlatformColor,
  type ColorValue,
} from 'react-native';

export type AppThemePreference = 'system' | 'light' | 'dark';
export type AppColorScheme = 'light' | 'dark';

const lightPalette = {
  background: '#F7F3EA',
  surface: '#FFFCF6',
  surfaceMuted: '#EEE9DF',
  figure: '#D8D1C5',
  text: '#211F1B',
  muted: '#746F65',
  primary: '#264D3B',
  onPrimary: '#FFFFFF',
  primarySoft: '#DDE9E0',
  accent: '#B36B3D',
  border: '#DED8CC',
  danger: '#A13A32',
  dangerSoft: '#F8E2DF',
  warningSoft: '#F4E5D4',
  successBorder: '#BFD2C5',
  warningBorder: '#D8C3A8',
  developerSurface: '#F8F1DF',
  developerBorder: '#C9B789',
  snackbar: '#25231F',
  snackbarText: '#FFFFFF',
  snackbarAction: '#CFE8D7',
  white: '#FFFFFF',
} as const;

const darkPalette: Record<keyof typeof lightPalette, string> = {
  background: '#111512',
  surface: '#1A201C',
  surfaceMuted: '#242B26',
  figure: '#3C463F',
  text: '#F3EFE7',
  muted: '#B9B2A7',
  primary: '#78B491',
  onPrimary: '#102219',
  primarySoft: '#23382C',
  accent: '#E3A270',
  border: '#39423B',
  danger: '#F08C83',
  dangerSoft: '#402522',
  warningSoft: '#392E22',
  successBorder: '#416650',
  warningBorder: '#70583D',
  developerSurface: '#302B20',
  developerBorder: '#77663F',
  snackbar: '#E7E1D7',
  snackbarText: '#171914',
  snackbarAction: '#24563C',
  white: '#FFFFFF',
};

type ColorName = keyof typeof lightPalette;

const androidResourceName = (name: ColorName) => `@color/outfit_${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;

const adaptiveColor = (name: ColorName): ColorValue => {
  if (Platform.OS === 'android') return PlatformColor(androidResourceName(name));
  if (Platform.OS === 'ios') {
    return DynamicColorIOS({ light: lightPalette[name], dark: darkPalette[name] });
  }
  return lightPalette[name];
};

export const colors = Object.fromEntries(
  (Object.keys(lightPalette) as ColorName[]).map((name) => [name, adaptiveColor(name)]),
) as Record<ColorName, ColorValue>;

export function applyThemePreference(preference: AppThemePreference): void {
  Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
}

export function effectiveColorScheme(): AppColorScheme {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
};

