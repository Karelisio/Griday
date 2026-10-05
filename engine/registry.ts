import { BINAIRO_DEFINITION } from './binairo';
import type { BinairoSolvedPuzzle } from './binairo/types';
import type { SCHEDULE } from './config';
import type { DailyPuzzle, GeneratedPuzzle, PuzzleTypeDefinition, PuzzleTypeId } from './core/types';
import { QUEENS_DEFINITION } from './queens';
import type { QueensSolvedPuzzle } from './queens/types';

/** Données de puzzle par type (union discriminée côté UI). */
export interface PuzzleDataMap {
  queens: QueensSolvedPuzzle;
  binairo: BinairoSolvedPuzzle;
}

export const REGISTRY: { readonly [K in PuzzleTypeId]: PuzzleTypeDefinition<PuzzleDataMap[K]> } = Object.freeze({
  queens: QUEENS_DEFINITION,
  binairo: BINAIRO_DEFINITION,
});

/** Puzzle généré d'un type donné ; distributif : GeneratedPuzzleOf<PuzzleTypeId> = union discriminée. */
export type GeneratedPuzzleOf<K extends PuzzleTypeId> = K extends PuzzleTypeId
  ? GeneratedPuzzle<PuzzleDataMap[K]> & { readonly type: K }
  : never;

export type AnyGeneratedPuzzle = GeneratedPuzzleOf<PuzzleTypeId>;

/**
 * Types servis en puzzle du jour : ceux des rotations de config.ts (déduits du calendrier littéral).
 * Un type inscrit au registre mais hors rotation (ex. binairo avant son activation) n'en fait pas partie :
 * l'ajouter à `rotations` élargit AnyDailyPuzzle, et le compilateur signale le code UI à compléter.
 */
export type DailyTypeId = (typeof SCHEDULE.rotations)[number]['types'][number];

export type AnyDailyPuzzle = {
  [K in DailyTypeId]: DailyPuzzle<PuzzleDataMap[K]> & { readonly type: K };
}[DailyTypeId];
