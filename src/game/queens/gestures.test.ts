import { describe, expect, it } from 'vitest';
import type { QueensMark } from '../../../engine/queens/types';
import { DOUBLE_TAP_MS, GestureTracker, SLOP_CELL_RATIO, SLOP_MIN_PX, touchSlop, type GestureEvent } from './gestures';
import { MARK_CROSS, MARK_EMPTY } from './marks';

const none = (): QueensMark => MARK_EMPTY;

// Grille 6 × 6 de cases de 40 px (origine en 0,0) : le suivi reçoit comme dans le composant la case
// sous le doigt, sa position et la taille d'une case.
const N = 6;
const SIZE = 40;
const cellAt = (x: number, y: number): number | null =>
  x < 0 || y < 0 || x >= N * SIZE || y >= N * SIZE ? null : Math.floor(y / SIZE) * N + Math.floor(x / SIZE);
/** Centre de la case `cell`, décalé de (dx, dy). */
const center = (cell: number, dx = 0, dy = 0) => ({ x: (cell % N) * SIZE + SIZE / 2 + dx, y: Math.floor(cell / N) * SIZE + SIZE / 2 + dy });

const press = (g: GestureTracker, x: number, y: number, size = SIZE) => g.down(cellAt(x, y), { x, y }, size);
const drag = (g: GestureTracker, x: number, y: number, markAt: (c: number) => QueensMark = none) => g.move(cellAt(x, y), { x, y }, markAt);
const paint = (e: GestureEvent | null) => {
  expect(e?.type).toBe('paint');
  return e as Extract<GestureEvent, { type: 'paint' }>;
};

describe('tolérance de toucher', () => {
  it('max(10 px, 0,3 × case)', () => {
    expect(SLOP_MIN_PX).toBe(10);
    expect(SLOP_CELL_RATIO).toBe(0.3);
    expect(touchSlop(20)).toBe(10); // petites cases : le plancher de 10 px
    expect(touchSlop(40)).toBeCloseTo(12);
    expect(touchSlop(100)).toBeCloseTo(30);
    expect(touchSlop(0)).toBe(10);
    expect(touchSlop(Number.NaN)).toBe(10);
  });

  it('un toucher qui dérive de 3 px par-dessus une frontière de case reste un toucher sur la case d’appui', () => {
    const g = new GestureTracker();
    // Appui à 1 px de la frontière droite de la case 4 (x = 200), le doigt franchit la frontière.
    press(g, 199, 100);
    expect(drag(g, 201, 100)).toBeNull();
    expect(drag(g, 202, 101)).toBeNull();
    expect(g.up(1000)).toEqual({ type: 'tap', cell: cellAt(199, 100) });
    expect(cellAt(199, 100)).toBe(2 * N + 4);
    expect(cellAt(202, 101)).toBe(2 * N + 5);
  });

  it('le toucher vise la case d’appui, quelle que soit la case de relâchement', () => {
    const g = new GestureTracker();
    press(g, 79, 20); // case 1, bord droit
    drag(g, 83, 20); // case 2, à 4 px
    expect(g.up(0)).toEqual({ type: 'tap', cell: 1 });
  });

  it('le double toucher résiste lui aussi à la dérive', () => {
    const g = new GestureTracker();
    press(g, 79, 20);
    drag(g, 81, 20);
    expect(g.up(1000)).toEqual({ type: 'tap', cell: 1 });
    press(g, 78, 22);
    drag(g, 82, 21);
    expect(g.up(1000 + DOUBLE_TAP_MS)).toEqual({ type: 'doubleTap', cell: 1 });
  });

  it('un mouvement plus grand que la tolérance et sur une autre case peint la case d’appui et celle-ci', () => {
    const g = new GestureTracker();
    press(g, 79, 20); // case 1
    // 13 px > 0,3 × 40 = 12 px : la case 2 est atteinte au-delà de la tolérance.
    expect(drag(g, 92, 20)).toEqual({ type: 'paint', cells: [1, 2], mode: 'cross', stroke: expect.any(Number) });
    expect(g.up(5)).toBeNull();
  });

  it('pile à la tolérance, ce n’est pas encore un glisser ; au-delà, si', () => {
    const g = new GestureTracker();
    press(g, 79, 20); // tolérance = 12 px
    expect(drag(g, 91, 20)).toBeNull(); // 12 px exactement, dans la case 2
    expect(paint(drag(g, 91.5, 20)).cells).toEqual([1, 2]);
  });

  it('la tolérance grandit avec la case (30 px pour des cases de 100 px)', () => {
    const g = new GestureTracker();
    const big = (x: number, y: number) => ({ x, y });
    g.down(1, big(99, 50), 100); // case 1, à 1 px de la case 2
    expect(g.move(2, big(125, 50), none)).toBeNull(); // 26 px : dans la tolérance de 30 px
    expect(g.move(2, big(131, 50), none)).toEqual({ type: 'paint', cells: [1, 2], mode: 'cross', stroke: expect.any(Number) });
  });

  it('petites cases : le plancher de 10 px s’applique', () => {
    const g = new GestureTracker();
    g.down(0, { x: 19, y: 5 }, 20);
    expect(g.move(1, { x: 28, y: 5 }, none)).toBeNull(); // 9 px
    expect(g.move(1, { x: 30, y: 5 }, none)).not.toBeNull(); // 11 px
  });

  it('la distance se mesure depuis le point d’appui, dans toutes les directions', () => {
    const g = new GestureTracker();
    press(g, 79, 79); // case 7 (ligne 1, colonne 1), au coin bas droit
    expect(drag(g, 85, 85)).toBeNull(); // √72 ≈ 8,5 px, case 14
    expect(g.up(0)).toEqual({ type: 'tap', cell: cellAt(79, 79) });
    press(g, 79, 79);
    expect(drag(g, 90, 90)).not.toBeNull(); // √242 ≈ 15,6 px
  });

  it('une fois la peinture commencée, chaque nouvelle case est peinte sans nouvelle tolérance', () => {
    const g = new GestureTracker();
    press(g, 79, 20);
    expect(drag(g, 95, 20)).not.toBeNull(); // cases 1 et 2
    expect(drag(g, 121, 20)?.type).toBe('paint'); // case 3, à peine 1 px après la frontière
    expect(drag(g, 122, 20)).toBeNull(); // déjà peinte
  });

  it('dépasser la tolérance sans atteindre une autre case n’est ni un toucher ni une peinture', () => {
    const g = new GestureTracker();
    press(g, 100, 20); // case 2
    expect(drag(g, 100, 38)).toBeNull(); // 18 px, toujours dans la case 2 (y < 40)
    expect(g.up(0)).toBeNull();
    // Idem en revenant au point d’appui : le geste a déjà quitté la tolérance.
    press(g, 100, 20);
    drag(g, 100, 38);
    drag(g, 100, 20);
    expect(g.up(0)).toBeNull();
  });

  it('un glisser hors de la grille ne produit rien', () => {
    const g = new GestureTracker();
    press(g, 20, 20);
    expect(drag(g, 20, -40)).toBeNull();
    expect(g.up(0)).toBeNull();
  });
});

describe('gestes sur la grille', () => {
  it('toucher puis double toucher rapide sur la même case', () => {
    const g = new GestureTracker();
    const at = center(4);
    press(g, at.x, at.y);
    expect(g.up(1000)).toEqual({ type: 'tap', cell: 4 });
    press(g, at.x, at.y);
    expect(g.up(1000 + DOUBLE_TAP_MS)).toEqual({ type: 'doubleTap', cell: 4 });
    // Un 3e toucher repart d'un toucher simple.
    press(g, at.x, at.y);
    expect(g.up(1100 + DOUBLE_TAP_MS)).toEqual({ type: 'tap', cell: 4 });
  });

  it('deux touchers lents ou sur deux cases = deux touchers simples', () => {
    const g = new GestureTracker();
    const a = center(1);
    const b = center(2);
    press(g, a.x, a.y);
    g.up(0);
    press(g, a.x, a.y);
    expect(g.up(DOUBLE_TAP_MS + 1)).toEqual({ type: 'tap', cell: 1 });
    press(g, b.x, b.y);
    expect(g.up(DOUBLE_TAP_MS + 50)).toEqual({ type: 'tap', cell: 2 });
  });

  it('glisser : peinture incrémentale, mode selon la 1re case, pas de toucher au relâchement', () => {
    const g = new GestureTracker();
    const [c0, c1, c2] = [center(0), center(1), center(2)];
    press(g, c0.x, c0.y);
    expect(drag(g, c0.x + 5, c0.y)).toBeNull();
    expect(paint(drag(g, c1.x, c1.y))).toMatchObject({ cells: [0, 1], mode: 'cross' });
    expect(drag(g, c1.x + 3, c1.y)).toBeNull();
    expect(paint(drag(g, c2.x, c2.y))).toMatchObject({ cells: [2], mode: 'cross' });
    expect(drag(g, c1.x, c1.y)).toBeNull(); // case déjà peinte
    expect(g.up(10)).toBeNull();

    // Une croix sur la case d'appui : on gomme.
    const [c5, c6] = [center(5), center(6)];
    press(g, c5.x, c5.y);
    expect(paint(drag(g, c6.x, c6.y, (c) => (c === 5 ? MARK_CROSS : MARK_EMPTY)))).toMatchObject({ cells: [5, 6], mode: 'erase' });
  });

  it('relâcher hors de la case de départ après un glisser, ou partir de hors grille : rien', () => {
    const g = new GestureTracker();
    const c3 = center(3);
    press(g, c3.x, c3.y);
    drag(g, c3.x + 60, c3.y); // glisser vers la droite (case 4 puis 5)
    expect(g.up(0)).toBeNull();
    g.down(null, { x: -5, y: -5 }, SIZE);
    expect(g.move(2, center(2), none)).toBeNull();
    expect(g.up(5)).toBeNull();
  });

  it('un toucher après un glisser sur la même case n’est pas un double toucher', () => {
    const g = new GestureTracker();
    const [c1, c2] = [center(1), center(2)];
    press(g, c1.x, c1.y);
    expect(g.up(0)).toEqual({ type: 'tap', cell: 1 });
    press(g, c1.x, c1.y);
    drag(g, c2.x, c2.y);
    g.up(100);
    press(g, c1.x, c1.y);
    expect(g.up(200)).toEqual({ type: 'tap', cell: 1 });
  });

  it('annulation : plus aucun événement jusqu’au prochain appui', () => {
    const g = new GestureTracker();
    const [c1, c2] = [center(1), center(2)];
    press(g, c1.x, c1.y);
    g.cancel();
    expect(drag(g, c2.x, c2.y)).toBeNull();
    expect(g.up(0)).toBeNull();
    expect(g.up(1)).toBeNull(); // relâchement sans appui
    press(g, c1.x, c1.y);
    expect(g.up(2)).toEqual({ type: 'tap', cell: 1 });
  });
});

describe('identifiant de trait (stroke)', () => {
  it('toutes les peintures d’un même glisser partagent l’identifiant ; un nouvel appui en ouvre un autre', () => {
    const g = new GestureTracker();
    const strokes: number[] = [];
    for (let line = 0; line < 3; line++) {
      const id = press(g, center(line * N).x, center(line * N).y);
      const events = [drag(g, center(line * N + 1).x, center(line * N + 1).y), drag(g, center(line * N + 2).x, center(line * N + 2).y)];
      for (const e of events) expect(paint(e).stroke).toBe(id);
      g.up(line);
      strokes.push(id);
    }
    expect(new Set(strokes).size).toBe(3);
    expect(strokes[1]).toBe(strokes[0]! + 1);
    expect(strokes[2]).toBe(strokes[1]! + 1);
  });

  it('chaque appui incrémente le compteur, même sans peinture (toucher, annulation)', () => {
    const g = new GestureTracker();
    const a = press(g, 20, 20);
    g.up(0);
    const b = press(g, 20, 20);
    g.cancel();
    const c = press(g, 20, 20);
    expect([b - a, c - b]).toEqual([1, 1]);
    expect(a).toBeGreaterThanOrEqual(1);
  });

  it('chaque peinture clavier prend un identifiant neuf, distinct des traits tactiles', () => {
    const g = new GestureTracker();
    const k1 = g.nextStroke();
    const k2 = g.nextStroke();
    const touch = press(g, 20, 20);
    const k3 = g.nextStroke();
    expect(new Set([k1, k2, touch, k3]).size).toBe(4);
    expect(k2).toBe(k1 + 1);
    expect(touch).toBe(k2 + 1);
    expect(k3).toBe(touch + 1);
    // Le trait tactile en cours garde son identifiant malgré une peinture clavier intercalée.
    expect(paint(drag(g, center(1).x, center(1).y)).stroke).toBe(touch);
  });

  it('les identifiants restent uniques d’un suivi à l’autre (grille remontée)', () => {
    const a = new GestureTracker();
    const b = new GestureTracker();
    const first = press(a, 20, 20);
    const second = press(b, 20, 20);
    expect(second).toBeGreaterThan(first);
    expect(b.nextStroke()).toBeGreaterThan(second);
  });
});
