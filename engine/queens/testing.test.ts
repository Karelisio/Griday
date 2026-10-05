import { describe, expect, it, vi } from 'vitest';
import { rngFromString } from '../core/prng';
import { validateQueensStructure } from './encoding';
import { countQueensSolutions, solveQueensExact } from './exact';
import { isQueensSolution } from './rules';
import { randomQueensLayout, randomQueensSolution, randomUniqueQueens } from './testing';

// Solveur réel enveloppé dans un espion : permet de simuler un résultat non concluant.
vi.mock('./exact', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./exact')>();
  return { ...actual, solveQueensExact: vi.fn(actual.solveQueensExact) };
});

const isPermutation = (cols: readonly number[], n: number): boolean =>
  cols.length === n && [...cols].sort((a, b) => a - b).every((c, i) => c === i);

describe('randomQueensSolution', () => {
  it('permutation sans contact entre lignes consécutives, déterministe', () => {
    for (const n of [1, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      for (let i = 0; i < 20; i++) {
        const cols = randomQueensSolution(rngFromString(`sol:${n}:${i}`), n);
        expect(isPermutation(cols, n), `n=${n}`).toBe(true);
        expect(cols.every((c, r) => r === 0 || Math.abs(c - cols[r - 1]!) >= 2)).toBe(true);
        expect(randomQueensSolution(rngFromString(`sol:${n}:${i}`), n)).toEqual(cols);
      }
    }
  });

  it('n = 2 ou 3 : aucune solution → erreur', () => {
    expect(() => randomQueensSolution(rngFromString('x'), 2)).toThrow(/n=2/);
    expect(() => randomQueensSolution(rngFromString('x'), 3)).toThrow(/n=3/);
  });
});

describe('randomQueensLayout', () => {
  it('structure valide, une reine par région, solution valide, déterministe', () => {
    for (let n = 4; n <= 12; n++) {
      for (let i = 0; i < 10; i++) {
        const p = randomQueensLayout(rngFromString(`layout:${n}:${i}`), n);
        expect(validateQueensStructure(p), `n=${n} #${i}`).toEqual([]);
        expect(isQueensSolution(p, p.solution)).toBe(true);
        const queenRegions = p.solution.map((c, r) => p.regions[r * n + c]);
        expect(new Set(queenRegions).size).toBe(n);
        expect(randomQueensLayout(rngFromString(`layout:${n}:${i}`), n)).toEqual(p);
      }
    }
  });
});

describe('randomUniqueQueens', () => {
  it('grilles valides à solution unique (prouvée), déterministes', () => {
    const cases: [number, number][] = [
      [4, 3],
      [5, 3],
      [6, 3],
      [7, 3],
      [8, 3],
      [9, 2],
      [10, 2],
      [11, 1],
      [12, 1],
    ];
    for (const [n, count] of cases) {
      for (let i = 0; i < count; i++) {
        const seed = `unique:${n}:${i}`;
        const p = randomUniqueQueens(rngFromString(seed), n);
        expect(p, seed).not.toBeNull();
        expect(validateQueensStructure(p!)).toEqual([]);
        expect(isQueensSolution(p!, p!.solution)).toBe(true);
        expect(countQueensSolutions(p!, 2, 1e7)).toBe(1);
        expect(solveQueensExact(p!, 2).solutions).toEqual([p!.solution]);
        if (n <= 8) expect(randomUniqueQueens(rngFromString(seed), n)).toEqual(p);
      }
    }
  });

  it('un résultat non concluant (budget épuisé) n’est jamais pris pour une unicité', () => {
    const spy = vi.mocked(solveQueensExact);
    spy.mockClear();
    spy.mockReturnValueOnce({ count: 1, solutions: [], nodes: 1_000_001, complete: false });
    expect(randomUniqueQueens(rngFromString('non-concluant'), 6, 1)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
