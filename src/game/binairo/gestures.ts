/**
 * Reconnaissance du toucher sur la grille Binairo (pure, sans DOM). Un appui relâché sans avoir bougé
 * plus que la tolérance (`touchSlop`) vaut un toucher sur la case d'APPUI : un doigt qui dérive de quelques
 * pixels par-dessus une frontière de case reste un toucher. Pas de glisser-peindre : un appui qui dépasse
 * la tolérance est abandonné (le défilement de la page reste possible, rien n'est posé).
 */

/** Tolérance minimale (px CSS) avant qu'un mouvement ne soit plus un toucher. */
export const SLOP_MIN_PX = 10;
/** Tolérance proportionnelle à la taille d'une case (grandes cases : doigt plus mobile). */
export const SLOP_CELL_RATIO = 0.3;

/** Position du pointeur (px CSS, mêmes coordonnées pour tout un geste). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Distance (px) au-delà de laquelle un appui n'est plus un toucher : max(10 px, 0,3 × case). */
export function touchSlop(cellSize: number): number {
  return Math.max(SLOP_MIN_PX, SLOP_CELL_RATIO * (Number.isFinite(cellSize) ? cellSize : 0));
}

// Compteur global : les identifiants de trait restent uniques même si la grille est remontée, donc le
// réducteur ne confond jamais deux saisies directes (une saisie = une entrée d'historique).
let lastStroke = 0;

/** Nouvel identifiant de trait (≥ 1) pour une saisie directe au clavier. */
export function nextStroke(): number {
  return ++lastStroke;
}

export class TapTracker {
  private downCell: number | null = null;
  private origin: Point | null = null;
  private slop = SLOP_MIN_PX;
  /** Tolérance dépassée : ce n'est plus un toucher (même si le doigt revient au point d'appui). */
  private dragged = false;

  /** Doigt posé sur `cell` (null = hors grille) au point `at`, `cellSize` = côté d'une case (px). */
  down(cell: number | null, at: Point, cellSize: number): void {
    this.downCell = cell;
    this.origin = at;
    this.slop = touchSlop(cellSize);
    this.dragged = false;
  }

  /** Doigt déplacé en `at` : au-delà de la tolérance, le toucher est perdu. */
  move(at: Point): void {
    if (this.downCell === null || this.origin === null || this.dragged) return;
    if (Math.hypot(at.x - this.origin.x, at.y - this.origin.y) > this.slop) this.dragged = true;
  }

  /** Doigt levé : la case touchée (celle de l'appui), null si le doigt a trop bougé ou n'était pas sur une case. */
  up(): number | null {
    const cell = this.downCell;
    const dragged = this.dragged;
    this.cancel();
    return cell === null || dragged ? null : cell;
  }

  /** Geste interrompu (annulation système, autre doigt, victoire) : rien n'est émis. */
  cancel(): void {
    this.downCell = null;
    this.origin = null;
    this.dragged = false;
  }
}
