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
  /** Signaler les cases en conflit pendant la partie (sinon : seulement une grille remplie mais fausse). */
  readonly showConflicts: boolean;
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

/** Plage proposée pour un rappel (assez tôt pour qu'il n'arrive jamais après minuit, même en retard). */
const SUGGESTED_FROM = 7 * 60;
const SUGGESTED_TO = 22 * 60 + 30;

/** Heure de rappel proposée d'après l'heure de jeu : au quart d'heure inférieur, entre 07:00 et 22:30. */
export function suggestReminderTime(now: Date): string {
  const minutes = Math.min(SUGGESTED_TO, Math.max(SUGGESTED_FROM, Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) * 15));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  theme: 'system',
  dynamicColor: true,
  haptics: true,
  autoCross: false,
  showConflicts: true,
  regionPatterns: false,
  reminder: false,
  reminderTime: '19:00',
  reminderPrompted: false,
};
