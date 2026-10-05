import type { LanguagePreference } from '../i18n';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface Settings {
  readonly language: LanguagePreference;
  readonly theme: ThemeMode;
  /** Couleurs du fond d'écran (Android 12+) ; sinon palette de la marque. */
  readonly dynamicColor: boolean;
  readonly haptics: boolean;
  /** Barrer automatiquement les cases interdites par une reine posée. */
  readonly autoCross: boolean;
  /** Texture par région (aide au daltonisme). */
  readonly regionPatterns: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  theme: 'system',
  dynamicColor: true,
  haptics: true,
  autoCross: false,
  regionPatterns: false,
};
