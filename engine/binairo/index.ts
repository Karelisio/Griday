import type { PuzzleTypeDefinition } from '../core/types';
import { encodeBinairo, encodeBinairoCells, validateBinairoStructure } from './encoding';
import { solveBinairoExact } from './exact';
import { isBinairoSolution } from './rules';
import type { BinairoSolvedPuzzle } from './types';
import { BINAIRO_V1 } from './v1/version';

export const BINAIRO_DEFINITION: PuzzleTypeDefinition<BinairoSolvedPuzzle> = Object.freeze({
  id: 'binairo',
  versions: Object.freeze({ 1: BINAIRO_V1 }),
  // Données puis solution, un chiffre par case (0 = vide, 1 = A, 2 = B) — FORMAT FIGÉ.
  encode: (p: BinairoSolvedPuzzle) => `${encodeBinairo(p)}/${encodeBinairoCells(p.solution)}`,
  verify: (p: BinairoSolvedPuzzle) => verifyBinairo(p),
  sizeOf: (p: BinairoSolvedPuzzle) => p.size,
});

/** Vérification indépendante : structure, règles, solution unique (recherche exhaustive) = solution fournie. */
export function verifyBinairo(p: BinairoSolvedPuzzle, maxNodes = 1_000_000): string[] {
  const errors = validateBinairoStructure(p);
  if (errors.length > 0) return errors;
  if (!isBinairoSolution(p, p.solution)) return ['solution fournie invalide'];
  const exact = solveBinairoExact(p, 2, maxNodes);
  if (!exact.complete) return ['unicité non établie (budget de recherche épuisé)'];
  if (exact.count !== 1) return [`${exact.count} solutions`];
  if (exact.solutions[0]!.some((v, i) => v !== p.solution[i])) return ['solution unique différente de la solution fournie'];
  return [];
}

export * from './types';
export { encodeBinairo, encodeBinairoCells, decodeBinairo, validateBinairoStructure } from './encoding';
export { assertBinairoMarks, binairoBoard, checkBinairoBoard, isBinairoSolution, type BinairoBoardCheck } from './rules';
export { getBinairoHint, type BinairoHint } from './hint';
export { solveBinairoLogically, rateBinairo, nextBinairoStep, restrictBinairoProfile, BINAIRO_TECHNIQUES_V1 } from './v1/solver';
export type {
  BinairoLineKind,
  BinairoLineRef,
  BinairoLogicResult,
  BinairoLogicStatus,
  BinairoPlacement,
  BinairoProfile,
  BinairoRating,
  BinairoSolveOptions,
  BinairoStep,
  BinairoTechnique,
  BinairoTechniqueSpec,
} from './v1/solver';
