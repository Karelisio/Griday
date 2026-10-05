import { describe, expect, it } from 'vitest';
import { SLOP_MIN_PX, TapTracker, nextStroke, touchSlop } from './gestures';

const at = (x: number, y = 0) => ({ x, y });

describe('tolérance du toucher', () => {
  it('max(10 px, 0,3 × case), 10 px si la taille est inconnue', () => {
    expect(touchSlop(20)).toBe(SLOP_MIN_PX);
    expect(touchSlop(40)).toBe(12);
    expect(touchSlop(100)).toBe(30);
    expect(touchSlop(NaN)).toBe(SLOP_MIN_PX);
    expect(touchSlop(Infinity)).toBe(SLOP_MIN_PX);
  });
});

describe('TapTracker', () => {
  it('un appui relâché sur place vaut un toucher sur la case d’appui', () => {
    const t = new TapTracker();
    t.down(7, at(50), 100);
    expect(t.up()).toBe(7);
    expect(t.up()).toBeNull(); // le geste est terminé
  });

  it('un doigt qui dérive dans la tolérance reste un toucher sur la case d’appui', () => {
    const t = new TapTracker();
    t.down(7, at(99), 100);
    t.move(at(102));
    t.move(at(120));
    expect(t.up()).toBe(7);
  });

  it('au-delà de la tolérance, le toucher est perdu pour de bon (même si le doigt revient)', () => {
    const t = new TapTracker();
    t.down(7, at(50), 100); // tolérance : 30 px
    t.move(at(81));
    t.move(at(50));
    expect(t.up()).toBeNull();
  });

  it('la tolérance suit la taille d’une case : petites cases = 10 px, grandes cases = plus', () => {
    const small = new TapTracker();
    small.down(1, at(0), 20);
    small.move(at(11));
    expect(small.up()).toBeNull();
    const big = new TapTracker();
    big.down(1, at(0), 100);
    big.move(at(29));
    expect(big.up()).toBe(1);
  });

  it('un appui hors grille, un geste annulé ou jamais commencé ne donne rien', () => {
    const t = new TapTracker();
    expect(t.up()).toBeNull();
    t.down(null, at(0), 100);
    expect(t.up()).toBeNull();
    t.down(3, at(0), 100);
    t.cancel();
    expect(t.up()).toBeNull();
    t.move(at(500)); // déplacement sans appui : ignoré
    t.down(4, at(0), 100);
    expect(t.up()).toBe(4);
  });

  it('un nouvel appui remet la tolérance à zéro', () => {
    const t = new TapTracker();
    t.down(1, at(0), 100);
    t.move(at(200));
    expect(t.up()).toBeNull();
    t.down(2, at(200), 100);
    expect(t.up()).toBe(2);
  });
});

describe('identifiants de saisie directe', () => {
  it('chaque appel donne un identifiant neuf, croissant et ≥ 1', () => {
    const a = nextStroke();
    const b = nextStroke();
    expect(a).toBeGreaterThanOrEqual(1);
    expect(b).toBe(a + 1);
  });
});
