import type { PuzzleTypeDefinition } from '../core/types';
import { encodeQueens, validateQueensStructure } from './encoding';
import { solveQueensExact } from './exact';
import { isQueensSolution } from './rules';
import type { QueensSolvedPuzzle } from './types';
import { QUEENS_V1 } from './v1/version';

export const QUEENS_DEFINITION: PuzzleTypeDefinition<QueensSolvedPuzzle> = Object.freeze({
  id: 'queens',
  versions: Object.freeze({ 1: QUEENS_V1 }),
  // Régions encodées + colonnes de la solution — FORMAT FIGÉ.
  encode: (p: QueensSolvedPuzzle) => `${encodeQueens(p)}/${p.solution.join(',')}`,
  verify: verifyQueens,
});

/** Vérification indépendante : structure, règles, solution unique (recherche exhaustive) = solution fournie. */
export function verifyQueens(p: QueensSolvedPuzzle): string[] {
  const errors = validateQueensStructure(p);
  if (errors.length > 0) return errors;
  if (!isQueensSolution(p, p.solution)) return ['solution fournie invalide'];
  const exact = solveQueensExact(p, 2);
  if (!exact.complete) return ['unicité non établie (budget de recherche épuisé)'];
  if (exact.count !== 1) return [`${exact.count} solutions`];
  if (exact.solutions[0]!.some((c, r) => c !== p.solution[r])) return ['solution unique différente de la solution fournie'];
  return [];
}

export * from './types';
export { encodeQueens, decodeQueens, validateQueensStructure } from './encoding';
export { assertQueensMarks, checkQueensBoard, isQueensSolution, type QueensBoardCheck } from './rules';
export { getQueensHint, type QueensHint } from './hint';
export { solveQueensLogically, rateQueens, nextQueensStep, QUEENS_TECHNIQUES_V1 } from './v1/solver';
export type { QueensStep, QueensTechnique, QueensUnitRef, QueensRating } from './v1/solver';
