import { describe, expect, it } from 'vitest';
import { rngFromString } from '../core/prng';
import { countBinairoSolutions } from './exact';
import { BINAIRO_DEFINITION, verifyBinairo } from './index';
import { randomBinairoSolution, randomUniqueBinairo } from './testing';
import type { BinairoCell, BinairoSolvedPuzzle } from './types';
import { BINAIRO_V1 } from './v1/version';

// Grilles minimales à solution unique (chaque donnée est nécessaire), prouvées par l'oracle exact.
const UNIQUE: BinairoSolvedPuzzle[] = [6, 8, 10, 12].map((n) => randomUniqueBinairo(rngFromString(`verify:${n}`), n));

describe('verifyBinairo (vérification indépendante du générateur)', () => {
  it('grille valide à solution unique → aucune erreur', () => {
    for (const p of UNIQUE) {
      expect(countBinairoSolutions(p, 2)).toBe(1);
      expect(verifyBinairo(p)).toEqual([]);
      expect(BINAIRO_DEFINITION.verify(p)).toEqual([]);
      expect(BINAIRO_DEFINITION.sizeOf(p)).toBe(p.size);
    }
  });

  it('grille pleine (toutes les cases données) → valide', () => {
    const sol = randomBinairoSolution(rngFromString('verify:full'), 8);
    expect(verifyBinairo({ size: 8, givens: sol, solution: sol })).toEqual([]);
  });

  it('une donnée retirée d’une grille minimale → plusieurs solutions', () => {
    for (const p of UNIQUE) {
      const i = p.givens.findIndex((v) => v !== 0);
      const givens = [...p.givens];
      givens[i] = 0;
      expect(verifyBinairo({ ...p, givens })).toEqual(['2 solutions']);
    }
    expect(verifyBinairo({ size: 6, givens: new Array<BinairoCell>(36).fill(0), solution: UNIQUE[0]!.solution })).toEqual(['2 solutions']);
  });

  it('solution fournie invalide ou contraire aux données → erreur', () => {
    const p = UNIQUE[1]!;
    const flipped = p.solution.map((v, i) => (i === 0 ? 3 - v : v)) as (1 | 2)[];
    expect(verifyBinairo({ ...p, solution: flipped })).toEqual(['solution fournie invalide']);
    expect(verifyBinairo({ ...p, solution: p.solution.slice(1) })).toEqual(['solution fournie invalide']);
    expect(verifyBinairo({ ...p, solution: p.solution.map((v, i) => (i === 3 ? 0 : v)) as (1 | 2)[] })).toEqual(['solution fournie invalide']);
    // Autre grille valide (transposée), contraire aux données.
    const n = p.size;
    const transposed = p.solution.map((_, i) => p.solution[(i % n) * n + Math.floor(i / n)]!);
    if (transposed.join('') !== p.solution.join('')) expect(verifyBinairo({ ...p, solution: transposed })).toEqual(['solution fournie invalide']);
  });

  it('données contradictoires → solution fournie invalide', () => {
    const p = UNIQUE[0]!;
    const givens = [...p.givens];
    givens[0] = givens[1] = givens[2] = 1; // triplet
    expect(verifyBinairo({ ...p, givens })).toEqual(['solution fournie invalide']);
  });

  it('structure invalide → erreurs de structure', () => {
    const p = UNIQUE[0]!;
    expect(verifyBinairo({ ...p, size: 7 })).toEqual(['taille impaire : 7']);
    expect(verifyBinairo({ ...p, givens: p.givens.slice(1) })).toEqual(['longueur 35 ≠ 36']);
    expect(verifyBinairo({ ...p, givens: p.givens.map((v, i) => (i === 4 ? 5 : v)) as BinairoCell[] })).toEqual(['case 4 invalide : 5']);
    expect(verifyBinairo({ size: 16, givens: [], solution: [] })).toEqual(['taille hors limites : 16']);
  });

  it('budget de recherche épuisé → unicité non établie (échec par défaut)', () => {
    expect(verifyBinairo(UNIQUE[2]!, 0)).toEqual(['unicité non établie (budget de recherche épuisé)']);
  });

  it('≡ force brute sur des grilles 4×4 aléatoires : valide ⇔ exactement une solution, égale à celle fournie', () => {
    // Les 72 grilles 4×4 valides, énumérées naïvement (2^16 remplissages).
    const all: number[][] = [];
    for (let m = 0; m < 1 << 16; m++) {
      const g = Array.from({ length: 16 }, (_, i) => ((m >> i) & 1 ? 2 : 1));
      const lines = [0, 1, 2, 3].flatMap((i) => [[0, 1, 2, 3].map((k) => g[i * 4 + k]!), [0, 1, 2, 3].map((k) => g[k * 4 + i]!)]);
      const ok = lines.every((L) => L.filter((v) => v === 1).length === 2 && !L.some((v, k) => k >= 2 && v === L[k - 1] && v === L[k - 2]));
      const distinct = (col: boolean) => new Set([0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((k) => g[col ? k * 4 + i : i * 4 + k]).join(''))).size === 4;
      if (ok && distinct(false) && distinct(true)) all.push(g);
    }
    expect(all).toHaveLength(72);
    const rng = rngFromString('verify:brute');
    let unique = 0;
    for (let i = 0; i < 300; i++) {
      const sol = all[rng.int(72)]!;
      const givens = sol.map((v) => (rng.chance(1 + rng.int(3), 6) ? v : 0)) as BinairoCell[];
      const matching = all.filter((g) => givens.every((v, k) => v === 0 || v === g[k]));
      const res = verifyBinairo({ size: 4, givens, solution: sol as (1 | 2)[] });
      if (matching.length === 1) {
        unique++;
        expect(res).toEqual([]);
      } else expect(res).toEqual([`${Math.min(matching.length, 2)} solutions`]);
    }
    expect(unique).toBeGreaterThan(30);
  });

  it('définition : identifiant, versions, encodage', () => {
    expect(BINAIRO_DEFINITION.id).toBe('binairo');
    expect(BINAIRO_DEFINITION.versions[1]).toBe(BINAIRO_V1);
    expect(Object.isFrozen(BINAIRO_DEFINITION)).toBe(true);
    const p = UNIQUE[0]!;
    expect(BINAIRO_DEFINITION.encode(p)).toBe(`${p.givens.join('')}/${p.solution.join('')}`);
  });
});
