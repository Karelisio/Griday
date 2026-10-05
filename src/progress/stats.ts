/** Statistiques (logique pure) : puzzles du jour, mode illimité, état d'un jour du calendrier. */
import { compareISO, type ISODate } from '../../engine/core/date';
import { PUZZLE_TYPE_IDS, type DifficultyTier, type PuzzleTypeId } from '../../engine/core/types';
import type { DailyResult, DailyStats, DayStatus, SizeStats, TierStats, UnlimitedResult, UnlimitedStats } from './types';

const TIERS: readonly DifficultyTier[] = [1, 2, 3, 4];
/** Nombre de résultats récents (graphique d'évolution). */
export const RECENT_COUNT = 30;

function times(values: readonly { timeMs: number }[]): { averageMs: number | null; bestMs: number | null } {
  if (values.length === 0) return { averageMs: null, bestMs: null };
  let sum = 0;
  let best = Infinity;
  for (const v of values) {
    sum += v.timeMs;
    best = Math.min(best, v.timeMs);
  }
  return { averageMs: Math.round(sum / values.length), bestMs: best };
}

export function dailyStats(results: Iterable<DailyResult>): DailyStats {
  const all = [...results].sort((a, b) => compareISO(a.date, b.date));
  const byTier: TierStats[] = TIERS.map((tier) => {
    const of = all.filter((r) => r.tier === tier);
    return { tier, count: of.length, ...times(of) };
  });
  return {
    solved: all.length,
    onTime: all.filter((r) => r.mode === 'daily').length,
    noHint: all.filter((r) => r.hintsUsed === 0).length,
    ...times(all),
    byTier,
    recent: all.slice(-RECENT_COUNT),
  };
}

/**
 * `total` : parties résolues depuis toujours (la liste ne garde que les plus récentes).
 * Plusieurs types mêlés : une ligne par type et par taille (des temps de jeux différents ne se comparent pas).
 */
export function unlimitedStats(results: readonly UnlimitedResult[], total = results.length): UnlimitedStats {
  const typeOf = (r: UnlimitedResult): PuzzleTypeId => r.type ?? 'queens';
  const sizesOf = (of: readonly UnlimitedResult[]) => [...new Set(of.map((r) => r.size))].sort((a, b) => a - b);
  const row = (of: readonly UnlimitedResult[], size: number) => {
    const same = of.filter((r) => r.size === size);
    return { size, count: same.length, ...times(same) };
  };
  const types = PUZZLE_TYPE_IDS.filter((type) => results.some((r) => typeOf(r) === type));
  const bySize: SizeStats[] =
    types.length > 1
      ? types.flatMap((type) => {
          const of = results.filter((r) => typeOf(r) === type);
          return sizesOf(of).map((size) => ({ type, ...row(of, size) }));
        })
      : sizesOf(results).map((size) => row(results, size));
  return { solved: Math.max(total, results.length), noHint: results.filter((r) => r.hintsUsed === 0).length, averageMs: times(results).averageMs, bySize };
}

/** État d'un jour passé ou présent dans le calendrier des archives. */
export function dayStatus(
  date: ISODate,
  history: ReadonlyMap<ISODate, DailyResult>,
  frozen: ReadonlySet<ISODate>,
  started: ReadonlySet<ISODate>,
): DayStatus {
  const result = history.get(date);
  if (result) return result.mode === 'daily' ? 'solved' : 'late';
  if (frozen.has(date)) return 'frozen';
  return started.has(date) ? 'progress' : 'none';
}
