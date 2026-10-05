/**
 * Jeux de données pour les tests des statistiques : dates relatives à un jour fixe, résultats du jour et illimités,
 * état de série réglé jusqu'à hier. Le fournisseur de progression lit la date du jour : les tests figent l'horloge
 * sur ce jour avec `freezeToday()`, si bien que rien ne dépend de la vraie date (ni de minuit qui passe en route).
 */
import { vi } from 'vitest';
import { addDays, parseISODate, type ISODate } from '../../engine/core/date';
import type { ProgressData } from '../progress/store';
import type { DailyResult, UnlimitedResult } from '../progress/types';

/** Jour fixe des tests (un mercredi) : assez loin du jour n° 1 pour que les dates relatives restent des jours jouables. */
export const today: ISODate = '2026-11-18';

/** Fige `Date` à midi, le jour fixe (minuteries et promesses restent réelles) ; à défaire avec `vi.useRealTimers()`. */
export function freezeToday(): void {
  const { y, m, d } = parseISODate(today);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(y, m - 1, d, 12));
}

/** Date d'il y a `offset` jours (0 = aujourd'hui). */
export const day = (offset: number): ISODate => addDays(today, -offset);

/** Puzzle du jour résolu il y a `offset` jours (à temps, facile 6 × 6 en 1 min, sans indice par défaut). */
export const daily = (offset: number, over: Partial<DailyResult> = {}): DailyResult => ({
  date: day(offset),
  size: 6,
  tier: 1,
  timeMs: 60_000,
  hintsUsed: 0,
  mode: 'daily',
  solvedOn: day(offset),
  ...over,
});

export const unlimited = (size: number, timeMs: number, over: Partial<UnlimitedResult> = {}): UnlimitedResult => ({
  size,
  tier: 2,
  timeMs,
  hintsUsed: 0,
  solvedOn: today,
  ...over,
});

/** Données de progression : la série est déjà réglée jusqu'à hier (aucun gel posé ni consommé au chargement). */
export function progress(results: readonly DailyResult[] = [], unlimitedResults: readonly UnlimitedResult[] = [], freezes = 0): ProgressData {
  return {
    history: new Map(results.map((r) => [r.date, r])),
    unlimited: unlimitedResults,
    streak: { freezes, frozen: [], rewarded: [], settledThrough: day(1) },
  };
}
