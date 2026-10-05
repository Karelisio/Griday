/**
 * Générateur de grilles Binairo V1 (données + solution unique, résolubles par logique pure).
 *
 * FICHIER FIGÉ (V1) : le puzzle du jour dépend de chaque tirage, ordre de parcours et plafond de ce fichier.
 * Ne JAMAIS le modifier (freeze.test.ts en vérifie l'empreinte) : toute évolution = copie dans v2/, activée
 * à une date future. Dépendances : Rng (core/prng.ts, figé), ./solver.ts et ./util.ts (figés).
 * Le solveur exhaustif d'exact.ts n'est PAS utilisé ici (il peut évoluer) : l'unicité découle de la
 * résolution logique (déductions sûres jusqu'à la grille pleine) ; les tests la vérifient avec exact.ts.
 *
 * Une tentative :
 * 1. Grille complète aléatoire (règles 1 à 3) : rangée par rangée, candidates = lignes valides compatibles
 *    (rangées distinctes, pas de triplet vertical, quotas des colonnes), mélangées puis essayées dans l'ordre
 *    (retour arrière, colonnes toujours complétables) ; colonnes distinctes vérifiées une fois la grille pleine.
 *    Passes courtes recommencées en cas d'enlisement (budget de nœuds par passe, nombre de passes borné).
 * 2. Creusement en deux phases, cases dans un ordre mélangé (le même pour les deux phases) :
 *    phase 1 : chaque donnée est retirée si la grille reste résoluble avec les techniques du palier
 *    inférieur (niveau ≤ LEVEL_BY_TIER[t - 1]) ; phase 2 : idem avec celles du palier visé.
 *    La grille de phase 1 étant minimale pour le palier inférieur, toute donnée retirée en phase 2 rend une
 *    technique du palier visé nécessaire : palier atteint ssi la phase 2 retire au moins une donnée.
 *    Palier 1 : une seule phase (niveau ≤ 3). Résolubilité : fermeture rapide (createBinairoChecker), arrêtée
 *    dès que la case retirée se déduit.
 * Arithmétique entière, ordres de parcours fixes, aucun hasard hors `rng`.
 */
import type { Rng } from '../../core/prng';
import type { DifficultyTier } from '../../core/types';
import type { BinairoCell, BinairoSolvedPuzzle, BinairoSymbol } from '../types';
import { createBinairoChecker, type BinairoLogicChecker } from './solver';
import { EMPTY, linePatterns, SYM_A, SYM_B, V1_MAX_SIZE, V1_MIN_SIZE } from './util';

/** Niveau de technique maximal de chaque palier (profil V1 : 3 = count, 4 = line, 5 = unique, 6 = contradiction). */
export const LEVEL_BY_TIER: Readonly<Record<DifficultyTier, number>> = Object.freeze({ 1: 3, 2: 4, 3: 5, 4: 6 });

/** Nœuds max d'une passe de la recherche de grille complète ; au-delà, nouvelle passe (nouveaux tirages). */
const GRID_NODES_PER_PASS = 100;
/** Passes max ; au-delà, la tentative échoue. */
const GRID_PASSES = 40;

/**
 * Grille complète aléatoire respectant les trois règles (masques de rangées, bit c à 1 ⇔ symbole A en colonne c),
 * null si toutes les passes échouent. Recherche à queue lourde : passes courtes recommencées (le flux du PRNG
 * continue), et chaque colonne doit rester complétable (quotas sans triplet, compte tenu de sa série finale).
 */
export function randomBinairoGrid(rng: Rng, n: number): Int32Array | null {
  if (!Number.isInteger(n) || n < V1_MIN_SIZE || n > V1_MAX_SIZE || n % 2 !== 0) throw new RangeError(`Binairo V1 : taille invalide ${n}`);
  const pats = linePatterns(n);
  const P = pats.length;
  const half = n >> 1;
  const full = (1 << n) - 1;
  const rows = new Int32Array(n);
  const used = new Uint8Array(P);
  const colA = new Int32Array(n);
  const cand = new Int32Array(n * P);
  let nodes = 0;
  let aborted = false;

  const columnsDistinct = (): boolean => {
    const cols = new Int32Array(n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) cols[c] = cols[c]! | (((rows[r]! >>> c) & 1) << r);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) if (cols[i] === cols[j]) return false;
    }
    return true;
  };

  /**
   * Après la rangée r : chaque colonne peut-elle encore recevoir ses x symboles A et y symboles B sans triplet ?
   * Série finale de t symboles X : les X restants tiennent dans (2 − t) + 2 × (autres restants), les autres
   * dans 2 × (X restants + 1).
   */
  const columnsFeasible = (r: number): boolean => {
    const k = n - r - 1;
    if (k === 0) return true;
    for (let c = 0; c < n; c++) {
      const x = half - colA[c]!;
      const y = k - x;
      if (y < 0) return false;
      const v0 = (rows[r]! >>> c) & 1;
      const t = r >= 1 && ((rows[r - 1]! >>> c) & 1) === v0 ? 2 : 1;
      const same = v0 === 1 ? x : y;
      const other = v0 === 1 ? y : x;
      if (same > 2 - t + 2 * other || other > 2 * (same + 1)) return false;
    }
    return true;
  };

  const rec = (r: number): boolean => {
    if (r === n) return columnsDistinct();
    if (++nodes > GRID_NODES_PER_PASS) {
      aborted = true;
      return false;
    }
    // Colonnes déjà pourvues de n/2 symboles A (resp. B) : plus de A (resp. B) possible.
    let noA = 0;
    let noB = 0;
    for (let c = 0; c < n; c++) {
      if (colA[c] === half) noA |= 1 << c;
      if (r - colA[c]! === half) noB |= 1 << c;
    }
    const a1 = r >= 1 ? rows[r - 1]! : 0;
    const b1 = r >= 1 ? full & ~a1 : 0;
    const a2 = r >= 2 ? rows[r - 2]! : 0;
    const b2 = r >= 2 ? full & ~a2 : 0;
    const base = r * P;
    let k = 0;
    for (let i = 0; i < P; i++) {
      const x = pats[i]!;
      if (used[i] === 1 || (x & noA) !== 0 || (full & ~x & noB) !== 0) continue;
      if (r >= 2 && ((a1 & a2 & x) | (b1 & b2 & ~x)) !== 0) continue;
      cand[base + k++] = i;
    }
    // Mélange de Fisher–Yates des candidates (tirages par rejet du PRNG).
    for (let i = k - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const tmp = cand[base + i]!;
      cand[base + i] = cand[base + j]!;
      cand[base + j] = tmp;
    }
    for (let i = 0; i < k; i++) {
      const idx = cand[base + i]!;
      const x = pats[idx]!;
      rows[r] = x;
      used[idx] = 1;
      for (let c = 0; c < n; c++) colA[c] = colA[c]! + ((x >>> c) & 1);
      if (columnsFeasible(r) && rec(r + 1)) return true;
      for (let c = 0; c < n; c++) colA[c] = colA[c]! - ((x >>> c) & 1);
      used[idx] = 0;
      if (aborted) return false;
    }
    return false;
  };

  for (let pass = 0; pass < GRID_PASSES; pass++) {
    nodes = 0;
    aborted = false;
    used.fill(0);
    colA.fill(0);
    if (rec(0)) return rows;
  }
  return null;
}

/**
 * Creuse la grille pleine `cells` (modifiée) : retire chaque donnée, dans l'ordre `order`, si la grille reste
 * résoluble avec les techniques de niveau ≤ `level`. Renvoie le nombre de données retirées.
 */
function dig(checker: BinairoLogicChecker, cells: number[], order: readonly number[], level: number): number {
  let removed = 0;
  for (const cell of order) {
    const v = cells[cell]!;
    if (v === EMPTY) continue;
    cells[cell] = EMPTY;
    if (checker.solves(cells, level, cell)) removed++;
    else cells[cell] = v;
  }
  return removed;
}

/**
 * Un candidat pour (taille, palier) : grille à solution unique, résoluble par logique avec les techniques du
 * palier, ou null (budget de grille épuisé, ou phase 2 sans retrait : palier visé non atteint).
 */
export function generateBinairoCandidate(rng: Rng, n: number, tier: DifficultyTier): BinairoSolvedPuzzle | null {
  if (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 4) throw new RangeError(`Binairo V1 : palier invalide ${String(tier)}`);
  const grid = randomBinairoGrid(rng, n);
  if (grid === null) return null;
  const total = n * n;
  const solution = new Array<BinairoSymbol>(total);
  for (let cell = 0; cell < total; cell++) solution[cell] = ((grid[Math.floor(cell / n)]! >>> cell % n) & 1) === 1 ? SYM_A : SYM_B;
  const order = rng.shuffle(Array.from({ length: total }, (_, i) => i));
  const cells: number[] = [...solution];
  const checker = createBinairoChecker(n);
  if (tier === 1) dig(checker, cells, order, LEVEL_BY_TIER[1]);
  else {
    dig(checker, cells, order, LEVEL_BY_TIER[(tier - 1) as DifficultyTier]);
    if (dig(checker, cells, order, LEVEL_BY_TIER[tier]) === 0) return null;
  }
  return { size: n, givens: cells as BinairoCell[], solution };
}
