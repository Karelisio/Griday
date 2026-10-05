/**
 * Queens — générateur V1.
 *
 * FIGÉ APRÈS PUBLICATION. Ce fichier, generator.ts, le profil QUEENS_TECHNIQUES_V1 de solver.ts,
 * fallbacks.v1.ts et core/prng.ts déterminent chaque puzzle publié : ne jamais en changer le
 * comportement. Toute évolution = v2.ts + nouvelle entrée datée dans config.ts.
 * golden.test.ts et scripts/validate-future.ts échouent si un puzzle publié change.
 */
import type { DifficultyRating, DifficultyTier, GenerationTarget, GeneratorVersion, RatedPuzzle } from '../core/types';
import { decodeQueens } from './encoding';
import { solveQueensExact } from './exact';
import { QUEENS_FALLBACKS_V1, type QueensFallbackEntry } from './fallbacks.v1';
import { generateQueensCandidate, QUEENS_SHAPE_PRESETS, type QueensShapeParams } from './generator';
import { QUEENS_TECHNIQUES_V1, rateQueens } from './solver';
import type { QueensPuzzle, QueensSolvedPuzzle } from './types';

/** Préréglage de forme utilisé pour viser chaque palier (choisi sur mesures : scripts/queens-gen-stats.ts). */
const SHAPE_BY_TIER: Readonly<Record<DifficultyTier, QueensShapeParams>> = {
  1: QUEENS_SHAPE_PRESETS['easy']!,
  2: QUEENS_SHAPE_PRESETS['medium']!,
  3: QUEENS_SHAPE_PRESETS['hard']!,
  4: QUEENS_SHAPE_PRESETS['expert']!,
};

/** Note V1 (null si non résoluble par logique pure). */
export function rateQueensV1(p: QueensPuzzle): DifficultyRating | null {
  const r = rateQueens(p, QUEENS_TECHNIQUES_V1);
  return r.solvable ? { tier: r.tier, score: r.score, hardest: r.hardest } : null;
}

/** Secours pour une cible : même taille et palier, sinon même taille et palier le plus proche. */
function fallbackEntries(target: GenerationTarget): readonly QueensFallbackEntry[] {
  const sameSize = QUEENS_FALLBACKS_V1.filter((e) => e.size === target.size);
  for (let delta = 0; delta < 4; delta++) {
    for (const tier of [target.tier - delta, target.tier + delta]) {
      const list = sameSize.filter((e) => e.tier === tier);
      if (list.length > 0) return list;
    }
  }
  return [];
}

export const QUEENS_V1: GeneratorVersion<QueensSolvedPuzzle> = {
  version: 1,
  // Lundi facile → dimanche expert.
  weeklyPlan: [
    { size: 6, tier: 1 },
    { size: 7, tier: 1 },
    { size: 7, tier: 2 },
    { size: 8, tier: 2 },
    { size: 8, tier: 3 },
    { size: 9, tier: 3 },
    { size: 10, tier: 4 },
  ],
  sizes: [6, 7, 8, 9, 10],
  maxAttempts: 200,

  attempt(rng, target): RatedPuzzle<QueensSolvedPuzzle> | null {
    const puzzle = generateQueensCandidate(rng, target.size, SHAPE_BY_TIER[target.tier]);
    if (!puzzle) return null;
    const rating = rateQueensV1(puzzle);
    if (!rating || rating.tier !== target.tier) return null;
    return { puzzle, rating };
  },

  fallback(target, pick): RatedPuzzle<QueensSolvedPuzzle> {
    const list = fallbackEntries(target);
    if (list.length === 0) throw new Error(`Queens V1 : aucun secours ${target.size}/${target.tier}`);
    const entry = list[pick % list.length]!;
    const regions = decodeQueens(entry.code);
    const exact = solveQueensExact(regions, 2);
    const rating = rateQueensV1(regions);
    if (!exact.complete || exact.count !== 1 || !rating) throw new Error(`Queens V1 : secours invalide ${entry.seed}`);
    return { puzzle: { ...regions, solution: exact.solutions[0]! }, rating };
  },
};
