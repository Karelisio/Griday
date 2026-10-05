import { describe, expect, it } from 'vitest';
import { rngFromString, Sfc32 } from '../../core/prng';
import { DIFFICULTY_TIERS, type DifficultyTier } from '../../core/types';
import { countBinairoSolutions, solveBinairoExact } from '../exact';
import { isBinairoSolution } from '../rules';
import type { BinairoCell, BinairoSolvedPuzzle } from '../types';
import { generateBinairoCandidate, LEVEL_BY_TIER, randomBinairoGrid } from './generator';
import { BINAIRO_TECHNIQUES_V1, createBinairoChecker, rateBinairo, restrictBinairoProfile } from './solver';

/** Validité naïve d'une grille pleine (indépendante du moteur). */
function naiveValid(n: number, g: readonly number[]): boolean {
  for (const column of [false, true]) {
    const keys = new Set<string>();
    for (let i = 0; i < n; i++) {
      const L = Array.from({ length: n }, (_, k) => g[column ? k * n + i : i * n + k]!);
      if (L.some((v) => v !== 1 && v !== 2) || L.filter((v) => v === 1).length !== n / 2) return false;
      if (L.some((v, k) => k >= 2 && v === L[k - 1] && v === L[k - 2])) return false;
      keys.add(L.join(''));
    }
    if (keys.size !== n) return false;
  }
  return true;
}

/** Rangées (bit c à 1 ⇔ A en colonne c) → cases 1/2. */
const gridCells = (rows: Int32Array, n: number): number[] => Array.from({ length: n * n }, (_, i) => ((rows[Math.floor(i / n)]! >>> i % n) & 1 ? 1 : 2));

/** Toutes les garanties de sortie, vérifiées avec les outils indépendants du générateur. */
function expectValid(p: BinairoSolvedPuzzle, n: number, tier: DifficultyTier): void {
  expect(p.size).toBe(n);
  expect(p.givens).toHaveLength(n * n);
  expect(p.solution).toHaveLength(n * n);
  expect(naiveValid(n, p.solution)).toBe(true);
  expect(isBinairoSolution(p, p.solution)).toBe(true);
  expect(p.givens.every((v, i) => v === 0 || v === p.solution[i])).toBe(true);
  // Unicité prouvée par l'oracle exact (le générateur ne l'utilise pas : elle découle de la logique).
  const res = solveBinairoExact(p, 2);
  expect(res.complete).toBe(true);
  expect(res.count).toBe(1);
  expect(res.solutions[0]).toEqual([...p.solution]);
  // Palier exact, résoluble par logique pure.
  const rating = rateBinairo(p);
  expect(rating.solvable).toBe(true);
  expect(rating.tier).toBe(tier);
  expect(rating.maxLevel).toBe(tier === 1 ? Math.min(rating.maxLevel, LEVEL_BY_TIER[1]) : LEVEL_BY_TIER[tier]);
}

describe('LEVEL_BY_TIER', () => {
  it('figé : 3 (comptage), 4 (ligne), 5 (unicité), 6 (contradiction)', () => {
    expect(LEVEL_BY_TIER).toEqual({ 1: 3, 2: 4, 3: 5, 4: 6 });
    expect(Object.isFrozen(LEVEL_BY_TIER)).toBe(true);
    // Cohérent avec les paliers du profil V1.
    for (const tier of DIFFICULTY_TIERS) expect(BINAIRO_TECHNIQUES_V1.tierByLevel[LEVEL_BY_TIER[tier]]).toBe(tier);
  });
});

describe('randomBinairoGrid', () => {
  it('grilles valides (règles 1 à 3) ou null, toutes tailles 4 à 14', () => {
    for (let n = 4; n <= 14; n += 2) {
      let ok = 0;
      for (let i = 0; i < 20; i++) {
        const rows = randomBinairoGrid(rngFromString(`grid:${n}:${i}`), n);
        if (!rows) continue;
        ok++;
        expect(rows).toHaveLength(n);
        expect(naiveValid(n, gridCells(rows, n)), `n=${n} #${i}`).toBe(true);
      }
      // Budget de nœuds : succès mesurés 100 % jusqu'à 10, ≈ 75 % à 12, ≈ 40 % à 14.
      expect(ok, `n=${n}`).toBeGreaterThanOrEqual(n <= 10 ? 18 : n === 12 ? 8 : 3);
    }
  });

  it('même graine ⇒ même grille et même consommation du générateur aléatoire', () => {
    for (const n of [6, 10, 14]) {
      for (let i = 0; i < 5; i++) {
        const a = rngFromString(`grid-det:${n}:${i}`);
        const b = rngFromString(`grid-det:${n}:${i}`);
        expect(randomBinairoGrid(b, n)).toEqual(randomBinairoGrid(a, n));
        expect(b.nextU32()).toBe(a.nextU32());
      }
    }
  });

  it('variété : grilles 8×8 distinctes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 30; i++) codes.add(gridCells(randomBinairoGrid(rngFromString(`grid-var:${i}`), 8)!, 8).join(''));
    expect(codes.size).toBe(30);
  });

  it('taille invalide ⇒ RangeError', () => {
    for (const n of [0, 2, 3, 5, 16, 7.5, Number.NaN]) expect(() => randomBinairoGrid(rngFromString('x'), n), String(n)).toThrow(RangeError);
  });
});

describe('generateBinairoCandidate — validité', () => {
  for (const tier of DIFFICULTY_TIERS) {
    it(`palier ${tier} : grilles valides, uniques, palier exact (4×4 à 12×12)`, () => {
      for (let n = 4; n <= 12; n += 2) {
        let ok = 0;
        for (let i = 0; i < 16; i++) {
          const p = generateBinairoCandidate(rngFromString(`test:valid:${tier}:${n}:${i}`), n, tier);
          if (!p) continue;
          ok++;
          expectValid(p, n, tier);
        }
        // Au moins un succès dans les tailles du plan hebdomadaire (graines fixes, aucun aléa).
        if (n >= 6 && n <= 10 && tier <= 3) expect(ok, `${n}/${tier}`).toBeGreaterThan(0);
      }
    });
  }

  it('14×14 : résultat valide ou null, jamais d’exception', () => {
    let ok = 0;
    for (const tier of DIFFICULTY_TIERS) {
      for (let i = 0; i < 4; i++) {
        const p = generateBinairoCandidate(rngFromString(`test:edge:14:${tier}:${i}`), 14, tier);
        if (!p) continue;
        ok++;
        expectValid(p, 14, tier);
      }
    }
    expect(ok).toBeGreaterThan(0);
  });

  it('données minimales pour le palier : retirer n’importe quelle donnée casse la résolution à ce niveau', () => {
    let checked = 0;
    for (const tier of DIFFICULTY_TIERS) {
      for (const n of [6, 8, 10]) {
        for (let i = 0; i < 4; i++) {
          const p = generateBinairoCandidate(rngFromString(`test:minimal:${tier}:${n}:${i}`), n, tier);
          if (!p) continue;
          const checker = createBinairoChecker(n);
          const level = LEVEL_BY_TIER[tier];
          expect(checker.solves(p.givens, level)).toBe(true);
          if (tier > 1) expect(checker.solves(p.givens, LEVEL_BY_TIER[(tier - 1) as DifficultyTier])).toBe(false);
          p.givens.forEach((v, k) => {
            if (v === 0) return;
            const reduced = [...p.givens];
            reduced[k] = 0;
            expect(checker.solves(reduced, level), `${n}/${tier} #${i} case ${k}`).toBe(false);
            // Cohérent avec la notation pas à pas.
            if (k % 7 === 0) expect(rateBinairo({ size: n, givens: reduced as BinairoCell[] }, restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, level)).solvable).toBe(false);
          });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('balayage : 400 candidats (tailles du plan et illimité) uniques selon l’oracle exact', () => {
    let ok = 0;
    for (let i = 0; i < 400; i++) {
      const n = [6, 8, 10, 12][i % 4]!;
      const tier = DIFFICULTY_TIERS[Math.floor(i / 4) % 4]!;
      const p = generateBinairoCandidate(rngFromString(`test:sweep:${i}`), n, tier);
      if (!p) continue;
      ok++;
      expect(countBinairoSolutions(p, 2), `#${i}`).toBe(1);
      expect(rateBinairo(p).tier, `#${i}`).toBe(tier);
    }
    expect(ok).toBeGreaterThan(200);
  });
});

describe('generateBinairoCandidate — déterminisme', () => {
  it('même graine ⇒ même grille et même consommation du générateur aléatoire', () => {
    for (const tier of DIFFICULTY_TIERS) {
      for (const n of [6, 10]) {
        const a = rngFromString(`test:det:${tier}:${n}`);
        const b = rngFromString(`test:det:${tier}:${n}`);
        const pa = generateBinairoCandidate(a, n, tier);
        const pb = generateBinairoCandidate(b, n, tier);
        expect(pb).toEqual(pa);
        expect(b.nextU32()).toBe(a.nextU32());
      }
    }
  });

  it('ne dépend que de l’état du Rng (Sfc32 construit directement)', () => {
    const seed = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x12345678] as const;
    expect(generateBinairoCandidate(new Sfc32(seed), 8, 3)).toEqual(generateBinairoCandidate(new Sfc32(seed), 8, 3));
  });

  it('graines différentes ⇒ grilles variées', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const p = generateBinairoCandidate(rngFromString(`test:variety:${i}`), 8, 2);
      if (p) codes.add(p.givens.join(''));
    }
    expect(codes.size).toBeGreaterThanOrEqual(10);
  });

  it('taille invalide ⇒ RangeError', () => {
    for (const n of [2, 3, 16, 7.5]) expect(() => generateBinairoCandidate(rngFromString('x'), n, 1), String(n)).toThrow(RangeError);
  });
});

describe('performance (bornes larges)', () => {
  it('tentative 10×10 : moyenne < 30 ms, pire < 300 ms (tous paliers)', () => {
    for (let i = 0; i < 5; i++) generateBinairoCandidate(rngFromString(`test:warm:${i}`), 10, 4);
    let total = 0;
    let worst = 0;
    const calls = 80;
    for (let i = 0; i < calls; i++) {
      const t0 = performance.now();
      generateBinairoCandidate(rngFromString(`test:perf:${i}`), 10, DIFFICULTY_TIERS[i % 4]!);
      const dt = performance.now() - t0;
      total += dt;
      worst = Math.max(worst, dt);
    }
    expect(total / calls).toBeLessThan(30);
    expect(worst).toBeLessThan(300);
  });
});
