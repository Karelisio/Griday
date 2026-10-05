/**
 * Validation des grilles Binairo relues du stockage local (cache, parties sauvegardées) : une donnée
 * corrompue ou d'un ancien format est ignorée au lieu de faire planter l'écran.
 */
import { isBinairoSolution } from '../../../engine/binairo/rules';
import { BINAIRO_MAX_SIZE, BINAIRO_MIN_SIZE, CELL_A, CELL_B, CELL_EMPTY, type BinairoSolvedPuzzle } from '../../../engine/binairo/types';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIntIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Grille Binairo complète et cohérente : taille paire, données 0/1/2, solution 1/2 valide qui respecte les données. */
export function isBinairoSolvedPuzzle(v: unknown): v is BinairoSolvedPuzzle {
  if (!isRecord(v)) return false;
  const { size: n, givens, solution } = v;
  if (!isIntIn(n, BINAIRO_MIN_SIZE, BINAIRO_MAX_SIZE) || n % 2 !== 0) return false;
  if (!Array.isArray(givens) || givens.length !== n * n || !givens.every((g) => g === CELL_EMPTY || g === CELL_A || g === CELL_B)) return false;
  if (!Array.isArray(solution) || solution.length !== n * n || !solution.every((s) => s === CELL_A || s === CELL_B)) return false;
  // Règles respectées (pas de triplet, autant de symboles de chaque sorte, lignes et colonnes distinctes).
  return isBinairoSolution({ size: n, givens: givens as number[] as BinairoSolvedPuzzle['givens'] }, solution as number[]);
}
