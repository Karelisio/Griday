import { afterEach, describe, expect, it, vi } from 'vitest';
import { localISODate } from '../../engine/core/date';
import { daily, day, freezeToday, progress, today, unlimited } from './testing';

afterEach(() => vi.useRealTimers());

describe('jeux de données des tests', () => {
  it('dates relatives à un jour fixe, jamais à la vraie date', () => {
    expect(today).toBe('2026-11-18');
    expect([day(0), day(1), day(30)]).toEqual(['2026-11-18', '2026-11-17', '2026-10-19']);
    expect(daily(2)).toMatchObject({ date: '2026-11-16', solvedOn: '2026-11-16', mode: 'daily' });
    expect(unlimited(7, 60_000).solvedOn).toBe(today);
    expect(progress().streak.settledThrough).toBe('2026-11-17');
  });

  it('horloge figée sur ce jour à midi, même quand le temps réel s’écoule', async () => {
    freezeToday();
    expect(localISODate(new Date())).toBe(today);
    expect(new Date().getHours()).toBe(12);
    const now = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 30)); // minuteries réelles : seule la date est simulée
    expect(Date.now()).toBe(now);
  });
});
