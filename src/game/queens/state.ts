/**
 * État d'une partie de Queens : la session générique (`core/state.ts`) avec les règles de Queens.
 * Garde l'API historique (actions de peinture « croix / gomme »).
 */
import { checkQueensBoard } from '../../../engine/queens/rules';
import type { QueensMark, QueensSolvedPuzzle } from '../../../engine/queens/types';
import { elapsedAt, MAX_HISTORY, newGameState, reduceGame, solvedGameState, type GameAction, type GameState } from '../core/state';
import { MARK_CROSS, MARK_EMPTY } from './marks';
import { QUEENS_RULES } from './rules';

export { elapsedAt, MAX_HISTORY };

export type QueensGame = GameState<QueensSolvedPuzzle>;

export type QueensAction =
  | Exclude<GameAction, { type: 'paint' }>
  /** Glisser : croix sur les cases vides traversées, ou gomme sur les croix. */
  | { type: 'paint'; cells: readonly number[]; mode: 'cross' | 'erase'; stroke?: number; now: number };

export function newGame(puzzle: QueensSolvedPuzzle, now: number | null): QueensGame {
  return newGameState(QUEENS_RULES, puzzle, now);
}

/** Partie déjà gagnée reconstituée depuis la solution (sauvegarde effacée, résultat connu). */
export function solvedGame(puzzle: QueensSolvedPuzzle, elapsedMs: number, hintsUsed: number): QueensGame {
  return solvedGameState(QUEENS_RULES, puzzle, elapsedMs, hintsUsed);
}

/** Peinture Queens → peinture générique (de quelle marque vers quelle marque). */
export function paintMarks(mode: 'cross' | 'erase'): { from: QueensMark; to: QueensMark } {
  return mode === 'cross' ? { from: MARK_EMPTY, to: MARK_CROSS } : { from: MARK_CROSS, to: MARK_EMPTY };
}

export function reduceQueens(g: QueensGame, a: QueensAction): QueensGame {
  if (a.type === 'paint') return reduceGame(QUEENS_RULES, g, { type: 'paint', cells: a.cells, ...paintMarks(a.mode), stroke: a.stroke, now: a.now });
  return reduceGame(QUEENS_RULES, g, a);
}

/** Reines en conflit (pour l'affichage). */
export function conflictCells(g: QueensGame): readonly number[] {
  return checkQueensBoard(g.puzzle, g.marks).conflicts;
}
