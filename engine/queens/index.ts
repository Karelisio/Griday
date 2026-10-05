import type { PuzzleTypeDefinition } from '../core/types';
import { encodeQueens } from './encoding';
import type { QueensSolvedPuzzle } from './types';
import { QUEENS_V1 } from './v1/version';

export const QUEENS_DEFINITION: PuzzleTypeDefinition<QueensSolvedPuzzle> = Object.freeze({
  id: 'queens',
  versions: Object.freeze({ 1: QUEENS_V1 }),
  // Régions encodées + colonnes de la solution — FORMAT FIGÉ.
  encode: (p: QueensSolvedPuzzle) => `${encodeQueens(p)}/${p.solution.join(',')}`,
});

export * from './types';
export { encodeQueens, decodeQueens, validateQueensStructure } from './encoding';
export { assertQueensMarks, checkQueensBoard, isQueensSolution, type QueensBoardCheck } from './rules';
export { getQueensHint, type QueensHint } from './hint';
export { solveQueensLogically, rateQueens, nextQueensStep, QUEENS_TECHNIQUES_V1 } from './v1/solver';
export type { QueensStep, QueensTechnique, QueensUnitRef, QueensRating } from './v1/solver';
