import type { DailyPuzzle, GeneratedPuzzle, PuzzleTypeDefinition, PuzzleTypeId } from './core/types';
import { QUEENS_DEFINITION } from './queens';
import type { QueensSolvedPuzzle } from './queens/types';

/** Données de puzzle par type (union discriminée côté UI). */
export interface PuzzleDataMap {
  queens: QueensSolvedPuzzle;
}

export const REGISTRY: { readonly [K in PuzzleTypeId]: PuzzleTypeDefinition<PuzzleDataMap[K]> } = Object.freeze({
  queens: QUEENS_DEFINITION,
});

export type AnyGeneratedPuzzle = {
  [K in PuzzleTypeId]: GeneratedPuzzle<PuzzleDataMap[K]> & { readonly type: K };
}[PuzzleTypeId];

export type AnyDailyPuzzle = {
  [K in PuzzleTypeId]: DailyPuzzle<PuzzleDataMap[K]> & { readonly type: K };
}[PuzzleTypeId];
