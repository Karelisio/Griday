import { describe, expect, it } from 'vitest';
import { rngFromString } from '../core/prng';
import { countBinairoSolutions, solveBinairoExact } from './exact';
import { isBinairoSolution } from './rules';
import { randomBinairoPuzzle, randomBinairoSolution, randomUniqueBinairo, validLineMasks } from './testing';
import type { BinairoCell } from './types';

describe('validLineMasks', () => {
  it('n/2 bits à 1, aucun triplet, croissants', () => {
    for (const n of [2, 4, 6, 8, 10]) {
      const masks = validLineMasks(n);
      expect([...masks].sort((a, b) => a - b)).toEqual(masks);
      for (const m of masks) {
        const bits = Array.from({ length: n }, (_, i) => (m >> i) & 1);
        expect(bits.filter((b) => b === 1)).toHaveLength(n / 2);
        expect(bits.some((b, i) => i >= 2 && b === bits[i - 1] && b === bits[i - 2])).toBe(false);
      }
    }
  });
});

describe('randomBinairoSolution', () => {
  it('grilles valides et déterministes, toutes tailles paires 2 à 16', () => {
    for (const n of [2, 4, 6, 8, 10, 12, 14, 16]) {
      for (let i = 0; i < (n >= 14 ? 2 : 10); i++) {
        const s = randomBinairoSolution(rngFromString(`sol:${n}:${i}`), n);
        expect(isBinairoSolution({ size: n, givens: new Array<BinairoCell>(n * n).fill(0) }, s), `n=${n}`).toBe(true);
        expect(randomBinairoSolution(rngFromString(`sol:${n}:${i}`), n)).toEqual(s);
      }
    }
  });

  it('variété : 30 tirages 6×6 distincts', () => {
    const rng = rngFromString('sol:variety');
    expect(new Set(Array.from({ length: 30 }, () => randomBinairoSolution(rng, 6).join(''))).size).toBeGreaterThan(25);
  });

  it('taille invalide → RangeError', () => {
    for (const n of [0, 3, 18]) expect(() => randomBinairoSolution(rngFromString('x'), n)).toThrow(RangeError);
  });
});

describe('randomBinairoPuzzle', () => {
  it('données = sous-ensemble de la solution', () => {
    const rng = rngFromString('puzzle');
    for (let i = 0; i < 20; i++) {
      const p = randomBinairoPuzzle(rng, 8, 1, 3);
      expect(p.givens.every((v, k) => v === 0 || v === p.solution[k])).toBe(true);
      expect(isBinairoSolution(p, p.solution)).toBe(true);
    }
  });
});

describe('randomUniqueBinairo', () => {
  it('solution unique (prouvée) et minimale, déterministe', () => {
    for (const n of [4, 6, 8, 10]) {
      for (let i = 0; i < 3; i++) {
        const seed = `unique:${n}:${i}`;
        const p = randomUniqueBinairo(rngFromString(seed), n);
        expect(isBinairoSolution(p, p.solution)).toBe(true);
        expect(solveBinairoExact(p, 2).solutions).toEqual([p.solution]);
        // Minimalité : chaque donnée est nécessaire.
        p.givens.forEach((v, k) => {
          if (v === 0) return;
          const givens = [...p.givens];
          givens[k] = 0;
          expect(countBinairoSolutions({ size: n, givens }, 2), `${seed} case ${k}`).toBe(2);
        });
        expect(randomUniqueBinairo(rngFromString(seed), n)).toEqual(p);
      }
    }
  });

  it('keep : arrêt du retrait sous le seuil (grilles plus remplies)', () => {
    const p = randomUniqueBinairo(rngFromString('unique:keep'), 8, 0.6);
    expect(p.givens.filter((v) => v !== 0).length).toBeGreaterThanOrEqual(Math.floor(0.6 * 64));
    expect(countBinairoSolutions(p, 2)).toBe(1);
  });
});
