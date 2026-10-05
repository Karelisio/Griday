/** `recordDaily` rend le mode retenu : l'interstitiel du puzzle du jour en dépend (jamais pour une archive rejouée). */
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressProvider, useProgress } from './ProgressContext';
import { EMPTY_STREAK } from './streak';
import type { DailyMode, DailyResult } from './types';

// Horloge figée au 10 octobre 2026 (seule la date est simulée).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 12));
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

const result = (date: string, extra: Partial<DailyResult> = {}): DailyResult => ({ date, size: 6, tier: 1, timeMs: 60_000, hintsUsed: 0, mode: 'daily', solvedOn: date, ...extra });

function setup() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ProgressProvider initial={{ history: new Map(), unlimited: [], streak: EMPTY_STREAK }}>{children}</ProgressProvider>
  );
  return renderHook(() => useProgress(), { wrapper });
}

function record(r: ReturnType<typeof setup>['result'], solved: DailyResult): { earnedFreeze: boolean; mode: DailyMode | null } {
  let out!: { earnedFreeze: boolean; mode: DailyMode | null };
  act(() => {
    out = r.current.recordDaily(solved);
  });
  return out;
}

describe('recordDaily : mode retenu', () => {
  it('résolu à temps : « daily »', () => {
    const { result: r } = setup();
    expect(record(r, result('2026-10-10')).mode).toBe('daily');
    expect(record(setup().result, result('2026-10-09', { solvedOn: '2026-10-10' })).mode).toBe('daily'); // fini après minuit
  });

  it('demandé comme archive, ou fini plus d’un jour après : « archive »', () => {
    expect(record(setup().result, result('2026-10-08', { mode: 'archive' })).mode).toBe('archive');
    expect(record(setup().result, result('2026-10-07', { solvedOn: '2026-10-10' })).mode).toBe('archive');
  });

  it('déjà enregistré : rien de retenu', () => {
    const { result: r } = setup();
    expect(record(r, result('2026-10-10')).mode).toBe('daily');
    expect(record(r, result('2026-10-10', { timeMs: 5 }))).toEqual({ earnedFreeze: false, mode: null });
  });
});
