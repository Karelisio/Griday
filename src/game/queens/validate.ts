/**
 * Validation des données relues du stockage local (cache, parties sauvegardées) : une donnée
 * corrompue ou d'un ancien format est ignorée au lieu de faire planter l'écran.
 */
import type { DifficultyTier, GenerationTarget } from '../../../engine/core/types';
import { isQueensSolution } from '../../../engine/queens/rules';
import { QUEENS_MAX_SIZE, QUEENS_MIN_SIZE, type QueensSolvedPuzzle } from '../../../engine/queens/types';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIntIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Grille Queens complète et cohérente : n régions toutes présentes, solution valide. */
export function isQueensSolvedPuzzle(v: unknown): v is QueensSolvedPuzzle {
  if (!isRecord(v)) return false;
  const { size: n, regions, solution } = v;
  if (!isIntIn(n, QUEENS_MIN_SIZE, QUEENS_MAX_SIZE)) return false;
  if (!Array.isArray(regions) || regions.length !== n * n || !regions.every((r) => isIntIn(r, 0, n - 1))) return false;
  if (new Set(regions).size !== n) return false;
  if (!Array.isArray(solution) || solution.length !== n || !solution.every((c) => isIntIn(c, 0, n - 1))) return false;
  // Règles respectées (deux reines jamais dans la même région) : une reine par région.
  return isQueensSolution({ size: n, regions: regions as number[] }, solution as number[]);
}

export const isTier = (v: unknown): v is DifficultyTier => v === 1 || v === 2 || v === 3 || v === 4;

export function isGenerationTarget(v: unknown, sizes?: readonly number[]): v is GenerationTarget {
  return isRecord(v) && isIntIn(v['size'], QUEENS_MIN_SIZE, QUEENS_MAX_SIZE) && (!sizes || sizes.includes(v['size'])) && isTier(v['tier']);
}

/** Puzzle généré (du jour ou illimité) relu du cache : type, version, cible et grille cohérents. */
export function isStoredQueensPuzzle(v: unknown, expect: { version?: number; size?: number; allowEmergency?: boolean } = {}): boolean {
  if (!isRecord(v) || v['type'] !== 'queens' || !Number.isInteger(v['version'])) return false;
  // Une grille de secours non déterministe n'est jamais réutilisée comme grille du jour.
  const sources = expect.allowEmergency ? ['generated', 'fallback', 'emergency'] : ['generated', 'fallback'];
  if (!sources.includes(v['source'] as string)) return false;
  if (expect.version !== undefined && v['version'] !== expect.version) return false;
  const target = v['target'];
  if (!isGenerationTarget(target) || (expect.size !== undefined && target.size !== expect.size)) return false;
  const puzzle = v['puzzle'];
  return isQueensSolvedPuzzle(puzzle) && puzzle.size === target.size;
}
