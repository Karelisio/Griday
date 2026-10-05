import { describe, expect, it } from 'vitest';
import { addDays, type ISODate } from '../../engine/core/date';
import { EMPTY_STREAK, FREEZE_EVERY, MAX_FREEZES, applyDailySolve, settleStreak, summarizeStreak } from './streak';
import type { StreakState } from './types';

const D0 = '2026-10-05';
const day = (n: number): ISODate => addDays(D0, n);
const days = (...ns: number[]) => new Set(ns.map(day));
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const withFreezes = (freezes: number): StreakState => ({ ...EMPTY_STREAK, freezes });

/** Règle puis résume, comme l'app à l'ouverture le jour `today`. */
function at(state: StreakState, solved: Set<ISODate>, today: number) {
  const settled = settleStreak(state, solved, day(today));
  return { state: settled, summary: summarizeStreak(settled, solved, day(today)) };
}

describe('série de jours', () => {
  it('aucune partie : série nulle', () => {
    const { summary } = at(EMPTY_STREAK, new Set(), 0);
    expect(summary).toMatchObject({ current: 0, best: 0, todaySolved: false, atRisk: false });
  });

  it('jours consécutifs ; aujourd’hui encore jouable (série « en danger », pas rompue)', () => {
    expect(at(EMPTY_STREAK, days(0, 1, 2), 2).summary).toMatchObject({ current: 3, best: 3, todaySolved: true, atRisk: false });
    expect(at(EMPTY_STREAK, days(0, 1, 2), 3).summary).toMatchObject({ current: 3, best: 3, todaySolved: false, atRisk: true });
  });

  it('jour manqué sans gel : série rompue, record conservé', () => {
    const { summary } = at(EMPTY_STREAK, days(0, 1, 2, 4), 4);
    expect(summary).toMatchObject({ current: 1, best: 3 });
    expect(at(EMPTY_STREAK, days(0, 1, 2), 4).summary.current).toBe(0);
  });

  it('un gel couvre un jour manqué : la série continue sans compter ce jour', () => {
    const solved = days(0, 1, 2);
    const { state, summary } = at(withFreezes(1), solved, 4);
    expect(state.frozen).toEqual([day(3)]);
    expect(state.freezes).toBe(0);
    expect(summary).toMatchObject({ current: 3, atRisk: true });
    solved.add(day(4));
    expect(summarizeStreak(state, solved, day(4))).toMatchObject({ current: 4, best: 4 });
  });

  it('deux jours manqués, un seul gel : le gel sert le premier jour puis la série casse', () => {
    const { state, summary } = at(withFreezes(1), days(0, 1, 2), 5);
    expect(state.frozen).toEqual([day(3)]);
    expect(state.freezes).toBe(0);
    expect(summary.current).toBe(0);
    expect(summary.best).toBe(3);
  });

  it('deux gels pour deux jours manqués d’affilée', () => {
    const { state, summary } = at(withFreezes(2), days(0, 1), 4);
    expect(state.frozen).toEqual([day(2), day(3)]);
    expect(summary).toMatchObject({ current: 2, freezes: 0 });
  });

  it('pas de gel avant le tout premier jour joué ni après une série déjà rompue', () => {
    expect(at(withFreezes(2), new Set(), 3).state.frozen).toEqual([]);
    const broken = at(EMPTY_STREAK, days(0), 3).state; // jours 1 et 2 manqués, aucun gel
    // Des gels gagnés plus tard ne réparent jamais le passé.
    const later = at({ ...broken, freezes: 2 }, days(0), 5).state;
    expect(later.frozen).toEqual([]);
    expect(later.freezes).toBe(2);
  });

  it('réglage idempotent, une seule fois par jour', () => {
    const solved = days(0, 1);
    const once = settleStreak(withFreezes(2), solved, day(3));
    expect(settleStreak(once, solved, day(3))).toBe(once);
    expect(once.settledThrough).toBe(day(2));
  });

  it('retour après une très longue absence : réglé sans boucle infinie', () => {
    const { state, summary } = at(withFreezes(2), days(0, 1), 20_000);
    expect(state.frozen).toEqual([]);
    expect(summary.current).toBe(0);
  });

  it(`un gel gagné tous les ${FREEZE_EVERY} jours, une seule fois par jour, réserve limitée à ${MAX_FREEZES}`, () => {
    let state = EMPTY_STREAK;
    const solved = new Set<ISODate>();
    const earnedOn: number[] = [];
    for (const n of range(0, 3 * FREEZE_EVERY - 1)) {
      state = settleStreak(state, solved, day(n));
      solved.add(day(n));
      const r = applyDailySolve(state, solved, day(n), day(n));
      state = r.state;
      if (r.earned) earnedOn.push(n + 1);
    }
    expect(earnedOn).toEqual([FREEZE_EVERY, 2 * FREEZE_EVERY]);
    expect(state.freezes).toBe(MAX_FREEZES);
    // Même jour rejoué : pas de second gel.
    const again = applyDailySolve({ ...state, freezes: 0 }, solved, day(FREEZE_EVERY - 1), day(FREEZE_EVERY - 1));
    expect(again.earned).toBe(false);
  });

  it('minuit passé en cours de partie : le gel posé sur la veille est rendu quand elle est finie', () => {
    const solved = days(0, 1);
    const settled = settleStreak(withFreezes(1), solved, day(3)); // jour 2 gelé à l’ouverture du jour 3
    expect(settled.frozen).toEqual([day(2)]);
    solved.add(day(2)); // la partie du jour 2 se termine à 0 h 10 le jour 3
    const { state } = applyDailySolve(settled, solved, day(2), day(3));
    expect(state.frozen).toEqual([]);
    expect(state.freezes).toBe(1);
    expect(summarizeStreak(state, solved, day(3))).toMatchObject({ current: 3, atRisk: true });
  });

  it('record : les jours gelés relient deux séries sans compter', () => {
    const solved = days(0, 1, 3, 4, 5, 8);
    const state: StreakState = { ...EMPTY_STREAK, frozen: [day(2)], settledThrough: day(9) };
    expect(summarizeStreak(state, solved, day(10)).best).toBe(5);
  });
});
