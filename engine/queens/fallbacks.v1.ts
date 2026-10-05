/**
 * Puzzles de secours Queens V1 — FICHIER GÉNÉRÉ par scripts/build-queens-fallbacks.ts, FIGÉ.
 * Chaque entrée est reproductible depuis sa graine (vérifié par v1.test.ts).
 */
export interface QueensFallbackEntry {
  readonly size: number;
  readonly tier: 1 | 2 | 3 | 4;
  /** Graine de base ayant produit la grille (pipeline V1, tentative indiquée). */
  readonly seed: string;
  readonly attempt: number;
  /** Régions encodées (encodeQueens). */
  readonly code: string;
}

export const QUEENS_FALLBACKS_V1: readonly QueensFallbackEntry[] = [];
