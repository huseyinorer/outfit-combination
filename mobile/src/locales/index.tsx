import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { en } from './en';
import { tr, type TranslationKey } from './tr';

export type AppLanguage = 'tr' | 'en';

interface LocalizationValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

const LocalizationContext = createContext<LocalizationValue | null>(null);

export function deviceLanguage(): AppLanguage {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('tr') ? 'tr' : 'en';
  } catch {
    return 'tr';
  }
}

export function translate(
  language: AppLanguage,
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  let result: string = (language === 'tr' ? tr : en)[key];
  for (const [name, replacement] of Object.entries(values ?? {})) {
    result = result.replaceAll(`{${name}}`, String(replacement));
  }
  return result;
}

export function LocalizationProvider({
  language,
  onLanguageChange,
  children,
}: {
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
  children: ReactNode;
}) {
  const value = useMemo<LocalizationValue>(() => ({
    language,
    setLanguage: onLanguageChange,
    t: (key, values) => translate(language, key, values),
  }), [language, onLanguageChange]);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useI18n(): LocalizationValue {
  const value = useContext(LocalizationContext);
  if (!value) throw new Error('LocalizationProvider is missing.');
  return value;
}
