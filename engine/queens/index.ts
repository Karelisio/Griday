import type { PuzzleTypeDefinition } from '../core/types';
import { encodeQueens } from './encoding';
import type { QueensSolvedPuzzle } from './types';
import { QUEENS_V1 } from './v1';

export const QUEENS_DEFINITION: PuzzleTypeDefinition<QueensSolvedPuzzle> = {
  id: 'queens',
  versions: { 1: QUEENS_V1 },
  // Régions encodées + colonnes de la solution — FORMAT FIGÉ.
  encode: (p) => `${encodeQueens(p)}/${p.solution.join(',')}`,
};

export * from './types';
export { encodeQueens, decodeQueens, validateQueensStructure } from './encoding';
export { checkQueensBoard, isQueensSolution, type QueensBoardCheck } from './rules';
export { getQueensHint, type QueensHint } from './hint';
export { solveQueensLogically, rateQueens, nextQueensStep, QUEENS_TECHNIQUES_V1 } from './solver';
export type { QueensStep, QueensTechnique, QueensUnitRef, QueensRating } from './solver';
