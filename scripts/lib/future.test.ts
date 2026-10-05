import { describe, expect, it } from 'vitest';
import { compareGolden, mergeGolden, monthKey, monthWindow, quantile, windowDays } from './future';

describe('monthWindow', () => {
  it('aligne sur des mois entiers et compte les jours (bissextiles inclus)', () => {
    expect(monthWindow('2026-10-17', 10)).toEqual({ from: '2026-10-01', to: '2036-10-01', days: 3653 });
    expect(monthWindow('2027-03-31', 1)).toEqual({ from: '2027-03-01', to: '2028-03-01', days: 366 });
    expect(monthWindow('2027-03-01', 1).days).toBe(366);
    expect(monthWindow('2026-01-01', 1).days).toBe(365);
  });

  it('rejette un nombre d’années invalide ou une date invalide', () => {
    expect(() => monthWindow('2026-10-05', 0)).toThrow(RangeError);
    expect(() => monthWindow('2026-10-05', 1.5)).toThrow(RangeError);
    expect(() => monthWindow('2026-13-01', 1)).toThrow(RangeError);
  });

  it('windowDays parcourt chaque jour une fois, dans l’ordre', () => {
    const days = [...windowDays(monthWindow('2028-02-10', 1))];
    expect(days).toHaveLength(366);
    expect(days[0]).toBe('2028-02-01');
    expect(days[28]).toBe('2028-02-29');
    expect(days.at(-1)).toBe('2029-01-31');
    expect(new Set(days).size).toBe(days.length);
  });
});

describe('empreintes mensuelles', () => {
  it('monthKey', () => {
    expect(monthKey('2026-10-05')).toBe('2026-10');
  });

  it('compareGolden : vérifiés, divergents, absents', () => {
    const golden = { '2026-10': 'a', '2026-11': 'b' };
    expect(compareGolden(golden, { '2026-10': 'a', '2026-11': 'X', '2026-12': 'c' })).toEqual({
      checked: 2,
      mismatches: ['2026-11'],
      missing: ['2026-12'],
    });
  });

  it('mergeGolden : ajout seul, jamais de remplacement, clés triées', () => {
    const res = mergeGolden({ '2026-11': 'b', '2026-10': 'a' }, { '2026-10': 'a', '2026-11': 'X', '2026-09': 'z' });
    expect(res.added).toEqual(['2026-09']);
    expect(res.conflicts).toEqual(['2026-11']);
    expect(res.merged).toEqual({ '2026-09': 'z', '2026-10': 'a', '2026-11': 'b' });
    expect(Object.keys(res.merged)).toEqual(['2026-09', '2026-10', '2026-11']);
  });
});

describe('quantile', () => {
  it('rang inférieur sur tableau trié', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantile(a, 0.5)).toBe(6);
    expect(quantile(a, 0.99)).toBe(10);
    expect(quantile(a, 0)).toBe(1);
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });
});
