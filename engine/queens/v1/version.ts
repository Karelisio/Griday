/**
 * Queens — générateur V1.
 *
 * FIGÉ APRÈS PUBLICATION. Tout le dossier v1/ (hors *.test.ts) et core/prng.ts déterminent chaque
 * puzzle publié : ne jamais les modifier (freeze.test.ts vérifie leur empreinte). Le dossier ne
 * dépend d'aucun code partagé à l'exécution (imports de types uniquement, utilitaires recopiés).
 * Évolution = copier les fichiers utiles dans v2/, modifier la copie, l'ajouter au registre et
 * activer la v2 à une date future dans config.ts.
 */
import type { Rng } from '../../core/prng';
import type { DifficultyRating, DifficultyTier, GenerationTarget, GeneratorVersion, RatedPuzzle } from '../../core/types';
import type { QueensPuzzle, QueensSolvedPuzzle } from '../types';
import { QUEENS_FALLBACKS_V1, type QueensFallbackEntry } from './fallbacks';
import { generateQueensCandidate, QUEENS_SHAPE_PRESETS, type QueensShapeParams } from './generator';
import { QUEENS_TECHNIQUES_V1, rateQueens } from './solver';
import { decodeDigits } from './util';

/** Préréglage de forme visant chaque palier (choisi sur mesures : scripts/queens-gen-stats.ts). */
const SHAPE_BY_TIER: Readonly<Record<DifficultyTier, QueensShapeParams>> = {
  1: QUEENS_SHAPE_PRESETS['easy']!,
  2: QUEENS_SHAPE_PRESETS['medium']!,
  3: QUEENS_SHAPE_PRESETS['hard']!,
  4: QUEENS_SHAPE_PRESETS['expert']!,
};

const NO_MAX = Number.MAX_SAFE_INTEGER;

/**
 * Bandes de score [min, max] par « taille/palier » : lissent la courbe lundi → dimanche
 * (médianes ≈ 8, 11, 19, 26, 40, 61, 82) et écartent les dimanches triviaux ou interminables.
 * Cibles absentes (mode illimité) : pas de bande.
 */
const SCORE_BANDS: Readonly<Record<string, readonly [number, number]>> = {
  '6/1': [0, 10],
  '7/1': [9, NO_MAX],
  '7/2': [0, 26],
  '8/2': [22, NO_MAX],
  '8/3': [0, 48],
  '9/3': [50, NO_MAX],
  '10/4': [60, 200],
};

/** Note V1 (null si non résoluble par logique pure). */
export function rateQueensV1(p: QueensPuzzle): DifficultyRating | null {
  const r = rateQueens(p, QUEENS_TECHNIQUES_V1);
  return r.solvable ? { tier: r.tier, score: r.score, hardest: r.hardest } : null;
}

/** Vrai si la note convient à la cible (palier exact + bande de score éventuelle). */
export function acceptsV1(target: GenerationTarget, rating: DifficultyRating): boolean {
  if (rating.tier !== target.tier) return false;
  const band = SCORE_BANDS[`${target.size}/${target.tier}`];
  return !band || (rating.score >= band[0] && rating.score <= band[1]);
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

export const QUEENS_V1: GeneratorVersion<QueensSolvedPuzzle> = Object.freeze({
  version: 1,
  // Lundi facile → dimanche expert.
  weeklyPlan: Object.freeze([
    Object.freeze({ size: 6, tier: 1 }),
    Object.freeze({ size: 7, tier: 1 }),
    Object.freeze({ size: 7, tier: 2 }),
    Object.freeze({ size: 8, tier: 2 }),
    Object.freeze({ size: 8, tier: 3 }),
    Object.freeze({ size: 9, tier: 3 }),
    Object.freeze({ size: 10, tier: 4 }),
  ] as const),
  sizes: Object.freeze([6, 7, 8, 9, 10]),
  maxAttempts: 200,
  rate: rateQueensV1,
  accepts: acceptsV1,

  attempt(rng: Rng, target: GenerationTarget): RatedPuzzle<QueensSolvedPuzzle> | null {
    const puzzle = generateQueensCandidate(rng, target.size, SHAPE_BY_TIER[target.tier]);
    if (!puzzle) return null;
    const rating = rateQueensV1(puzzle);
    if (!rating || !acceptsV1(target, rating)) return null;
    return { puzzle, rating };
  },

  fallback(target: GenerationTarget, pick: number): RatedPuzzle<QueensSolvedPuzzle> {
    const list = fallbackEntries(target);
    if (list.length === 0) throw new Error(`Queens V1 : aucun secours ${target.size}/${target.tier}`);
    const e = list[pick % list.length]!;
    return {
      puzzle: { size: e.size, regions: decodeDigits(e.regions), solution: decodeDigits(e.solution) },
      rating: { tier: e.tier, score: e.score, hardest: e.hardest },
    };
  },
});
