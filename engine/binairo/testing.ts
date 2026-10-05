/**
 * Outils réservés aux tests : grilles Binairo aléatoires (backtracking naïf) et puzzles à solution unique
 * (retrait glouton d'indices contrôlé par l'oracle exact). N'est PAS le générateur de production.
 */
import type { Rng } from '../core/prng';
import { countBinairoSolutions } from './exact';
import type { BinairoCell, BinairoSolvedPuzzle } from './types';

/** Lignes valides de longueur n (bit i à 1 ⇔ symbole B en position i), énumération naïve. */
export function validLineMasks(n: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < 1 << n; m++) {
    const cells = Array.from({ length: n }, (_, i) => (m >> i) & 1);
    if (cells.filter((x) => x === 1).length !== n / 2) continue;
    if (cells.some((x, i) => i >= 2 && x === cells[i - 1] && x === cells[i - 2])) continue;
    out.push(m);
  }
  return out;
}

/**
 * Grille complète valide aléatoire (n pair, 2 ≤ n ≤ 16) : rangées tirées dans un ordre mélangé,
 * élaguées sur les triplets verticaux, les quotas de colonnes et les doublons ; colonnes distinctes à la fin.
 * Recommence (même flux) si une branche s'enlise.
 */
export function randomBinairoSolution(rng: Rng, n: number): (1 | 2)[] {
  if (n < 2 || n % 2 !== 0 || n > 16) throw new RangeError(`randomBinairoSolution: taille ${n}`);
  const masks = validLineMasks(n);
  const half = n / 2;
  for (let restart = 0; restart < 1000; restart++) {
    const rows: number[] = [];
    const colB = new Array<number>(n).fill(0);
    let budget = 20_000;
    const rec = (r: number): boolean => {
      if (r === n) {
        const cols = new Set<number>();
        for (let c = 0; c < n; c++) {
          let m = 0;
          for (let i = 0; i < n; i++) m |= ((rows[i]! >> c) & 1) << i;
          cols.add(m);
        }
        return cols.size === n;
      }
      if (--budget < 0) return false;
      for (const m of rng.shuffle([...masks])) {
        if (rows.includes(m)) continue;
        let ok = true;
        for (let c = 0; c < n && ok; c++) {
          const b = (m >> c) & 1;
          if (r >= 2 && ((rows[r - 1]! >> c) & 1) === b && ((rows[r - 2]! >> c) & 1) === b) ok = false;
          const nb = colB[c]! + b;
          // Reste de colonne : needA symboles A et needB symboles B, séries ≤ 2 → needA ≤ 2·(needB + 1).
          const needB = half - nb;
          const needA = half - (r + 1 - nb);
          if (needA < 0 || needB < 0 || needA > 2 * (needB + 1) || needB > 2 * (needA + 1)) ok = false;
        }
        if (!ok) continue;
        rows.push(m);
        for (let c = 0; c < n; c++) colB[c]! += (m >> c) & 1;
        if (rec(r + 1)) return true;
        for (let c = 0; c < n; c++) colB[c]! -= (m >> c) & 1;
        rows.pop();
        if (budget < 0) return false;
      }
      return false;
    };
    if (rec(0)) {
      const out: (1 | 2)[] = [];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out.push((rows[r]! >> c) & 1 ? 2 : 1);
      return out;
    }
  }
  throw new Error(`randomBinairoSolution: échec n=${n}`);
}

/** Indices = solution dont on garde chaque case avec probabilité num/den (unicité NON garantie). */
export function randomBinairoPuzzle(rng: Rng, n: number, num: number, den: number): BinairoSolvedPuzzle {
  const solution = randomBinairoSolution(rng, n);
  const givens = solution.map((v) => (rng.chance(num, den) ? v : 0) as BinairoCell);
  return { size: n, givens, solution };
}

/**
 * Puzzle à solution unique et minimal (chaque indice restant est nécessaire) : on retire les cases
 * dans un ordre aléatoire tant que l'oracle exact conclut à l'unicité. `keep` ∈ [0, 1] arrête le retrait
 * quand la proportion d'indices tombe sous ce seuil (puzzles plus faciles).
 */
export function randomUniqueBinairo(rng: Rng, n: number, keep = 0): BinairoSolvedPuzzle {
  const solution = randomBinairoSolution(rng, n);
  const givens: BinairoCell[] = [...solution];
  const order = rng.shuffle(Array.from({ length: n * n }, (_, i) => i));
  let count = n * n;
  for (const cell of order) {
    if (count <= keep * n * n) break;
    givens[cell] = 0;
    if (countBinairoSolutions({ size: n, givens }, 2) === 1) count--;
    else givens[cell] = solution[cell]!;
  }
  return { size: n, givens, solution };
}
