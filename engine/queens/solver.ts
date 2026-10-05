/**
 * Solveur LOGIQUE de Queens (déductions humaines) et notation de difficulté.
 *
 * RÈGLE DE GEL — le générateur V1 accepte ou rejette des grilles d'après
 * rateQueens(p, QUEENS_TECHNIQUES_V1) : après publication, ce résultat ne doit JAMAIS changer.
 * - Ne jamais modifier QUEENS_TECHNIQUES_V1 (ordre, niveaux, poids, paliers).
 * - Ne jamais modifier le comportement d'une technique existante (définition, ordre de parcours,
 *   regroupement des éliminations en étapes, critère de choix).
 * - Nouvelle technique ou correction = NOUVEL identifiant + NOUVEAU profil (QUEENS_TECHNIQUES_V2…)
 *   employé par une nouvelle version du générateur. Les tests « golden » de solver.test.ts verrouillent V1.
 *
 * Boucle : la PREMIÈRE technique du profil qui s'applique produit UNE étape, puis on repart du début
 * du profil. Poser une reine élimine aussitôt sa ligne, sa colonne, sa région et ses 8 voisines
 * (conséquence silencieuse, pas une étape). Chaque étape pose une reine ou élimine au moins une case :
 * au plus n + n² tours. Arithmétique entière uniquement (une ligne = un masque de colonnes).
 *
 * Ordres de parcours (figés) : unités = régions 0..n-1, puis lignes 0..n-1, puis colonnes 0..n-1 ;
 * cases = index croissant (ligne par ligne).
 *
 * Techniques V1 (niveau, poids) :
 * - single (1, 1) : unité sans reine avec une seule candidate → reine.
 * - region-line (2, 2) : candidates d'une région toutes dans une ligne (sinon : une colonne) → les autres
 *   candidates de cette ligne sont éliminées. Régions 0..n-1, ligne puis colonne.
 * - line-region (2, 2) : candidates d'une ligne (puis d'une colonne) toutes dans une région → les autres
 *   candidates de la région sont éliminées. Lignes 0..n-1, puis colonnes 0..n-1.
 * - attack (3, 4) : unité U (≥ 2 candidates) ; toute candidate X dont la reine éliminerait toutes les
 *   candidates de U est éliminée. Une étape = une unité U et tous ses X. Unités par nombre de
 *   candidates croissant, puis ordre des unités.
 * - locked-pair (4, 10) : k = 2 ; locked-set (5, 20) : 3 ≤ k ≤ ⌊m/2⌋ (m = reines manquantes).
 *   k unités sources dont les candidates tiennent dans k unités cibles → les autres candidates des cibles
 *   sont éliminées. Pour chaque k croissant, formes : régions→lignes, régions→colonnes, lignes→régions,
 *   colonnes→régions ; combinaisons en ordre lexicographique. Dualité : k sources d'une forme ⇔ m−k
 *   sources de la forme duale (mêmes éliminations), d'où k ≤ ⌊m/2⌋ ; k = 1 ou m−1 relève du niveau 2.
 * - contradiction (6, 30) : hypothèse « reine en X », propagée par single, region-line, line-region
 *   (une étape à la fois, dans cet ordre) jusqu'au point fixe ; si une unité se vide, X est éliminée.
 *   Toutes les hypothèses avancent en parallèle : on retient la réfutation la plus COURTE (en étapes),
 *   à égalité la plus petite case X. Une seule case par étape.
 *
 * Palier : niveau max ≤ 2 → 1 (facile), 3 → 2 (moyen), 4 → 3 (difficile), 5–6 → 4 (expert).
 * Score : somme des poids des étapes. Le niveau max ne dépend pas des ordres de parcours (techniques
 * monotones : il vaut le plus petit k tel que les techniques de niveau ≤ k suffisent).
 */
import type { DifficultyRating, DifficultyTier } from '../core/types';
import { popcount32 } from './exact';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, QUEENS_MAX_SIZE, type QueensMark, type QueensPuzzle } from './types';

export type QueensTechnique =
  | 'single'
  | 'region-line'
  | 'line-region'
  | 'attack'
  | 'locked-pair'
  | 'locked-set'
  | 'contradiction';

export type QueensUnitKind = 'region' | 'row' | 'column';

export interface QueensUnitRef {
  readonly kind: QueensUnitKind;
  readonly index: number;
}

/**
 * Une étape de raisonnement, assez détaillée pour être expliquée par l'UI (aucun texte ici).
 * - single : units = [l'unité], cells = [la case], place = [la case].
 * - region-line / line-region : units = [unité dont toutes les candidates tiennent dans la cible],
 *   targets = [la cible], cells = candidates de `units`.
 * - attack : units = [unité U menacée], cells = candidates de U, eliminate = cases X.
 * - locked-pair / locked-set : units = k sources, targets = k cibles, cells = candidates des sources.
 * - contradiction : cells = [X], units = [unité vidée], chain = étapes déduites de l'hypothèse.
 */
export interface QueensStep {
  readonly technique: QueensTechnique;
  readonly level: number;
  /** Reine posée (0 ou 1 case). Les éliminations automatiques qui en découlent ne sont pas listées. */
  readonly place: readonly number[];
  /** Cases éliminées, triées. */
  readonly eliminate: readonly number[];
  /** Unités qui portent le raisonnement (triées par index). */
  readonly units: readonly QueensUnitRef[];
  /** Unités où ont lieu les éliminations (region-line, line-region, locked-*), sinon vide. */
  readonly targets: readonly QueensUnitRef[];
  /** Cases pivots, triées. */
  readonly cells: readonly number[];
  /** contradiction : étapes (single, region-line, line-region) déduites de l'hypothèse, sinon vide. */
  readonly chain: readonly QueensStep[];
}

export interface QueensTechniqueSpec {
  readonly id: QueensTechnique;
  /** Niveau (1..6) : fait partie de la spécification. */
  readonly level: number;
  /** Points de score par étape. */
  readonly weight: number;
}

export interface QueensProfile {
  readonly id: string;
  /** Ordre d'essai, niveaux croissants. */
  readonly techniques: readonly QueensTechniqueSpec[];
  /** Palier selon le niveau max utilisé (index = niveau ; 0 = aucune étape). */
  readonly tierByLevel: readonly DifficultyTier[];
}

function freezeProfile(p: QueensProfile): QueensProfile {
  p.techniques.forEach((t) => Object.freeze(t));
  Object.freeze(p.techniques);
  Object.freeze(p.tierByLevel);
  return Object.freeze(p);
}

/** Profil V1 — FIGÉ (voir l'en-tête). */
export const QUEENS_TECHNIQUES_V1: QueensProfile = freezeProfile({
  id: 'queens-v1',
  techniques: [
    { id: 'single', level: 1, weight: 1 },
    { id: 'region-line', level: 2, weight: 2 },
    { id: 'line-region', level: 2, weight: 2 },
    { id: 'attack', level: 3, weight: 4 },
    { id: 'locked-pair', level: 4, weight: 10 },
    { id: 'locked-set', level: 5, weight: 20 },
    { id: 'contradiction', level: 6, weight: 30 },
  ],
  tierByLevel: [1, 1, 1, 2, 3, 4, 4],
});

/** Profil réduit aux techniques de niveau ≤ maxLevel (mêmes poids et paliers). */
export function restrictQueensProfile(profile: QueensProfile, maxLevel: number): QueensProfile {
  return freezeProfile({
    id: `${profile.id}/max${maxLevel}`,
    techniques: profile.techniques.filter((t) => t.level <= maxLevel).map((t) => ({ ...t })),
    tierByLevel: [...profile.tierByLevel],
  });
}

export interface QueensSolveOptions {
  /** Profil de techniques (défaut : V1). */
  readonly profile?: QueensProfile;
  /** Ignore les techniques de niveau supérieur. */
  readonly maxLevel?: number;
  /** État de départ : reines (avec leurs éliminations automatiques) et croix. */
  readonly initialMarks?: readonly QueensMark[];
}

/** solved : n reines ; stuck : plus aucune technique ; contradiction : état de départ impossible. */
export type QueensLogicStatus = 'solved' | 'stuck' | 'contradiction';

export interface QueensLogicResult {
  readonly status: QueensLogicStatus;
  readonly solved: boolean;
  readonly steps: readonly QueensStep[];
  /** Niveau le plus élevé utilisé (0 si aucune étape). */
  readonly maxLevel: number;
  /** Nombre d'étapes par niveau (index = niveau, l'index 0 vaut toujours 0). */
  readonly levelCounts: readonly number[];
  readonly score: number;
  /** Technique utilisée la plus haute dans l'ordre du profil, 'none' si aucune étape. */
  readonly hardest: QueensTechnique | 'none';
  /** État final : MARK_QUEEN = reine, MARK_CROSS = éliminée, MARK_EMPTY = encore candidate. */
  readonly marks: readonly QueensMark[];
}

export interface QueensRating extends DifficultyRating {
  /** Faux : les techniques du profil ne suffisent pas (le générateur rejette la grille). */
  readonly solvable: boolean;
  /** Technique la plus difficile utilisée ; 'unsolvable' si non résolue. */
  readonly hardest: QueensTechnique | 'none' | 'unsolvable';
  readonly steps: number;
  readonly maxLevel: number;
  readonly levelCounts: readonly number[];
}

// ─── Représentation interne ────────────────────────────────────────────────────────────────────

const REGION = 0;
const ROW = 1;
const COLUMN = 2;
const KIND_NAMES: readonly QueensUnitKind[] = ['region', 'row', 'column'];

// État = Int32Array : masques des unités résolues, nombre de reines, candidates, reines.
const S_ROWS = 0;
const S_COLS = 1;
const S_REGS = 2;
const S_QUEENS = 3;
/** s[S_CAND + r] : colonnes candidates de la ligne r (reines exclues). s[S_CAND + n + r] : colonne de sa reine, -1 sinon. */
const S_CAND = 4;

interface Ctx {
  readonly n: number;
  readonly full: number;
  /** Longueur d'un état. */
  readonly size: number;
  readonly region: Int32Array;
  readonly rowOf: Int32Array;
  readonly colOf: Int32Array;
  /** regRow[g * n + r] : colonnes de la région g dans la ligne r. */
  readonly regRow: Int32Array;
  /** Lignes occupées par la région g. */
  readonly regRows: Int32Array;
  /** attack[x * n + i] : colonnes de la ligne i attaquées par une reine en x (x exclue). */
  readonly attack: Int32Array;
  // Dernière trouvaille : éliminations par ligne, reine posée, unités sources et cibles (masques d'index).
  readonly elim: Int32Array;
  place: number;
  srcKind: number;
  srcMask: number;
  dstKind: number;
  dstMask: number;
  /** contradiction : case de l'hypothèse réfutée. */
  hyp: number;
  // Tampons.
  readonly inter: Int32Array;
  readonly counts: Int32Array;
  readonly cells: Int32Array;
  readonly lockIdx: Int32Array;
  readonly lockMask: Int32Array;
  readonly lockCount: Int32Array;
  hypViews: Int32Array[] | null;
  hypCells: Int32Array | null;
  hypAlive: Uint8Array | null;
}

function ctz(x: number): number {
  return 31 - Math.clz32(x & -x);
}

function createCtx(p: QueensPuzzle): Ctx {
  const n = p.size;
  if (!Number.isInteger(n) || n < 1 || n > QUEENS_MAX_SIZE) throw new RangeError(`Queens : taille invalide ${n}`);
  const total = n * n;
  if (p.regions.length !== total) throw new RangeError(`Queens : ${p.regions.length} régions pour ${total} cases`);
  const full = (1 << n) - 1;
  const region = new Int32Array(total);
  const rowOf = new Int32Array(total);
  const colOf = new Int32Array(total);
  const regRow = new Int32Array(n * n);
  const regRows = new Int32Array(n);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cell = r * n + c;
      const g = p.regions[cell]!;
      if (!Number.isInteger(g) || g < 0 || g >= n) throw new RangeError(`Queens : région invalide ${g}`);
      region[cell] = g;
      rowOf[cell] = r;
      colOf[cell] = c;
      regRow[g * n + r] = regRow[g * n + r]! | (1 << c);
      regRows[g] = regRows[g]! | (1 << r);
    }
  }
  const attack = new Int32Array(total * n);
  for (let x = 0; x < total; x++) {
    const rx = rowOf[x]!;
    const bit = 1 << colOf[x]!;
    const adj = ((bit << 1) | bit | (bit >>> 1)) & full;
    const gb = region[x]! * n;
    for (let i = 0; i < n; i++) {
      attack[x * n + i] =
        i === rx ? full & ~bit : bit | regRow[gb + i]! | (i === rx - 1 || i === rx + 1 ? adj : 0);
    }
  }
  return {
    n,
    full,
    size: S_CAND + 2 * n,
    region,
    rowOf,
    colOf,
    regRow,
    regRows,
    attack,
    elim: new Int32Array(n),
    place: -1,
    srcKind: -1,
    srcMask: 0,
    dstKind: -1,
    dstMask: 0,
    hyp: -1,
    inter: new Int32Array(n),
    counts: new Int32Array(3 * n),
    cells: new Int32Array(total),
    lockIdx: new Int32Array(4 * n),
    lockMask: new Int32Array(4 * n),
    lockCount: new Int32Array(4),
    hypViews: null,
    hypCells: null,
    hypAlive: null,
  };
}

function setFinding(ctx: Ctx, place: number, srcKind: number, srcMask: number, dstKind: number, dstMask: number): true {
  ctx.place = place;
  ctx.srcKind = srcKind;
  ctx.srcMask = srcMask;
  ctx.dstKind = dstKind;
  ctx.dstMask = dstMask;
  return true;
}

function placeQueen(ctx: Ctx, s: Int32Array, cell: number): void {
  const n = ctx.n;
  const r = ctx.rowOf[cell]!;
  const bit = 1 << ctx.colOf[cell]!;
  const g = ctx.region[cell]!;
  const gb = g * n;
  const adj = ((bit << 1) | bit | (bit >>> 1)) & ctx.full;
  for (let i = 0; i < n; i++) s[S_CAND + i] = s[S_CAND + i]! & ~(bit | ctx.regRow[gb + i]!);
  s[S_CAND + r] = 0;
  if (r > 0) s[S_CAND + r - 1] = s[S_CAND + r - 1]! & ~adj;
  if (r < n - 1) s[S_CAND + r + 1] = s[S_CAND + r + 1]! & ~adj;
  s[S_CAND + n + r] = ctx.colOf[cell]!;
  s[S_ROWS] = s[S_ROWS]! | (1 << r);
  s[S_COLS] = s[S_COLS]! | bit;
  s[S_REGS] = s[S_REGS]! | (1 << g);
  s[S_QUEENS] = s[S_QUEENS]! + 1;
}

function applyElim(ctx: Ctx, s: Int32Array, elim: Int32Array): void {
  for (let r = 0; r < ctx.n; r++) s[S_CAND + r] = s[S_CAND + r]! & ~elim[r]!;
}

/** Candidates de l'unité dans la ligne r. */
function unitRowMask(ctx: Ctx, s: Int32Array, kind: number, idx: number, r: number): number {
  const m = s[S_CAND + r]!;
  if (kind === REGION) return m & ctx.regRow[idx * ctx.n + r]!;
  if (kind === ROW) return r === idx ? m : 0;
  return m & (1 << idx);
}

/** Lignes où la région g a des candidates. */
function regionRows(ctx: Ctx, s: Int32Array, g: number): number {
  const gb = g * ctx.n;
  let rows = ctx.regRows[g]!;
  let res = 0;
  while (rows !== 0) {
    const low = rows & -rows;
    rows ^= low;
    if ((s[S_CAND + ctz(low)]! & ctx.regRow[gb + ctz(low)]!) !== 0) res |= low;
  }
  return res;
}

/** Première unité non résolue sans candidate, codée kind * 16 + index ; -1 si aucune. */
function emptyUnit(ctx: Ctx, s: Int32Array): number {
  const n = ctx.n;
  const regs = s[S_REGS]!;
  for (let g = 0; g < n; g++) {
    if (((regs >>> g) & 1) === 0 && regionRows(ctx, s, g) === 0) return REGION * 16 + g;
  }
  const rows = s[S_ROWS]!;
  let any = 0;
  for (let r = 0; r < n; r++) {
    const m = s[S_CAND + r]!;
    if (m === 0 && ((rows >>> r) & 1) === 0) return ROW * 16 + r;
    any |= m;
  }
  const missing = ctx.full & ~any & ~s[S_COLS]!;
  return missing !== 0 ? COLUMN * 16 + ctz(missing) : -1;
}

// ─── Techniques : chaque recherche remplit la trouvaille (ctx) sans modifier l'état ─────────────

/** L1 — unité à candidate unique : régions, lignes, colonnes. */
function findSingle(ctx: Ctx, s: Int32Array): boolean {
  const n = ctx.n;
  const regs = s[S_REGS]!;
  for (let g = 0; g < n; g++) {
    if ((regs >>> g) & 1) continue;
    const gb = g * n;
    let rows = ctx.regRows[g]!;
    let cell = -1;
    while (rows !== 0) {
      const low = rows & -rows;
      rows ^= low;
      const r = ctz(low);
      const m = s[S_CAND + r]! & ctx.regRow[gb + r]!;
      if (m === 0) continue;
      if (cell >= 0 || (m & (m - 1)) !== 0) {
        cell = -2;
        break;
      }
      cell = r * n + ctz(m);
    }
    if (cell >= 0) return singleFound(ctx, cell, REGION, g);
  }
  for (let r = 0; r < n; r++) {
    const m = s[S_CAND + r]!;
    if (m !== 0 && (m & (m - 1)) === 0) return singleFound(ctx, r * n + ctz(m), ROW, r);
  }
  let ones = 0;
  let twos = 0;
  for (let r = 0; r < n; r++) {
    const m = s[S_CAND + r]!;
    twos |= ones & m;
    ones |= m;
  }
  const singles = ones & ~twos;
  if (singles !== 0) {
    const c = ctz(singles);
    for (let r = 0; r < n; r++) {
      if ((s[S_CAND + r]! >>> c) & 1) return singleFound(ctx, r * n + c, COLUMN, c);
    }
  }
  return false;
}

function singleFound(ctx: Ctx, cell: number, kind: number, idx: number): true {
  ctx.elim.fill(0);
  return setFinding(ctx, cell, kind, 1 << idx, -1, 0);
}

/** L2 — région contenue dans une ligne (puis une colonne) : le reste de la ligne est éliminé. */
function findRegionLine(ctx: Ctx, s: Int32Array): boolean {
  const n = ctx.n;
  const elim = ctx.elim;
  const regs = s[S_REGS]!;
  for (let g = 0; g < n; g++) {
    if ((regs >>> g) & 1) continue;
    const gb = g * n;
    let rows = ctx.regRows[g]!;
    let rowsMask = 0;
    let colsMask = 0;
    while (rows !== 0) {
      const low = rows & -rows;
      rows ^= low;
      const m = s[S_CAND + ctz(low)]! & ctx.regRow[gb + ctz(low)]!;
      if (m !== 0) {
        rowsMask |= low;
        colsMask |= m;
      }
    }
    if (rowsMask !== 0 && (rowsMask & (rowsMask - 1)) === 0) {
      const r = ctz(rowsMask);
      const e = s[S_CAND + r]! & ~ctx.regRow[gb + r]!;
      if (e !== 0) {
        elim.fill(0);
        elim[r] = e;
        return setFinding(ctx, -1, REGION, 1 << g, ROW, rowsMask);
      }
    }
    if (colsMask !== 0 && (colsMask & (colsMask - 1)) === 0) {
      let any = 0;
      for (let i = 0; i < n; i++) {
        const e = s[S_CAND + i]! & colsMask & ~ctx.regRow[gb + i]!;
        elim[i] = e;
        any |= e;
      }
      if (any !== 0) return setFinding(ctx, -1, REGION, 1 << g, COLUMN, colsMask);
    }
  }
  return false;
}

/** L2 — ligne (puis colonne) contenue dans une région : le reste de la région est éliminé. */
function findLineRegion(ctx: Ctx, s: Int32Array): boolean {
  const n = ctx.n;
  const elim = ctx.elim;
  for (let r = 0; r < n; r++) {
    let m = s[S_CAND + r]!;
    let regsMask = 0;
    while (m !== 0) {
      const low = m & -m;
      m ^= low;
      regsMask |= 1 << ctx.region[r * n + ctz(low)]!;
    }
    if (regsMask === 0 || (regsMask & (regsMask - 1)) !== 0) continue;
    const gb = ctz(regsMask) * n;
    let any = 0;
    for (let i = 0; i < n; i++) {
      const e = i === r ? 0 : s[S_CAND + i]! & ctx.regRow[gb + i]!;
      elim[i] = e;
      any |= e;
    }
    if (any !== 0) return setFinding(ctx, -1, ROW, 1 << r, REGION, regsMask);
  }
  for (let c = 0; c < n; c++) {
    const bit = 1 << c;
    let regsMask = 0;
    for (let r = 0; r < n; r++) {
      if (s[S_CAND + r]! & bit) regsMask |= 1 << ctx.region[r * n + c]!;
    }
    if (regsMask === 0 || (regsMask & (regsMask - 1)) !== 0) continue;
    const gb = ctz(regsMask) * n;
    let any = 0;
    for (let i = 0; i < n; i++) {
      const e = s[S_CAND + i]! & ctx.regRow[gb + i]! & ~bit;
      elim[i] = e;
      any |= e;
    }
    if (any !== 0) return setFinding(ctx, -1, COLUMN, bit, REGION, regsMask);
  }
  return false;
}

/** L3 — attaque : unités par nombre de candidates croissant (≥ 2), puis régions, lignes, colonnes. */
function findAttack(ctx: Ctx, s: Int32Array): boolean {
  const n = ctx.n;
  const counts = ctx.counts;
  let maxCount = 0;
  for (let u = 0; u < 3 * n; u++) {
    const kind = u < n ? REGION : u < 2 * n ? ROW : COLUMN;
    let cnt = 0;
    for (let r = 0; r < n; r++) cnt += popcount32(unitRowMask(ctx, s, kind, u - kind * n, r));
    counts[u] = cnt;
    if (cnt > maxCount) maxCount = cnt;
  }
  for (let k = 2; k <= maxCount; k++) {
    for (let u = 0; u < 3 * n; u++) {
      if (counts[u] !== k) continue;
      const kind = u < n ? REGION : u < 2 * n ? ROW : COLUMN;
      if (attackUnit(ctx, s, kind, u - kind * n)) return true;
    }
  }
  return false;
}

/** Candidates de l'unité dans ctx.cells (ordre croissant) ; renvoie leur nombre. */
function unitCells(ctx: Ctx, s: Int32Array, kind: number, idx: number): number {
  const n = ctx.n;
  let k = 0;
  for (let r = 0; r < n; r++) {
    let m = unitRowMask(ctx, s, kind, idx, r);
    while (m !== 0) {
      const low = m & -m;
      m ^= low;
      ctx.cells[k++] = r * n + ctz(low);
    }
  }
  return k;
}

/** Intersection des cases attaquant toutes les candidates de l'unité (elles-mêmes exclues d'office). */
function attackUnit(ctx: Ctx, s: Int32Array, kind: number, idx: number): boolean {
  const n = ctx.n;
  const inter = ctx.inter;
  const k = unitCells(ctx, s, kind, idx);
  inter.fill(ctx.full);
  for (let j = 0; j < k; j++) {
    const base = ctx.cells[j]! * n;
    let any = 0;
    for (let i = 0; i < n; i++) {
      const v = inter[i]! & ctx.attack[base + i]!;
      inter[i] = v;
      any |= v & s[S_CAND + i]!;
    }
    if (any === 0) return false;
  }
  for (let i = 0; i < n; i++) ctx.elim[i] = inter[i]! & s[S_CAND + i]!;
  return setFinding(ctx, -1, kind, 1 << idx, -1, 0);
}

// Formes des ensembles bloqués : sources → cibles.
const FORM_SRC = [REGION, REGION, ROW, COLUMN] as const;
const FORM_DST = [ROW, COLUMN, REGION, REGION] as const;

/** L4 / L5 — k unités sources tenant dans k unités cibles, kMin ≤ k ≤ min(kMax, ⌊m/2⌋). */
function findLocked(ctx: Ctx, s: Int32Array, kMin: number, kMax: number): boolean {
  const n = ctx.n;
  const kHi = Math.min(kMax, (n - s[S_QUEENS]!) >> 1);
  if (kHi < kMin) return false;
  // Masques des cibles occupées par chaque source non résolue, pour chaque forme.
  const counts = ctx.lockCount;
  counts.fill(0);
  const regs = s[S_REGS]!;
  for (let g = 0; g < n; g++) {
    if ((regs >>> g) & 1) continue;
    const gb = g * n;
    let rowsMask = 0;
    let colsMask = 0;
    for (let r = 0; r < n; r++) {
      const m = s[S_CAND + r]! & ctx.regRow[gb + r]!;
      if (m !== 0) {
        rowsMask |= 1 << r;
        colsMask |= m;
      }
    }
    pushSource(ctx, 0, g, rowsMask);
    pushSource(ctx, 1, g, colsMask);
  }
  const rowsDone = s[S_ROWS]!;
  for (let r = 0; r < n; r++) {
    if ((rowsDone >>> r) & 1) continue;
    let m = s[S_CAND + r]!;
    let regsMask = 0;
    while (m !== 0) {
      const low = m & -m;
      m ^= low;
      regsMask |= 1 << ctx.region[r * n + ctz(low)]!;
    }
    pushSource(ctx, 2, r, regsMask);
  }
  const colsDone = s[S_COLS]!;
  for (let c = 0; c < n; c++) {
    if ((colsDone >>> c) & 1) continue;
    let regsMask = 0;
    for (let r = 0; r < n; r++) {
      if ((s[S_CAND + r]! >>> c) & 1) regsMask |= 1 << ctx.region[r * n + c]!;
    }
    pushSource(ctx, 3, c, regsMask);
  }
  for (let k = kMin; k <= kHi; k++) {
    for (let form = 0; form < 4; form++) {
      if (lockedSearch(ctx, s, form, k, 0, 0, 0, 0)) return true;
    }
  }
  return false;
}

function pushSource(ctx: Ctx, form: number, idx: number, mask: number): void {
  const k = ctx.lockCount[form]!;
  ctx.lockIdx[form * ctx.n + k] = idx;
  ctx.lockMask[form * ctx.n + k] = mask;
  ctx.lockCount[form] = k + 1;
}

/** Combinaisons de k sources (ordre lexicographique), élaguées dès que l'union dépasse k cibles. */
function lockedSearch(
  ctx: Ctx,
  s: Int32Array,
  form: number,
  k: number,
  start: number,
  depth: number,
  union: number,
  set: number,
): boolean {
  if (depth === k) return popcount32(union) === k && lockedElim(ctx, s, form, set, union);
  const base = form * ctx.n;
  const count = ctx.lockCount[form]!;
  for (let i = start; i <= count - (k - depth); i++) {
    const u = union | ctx.lockMask[base + i]!;
    if (popcount32(u) > k) continue;
    if (lockedSearch(ctx, s, form, k, i + 1, depth + 1, u, set | (1 << ctx.lockIdx[base + i]!))) return true;
  }
  return false;
}

/** Éliminations d'un ensemble bloqué (sources `set`, cibles `targets`) ; vrai si non vide. */
function lockedElim(ctx: Ctx, s: Int32Array, form: number, set: number, targets: number): boolean {
  const n = ctx.n;
  const regionsMask = form < 2 ? set : targets;
  let any = 0;
  for (let i = 0; i < n; i++) {
    let inRegions = 0;
    let g = regionsMask;
    while (g !== 0) {
      const low = g & -g;
      g ^= low;
      inRegions |= ctx.regRow[ctz(low) * n + i]!;
    }
    const m = s[S_CAND + i]!;
    let e: number;
    if (form === 0) e = (targets >>> i) & 1 ? m & ~inRegions : 0;
    else if (form === 1) e = m & targets & ~inRegions;
    else if (form === 2) e = (set >>> i) & 1 ? 0 : m & inRegions;
    else e = m & inRegions & ~set;
    ctx.elim[i] = e;
    any |= e;
  }
  return any !== 0 && setFinding(ctx, -1, FORM_SRC[form]!, set, FORM_DST[form]!, targets);
}

/** Propagation d'une hypothèse : une étape single / region-line / line-region ; faux au point fixe. */
function propagateOne(ctx: Ctx, s: Int32Array): boolean {
  if (findSingle(ctx, s)) {
    placeQueen(ctx, s, ctx.place);
    return true;
  }
  if (findRegionLine(ctx, s) || findLineRegion(ctx, s)) {
    applyElim(ctx, s, ctx.elim);
    return true;
  }
  return false;
}

/**
 * L6 — contradiction. Toutes les hypothèses (cases candidates, ordre croissant) avancent d'une étape
 * par tour ; la première (plus petite case) qui vide une unité au tour le plus précoce est retenue.
 */
function findContradiction(ctx: Ctx, s: Int32Array): boolean {
  const n = ctx.n;
  if (ctx.hypViews === null) {
    const total = n * n;
    const pool = new Int32Array(total * ctx.size);
    ctx.hypViews = Array.from({ length: total }, (_, i) => pool.subarray(i * ctx.size, (i + 1) * ctx.size));
    ctx.hypCells = new Int32Array(total);
    ctx.hypAlive = new Uint8Array(total);
  }
  const views = ctx.hypViews;
  const cells = ctx.hypCells!;
  const alive = ctx.hypAlive!;
  let count = 0;
  for (let r = 0; r < n; r++) {
    let m = s[S_CAND + r]!;
    while (m !== 0) {
      const low = m & -m;
      m ^= low;
      const cell = r * n + ctz(low);
      const v = views[count]!;
      v.set(s);
      placeQueen(ctx, v, cell);
      cells[count] = cell;
      alive[count] = 1;
      count++;
    }
  }
  for (;;) {
    for (let i = 0; i < count; i++) {
      if (alive[i] === 0) continue;
      const u = emptyUnit(ctx, views[i]!);
      if (u < 0) continue;
      const x = cells[i]!;
      ctx.elim.fill(0);
      ctx.elim[ctx.rowOf[x]!] = 1 << ctx.colOf[x]!;
      ctx.hyp = x;
      return setFinding(ctx, -1, u >> 4, 1 << (u & 15), -1, 0);
    }
    let progressed = false;
    for (let i = 0; i < count; i++) {
      if (alive[i] === 0) continue;
      if (propagateOne(ctx, views[i]!)) progressed = true;
      else alive[i] = 0;
    }
    if (!progressed) return false;
  }
}

type Finder = (ctx: Ctx, s: Int32Array) => boolean;

/** Implémentations par identifiant : le comportement d'un identifiant publié est figé. */
const FINDERS: Readonly<Record<QueensTechnique, Finder>> = {
  single: findSingle,
  'region-line': findRegionLine,
  'line-region': findLineRegion,
  attack: findAttack,
  'locked-pair': (ctx, s) => findLocked(ctx, s, 2, 2),
  'locked-set': (ctx, s) => findLocked(ctx, s, 3, QUEENS_MAX_SIZE),
  contradiction: findContradiction,
};

/** Techniques de propagation d'une hypothèse (niveaux fixés par la définition de contradiction). */
const CHAIN_SPECS: Readonly<Record<'single' | 'region-line' | 'line-region', QueensTechniqueSpec>> = {
  single: { id: 'single', level: 1, weight: 0 },
  'region-line': { id: 'region-line', level: 2, weight: 0 },
  'line-region': { id: 'line-region', level: 2, weight: 0 },
};

// ─── Description des étapes (allocations : seulement quand on enregistre) ───────────────────────

function unitRefs(kind: number, mask: number): QueensUnitRef[] {
  const out: QueensUnitRef[] = [];
  while (mask !== 0) {
    const low = mask & -mask;
    mask ^= low;
    out.push({ kind: KIND_NAMES[kind]!, index: ctz(low) });
  }
  return out;
}

function maskCells(ctx: Ctx, masks: Int32Array): number[] {
  const out: number[] = [];
  for (let r = 0; r < ctx.n; r++) {
    let m = masks[r]!;
    while (m !== 0) {
      const low = m & -m;
      m ^= low;
      out.push(r * ctx.n + ctz(low));
    }
  }
  return out;
}

/** Candidates (triées) des unités `mask` de type `kind`. */
function unitsCells(ctx: Ctx, s: Int32Array, kind: number, mask: number): number[] {
  const rowMasks = new Int32Array(ctx.n);
  for (let r = 0; r < ctx.n; r++) {
    let u = mask;
    while (u !== 0) {
      const low = u & -u;
      u ^= low;
      rowMasks[r] = rowMasks[r]! | unitRowMask(ctx, s, kind, ctz(low), r);
    }
  }
  return maskCells(ctx, rowMasks);
}

/** Décrit la trouvaille courante (état `s` AVANT application). */
function describe(ctx: Ctx, s: Int32Array, spec: QueensTechniqueSpec): QueensStep {
  if (spec.id === 'contradiction') {
    const x = ctx.hyp;
    const failed = unitRefs(ctx.srcKind, ctx.srcMask);
    return {
      technique: spec.id,
      level: spec.level,
      place: [],
      eliminate: [x],
      units: failed,
      targets: [],
      cells: [x],
      chain: contradictionChain(ctx, s, x),
    };
  }
  return {
    technique: spec.id,
    level: spec.level,
    place: ctx.place >= 0 ? [ctx.place] : [],
    eliminate: maskCells(ctx, ctx.elim),
    units: unitRefs(ctx.srcKind, ctx.srcMask),
    targets: ctx.dstKind >= 0 ? unitRefs(ctx.dstKind, ctx.dstMask) : [],
    cells: unitsCells(ctx, s, ctx.srcKind, ctx.srcMask),
    chain: [],
  };
}

/** Rejoue la propagation de l'hypothèse x (même suite que findContradiction) en décrivant chaque étape. */
function contradictionChain(ctx: Ctx, s: Int32Array, x: number): QueensStep[] {
  const v = s.slice();
  placeQueen(ctx, v, x);
  const chain: QueensStep[] = [];
  while (emptyUnit(ctx, v) < 0) {
    const spec = findSingle(ctx, v)
      ? CHAIN_SPECS.single
      : findRegionLine(ctx, v)
        ? CHAIN_SPECS['region-line']
        : findLineRegion(ctx, v)
          ? CHAIN_SPECS['line-region']
          : null;
    if (spec === null) break; // impossible : cette propagation a vidé une unité
    const place = ctx.place;
    const pending = ctx.elim.slice();
    chain.push(describe(ctx, v, spec));
    if (place >= 0) placeQueen(ctx, v, place);
    applyElim(ctx, v, pending);
  }
  return chain;
}

// ─── Boucle de résolution ─────────────────────────────────────────────────────────────────────

/** État initial depuis des marques ; null si deux reines s'attaquent. */
function initialState(ctx: Ctx, marks: readonly QueensMark[] | undefined): Int32Array | null {
  const n = ctx.n;
  const s = new Int32Array(ctx.size);
  for (let r = 0; r < n; r++) {
    s[S_CAND + r] = ctx.full;
    s[S_CAND + n + r] = -1;
  }
  if (marks === undefined) return s;
  if (marks.length !== n * n) throw new RangeError(`Queens : ${marks.length} marques pour ${n * n} cases`);
  for (let cell = 0; cell < n * n; cell++) {
    if (marks[cell] !== MARK_QUEEN) continue;
    if (((s[S_CAND + ctx.rowOf[cell]!]! >>> ctx.colOf[cell]!) & 1) === 0) return null;
    placeQueen(ctx, s, cell);
  }
  for (let cell = 0; cell < n * n; cell++) {
    if (marks[cell] !== MARK_CROSS) continue;
    const r = ctx.rowOf[cell]!;
    s[S_CAND + r] = s[S_CAND + r]! & ~(1 << ctx.colOf[cell]!);
  }
  return s;
}

function stateMarks(ctx: Ctx, s: Int32Array): QueensMark[] {
  const n = ctx.n;
  const marks = new Array<QueensMark>(n * n);
  for (let cell = 0; cell < n * n; cell++) {
    const r = ctx.rowOf[cell]!;
    const c = ctx.colOf[cell]!;
    marks[cell] =
      s[S_CAND + n + r] === c ? MARK_QUEEN : ((s[S_CAND + r]! >>> c) & 1) !== 0 ? MARK_EMPTY : MARK_CROSS;
  }
  return marks;
}

function profileTechniques(profile: QueensProfile, maxLevel: number): QueensTechniqueSpec[] {
  let prev = 0;
  for (const t of profile.techniques) {
    if (!(t.id in FINDERS)) throw new RangeError(`Queens : technique inconnue "${t.id}"`);
    if (!Number.isInteger(t.level) || t.level < 1 || t.level < prev) {
      throw new RangeError(`Queens : niveaux du profil "${profile.id}" non croissants`);
    }
    prev = t.level;
  }
  return profile.techniques.filter((t) => t.level <= maxLevel);
}

interface RunResult {
  readonly status: QueensLogicStatus;
  readonly steps: QueensStep[];
  readonly stepCount: number;
  readonly levelCounts: number[];
  readonly score: number;
  readonly maxLevel: number;
  readonly hardest: QueensTechnique | 'none';
}

function run(
  ctx: Ctx,
  s: Int32Array | null,
  techs: readonly QueensTechniqueSpec[],
  levels: number,
  record: boolean,
): RunResult {
  const n = ctx.n;
  const steps: QueensStep[] = [];
  const levelCounts = new Array<number>(levels).fill(0);
  const pending = new Int32Array(n);
  let stepCount = 0;
  let score = 0;
  let maxLevel = 0;
  let hardest = -1;
  let status: QueensLogicStatus;
  for (;;) {
    if (s === null || emptyUnit(ctx, s) >= 0) {
      status = 'contradiction';
      break;
    }
    if (s[S_QUEENS] === n) {
      status = 'solved';
      break;
    }
    let t = 0;
    while (t < techs.length && !FINDERS[techs[t]!.id](ctx, s)) t++;
    if (t === techs.length) {
      status = 'stuck';
      break;
    }
    const spec = techs[t]!;
    const place = ctx.place;
    pending.set(ctx.elim);
    if (record) steps.push(describe(ctx, s, spec));
    if (place >= 0) placeQueen(ctx, s, place);
    applyElim(ctx, s, pending);
    stepCount++;
    levelCounts[spec.level] = levelCounts[spec.level]! + 1;
    score += spec.weight;
    if (spec.level > maxLevel) maxLevel = spec.level;
    if (t > hardest) hardest = t;
  }
  return {
    status,
    steps,
    stepCount,
    levelCounts,
    score,
    maxLevel,
    hardest: hardest >= 0 ? techs[hardest]!.id : 'none',
  };
}

function levelSlots(profile: QueensProfile): number {
  let max = profile.tierByLevel.length - 1;
  for (const t of profile.techniques) if (t.level > max) max = t.level;
  return max + 1;
}

/** Résout par logique pure en appliquant toujours l'étape la plus facile. */
export function solveQueensLogically(p: QueensPuzzle, opts: QueensSolveOptions = {}): QueensLogicResult {
  const profile = opts.profile ?? QUEENS_TECHNIQUES_V1;
  const ctx = createCtx(p);
  const techs = profileTechniques(profile, opts.maxLevel ?? Number.MAX_SAFE_INTEGER);
  const s = initialState(ctx, opts.initialMarks);
  const res = run(ctx, s, techs, levelSlots(profile), true);
  return {
    status: res.status,
    solved: res.status === 'solved',
    steps: res.steps,
    maxLevel: res.maxLevel,
    levelCounts: res.levelCounts,
    score: res.score,
    hardest: res.hardest,
    marks: s === null ? [...(opts.initialMarks ?? [])] : stateMarks(ctx, s),
  };
}

/** Note de difficulté (même boucle que solveQueensLogically, sans décrire les étapes). */
export function rateQueens(p: QueensPuzzle, profile: QueensProfile = QUEENS_TECHNIQUES_V1): QueensRating {
  const ctx = createCtx(p);
  const techs = profileTechniques(profile, Number.MAX_SAFE_INTEGER);
  const res = run(ctx, initialState(ctx, undefined), techs, levelSlots(profile), false);
  const solvable = res.status === 'solved';
  const tiers = profile.tierByLevel;
  return {
    tier: solvable ? tiers[Math.min(res.maxLevel, tiers.length - 1)]! : 4,
    score: res.score,
    hardest: solvable ? res.hardest : 'unsolvable',
    solvable,
    steps: res.stepCount,
    maxLevel: res.maxLevel,
    levelCounts: res.levelCounts,
  };
}

/** Prochaine étape la plus facile depuis des marques (reines + croix) ; null si résolu, bloqué ou incohérent. */
export function nextQueensStep(
  p: QueensPuzzle,
  marks: readonly QueensMark[],
  profile: QueensProfile = QUEENS_TECHNIQUES_V1,
): QueensStep | null {
  const ctx = createCtx(p);
  const s = initialState(ctx, marks);
  if (s === null || s[S_QUEENS] === ctx.n || emptyUnit(ctx, s) >= 0) return null;
  for (const spec of profileTechniques(profile, Number.MAX_SAFE_INTEGER)) {
    if (FINDERS[spec.id](ctx, s)) return describe(ctx, s, spec);
  }
  return null;
}
