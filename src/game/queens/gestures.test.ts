import { describe, expect, it } from 'vitest';
import type { QueensMark } from '../../../engine/queens/types';
import { DOUBLE_TAP_MS, GestureTracker } from './gestures';
import { MARK_CROSS, MARK_EMPTY } from './marks';

const none = (): QueensMark => MARK_EMPTY;

describe('gestes sur la grille', () => {
  it('toucher puis double toucher rapide sur la même case', () => {
    const g = new GestureTracker();
    g.down(4);
    expect(g.up(4, 1000)).toEqual({ type: 'tap', cell: 4 });
    g.down(4);
    expect(g.up(4, 1000 + DOUBLE_TAP_MS)).toEqual({ type: 'doubleTap', cell: 4 });
    // Un 3e toucher repart d'un toucher simple.
    g.down(4);
    expect(g.up(4, 1100 + DOUBLE_TAP_MS)).toEqual({ type: 'tap', cell: 4 });
  });

  it('deux touchers lents ou sur deux cases = deux touchers simples', () => {
    const g = new GestureTracker();
    g.down(1);
    g.up(1, 0);
    g.down(1);
    expect(g.up(1, DOUBLE_TAP_MS + 1)).toEqual({ type: 'tap', cell: 1 });
    g.down(2);
    expect(g.up(2, DOUBLE_TAP_MS + 50)).toEqual({ type: 'tap', cell: 2 });
  });

  it('glisser : peinture incrémentale, mode selon la 1re case, pas de toucher au relâchement', () => {
    const g = new GestureTracker();
    g.down(0);
    expect(g.move(0, none)).toBeNull();
    expect(g.move(1, none)).toEqual({ type: 'paint', cells: [0, 1], mode: 'cross' });
    expect(g.move(1, none)).toBeNull();
    expect(g.move(2, none)).toEqual({ type: 'paint', cells: [2], mode: 'cross' });
    expect(g.move(1, none)).toBeNull();
    expect(g.up(2, 10)).toBeNull();

    g.down(5);
    expect(g.move(6, (c) => (c === 5 ? MARK_CROSS : MARK_EMPTY))).toEqual({ type: 'paint', cells: [5, 6], mode: 'erase' });
  });

  it('relâcher hors de la case de départ ou hors grille : rien', () => {
    const g = new GestureTracker();
    g.down(3);
    expect(g.up(null, 0)).toBeNull();
    g.down(null);
    expect(g.move(2, none)).toBeNull();
    expect(g.up(2, 5)).toBeNull();
  });
});
