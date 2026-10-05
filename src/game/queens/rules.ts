/** Règles de jeu de Queens pour la session générique (toucher = reine, double toucher = croix). */
import { checkQueensBoard } from '../../../engine/queens/rules';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, type QueensSolvedPuzzle } from '../../../engine/queens/types';
import type { GameRules, Mark } from '../core/rules';

export const QUEENS_RULES: GameRules<QueensSolvedPuzzle> = {
  key: (p) => `${p.size}:${p.regions.join('')}`,
  cells: (p) => p.size * p.size,
  initial: (p) => new Array<Mark>(p.size * p.size).fill(MARK_EMPTY),
  solution: (p) => {
    const marks = new Array<Mark>(p.size * p.size).fill(MARK_EMPTY);
    p.solution.forEach((c, r) => (marks[r * p.size + c] = MARK_QUEEN));
    return marks;
  },
  locked: () => false,
  check: (p, marks) => checkQueensBoard(p, marks),
  // Une croix touchée devient une reine ; une reine touchée s'efface.
  tap: (m) => (m === MARK_QUEEN ? MARK_EMPTY : MARK_QUEEN),
  // Le second toucher remplace le premier par une croix (ou efface une croix).
  doubleTap: (before) => (before === MARK_CROSS ? MARK_EMPTY : MARK_CROSS),
  // Une reine posée peut encore devenir une croix : son conflit attend la fin du double toucher.
  holdConflictsAfterTap: (before) => before !== MARK_QUEEN,
};
