import type { ISODate } from './date';
import type { Rng } from './prng';

/** Identifiants des types de puzzle. Ajouter ici tout nouveau type (binairo, nonogram…). */
export const PUZZLE_TYPE_IDS = ['queens'] as const;
export type PuzzleTypeId = (typeof PUZZLE_TYPE_IDS)[number];

/** 1 = facile, 2 = moyen, 3 = difficile, 4 = expert. */
export type DifficultyTier = 1 | 2 | 3 | 4;
export const DIFFICULTY_TIERS: readonly DifficultyTier[] = [1, 2, 3, 4];

export interface DifficultyRating {
  readonly tier: DifficultyTier;
  /** Score entier plus fin (échelle propre au type), croissant avec l'effort. */
  readonly score: number;
  /** Identifiant de la technique la plus difficile nécessaire. */
  readonly hardest: string;
}

export interface GenerationTarget {
  readonly size: number;
  readonly tier: DifficultyTier;
}

/** Cible par jour de semaine : index 0 = lundi … 6 = dimanche. */
export type WeeklyPlan = readonly [
  GenerationTarget,
  GenerationTarget,
  GenerationTarget,
  GenerationTarget,
  GenerationTarget,
  GenerationTarget,
  GenerationTarget,
];

export interface RatedPuzzle<P> {
  readonly puzzle: P;
  readonly rating: DifficultyRating;
}

/**
 * Une version de générateur. Une fois publiée, son comportement est FIGÉ :
 * toute évolution = nouvelle version activée à une date future (voir config.ts).
 */
export interface GeneratorVersion<P> {
  readonly version: number;
  /** Courbe hebdomadaire du puzzle du jour. */
  readonly weeklyPlan: WeeklyPlan;
  /** Tailles proposées en mode illimité. */
  readonly sizes: readonly number[];
  /** Budget déterministe : nombre maximal de graines essayées (graine, graine+1, …). */
  readonly maxAttempts: number;
  /** Une tentative déterministe. `null` = rejet (non unique, non logique, mauvaise difficulté). */
  attempt(rng: Rng, target: GenerationTarget): RatedPuzzle<P> | null;
  /** Puzzle de secours pré-calculé, choisi de façon déterministe par `pick` (uint32). */
  fallback(target: GenerationTarget, pick: number): RatedPuzzle<P>;
}

export interface PuzzleTypeDefinition<P> {
  readonly id: PuzzleTypeId;
  readonly versions: Readonly<Record<number, GeneratorVersion<P>>>;
}

export interface GeneratedPuzzle<P> {
  readonly type: PuzzleTypeId;
  readonly version: number;
  /** Graine de base (sans le suffixe de tentative). */
  readonly seed: string;
  /** Tentative retenue (0 = graine de base), -1 si secours. */
  readonly attempt: number;
  readonly source: 'generated' | 'fallback';
  readonly target: GenerationTarget;
  readonly rating: DifficultyRating;
  readonly puzzle: P;
}

export interface DailyPuzzle<P> extends GeneratedPuzzle<P> {
  readonly date: ISODate;
  /** Numéro du puzzle (1 = EPOCH). */
  readonly dayNumber: number;
  /** 1 = lundi … 7 = dimanche. */
  readonly weekday: number;
}

export interface GenerateOptions {
  /**
   * Filet de sécurité temps réel (ms). NON déterministe : ne doit jamais se déclencher
   * en pratique (validate-future garantit < 500 ms). Absent = pas de limite.
   */
  readonly deadlineMs?: number;
  /** Horloge injectable (tests). Par défaut Date.now. */
  readonly now?: () => number;
}
