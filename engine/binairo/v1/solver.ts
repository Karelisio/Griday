/**
 * Solveur LOGIQUE de Binairo (déductions humaines) et notation de difficulté.
 *
 * FICHIER FIGÉ (V1) — le générateur V1 accepte ou rejette des grilles d'après
 * rateBinairo(p, BINAIRO_TECHNIQUES_V1) : ce fichier ne doit JAMAIS changer (freeze.test.ts).
 * Les indices (hint.ts) l'utilisent aussi : pour les faire évoluer (nouvelle technique, ordre,
 * performances), COPIER ce fichier en binairo/solver.ts et brancher hint.ts sur la copie.
 * Une V2 du générateur utilise sa propre copie (v2/solver.ts).
 *
 * Boucle : la PREMIÈRE technique du profil qui s'applique produit UNE étape (au moins une case posée), puis
 * on repart du début du profil : au plus n² tours. Arithmétique entière : une ligne = deux masques de
 * positions (symboles A, symboles B). Les cases données ne sont jamais remises en cause.
 *
 * Ordres de parcours (figés) : lignes = rangées 0..n-1 puis colonnes 0..n-1 ; positions croissantes dans
 * une ligne (colonne d'une rangée, rangée d'une colonne) ; cases = index croissant.
 *
 * Techniques V1 (niveau, poids) :
 * - pair (1, 1) : deux symboles identiques adjacents XX → les cases vides juste avant et juste après
 *   reçoivent l'autre symbole. Une étape = la première paire de la ligne ayant une extrémité vide.
 * - sandwich (2, 1) : X·X → la case du milieu reçoit l'autre symbole. Une étape = un sandwich.
 * - count (3, 2) : ligne qui compte déjà n/2 symboles X → toutes ses cases vides reçoivent l'autre symbole.
 * - line (4, 4) : analyse de ligne : parmi toutes les complétions valides de la ligne (règles 1 et 2,
 *   cases connues respectées), les cases de même valeur dans toutes sont posées (toutes en une étape).
 * - unique (5, 7) : ligne L à compléter et ligne parallèle COMPLÈTE M que L pourrait encore reproduire :
 *   la complétion égale à M étant exclue (règle 3), les cases communes aux complétions restantes sont posées.
 *   L dans l'ordre des lignes, puis M par index croissant (une seule ligne exclue par étape).
 * - contradiction (6, 12) : hypothèse « X en case x », propagée par pair, sandwich et count par tours (toutes
 *   les déductions de l'état courant appliquées ensemble) jusqu'à une règle enfreinte (triplet, symbole en
 *   excès, deux lignes complètes identiques) → x reçoit l'autre symbole. Toutes les hypothèses (cases
 *   croissantes, A puis B) avancent en parallèle : on retient la réfutation au tour le plus PRÉCOCE,
 *   à égalité la première dans cet ordre. Une seule case par étape.
 *
 * Palier : niveau max ≤ 3 → 1 (facile), 4 → 2 (moyen), 5 → 3 (difficile), 6 → 4 (expert).
 * Score : somme des poids des étapes. Le niveau max ne dépend pas des ordres de parcours (techniques
 * monotones : il vaut le plus petit k tel que les techniques de niveau ≤ k suffisent).
 */
import type { DifficultyRating, DifficultyTier } from '../../core/types';
import type { BinairoCell, BinairoPuzzle, BinairoSymbol } from '../types';
import { ctz32, EMPTY, linePatterns, popcount32, SYM_A, SYM_B, V1_MAX_SIZE } from './util';

export type BinairoTechnique = 'pair' | 'sandwich' | 'count' | 'line' | 'unique' | 'contradiction';

export type BinairoLineKind = 'row' | 'column';

export interface BinairoLineRef {
  readonly kind: BinairoLineKind;
  readonly index: number;
}

/** Case déduite et son symbole. */
export interface BinairoPlacement {
  readonly cell: number;
  readonly value: BinairoSymbol;
}

/**
 * Une étape de raisonnement, assez détaillée pour être expliquée par l'UI (aucun texte ici).
 * - pair : line = sa ligne, cells = les deux cases de la paire, place = extrémité(s) vide(s).
 * - sandwich : line, cells = les deux extrémités, place = la case du milieu.
 * - count : line, cells = les n/2 cases du symbole déjà complet, place = toutes les cases vides de la ligne.
 * - line : line, cells = cases déjà remplies de la ligne, place = toutes les cases fixées par l'analyse.
 * - unique : line = ligne à compléter, other = ligne complète qu'elle ne doit pas reproduire,
 *   cells = cases de `other`, place = cases fixées.
 * - contradiction : place = [case de l'hypothèse, avec le symbole opposé à l'hypothèse] ; line = ligne où une
 *   règle casse sous l'hypothèse ; other = seconde ligne si deux lignes complètes deviennent identiques
 *   (sinon null) ; cells = cases en faute dans l'état hypothétique (triplet, symbole en excès, lignes identiques).
 */
export interface BinairoStep {
  readonly technique: BinairoTechnique;
  readonly level: number;
  /** Cases déduites (au moins une, toutes vides avant l'étape), triées par case. */
  readonly place: readonly BinairoPlacement[];
  /** Cases pivots du raisonnement, triées. */
  readonly cells: readonly number[];
  /** Ligne où a lieu la déduction (toujours renseignée en V1). */
  readonly line: BinairoLineRef | null;
  /** unique : ligne complète comparée ; contradiction : seconde ligne identique ; sinon null. */
  readonly other: BinairoLineRef | null;
}

export interface BinairoTechniqueSpec {
  readonly id: BinairoTechnique;
  /** Niveau (1..6) : fait partie de la spécification. */
  readonly level: number;
  /** Points de score par étape. */
  readonly weight: number;
}

export interface BinairoProfile {
  readonly id: string;
  /** Ordre d'essai, niveaux croissants. */
  readonly techniques: readonly BinairoTechniqueSpec[];
  /** Palier selon le niveau max utilisé (index = niveau ; 0 = aucune étape). */
  readonly tierByLevel: readonly DifficultyTier[];
}

function freezeProfile(p: BinairoProfile): BinairoProfile {
  p.techniques.forEach((t) => Object.freeze(t));
  Object.freeze(p.techniques);
  Object.freeze(p.tierByLevel);
  return Object.freeze(p);
}

/** Profil V1 — FIGÉ (voir l'en-tête). */
export const BINAIRO_TECHNIQUES_V1: BinairoProfile = freezeProfile({
  id: 'binairo-v1',
  techniques: [
    { id: 'pair', level: 1, weight: 1 },
    { id: 'sandwich', level: 2, weight: 1 },
    { id: 'count', level: 3, weight: 2 },
    { id: 'line', level: 4, weight: 4 },
    { id: 'unique', level: 5, weight: 7 },
    { id: 'contradiction', level: 6, weight: 12 },
  ],
  tierByLevel: [1, 1, 1, 1, 2, 3, 4],
});

/** Profil réduit aux techniques de niveau ≤ maxLevel (mêmes poids et paliers). */
export function restrictBinairoProfile(profile: BinairoProfile, maxLevel: number): BinairoProfile {
  return freezeProfile({
    id: `${profile.id}/max${maxLevel}`,
    techniques: profile.techniques.filter((t) => t.level <= maxLevel).map((t) => ({ ...t })),
    tierByLevel: [...profile.tierByLevel],
  });
}

export interface BinairoSolveOptions {
  /** Profil de techniques (défaut : V1). */
  readonly profile?: BinairoProfile;
  /** Ignore les techniques de niveau supérieur. */
  readonly maxLevel?: number;
  /** État de départ : marques du joueur (n² cases ; ignorées sur les cases données). */
  readonly initialMarks?: readonly BinairoCell[];
}

/** solved : grille pleine ; stuck : plus aucune technique ; contradiction : état impossible (règle enfreinte). */
export type BinairoLogicStatus = 'solved' | 'stuck' | 'contradiction';

export interface BinairoLogicResult {
  readonly status: BinairoLogicStatus;
  readonly solved: boolean;
  readonly steps: readonly BinairoStep[];
  /** Niveau le plus élevé utilisé (0 si aucune étape). */
  readonly maxLevel: number;
  /** Nombre d'étapes par niveau (index = niveau, l'index 0 vaut toujours 0). */
  readonly levelCounts: readonly number[];
  readonly score: number;
  /** Technique utilisée la plus haute dans l'ordre du profil, 'none' si aucune étape. */
  readonly hardest: BinairoTechnique | 'none';
  /** État final (données, marques de départ et déductions), n² cases. */
  readonly marks: readonly BinairoCell[];
}

export interface BinairoRating extends DifficultyRating {
  /** Faux : les techniques du profil ne suffisent pas (le générateur rejette la grille). */
  readonly solvable: boolean;
  /** Technique la plus difficile utilisée ; 'unsolvable' si non résolue. */
  readonly hardest: BinairoTechnique | 'none' | 'unsolvable';
  readonly steps: number;
  readonly maxLevel: number;
  readonly levelCounts: readonly number[];
}

// ─── Représentation interne ────────────────────────────────────────────────────────────────────
//
// Lignes : 0..n-1 = rangées (position = colonne), n..2n-1 = colonnes (position = rangée).
// État = Int32Array : s[l] = positions des A de la ligne l, s[L + l] = positions des B (L = 2n),
// s[2L] = nombre de cases remplies. Un ensemble de lignes = masque de 2n bits (≤ 28).

interface Ctx {
  readonly n: number;
  readonly half: number;
  readonly full: number;
  /** Nombre de lignes (2n). */
  readonly lines: number;
  /** Longueur d'un état. */
  readonly size: number;
  readonly patterns: Int32Array;
  readonly rowOf: Int32Array;
  readonly colOf: Int32Array;
  // Dernière trouvaille : ligne, positions posées (A, B), positions pivots, autre ligne, hypothèse réfutée.
  line: number;
  placeA: number;
  placeB: number;
  pivot: number;
  other: number;
  hypCell: number;
  hypValue: number;
  // Résultat d'une analyse de ligne (positions forcées A / B).
  fa: number;
  fb: number;
  // Cache de l'analyse de ligne : contenu (A, B) → positions forcées et nombre de complétions.
  readonly cacheA: Int32Array;
  readonly cacheB: Int32Array;
  readonly cacheFA: Int32Array;
  readonly cacheFB: Int32Array;
  readonly cacheCnt: Int32Array;
  // Tampons.
  readonly buf: Int32Array;
  readonly roundFA: Int32Array;
  readonly roundFB: Int32Array;
  scratch: Int32Array | null;
  hypViews: Int32Array[] | null;
  hypCells: Int32Array | null;
  hypValues: Int32Array | null;
  hypDirty: Int32Array | null;
  hypAlive: Uint8Array | null;
}

function createCtx(n: number): Ctx {
  if (!Number.isInteger(n) || n < 2 || n > V1_MAX_SIZE || n % 2 !== 0) throw new RangeError(`Binairo : taille invalide ${n}`);
  const lines = 2 * n;
  const total = n * n;
  const rowOf = new Int32Array(total);
  const colOf = new Int32Array(total);
  for (let cell = 0; cell < total; cell++) {
    rowOf[cell] = Math.floor(cell / n);
    colOf[cell] = cell % n;
  }
  const patterns = linePatterns(n);
  return {
    n,
    half: n >> 1,
    full: (1 << n) - 1,
    lines,
    size: 2 * lines + 1,
    patterns,
    rowOf,
    colOf,
    line: -1,
    placeA: 0,
    placeB: 0,
    pivot: 0,
    other: -1,
    hypCell: -1,
    hypValue: 0,
    fa: 0,
    fb: 0,
    cacheA: new Int32Array(lines).fill(-1),
    cacheB: new Int32Array(lines).fill(-1),
    cacheFA: new Int32Array(lines),
    cacheFB: new Int32Array(lines),
    cacheCnt: new Int32Array(lines),
    buf: new Int32Array(patterns.length),
    roundFA: new Int32Array(lines),
    roundFB: new Int32Array(lines),
    scratch: null,
    hypViews: null,
    hypCells: null,
    hypValues: null,
    hypDirty: null,
    hypAlive: null,
  };
}

function found(ctx: Ctx, line: number, placeA: number, placeB: number, pivot: number, other: number): true {
  ctx.line = line;
  ctx.placeA = placeA;
  ctx.placeB = placeB;
  ctx.pivot = pivot;
  ctx.other = other;
  return true;
}

/** Pose `sym` en (r, c) (case supposée vide). */
function setRC(ctx: Ctx, s: Int32Array, r: number, c: number, sym: number): void {
  const off = sym === SYM_A ? 0 : ctx.lines;
  s[off + r] = s[off + r]! | (1 << c);
  s[off + ctx.n + c] = s[off + ctx.n + c]! | (1 << r);
  s[2 * ctx.lines] = s[2 * ctx.lines]! + 1;
}

function isEmptyRC(ctx: Ctx, s: Int32Array, r: number, c: number): boolean {
  return (((s[r]! | s[ctx.lines + r]!) >>> c) & 1) === 0;
}

/** Pose `sym` sur les positions `mask` de la ligne l encore vides ; renvoie le masque des lignes modifiées. */
function applyMask(ctx: Ctx, s: Int32Array, l: number, mask: number, sym: number): number {
  const n = ctx.n;
  let changed = 0;
  let m = mask;
  while (m !== 0) {
    const low = m & -m;
    m ^= low;
    const pos = ctz32(low);
    const r = l < n ? l : pos;
    const c = l < n ? pos : l - n;
    if (!isEmptyRC(ctx, s, r, c)) continue;
    setRC(ctx, s, r, c, sym);
    changed |= (1 << r) | (1 << (n + c));
  }
  return changed;
}

/** Positions en faute d'une ligne (triplets, symbole en excès) ; 0 si aucune. */
function lineFault(ctx: Ctx, s: Int32Array, l: number): number {
  const a = s[l]!;
  const b = s[ctx.lines + l]!;
  const ta = a & (a >>> 1) & (a >>> 2);
  const tb = b & (b >>> 1) & (b >>> 2);
  let m = ta | (ta << 1) | (ta << 2) | tb | (tb << 1) | (tb << 2);
  if (popcount32(a) > ctx.half) m |= a;
  if (popcount32(b) > ctx.half) m |= b;
  return m;
}

/** Première ligne parallèle complète identique à la ligne l (si elle est complète), -1 sinon. */
function twinOf(ctx: Ctx, s: Int32Array, l: number): number {
  const n = ctx.n;
  const a = s[l]!;
  if ((a | s[ctx.lines + l]!) !== ctx.full) return -1;
  const from = l < n ? 0 : n;
  for (let m = from; m < from + n; m++) {
    if (m !== l && s[m] === a && (a | s[ctx.lines + m]!) === ctx.full) return m;
  }
  return -1;
}

/** Vrai si une règle est enfreinte quelque part. */
function stateFault(ctx: Ctx, s: Int32Array): boolean {
  for (let l = 0; l < ctx.lines; l++) {
    if (lineFault(ctx, s, l) !== 0 || twinOf(ctx, s, l) >= 0) return true;
  }
  return false;
}

/** Première faute parmi les lignes `dirty` (ordre croissant) : trouvaille line / pivot / other. */
function dirtyFault(ctx: Ctx, s: Int32Array, dirty: number): boolean {
  let d = dirty;
  while (d !== 0) {
    const low = d & -d;
    d ^= low;
    const l = ctz32(low);
    const m = lineFault(ctx, s, l);
    if (m !== 0) return found(ctx, l, 0, 0, m, -1);
    const twin = twinOf(ctx, s, l);
    if (twin >= 0) return found(ctx, l, 0, 0, ctx.full, twin);
  }
  return false;
}

/** Déductions de base (pair, sandwich, count) de la ligne l : positions forcées dans ctx.fa / ctx.fb. */
function basicForced(ctx: Ctx, s: Int32Array, l: number, pair: boolean, sandwich: boolean, count: boolean): void {
  const a = s[l]!;
  const b = s[ctx.lines + l]!;
  const e = ctx.full & ~(a | b);
  let fa = 0;
  let fb = 0;
  if (pair) {
    const pa = a & (a >>> 1);
    const pb = b & (b >>> 1);
    fb |= (pa << 2) | (pa >>> 1);
    fa |= (pb << 2) | (pb >>> 1);
  }
  if (sandwich) {
    fb |= (a & (a >>> 2)) << 1;
    fa |= (b & (b >>> 2)) << 1;
  }
  if (count) {
    if (popcount32(a) === ctx.half) fb |= e;
    if (popcount32(b) === ctx.half) fa |= e;
  }
  ctx.fa = fa & e;
  ctx.fb = fb & e;
}

/**
 * Un tour de déductions de base sur les lignes `dirty` : toutes calculées sur l'état courant puis posées
 * (lignes croissantes, A puis B ; une case déjà posée dans ce tour est laissée). Renvoie les lignes modifiées.
 */
function basicRound(ctx: Ctx, s: Int32Array, dirty: number, pair: boolean, sandwich: boolean, count: boolean): number {
  const fa = ctx.roundFA;
  const fb = ctx.roundFB;
  let d = dirty;
  while (d !== 0) {
    const low = d & -d;
    d ^= low;
    const l = ctz32(low);
    basicForced(ctx, s, l, pair, sandwich, count);
    fa[l] = ctx.fa;
    fb[l] = ctx.fb;
  }
  let changed = 0;
  d = dirty;
  while (d !== 0) {
    const low = d & -d;
    d ^= low;
    const l = ctz32(low);
    if (fa[l] !== 0) changed |= applyMask(ctx, s, l, fa[l]!, SYM_A);
    if (fb[l] !== 0) changed |= applyMask(ctx, s, l, fb[l]!, SYM_B);
  }
  return changed;
}

/** Analyse de la ligne l (avec cache) : positions forcées dans ctx.fa / ctx.fb ; renvoie le nombre de complétions. */
function analyzeLine(ctx: Ctx, s: Int32Array, l: number): number {
  const a = s[l]!;
  const b = s[ctx.lines + l]!;
  if (ctx.cacheA[l] === a && ctx.cacheB[l] === b) {
    ctx.fa = ctx.cacheFA[l]!;
    ctx.fb = ctx.cacheFB[l]!;
    return ctx.cacheCnt[l]!;
  }
  const pats = ctx.patterns;
  let and = ctx.full;
  let or = 0;
  let cnt = 0;
  for (let j = 0; j < pats.length; j++) {
    const p = pats[j]!;
    if (((p & b) | (a & ~p)) !== 0) continue;
    and &= p;
    or |= p;
    cnt++;
  }
  const e = ctx.full & ~(a | b);
  const fa = cnt > 0 ? and & e : 0;
  const fb = cnt > 0 ? ~or & e : 0;
  ctx.cacheA[l] = a;
  ctx.cacheB[l] = b;
  ctx.cacheFA[l] = fa;
  ctx.cacheFB[l] = fb;
  ctx.cacheCnt[l] = cnt;
  ctx.fa = fa;
  ctx.fb = fb;
  return cnt;
}

/** Vrai si une ligne incomplète n'a plus aucune complétion valide. */
function noCompletion(ctx: Ctx, s: Int32Array): boolean {
  for (let l = 0; l < ctx.lines; l++) {
    if ((s[l]! | s[ctx.lines + l]!) !== ctx.full && analyzeLine(ctx, s, l) === 0) return true;
  }
  return false;
}

// ─── Techniques : chaque recherche remplit la trouvaille (ctx) sans modifier l'état ─────────────

/** L1 — paire XX : extrémités vides → autre symbole. */
function findPair(ctx: Ctx, s: Int32Array): boolean {
  const L = ctx.lines;
  for (let l = 0; l < L; l++) {
    const a = s[l]!;
    const b = s[L + l]!;
    const e = ctx.full & ~(a | b);
    if (e === 0) continue;
    const pa = a & (a >>> 1);
    const pb = b & (b >>> 1);
    let m = pa | pb;
    while (m !== 0) {
      const low = m & -m;
      m ^= low;
      const ends = ((low << 2) | (low >>> 1)) & e;
      if (ends === 0) continue;
      const isA = (pa & low) !== 0;
      return found(ctx, l, isA ? 0 : ends, isA ? ends : 0, low | (low << 1), -1);
    }
  }
  return false;
}

/** L2 — sandwich X·X : la case du milieu reçoit l'autre symbole. */
function findSandwich(ctx: Ctx, s: Int32Array): boolean {
  const L = ctx.lines;
  for (let l = 0; l < L; l++) {
    const a = s[l]!;
    const b = s[L + l]!;
    const e = ctx.full & ~(a | b);
    if (e === 0) continue;
    const sa = a & (a >>> 2);
    const sb = b & (b >>> 2);
    let m = sa | sb;
    while (m !== 0) {
      const low = m & -m;
      m ^= low;
      const mid = (low << 1) & e;
      if (mid === 0) continue;
      const isA = (sa & low) !== 0;
      return found(ctx, l, isA ? 0 : mid, isA ? mid : 0, low | (low << 2), -1);
    }
  }
  return false;
}

/** L3 — comptage : n/2 symboles X dans la ligne → ses cases vides reçoivent l'autre symbole. */
function findCount(ctx: Ctx, s: Int32Array): boolean {
  const L = ctx.lines;
  for (let l = 0; l < L; l++) {
    const a = s[l]!;
    const b = s[L + l]!;
    const e = ctx.full & ~(a | b);
    if (e === 0) continue;
    if (popcount32(a) === ctx.half) return found(ctx, l, 0, e, a, -1);
    if (popcount32(b) === ctx.half) return found(ctx, l, e, 0, b, -1);
  }
  return false;
}

/** L4 — analyse de ligne : cases communes à toutes les complétions valides. */
function findLine(ctx: Ctx, s: Int32Array): boolean {
  const L = ctx.lines;
  for (let l = 0; l < L; l++) {
    const a = s[l]!;
    const b = s[L + l]!;
    if ((a | b) === ctx.full) continue;
    analyzeLine(ctx, s, l);
    if ((ctx.fa | ctx.fb) !== 0) return found(ctx, l, ctx.fa, ctx.fb, a | b, -1);
  }
  return false;
}

/** L5 — unicité : complétions de L privées de la ligne complète M (une seule M par étape). */
function findUnique(ctx: Ctx, s: Int32Array): boolean {
  const n = ctx.n;
  const L = ctx.lines;
  const full = ctx.full;
  let completeRows = 0;
  let completeCols = 0;
  for (let i = 0; i < n; i++) {
    if ((s[i]! | s[L + i]!) === full) completeRows |= 1 << i;
    if ((s[n + i]! | s[L + n + i]!) === full) completeCols |= 1 << i;
  }
  if ((completeRows | completeCols) === 0) return false;
  const pats = ctx.patterns;
  const buf = ctx.buf;
  for (let l = 0; l < L; l++) {
    const completes = l < n ? completeRows : completeCols;
    if (completes === 0) continue;
    const a = s[l]!;
    const b = s[L + l]!;
    const e = full & ~(a | b);
    if (e === 0) continue;
    let cnt = 0;
    for (let j = 0; j < pats.length; j++) {
      const p = pats[j]!;
      if (((p & b) | (a & ~p)) === 0) buf[cnt++] = p;
    }
    if (cnt < 2) continue;
    const from = l < n ? 0 : n;
    let ms = completes;
    while (ms !== 0) {
      const low = ms & -ms;
      ms ^= low;
      const m = from + ctz32(low);
      const pm = s[m]!;
      if (((pm & b) | (a & ~pm)) !== 0) continue; // M n'est plus une complétion possible de L
      let and = full;
      let or = 0;
      for (let k = 0; k < cnt; k++) {
        const p = buf[k]!;
        if (p === pm) continue;
        and &= p;
        or |= p;
      }
      const fa = and & e;
      const fb = ~or & e;
      if ((fa | fb) !== 0) return found(ctx, l, fa, fb, full, m);
    }
  }
  return false;
}

/** Réserve les tampons des hypothèses (2 par case). */
function hypBuffers(ctx: Ctx): Int32Array[] {
  if (ctx.hypViews === null) {
    const count = 2 * ctx.n * ctx.n;
    const pool = new Int32Array(count * ctx.size);
    ctx.hypViews = Array.from({ length: count }, (_, i) => pool.subarray(i * ctx.size, (i + 1) * ctx.size));
    ctx.hypCells = new Int32Array(count);
    ctx.hypValues = new Int32Array(count);
    ctx.hypDirty = new Int32Array(count);
    ctx.hypAlive = new Uint8Array(count);
  }
  return ctx.hypViews;
}

/** Lignes à relire en premier : toutes si l'état n'est pas fermé pour les déductions de base, sinon aucune. */
function openLines(ctx: Ctx, s: Int32Array): number {
  for (let l = 0; l < ctx.lines; l++) {
    basicForced(ctx, s, l, true, true, true);
    if ((ctx.fa | ctx.fb) !== 0) return (1 << ctx.lines) - 1;
  }
  return 0;
}

/**
 * L6 — contradiction. Toutes les hypothèses (cases vides croissantes, A puis B) avancent d'un tour à la fois ;
 * la première qui enfreint une règle au tour le plus précoce est retenue.
 */
function findContradiction(ctx: Ctx, s: Int32Array): boolean {
  const n = ctx.n;
  const views = hypBuffers(ctx);
  const cells = ctx.hypCells!;
  const values = ctx.hypValues!;
  const dirty = ctx.hypDirty!;
  const alive = ctx.hypAlive!;
  const base = openLines(ctx, s);
  let count = 0;
  for (let cell = 0; cell < n * n; cell++) {
    const r = ctx.rowOf[cell]!;
    const c = ctx.colOf[cell]!;
    if (!isEmptyRC(ctx, s, r, c)) continue;
    for (let sym = SYM_A; sym <= SYM_B; sym++) {
      const v = views[count]!;
      v.set(s);
      setRC(ctx, v, r, c, sym);
      cells[count] = cell;
      values[count] = sym;
      dirty[count] = base | (1 << r) | (1 << (n + c));
      alive[count] = 1;
      count++;
    }
  }
  for (;;) {
    for (let i = 0; i < count; i++) {
      if (alive[i] === 1 && dirtyFault(ctx, views[i]!, dirty[i]!)) {
        ctx.hypCell = cells[i]!;
        ctx.hypValue = values[i]!;
        return true;
      }
    }
    let progressed = false;
    for (let i = 0; i < count; i++) {
      if (alive[i] === 0) continue;
      const changed = basicRound(ctx, views[i]!, dirty[i]!, true, true, true);
      if (changed === 0) alive[i] = 0;
      else {
        dirty[i] = changed;
        progressed = true;
      }
    }
    if (!progressed) return false;
  }
}

type Finder = (ctx: Ctx, s: Int32Array) => boolean;

/** Implémentations par identifiant : le comportement d'un identifiant publié est figé. */
const FINDERS: Readonly<Record<BinairoTechnique, Finder>> = {
  pair: findPair,
  sandwich: findSandwich,
  count: findCount,
  line: findLine,
  unique: findUnique,
  contradiction: findContradiction,
};

/** Applique la trouvaille courante ; renvoie le masque des lignes modifiées. */
function applyFinding(ctx: Ctx, s: Int32Array, id: BinairoTechnique): number {
  if (id === 'contradiction') {
    const x = ctx.hypCell;
    const r = ctx.rowOf[x]!;
    const c = ctx.colOf[x]!;
    setRC(ctx, s, r, c, ctx.hypValue === SYM_A ? SYM_B : SYM_A);
    return (1 << r) | (1 << (ctx.n + c));
  }
  return applyMask(ctx, s, ctx.line, ctx.placeA, SYM_A) | applyMask(ctx, s, ctx.line, ctx.placeB, SYM_B);
}

// ─── Description des étapes (allocations : seulement quand on enregistre) ───────────────────────

function cellOf(ctx: Ctx, l: number, pos: number): number {
  return l < ctx.n ? l * ctx.n + pos : pos * ctx.n + (l - ctx.n);
}

function lineRef(ctx: Ctx, l: number): BinairoLineRef {
  return l < ctx.n ? { kind: 'row', index: l } : { kind: 'column', index: l - ctx.n };
}

/** Cases (croissantes) des positions `mask` de la ligne l. */
function maskCells(ctx: Ctx, l: number, mask: number): number[] {
  const out: number[] = [];
  let m = mask;
  while (m !== 0) {
    const low = m & -m;
    m ^= low;
    out.push(cellOf(ctx, l, ctz32(low)));
  }
  return out;
}

/** Décrit la trouvaille courante (état `s` AVANT application). */
function describe(ctx: Ctx, spec: BinairoTechniqueSpec): BinairoStep {
  const other = ctx.other >= 0 ? lineRef(ctx, ctx.other) : null;
  if (spec.id === 'contradiction') {
    const cells = maskCells(ctx, ctx.line, ctx.pivot);
    if (ctx.other >= 0) {
      cells.push(...maskCells(ctx, ctx.other, ctx.full));
      cells.sort((x, y) => x - y);
    }
    const value: BinairoSymbol = ctx.hypValue === SYM_A ? SYM_B : SYM_A;
    return { technique: spec.id, level: spec.level, place: [{ cell: ctx.hypCell, value }], cells, line: lineRef(ctx, ctx.line), other };
  }
  const place: BinairoPlacement[] = [];
  let m = ctx.placeA | ctx.placeB;
  while (m !== 0) {
    const low = m & -m;
    m ^= low;
    place.push({ cell: cellOf(ctx, ctx.line, ctz32(low)), value: (ctx.placeA & low) !== 0 ? SYM_A : SYM_B });
  }
  const cells = spec.id === 'unique' ? maskCells(ctx, ctx.other, ctx.full) : maskCells(ctx, ctx.line, ctx.pivot);
  return { technique: spec.id, level: spec.level, place, cells, line: lineRef(ctx, ctx.line), other };
}

// ─── Boucle de résolution ─────────────────────────────────────────────────────────────────────

/** État initial : données, puis marques sur les cases non données. */
function initialState(ctx: Ctx, p: BinairoPuzzle, marks: readonly BinairoCell[] | undefined): Int32Array {
  const total = ctx.n * ctx.n;
  if (p.givens.length !== total) throw new RangeError(`Binairo : ${p.givens.length} données pour ${total} cases`);
  if (marks !== undefined && marks.length !== total) throw new RangeError(`Binairo : ${marks.length} marques pour ${total} cases`);
  const s = new Int32Array(ctx.size);
  for (let cell = 0; cell < total; cell++) {
    const g = p.givens[cell];
    if (g !== EMPTY && g !== SYM_A && g !== SYM_B) throw new RangeError(`Binairo : donnée invalide ${String(g)} (case ${cell})`);
    const m = marks === undefined ? EMPTY : marks[cell];
    if (m !== EMPTY && m !== SYM_A && m !== SYM_B) throw new RangeError(`Binairo : marque invalide ${String(m)} (case ${cell})`);
    const v = g !== EMPTY ? g : m;
    if (v !== EMPTY) setRC(ctx, s, ctx.rowOf[cell]!, ctx.colOf[cell]!, v);
  }
  return s;
}

function stateCells(ctx: Ctx, s: Int32Array): BinairoCell[] {
  const out = new Array<BinairoCell>(ctx.n * ctx.n);
  for (let cell = 0; cell < out.length; cell++) {
    const r = ctx.rowOf[cell]!;
    const bit = 1 << ctx.colOf[cell]!;
    out[cell] = (s[r]! & bit) !== 0 ? SYM_A : (s[ctx.lines + r]! & bit) !== 0 ? SYM_B : EMPTY;
  }
  return out;
}

function profileTechniques(profile: BinairoProfile, maxLevel: number): BinairoTechniqueSpec[] {
  let prev = 0;
  for (const t of profile.techniques) {
    if (!(t.id in FINDERS)) throw new RangeError(`Binairo : technique inconnue "${t.id}"`);
    if (!Number.isInteger(t.level) || t.level < 1 || t.level < prev) {
      throw new RangeError(`Binairo : niveaux du profil "${profile.id}" non croissants`);
    }
    prev = t.level;
  }
  return profile.techniques.filter((t) => t.level <= maxLevel);
}

interface RunResult {
  readonly status: BinairoLogicStatus;
  readonly steps: BinairoStep[];
  readonly stepCount: number;
  readonly levelCounts: number[];
  readonly score: number;
  readonly maxLevel: number;
  readonly hardest: BinairoTechnique | 'none';
}

function run(ctx: Ctx, s: Int32Array, techs: readonly BinairoTechniqueSpec[], levels: number, record: boolean): RunResult {
  const total = ctx.n * ctx.n;
  const steps: BinairoStep[] = [];
  const levelCounts = new Array<number>(levels).fill(0);
  let stepCount = 0;
  let score = 0;
  let maxLevel = 0;
  let hardest = -1;
  let status: BinairoLogicStatus;
  for (;;) {
    if (stateFault(ctx, s)) {
      status = 'contradiction';
      break;
    }
    if (s[2 * ctx.lines] === total) {
      status = 'solved';
      break;
    }
    let t = 0;
    while (t < techs.length && !FINDERS[techs[t]!.id](ctx, s)) t++;
    if (t === techs.length) {
      status = noCompletion(ctx, s) ? 'contradiction' : 'stuck';
      break;
    }
    const spec = techs[t]!;
    if (record) steps.push(describe(ctx, spec));
    applyFinding(ctx, s, spec.id);
    stepCount++;
    levelCounts[spec.level] = levelCounts[spec.level]! + 1;
    score += spec.weight;
    if (spec.level > maxLevel) maxLevel = spec.level;
    if (t > hardest) hardest = t;
  }
  return { status, steps, stepCount, levelCounts, score, maxLevel, hardest: hardest >= 0 ? techs[hardest]!.id : 'none' };
}

function levelSlots(profile: BinairoProfile): number {
  let max = profile.tierByLevel.length - 1;
  for (const t of profile.techniques) if (t.level > max) max = t.level;
  return max + 1;
}

/** Résout par logique pure en appliquant toujours l'étape la plus facile. */
export function solveBinairoLogically(p: BinairoPuzzle, opts: BinairoSolveOptions = {}): BinairoLogicResult {
  const profile = opts.profile ?? BINAIRO_TECHNIQUES_V1;
  const ctx = createCtx(p.size);
  const techs = profileTechniques(profile, opts.maxLevel ?? Number.MAX_SAFE_INTEGER);
  const s = initialState(ctx, p, opts.initialMarks);
  const res = run(ctx, s, techs, levelSlots(profile), true);
  return {
    status: res.status,
    solved: res.status === 'solved',
    steps: res.steps,
    maxLevel: res.maxLevel,
    levelCounts: res.levelCounts,
    score: res.score,
    hardest: res.hardest,
    marks: stateCells(ctx, s),
  };
}

/** Note de difficulté (même boucle que solveBinairoLogically, sans décrire les étapes). */
export function rateBinairo(p: BinairoPuzzle, profile: BinairoProfile = BINAIRO_TECHNIQUES_V1): BinairoRating {
  const ctx = createCtx(p.size);
  const techs = profileTechniques(profile, Number.MAX_SAFE_INTEGER);
  const res = run(ctx, initialState(ctx, p, undefined), techs, levelSlots(profile), false);
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

/**
 * Prochaine étape la plus facile depuis un état joueur (données + marques, marques ignorées sur les cases
 * données) ; null si la grille est pleine, si une règle est enfreinte ou si aucune technique ne s'applique.
 */
export function nextBinairoStep(
  p: BinairoPuzzle,
  marks: readonly BinairoCell[],
  profile: BinairoProfile = BINAIRO_TECHNIQUES_V1,
): BinairoStep | null {
  const ctx = createCtx(p.size);
  const s = initialState(ctx, p, marks);
  if (s[2 * ctx.lines] === ctx.n * ctx.n || stateFault(ctx, s)) return null;
  for (const spec of profileTechniques(profile, Number.MAX_SAFE_INTEGER)) {
    if (FINDERS[spec.id](ctx, s)) return describe(ctx, spec);
  }
  return null;
}

// ─── Fermeture rapide (générateur) ────────────────────────────────────────────────────────────

/**
 * Contrôle rapide de résolubilité pour le générateur : même pouvoir déductif que la boucle pas à pas
 * avec restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, maxLevel), sans étapes. Les techniques étant monotones,
 * leur fermeture ne dépend pas de l'ordre d'application : déductions de base par tours, analyse des lignes
 * modifiées, unicité, puis contradictions appliquées dès qu'elles sont trouvées.
 */
export interface BinairoLogicChecker {
  readonly size: number;
  /**
   * Vrai si la grille `cells` (n² cases 0, 1, 2 ; supposée cohérente) se complète par logique avec les
   * techniques V1 de niveau ≤ maxLevel. Avec `target` ≥ 0 : vrai dès que cette case est déduite (une grille
   * résoluble privée d'une donnée reste résoluble si et seulement si cette case se déduit).
   */
  solves(cells: ArrayLike<number>, maxLevel: number, target?: number): boolean;
}

export function createBinairoChecker(n: number): BinairoLogicChecker {
  const ctx = createCtx(n);
  const s = new Int32Array(ctx.size);
  return {
    size: n,
    solves(cells: ArrayLike<number>, maxLevel: number, target = -1): boolean {
      if (cells.length !== n * n) throw new RangeError(`Binairo : ${cells.length} cases pour ${n * n}`);
      s.fill(0);
      for (let cell = 0; cell < n * n; cell++) {
        const v = cells[cell];
        if (v === SYM_A || v === SYM_B) setRC(ctx, s, ctx.rowOf[cell]!, ctx.colOf[cell]!, v);
        else if (v !== EMPTY) throw new RangeError(`Binairo : valeur invalide ${String(v)} (case ${cell})`);
      }
      return closure(ctx, s, maxLevel, target);
    },
  };
}

function targetKnown(ctx: Ctx, s: Int32Array, target: number): boolean {
  if (target < 0) return false;
  return !isEmptyRC(ctx, s, ctx.rowOf[target]!, ctx.colOf[target]!);
}

/** Fermeture de `s` (modifié) pour les techniques de niveau ≤ maxLevel ; vrai si complète (ou cible déduite). */
function closure(ctx: Ctx, s: Int32Array, maxLevel: number, target: number): boolean {
  const total = ctx.n * ctx.n;
  const pair = maxLevel >= 1;
  const sandwich = maxLevel >= 2;
  const count = maxLevel >= 3;
  const useLine = maxLevel >= 4;
  const useUnique = maxLevel >= 5;
  const useContradiction = maxLevel >= 6;
  const all = (1 << ctx.lines) - 1;
  let dirty = all;
  let lineDirty = all;
  for (;;) {
    while (dirty !== 0) {
      const changed = basicRound(ctx, s, dirty, pair, sandwich, count);
      lineDirty |= changed;
      dirty = changed;
    }
    if (s[2 * ctx.lines] === total || targetKnown(ctx, s, target)) return true;
    if (useLine) {
      let changed = 0;
      while (lineDirty !== 0) {
        const low = lineDirty & -lineDirty;
        lineDirty ^= low;
        const l = ctz32(low);
        if ((s[l]! | s[ctx.lines + l]!) === ctx.full) continue;
        analyzeLine(ctx, s, l);
        if ((ctx.fa | ctx.fb) !== 0) {
          const fa = ctx.fa;
          const fb = ctx.fb;
          changed |= applyMask(ctx, s, l, fa, SYM_A) | applyMask(ctx, s, l, fb, SYM_B);
        }
      }
      if (changed !== 0) {
        dirty = changed;
        lineDirty = changed;
        continue;
      }
    } else lineDirty = 0;
    if (useUnique && findUnique(ctx, s)) {
      dirty = applyFinding(ctx, s, 'unique');
      lineDirty = dirty;
      continue;
    }
    if (useContradiction) {
      const changed = contradictionPass(ctx, s, target);
      if (changed !== 0) {
        dirty = changed;
        lineDirty = changed;
        continue;
      }
    }
    return false;
  }
}

/**
 * Passe de contradictions pour la fermeture : chaque hypothèse (cases vides croissantes, A puis B) est propagée
 * jusqu'au point fixe ; une réfutation est appliquée aussitôt (avec ses déductions de base) et la passe continue
 * sur l'état enrichi. Renvoie les lignes modifiées (0 : aucune réfutation).
 */
function contradictionPass(ctx: Ctx, s: Int32Array, target: number): number {
  const n = ctx.n;
  if (ctx.scratch === null) ctx.scratch = new Int32Array(ctx.size);
  const v = ctx.scratch;
  let changedAll = 0;
  for (let cell = 0; cell < n * n; cell++) {
    const r = ctx.rowOf[cell]!;
    const c = ctx.colOf[cell]!;
    for (let sym = SYM_A; sym <= SYM_B; sym++) {
      if (!isEmptyRC(ctx, s, r, c)) break;
      v.set(s);
      setRC(ctx, v, r, c, sym);
      let dirty = (1 << r) | (1 << (n + c));
      let refuted = false;
      while (dirty !== 0) {
        if (dirtyFault(ctx, v, dirty)) {
          refuted = true;
          break;
        }
        dirty = basicRound(ctx, v, dirty, true, true, true);
      }
      if (!refuted) continue;
      setRC(ctx, s, r, c, sym === SYM_A ? SYM_B : SYM_A);
      let d = (1 << r) | (1 << (n + c));
      changedAll |= d;
      while (d !== 0) {
        d = basicRound(ctx, s, d, true, true, true);
        changedAll |= d;
      }
      if (targetKnown(ctx, s, target)) return changedAll;
    }
  }
  return changedAll;
}
