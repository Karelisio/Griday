/**
 * Outils réservés aux tests : grilles aléatoires simples (croissance de régions naïve).
 * N'est PAS le générateur de production (voir generator.ts).
 */
import type { Rng } from '../core/prng';
import { canonicalizeRegions } from './encoding';
import { solveQueensExact } from './exact';
import type { QueensSolvedPuzzle } from './types';

/** Permutation aléatoire sans reines adjacentes (lignes consécutives : |Δcol| ≥ 2). */
export function randomQueensSolution(rng: Rng, n: number): number[] {
  const cols: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const rec = (r: number): boolean => {
    if (r === n) return true;
    const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
    for (const c of order) {
      if (used[c] || (r > 0 && Math.abs(cols[r - 1]! - c) <= 1)) continue;
      used[c] = true;
      cols.push(c);
      if (rec(r + 1)) return true;
      cols.pop();
      used[c] = false;
    }
    return false;
  };
  if (!rec(0)) throw new Error(`Aucune solution pour n=${n}`);
  return cols;
}

/** Régions grandies aléatoirement depuis les reines (solution valide, unicité NON garantie). */
export function randomQueensLayout(rng: Rng, n: number): QueensSolvedPuzzle {
  const solution = randomQueensSolution(rng, n);
  const regions = new Array<number>(n * n).fill(-1);
  solution.forEach((c, r) => (regions[r * n + c] = r));
  let remaining = n * n - n;
  while (remaining > 0) {
    const frontier: [number, number][] = [];
    for (let cell = 0; cell < n * n; cell++) {
      if (regions[cell] !== -1) continue;
      const r = Math.floor(cell / n);
      const c = cell % n;
      for (const nb of [r > 0 ? cell - n : -1, r < n - 1 ? cell + n : -1, c > 0 ? cell - 1 : -1, c < n - 1 ? cell + 1 : -1]) {
        if (nb >= 0 && regions[nb] !== -1) frontier.push([cell, regions[nb]!]);
      }
    }
    const [cell, g] = rng.pick(frontier);
    regions[cell] = g;
    remaining--;
  }
  return { size: n, regions: canonicalizeRegions(regions), solution };
}

function regionConnectedWithout(regions: readonly number[], n: number, g: number, removed: number): boolean {
  const cells: number[] = [];
  regions.forEach((x, i) => {
    if (x === g && i !== removed) cells.push(i);
  });
  if (cells.length === 0) return false;
  const seen = new Set<number>([cells[0]!]);
  const stack = [cells[0]!];
  while (stack.length > 0) {
    const cell = stack.pop()!;
    const r = Math.floor(cell / n);
    const c = cell % n;
    for (const nb of [r > 0 ? cell - n : -1, r < n - 1 ? cell + n : -1, c > 0 ? cell - 1 : -1, c < n - 1 ? cell + 1 : -1]) {
      if (nb >= 0 && nb !== removed && regions[nb] === g && !seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen.size === cells.length;
}

/**
 * Grille aléatoire à solution unique : croissance naïve puis raffinement
 * (une case d'une solution parasite change de région voisine, tant que les régions restent connexes).
 */
export function randomUniqueQueens(rng: Rng, n: number, maxTries = 200): QueensSolvedPuzzle | null {
  for (let t = 0; t < maxTries; t++) {
    const base = randomQueensLayout(rng, n);
    const regions = [...base.regions];
    const queenCells = new Set(base.solution.map((c, r) => r * n + c));
    for (let iter = 0; iter < 8 * n; iter++) {
      const res = solveQueensExact({ size: n, regions }, 2);
      // Unicité seulement si la recherche est concluante (budget de nœuds non épuisé).
      if (res.complete && res.count === 1) {
        return { size: n, regions: canonicalizeRegions(regions), solution: base.solution };
      }
      const alt = res.solutions.find((s) => s.some((c, r) => c !== base.solution[r]));
      if (!alt) break;
      const moves: [number, number][] = [];
      alt.forEach((c, r) => {
        const cell = r * n + c;
        if (queenCells.has(cell)) return;
        const g = regions[cell]!;
        if (!regionConnectedWithout(regions, n, g, cell)) return;
        for (const nb of [r > 0 ? cell - n : -1, r < n - 1 ? cell + n : -1, c > 0 ? cell - 1 : -1, c < n - 1 ? cell + 1 : -1]) {
          if (nb >= 0 && regions[nb] !== g) moves.push([cell, regions[nb]!]);
        }
      });
      if (moves.length === 0) break;
      const [cell, g] = rng.pick(moves);
      regions[cell] = g;
    }
  }
  return null;
}
