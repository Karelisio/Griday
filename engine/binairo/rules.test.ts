import { describe, expect, it } from 'vitest';
import { rngFromString, type Rng } from '../core/prng';
import { solveBinairoExact } from './exact';
import { assertBinairoMarks, checkBinairoBoard, isBinairoSolution } from './rules';
import { randomBinairoSolution, randomUniqueBinairo } from './testing';
import { CELL_A, CELL_B, CELL_EMPTY, type BinairoCell, type BinairoPuzzle } from './types';

// ─── Outils et référence naïve (indépendante de rules.ts) ────────────────────────────────────

/** Grille depuis des lignes : 'A' = 1, 'B' = 2, '.' = vide. */
const cells = (rows: readonly string[]): BinairoCell[] => Array.from(rows.join(''), (ch) => (ch === 'A' ? 1 : ch === 'B' ? 2 : 0) as BinairoCell);
const puzzle = (rows: readonly string[]): BinairoPuzzle => ({ size: rows.length, givens: cells(rows) });
const blank = (n: number): BinairoCell[] => new Array<BinairoCell>(n * n).fill(CELL_EMPTY);
const lineCells = (n: number, column: boolean, i: number): number[] => Array.from({ length: n }, (_, k) => (column ? k * n + i : i * n + k));

/** Cases en faute d'une grille (règles 1 à 3, définitions littérales). */
function naiveViolations(n: number, board: readonly number[]): number[] {
  const bad = new Set<number>();
  for (const column of [false, true]) {
    const complete = new Map<string, number[][]>();
    for (let i = 0; i < n; i++) {
      const L = lineCells(n, column, i);
      // Règle 1 : toute fenêtre de 3 cases identiques non vides.
      for (let k = 0; k + 2 < n; k++) {
        const v = board[L[k]!];
        if (v !== 0 && board[L[k + 1]!] === v && board[L[k + 2]!] === v) [L[k]!, L[k + 1]!, L[k + 2]!].forEach((x) => bad.add(x));
      }
      // Règle 2 : symbole présent plus de n/2 fois → toutes ses cases.
      for (const s of [1, 2]) {
        const own = L.filter((x) => board[x] === s);
        if (own.length > n / 2) own.forEach((x) => bad.add(x));
      }
      // Règle 3 : lignes complètes identiques.
      if (L.every((x) => board[x] !== 0)) {
        const key = L.map((x) => board[x]).join('');
        complete.set(key, [...(complete.get(key) ?? []), L]);
      }
    }
    for (const group of complete.values()) if (group.length > 1) group.flat().forEach((x) => bad.add(x));
  }
  return [...bad].sort((a, b) => a - b);
}

/** Grille pleine valide (règles 1 à 3) et conforme aux données. */
function naiveIsSolution(p: BinairoPuzzle, s: readonly number[]): boolean {
  const n = p.size;
  if (n % 2 !== 0 || s.length !== n * n || s.some((v) => v !== 1 && v !== 2)) return false;
  if (p.givens.some((g, i) => g !== 0 && g !== s[i])) return false;
  if (naiveViolations(n, s).length > 0) return false;
  for (let i = 0; i < n; i++) {
    for (const column of [false, true]) if (lineCells(n, column, i).filter((x) => s[x] === 1).length !== n / 2) return false;
  }
  return true;
}

// Grille 6×6 valide (vérifiée naïvement ci-dessous).
const SOLUTION = cells(['AABABB', 'ABABBA', 'BBABAA', 'BABAAB', 'ABBABA', 'BAABAB']);

describe('grille de référence', () => {
  it('SOLUTION est une grille valide (naïf)', () => {
    expect(naiveIsSolution({ size: 6, givens: blank(6) }, SOLUTION)).toBe(true);
  });
});

// ─── checkBinairoBoard ───────────────────────────────────────────────────────────────────────

describe('checkBinairoBoard — cas construits', () => {
  const P = { size: 6, givens: blank(6) };

  it('grille vide : rien à signaler', () => {
    expect(checkBinairoBoard(P, blank(6))).toEqual({ violations: [], filled: 0, solved: false });
  });

  it.each([
    ['triplet en rangée', ['.AAA..', '......', '......', '......', '......', '......'], [1, 2, 3]],
    ['suite de 4 en rangée (toutes ses cases)', ['BBBB..', '......', '......', '......', '......', '......'], [0, 1, 2, 3]],
    ['triplet en colonne', ['......', '.....B', '.....B', '.....B', '......', '......'], [11, 17, 23]],
    ['A en excès dans une rangée (4 sur 6, sans triplet)', ['AA.A.A', '......', '......', '......', '......', '......'], [0, 1, 3, 5]],
    ['B en excès dans une colonne', ['B.....', '......', 'B.....', 'B.....', '......', 'B.....'], [0, 12, 18, 30]],
    ['n/2 exactement : pas de faute', ['AA.A..', '......', '......', '......', '......', '......'], []],
    ['rangées complètes identiques', ['AABABB', '......', '......', '......', '......', 'AABABB'], [0, 1, 2, 3, 4, 5, 30, 31, 32, 33, 34, 35]],
    ['colonnes complètes identiques', ['A....A', 'A....A', 'B....B', 'A....A', 'B....B', 'B....B'], [0, 5, 6, 11, 12, 17, 18, 23, 24, 29, 30, 35]],
    ['rangées identiques mais incomplètes : pas de faute', ['AABAB.', '......', '......', '......', '......', 'AABAB.'], []],
  ])('%s', (_label, rows, expected) => {
    const res = checkBinairoBoard(P, cells(rows));
    expect(res.violations).toEqual(expected);
    expect(res.solved).toBe(false);
    expect(res.violations).toEqual(naiveViolations(6, cells(rows)));
  });

  it('trois rangées identiques : toutes signalées', () => {
    const rows = ['AABABB', '......', 'AABABB', '......', 'AABABB', '......'];
    expect(checkBinairoBoard(P, cells(rows)).violations).toEqual([...lineCells(6, false, 0), ...lineCells(6, false, 2), ...lineCells(6, false, 4)]);
  });

  it('les données comptent dans les fautes et le remplissage', () => {
    const p = puzzle(['AA....', '......', '......', '......', '......', '......']);
    const marks = cells(['..A...', '......', '......', '......', '......', '......']);
    expect(checkBinairoBoard(p, marks)).toEqual({ violations: [0, 1, 2], filled: 3, solved: false });
  });

  it('marque sur une case donnée : ignorée (la donnée prime)', () => {
    const p = puzzle(['A.....', '......', '......', '......', '......', '......']);
    const marks = cells(['BBB...', '......', '......', '......', '......', '......']);
    // Vue du joueur : A B B → aucun triplet.
    expect(checkBinairoBoard(p, marks)).toEqual({ violations: [], filled: 3, solved: false });
  });

  it('détection de victoire', () => {
    const givens = SOLUTION.map((v, i) => (i % 5 === 0 ? v : 0) as BinairoCell);
    const p = { size: 6, givens };
    // Marques complètes (y compris sur les données, égales) ou seulement hors données.
    expect(checkBinairoBoard(p, SOLUTION)).toEqual({ violations: [], filled: 36, solved: true });
    const outside = SOLUTION.map((v, i) => (givens[i] !== 0 ? 0 : v) as BinairoCell);
    expect(checkBinairoBoard(p, outside)).toEqual({ violations: [], filled: 36, solved: true });
    // Une case manquante.
    const missing = [...outside];
    missing[outside.findIndex((v) => v !== 0)] = 0;
    expect(checkBinairoBoard(p, missing)).toMatchObject({ filled: 35, solved: false });
    // Marque contraire sur une case donnée : vue du joueur valide, mais pas « résolu ».
    const g = givens.findIndex((v) => v !== 0);
    const contrary = [...SOLUTION];
    contrary[g] = (3 - SOLUTION[g]!) as BinairoCell;
    expect(checkBinairoBoard(p, contrary)).toEqual({ violations: [], filled: 36, solved: false });
    // Grille pleine valide mais autre que la solution unique : impossible (unicité) ; grille pleine fautive → non résolue.
    const swapped = [...SOLUTION];
    [swapped[6], swapped[7]] = [swapped[7]!, swapped[6]!];
    expect(checkBinairoBoard({ size: 6, givens: blank(6) }, swapped).solved).toBe(false);
  });

  it('≡ référence naïve sur des états aléatoires (remplissages, bruit, données)', () => {
    const rng = rngFromString('regles-etats');
    let withFaults = 0;
    let solved = 0;
    const states: [string, (rng: Rng, n: number, sol: number[]) => BinairoCell[]][] = [
      ['uniforme', (r, n) => Array.from({ length: n * n }, () => r.int(3) as BinairoCell)],
      ['solution partielle', (r, _n, sol) => sol.map((v) => (r.chance(2, 3) ? v : 0) as BinairoCell)],
      ['solution bruitée', (r, _n, sol) => sol.map((v) => (r.chance(1, 20) ? 3 - v : v) as BinairoCell)],
      ['solution pleine', (_r, _n, sol) => sol as BinairoCell[]],
      ['deux rangées copiées', (r, n, sol) => {
        const g = [...sol] as BinairoCell[];
        const a = r.int(n);
        const b = (a + 1 + r.int(n - 1)) % n;
        for (let c = 0; c < n; c++) g[b * n + c] = g[a * n + c]!;
        return g;
      }],
    ];
    for (const n of [4, 6, 8, 10, 12, 14]) {
      for (let i = 0; i < (n >= 12 ? 10 : 40); i++) {
        const sol = randomBinairoSolution(rng, n);
        const [, make] = states[i % states.length]!;
        const board = make(rng, n, sol);
        // Une partie des cases en données (même valeur), le reste en marques.
        const givens = board.map((v) => (rng.chance(1, 4) ? v : 0) as BinairoCell);
        const marks = board.map((v, k) => (givens[k] !== 0 && rng.chance(1, 2) ? 0 : v) as BinairoCell);
        const res = checkBinairoBoard({ size: n, givens }, marks);
        const expected = naiveViolations(n, board);
        expect(res.violations, `${n} #${i}`).toEqual(expected);
        expect(res.filled).toBe(board.filter((v) => v !== 0).length);
        expect(res.solved).toBe(board.every((v) => v !== 0) && expected.length === 0);
        if (expected.length > 0) withFaults++;
        if (res.solved) solved++;
      }
    }
    expect(withFaults).toBeGreaterThan(100);
    expect(solved).toBeGreaterThan(20);
  });
});

// ─── isBinairoSolution ───────────────────────────────────────────────────────────────────────

describe('isBinairoSolution', () => {
  const P = { size: 6, givens: blank(6) };

  it('solution valide ; données respectées', () => {
    expect(isBinairoSolution(P, SOLUTION)).toBe(true);
    expect(isBinairoSolution({ size: 6, givens: SOLUTION.map((v, i) => (i % 7 === 0 ? v : 0) as BinairoCell) }, SOLUTION)).toBe(true);
    expect(isBinairoSolution({ size: 2, givens: blank(2) }, [1, 2, 2, 1])).toBe(true);
  });

  it.each([
    ['trop courte', SOLUTION.slice(0, 35)],
    ['trop longue', [...SOLUTION, 1]],
    ['case vide', SOLUTION.map((v, i) => (i === 7 ? 0 : v))],
    ['valeur 3', SOLUTION.map((v, i) => (i === 7 ? 3 : v))],
    ['NaN', SOLUTION.map((v, i) => (i === 7 ? Number.NaN : v))],
    ['deux cases échangées (triplet ou quota)', SOLUTION.map((v, i) => (i === 0 ? SOLUTION[2]! : i === 2 ? SOLUTION[0]! : v))],
    ['tout inversé dans une rangée → colonnes déséquilibrées', SOLUTION.map((v, i) => (i < 6 ? 3 - v : v))],
  ])('refuse : %s', (_label, s) => {
    expect(isBinairoSolution(P, s)).toBe(false);
  });

  it('refuse une solution contraire aux données', () => {
    const givens = blank(6);
    givens[0] = (3 - SOLUTION[0]!) as BinairoCell;
    expect(isBinairoSolution({ size: 6, givens }, SOLUTION)).toBe(false);
  });

  it('refuse des rangées ou colonnes identiques (règles 1 et 2 respectées)', () => {
    // 4×4 : rangées AB BA alternées → colonnes équilibrées, sans triplet, mais rangées 0 et 2 identiques.
    const dupRows = cells(['ABAB', 'BABA', 'ABAB', 'BABA']);
    expect(isBinairoSolution({ size: 4, givens: blank(4) }, dupRows)).toBe(false);
    const dupCols = cells(['AABB', 'BBAA', 'AABB', 'BBAA']);
    expect(isBinairoSolution({ size: 4, givens: blank(4) }, dupCols)).toBe(false);
  });

  it('taille impaire ou données de mauvaise longueur → faux', () => {
    expect(isBinairoSolution({ size: 3, givens: blank(3) }, [1, 2, 1, 2, 1, 2, 1, 2, 1])).toBe(false);
    expect(isBinairoSolution({ size: 6, givens: blank(5) }, SOLUTION)).toBe(false);
  });

  it('≡ vérification naïve ≡ checkBinairoBoard.solved, sur grilles aléatoires', () => {
    const rng = rngFromString('regles-solutions');
    let valid = 0;
    for (let i = 0; i < 400; i++) {
      // Tailles 4 à 10, plus quelques 12 et 14 (grilles aléatoires plus coûteuses).
      const n = i % 40 === 0 ? 12 + 2 * rng.int(2) : 4 + 2 * rng.int(4);
      const sol = randomBinairoSolution(rng, n);
      const candidates: number[][] = [sol, sol.map((v) => (rng.chance(1, 30) ? 3 - v : v)), Array.from({ length: n * n }, () => 1 + rng.int(2))];
      const givens = sol.map((v) => (rng.chance(1, 5) ? v : 0) as BinairoCell);
      for (const s of candidates) {
        const expected = naiveIsSolution({ size: n, givens }, s);
        if (expected) valid++;
        expect(isBinairoSolution({ size: n, givens }, s)).toBe(expected);
        expect(checkBinairoBoard({ size: n, givens }, s as BinairoCell[]).solved).toBe(expected);
      }
    }
    expect(valid).toBeGreaterThan(400);
  });

  it('toutes les solutions énumérées par le solveur exact sont valides', () => {
    const rng = rngFromString('regles-exact');
    for (let i = 0; i < 30; i++) {
      const n = [4, 6, 8][i % 3]!;
      const sol = randomBinairoSolution(rng, n);
      const p = { size: n, givens: sol.map((v) => (rng.chance(1, 6) ? v : 0) as BinairoCell) };
      for (const s of solveBinairoExact(p, 40).solutions) expect(isBinairoSolution(p, s)).toBe(true);
    }
    const u = randomUniqueBinairo(rngFromString('regles-unique'), 8);
    expect(isBinairoSolution(u, u.solution)).toBe(true);
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────────────────────

describe('validation des marques', () => {
  const p = { size: 6, givens: blank(6) };

  it('longueur ≠ n² ou marque hors {0,1,2} → RangeError (pas de faux « résolu »)', () => {
    expect(() => checkBinairoBoard(p, blank(6).slice(1))).toThrow(RangeError);
    expect(() => checkBinairoBoard(p, [...blank(6), 0])).toThrow(RangeError);
    for (const bad of [3, -1, 1.5, Number.NaN, '1', null, undefined]) {
      const marks = [...SOLUTION] as unknown[];
      marks[4] = bad;
      expect(() => checkBinairoBoard(p, marks as BinairoCell[]), String(bad)).toThrow(RangeError);
      expect(() => assertBinairoMarks(p, marks as BinairoCell[]), String(bad)).toThrow(RangeError);
    }
    expect(() => assertBinairoMarks({ size: 6, givens: blank(5) }, blank(6))).toThrow(RangeError);
    expect(() => assertBinairoMarks(p, blank(6))).not.toThrow();
    expect(CELL_A).toBe(1);
    expect(CELL_B).toBe(2);
  });
});
