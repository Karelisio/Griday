import type { BinairoPuzzle } from './types';

/*
 * Solveur exhaustif INDÉPENDANT (oracle de vérification) : aucun code partagé avec le solveur logique
 * ni avec le générateur.
 * - Motif = ligne valide (n/2 symboles de chaque sorte, jamais trois identiques consécutifs), en masque :
 *   bit i à 1 ⇔ la position i porte le symbole B (2). Rangées 0..n-1 (bit = colonne), colonnes n..2n-1 (bit = rangée).
 * - Propagation par ligne jusqu'au point fixe : motifs compatibles avec les cases connues, hors copie d'une
 *   ligne parallèle complète (règle 3) ; 0 motif → impasse ; cases communes à tous les motifs → posées.
 *   Une ligne complète doit être un motif valide et distinct des autres lignes complètes.
 * - Branchement sur la ligne incomplète ayant le moins de motifs (départage : rangées puis colonnes,
 *   index croissant), motifs en ordre numérique croissant. Parcours entièrement déterministe.
 */

/** Taille maximale acceptée par l'oracle (masques et tables de motifs). */
export const BINAIRO_EXACT_MAX_SIZE = 16;

export interface BinairoExactResult {
  /** Nombre de solutions trouvées (plafonné à `limit`). */
  readonly count: number;
  /** Solutions (n² cases valant 1 ou 2, ligne par ligne), dans l'ordre de parcours déterministe. */
  readonly solutions: (1 | 2)[][];
  /** Nœuds explorés (feuilles comprises). */
  readonly nodes: number;
  /** Faux si le budget de nœuds a été épuisé : `count` n'est alors qu'une borne inférieure. */
  readonly complete: boolean;
}

interface LineTables {
  /** Motifs valides, croissants. */
  readonly patterns: Int32Array;
  /** valid[m] = 1 si le masque m est un motif valide. */
  readonly valid: Uint8Array;
}

const TABLES = new Map<number, LineTables>();

function lineTables(n: number): LineTables {
  let t = TABLES.get(n);
  if (t) return t;
  const full = (1 << n) - 1;
  const valid = new Uint8Array(full + 1);
  const out: number[] = [];
  for (let m = 0; m <= full; m++) {
    let ones = 0;
    for (let v = m; v !== 0; v &= v - 1) ones++;
    const z = ~m & full;
    if (ones !== n / 2 || (m & (m >>> 1) & (m >>> 2)) !== 0 || (z & (z >>> 1) & (z >>> 2)) !== 0) continue;
    valid[m] = 1;
    out.push(m);
  }
  t = { patterns: Int32Array.from(out), valid };
  TABLES.set(n, t);
  return t;
}

/**
 * Recherche exhaustive des solutions (au plus `limit`), bornée par `maxNodes` nœuds.
 * Accepte toute grille paire 2 ≤ n ≤ 16 aux données de forme correcte (RangeError sinon) ;
 * des données contradictoires (triplet, quota dépassé, lignes complètes identiques) donnent 0 solution.
 */
export function solveBinairoExact(p: BinairoPuzzle, limit = 2, maxNodes = 1_000_000): BinairoExactResult {
  if (!(limit >= 1) || !(maxNodes >= 0)) throw new RangeError(`solveBinairoExact: limit=${limit}, maxNodes=${maxNodes}`);
  const n = p.size;
  if (!Number.isInteger(n) || n < 2 || n > BINAIRO_EXACT_MAX_SIZE || n % 2 !== 0) {
    throw new RangeError(`solveBinairoExact: taille invalide ${n}`);
  }
  const givens = p.givens;
  if (givens.length !== n * n) throw new RangeError(`solveBinairoExact: ${givens.length} cases pour ${n * n}`);
  const full = (1 << n) - 1;
  const lines = 2 * n;
  const { patterns, valid } = lineTables(n);

  const known = new Int32Array(lines);
  const val = new Int32Array(lines);
  const setCell = (r: number, c: number, b: number): void => {
    known[r]! |= 1 << c;
    known[n + c]! |= 1 << r;
    if (b !== 0) {
      val[r]! |= 1 << c;
      val[n + c]! |= 1 << r;
    }
  };
  for (let i = 0; i < n * n; i++) {
    const v = givens[i];
    if (v === 0) continue;
    if (v !== 1 && v !== 2) throw new RangeError(`solveBinairoExact: valeur invalide ${String(v)} (case ${i})`);
    const r = Math.floor(i / n);
    setCell(r, i - r * n, v === 2 ? 1 : 0);
  }

  // stampTab[(famille << n) + m] === stamp ⇔ m est une ligne complète de la famille (passe courante).
  const stampTab = new Int32Array(2 << n);
  let stamp = 0;
  const counts = new Int32Array(lines);
  // Pile des états : profondeur ≤ 2n (chaque branchement complète au moins une ligne).
  const saved = new Int32Array(2 * lines * (lines + 2));
  const solutions: (1 | 2)[][] = [];
  let count = 0;
  let nodes = 0;
  let complete = true;

  /** Pose les cases `mask` de la ligne l à la valeur de `pat`. */
  const fill = (l: number, mask: number, pat: number): void => {
    for (let m = mask; m !== 0; m &= m - 1) {
      const i = 31 - Math.clz32(m & -m);
      const b = (pat >>> i) & 1;
      if (l < n) setCell(l, i, b);
      else setCell(i, l - n, b);
    }
  };

  /** Propagation jusqu'au point fixe ; faux si contradiction. `counts` est exact au point fixe. */
  const propagate = (): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      stamp++;
      for (let l = 0; l < lines; l++) {
        if (known[l] !== full) continue;
        const key = (l < n ? 0 : 1 << n) + val[l]!;
        if (valid[val[l]!] === 0 || stampTab[key] === stamp) return false;
        stampTab[key] = stamp;
      }
      for (let l = 0; l < lines; l++) {
        const k = known[l]!;
        if (k === full) {
          counts[l] = 1;
          continue;
        }
        const v = val[l]!;
        const off = l < n ? 0 : 1 << n;
        let cnt = 0;
        let and = full;
        let or = 0;
        for (let j = 0; j < patterns.length; j++) {
          const pat = patterns[j]!;
          if (((pat ^ v) & k) !== 0 || stampTab[off + pat] === stamp) continue;
          cnt++;
          and &= pat;
          or |= pat;
        }
        if (cnt === 0) return false;
        counts[l] = cnt;
        const free = ~k & full;
        const forcedB = and & free;
        const forcedA = ~or & free;
        if ((forcedA | forcedB) !== 0) {
          fill(l, forcedB, full);
          fill(l, forcedA, 0);
          changed = true;
        }
      }
    }
    return true;
  };

  // Renvoie vrai pour arrêter la recherche.
  const search = (depth: number): boolean => {
    if (++nodes > maxNodes) {
      complete = false;
      return true;
    }
    if (!propagate()) return false;

    let best = -1;
    let bestCount = Number.MAX_SAFE_INTEGER;
    for (let l = 0; l < lines; l++) {
      if (known[l] !== full && counts[l]! < bestCount) {
        bestCount = counts[l]!;
        best = l;
      }
    }
    if (best < 0) {
      count++;
      const sol = new Array<1 | 2>(n * n);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) sol[r * n + c] = (val[r]! >>> c) & 1 ? 2 : 1;
      }
      solutions.push(sol);
      return count >= limit;
    }

    // Motifs candidats de la ligne choisie (stampTab reflète le point fixe courant).
    const k = known[best]!;
    const v = val[best]!;
    const off = best < n ? 0 : 1 << n;
    const cands: number[] = [];
    for (let j = 0; j < patterns.length; j++) {
      const pat = patterns[j]!;
      if (((pat ^ v) & k) === 0 && stampTab[off + pat] !== stamp) cands.push(pat);
    }
    const base = depth * 2 * lines;
    saved.set(known, base);
    saved.set(val, base + lines);
    for (const pat of cands) {
      known.set(saved.subarray(base, base + lines));
      val.set(saved.subarray(base + lines, base + 2 * lines));
      fill(best, ~k & full, pat);
      if (search(depth + 1)) return true;
    }
    return false;
  };

  search(0);
  return { count, solutions, nodes, complete };
}

/** Nombre de solutions plafonné à `limit` (−1 si budget épuisé avant conclusion). */
export function countBinairoSolutions(p: BinairoPuzzle, limit = 2, maxNodes = 1_000_000): number {
  const res = solveBinairoExact(p, limit, maxNodes);
  return res.complete || res.count >= limit ? res.count : -1;
}
