/** Règles de jeu de Binairo pour la session générique (chaque toucher fait tourner vide → soleil → lune → vide). */
import { checkBinairoBoard } from '../../../engine/binairo/rules';
import { CELL_A, CELL_B, CELL_EMPTY, type BinairoSolvedPuzzle } from '../../../engine/binairo/types';
import type { GameRules, Mark } from '../core/rules';

export const BINAIRO_RULES: GameRules<BinairoSolvedPuzzle> = {
  // Les données définissent la grille (solution unique) : deux grilles différentes n'ont jamais la même clé.
  key: (p) => `b${p.size}:${p.givens.join('')}`,
  cells: (p) => p.size * p.size,
  initial: (p) => [...p.givens],
  solution: (p) => [...p.solution],
  locked: (p, cell) => p.givens[cell] !== CELL_EMPTY,
  check: (p, marks) => {
    const { violations, solved } = checkBinairoBoard(p, marks);
    return { conflicts: violations, solved };
  },
  // Soleil (1), puis lune (2), puis case vidée : un seul toucher à chaque fois, pas de double toucher.
  tap: (m): Mark => (m === CELL_EMPTY ? CELL_A : m === CELL_A ? CELL_B : CELL_EMPTY),
  // Le joueur fait tourner la case : un conflit créé par le soleil disparaît souvent au toucher suivant.
  holdConflictsAfterTap: () => true,
};
