/**
 * Binairo (Takuzu) : grille n×n (n pair), chaque case reçoit l'un de deux symboles A et B.
 * Règles : (1) jamais trois symboles identiques adjacents dans une ligne ou une colonne ;
 * (2) chaque ligne et chaque colonne contient exactement n/2 symboles de chaque sorte ;
 * (3) deux lignes (ou deux colonnes) ne sont jamais identiques.
 * Index de case : r * n + c (ligne par ligne). Codage commun aux données, à la solution et aux marques
 * du joueur : 0 = vide, 1 = symbole A, 2 = symbole B (sérialisable en chaîne de chiffres).
 */

export const BINAIRO_MIN_SIZE = 4;
export const BINAIRO_MAX_SIZE = 14;

export const CELL_EMPTY = 0;
export const CELL_A = 1;
export const CELL_B = 2;

/** Contenu d'une case (donnée, marque du joueur ou état du solveur). */
export type BinairoCell = typeof CELL_EMPTY | typeof CELL_A | typeof CELL_B;
/** Marque du joueur : même codage que les cases. */
export type BinairoMark = BinairoCell;
/** Symbole posé (case non vide). */
export type BinairoSymbol = typeof CELL_A | typeof CELL_B;

export interface BinairoPuzzle {
  readonly size: number;
  /** Cases données, longueur n² (0 = case à remplir). */
  readonly givens: readonly BinairoCell[];
}

export interface BinairoSolvedPuzzle extends BinairoPuzzle {
  /** Solution complète, longueur n² (1 ou 2), égale aux données sur les cases données. */
  readonly solution: readonly BinairoSymbol[];
}
