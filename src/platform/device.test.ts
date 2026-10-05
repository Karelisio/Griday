import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version as packageVersion } from '../../package.json';

const h = vi.hoisted(() => ({
  platform: 'web' as string,
  getInfo: vi.fn(),
  getLanguageTag: vi.fn(),
  getLanguageCode: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => h.platform, isNativePlatform: () => h.platform !== 'web' },
}));
vi.mock('@capacitor/app', () => ({ App: { getInfo: h.getInfo } }));
vi.mock('@capacitor/device', () => ({
  Device: { getLanguageTag: h.getLanguageTag, getLanguageCode: h.getLanguageCode },
}));

import { getAppVersion, getSystemLanguages, isNativeAndroid } from './device';

/** jsdom : navigator.languages / language sont des accesseurs du prototype, on les masque par instance. */
function setBrowserLanguages(languages: readonly string[], language?: string): void {
  Object.defineProperty(navigator, 'languages', { configurable: true, value: languages });
  Object.defineProperty(navigator, 'language', { configurable: true, value: language ?? languages[0] ?? '' });
}

beforeEach(() => {
  h.platform = 'web';
  h.getInfo.mockReset();
  h.getLanguageTag.mockReset().mockResolvedValue({ value: 'fr-FR' });
  h.getLanguageCode.mockReset().mockResolvedValue({ value: 'fr' });
  setBrowserLanguages(['en-US', 'en']);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'languages');
  Reflect.deleteProperty(navigator, 'language');
});

describe('isNativeAndroid', () => {
  it.each([
    ['web', false],
    ['android', true],
    ['ios', false],
  ])('plateforme %s : %s', (platform, expected) => {
    h.platform = platform;
    expect(isNativeAndroid()).toBe(expected);
  });
});

describe('getSystemLanguages', () => {
  it('web : navigator.languages, sans interroger le plugin Device', async () => {
    setBrowserLanguages(['fr-FR', 'fr', 'en']);
    await expect(getSystemLanguages()).resolves.toEqual(['fr-FR', 'fr', 'en']);
    expect(h.getLanguageTag).not.toHaveBeenCalled();
  });

  it('web : repli sur navigator.language si la liste est vide', async () => {
    setBrowserLanguages([], 'de-DE');
    await expect(getSystemLanguages()).resolves.toEqual(['de-DE']);
  });

  it('web : aucune langue connue donne une liste vide', async () => {
    setBrowserLanguages([], '');
    await expect(getSystemLanguages()).resolves.toEqual([]);
  });

  it("natif : la langue de l'appareil passe en premier, suivie des autres préférences, sans doublon", async () => {
    h.platform = 'android';
    setBrowserLanguages(['en-US', 'FR-fr', 'de']);
    await expect(getSystemLanguages()).resolves.toEqual(['fr-FR', 'en-US', 'de']);
  });

  it("natif : repli sur le code de langue si l'étiquette échoue", async () => {
    h.platform = 'android';
    h.getLanguageTag.mockRejectedValue(new Error('indisponible'));
    await expect(getSystemLanguages()).resolves.toEqual(['fr', 'en-US', 'en']);
  });

  it('natif : étiquette vide, repli sur le code de langue', async () => {
    h.platform = 'android';
    h.getLanguageTag.mockResolvedValue({ value: '' });
    await expect(getSystemLanguages()).resolves.toEqual(['fr', 'en-US', 'en']);
  });

  it('natif : plugin Device entièrement indisponible, repli sur navigator', async () => {
    h.platform = 'android';
    h.getLanguageTag.mockRejectedValue(new Error('indisponible'));
    h.getLanguageCode.mockRejectedValue(new Error('indisponible'));
    await expect(getSystemLanguages()).resolves.toEqual(['en-US', 'en']);
  });

  it('ignore les entrées vides et les doublons', async () => {
    setBrowserLanguages(['', '  ', 'fr', 'fr']);
    await expect(getSystemLanguages()).resolves.toEqual(['fr']);
  });
});

describe('getAppVersion', () => {
  it('web : version de package.json', async () => {
    await expect(getAppVersion()).resolves.toBe(packageVersion);
    expect(h.getInfo).not.toHaveBeenCalled();
  });

  it('natif : versionName renvoyé par le plugin App', async () => {
    h.platform = 'android';
    h.getInfo.mockResolvedValue({ name: 'Griday', id: 'io.github.karelisio.griday', build: '1', version: '9.8.7' });
    await expect(getAppVersion()).resolves.toBe('9.8.7');
  });

  it('natif : repli sur package.json si le plugin échoue ou renvoie une version vide', async () => {
    h.platform = 'android';
    h.getInfo.mockRejectedValueOnce(new Error('indisponible'));
    await expect(getAppVersion()).resolves.toBe(packageVersion);
    h.getInfo.mockResolvedValueOnce({ name: 'Griday', id: 'x', build: '1', version: '' });
    await expect(getAppVersion()).resolves.toBe(packageVersion);
  });

  it('la version de package.json est un semver', () => {
    expect(packageVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});
