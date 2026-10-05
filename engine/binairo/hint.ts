/**
 * Indices Binairo pour le joueur (même politique que Queens).
 * 1. Erreurs d'abord : cases remplies par le joueur différentes de la solution (une donnée n'est jamais fausse ;
 *    la marque posée sur une case donnée est ignorée).
 * 2. Sinon, état logique = données + marques du joueur (toutes justes) : la prochaine étape la plus facile du
 *    solveur pose au moins une case encore vide (information nouvelle). On dévoile la première case posée.
 * 3. Si aucune technique ne s'applique (profil réduit), on dévoile une case de la solution (première case vide) :
 *    un indice est toujours disponible.
 */
import { assertBinairoMarks } from './rules';
import { CELL_EMPTY, type BinairoCell, type BinairoSolvedPuzzle } from './types';
import { BINAIRO_TECHNIQUES_V1, nextBinairoStep, type BinairoPlacement, type BinairoProfile, type BinairoStep } from './v1/solver';

export type { BinairoLineKind, BinairoLineRef, BinairoPlacement, BinairoStep, BinairoTechnique } from './v1/solver';

export type BinairoHint =
  /** Grille pleine et juste. */
  | { readonly kind: 'solved' }
  /** Cases fausses (triées) : marques du joueur différentes de la solution. */
  | { readonly kind: 'mistake'; readonly cells: readonly number[] }
  /** Déduction à expliquer, et la case qu'elle permet de jouer (première de `step.place`). */
  | { readonly kind: 'step'; readonly step: BinairoStep; readonly reveal: BinairoPlacement }
  /** Aucune déduction disponible : case de la solution dévoilée. */
  | { readonly kind: 'reveal'; readonly reveal: BinairoPlacement };

export function getBinairoHint(
  p: BinairoSolvedPuzzle,
  marks: readonly BinairoCell[],
  profile: BinairoProfile = BINAIRO_TECHNIQUES_V1,
): BinairoHint {
  assertBinairoMarks(p, marks);
  const total = p.size * p.size;
  if (p.solution.length !== total) throw new RangeError(`Binairo : solution de longueur ${p.solution.length}`);

  const mistakes: number[] = [];
  let filled = 0;
  for (let i = 0; i < total; i++) {
    if (p.givens[i] !== CELL_EMPTY) filled++;
    else if (marks[i] !== CELL_EMPTY) {
      if (marks[i] !== p.solution[i]) mistakes.push(i);
      else filled++;
    }
  }
  if (mistakes.length > 0) return { kind: 'mistake', cells: mistakes };
  if (filled === total) return { kind: 'solved' };

  const step = nextBinairoStep(p, marks, profile);
  if (step !== null && step.place.length > 0) return { kind: 'step', step, reveal: step.place[0]! };
  for (let i = 0; i < total; i++) {
    if (p.givens[i] === CELL_EMPTY && marks[i] === CELL_EMPTY) return { kind: 'reveal', reveal: { cell: i, value: p.solution[i]! } };
  }
  return { kind: 'solved' }; // inatteignable : filled < total
}
