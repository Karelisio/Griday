import { describe, expect, it } from 'vitest';
import { hashHex, rngFromString, Sfc32 } from '../core/prng';
import { DIFFICULTY_TIERS } from '../core/types';
import { encodeQueens, validateQueensStructure } from './encoding';
import { solveQueensExact } from './exact';
import {
  generateQueensCandidate,
  QUEENS_SHAPE_PRESETS,
  recommendedQueensPreset,
  type QueensShapeParams,
} from './generator';
import { isQueensSolution } from './rules';
import type { QueensSolvedPuzzle } from './types';

const PRESETS = Object.keys(QUEENS_SHAPE_PRESETS);

function gen(seed: string, n: number, preset: string): QueensSolvedPuzzle | null {
  return generateQueensCandidate(rngFromString(seed), n, QUEENS_SHAPE_PRESETS[preset]!);
}

function regionSizes(p: QueensSolvedPuzzle): number[] {
  const sizes = new Array<number>(p.size).fill(0);
  for (const g of p.regions) sizes[g]!++;
  return sizes;
}

/** Toutes les garanties de sortie, vérifiées avec les outils indépendants du générateur. */
function expectValid(p: QueensSolvedPuzzle, n: number, shape: QueensShapeParams): void {
  expect(p.size).toBe(n);
  expect(validateQueensStructure(p)).toEqual([]);
  expect(isQueensSolution(p, p.solution)).toBe(true);
  const res = solveQueensExact(p, 2);
  expect(res.complete).toBe(true);
  expect(res.count).toBe(1);
  expect(res.solutions[0]).toEqual([...p.solution]);
  // Tailles : régions d'une case = reines données (nombre tiré dans singleRegions), autres ≥ minSize.
  const sizes = regionSizes(p);
  const singles = sizes.filter((s) => s === 1).length;
  if (shape.minSize >= 2) {
    expect(singles).toBeGreaterThanOrEqual(Math.min(shape.singleRegions[0], n - 1));
    expect(singles).toBeLessThanOrEqual(shape.singleRegions[1]);
    for (const s of sizes) if (s !== 1) expect(s).toBeGreaterThanOrEqual(shape.minSize);
  }
}

describe('generateQueensCandidate — validité', () => {
  for (const preset of PRESETS) {
    it(`préréglage ${preset} : grilles valides, uniques et canoniques (5×5 à 10×10)`, () => {
      const shape = QUEENS_SHAPE_PRESETS[preset]!;
      for (let n = 5; n <= 10; n++) {
        let ok = 0;
        for (let i = 0; i < 16; i++) {
          const p = gen(`test:valid:${preset}:${n}:${i}`, n, preset);
          if (!p) continue;
          ok++;
          expectValid(p, n, shape);
        }
        // Taux de succès mesurés ≥ 60 % : au moins 4 succès sur 16 (graines fixes, aucun aléa).
        expect(ok).toBeGreaterThanOrEqual(4);
      }
    });
  }

  it('tailles extrêmes 4, 11 et 12 : résultat valide ou null, jamais d’exception', () => {
    for (const n of [4, 11, 12]) {
      let ok = 0;
      for (let i = 0; i < 6; i++) {
        const p = gen(`test:edge:${n}:${i}`, n, 'medium');
        if (!p) continue;
        ok++;
        expectValid(p, n, QUEENS_SHAPE_PRESETS.medium!);
      }
      if (n > 4) expect(ok).toBeGreaterThan(0);
    }
  });

  it('forme personnalisée sans contrainte (minSize 1) : toujours valide', () => {
    const free: QueensShapeParams = {
      singleRegions: [0, 0],
      minSize: 1,
      maxSizePct: 1000,
      smallRegions: [0, 0],
      smallMaxSize: 1,
      spreadPct: 0,
      neighborWeights: [1, 1, 1, 1],
      straightPct: 100,
      diagonalPct: 100,
    };
    for (let i = 0; i < 20; i++) {
      const p = generateQueensCandidate(rngFromString(`test:free:${i}`), 8, free);
      if (p) expectValid(p, 8, free);
    }
  });
});

describe('generateQueensCandidate — déterminisme', () => {
  it('même graine ⇒ même grille et même consommation du générateur aléatoire', () => {
    for (const preset of PRESETS) {
      for (const n of [6, 9]) {
        const a = rngFromString(`test:det:${preset}:${n}`);
        const b = rngFromString(`test:det:${preset}:${n}`);
        const pa = generateQueensCandidate(a, n, QUEENS_SHAPE_PRESETS[preset]!);
        const pb = generateQueensCandidate(b, n, QUEENS_SHAPE_PRESETS[preset]!);
        expect(pb).toEqual(pa);
        expect(b.nextU32()).toBe(a.nextU32());
      }
    }
  });

  it('ne dépend que de l’état du Rng (Sfc32 construit directement)', () => {
    const seed = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x12345678] as const;
    const p1 = generateQueensCandidate(new Sfc32(seed), 8, QUEENS_SHAPE_PRESETS.hard!);
    const p2 = generateQueensCandidate(new Sfc32(seed), 8, QUEENS_SHAPE_PRESETS.hard!);
    expect(p2).toEqual(p1);
  });

  it('graines différentes ⇒ grilles variées', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const p = gen(`test:variety:${i}`, 8, 'medium');
      if (p) codes.add(encodeQueens(p));
    }
    expect(codes.size).toBeGreaterThanOrEqual(10);
  });

  // GEL V1 : ces grilles ne doivent JAMAIS changer (puzzles publiés). Un échec ici = régression.
  it('encodages « golden » (gel de la V1)', () => {
    const golden: readonly [string, number, string, string, string][] = [
      // [graine, taille, préréglage, encodeQueens, solution]
      ['griday:golden:queens:1', 6, 'easy', '000001200001000001333344355343333333', '5,0,2,4,1,3'],
      [
        'griday:golden:queens:2',
        8,
        'hard',
        '0001123300012233101114441111111455515566555556667766566677766666',
        '6,4,1,7,3,0,5,2',
      ],
      [
        'griday:golden:queens:3',
        10,
        'expert',
        '0011222222000122122300411112230444551233066457723306555772338885777222888599777988859999998885999999',
        '0,9,5,3,1,4,8,6,2,7',
      ],
    ];
    for (const [seed, n, preset, code, solution] of golden) {
      const p = gen(seed, n, preset);
      expect(p, seed).not.toBeNull();
      expect(encodeQueens(p!), seed).toBe(code);
      expect(p!.solution.join(','), seed).toBe(solution);
    }
  });
});

describe('generateQueensCandidate — empreinte (gel de la V1)', () => {
  // 40 tentatives (5×5 à 10×10, tous préréglages, échecs compris) : toute modification du
  // comportement — réparations, secousses, équilibrage, échecs — change cette empreinte.
  it('empreinte de 40 tentatives', () => {
    const presets = Object.keys(QUEENS_SHAPE_PRESETS);
    let acc = '';
    let nulls = 0;
    for (let i = 0; i < 40; i++) {
      const n = 5 + (i % 6);
      const p = gen(`griday:fingerprint:queens:${i}`, n, presets[i % presets.length]!);
      if (!p) nulls++;
      acc += p ? `${encodeQueens(p)}/${p.solution.join(',')};` : 'null;';
    }
    expect(nulls).toBe(6);
    expect(hashHex(acc)).toBe('30817d3f302564b7204c6c30c9019b21');
  });
});

describe('generateQueensCandidate — échecs et arguments', () => {
  it('budget épuisé ⇒ null (jamais une grille invalide ni une exception)', () => {
    let nulls = 0;
    for (let i = 0; i < 40; i++) {
      const p = gen(`test:null:${i}`, 10, 'hard');
      if (p === null) nulls++;
      else expectValid(p, 10, QUEENS_SHAPE_PRESETS.hard!);
    }
    // Succès mesuré ≈ 80 % à 10×10 : des échecs existent et sont bien rendus comme null.
    expect(nulls).toBeGreaterThan(0);
    expect(nulls).toBeLessThan(40);
  });

  it('taille ou réglages invalides ⇒ RangeError', () => {
    const rng = rngFromString('test:args');
    const shape = QUEENS_SHAPE_PRESETS.medium!;
    expect(() => generateQueensCandidate(rng, 3, shape)).toThrow(RangeError);
    expect(() => generateQueensCandidate(rng, 13, shape)).toThrow(RangeError);
    expect(() => generateQueensCandidate(rng, 7.5, shape)).toThrow(RangeError);
    const bad: Partial<QueensShapeParams>[] = [
      { minSize: 0 },
      { maxSizePct: 50 },
      { smallRegions: [3, 1] },
      { singleRegions: [2, 1] },
      { smallMaxSize: 1 },
      { spreadPct: 95 },
      { neighborWeights: [0, 1, 1, 1] },
      { straightPct: 5 },
      { diagonalPct: 1.5 },
    ];
    for (const b of bad) {
      expect(() => generateQueensCandidate(rng, 8, { ...shape, ...b }), JSON.stringify(b)).toThrow(RangeError);
    }
  });

  it('préréglages figés (objets gelés)', () => {
    expect(Object.isFrozen(QUEENS_SHAPE_PRESETS)).toBe(true);
    for (const p of Object.values(QUEENS_SHAPE_PRESETS)) {
      expect(Object.isFrozen(p)).toBe(true);
      expect(Object.isFrozen(p.neighborWeights)).toBe(true);
    }
  });
});

describe('préréglages — effet mesurable des réglages', () => {
  interface Agg {
    readonly singles: number;
    readonly small: number;
    readonly maxSize: number;
    readonly perimeter: number;
    readonly blocks: number;
    readonly count: number;
  }
  function aggregate(shape: QueensShapeParams, n: number, tag: string, samples = 30): Agg {
    let singles = 0;
    let small = 0;
    let maxSize = 0;
    let perimeter = 0;
    let blocks = 0;
    let count = 0;
    for (let i = 0; i < samples; i++) {
      const p = generateQueensCandidate(rngFromString(`test:knobs:${tag}:${i}`), n, shape);
      if (!p) continue;
      count++;
      const sizes = regionSizes(p);
      singles += sizes.filter((s) => s === 1).length;
      small += sizes.filter((s) => s <= 3).length;
      maxSize += Math.max(...sizes);
      // Arêtes entre deux régions différentes (formes sinueuses ⇒ plus de frontières).
      // Blocs 2×2 d'une même région (formes compactes ⇒ plus de blocs).
      for (let x = 0; x < n * n; x++) {
        const g = p.regions[x];
        if (x % n < n - 1 && g !== p.regions[x + 1]) perimeter++;
        if (x + n < n * n && g !== p.regions[x + n]) perimeter++;
        if (x % n < n - 1 && x + n < n * n && g === p.regions[x + 1] && g === p.regions[x + n] && g === p.regions[x + n + 1]) {
          blocks++;
        }
      }
    }
    return {
      singles: singles / count,
      small: small / count,
      maxSize: maxSize / count,
      perimeter: perimeter / count,
      blocks: blocks / count,
      count,
    };
  }

  it('reines données : beginner 2, easy et medium 1, hard et expert 0', () => {
    expect(aggregate(QUEENS_SHAPE_PRESETS.beginner!, 8, 'b').singles).toBe(2);
    expect(aggregate(QUEENS_SHAPE_PRESETS.easy!, 8, 'e').singles).toBe(1);
    expect(aggregate(QUEENS_SHAPE_PRESETS.medium!, 8, 'm').singles).toBe(1);
    expect(aggregate(QUEENS_SHAPE_PRESETS.hard!, 8, 'h').singles).toBe(0);
    expect(aggregate(QUEENS_SHAPE_PRESETS.expert!, 8, 'x').singles).toBe(0);
  });

  it('petites régions et taille maximale : easy ≫ expert', () => {
    const easy = aggregate(QUEENS_SHAPE_PRESETS.easy!, 9, 'e9');
    const expert = aggregate(QUEENS_SHAPE_PRESETS.expert!, 9, 'x9');
    expect(easy.small).toBeGreaterThan(expert.small + 2);
    expect(easy.maxSize).toBeGreaterThan(expert.maxSize);
  });

  it('maxSizePct borne la taille des régions (souple, mais nettement efficace)', () => {
    const base = QUEENS_SHAPE_PRESETS.expert!;
    const tight = aggregate({ ...base, maxSizePct: 130 }, 9, 'tight');
    const loose = aggregate({ ...base, maxSizePct: 400, spreadPct: 80 }, 9, 'loose');
    expect(tight.maxSize).toBeLessThan(loose.maxSize);
  });

  it('neighborWeights : compact ⇒ plus de blocs 2×2 et moins de frontières que sinueux', () => {
    // Effet réel mais modéré : l'unicité, les poches et l'équilibrage façonnent aussi les régions.
    const base = QUEENS_SHAPE_PRESETS.expert!;
    const compact = aggregate({ ...base, neighborWeights: [1, 20, 100, 200], diagonalPct: 200 }, 9, 'cmp');
    const sinuous = aggregate({ ...base, neighborWeights: [100, 10, 2, 1], diagonalPct: 20 }, 9, 'sin');
    expect(compact.blocks).toBeGreaterThan(sinuous.blocks + 1);
    expect(compact.perimeter).toBeLessThan(sinuous.perimeter);
  });

  it('recommendedQueensPreset : un préréglage existant pour chaque (taille, palier)', () => {
    for (let n = 4; n <= 12; n++) {
      for (const tier of DIFFICULTY_TIERS) expect(PRESETS).toContain(recommendedQueensPreset(n, tier));
    }
  });
});

describe('performance (bornes larges)', () => {
  it('10×10 expert : moyenne < 40 ms par tentative', () => {
    const t0 = performance.now();
    const calls = 40;
    for (let i = 0; i < calls; i++) gen(`test:perf:${i}`, 10, 'expert');
    expect((performance.now() - t0) / calls).toBeLessThan(40);
  });
});
