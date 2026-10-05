/**
 * Reconnaissance des gestes sur la grille (pure, sans DOM) :
 * - toucher : action immédiate (pas d'attente), puis « double toucher » si un 2e toucher
 *   arrive sur la même case en moins de DOUBLE_TAP_MS. Le geste vise la case d'APPUI : un doigt
 *   qui dérive de quelques pixels par-dessus une frontière de case reste un toucher ;
 * - glisser : peinture de croix (ou gomme si la 1re case portait une croix), seulement une fois la
 *   tolérance de toucher dépassée (`touchSlop`) ET une autre case atteinte.
 *
 * Chaque appui ouvre un « trait » numéroté (`stroke`) : toutes les peintures d'un même glisser le
 * partagent, ce qui permet au réducteur de ne faire qu'une entrée d'historique par glisser.
 */
import type { QueensMark } from '../../../engine/queens/types';
import { MARK_CROSS } from './marks';

export const DOUBLE_TAP_MS = 320;
/** Tolérance minimale (px CSS) avant qu'un mouvement ne devienne un glisser. */
export const SLOP_MIN_PX = 10;
/** Tolérance proportionnelle à la taille d'une case (grandes cases : doigt plus mobile). */
export const SLOP_CELL_RATIO = 0.3;

export type GestureEvent =
  | { type: 'tap'; cell: number }
  | { type: 'doubleTap'; cell: number }
  | { type: 'paint'; cells: number[]; mode: 'cross' | 'erase'; stroke: number };

/** Position du pointeur (px CSS, mêmes coordonnées pour tout un geste). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Distance (px) au-delà de laquelle un appui devient un glisser : max(10 px, 0,3 × case). */
export function touchSlop(cellSize: number): number {
  return Math.max(SLOP_MIN_PX, SLOP_CELL_RATIO * (Number.isFinite(cellSize) ? cellSize : 0));
}

// Compteur global : les identifiants restent uniques même si la grille est remontée (nouveau suivi),
// donc le réducteur ne peut jamais confondre deux traits distincts.
let lastStroke = 0;

export class GestureTracker {
  private downCell: number | null = null;
  private origin: Point | null = null;
  private slop = SLOP_MIN_PX;
  /** Tolérance dépassée : ce n'est plus un toucher (même si le doigt revient au point d'appui). */
  private dragged = false;
  private painting: { mode: 'cross' | 'erase'; seen: Set<number> } | null = null;
  private lastTap: { cell: number; at: number } | null = null;
  private stroke = 0;

  /** Nouvel identifiant de trait (≥ 1) : peintures isolées, par ex. au clavier. */
  nextStroke(): number {
    return ++lastStroke;
  }

  /**
   * Doigt posé sur `cell` (null = hors grille) au point `at`, `cellSize` = côté d'une case (px).
   * Ouvre un nouveau trait, dont l'identifiant est renvoyé.
   */
  down(cell: number | null, at: Point, cellSize: number): number {
    this.downCell = cell;
    this.origin = at;
    this.slop = touchSlop(cellSize);
    this.dragged = false;
    this.painting = null;
    this.stroke = this.nextStroke();
    return this.stroke;
  }

  /** Doigt déplacé en `at`, au-dessus de `cell` ; renvoie les cases à peindre (incrémental) ou rien. */
  move(cell: number | null, at: Point, markAt: (cell: number) => QueensMark): GestureEvent | null {
    const start = this.downCell;
    if (start === null || this.origin === null) return null;
    if (!this.dragged) {
      if (Math.hypot(at.x - this.origin.x, at.y - this.origin.y) <= this.slop) return null;
      this.dragged = true;
      this.lastTap = null;
    }
    if (cell === null) return null;
    if (!this.painting) {
      if (cell === start) return null;
      const mode = markAt(start) === MARK_CROSS ? 'erase' : 'cross';
      this.painting = { mode, seen: new Set([start, cell]) };
      return { type: 'paint', cells: [start, cell], mode, stroke: this.stroke };
    }
    if (this.painting.seen.has(cell)) return null;
    this.painting.seen.add(cell);
    return { type: 'paint', cells: [cell], mode: this.painting.mode, stroke: this.stroke };
  }

  /** Doigt levé à l'instant `at` (ms) : toucher ou double toucher sur la case d'appui, sauf glisser. */
  up(at: number): GestureEvent | null {
    const cell = this.downCell;
    const dragged = this.dragged;
    this.cancel();
    if (cell === null || dragged) return null;
    const last = this.lastTap;
    if (last && last.cell === cell && at - last.at <= DOUBLE_TAP_MS) {
      this.lastTap = null;
      return { type: 'doubleTap', cell };
    }
    this.lastTap = { cell, at };
    return { type: 'tap', cell };
  }

  /** Geste interrompu (annulation système, autre doigt, victoire) : rien n'est émis. */
  cancel(): void {
    this.downCell = null;
    this.origin = null;
    this.dragged = false;
    this.painting = null;
  }
}
