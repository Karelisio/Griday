import i18next from 'i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../locales/en.json';
import fr from '../../locales/fr.json';
import { STORE_URL, shareResult, shareText } from './share';

const shareMock = vi.hoisted(() => ({ share: vi.fn(), native: false }));
vi.mock('@capacitor/share', () => ({ Share: { share: shareMock.share } }));
vi.mock('@capacitor/core', async (orig) => {
  const actual = await orig<typeof import('@capacitor/core')>();
  return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => shareMock.native } };
});

const i18n = i18next.createInstance();
beforeAll(async () => {
  await i18n.init({ resources: { fr: { translation: fr }, en: { translation: en } }, lng: 'fr', interpolation: { escapeValue: false } });
});
beforeEach(() => {
  shareMock.share.mockReset();
  shareMock.native = false;
});

describe('texte partagé', () => {
  it('puzzle du jour en français : numéro, taille, difficulté, temps, indices, série, lien', () => {
    const text = shareText({ kind: 'daily', type: 'queens', n: 12, size: 7, tier: 2, timeMs: 154_900, hintsUsed: 0, streak: 5 }, i18n.getFixedT('fr'), 'fr');
    expect(text.split('\n')).toEqual([
      'Griday n° 12 · 👑 Reines 7 × 7 · Moyen',
      '⏱️ 2:34 · 💡 sans indice',
      '🔥 5 jours de suite',
      `À vous de jouer : ${STORE_URL}`,
    ]);
  });

  it('anglais, archive (sans série), illimité ; aucune case de la solution', () => {
    const t = i18n.getFixedT('en');
    const archive = shareText({ kind: 'archive', type: 'queens', n: 3, size: 8, tier: 3, timeMs: 61_000, hintsUsed: 2, streak: 9 }, t, 'en');
    expect(archive).toContain('Griday #3 (archive) · 👑 Queens');
    expect(archive).toContain('💡 2 hints');
    expect(archive).not.toContain('🔥');
    const unlimited = shareText({ kind: 'unlimited', type: 'queens', size: 6, tier: 1, timeMs: 5000, hintsUsed: 1 }, t, 'en');
    expect(unlimited.split('\n')[0]).toBe('Griday ∞ · 👑 Queens 6 × 6 · Easy');
    expect(unlimited).toContain('💡 1 hint');
  });
});

describe('partage', () => {
  it('Binairo : emoji et nom du jeu dans les deux langues', () => {
    const daily = { kind: 'daily', type: 'binairo', n: 2, size: 8, tier: 1, timeMs: 95_000, hintsUsed: 0, streak: 2 } as const;
    expect(shareText(daily, i18n.getFixedT('fr'), 'fr').split('\n')[0]).toMatch(/^Griday n°\s2 · 🌓 Binairo 8\s×\s8 · Facile$/);
    expect(shareText({ ...daily, kind: 'unlimited' }, i18n.getFixedT('en'), 'en').split('\n')[0]).toBe('Griday ∞ · 🌓 Binairo 8 × 8 · Easy');
  });

  it('natif : feuille de partage Android ; annulation silencieuse', async () => {
    shareMock.native = true;
    shareMock.share.mockResolvedValueOnce({});
    expect(await shareResult('x', 'titre')).toBe('shared');
    expect(shareMock.share).toHaveBeenCalledWith({ text: 'x', dialogTitle: 'titre' });
    shareMock.share.mockRejectedValueOnce(new Error('Share canceled'));
    expect(await shareResult('x', 'titre')).toBe('cancelled');
  });

  it('navigateur sans partage : copie dans le presse-papiers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await shareResult('texte', 't')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('texte');
    writeText.mockRejectedValueOnce(new Error('refusé'));
    expect(await shareResult('texte', 't')).toBe('failed');
  });
});
