/**
 * Queens : grille n×n découpée en n régions colorées.
 * Une reine par ligne, par colonne et par région ; deux reines ne se touchent jamais (diagonales comprises).
 * Index de case : r * n + c (ligne par ligne).
 */

export const QUEENS_MIN_SIZE = 4;
export const QUEENS_MAX_SIZE = 12;

export interface QueensPuzzle {
  readonly size: number;
  /** Région (0..n-1) de chaque case, longueur n². Étiquettes canoniques (ordre d'apparition). */
  readonly regions: readonly number[];
}

export interface QueensSolvedPuzzle extends QueensPuzzle {
  /** solution[r] = colonne de la reine de la ligne r. */
  readonly solution: readonly number[];
}

/** Marques posées par le joueur sur une case. */
export const MARK_EMPTY = 0;
export const MARK_CROSS = 1;
export const MARK_QUEEN = 2;
export type QueensMark = typeof MARK_EMPTY | typeof MARK_CROSS | typeof MARK_QUEEN;
