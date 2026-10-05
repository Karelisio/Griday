import { describe, expect, it } from 'vitest';
import { hashHex, rngFromString, type Rng } from '../core/prng';
import { BINAIRO_EXACT_MAX_SIZE, countBinairoSolutions, solveBinairoExact } from './exact';
import { randomBinairoSolution, validLineMasks } from './testing';
import type { BinairoCell, BinairoPuzzle } from './types';

// ─── Références naïves (indépendantes d'exact.ts) ────────────────────────────────────────────

const lineOf = (n: number, g: readonly number[], column: boolean, i: number): number[] =>
  Array.from({ length: n }, (_, k) => g[column ? k * n + i : i * n + k]!);

/** Validité naïve d'une grille pleine (valeurs 1/2) : règles 1 à 3. */
function naiveValid(n: number, g: readonly number[]): boolean {
  if (g.length !== n * n || g.some((v) => v !== 1 && v !== 2)) return false;
  for (const column of [false, true]) {
    const keys = new Set<string>();
    for (let i = 0; i < n; i++) {
      const L = lineOf(n, g, column, i);
      if (L.filter((v) => v === 1).length !== n / 2) return false;
      for (let k = 2; k < n; k++) if (L[k] === L[k - 1] && L[k] === L[k - 2]) return false;
      keys.add(L.join(''));
    }
    if (keys.size !== n) return false;
  }
  return true;
}

const matches = (givens: readonly number[], g: readonly number[]): boolean => givens.every((v, i) => v === 0 || v === g[i]);

/** Toutes les grilles valides n×n (n ≤ 6) : rangées valides naïves, élagage par préfixe, contrôle final naïf. */
function allGrids(n: number): number[][] {
  const rows = validLineMasks(n).map((m) => Array.from({ length: n }, (_, i) => ((m >> i) & 1 ? 2 : 1)));
  const out: number[][] = [];
  const g: number[] = [];
  const rec = (r: number): void => {
    if (r === n) {
      if (naiveValid(n, g)) out.push([...g]);
      return;
    }
    for (const row of rows) {
      g.push(...row);
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        const col = Array.from({ length: r + 1 }, (_, k) => g[k * n + c]!);
        if (r >= 2 && col[r] === col[r - 1] && col[r] === col[r - 2]) ok = false;
        if (col.filter((v) => v === 1).length > n / 2 || col.filter((v) => v === 2).length > n / 2) ok = false;
      }
      if (ok) rec(r + 1);
      g.length -= n;
    }
  };
  rec(0);
  return out;
}

/** Solveur naïf rangée par rangée (indépendant) : toutes les solutions, pour des grilles assez contraintes. */
function naiveSolve(p: BinairoPuzzle): number[][] {
  const n = p.size;
  const rows = validLineMasks(n).map((m) => Array.from({ length: n }, (_, i) => ((m >> i) & 1 ? 2 : 1)));
  const out: number[][] = [];
  const g: number[] = [];
  const rec = (r: number): void => {
    if (r === n) {
      if (naiveValid(n, g)) out.push([...g]);
      return;
    }
    for (const row of rows) {
      if (row.some((v, c) => p.givens[r * n + c] !== 0 && p.givens[r * n + c] !== v)) continue;
      g.push(...row);
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        const col = Array.from({ length: r + 1 }, (_, k) => g[k * n + c]!);
        if (r >= 2 && col[r] === col[r - 1] && col[r] === col[r - 2]) ok = false;
        if (col.filter((v) => v === 1).length > n / 2 || col.filter((v) => v === 2).length > n / 2) ok = false;
      }
      for (let k = 0; k < r && ok; k++) if (g.slice(k * n, k * n + n).join() === row.join()) ok = false;
      if (ok) rec(r + 1);
      g.length -= n;
    }
  };
  rec(0);
  return out;
}

const keys = (sols: readonly (readonly number[])[]): string[] => sols.map((s) => s.join('')).sort();
const freeze = (p: BinairoPuzzle): BinairoPuzzle => Object.freeze({ size: p.size, givens: Object.freeze([...p.givens]) });
const empty = (n: number): BinairoPuzzle => ({ size: n, givens: new Array<BinairoCell>(n * n).fill(0) });
/** Grille depuis des lignes : 'A' = 1, 'B' = 2, '.' = vide. */
const parse = (rows: readonly string[]): BinairoPuzzle => ({
  size: rows.length,
  givens: Array.from(rows.join(''), (ch) => (ch === 'A' ? 1 : ch === 'B' ? 2 : 0) as BinairoCell),
});

// Transformations préservant les règles : transposition, miroir horizontal, échange des symboles.
const transpose = (p: BinairoPuzzle): BinairoPuzzle => ({
  size: p.size,
  givens: p.givens.map((_, i) => p.givens[(i % p.size) * p.size + Math.floor(i / p.size)]!),
});
const mirror = (p: BinairoPuzzle): BinairoPuzzle => ({
  size: p.size,
  givens: p.givens.map((_, i) => p.givens[Math.floor(i / p.size) * p.size + (p.size - 1 - (i % p.size))]!),
});
const swap = (p: BinairoPuzzle): BinairoPuzzle => ({ size: p.size, givens: p.givens.map((v) => (v === 0 ? 0 : 3 - v) as BinairoCell) });

type Family = (rng: Rng, n: number) => BinairoPuzzle;
const FAMILIES: [string, Family][] = [
  // Cases uniformes : souvent contradictoires (0 solution).
  ['uniforme', (rng, n) => ({ size: n, givens: Array.from({ length: n * n }, () => (rng.chance(1, 3) ? 1 + rng.int(2) : 0) as BinairoCell) })],
  // Sous-ensemble d'une grille valide : ≥ 1 solution, densité variable.
  [
    'plantée',
    (rng, n) => {
      const sol = randomBinairoSolution(rng, n);
      const keep = 1 + rng.int(5);
      return { size: n, givens: sol.map((v) => (rng.chance(keep, 8) ? v : 0) as BinairoCell) };
    },
  ],
  // Plantée puis une ou deux cases inversées : 0 ou quelques solutions.
  [
    'plantée + bruit',
    (rng, n) => {
      const sol = randomBinairoSolution(rng, n);
      const givens = sol.map((v) => (rng.chance(1, 2) ? v : 0) as BinairoCell);
      for (let k = rng.int(3); k > 0; k--) {
        const x = rng.int(n * n);
        givens[x] = (givens[x] === 0 ? 1 + rng.int(2) : 3 - givens[x]!) as BinairoCell;
      }
      return { size: n, givens };
    },
  ],
  // Très peu de données : beaucoup de solutions.
  ['clairsemée', (rng, n) => ({ size: n, givens: Array.from({ length: n * n }, () => (rng.chance(1, 10) ? 1 + rng.int(2) : 0) as BinairoCell) })],
];

// ─── Énumération complète ────────────────────────────────────────────────────────────────────

describe('énumération complète (force brute)', () => {
  it('2×2 : 2 grilles ; 4×4 : 72 grilles (90 sans la règle 3), sur les 2^16 remplissages', () => {
    expect(keys(solveBinairoExact(empty(2), Number.POSITIVE_INFINITY, 1e9).solutions)).toEqual(['1221', '2112']);
    const all: number[][] = [];
    let noRule3 = 0;
    for (let m = 0; m < 1 << 16; m++) {
      const g = Array.from({ length: 16 }, (_, i) => ((m >> i) & 1 ? 2 : 1));
      if (naiveValid(4, g)) all.push(g);
      const linesOk = [false, true].every((col) =>
        [0, 1, 2, 3].every((i) => {
          const L = lineOf(4, g, col, i);
          return L.filter((v) => v === 1).length === 2 && !L.some((v, k) => k >= 2 && v === L[k - 1] && v === L[k - 2]);
        }),
      );
      if (linesOk) noRule3++;
    }
    expect(all).toHaveLength(72);
    expect(noRule3).toBe(90);
    const res = solveBinairoExact(empty(4), Number.POSITIVE_INFINITY, 1e9);
    expect(res.complete).toBe(true);
    expect(res.count).toBe(72);
    expect(keys(res.solutions)).toEqual(keys(all));
    expect(allGrids(4)).toHaveLength(72);
  });

  it('6×6 : 4 140 grilles (11 222 sans la règle 3) ; solveur ≡ énumération naïve', () => {
    const all = allGrids(6);
    expect(all).toHaveLength(4140);
    const res = solveBinairoExact(empty(6), Number.POSITIVE_INFINITY, 1e9);
    expect(res).toMatchObject({ count: 4140, complete: true });
    expect(keys(res.solutions)).toEqual(keys(all));
    expect(new Set(keys(res.solutions)).size).toBe(4140);
  });

  it('6×6 sans la règle 3 : 11 222 (contrôle de la référence naïve)', () => {
    const rows = validLineMasks(6);
    expect(rows).toHaveLength(14);
    let count = 0;
    const colA = new Array<number>(6).fill(0);
    const prev: number[] = [];
    const rec = (r: number): void => {
      if (r === 6) {
        count++;
        return;
      }
      for (const m of rows) {
        let ok = true;
        for (let c = 0; c < 6 && ok; c++) {
          const b = (m >> c) & 1;
          if (r >= 2 && ((prev[r - 1]! >> c) & 1) === b && ((prev[r - 2]! >> c) & 1) === b) ok = false;
          if (colA[c]! + (1 - b) > 3 || r + 1 - colA[c]! - (1 - b) > 3) ok = false;
        }
        if (!ok) continue;
        prev[r] = m;
        for (let c = 0; c < 6; c++) colA[c]! += 1 - ((m >> c) & 1);
        rec(r + 1);
        for (let c = 0; c < 6; c++) colA[c]! -= 1 - ((m >> c) & 1);
      }
    };
    rec(0);
    expect(count).toBe(11_222);
  });

  it('lignes valides par taille : 2, 6, 14, 34, 84, 208, 518', () => {
    expect([2, 4, 6, 8, 10, 12, 14].map((n) => validLineMasks(n).length)).toEqual([2, 6, 14, 34, 84, 208, 518]);
  });
});

// ─── Grilles partielles ≡ références ─────────────────────────────────────────────────────────

describe('solveBinairoExact ≡ force brute (grilles partielles)', () => {
  const ALL = new Map<number, number[][]>([
    [4, allGrids(4)],
    [6, allGrids(6)],
  ]);

  it.each([
    [4, 120],
    [6, 60],
  ])('n = %i : ensemble exact des solutions (%i grilles par famille)', (n, perFamily) => {
    const rng = rngFromString(`exact-vs-brute:${n}`);
    const grids = ALL.get(n)!;
    const seen = { zero: 0, one: 0, many: 0 };
    for (const [family, make] of FAMILIES) {
      for (let i = 0; i < perFamily; i++) {
        const p = freeze(make(rng, n)); // gelé : le solveur ne doit pas muter l'entrée
        const label = `${family} #${i} ${p.givens.join('')}`;
        const brute = grids.filter((g) => matches(p.givens, g));
        const all = solveBinairoExact(p, Number.POSITIVE_INFINITY, 1e9);
        expect(all.complete, label).toBe(true);
        expect(all.count, label).toBe(brute.length);
        expect(all.solutions.length, label).toBe(all.count);
        expect(keys(all.solutions), label).toEqual(keys(brute));
        // `limit` : préfixe exact du parcours complet, plafonné.
        for (const limit of [1, 2, 3]) {
          const lim = solveBinairoExact(p, limit);
          const expected = Math.min(limit, brute.length);
          expect(lim.count, `${label} limit=${limit}`).toBe(expected);
          expect(lim.complete).toBe(true);
          expect(lim.solutions).toEqual(all.solutions.slice(0, expected));
          expect(countBinairoSolutions(p, limit)).toBe(expected);
        }
        if (brute.length === 0) seen.zero++;
        else if (brute.length === 1) seen.one++;
        else seen.many++;
      }
    }
    // Les trois régimes (0, 1, ≥ 2 solutions) sont exercés.
    expect(seen.zero).toBeGreaterThan(10);
    expect(seen.one).toBeGreaterThan(10);
    expect(seen.many).toBeGreaterThan(10);
  });

  it.each([
    [8, 40, 35],
    [10, 10, 45],
  ])('n = %i : ≡ solveur naïf rangée par rangée (%i grilles plantées)', (n, count, minKeep) => {
    const rng = rngFromString(`exact-vs-naive:${n}`);
    const seen = { one: 0, many: 0 };
    for (let i = 0; i < count; i++) {
      const sol = randomBinairoSolution(rng, n);
      // Densité minKeep–(minKeep + 25) % : le solveur naïf reste rapide, unicité variable.
      const keep = minKeep + rng.int(26);
      const p = freeze({ size: n, givens: sol.map((v) => (rng.int(100) < keep ? v : 0) as BinairoCell) });
      const label = `#${i} ${p.givens.join('')}`;
      const brute = naiveSolve(p);
      expect(brute.length, label).toBeGreaterThan(0);
      const all = solveBinairoExact(p, Number.POSITIVE_INFINITY, 1e9);
      expect(all.complete, label).toBe(true);
      expect(keys(all.solutions), label).toEqual(keys(brute));
      expect(keys(all.solutions)).toContain(sol.join(''));
      if (brute.length === 1) seen.one++;
      else seen.many++;
    }
    expect(seen.one).toBeGreaterThan(0);
    expect(seen.many).toBeGreaterThan(0);
  });

  it('solutions valides, distinctes, conformes aux données (8×8 à 14×14, grilles clairsemées)', () => {
    const rng = rngFromString('exact-valid');
    for (const n of [8, 10, 12, 14]) {
      for (let i = 0; i < (n >= 12 ? 3 : 6); i++) {
        const sol = randomBinairoSolution(rng, n);
        const p = { size: n, givens: sol.map((v) => (rng.chance(1, 8) ? v : 0) as BinairoCell) };
        const res = solveBinairoExact(p, 25);
        expect(res.complete).toBe(true);
        expect(res.count).toBe(25);
        expect(new Set(keys(res.solutions)).size).toBe(25);
        for (const s of res.solutions) {
          expect(naiveValid(n, s)).toBe(true);
          expect(matches(p.givens, s)).toBe(true);
        }
      }
    }
  });

  it('invariance par symétrie (transposition, miroir, échange des symboles)', () => {
    const rng = rngFromString('exact-symetries');
    for (const n of [4, 6, 8]) {
      for (const [, make] of FAMILIES) {
        for (let i = 0; i < 15; i++) {
          const p = make(rng, n);
          const ref = solveBinairoExact(p, 501, 1e9);
          expect(ref.complete).toBe(true);
          if (ref.count > 500) continue; // trop de solutions pour comparer les ensembles
          const t = solveBinairoExact(transpose(p), Number.POSITIVE_INFINITY, 1e9);
          expect(keys(t.solutions)).toEqual(keys(ref.solutions.map((s) => transpose({ size: n, givens: s }).givens)));
          const m = solveBinairoExact(mirror(p), Number.POSITIVE_INFINITY, 1e9);
          expect(keys(m.solutions)).toEqual(keys(ref.solutions.map((s) => mirror({ size: n, givens: s }).givens)));
          const w = solveBinairoExact(swap(p), Number.POSITIVE_INFINITY, 1e9);
          expect(keys(w.solutions)).toEqual(keys(ref.solutions.map((s) => swap({ size: n, givens: s }).givens)));
        }
      }
    }
  });
});

// ─── Données contradictoires, grilles pleines ────────────────────────────────────────────────

describe('données contradictoires ou complètes', () => {
  it.each([
    ['triplet en ligne', ['AAA...', '......', '......', '......', '......', '......']],
    ['triplet en colonne', ['B.....', 'B.....', 'B.....', '......', '......', '......']],
    ['quota dépassé en ligne', ['A.A.AA', '......', '......', '......', '......', '......']],
    ['quota dépassé en colonne', ['.B....', '......', '.B....', '.B....', '......', '.B....']],
    ['rangées complètes identiques', ['AABABB', '......', '......', 'AABABB', '......', '......']],
    ['colonnes complètes identiques', ['A...A.', 'A...A.', 'B...B.', 'A...A.', 'B...B.', 'B...B.']],
    ['ligne sans complétion (AA....AA)', ['AA....AA', '........', '........', '........', '........', '........', '........', '........']],
  ])('%s → 0 solution', (_label, rows) => {
    const p = parse(rows);
    const res = solveBinairoExact(p, 2);
    expect(res).toMatchObject({ count: 0, solutions: [], complete: true });
    expect(countBinairoSolutions(p, 2)).toBe(0);
  });

  it('données contradictoires dès la racine : un seul nœud', () => {
    expect(solveBinairoExact(parse(['AAA...', '......', '......', '......', '......', '......']), 2)).toEqual({
      count: 0,
      solutions: [],
      nodes: 1,
      complete: true,
    });
  });

  it('grille pleine valide → elle-même, un seul nœud ; grille pleine invalide → 0', () => {
    const rng = rngFromString('exact-full');
    for (const n of [4, 6, 8, 10, 12, 14, 16]) {
      const sol = randomBinairoSolution(rng, n);
      expect(solveBinairoExact({ size: n, givens: sol }, 2)).toEqual({ count: 1, solutions: [sol], nodes: 1, complete: true });
      // Échange de deux cases différentes d'une rangée : règle 2 tenue en ligne, cassée en colonnes.
      const bad = [...sol];
      const j = bad.findIndex((v, k) => k > 0 && k < n && v !== bad[0]);
      [bad[0], bad[j]] = [bad[j]!, bad[0]!];
      expect(naiveValid(n, bad)).toBe(false);
      expect(countBinairoSolutions({ size: n, givens: bad }, 2)).toBe(0);
    }
  });

  it('solution unique retrouvée quand une seule case manque', () => {
    const rng = rngFromString('exact-one-hole');
    for (const n of [4, 6, 8, 10, 12, 14]) {
      const sol = randomBinairoSolution(rng, n);
      for (let k = 0; k < 5; k++) {
        const givens = [...sol] as BinairoCell[];
        givens[rng.int(n * n)] = 0;
        expect(solveBinairoExact({ size: n, givens }, 2).solutions).toEqual([sol]);
      }
    }
  });
});

// ─── Budget ──────────────────────────────────────────────────────────────────────────────────

describe('budget maxNodes', () => {
  const e6 = empty(6);
  const full = solveBinairoExact(e6, Number.POSITIVE_INFINITY, 1e9);

  it('épuisé → complete = false, count borne inférieure, countBinairoSolutions = −1', () => {
    expect(full.complete).toBe(true);
    expect(full.count).toBe(4140);
    const cut = solveBinairoExact(e6, Number.POSITIVE_INFINITY, full.nodes - 1);
    expect(cut.complete).toBe(false);
    expect(cut.count).toBe(4139); // le dernier nœud du parcours est la dernière feuille (les feuilles comptent)
    expect(countBinairoSolutions(e6, Number.POSITIVE_INFINITY, full.nodes - 1)).toBe(-1);
    expect(countBinairoSolutions(e6, Number.POSITIVE_INFINITY, full.nodes)).toBe(4140);
  });

  it('nœuds = maxNodes + 1 à l’arrêt ; solutions = préfixe du parcours complet', () => {
    let prev = 0;
    for (const maxNodes of [0, 1, 5, 10, 50, 200, 1000, 5000]) {
      const r = solveBinairoExact(e6, Number.POSITIVE_INFINITY, maxNodes);
      expect(r.complete, `maxNodes=${maxNodes}`).toBe(false);
      expect(r.nodes).toBe(maxNodes + 1);
      expect(r.solutions).toEqual(full.solutions.slice(0, r.count));
      expect(r.count).toBeGreaterThanOrEqual(prev);
      prev = r.count;
      expect(countBinairoSolutions(e6, Number.POSITIVE_INFINITY, maxNodes)).toBe(-1);
    }
    expect(solveBinairoExact(e6, 2, 0)).toEqual({ count: 0, solutions: [], nodes: 1, complete: false });
  });

  it('limite atteinte avant le budget → résultat concluant', () => {
    const r = solveBinairoExact(e6, 2);
    expect(r.count).toBe(2);
    expect(r.complete).toBe(true);
    expect(solveBinairoExact(e6, 2, r.nodes)).toEqual(r);
    expect(countBinairoSolutions(e6, 2, r.nodes)).toBe(2);
    expect(countBinairoSolutions(e6, 2, r.nodes - 1)).toBe(-1);
  });
});

// ─── Entrées ─────────────────────────────────────────────────────────────────────────────────

describe('validation des entrées', () => {
  it('limit < 1, NaN ; maxNodes < 0, NaN → RangeError', () => {
    const p = empty(4);
    for (const [limit, maxNodes] of [
      [0, 10],
      [-1, 10],
      [Number.NaN, 10],
      [1, -1],
      [1, Number.NaN],
    ] as const) {
      expect(() => solveBinairoExact(p, limit, maxNodes), `${limit}/${maxNodes}`).toThrow(RangeError);
    }
  });

  it('taille impaire, nulle, non entière ou > maximum ; longueur ou valeurs incohérentes → RangeError', () => {
    expect(BINAIRO_EXACT_MAX_SIZE).toBeGreaterThanOrEqual(14);
    for (const size of [0, 3, 5, 4.5, -4, Number.NaN, BINAIRO_EXACT_MAX_SIZE + 2]) {
      const len = Number.isInteger(size) && size > 0 ? size * size : 0;
      expect(() => solveBinairoExact({ size, givens: new Array<BinairoCell>(len).fill(0) }), String(size)).toThrow(RangeError);
    }
    expect(() => solveBinairoExact({ size: 4, givens: new Array<BinairoCell>(15).fill(0) })).toThrow(RangeError);
    for (const bad of [3, -1, 1.5, Number.NaN, '1']) {
      const givens = new Array<unknown>(16).fill(0);
      givens[5] = bad;
      expect(() => solveBinairoExact({ size: 4, givens: givens as BinairoCell[] }), String(bad)).toThrow(RangeError);
    }
  });
});

/*
 * EMPREINTE DE PARCOURS (gel conditionnel).
 * Ordre des solutions et nombre de nœuds sont déterministes. Aucun générateur publié n'en dépend
 * (verifyBinairo ne lit que le nombre de solutions et la première) : mettre à jour en connaissance de cause.
 */
describe('empreinte de parcours (propagation par ligne, MRV rangées < colonnes, motifs croissants)', () => {
  it.each([
    [4, 133, 72],
    [6, 8441, 4140],
  ])('grille vide %i×%i : nœuds et ordre des solutions', (n, nodes, count) => {
    const r = solveBinairoExact(empty(n), Number.POSITIVE_INFINITY, 1e9);
    expect(r.nodes).toBe(nodes);
    expect(r.count).toBe(count);
    const again = solveBinairoExact(empty(n), Number.POSITIVE_INFINITY, 1e9);
    expect(hashHex(JSON.stringify(again.solutions))).toBe(hashHex(JSON.stringify(r.solutions)));
  });

  it('déterminisme sur grilles aléatoires (deux exécutions identiques)', () => {
    const rng = rngFromString('exact-det');
    for (let i = 0; i < 30; i++) {
      const n = 4 + 2 * rng.int(5);
      const p = FAMILIES[i % FAMILIES.length]![1](rng, n);
      expect(solveBinairoExact(p, 3)).toEqual(solveBinairoExact(p, 3));
    }
  });
});

describe('performance (bornes larges)', () => {
  it('unicité d’une grille 14×14 peu remplie : bien en deçà du budget par défaut', () => {
    const rng = rngFromString('exact-perf');
    for (let i = 0; i < 3; i++) {
      const sol = randomBinairoSolution(rng, 14);
      const p = { size: 14, givens: sol.map((v) => (rng.chance(1, 4) ? v : 0) as BinairoCell) };
      const t0 = performance.now();
      const r = solveBinairoExact(p, 2);
      expect(r.complete).toBe(true);
      expect(r.nodes).toBeLessThan(20_000);
      expect(performance.now() - t0).toBeLessThan(5_000);
    }
  });
});
