import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from './SettingsContext';
import { DEFAULT_SETTINGS, suggestReminderTime } from './types';

describe('réglages', () => {
  it('valeurs par défaut si rien ou n’importe quoi', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ language: 'de', theme: 'blue', haptics: 'yes' })).toEqual(DEFAULT_SETTINGS);
  });

  it('conserve les valeurs valides', () => {
    const s = {
      language: 'fr',
      theme: 'dark',
      dynamicColor: false,
      haptics: false,
      autoCross: true,
      regionPatterns: true,
      reminder: true,
      reminderTime: '08:30',
      reminderPrompted: true,
    };
    expect(sanitizeSettings(s)).toEqual(s);
  });

  it('heure de rappel invalide : valeur par défaut', () => {
    for (const reminderTime of ['24:00', '7:30', '07:60', 730, null]) {
      expect(sanitizeSettings({ reminderTime }).reminderTime).toBe(DEFAULT_SETTINGS.reminderTime);
    }
  });

  it('heure de rappel proposée : quart d’heure inférieur, entre 07:00 et 22:30', () => {
    const at = (h: number, m: number) => suggestReminderTime(new Date(2026, 9, 5, h, m));
    expect(at(8, 14)).toBe('08:00');
    expect(at(19, 59)).toBe('19:45');
    expect(at(5, 30)).toBe('07:00');
    expect(at(23, 50)).toBe('22:30');
  });
});
