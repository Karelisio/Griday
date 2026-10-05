import { describe, expect, it } from 'vitest';
import { hashHex, rngFromString, type Rng } from '../core/prng';
import { decodeQueens } from './encoding';
import { countQueensSolutions, popcount32, solveQueensExact } from './exact';
import { randomQueensLayout, randomQueensSolution } from './testing';
import type { QueensPuzzle } from './types';

/** Validité d'une permutation, vérifiée naïvement (indépendante de rules.ts). */
function naiveValid(p: QueensPuzzle, cols: readonly number[]): boolean {
  const n = p.size;
  const regions = new Set<number>();
  for (let r = 0; r < n; r++) {
    if (r > 0 && Math.abs(cols[r]! - cols[r - 1]!) <= 1) return false;
    regions.add(p.regions[r * n + cols[r]!]!);
  }
  return regions.size === n;
}

/** Force brute : les n! permutations. */
function bruteForce(p: QueensPuzzle): number[][] {
  const n = p.size;
  const out: number[][] = [];
  const cols: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const rec = (): void => {
    if (cols.length === n) {
      if (naiveValid(p, cols)) out.push([...cols]);
      return;
    }
    for (let c = 0; c < n; c++) {
      if (used[c]) continue;
      used[c] = true;
      cols.push(c);
      rec();
      cols.pop();
      used[c] = false;
    }
  };
  rec();
  return out;
}

const sortedKeys = (sols: readonly (readonly number[])[]): string[] => sols.map((s) => s.join(',')).sort();
const freeze = (p: QueensPuzzle): QueensPuzzle => Object.freeze({ size: p.size, regions: Object.freeze([...p.regions]) });
/** Bandes verticales : région = colonne (canonique et connexe). */
const stripes = (n: number): QueensPuzzle => ({ size: n, regions: Array.from({ length: n * n }, (_, i) => i % n) });

type Labeling = (rng: Rng, n: number) => QueensPuzzle;
const LABELINGS: [string, Labeling][] = [
  // Étiquettes uniformes : régions non connexes, étiquettes souvent manquantes.
  ['uniforme', (rng, n) => ({ size: n, regions: Array.from({ length: n * n }, () => rng.int(n)) })],
  // n − 1 étiquettes : une région manque toujours → 0 solution.
  ['région manquante', (rng, n) => ({ size: n, regions: Array.from({ length: n * n }, () => rng.int(n - 1)) })],
  // Solution plantée puis bruit : ≥ 1 solution, régions non connexes.
  [
    'plantée + bruit',
    (rng, n) => {
      const sol = randomQueensSolution(rng, n);
      const regions = Array.from({ length: n * n }, () => rng.int(n));
      const labels = rng.shuffle(Array.from({ length: n }, (_, i) => i));
      sol.forEach((c, r) => (regions[r * n + c] = labels[r]!));
      return { size: n, regions };
    },
  ],
  // Bandes bruitées : souvent beaucoup de solutions.
  ['bandes bruitées', (rng, n) => ({ size: n, regions: Array.from({ length: n * n }, (_, i) => (rng.chance(1, 6) ? rng.int(n) : i % n)) })],
  // Disposition connexe (croissance depuis les reines).
  ['connexe', (rng, n) => randomQueensLayout(rng, n)],
];

describe('solveQueensExact ≡ force brute', () => {
  it.each([
    [4, 40],
    [5, 40],
    [6, 30],
    [7, 12],
    [8, 2],
  ])('n = %i (%i grilles par famille)', (n, perFamily) => {
    const rng = rngFromString(`exact-vs-brute:${n}`);
    const seen = { zero: 0, one: 0, many: 0 };
    for (const [family, make] of LABELINGS) {
      for (let i = 0; i < perFamily; i++) {
        const p = freeze(make(rng, n)); // gelé : le solveur ne doit pas muter l'entrée
        const label = `${family} #${i} ${p.regions.join('')}`;
        const brute = bruteForce(p);
        const all = solveQueensExact(p, Number.POSITIVE_INFINITY, 1e9);
        expect(all.complete, label).toBe(true);
        expect(all.count, label).toBe(brute.length);
        expect(all.solutions.length, label).toBe(all.count);
        expect(sortedKeys(all.solutions), label).toEqual(sortedKeys(brute));
        // `limit` : préfixe exact du parcours complet, plafonné.
        for (const limit of [1, 2, 3]) {
          const lim = solveQueensExact(p, limit);
          const expected = Math.min(limit, brute.length);
          expect(lim.count, `${label} limit=${limit}`).toBe(expected);
          expect(lim.complete).toBe(true);
          expect(lim.solutions).toEqual(all.solutions.slice(0, expected));
          expect(countQueensSolutions(p, limit)).toBe(expected);
        }
        if (brute.length === 0) seen.zero++;
        else if (brute.length === 1) seen.one++;
        else seen.many++;
      }
    }
    // Les trois régimes (0, 1, ≥ 2 solutions) sont exercés.
    expect(seen.zero).toBeGreaterThan(0);
    expect(seen.many).toBeGreaterThan(0);
    if (n <= 7) expect(seen.one).toBeGreaterThan(0);
  });

  // Oracle indépendant : bandes ⇒ seule la règle de contact compte → OEIS A002464.
  it.each([
    [4, 2],
    [5, 14],
    [6, 90],
    [7, 646],
    [8, 5242],
  ])('bandes %i×%i : %i solutions (OEIS A002464), en lignes comme en colonnes', (n, expected) => {
    expect(countQueensSolutions(stripes(n), Number.POSITIVE_INFINITY, 1e9)).toBe(expected);
    const rows = { size: n, regions: Array.from({ length: n * n }, (_, i) => Math.floor(i / n)) };
    expect(countQueensSolutions(rows, Number.POSITIVE_INFINITY, 1e9)).toBe(expected);
  });

  it('région vide → 0 solution dès la racine', () => {
    const p = { size: 5, regions: new Array<number>(25).fill(0) };
    expect(solveQueensExact(p, 2)).toEqual({ count: 0, solutions: [], nodes: 1, complete: true });
  });
});

describe('budget maxNodes', () => {
  const s8 = stripes(8);
  const full = solveQueensExact(s8, Number.POSITIVE_INFINITY, 1e9);

  it('épuisé → complete = false, count borne inférieure, countQueensSolutions = −1', () => {
    expect(full).toMatchObject({ count: 5242, nodes: 13_943, complete: true });
    // Coupé au dernier nœud : tout est trouvé mais rien n'est prouvé.
    const cut = solveQueensExact(s8, Number.POSITIVE_INFINITY, full.nodes - 1);
    expect(cut.complete).toBe(false);
    expect(cut.count).toBe(5242);
    expect(countQueensSolutions(s8, Number.POSITIVE_INFINITY, full.nodes - 1)).toBe(-1);
    expect(countQueensSolutions(s8, Number.POSITIVE_INFINITY, full.nodes)).toBe(5242);
  });

  it('nœuds = maxNodes + 1 à l’arrêt ; solutions = préfixe du parcours complet', () => {
    let prev = 0;
    for (const maxNodes of [0, 1, 5, 10, 50, 200, 1000, 5000]) {
      const r = solveQueensExact(s8, Number.POSITIVE_INFINITY, maxNodes);
      expect(r.complete, `maxNodes=${maxNodes}`).toBe(false);
      expect(r.nodes).toBe(maxNodes + 1);
      expect(r.solutions).toEqual(full.solutions.slice(0, r.count));
      expect(r.count).toBeGreaterThanOrEqual(prev);
      prev = r.count;
      expect(countQueensSolutions(s8, Number.POSITIVE_INFINITY, maxNodes)).toBe(-1);
    }
    expect(solveQueensExact(s8, 2, 0)).toEqual({ count: 0, solutions: [], nodes: 1, complete: false });
  });

  it('limite atteinte avant le budget → résultat concluant', () => {
    const r = solveQueensExact(s8, 2);
    expect(r).toMatchObject({ count: 2, nodes: 20, complete: true });
    expect(solveQueensExact(s8, 2, r.nodes)).toEqual(r);
    expect(countQueensSolutions(s8, 2, r.nodes)).toBe(2);
    expect(countQueensSolutions(s8, 2, r.nodes - 1)).toBe(-1);
  });
});

/*
 * EMPREINTE DE PARCOURS (gel conditionnel).
 * Ordre des solutions et nombre de nœuds sont déterministes. Si un générateur publié dépend de cet ordre
 * (solution « alternative » retenue) ou d'un budget maxNodes, modifier exact.ts change des puzzles
 * publiés : ne mettre à jour ces valeurs qu'en connaissance de cause.
 */
describe('empreinte de parcours (MRV, départage ligne < colonne < région, index croissant)', () => {
  const UNIQUE: [string, string, number, number[]][] = [
    ['5×5', '0001100012000123332234422', 7, [3, 1, 4, 0, 2]],
    ['8×8', '0000111100223111222241415222444122222244262622442626777466666677', 13, [1, 4, 7, 0, 6, 2, 5, 3]],
    [
      '10×10',
      '0001111122000011132200001143250000044322666074433366687744336888774443668887744468888884446988884444',
      26,
      [8, 5, 9, 2, 7, 4, 6, 0, 3, 1],
    ],
    [
      '12×12',
      '001111222234011111122234001555552233001155522333000005667333000555566633000555663333855555569399855555569999885555a9999988885aa99999b8aaaaaa9999',
      123,
      [11, 7, 10, 3, 8, 2, 6, 4, 9, 1, 5, 0],
    ],
  ];

  it.each(UNIQUE)('grille unique %s', (_label, code, nodes, solution) => {
    expect(solveQueensExact(decodeQueens(code), 2)).toEqual({ count: 1, solutions: [solution], nodes, complete: true });
  });

  it.each([
    [4, 15, '5308fa2f79325168a4d1257d6f4258bd', [[1, 3, 0, 2], [2, 0, 3, 1]]],
    [5, 56, '7bff69f61e4246eb13742bfd046a551f', [[0, 2, 4, 1, 3], [0, 3, 1, 4, 2], [1, 3, 0, 2, 4]]],
    [6, 289, '814ba0d7d92d869445a922f8d11402fa', [[0, 2, 4, 1, 3, 5], [0, 2, 4, 1, 5, 3], [0, 2, 5, 3, 1, 4]]],
    [7, 1852, '93fe77039555e401ab047611221a3726', [[0, 2, 4, 1, 5, 3, 6], [0, 2, 4, 1, 6, 3, 5], [0, 2, 4, 6, 1, 3, 5]]],
    [8, 13_943, '65e90d9ccae5586991fa9eac69e82418', [[0, 2, 4, 1, 5, 7, 3, 6], [0, 2, 4, 1, 6, 3, 5, 7], [0, 2, 4, 1, 6, 3, 7, 5]]],
  ])('bandes %i×%i : énumération complète', (n, nodes, digest, firsts) => {
    const r = solveQueensExact(stripes(n), Number.POSITIVE_INFINITY, 1e9);
    expect(r.nodes).toBe(nodes);
    expect(hashHex(JSON.stringify(r.solutions))).toBe(digest);
    expect(r.solutions.slice(0, 3)).toEqual(firsts);
  });
});

describe('popcount32', () => {
  it('valeurs remarquables', () => {
    expect(popcount32(0)).toBe(0);
    expect(popcount32(1)).toBe(1);
    expect(popcount32(0x80000000)).toBe(1);
    expect(popcount32(-1)).toBe(32);
    expect(popcount32(0xffffffff)).toBe(32);
    expect(popcount32(0x55555555)).toBe(16);
    expect(popcount32(0x0fff)).toBe(12);
  });

  it('≡ comptage naïf sur 10 000 entiers', () => {
    const rng = rngFromString('popcount');
    for (let i = 0; i < 10_000; i++) {
      const x = rng.nextU32();
      let naive = 0;
      for (let b = 0; b < 32; b++) naive += Math.floor(x / 2 ** b) % 2;
      expect(popcount32(x)).toBe(naive);
      expect(popcount32(x | 0)).toBe(naive);
    }
  });
});
