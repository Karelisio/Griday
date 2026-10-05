import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ native: true, setStyle: vi.fn() }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native },
  SystemBars: { setStyle: h.setStyle },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

import { applySystemBarsStyle } from './systemBars';

beforeEach(() => {
  h.native = true;
  h.setStyle.mockReset().mockResolvedValue(undefined);
});

describe('applySystemBarsStyle', () => {
  it('thème sombre : icônes claires (style DARK) sur les deux barres', async () => {
    await applySystemBarsStyle(true);
    // Sans `bar`, le plugin applique le style à la barre d'état et à la barre de navigation.
    expect(h.setStyle).toHaveBeenCalledExactlyOnceWith({ style: 'DARK' });
  });

  it('thème clair : icônes sombres (style LIGHT)', async () => {
    await applySystemBarsStyle(false);
    expect(h.setStyle).toHaveBeenCalledExactlyOnceWith({ style: 'LIGHT' });
  });

  it('web : sans effet', async () => {
    h.native = false;
    await applySystemBarsStyle(true);
    expect(h.setStyle).not.toHaveBeenCalled();
  });

  it('ne lève jamais (rejet ou exception du plugin)', async () => {
    h.setStyle.mockRejectedValueOnce(new Error('indisponible'));
    await expect(applySystemBarsStyle(true)).resolves.toBeUndefined();
    h.setStyle.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(applySystemBarsStyle(false)).resolves.toBeUndefined();
  });
});
