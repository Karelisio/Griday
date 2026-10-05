import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  native: true,
  plugin: { getPalettes: vi.fn(), addListener: vi.fn() },
}));

vi.mock('@capacitor/core', () => ({ registerPlugin: () => h.plugin }));
vi.mock('./device', () => ({ isNativeAndroid: () => h.native }));

import { getSystemPalettes, onSystemPalettesChanged, parseSystemPalettes } from './dynamicColor';

const NAMES = ['accent1', 'accent2', 'accent3', 'neutral1', 'neutral2'] as const;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Réponse valide du plugin : couleurs ARGB non signées distinctes par palette et par ton. */
function rawPalettes(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const raw: Record<string, unknown> = { supported: true };
  NAMES.forEach((name, p) => {
    raw[name] = Array.from({ length: 13 }, (_, i) => (0xff000000 + p * 0x10000 + i * 0x101) >>> 0);
  });
  return { ...raw, ...overrides };
}

beforeEach(() => {
  h.native = true;
  h.plugin.getPalettes.mockReset().mockResolvedValue(rawPalettes());
  h.plugin.addListener.mockReset().mockResolvedValue({ remove: vi.fn() });
});

describe('parseSystemPalettes', () => {
  it('accepte 5 palettes de 13 entiers et les renvoie figées', () => {
    const parsed = parseSystemPalettes(rawPalettes());
    expect(parsed).not.toBeNull();
    for (const name of NAMES) {
      expect(parsed![name]).toHaveLength(13);
      expect(Object.isFrozen(parsed![name])).toBe(true);
    }
    expect(parsed!.accent1[0]).toBe(0xff000000);
    expect(parsed!.neutral2[12]).toBe((0xff000000 + 4 * 0x10000 + 12 * 0x101) >>> 0);
  });

  it('normalise les entiers signés en non signés (>>> 0)', () => {
    const signed = [0xff112233 | 0, 0xff000000 | 0, -1, 0, 0x7fffffff, 0xffffffff];
    expect(signed[0]).toBeLessThan(0);
    const colors = [...signed, ...Array.from({ length: 7 }, () => 5)];
    const parsed = parseSystemPalettes(rawPalettes({ accent2: colors }));
    expect(parsed!.accent2.slice(0, 6)).toEqual([0xff112233, 0xff000000, 0xffffffff, 0, 0x7fffffff, 0xffffffff]);
    expect(parsed!.accent2.every((c) => Number.isInteger(c) && c >= 0 && c <= 0xffffffff)).toBe(true);
  });

  it('ne modifie pas la réponse brute', () => {
    const raw = rawPalettes({ accent1: Array.from({ length: 13 }, () => -1) });
    parseSystemPalettes(raw);
    expect((raw['accent1'] as number[])[0]).toBe(-1);
  });

  it.each([
    ['non pris en charge', { supported: false }],
    ['supported absent', { accent1: [] }],
    ['supported non booléen', rawPalettes({ supported: 'true' })],
    ['palette manquante', (() => { const r = rawPalettes(); delete r['neutral2']; return r; })()],
    ['palette non tableau', rawPalettes({ accent3: 'x' })],
    ['palette trop courte', rawPalettes({ accent1: Array.from({ length: 12 }, () => 1) })],
    ['palette trop longue', rawPalettes({ accent1: Array.from({ length: 14 }, () => 1) })],
    ['entrée chaîne', rawPalettes({ accent1: Array.from({ length: 13 }, (_, i) => (i === 3 ? '12' : 1)) })],
    ['entrée null', rawPalettes({ neutral1: Array.from({ length: 13 }, (_, i) => (i === 0 ? null : 1)) })],
    ['entrée NaN', rawPalettes({ neutral1: Array.from({ length: 13 }, (_, i) => (i === 12 ? NaN : 1)) })],
    ['entrée infinie', rawPalettes({ neutral1: Array.from({ length: 13 }, (_, i) => (i === 5 ? Infinity : 1)) })],
    ['entrée décimale', rawPalettes({ neutral2: Array.from({ length: 13 }, (_, i) => (i === 5 ? 1.5 : 1)) })],
    ['entrée > 2^32 - 1', rawPalettes({ neutral2: Array.from({ length: 13 }, (_, i) => (i === 5 ? 2 ** 32 : 1)) })],
    ['entrée < -2^31', rawPalettes({ neutral2: Array.from({ length: 13 }, (_, i) => (i === 5 ? -(2 ** 31) - 1 : 1)) })],
    ['null', null],
    ['undefined', undefined],
    ['chaîne', 'oui'],
    ['nombre', 42],
    ['tableau', []],
  ])('rejette : %s', (_label, raw) => {
    expect(parseSystemPalettes(raw)).toBeNull();
  });
});

describe('getSystemPalettes', () => {
  it('web : null, sans appeler le plugin', async () => {
    h.native = false;
    await expect(getSystemPalettes()).resolves.toBeNull();
    expect(h.plugin.getPalettes).not.toHaveBeenCalled();
  });

  it('Android 12+ : palettes validées', async () => {
    const palettes = await getSystemPalettes();
    expect(palettes).not.toBeNull();
    expect(palettes!.accent1).toHaveLength(13);
    expect(h.plugin.getPalettes).toHaveBeenCalledTimes(1);
  });

  it('Android < 12 : null', async () => {
    h.plugin.getPalettes.mockResolvedValue({ supported: false });
    await expect(getSystemPalettes()).resolves.toBeNull();
  });

  it('réponse invalide : null', async () => {
    h.plugin.getPalettes.mockResolvedValue(rawPalettes({ accent1: [1, 2, 3] }));
    await expect(getSystemPalettes()).resolves.toBeNull();
  });

  it('erreur du plugin (rejet ou exception) : null, sans lever', async () => {
    h.plugin.getPalettes.mockRejectedValueOnce(new Error('indisponible'));
    await expect(getSystemPalettes()).resolves.toBeNull();
    h.plugin.getPalettes.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(getSystemPalettes()).resolves.toBeNull();
  });
});

describe('onSystemPalettesChanged', () => {
  it('web : renvoie un désabonnement sans effet', () => {
    h.native = false;
    const off = onSystemPalettesChanged(vi.fn());
    expect(() => off()).not.toThrow();
    expect(h.plugin.addListener).not.toHaveBeenCalled();
  });

  it("relit les palettes à l'événement paletteChanged puis appelle le rappel", async () => {
    const cb = vi.fn();
    onSystemPalettesChanged(cb);
    expect(h.plugin.addListener).toHaveBeenCalledWith('paletteChanged', expect.any(Function));
    const fire = h.plugin.addListener.mock.calls[0]![1] as () => void;

    h.plugin.getPalettes.mockResolvedValue(rawPalettes({ accent1: Array.from({ length: 13 }, () => 0xff00ff00) }));
    fire();
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].accent1[0]).toBe(0xff00ff00);
  });

  it('transmet null si la relecture échoue', async () => {
    const cb = vi.fn();
    onSystemPalettesChanged(cb);
    const fire = h.plugin.addListener.mock.calls[0]![1] as () => void;
    h.plugin.getPalettes.mockRejectedValue(new Error('indisponible'));
    fire();
    await flush();
    expect(cb).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("le désabonnement retire l'écouteur natif et coupe les rappels", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    h.plugin.addListener.mockResolvedValue({ remove });
    const cb = vi.fn();
    const off = onSystemPalettesChanged(cb);
    await flush();
    const fire = h.plugin.addListener.mock.calls[0]![1] as () => void;

    fire(); // relecture en cours au moment du désabonnement
    off();
    off();
    await flush();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(cb).not.toHaveBeenCalled();
  });

  it("désabonnement avant la fin de l'enregistrement : l'écouteur est retiré dès qu'il existe", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    let resolve!: (handle: { remove: () => Promise<void> }) => void;
    h.plugin.addListener.mockReturnValue(new Promise((r) => (resolve = r)));
    const off = onSystemPalettesChanged(vi.fn());
    off();
    expect(remove).not.toHaveBeenCalled();
    resolve({ remove });
    await flush();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("un enregistrement qui échoue ne lève pas d'erreur", async () => {
    h.plugin.addListener.mockRejectedValue(new Error('indisponible'));
    const off = onSystemPalettesChanged(vi.fn());
    await flush();
    expect(() => off()).not.toThrow();
  });
});
