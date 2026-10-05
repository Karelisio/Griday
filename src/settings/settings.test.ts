import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from './SettingsContext';
import { DEFAULT_SETTINGS } from './types';

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
});
