import { describe, expect, it } from 'vitest';
import { rngFromString, type Rng } from '../core/prng';
import { decodeQueens } from './encoding';
import { getQueensHint, type QueensHint } from './hint';
import { QUEENS_TECHNIQUES_V1, nextQueensStep, restrictQueensProfile, solveQueensLogically, type QueensProfile } from './solver';
import { randomQueensLayout, randomUniqueQueens } from './testing';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, type QueensMark, type QueensPuzzle, type QueensSolvedPuzzle } from './types';

const blank = (n: number): QueensMark[] => new Array<QueensMark>(n * n).fill(MARK_EMPTY);

function attacks(p: QueensPuzzle, a: number, b: number): boolean {
  const n = p.size;
  const [ra, ca, rb, cb] = [Math.floor(a / n), a % n, Math.floor(b / n), b % n];
  return a !== b && (ra === rb || ca === cb || p.regions[a] === p.regions[b] || (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1));
}

const solutionCells = (p: QueensSolvedPuzzle): number[] => p.solution.map((c, r) => r * p.size + c);

function withQueens(p: QueensSolvedPuzzle, rows: readonly number[]): QueensMark[] {
  const marks = blank(p.size);
  for (const r of rows) marks[r * p.size + p.solution[r]!] = MARK_QUEEN;
  return marks;
}

/** Ajoute les croix des cases attaquées par les reines posées. */
function withAutoCrosses(p: QueensPuzzle, marks: readonly QueensMark[]): QueensMark[] {
  const out = [...marks];
  marks.forEach((m, q) => {
    if (m === MARK_QUEEN) out.forEach((_, x) => attacks(p, q, x) && (out[x] = MARK_CROSS));
  });
  return out;
}

const puzzles: QueensSolvedPuzzle[] = [];
for (const n of [5, 6, 7, 8, 9, 10]) {
  for (let i = 0; i < 12; i++) {
    const p = randomUniqueQueens(rngFromString(`hint-test-${n}-${i}`), n);
    if (p) puzzles.push(p);
  }
}

/** État partiel CORRECT aléatoire : quelques reines de la solution, quelques croix hors solution. */
function randomCorrectState(rng: Rng, p: QueensSolvedPuzzle): QueensMark[] {
  const n = p.size;
  const sol = new Set(solutionCells(p));
  const marks = blank(n);
  for (let x = 0; x < n * n; x++) {
    if (sol.has(x)) {
      if (rng.chance(1, 3)) marks[x] = MARK_QUEEN;
    } else if (rng.chance(1, 3)) {
      marks[x] = MARK_CROSS;
    }
  }
  return marks;
}

/** Vérifie qu'un indice est juste et n'apprend que du nouveau au joueur. */
function checkHint(p: QueensSolvedPuzzle, marks: readonly QueensMark[], hint: QueensHint, profile = QUEENS_TECHNIQUES_V1): void {
  const sol = new Set(solutionCells(p));
  const queens = marks.flatMap((m, x) => (m === MARK_QUEEN ? [x] : []));
  const known = (x: number): boolean => marks[x] !== MARK_EMPTY || queens.some((q) => attacks(p, q, x));
  if (hint.kind === 'solved' || hint.kind === 'mistake') return;
  const { cell, mark } = hint.reveal;
  expect(known(cell)).toBe(false);
  expect(sol.has(cell)).toBe(mark === 'queen');
  if (hint.kind === 'step') {
    const { step } = hint;
    for (const x of step.place) expect(sol.has(x) && !known(x)).toBe(true);
    for (const x of step.eliminate) expect(!sol.has(x) && !known(x)).toBe(true);
    expect(cell).toBe(step.place.length > 0 ? step.place[0] : step.eliminate[0]);
    expect(nextQueensStep(p, marks, profile)).toEqual(step);
  }
}

/** Suit les indices (en ne jouant que la case dévoilée) jusqu'à la solution. */
function playHints(p: QueensSolvedPuzzle, profile: QueensProfile = QUEENS_TECHNIQUES_V1, start = blank(p.size)) {
  let marks = [...start];
  const kinds = { step: 0, reveal: 0 };
  for (let i = 0; i <= p.size * p.size; i++) {
    const hint = getQueensHint(p, marks, profile);
    checkHint(p, marks, hint, profile);
    if (hint.kind === 'solved') return { marks, kinds };
    expect(hint.kind).not.toBe('mistake');
    if (hint.kind === 'mistake') break;
    kinds[hint.kind]++;
    marks = [...marks];
    marks[hint.reveal.cell] = hint.reveal.mark === 'queen' ? MARK_QUEEN : MARK_CROSS;
  }
  throw new Error('les indices ne mènent pas à la solution');
}

describe('getQueensHint', () => {
  const p = puzzles.find((x) => x.size === 6)!;
  const n = p.size;
  const sol = solutionCells(p);

  it('solved : toutes les reines de la solution (croix éventuelles comprises)', () => {
    const marks = withQueens(p, [0, 1, 2, 3, 4, 5]);
    expect(getQueensHint(p, marks)).toEqual({ kind: 'solved' });
    const crossed = marks.map((m) => (m === MARK_QUEEN ? m : MARK_CROSS));
    expect(getQueensHint(p, crossed)).toEqual({ kind: 'solved' });
  });

  it('mistake : reines hors solution et croix sur la solution, triées, avant tout le reste', () => {
    const wrongQueen = 2 * n + ((p.solution[2]! + 2) % n);
    const marks = withQueens(p, [0]);
    marks[wrongQueen] = MARK_QUEEN;
    marks[sol[4]!] = MARK_CROSS;
    expect(getQueensHint(p, marks)).toEqual({ kind: 'mistake', cells: [wrongQueen, sol[4]!].sort((a, b) => a - b) });
    // Une reine en trop sur une grille sinon complète reste une erreur.
    const extra = withQueens(p, [0, 1, 2, 3, 4, 5]);
    const spare = extra.findIndex((m) => m === MARK_EMPTY);
    extra[spare] = MARK_QUEEN;
    expect(getQueensHint(p, extra)).toEqual({ kind: 'mistake', cells: [spare] });
  });

  it('grille vide : première étape du solveur', () => {
    for (const q of puzzles) {
      const hint = getQueensHint(q, blank(q.size));
      const first = solveQueensLogically(q).steps[0]!;
      expect(hint).toEqual({
        kind: 'step',
        step: first,
        reveal: first.place.length > 0 ? { cell: first.place[0], mark: 'queen' } : { cell: first.eliminate[0], mark: 'cross' },
      });
    }
  });

  it("les éliminations automatiques des reines du joueur ne sont pas redonnées", () => {
    // 5×5 à solution unique : 00000 / 00012 / 33412 / 33412 / 33111, reine (0,1) posée sans croix.
    const q = decodeQueens('0000000012334123341233111');
    const solution = solveQueensLogically(q).marks.flatMap((m, x) => (m === MARK_QUEEN ? [x % 5] : []));
    const puzzle: QueensSolvedPuzzle = { ...q, solution };
    const marks = blank(5);
    marks[5 * 0 + solution[0]!] = MARK_QUEEN;
    const hint = getQueensHint(puzzle, marks);
    // Région 2 réduite à la colonne 4 par les attaques de la reine → (4,4) éliminée.
    expect(hint).toMatchObject({ kind: 'step', step: { technique: 'region-line', eliminate: [24] }, reveal: { cell: 24, mark: 'cross' } });
    checkHint(puzzle, marks, hint);
    expect(getQueensHint(puzzle, withAutoCrosses(puzzle, marks))).toEqual(hint);
  });

  it('rejette des marques de mauvaise longueur', () => {
    expect(() => getQueensHint(p, blank(n - 1))).toThrow(RangeError);
  });
});

describe('getQueensHint sur grilles aléatoires', () => {
  it('états partiels corrects : indice juste, nouveau, jamais absent', () => {
    const rng = rngFromString('hint-states');
    let steps = 0;
    for (const p of puzzles) {
      for (let k = 0; k < 8; k++) {
        const marks = randomCorrectState(rng, p);
        const hint = getQueensHint(p, marks);
        expect(['step', 'reveal', 'solved']).toContain(hint.kind);
        checkHint(p, marks, hint);
        if (hint.kind === 'step') steps++;
        expect(getQueensHint(p, marks)).toEqual(hint);
        // Barrer soi-même les cases attaquées par ses reines n'apprend rien au moteur.
        expect(getQueensHint(p, withAutoCrosses(p, marks))).toEqual(hint);
      }
    }
    expect(steps).toBeGreaterThan(puzzles.length * 4);
  });

  it('erreurs aléatoires toujours signalées', () => {
    const rng = rngFromString('hint-mistakes');
    for (const p of puzzles) {
      const marks = randomCorrectState(rng, p);
      const sol = new Set(solutionCells(p));
      const wrong = rng.pick([...marks.keys()].filter((x) => marks[x] === MARK_EMPTY));
      marks[wrong] = sol.has(wrong) ? MARK_CROSS : MARK_QUEEN;
      expect(getQueensHint(p, marks)).toEqual({ kind: 'mistake', cells: [wrong] });
    }
  });

  it('suivre les indices mène à la solution sans jamais dévoiler au hasard (V1)', () => {
    for (const p of puzzles) {
      const { marks, kinds } = playHints(p);
      expect(kinds.reveal).toBe(0);
      expect(marks.filter((m) => m === MARK_QUEEN)).toHaveLength(p.size);
    }
  });

  it('depuis des états partiels aléatoires aussi', () => {
    const rng = rngFromString('hint-play');
    for (const p of puzzles.slice(0, 30)) playHints(p, QUEENS_TECHNIQUES_V1, randomCorrectState(rng, p));
  });

  it('repli : profil réduit ou grille non logique → reine de la solution dévoilée', () => {
    const none = restrictQueensProfile(QUEENS_TECHNIQUES_V1, 0);
    for (const p of puzzles.slice(0, 12)) {
      const hint = getQueensHint(p, blank(p.size), none);
      expect(hint).toEqual({ kind: 'reveal', reveal: { cell: p.solution[0], mark: 'queen' } });
      expect(playHints(p, none).kinds).toEqual({ step: 0, reveal: p.size });
      expect(playHints(p, restrictQueensProfile(QUEENS_TECHNIQUES_V1, 2)).kinds.reveal).toBeGreaterThanOrEqual(0);
    }
    // Grilles à solutions multiples (solution imposée) : la logique bloque, l'indice ne manque jamais.
    let fallbacks = 0;
    for (let i = 0; i < 30; i++) {
      const p = randomQueensLayout(rngFromString(`hint-layout-${i}`), 7);
      fallbacks += playHints(p).kinds.reveal;
    }
    expect(fallbacks).toBeGreaterThan(0);
  });
});
