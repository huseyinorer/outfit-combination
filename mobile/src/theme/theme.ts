import {
  Appearance,
  DynamicColorIOS,
  Platform,
  PlatformColor,
  type ColorValue,
} from 'react-native';

export type AppThemePreference = 'system' | 'light' | 'dark';
export type AppColorScheme = 'light' | 'dark';

export const lightPalette = {
  background: '#F6F3ED',
  surface: '#FFFFFF',
  surfaceMuted: '#EDEAE2',
  figure: '#E0DCCF',
  text: '#1F2122',
  muted: '#656963',
  primary: '#2A2D2F',
  onPrimary: '#F6F3ED',
  primarySoft: '#E4E2DA',
  accent: '#6E8571',
  border: '#DED9CD',
  danger: '#955041',
  dangerSoft: '#F4DDD6',
  warningSoft: '#F3E6CE',
  successBorder: '#B7C8B5',
  warningBorder: '#DCC89C',
  developerSurface: '#ECE8D9',
  developerBorder: '#BFB89C',
  snackbar: '#1F2122',
  snackbarText: '#F6F3ED',
  snackbarAction: '#92A999',
  imageActionSurface: 'rgba(255,255,255,0.94)',
  imageActionText: '#1F2122',
  white: '#FFFFFF',
} as const;

export const darkPalette: Record<keyof typeof lightPalette, string> = {
  background: '#111214',
  surface: '#1A1C1D',
  surfaceMuted: '#22252A',
  figure: '#232627',
  text: '#ECE8DE',
  muted: '#9DA19A',
  primary: '#D3D1C6',
  onPrimary: '#111214',
  primarySoft: '#2C2E2E',
  accent: '#92A999',
  border: '#292C2D',
  danger: '#E29184',
  dangerSoft: '#3A2420',
  warningSoft: '#322A1C',
  successBorder: '#3F524A',
  warningBorder: '#5F5236',
  developerSurface: '#1F2224',
  developerBorder: '#3D4341',
  snackbar: '#1A1C1D',
  snackbarText: '#ECE8DE',
  snackbarAction: '#92A999',
  imageActionSurface: 'rgba(17,18,20,0.94)',
  imageActionText: '#ECE8DE',
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

export function getPaletteForScheme(scheme: AppColorScheme) {
  return scheme === 'dark' ? darkPalette : lightPalette;
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

