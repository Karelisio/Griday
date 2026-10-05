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
    const s = { language: 'fr', theme: 'dark', dynamicColor: false, haptics: false, autoCross: true };
    expect(sanitizeSettings(s)).toEqual(s);
  });
});
