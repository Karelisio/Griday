/**
 * Indices Queens pour le joueur.
 * 1. Erreurs d'abord : reines hors solution, croix sur une case de la solution.
 * 2. Sinon, état logique = reines du joueur (+ leurs éliminations automatiques) et ses croix ;
 *    la prochaine étape la plus facile du solveur apporte forcément une information nouvelle
 *    (elle pose une reine absente ou élimine une case encore libre et non attaquée).
 *    On dévoile une case : la reine posée, sinon la première case éliminée.
 * 3. Si aucune technique ne s'applique (grille non logique, profil réduit), on dévoile une reine
 *    de la solution (première ligne sans reine) : un indice est toujours disponible.
 */
import { QUEENS_TECHNIQUES_V1, nextQueensStep, type QueensProfile, type QueensStep } from './solver';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, type QueensMark, type QueensSolvedPuzzle } from './types';

export interface QueensReveal {
  readonly cell: number;
  readonly mark: 'queen' | 'cross';
}

export type QueensHint =
  /** n reines bien placées. */
  | { readonly kind: 'solved' }
  /** Cases fausses (triées) : reines hors solution, croix sur la solution. */
  | { readonly kind: 'mistake'; readonly cells: readonly number[] }
  /** Déduction à expliquer, et la case qu'elle permet de jouer. */
  | { readonly kind: 'step'; readonly step: QueensStep; readonly reveal: QueensReveal }
  /** Aucune déduction disponible : reine de la solution dévoilée. */
  | { readonly kind: 'reveal'; readonly reveal: QueensReveal };

export function getQueensHint(
  p: QueensSolvedPuzzle,
  marks: readonly QueensMark[],
  profile: QueensProfile = QUEENS_TECHNIQUES_V1,
): QueensHint {
  const n = p.size;
  if (marks.length !== n * n) throw new RangeError(`Queens : ${marks.length} marques pour ${n * n} cases`);
  if (p.solution.length !== n) throw new RangeError(`Queens : solution de longueur ${p.solution.length}`);

  const mistakes: number[] = [];
  let placed = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const m = marks[r * n + c];
      const onSolution = p.solution[r] === c;
      if (m === MARK_QUEEN && !onSolution) mistakes.push(r * n + c);
      else if (m === MARK_CROSS && onSolution) mistakes.push(r * n + c);
      else if (m === MARK_QUEEN) placed++;
    }
  }
  if (mistakes.length > 0) return { kind: 'mistake', cells: mistakes };
  if (placed === n) return { kind: 'solved' };

  const step = nextQueensStep(p, marks, profile);
  if (step !== null) {
    if (step.place.length > 0) return { kind: 'step', step, reveal: { cell: step.place[0]!, mark: 'queen' } };
    const cell = step.eliminate.find((x) => marks[x] === MARK_EMPTY);
    if (cell !== undefined) return { kind: 'step', step, reveal: { cell, mark: 'cross' } };
  }
  for (let r = 0; r < n; r++) {
    const cell = r * n + p.solution[r]!;
    if (marks[cell] !== MARK_QUEEN) return { kind: 'reveal', reveal: { cell, mark: 'queen' } };
  }
  return { kind: 'solved' }; // inatteignable : placed < n
}
