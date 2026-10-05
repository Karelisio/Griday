import { describe, expect, it } from 'vitest';
import { addDays } from '../../engine/core/date';
import { RECENT_COUNT, dailyStats, dayStatus, unlimitedStats } from './stats';
import type { DailyResult, UnlimitedResult } from './types';

const r = (date: string, timeMs: number, extra: Partial<DailyResult> = {}): DailyResult => ({
  date,
  size: 6,
  tier: 1,
  timeMs,
  hintsUsed: 0,
  mode: 'daily',
  solvedOn: date,
  ...extra,
});

describe('statistiques', () => {
  it('puzzles du jour : totaux, temps moyen et record, par difficulté, derniers résultats triés', () => {
    const s = dailyStats([
      r('2026-10-07', 90_000, { tier: 2, hintsUsed: 1 }),
      r('2026-10-05', 60_000),
      r('2026-10-06', 30_000, { mode: 'archive', solvedOn: '2026-10-09' }),
    ]);
    expect(s).toMatchObject({ solved: 3, onTime: 2, noHint: 2, averageMs: 60_000, bestMs: 30_000 });
    expect(s.byTier.map((t) => [t.tier, t.count, t.averageMs, t.bestMs])).toEqual([
      [1, 2, 45_000, 30_000],
      [2, 1, 90_000, 90_000],
      [3, 0, null, null],
      [4, 0, null, null],
    ]);
    expect(s.recent.map((x) => x.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('aucun résultat : valeurs nulles, pas de division par zéro', () => {
    expect(dailyStats([])).toMatchObject({ solved: 0, averageMs: null, bestMs: null, recent: [] });
    expect(unlimitedStats([])).toEqual({ solved: 0, noHint: 0, averageMs: null, bySize: [] });
  });

  it(`au plus ${RECENT_COUNT} résultats récents, les derniers`, () => {
    const many = Array.from({ length: RECENT_COUNT + 5 }, (_, i) => r(addDays('2026-10-05', i), 1000 + i));
    const recent = dailyStats(many.reverse()).recent;
    expect(recent).toHaveLength(RECENT_COUNT);
    expect(recent[0]!.date).toBe(addDays('2026-10-05', 5));
    expect(recent.at(-1)!.date).toBe(addDays('2026-10-05', RECENT_COUNT + 4));
  });

  it('mode illimité par taille', () => {
    const u = (size: number, timeMs: number, hintsUsed = 0): UnlimitedResult => ({ size, tier: 2, timeMs, hintsUsed, solvedOn: '2026-10-05' });
    expect(unlimitedStats([u(8, 100), u(6, 50), u(8, 300, 2)])).toEqual({
      solved: 3,
      noHint: 2,
      averageMs: 150,
      bySize: [
        { size: 6, count: 1, averageMs: 50, bestMs: 50 },
        { size: 8, count: 2, averageMs: 200, bestMs: 100 },
      ],
    });
  });

  it('état d’un jour du calendrier', () => {
    const history = new Map([
      ['2026-10-05', r('2026-10-05', 1)],
      ['2026-10-06', r('2026-10-06', 1, { mode: 'archive' })],
    ]);
    const frozen = new Set(['2026-10-07']);
    const started = new Set(['2026-10-08', '2026-10-05']);
    expect(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'].map((d) => dayStatus(d, history, frozen, started))).toEqual([
      'solved',
      'late',
      'frozen',
      'progress',
      'none',
    ]);
  });
});
