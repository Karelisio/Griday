import { describe, expect, it } from 'vitest';
import { keyDays, mergeGolden, monthKey, monthStart, monthWindow, nextMonthStart, quantile, rangeKey } from './future';

describe('monthWindow', () => {
  it('couvre [début du mois, start + N ans] en mois entiers (bissextiles et décembre inclus)', () => {
    expect(monthWindow('2026-10-17', 10)).toEqual({ from: '2026-10-01', to: '2036-11-01', days: 3684 });
    expect(monthWindow('2027-03-31', 1)).toEqual({ from: '2027-03-01', to: '2028-04-01', days: 397 });
    expect(monthWindow('2026-01-01', 1).days).toBe(396);
    expect(monthWindow('2026-12-15', 1)).toEqual({ from: '2026-12-01', to: '2028-01-01', days: 396 });
  });

  it('rejette un nombre d’années invalide ou une date invalide', () => {
    expect(() => monthWindow('2026-10-05', 0)).toThrow(RangeError);
    expect(() => monthWindow('2026-10-05', 1.5)).toThrow(RangeError);
    expect(() => monthWindow('2026-13-01', 1)).toThrow(RangeError);
  });
});

describe('clés de référence', () => {
  it('monthStart / nextMonthStart', () => {
    expect(monthStart('2026-10-17')).toBe('2026-10-01');
    expect(nextMonthStart('2026-12-17')).toBe('2027-01-01');
  });

  it('keyDays : mois entier ou plage d’un mois', () => {
    expect(keyDays('2028-02')).toHaveLength(29);
    expect(keyDays('2027-02').at(-1)).toBe('2027-02-28');
    expect(keyDays('2027-04-01..04')).toEqual(['2027-04-01', '2027-04-02', '2027-04-03', '2027-04-04']);
    expect(rangeKey('2027-04-01', '2027-04-04')).toBe('2027-04-01..04');
  });

  it('keyDays rejette les clés invalides', () => {
    for (const key of ['2027-4', '2027-04-05..03', '2027-02-01..30', '2027-13', 'x']) {
      expect(() => keyDays(key), key).toThrow(RangeError);
    }
  });
});

describe('empreintes mensuelles', () => {
  it('monthKey', () => {
    expect(monthKey('2026-10-05')).toBe('2026-10');
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
