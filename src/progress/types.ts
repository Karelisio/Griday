/** Progression du joueur : résultats des puzzles, série de jours, gels de série. */
import type { ISODate } from '../../engine/core/date';
import type { DifficultyTier, PuzzleTypeId } from '../../engine/core/types';

/** `daily` : joué comme puzzle du jour (compte pour la série) ; `archive` : rejoué depuis le calendrier. */
export type DailyMode = 'daily' | 'archive';

/** Résultat d'un puzzle du jour résolu. */
export interface DailyResult {
  /** Date du puzzle. */
  readonly date: ISODate;
  /** Type du puzzle (absent dans les résultats d'avant Binairo : Queens). */
  readonly type?: PuzzleTypeId;
  readonly size: number;
  readonly tier: DifficultyTier;
  readonly timeMs: number;
  readonly hintsUsed: number;
  readonly mode: DailyMode;
  /** Date locale du jour où il a été résolu. */
  readonly solvedOn: ISODate;
}

/** Partie illimitée résolue. */
export interface UnlimitedResult {
  /** Type du puzzle (absent : Queens). */
  readonly type?: PuzzleTypeId;
  readonly size: number;
  readonly tier: DifficultyTier;
  readonly timeMs: number;
  readonly hintsUsed: number;
  readonly solvedOn: ISODate;
}

/** État persistant de la série (les jours résolus viennent des résultats). */
export interface StreakState {
  /** Gels disponibles (0..MAX_FREEZES). */
  readonly freezes: number;
  /** Jours manqués couverts par un gel (triés). */
  readonly frozen: readonly ISODate[];
  /** Jours dont la résolution a fait gagner un gel (une fois par jour au plus). */
  readonly rewarded: readonly ISODate[];
  /** Dernier jour dont le sort (joué, gelé ou manqué) est réglé. */
  readonly settledThrough: ISODate | null;
}

export interface StreakSummary {
  /** Jours résolus consécutifs (les jours gelés relient sans compter). */
  readonly current: number;
  readonly best: number;
  readonly freezes: number;
  readonly todaySolved: boolean;
  /** Série en cours mais pas encore prolongée aujourd'hui. */
  readonly atRisk: boolean;
}

/** État d'un jour dans le calendrier des archives. */
export type DayStatus = 'solved' | 'late' | 'frozen' | 'progress' | 'none';

export interface TierStats {
  readonly tier: DifficultyTier;
  readonly count: number;
  readonly averageMs: number | null;
  readonly bestMs: number | null;
}

export interface DailyStats {
  /** Puzzles du jour résolus (à temps ou plus tard, depuis les archives). */
  readonly solved: number;
  /** Résolus à temps : commencés le jour même, finis au plus tard le lendemain. */
  readonly onTime: number;
  readonly noHint: number;
  readonly averageMs: number | null;
  readonly bestMs: number | null;
  readonly byTier: readonly TierStats[];
  /** 30 derniers résultats, du plus ancien au plus récent. */
  readonly recent: readonly DailyResult[];
}

export interface SizeStats {
  readonly size: number;
  readonly count: number;
  readonly averageMs: number | null;
  readonly bestMs: number | null;
}

export interface UnlimitedStats {
  readonly solved: number;
  readonly noHint: number;
  readonly averageMs: number | null;
  readonly bySize: readonly SizeStats[];
}
