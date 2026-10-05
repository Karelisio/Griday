import { describe, expect, it } from 'vitest';
import { cssVars, outlierLimit, share, timeScale } from './chart';

const S = 1000;

describe('axe de temps', () => {
  it('sommet rond et graduations régulières depuis 0', () => {
    expect(timeScale(185 * S)).toEqual({ ticks: [0, 120 * S, 240 * S], topMs: 240 * S });
    expect(timeScale(600 * S)).toEqual({ ticks: [0, 300 * S, 600 * S], topMs: 600 * S });
    expect(timeScale(20 * S)).toEqual({ ticks: [0, 10 * S, 20 * S], topMs: 20 * S });
    expect(timeScale(5400 * S).ticks).toEqual([0, 1800 * S, 3600 * S, 5400 * S]);
  });

  it('temps minuscule ou nul : un seul intervalle de 5 s', () => {
    expect(timeScale(3 * S)).toEqual({ ticks: [0, 5 * S], topMs: 5 * S });
    expect(timeScale(0)).toEqual({ ticks: [0, 5 * S], topMs: 5 * S });
    expect(timeScale(8 * S).ticks).toEqual([0, 5 * S, 10 * S]);
  });

  it('temps démesuré : pas d’un jour, le sommet couvre toujours le maximum', () => {
    const { ticks, topMs } = timeScale(10 * 86_400 * S);
    expect(topMs).toBeGreaterThanOrEqual(10 * 86_400 * S);
    expect(ticks.at(-1)).toBe(topMs);
  });

  it('du minuscule au démesuré : sommet ≥ maximum, 2 à 4 intervalles égaux dès 6 s', () => {
    for (let s = 6; s <= 4 * 86_400; s = Math.ceil(s * 1.07)) {
      const { ticks, topMs } = timeScale(s * S);
      const intervals = ticks.length - 1;
      expect(topMs, `${s} s`).toBeGreaterThanOrEqual(s * S);
      expect(ticks[0]).toBe(0);
      expect(intervals, `${s} s`).toBeGreaterThanOrEqual(2);
      expect(intervals, `${s} s`).toBeLessThanOrEqual(4);
      expect(new Set(ticks.slice(1).map((t, i) => t - ticks[i]!)).size, `${s} s`).toBe(1);
    }
  });
});

describe('valeur aberrante', () => {
  it('moins de 4 valeurs : jamais de seuil', () => {
    expect(outlierLimit([60 * S, 5000 * S, 70 * S])).toBe(Infinity);
    expect(outlierLimit([])).toBe(Infinity);
  });

  it('seuil = 2 × la plus grande valeur restante après les 10 % les plus hauts (au moins un)', () => {
    expect(outlierLimit([1, 1, 1, 90])).toBe(2);
    // 30 valeurs : les 3 plus hautes sont écartées, la 4e fixe le seuil.
    const times = Array.from({ length: 30 }, (_, i) => (i + 1) * 10 * S);
    expect(outlierLimit(times)).toBe(2 * 270 * S);
  });

  it('une valeur ordinaire reste sous le seuil, une partie laissée ouverte le dépasse', () => {
    const normal = [40, 70, 150, 220, 500, 620, 45, 80, 160, 240, 520, 640].map((s) => s * S);
    expect(Math.max(...normal)).toBeLessThanOrEqual(outlierLimit(normal));
    expect(5400 * S).toBeGreaterThan(outlierLimit([...normal, 5400 * S]));
  });
});

describe('proportions', () => {
  it('part bornée à [0, 1], 0 si le total est nul', () => {
    expect(share(30, 120)).toBe(0.25);
    expect(share(300, 120)).toBe(1);
    expect(share(-5, 120)).toBe(0);
    expect(share(5, 0)).toBe(0);
  });

  it('variables CSS en ligne : l’objet est transmis tel quel', () => {
    const vars = { '--v': 0.5, '--i': 2 } as const;
    expect(cssVars(vars)).toBe(vars);
  });
});
