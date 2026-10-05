/** Statistiques (logique pure) : puzzles du jour, mode illimité, état d'un jour du calendrier. */
import { compareISO, type ISODate } from '../../engine/core/date';
import type { DifficultyTier } from '../../engine/core/types';
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

/** `total` : parties résolues depuis toujours (la liste ne garde que les plus récentes). */
export function unlimitedStats(results: readonly UnlimitedResult[], total = results.length): UnlimitedStats {
  const sizes = [...new Set(results.map((r) => r.size))].sort((a, b) => a - b);
  const bySize: SizeStats[] = sizes.map((size) => {
    const of = results.filter((r) => r.size === size);
    return { size, count: of.length, ...times(of) };
  });
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
