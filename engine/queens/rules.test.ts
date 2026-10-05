import { describe, expect, it } from 'vitest';
import { rngFromString } from '../core/prng';
import { decodeQueens } from './encoding';
import { solveQueensExact } from './exact';
import { checkQueensBoard, isQueensSolution } from './rules';
import { randomQueensLayout } from './testing';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, type QueensMark, type QueensPuzzle } from './types';

/*
 * Grille 5×5 à solution unique [3, 1, 4, 0, 2] :
 *   0 0 0 1 1
 *   0 0 0 1 2
 *   0 0 0 1 2
 *   3 3 3 2 2
 *   3 4 4 2 2
 */
const P = decodeQueens('0001100012000123332234422');
const SOLUTION = [3, 1, 4, 0, 2];
const N = P.size;
const cell = (r: number, c: number): number => r * N + c;

/** Marques avec des reines aux cases données (et des croix ailleurs si demandé). */
function marks(queens: readonly number[], fill: QueensMark = MARK_EMPTY, size = N): QueensMark[] {
  const m = new Array<QueensMark>(size * size).fill(fill);
  for (const q of queens) m[q] = MARK_QUEEN;
  return m;
}
const solutionCells = (p: QueensPuzzle, cols: readonly number[]): number[] => cols.map((c, r) => r * p.size + c);

/** Règles vérifiées naïvement (indépendant de rules.ts). */
function naiveValid(p: QueensPuzzle, cols: readonly number[]): boolean {
  const n = p.size;
  if (cols.length !== n || cols.some((c) => !Number.isInteger(c) || c < 0 || c >= n)) return false;
  if (new Set(cols).size !== n) return false;
  if (new Set(cols.map((c, r) => p.regions[r * n + c])).size !== n) return false;
  return cols.every((c, r) => r === 0 || Math.abs(c - cols[r - 1]!) > 1);
}

describe('checkQueensBoard', () => {
  it('grille vide ou seulement des croix', () => {
    const empty = { conflicts: [], queenCount: 0, solved: false };
    expect(checkQueensBoard(P, marks([]))).toEqual(empty);
    expect(checkQueensBoard(P, marks([], MARK_CROSS))).toEqual(empty);
  });

  it.each([
    ['même ligne', [cell(0, 0), cell(0, 4)]],
    ['même colonne', [cell(0, 0), cell(4, 0)]],
    ['même région, sans contact', [cell(0, 0), cell(2, 2)]],
    ['contact diagonal ↘', [cell(3, 0), cell(4, 1)]],
    ['contact diagonal ↙', [cell(1, 4), cell(2, 3)]],
  ])('conflit : %s', (_label, queens) => {
    expect(checkQueensBoard(P, marks(queens))).toEqual({ conflicts: [...queens].sort((a, b) => a - b), queenCount: 2, solved: false });
  });

  it('deux reines à distance 2 en diagonale, régions distinctes : pas de conflit', () => {
    expect(checkQueensBoard(P, marks([cell(0, 3), cell(2, 1)])).conflicts).toEqual([]);
  });

  it('seules les reines en conflit sont signalées, triées et sans doublon', () => {
    // (4,2) touche (3,1) et (3,3) ; (3,1)–(3,3) même ligne ; (0,0) libre.
    const res = checkQueensBoard(P, marks([cell(4, 2), cell(0, 0), cell(3, 3), cell(3, 1)]));
    expect(res.conflicts).toEqual([cell(3, 1), cell(3, 3), cell(4, 2)]);
    expect(res.queenCount).toBe(4);
    expect(res.solved).toBe(false);
  });

  it('détection de victoire', () => {
    const sol = solutionCells(P, SOLUTION);
    expect(checkQueensBoard(P, marks(sol))).toEqual({ conflicts: [], queenCount: 5, solved: true });
    expect(checkQueensBoard(P, marks(sol, MARK_CROSS)).solved).toBe(true); // croix ignorées
    expect(checkQueensBoard(P, marks(sol.slice(0, 4))).solved).toBe(false); // n − 1 reines
    expect(checkQueensBoard(P, marks([...sol.slice(0, 4), cell(4, 4)])).solved).toBe(false); // n reines, conflit
    const extra = checkQueensBoard(P, marks([...sol, cell(4, 0)])); // n + 1 reines
    expect(extra.solved).toBe(false);
    expect(extra.conflicts.length).toBeGreaterThan(0);
  });
});

describe('isQueensSolution', () => {
  it('solution valide', () => {
    expect(isQueensSolution(P, SOLUTION)).toBe(true);
  });

  it.each([
    ['trop courte', [3, 1, 4, 0]],
    ['trop longue', [3, 1, 4, 0, 2, 0]],
    ['colonne négative', [3, 1, 4, -1, 2]],
    ['colonne ≥ n', [3, 1, 4, 0, 5]],
    ['colonne non entière', [3, 1, 4, 0, 1.5]],
    ['NaN', [3, 1, 4, 0, Number.NaN]],
    ['colonne répétée', [3, 1, 3, 0, 2]],
    ['contact diagonal', [3, 1, 4, 3, 1]],
    ['même région', [0, 3, 1, 4, 2]],
  ])('refuse : %s', (_label, cols) => {
    expect(isQueensSolution(P, cols)).toBe(false);
  });

  it('≡ vérification naïve ≡ checkQueensBoard.solved, sur grilles et permutations aléatoires', () => {
    const rng = rngFromString('regles');
    let valid = 0;
    for (let i = 0; i < 300; i++) {
      const n = 4 + rng.int(5);
      const p = randomQueensLayout(rng, n);
      const candidates = [p.solution, rng.shuffle(Array.from({ length: n }, (_, k) => k))];
      for (const cols of candidates) {
        const expected = naiveValid(p, cols);
        if (expected) valid++;
        expect(isQueensSolution(p, cols)).toBe(expected);
        expect(checkQueensBoard(p, marks(solutionCells(p, cols), MARK_EMPTY, n)).solved).toBe(expected);
      }
    }
    expect(valid).toBeGreaterThan(300); // toutes les solutions plantées + quelques permutations
  });

  it('toutes les solutions énumérées par le solveur exact sont valides', () => {
    const rng = rngFromString('regles:exact');
    for (let i = 0; i < 40; i++) {
      const p = randomQueensLayout(rng, 6 + (i % 3));
      for (const s of solveQueensExact(p, 50).solutions) expect(isQueensSolution(p, s)).toBe(true);
    }
  });
});
