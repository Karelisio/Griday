/**
 * Reconnaissance des gestes sur la grille (pure, sans DOM) :
 * - toucher : action immédiate (pas d'attente), puis « double toucher » si un 2e toucher
 *   arrive sur la même case en moins de DOUBLE_TAP_MS ;
 * - glisser d'une case à une autre : peinture de croix (ou gomme si la 1re case portait une croix).
 */
import type { QueensMark } from '../../../engine/queens/types';
import { MARK_CROSS } from './marks';

export const DOUBLE_TAP_MS = 320;

export type GestureEvent =
  | { type: 'tap'; cell: number }
  | { type: 'doubleTap'; cell: number }
  | { type: 'paint'; cells: number[]; mode: 'cross' | 'erase' };

export class GestureTracker {
  private downCell: number | null = null;
  private painting: { mode: 'cross' | 'erase'; seen: Set<number> } | null = null;
  private lastTap: { cell: number; at: number } | null = null;

  /** Doigt posé sur `cell` (null = hors grille). */
  down(cell: number | null): void {
    this.downCell = cell;
    this.painting = null;
  }

  /** Doigt déplacé ; renvoie les cases à peindre (incrémental) ou rien. */
  move(cell: number | null, markAt: (cell: number) => QueensMark): GestureEvent | null {
    if (this.downCell === null || cell === null) return null;
    if (!this.painting) {
      if (cell === this.downCell) return null;
      const mode = markAt(this.downCell) === MARK_CROSS ? 'erase' : 'cross';
      this.painting = { mode, seen: new Set([this.downCell, cell]) };
      this.lastTap = null;
      return { type: 'paint', cells: [this.downCell, cell], mode };
    }
    if (this.painting.seen.has(cell)) return null;
    this.painting.seen.add(cell);
    return { type: 'paint', cells: [cell], mode: this.painting.mode };
  }

  /** Doigt levé à l'instant `at` (ms). */
  up(cell: number | null, at: number): GestureEvent | null {
    const start = this.downCell;
    const painted = this.painting !== null;
    this.downCell = null;
    this.painting = null;
    if (painted || start === null || cell !== start) return null;
    const last = this.lastTap;
    if (last && last.cell === cell && at - last.at <= DOUBLE_TAP_MS) {
      this.lastTap = null;
      return { type: 'doubleTap', cell };
    }
    this.lastTap = { cell, at };
    return { type: 'tap', cell };
  }

  cancel(): void {
    this.downCell = null;
    this.painting = null;
  }
}
