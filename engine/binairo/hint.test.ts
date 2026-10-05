import { describe, expect, it } from 'vitest';
import { rngFromString, type Rng } from '../core/prng';
import { getBinairoHint, type BinairoHint } from './hint';
import { checkBinairoBoard } from './rules';
import { randomUniqueBinairo } from './testing';
import type { BinairoCell, BinairoSolvedPuzzle } from './types';
import { generateBinairoCandidate } from './v1/generator';
import { BINAIRO_TECHNIQUES_V1, nextBinairoStep, rateBinairo, restrictBinairoProfile, solveBinairoLogically, type BinairoProfile } from './v1/solver';

const blank = (n: number): BinairoCell[] => new Array<BinairoCell>(n * n).fill(0);

// Grilles à solution unique : minimales (souvent non logiques en V1) et plus remplies (logiques).
const puzzles: BinairoSolvedPuzzle[] = [];
for (const n of [4, 6, 8, 10]) {
  for (let i = 0; i < 10; i++) {
    puzzles.push(randomUniqueBinairo(rngFromString(`hint-test-${n}-${i}`), n, i % 2 === 0 ? 0 : 0.45));
  }
}
// Grilles du générateur V1 (tous paliers) : toujours logiques.
const generated: BinairoSolvedPuzzle[] = [];
for (const tier of [1, 2, 3, 4] as const) {
  for (const n of [6, 8, 10]) {
    for (let i = 0; generated.filter((p) => p.size === n).length < 3 * tier && i < 60; i++) {
      const p = generateBinairoCandidate(rngFromString(`hint-gen-${tier}-${n}-${i}`), n, tier);
      if (p) generated.push(p);
    }
  }
}

/** Vue du joueur : donnée si présente, sinon sa marque. */
const view = (p: BinairoSolvedPuzzle, marks: readonly BinairoCell[]): number[] => marks.map((m, i) => (p.givens[i] !== 0 ? p.givens[i]! : m));

/** État partiel CORRECT aléatoire : une partie des cases non données, avec la valeur de la solution. */
function randomCorrectState(rng: Rng, p: BinairoSolvedPuzzle, num = 1, den = 3): BinairoCell[] {
  return p.solution.map((v, i) => (p.givens[i] === 0 && rng.chance(num, den) ? v : 0) as BinairoCell);
}

/** Vérifie qu'un indice est juste et n'apprend que du nouveau au joueur. */
function checkHint(p: BinairoSolvedPuzzle, marks: readonly BinairoCell[], hint: BinairoHint, profile: BinairoProfile = BINAIRO_TECHNIQUES_V1): void {
  const seen = view(p, marks);
  if (hint.kind === 'solved') {
    expect(seen.every((v, i) => v === p.solution[i])).toBe(true);
    return;
  }
  expect(seen.every((v, i) => v === 0 || v === p.solution[i]), 'pas d’erreur attendue').toBe(true);
  expect(hint.kind).not.toBe('mistake');
  if (hint.kind === 'mistake') return;
  const { cell, value } = hint.reveal;
  expect(seen[cell]).toBe(0); // information nouvelle
  expect(value).toBe(p.solution[cell]); // jamais contraire à la solution
  if (hint.kind === 'step') {
    const { step } = hint;
    expect(step.place.length).toBeGreaterThan(0);
    for (const x of step.place) {
      expect(seen[x.cell]).toBe(0);
      expect(x.value).toBe(p.solution[x.cell]);
    }
    expect(hint.reveal).toEqual(step.place[0]);
    expect(nextBinairoStep(p, marks, profile)).toEqual(step);
  } else {
    // Repli : première case vide, et aucune technique du profil ne s'applique.
    expect(cell).toBe(seen.indexOf(0));
    expect(nextBinairoStep(p, marks, profile)).toBeNull();
  }
}

/** Suit les indices (en ne jouant que la case dévoilée) jusqu'à la solution. */
function playHints(p: BinairoSolvedPuzzle, profile: BinairoProfile = BINAIRO_TECHNIQUES_V1, start = blank(p.size)) {
  let marks = [...start];
  const kinds = { step: 0, reveal: 0 };
  for (let i = 0; i <= p.size * p.size; i++) {
    const hint = getBinairoHint(p, marks, profile);
    checkHint(p, marks, hint, profile);
    if (hint.kind === 'solved') return { marks, kinds };
    if (hint.kind === 'mistake') break;
    kinds[hint.kind]++;
    marks = [...marks];
    marks[hint.reveal.cell] = hint.reveal.value;
  }
  throw new Error('les indices ne mènent pas à la solution');
}

describe('getBinairoHint', () => {
  const p = puzzles.find((x) => x.size === 6 && rateBinairo(x).solvable)!;
  const n = p.size;

  it('solved : grille pleine et juste (marques sur les données comprises ou non)', () => {
    const outside = p.solution.map((v, i) => (p.givens[i] !== 0 ? 0 : v)) as BinairoCell[];
    expect(getBinairoHint(p, outside)).toEqual({ kind: 'solved' });
    expect(getBinairoHint(p, [...p.solution])).toEqual({ kind: 'solved' });
    expect(checkBinairoBoard(p, outside).solved).toBe(true);
  });

  it('mistake : cases fausses triées, avant tout le reste (même si une étape existe)', () => {
    const empties = p.givens.flatMap((v, i) => (v === 0 ? [i] : []));
    const [a, b] = [empties[empties.length - 1]!, empties[0]!];
    const marks = blank(n);
    marks[a] = (3 - p.solution[a]!) as BinairoCell;
    marks[b] = (3 - p.solution[b]!) as BinairoCell;
    expect(getBinairoHint(p, marks)).toEqual({ kind: 'mistake', cells: [b, a] });
    // Grille sinon complète et juste : l'erreur reste signalée.
    const full = p.solution.map((v, i) => (i === a ? 3 - v : v)) as BinairoCell[];
    expect(getBinairoHint(p, full)).toEqual({ kind: 'mistake', cells: [a] });
  });

  it('grille vide : première étape du solveur', () => {
    for (const q of puzzles) {
      const hint = getBinairoHint(q, blank(q.size));
      const res = solveBinairoLogically(q);
      if (res.steps.length === 0) {
        expect(hint.kind).toBe('reveal');
        continue;
      }
      const first = res.steps[0]!;
      expect(hint).toEqual({ kind: 'step', step: first, reveal: first.place[0] });
    }
  });

  it('marque contraire posée sur une case donnée : ignorée (convention commune rules/hint)', () => {
    const g = p.givens.findIndex((v) => v !== 0);
    const marks = blank(n);
    marks[g] = (3 - p.givens[g]!) as BinairoCell;
    expect(getBinairoHint(p, marks)).toEqual(getBinairoHint(p, blank(n)));
    // Grille pleine juste hors cette marque : l'indice dit « résolu », checkBinairoBoard non (données non respectées).
    const full = p.solution.map((v, i) => (i === g ? 3 - v : v)) as BinairoCell[];
    expect(getBinairoHint(p, full)).toEqual({ kind: 'solved' });
    expect(checkBinairoBoard(p, full).solved).toBe(false);
  });

  it('rejette des marques ou une solution de mauvaise longueur, des marques hors domaine', () => {
    expect(() => getBinairoHint(p, blank(n).slice(1))).toThrow(RangeError);
    const bad = blank(n) as number[];
    bad[0] = 3;
    expect(() => getBinairoHint(p, bad as BinairoCell[])).toThrow(RangeError);
    expect(() => getBinairoHint({ ...p, solution: p.solution.slice(1) }, blank(n))).toThrow(RangeError);
  });
});

describe('getBinairoHint sur grilles aléatoires', () => {
  it('états partiels corrects : indice juste, nouveau, jamais absent, déterministe', () => {
    const rng = rngFromString('hint-states');
    let steps = 0;
    for (const p of [...puzzles, ...generated]) {
      for (let k = 0; k < 8; k++) {
        const marks = randomCorrectState(rng, p, 1 + (k % 3), 4);
        const hint = getBinairoHint(p, marks);
        expect(['step', 'reveal', 'solved']).toContain(hint.kind);
        checkHint(p, marks, hint);
        if (hint.kind === 'step') steps++;
        expect(getBinairoHint(p, marks)).toEqual(hint);
        // Recopier les données dans les marques ne change rien.
        expect(getBinairoHint(p, marks.map((m, i) => (p.givens[i] !== 0 ? p.givens[i]! : m)))).toEqual(hint);
      }
    }
    expect(steps).toBeGreaterThan(puzzles.length * 4);
  });

  it('erreurs aléatoires toujours signalées, exactement', () => {
    const rng = rngFromString('hint-mistakes');
    for (const p of [...puzzles, ...generated]) {
      for (let k = 0; k < 4; k++) {
        const marks = randomCorrectState(rng, p, 1, 2);
        const wrong: number[] = [];
        for (let e = 1 + rng.int(3); e > 0; e--) {
          const free = [...marks.keys()].filter((x) => p.givens[x] === 0 && !wrong.includes(x));
          const x = rng.pick(free);
          marks[x] = (3 - p.solution[x]!) as BinairoCell;
          wrong.push(x);
        }
        expect(getBinairoHint(p, marks)).toEqual({ kind: 'mistake', cells: wrong.sort((a, b) => a - b) });
      }
    }
  });

  it('suivre les indices mène à la solution ; grilles logiques V1 : jamais de dévoilement au hasard', () => {
    let reveals = 0;
    for (const p of [...puzzles, ...generated]) {
      const { marks, kinds } = playHints(p);
      expect(view(p, marks)).toEqual(p.solution);
      expect(kinds.step + kinds.reveal).toBe(p.givens.filter((v) => v === 0).length);
      if (rateBinairo(p).solvable) expect(kinds.reveal).toBe(0);
      else reveals += kinds.reveal;
    }
    // Les grilles minimales non logiques (10×10) exercent le repli.
    expect(reveals).toBeGreaterThan(0);
    expect(generated.length).toBeGreaterThan(15);
  });

  it('depuis des états partiels corrects aléatoires aussi (monotonie : jamais de dévoilement si logique)', () => {
    const rng = rngFromString('hint-play');
    for (const p of [...puzzles.slice(0, 20), ...generated]) {
      const { kinds } = playHints(p, BINAIRO_TECHNIQUES_V1, randomCorrectState(rng, p));
      if (rateBinairo(p).solvable) expect(kinds.reveal).toBe(0);
    }
  });

  it('repli : profil sans technique → première case vide dévoilée, à chaque fois', () => {
    const none = restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, 0);
    for (const p of puzzles.slice(0, 12)) {
      const first = p.givens.findIndex((v) => v === 0);
      expect(getBinairoHint(p, blank(p.size), none)).toEqual({ kind: 'reveal', reveal: { cell: first, value: p.solution[first] } });
      expect(playHints(p, none).kinds).toEqual({ step: 0, reveal: p.givens.filter((v) => v === 0).length });
      playHints(p, restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, 3));
    }
  });
});
