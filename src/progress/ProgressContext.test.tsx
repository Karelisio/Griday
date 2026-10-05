import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadJSON } from '../platform/storage';
import { ProgressProvider, useProgress } from './ProgressContext';
import { STREAK_KEY, UNLIMITED_HISTORY_KEY, type ProgressData } from './store';
import { EMPTY_STREAK, FREEZE_EVERY } from './streak';
import type { DailyResult } from './types';

// Horloge figée au 10 octobre 2026 (seule la date est simulée : promesses et minuteries restent réelles).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 12));
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

const result = (date: string, extra: Partial<DailyResult> = {}): DailyResult => ({
  date,
  size: 6,
  tier: 1,
  timeMs: 60_000,
  hintsUsed: 0,
  mode: 'daily',
  solvedOn: date,
  ...extra,
});

function setup(initial: ProgressData) {
  const wrapper = ({ children }: { children: ReactNode }) => <ProgressProvider initial={initial}>{children}</ProgressProvider>;
  return renderHook(() => useProgress(), { wrapper });
}

describe('progression (contexte)', () => {
  it('au chargement, le jour manqué de la veille consomme un gel ; la série tient', () => {
    const history = new Map([['2026-10-07', result('2026-10-07')], ['2026-10-08', result('2026-10-08')]]);
    const { result: r } = setup({ history, unlimited: [], streak: { ...EMPTY_STREAK, freezes: 1 } });
    expect(r.current.streak.frozen).toEqual(['2026-10-09']);
    expect(r.current.summary).toMatchObject({ current: 2, freezes: 0, atRisk: true });
  });

  it('résolu plus d’un jour après sa date : enregistré comme archive, sans effet sur la série', () => {
    const { result: r } = setup({ history: new Map(), unlimited: [], streak: EMPTY_STREAK });
    act(() => void r.current.recordDaily(result('2026-10-07', { solvedOn: '2026-10-10' })));
    expect(r.current.history.get('2026-10-07')?.mode).toBe('archive');
    expect(r.current.summary.current).toBe(0);
  });

  it('un même puzzle n’est enregistré qu’une fois', () => {
    const { result: r } = setup({ history: new Map(), unlimited: [], streak: EMPTY_STREAK });
    act(() => void r.current.recordDaily(result('2026-10-10', { timeMs: 1000 })));
    act(() => void r.current.recordDaily(result('2026-10-10', { timeMs: 5 })));
    expect(r.current.history.get('2026-10-10')?.timeMs).toBe(1000);
    expect(r.current.dailyStats.solved).toBe(1);
  });

  it(`palier de ${FREEZE_EVERY} jours : gel gagné et enregistré`, async () => {
    const history = new Map<string, DailyResult>();
    for (let d = 4; d <= 9; d++) history.set(`2026-10-0${d}`, result(`2026-10-0${d}`));
    const { result: r } = setup({ history, unlimited: [], streak: { ...EMPTY_STREAK, settledThrough: '2026-10-09' } });
    let earned = false;
    act(() => void (earned = r.current.recordDaily(result('2026-10-10')).earnedFreeze));
    expect(earned).toBe(true);
    expect(r.current.summary).toMatchObject({ current: 7, freezes: 1, todaySolved: true });
    await vi.waitFor(async () => expect((await loadJSON<{ freezes: number }>(STREAK_KEY))?.freezes).toBe(1));
  });

  it('puzzle de la veille en cours après minuit : la série reste affichée en attente', () => {
    const history = new Map([['2026-10-08', result('2026-10-08')]]);
    const { result: r } = setup({ history, unlimited: [], streak: EMPTY_STREAK });
    expect(r.current.summary.current).toBe(0);
    act(() => r.current.setPendingDay('2026-10-09'));
    expect(r.current.summary).toMatchObject({ current: 1, atRisk: true });
    act(() => r.current.setPendingDay(null));
    expect(r.current.summary.current).toBe(0);
  });

  it('mode illimité : total conservé au-delà de la liste récente, et enregistré', async () => {
    const { result: r } = setup({ history: new Map(), unlimited: [], unlimitedTotal: 1500, streak: EMPTY_STREAK });
    act(() => r.current.recordUnlimited({ size: 8, tier: 2, timeMs: 90_000, hintsUsed: 0, solvedOn: '2026-10-10' }));
    expect(r.current.unlimitedStats).toMatchObject({ solved: 1501, averageMs: 90_000 });
    await vi.waitFor(async () => expect((await loadJSON<{ total: number }>(UNLIMITED_HISTORY_KEY))?.total).toBe(1501));
  });
});
