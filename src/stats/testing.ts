/**
 * Jeux de données pour les tests des statistiques : dates relatives à aujourd'hui (le fournisseur de
 * progression lit la vraie date du jour), résultats du jour et illimités, état de série réglé jusqu'à hier.
 */
import { addDays, localISODate, type ISODate } from '../../engine/core/date';
import type { ProgressData } from '../progress/store';
import type { DailyResult, UnlimitedResult } from '../progress/types';

export const today: ISODate = localISODate(new Date());

/** Date d'il y a `offset` jours (0 = aujourd'hui). */
export const day = (offset: number): ISODate => addDays(today, -offset);

/** Puzzle du jour résolu il y a `offset` jours (le jour même, facile 6 × 6 en 1 min, sans indice par défaut). */
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
