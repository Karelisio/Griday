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
  /** Rappel quotidien (notification locale). */
  readonly reminder: boolean;
  /** Heure locale du rappel, « HH:MM ». */
  readonly reminderTime: string;
  /** Le rappel a déjà été proposé après une victoire (on ne redemande pas). */
  readonly reminderPrompted: boolean;
}

/** Heure « HH:MM » valide (00:00 à 23:59). */
export const isReminderTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  theme: 'system',
  dynamicColor: true,
  haptics: true,
  autoCross: false,
  regionPatterns: false,
  reminder: false,
  reminderTime: '19:00',
  reminderPrompted: false,
};
