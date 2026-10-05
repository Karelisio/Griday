import type { QueensPuzzle } from './types';

/** Nombre de bits à 1 d'un entier 32 bits. */
export function popcount32(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

export interface ExactResult {
  /** Nombre de solutions trouvées (plafonné à `limit`). */
  readonly count: number;
  /** Solutions trouvées (colonne par ligne), dans l'ordre de parcours déterministe. */
  readonly solutions: number[][];
  /** Nœuds explorés. */
  readonly nodes: number;
  /** Faux si le budget de nœuds a été épuisé : `count` n'est alors qu'une borne inférieure. */
  readonly complete: boolean;
}

const ROW = 0;
const COL = 1;
const REGION = 2;

/**
 * Recherche exhaustive des solutions (au plus `limit`), en branchant à chaque nœud
 * sur l'unité (ligne, colonne ou région) ayant le moins de cases candidates.
 * Candidats stockés en masques de bits par ligne. Parcours entièrement déterministe.
 */
export function solveQueensExact(p: QueensPuzzle, limit = 2, maxNodes = 1_000_000): ExactResult {
  if (!(limit >= 1) || !(maxNodes >= 0)) throw new RangeError(`solveQueensExact: limit=${limit}, maxNodes=${maxNodes}`);
  const n = p.size;
  const full = (1 << n) - 1;
  const regions = p.regions;
  // regionRowMask[g * n + r] = colonnes de la ligne r appartenant à la région g.
  const regionRowMask = new Int32Array(n * n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) regionRowMask[regions[r * n + c]! * n + r]! |= 1 << c;
  }

  // Pile de masques : niveau d = d-ième reine posée.
  const rows = new Int32Array(n * (n + 1));
  rows.fill(full, 0, n);
  const queenCol = new Int32Array(n).fill(-1);
  const solutions: number[][] = [];
  let count = 0;
  let nodes = 0;
  let complete = true;

  const place = (to: number, r: number, c: number): void => {
    const g = regions[r * n + c]!;
    const bit = 1 << c;
    const adj = ((bit << 1) | bit | (bit >>> 1)) & full;
    for (let i = 0; i < n; i++) rows[to + i] = rows[to + i]! & ~(bit | regionRowMask[g * n + i]!);
    rows[to + r] = 0;
    if (r > 0) rows[to + r - 1] = rows[to + r - 1]! & ~adj;
    if (r < n - 1) rows[to + r + 1] = rows[to + r + 1]! & ~adj;
  };

  // Renvoie vrai pour arrêter la recherche.
  const search = (depth: number, rowDone: number, colDone: number, regDone: number): boolean => {
    if (depth === n) {
      count++;
      solutions.push(Array.from(queenCol));
      return count >= limit;
    }
    if (++nodes > maxNodes) {
      complete = false;
      return true;
    }
    const base = depth * n;

    let bestKind = -1;
    let bestIdx = -1;
    let best = Number.MAX_SAFE_INTEGER;
    for (let r = 0; r < n; r++) {
      if ((rowDone >>> r) & 1) continue;
      const cnt = popcount32(rows[base + r]!);
      if (cnt === 0) return false;
      if (cnt < best) {
        best = cnt;
        bestKind = ROW;
        bestIdx = r;
      }
    }
    for (let c = 0; c < n; c++) {
      if ((colDone >>> c) & 1) continue;
      let cnt = 0;
      for (let r = 0; r < n; r++) cnt += (rows[base + r]! >>> c) & 1;
      if (cnt === 0) return false;
      if (cnt < best) {
        best = cnt;
        bestKind = COL;
        bestIdx = c;
      }
    }
    for (let g = 0; g < n; g++) {
      if ((regDone >>> g) & 1) continue;
      let cnt = 0;
      for (let r = 0; r < n; r++) cnt += popcount32(rows[base + r]! & regionRowMask[g * n + r]!);
      if (cnt === 0) return false;
      if (cnt < best) {
        best = cnt;
        bestKind = REGION;
        bestIdx = g;
      }
    }

    const next = base + n;
    for (let r = 0; r < n; r++) {
      let mask: number;
      if (bestKind === ROW) mask = r === bestIdx ? rows[base + r]! : 0;
      else if (bestKind === COL) mask = rows[base + r]! & (1 << bestIdx);
      else mask = rows[base + r]! & regionRowMask[bestIdx * n + r]!;
      while (mask !== 0) {
        const low = mask & -mask;
        const c = 31 - Math.clz32(low);
        mask ^= low;
        for (let i = 0; i < n; i++) rows[next + i] = rows[base + i]!;
        place(next, r, c);
        queenCol[r] = c;
        const g = regions[r * n + c]!;
        const stop = search(depth + 1, rowDone | (1 << r), colDone | (1 << c), regDone | (1 << g));
        queenCol[r] = -1;
        if (stop) return true;
      }
    }
    return false;
  };

  search(0, 0, 0, 0);
  return { count, solutions, nodes, complete };
}

/** Nombre de solutions plafonné à `limit` (−1 si budget épuisé avant conclusion). */
export function countQueensSolutions(p: QueensPuzzle, limit = 2, maxNodes = 1_000_000): number {
  const res = solveQueensExact(p, limit, maxNodes);
  return res.complete || res.count >= limit ? res.count : -1;
}
