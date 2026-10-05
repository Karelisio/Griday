/** Fumée sur l'API publique, avec les vrais modules Capacitor (jsdom = web, aucune plateforme native). */
import { describe, expect, it, vi } from 'vitest';
import { version as packageVersion } from '../../package.json';
import * as platform from './index';

describe('API publique de src/platform', () => {
  it("expose exactement les fonctions prévues (aucune sortie accidentelle ni oubli)", () => {
    expect(Object.keys(platform).sort()).toEqual(
      [
        'applySystemBarsStyle',
        'getAppVersion',
        'getSystemLanguages',
        'getSystemPalettes',
        'haptic',
        'initBackHandling',
        'isHapticsEnabled',
        'isNativeAndroid',
        'onAppActiveChange',
        'onSystemPalettesChanged',
        'pushBackHandler',
        'setHapticsEnabled',
      ].sort(),
    );
  });
});

describe('repli web (navigateur / jsdom)', () => {
  it('détecte une plateforme non Android', () => {
    expect(platform.isNativeAndroid()).toBe(false);
  });

  it('couleurs dynamiques : null, et un désabonnement sans effet', async () => {
    await expect(platform.getSystemPalettes()).resolves.toBeNull();
    const off = platform.onSystemPalettesChanged(vi.fn());
    expect(() => off()).not.toThrow();
  });

  it('haptique et barres système : sans effet, sans erreur', async () => {
    await expect(platform.haptic('tap')).resolves.toBeUndefined();
    await expect(platform.haptic('select')).resolves.toBeUndefined();
    await expect(platform.applySystemBarsStyle(true)).resolves.toBeUndefined();
    platform.setHapticsEnabled(false);
    expect(platform.isHapticsEnabled()).toBe(false);
    platform.setHapticsEnabled(true);
  });

  it('langues et version : valeurs du navigateur et de package.json', async () => {
    const languages = await platform.getSystemLanguages();
    expect(Array.isArray(languages)).toBe(true);
    expect(languages.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
    await expect(platform.getAppVersion()).resolves.toBe(packageVersion);
  });

  it('retour système et cycle de vie : fonctionnent sans natif', async () => {
    await expect(platform.initBackHandling()).resolves.toBeUndefined();
    const off = platform.pushBackHandler(() => {});
    expect(() => off()).not.toThrow();

    const cb = vi.fn();
    const stop = platform.onAppActiveChange(cb);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(typeof cb.mock.calls[0]![0]).toBe('boolean');
    stop();
  });
});
