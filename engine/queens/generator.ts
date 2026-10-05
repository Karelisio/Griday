/**
 * Générateur de grilles Queens (structure seule : régions + solution unique).
 *
 * RÈGLE DE GEL : le puzzle du jour dépend de chaque tirage et de chaque ordre de parcours de ce
 * fichier (et des préréglages). Après publication, ne JAMAIS modifier ce comportement : toute
 * évolution = nouvelle version du générateur (nouveau fichier ou nouvelle fonction), activée à une
 * date future. Les encodages « golden » de generator.test.ts verrouillent la V1.
 * Dépendances figées par nature : Rng (prng.ts), canonicalizeRegions (format), popcount32 (pur).
 * Le solveur exhaustif d'exact.ts n'est PAS utilisé ici (il peut évoluer) : la recherche interne
 * ci-dessous est figée avec le générateur ; les tests vérifient l'unicité avec exact.ts.
 *
 * Une tentative :
 * 1. Solution S aléatoire (une reine par ligne et par colonne, jamais deux reines voisines).
 * 2. Croissance des n régions depuis les reines SOUS INVARIANT D'UNICITÉ : dans la grille partielle
 *    (cases libres = interdites aux reines), S reste la seule solution. Ajouter la case x à la
 *    région g n'est permis que si aucune solution ne place la reine de g en x (recherche forcée).
 *    Une paire refusée garde son témoin (la solution parasite) et reste refusée tant que les cases
 *    du témoin gardent leur région : ajouter des cases ne fait qu'ajouter des solutions.
 * 3. Ordre de croissance : poches d'abord (cases libres enclavées dans une seule région : les
 *    remplir tôt, tant que c'est encore sûr), puis région tirée selon son retard sur sa taille cible,
 *    puis case tirée selon la forme (voisines dans la région, segments droits, diagonales).
 * 4. Blocage (toutes les paires restantes refusées) : réparation locale qui préserve l'invariant
 *    (retirer une case n'ôte que des solutions ; chaque ajout est vérifié) :
 *    a. déplacer une voisine y de la case bloquée x vers une autre région h, puis x → h ;
 *    b. déplacer une case du témoin vers une région voisine (le témoin meurt), puis réessayer ;
 *    c. libérer une case du témoin (avec la branche qu'elle déconnecte), poser x, recaser y ;
 *    d. libérer une case du témoin au hasard.
 * 5. Contrôles finaux (taille minimale, unicité complète) puis étiquettes canoniques.
 * Tout est borné (pas, vérifications, réparations, nœuds de recherche) : budget épuisé → null.
 * Arithmétique entière, ordres de parcours fixes, aucun hasard hors `rng`.
 */
import type { Rng } from '../core/prng';
import type { DifficultyTier } from '../core/types';
import { canonicalizeRegions } from './encoding';
import { popcount32 } from './exact';
import { QUEENS_MAX_SIZE, QUEENS_MIN_SIZE, type QueensSolvedPuzzle } from './types';

/** Réglages de forme. Les tailles sont relatives à n (taille moyenne d'une région = n cases). */
export interface QueensShapeParams {
  /**
   * Nombre de régions réduites à leur reine [min, max] (reine donnée : levier principal des grilles
   * faciles). Ces régions ne grandissent jamais ; minSize ne s'applique qu'aux autres.
   */
  readonly singleRegions: readonly [number, number];
  /** Taille minimale des autres régions (1 = croissance libre ; ≥ 2 conseillé). */
  readonly minSize: number;
  /** Taille maximale souple, en % de n : dépassée seulement si rien d'autre n'est possible. */
  readonly maxSizePct: number;
  /** Nombre de petites régions [min, max] ; leur taille cible est tirée dans [minSize, smallMaxSize]. */
  readonly smallRegions: readonly [number, number];
  /** Taille cible maximale d'une petite région (en cases). */
  readonly smallMaxSize: number;
  /** Écart des tailles cibles des autres régions autour de leur moyenne, en % (0 = égales, ≤ 90). */
  readonly spreadPct: number;
  /**
   * Poids d'une case candidate selon son nombre de voisines (4-connexes) déjà dans la région
   * (1, 2, 3, 4). Croissant = régions compactes ; décroissant = régions sinueuses. Entiers 1..1000.
   */
  readonly neighborWeights: readonly [number, number, number, number];
  /** Multiplicateur (%) par segment droit prolongé (barres). 100 = neutre. 10..1000. */
  readonly straightPct: number;
  /** Multiplicateur (%) par voisine diagonale déjà dans la région (épaisseur). 100 = neutre. 10..1000. */
  readonly diagonalPct: number;
}

/**
 * Préréglages, du plus « facile » au plus « expert » d'aspect (mesures : scripts/queens-gen-stats.ts).
 * - beginner : 2 reines données, petites régions, formes compactes (palier 1 sur grandes grilles).
 * - easy : 1 reine donnée, petites régions, formes compactes (palier 1).
 * - medium : 1 reine donnée, petites régions, tailles plus resserrées (palier 2).
 * - hard : aucune reine donnée, régions d'au moins 3 cases, compactes (palier 3).
 * - expert : aucune reine donnée, régions d'au moins 3 cases, équilibrées, formes libres (palier 4).
 * FIGÉS une fois publiés (voir l'en-tête).
 */
export const QUEENS_SHAPE_PRESETS: Readonly<Record<string, QueensShapeParams>> = freezePresets({
  beginner: {
    singleRegions: [2, 2],
    minSize: 2,
    maxSizePct: 220,
    smallRegions: [3, 4],
    smallMaxSize: 3,
    spreadPct: 20,
    neighborWeights: [1, 10, 60, 100],
    straightPct: 100,
    diagonalPct: 150,
  },
  easy: {
    singleRegions: [1, 1],
    minSize: 2,
    maxSizePct: 220,
    smallRegions: [3, 4],
    smallMaxSize: 3,
    spreadPct: 20,
    neighborWeights: [1, 10, 60, 100],
    straightPct: 100,
    diagonalPct: 150,
  },
  medium: {
    singleRegions: [1, 1],
    minSize: 2,
    maxSizePct: 180,
    smallRegions: [3, 4],
    smallMaxSize: 3,
    spreadPct: 40,
    neighborWeights: [4, 10, 30, 60],
    straightPct: 300,
    diagonalPct: 100,
  },
  hard: {
    singleRegions: [0, 0],
    minSize: 3,
    maxSizePct: 180,
    smallRegions: [0, 1],
    smallMaxSize: 4,
    spreadPct: 35,
    neighborWeights: [1, 8, 40, 80],
    straightPct: 100,
    diagonalPct: 130,
  },
  expert: {
    singleRegions: [0, 0],
    minSize: 3,
    maxSizePct: 150,
    smallRegions: [0, 0],
    smallMaxSize: 4,
    spreadPct: 30,
    neighborWeights: [4, 4, 4, 4],
    straightPct: 100,
    diagonalPct: 100,
  },
});

/**
 * Préréglage conseillé pour une cible (taille, palier), d'après les mesures (acceptation par
 * tentative la plus haute). Simple recommandation : l'appelant reste libre de son choix.
 */
export function recommendedQueensPreset(size: number, tier: DifficultyTier): string {
  switch (tier) {
    case 1:
      return size <= 7 ? 'easy' : 'beginner';
    case 2:
      return 'medium';
    case 3:
      return 'hard';
    case 4:
      return 'expert';
  }
}

function freezePresets(
  presets: Record<string, QueensShapeParams>,
): Readonly<Record<string, QueensShapeParams>> {
  for (const p of Object.values(presets)) {
    Object.freeze(p.singleRegions);
    Object.freeze(p.smallRegions);
    Object.freeze(p.neighborWeights);
    Object.freeze(p);
  }
  return Object.freeze(presets);
}

// ─── Plafonds (déterminisme et temps bornés) ─────────────────────────────────────────────────────

/** Nœuds max d'une recherche forcée ; au-delà, la tentative échoue. */
const MAX_SEARCH_NODES = 50_000;
/** Nœuds max cumulés sur une tentative, par case de la grille. */
const MAX_TOTAL_NODES_PER_CELL = 2_000;
/** Vérifications (recherches) max, par case. */
const MAX_CHECKS_PER_CELL = 6;
/** Tours de boucle max, par case. */
const MAX_STEPS_PER_CELL = 8;
/** Réparations (blocages) max, par ligne de grille. */
const MAX_REPAIRS_PER_LINE = 4;
/** Cases bloquées examinées par stratégie de réparation. */
const REPAIR_SCAN = 4;
/** Vérifications max des stratégies a et b d'une réparation, par ligne de grille. */
const REPAIR_CHECKS_PER_LINE = 3;
/** Réparations sans nouveau record de cases libres avant une secousse. */
const STALL_REPAIRS = 4;
/** Rayon (Chebyshev) de la secousse autour d'une case bloquée. */
const SHAKE_RADIUS = 2;
/** Taille max d'une branche libérée par la secousse. */
const SHAKE_MAX_BRANCH = 6;
/** Déplacements max de l'équilibrage final, par ligne de grille. */
const BALANCE_MOVES_PER_LINE = 3;
/** Essais max par déplacement d'équilibrage. */
const BALANCE_TRIES = 8;
/** Pas max de la recherche de solution initiale. */
const MAX_SOLUTION_STEPS = 100_000;
/** Plafond d'un poids de tirage (somme < 2^32 garantie). */
const MAX_WEIGHT = 1 << 20;

/**
 * Une tentative : grille à solution unique avec la forme demandée, ou null si le budget borné est
 * épuisé. Même état de `rng` ⇒ même résultat, sur tout appareil.
 */
export function generateQueensCandidate(
  rng: Rng,
  size: number,
  shape: QueensShapeParams,
): QueensSolvedPuzzle | null {
  if (!Number.isInteger(size) || size < QUEENS_MIN_SIZE || size > QUEENS_MAX_SIZE) {
    throw new RangeError(`generateQueensCandidate : taille invalide ${size}`);
  }
  checkShape(shape);
  const solution = randomSolution(rng, size);
  if (solution === null) return null;
  return new Builder(rng, size, shape, solution).run();
}

function checkShape(s: QueensShapeParams): void {
  const int = (v: number, lo: number, hi: number, name: string): void => {
    if (!Number.isInteger(v) || v < lo || v > hi) throw new RangeError(`QueensShapeParams.${name} invalide : ${v}`);
  };
  int(s.singleRegions[0], 0, QUEENS_MAX_SIZE, 'singleRegions[0]');
  int(s.singleRegions[1], s.singleRegions[0], QUEENS_MAX_SIZE, 'singleRegions[1]');
  int(s.minSize, 1, 8, 'minSize');
  int(s.maxSizePct, 100, 1000, 'maxSizePct');
  int(s.smallRegions[0], 0, QUEENS_MAX_SIZE, 'smallRegions[0]');
  int(s.smallRegions[1], s.smallRegions[0], QUEENS_MAX_SIZE, 'smallRegions[1]');
  int(s.smallMaxSize, s.minSize, 16, 'smallMaxSize');
  int(s.spreadPct, 0, 90, 'spreadPct');
  for (let k = 0; k < 4; k++) int(s.neighborWeights[k]!, 1, 1000, `neighborWeights[${k}]`);
  int(s.straightPct, 10, 1000, 'straightPct');
  int(s.diagonalPct, 10, 1000, 'diagonalPct');
}

/**
 * Permutation aléatoire sans reines voisines (|Δcolonne| ≥ 2 entre lignes consécutives).
 * Retour arrière itératif ; candidats d'une ligne mélangés à chaque entrée dans la ligne.
 */
function randomSolution(rng: Rng, n: number): Int8Array | null {
  const cols = new Int8Array(n);
  const cand = new Int8Array(n * n);
  const count = new Int8Array(n);
  const next = new Int8Array(n);
  let used = 0;
  const enter = (r: number): void => {
    let k = 0;
    for (let c = 0; c < n; c++) {
      if ((used >>> c) & 1) continue;
      if (r > 0 && Math.abs(cols[r - 1]! - c) <= 1) continue;
      cand[r * n + k++] = c;
    }
    // Fisher–Yates sur les k candidats.
    for (let i = k - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = cand[r * n + i]!;
      cand[r * n + i] = cand[r * n + j]!;
      cand[r * n + j] = t;
    }
    count[r] = k;
    next[r] = 0;
  };
  let r = 0;
  enter(0);
  for (let steps = 0; steps < MAX_SOLUTION_STEPS; steps++) {
    if (next[r]! < count[r]!) {
      const c = cand[r * n + next[r]!]!;
      next[r]!++;
      cols[r] = c;
      if (r === n - 1) return cols;
      used |= 1 << c;
      r++;
      enter(r);
    } else {
      r--;
      if (r < 0) return null;
      used &= ~(1 << cols[r]!);
    }
  }
  return null;
}

/** État d'une tentative. Région g = région de la reine de la ligne g (avant étiquettes canoniques). */
class Builder {
  private readonly n: number;
  private readonly cells: number;
  private readonly full: number;
  private readonly sol: Int8Array;
  private readonly isQueen: Uint8Array;
  /** Région de chaque case, -1 = libre. */
  private readonly reg: Int8Array;
  private readonly size: Int16Array;
  private readonly target: Int16Array;
  /** Régions réduites à leur reine : jamais agrandies. */
  private readonly frozen: Uint8Array;
  private readonly maxSize: number;
  /** rowMask[g * n + r] : colonnes de la région g dans la ligne r. */
  private readonly rowMask: Int32Array;
  /** Lignes occupées par la région g. */
  private readonly regRows: Int32Array;
  /** Colonnes affectées (toutes régions) de la ligne r. */
  private readonly assigned: Int32Array;
  /** forb[x * n + g] : paire refusée, témoin intact. */
  private readonly forb: Uint8Array;
  /** Témoin de la paire p : wit[p * n + r] = colonne de la reine de la ligne r. */
  private readonly wit: Int8Array;
  /** Paires refusées actives (ordre sans effet : sert seulement à l'invalidation). */
  private readonly forbList: Int32Array;
  private forbCount = 0;
  /** 4 voisines de chaque case (haut, bas, gauche, droite), -1 hors grille. */
  private readonly nb: Int16Array;
  private free: number;

  // Recherche forcée.
  private readonly stack: Int32Array;
  private readonly qcol: Int8Array;
  /** Première solution trouvée par la dernière recherche. */
  private readonly found: Int8Array;
  private searchLimit = 1;
  private searchCount = 0;
  private searchNodes = 0;
  private totalNodes = 0;
  private aborted = false;
  private checks = 0;

  // Tampons.
  private readonly stamp: Int32Array;
  private stampId = 0;
  private readonly queue: Int16Array;
  private readonly pairBuf: Int32Array;
  private readonly weightBuf: Int32Array;
  private readonly cellBuf: Int16Array;
  private readonly cellBuf2: Int16Array;
  private readonly regWeight: Int32Array;

  constructor(
    private readonly rng: Rng,
    n: number,
    private readonly shape: QueensShapeParams,
    sol: Int8Array,
  ) {
    const N = n * n;
    this.n = n;
    this.cells = N;
    this.full = (1 << n) - 1;
    this.sol = sol;
    this.isQueen = new Uint8Array(N);
    this.reg = new Int8Array(N).fill(-1);
    this.size = new Int16Array(n);
    this.rowMask = new Int32Array(n * n);
    this.regRows = new Int32Array(n);
    this.assigned = new Int32Array(n);
    this.forb = new Uint8Array(N * n);
    this.wit = new Int8Array(N * n * n);
    this.forbList = new Int32Array(N * n);
    this.nb = new Int16Array(N * 4).fill(-1);
    for (let x = 0; x < N; x++) {
      const r = (x / n) | 0;
      const c = x % n;
      if (r > 0) this.nb[x * 4] = x - n;
      if (r < n - 1) this.nb[x * 4 + 1] = x + n;
      if (c > 0) this.nb[x * 4 + 2] = x - 1;
      if (c < n - 1) this.nb[x * 4 + 3] = x + 1;
    }
    this.stack = new Int32Array(n * (n + 1));
    this.qcol = new Int8Array(n).fill(-1);
    this.found = new Int8Array(n);
    this.stamp = new Int32Array(N);
    this.queue = new Int16Array(N);
    this.pairBuf = new Int32Array(N * 4);
    this.weightBuf = new Int32Array(N * 4);
    this.cellBuf = new Int16Array(N);
    this.cellBuf2 = new Int16Array(N);
    this.regWeight = new Int32Array(n);

    this.maxSize = Math.max(shape.minSize + 1, Math.ceil((shape.maxSizePct * n) / 100));
    this.frozen = new Uint8Array(n);
    this.target = this.drawTargets();
    for (let r = 0; r < n; r++) {
      const x = r * n + sol[r]!;
      this.isQueen[x] = 1;
      this.setReg(x, r);
    }
    this.free = N - n;
  }

  run(): QueensSolvedPuzzle | null {
    const n = this.n;
    const N = this.cells;
    const maxSteps = MAX_STEPS_PER_CELL * N;
    const maxChecks = MAX_CHECKS_PER_CELL * N;
    const maxRepairs = MAX_REPAIRS_PER_LINE * n;
    if (!this.growToMinSize()) return null;
    let repairs = 0;
    let bestFree = this.cells;
    let stall = 0;
    for (let step = 0; this.free > 0; step++) {
      if (this.aborted || step >= maxSteps || this.checks >= maxChecks) return null;
      if (this.fillPockets()) continue;
      if (this.growStep()) continue;
      if (++repairs > maxRepairs) return null;
      // Blocage sans progrès (cycle de réparations) : secousse locale.
      if (this.free < bestFree) {
        bestFree = this.free;
        stall = 0;
      } else if (++stall >= STALL_REPAIRS) {
        stall = 0;
        if (this.shake()) continue;
      }
      if (!this.repair()) return null;
    }
    if (this.aborted || !this.fillSmall(maxChecks)) return null;
    this.balance(maxChecks);
    if (this.aborted) return null;
    for (let g = 0; g < n; g++) {
      if (this.frozen[g] ? this.size[g] !== 1 : this.size[g]! < this.shape.minSize) return null;
    }
    // Contrôle final indépendant de l'invariant : grille complète, au plus 2 solutions.
    if (this.countAll(2) !== 1 || this.aborted) return null;
    for (let r = 0; r < n; r++) if (this.found[r] !== this.sol[r]) return null;
    return {
      size: n,
      regions: canonicalizeRegions(Array.from(this.reg)),
      solution: Array.from(this.sol),
    };
  }

  // ─── Tailles cibles ────────────────────────────────────────────────────────────────────────────

  private drawTargets(): Int16Array {
    const { n, rng, shape } = this;
    const t = new Int16Array(n);
    const order: number[] = [];
    for (let g = 0; g < n; g++) order.push(g);
    rng.shuffle(order);
    // Ordre tiré : d'abord les régions réduites à leur reine, puis les petites, puis les autres.
    const singles = Math.min(rng.range(shape.singleRegions[0], shape.singleRegions[1]), n - 1);
    const small = Math.min(rng.range(shape.smallRegions[0], shape.smallRegions[1]), n - 1 - singles);
    let rest = this.cells;
    for (let i = 0; i < singles; i++) {
      t[order[i]!] = 1;
      this.frozen[order[i]!] = 1;
      rest--;
    }
    for (let i = singles; i < singles + small; i++) {
      const s = rng.range(shape.minSize, shape.smallMaxSize);
      t[order[i]!] = s;
      rest -= s;
    }
    const first = singles + small;
    const m = n - first;
    const w = new Int32Array(m);
    let wsum = 0;
    for (let i = 0; i < m; i++) {
      w[i] = rng.range(100 - shape.spreadPct, 100 + shape.spreadPct);
      wsum += w[i]!;
    }
    let acc = 0;
    for (let i = 0; i < m; i++) {
      const s = Math.floor((Math.max(rest, 0) * w[i]!) / wsum);
      t[order[first + i]!] = s;
      acc += s;
    }
    for (let i = 0; acc < rest; i++, acc++) t[order[first + (i % m)]!]!++;
    for (let g = 0; g < n; g++) {
      if (!this.frozen[g]) t[g] = Math.min(Math.max(t[g]!, shape.minSize), this.maxSize);
    }
    return t;
  }

  // ─── Affectations ──────────────────────────────────────────────────────────────────────────────

  private setReg(x: number, g: number): void {
    const n = this.n;
    const r = (x / n) | 0;
    const bit = 1 << (x % n);
    const old = this.reg[x]!;
    if (old >= 0) {
      const i = old * n + r;
      this.rowMask[i] = this.rowMask[i]! & ~bit;
      if (this.rowMask[i] === 0) this.regRows[old] = this.regRows[old]! & ~(1 << r);
      this.size[old]!--;
      this.assigned[r] = this.assigned[r]! & ~bit;
    }
    this.reg[x] = g;
    if (g >= 0) {
      const i = g * n + r;
      this.rowMask[i] = this.rowMask[i]! | bit;
      this.regRows[g] = this.regRows[g]! | (1 << r);
      this.size[g]!++;
      this.assigned[r] = this.assigned[r]! | bit;
    }
  }

  /**
   * Place x (libre ou déplacée) dans g si aucune solution ne passe par x comme reine de g.
   * Sinon remet x dans sa région d'origine ; si x était libre, mémorise le témoin.
   */
  private tryPlace(x: number, g: number): boolean {
    const prev = this.reg[x]!;
    this.setReg(x, g);
    this.checks++;
    if (!this.through(x, g)) return true;
    this.setReg(x, prev);
    if (prev < 0 && !this.aborted) {
      const p = x * this.n + g;
      if (this.forb[p] === 0) {
        this.forb[p] = 1;
        this.forbList[this.forbCount++] = p;
      }
      this.wit.set(this.found, p * this.n);
    }
    return false;
  }

  /** La case y change de région (ou est libérée) : les témoins qui la contiennent meurent. */
  private invalidate(y: number): void {
    const n = this.n;
    const ry = (y / n) | 0;
    const cy = y % n;
    let k = 0;
    for (let i = 0; i < this.forbCount; i++) {
      const p = this.forbList[i]!;
      if (this.wit[p * n + ry] === cy) this.forb[p] = 0;
      else this.forbList[k++] = p;
    }
    this.forbCount = k;
  }

  private release(y: number): void {
    this.setReg(y, -1);
    this.invalidate(y);
    this.free++;
  }

  /** Paire (x, g) refusée avec un témoin intact. */
  private blocked(x: number, g: number): boolean {
    return this.forb[x * this.n + g] === 1;
  }

  // ─── Géométrie ─────────────────────────────────────────────────────────────────────────────────

  /** Régions distinctes voisines de x (hors `except`), dans cellBuf2 ; renvoie leur nombre. */
  private neighborRegions(x: number, except: number, out: Int16Array): number {
    let k = 0;
    let seen = 0;
    for (let d = 0; d < 4; d++) {
      const y = this.nb[x * 4 + d]!;
      if (y < 0) continue;
      const g = this.reg[y]!;
      if (g < 0 || g === except || (seen >>> g) & 1 || this.frozen[g]) continue;
      seen |= 1 << g;
      out[k++] = g;
    }
    return k;
  }

  /**
   * Cases de la région de y coupées de sa reine si y est retirée (dans cellBuf, renvoie leur
   * nombre) ; -1 si y ne peut pas être retirée (reine, ou partie restante < minKeep cases).
   */
  private branchOf(y: number, minKeep: number): number {
    const g = this.reg[y]!;
    if (g < 0 || this.isQueen[y]) return -1;
    const n = this.n;
    const id = ++this.stampId;
    const q0 = g * n + this.sol[g]!;
    let head = 0;
    let tail = 0;
    this.queue[tail++] = q0;
    this.stamp[q0] = id;
    this.stamp[y] = id;
    while (head < tail) {
      const x = this.queue[head++]!;
      for (let d = 0; d < 4; d++) {
        const z = this.nb[x * 4 + d]!;
        if (z < 0 || this.stamp[z] === id || this.reg[z] !== g) continue;
        this.stamp[z] = id;
        this.queue[tail++] = z;
      }
    }
    if (tail < minKeep) return -1;
    const cut = this.size[g]! - 1 - tail;
    if (cut === 0) return 0;
    let k = 0;
    for (let x = 0; x < this.cells; x++) {
      if (this.reg[x] === g && this.stamp[x] !== id) this.cellBuf[k++] = x;
    }
    return k;
  }

  /** y peut changer de région : ni reine, ni articulation, région au-dessus de minSize. */
  private removable(y: number): boolean {
    return this.branchOf(y, this.shape.minSize) === 0;
  }

  /** Poids de forme de la case libre x pour la région g (≥ 1). */
  private shapeWeight(x: number, g: number): number {
    const { n, nb, reg, shape } = this;
    let k = 0;
    let w = 100;
    for (let d = 0; d < 4; d++) {
      const z = nb[x * 4 + d]!;
      if (z < 0 || reg[z] !== g) continue;
      k++;
      const zz = nb[z * 4 + d]!;
      if (zz >= 0 && reg[zz] === g) w = Math.floor((w * shape.straightPct) / 100);
    }
    const r = (x / n) | 0;
    const c = x % n;
    for (let dr = -1; dr <= 1; dr += 2) {
      const rr = r + dr;
      if (rr < 0 || rr >= n) continue;
      for (let dc = -1; dc <= 1; dc += 2) {
        const cc = c + dc;
        if (cc >= 0 && cc < n && reg[rr * n + cc] === g) w = Math.floor((w * shape.diagonalPct) / 100);
      }
    }
    w *= shape.neighborWeights[k - 1]!;
    return Math.min(Math.max(w, 1), MAX_WEIGHT);
  }

  /** Index tiré proportionnellement aux poids weightBuf[0..count). */
  private pickWeighted(count: number): number {
    let total = 0;
    for (let i = 0; i < count; i++) total += this.weightBuf[i]!;
    let t = this.rng.int(total);
    let i = 0;
    while (t >= this.weightBuf[i]!) t -= this.weightBuf[i++]!;
    return i;
  }

  // ─── Croissance ────────────────────────────────────────────────────────────────────────────────

  /**
   * Chaque région atteint minSize. À chaque pas grandit la région en retard la plus petite, puis
   * celle qui a le moins de cases libres voisines (les plus coincées d'abord) ; égalités au sort.
   */
  private growToMinSize(): boolean {
    const { n, nb, reg, size } = this;
    const minSize = this.shape.minSize;
    const frontier = new Int32Array(n);
    for (let guard = 0; guard < n * minSize; guard++) {
      frontier.fill(0);
      for (let x = 0; x < this.cells; x++) {
        if (reg[x] !== -1) continue;
        let seen = 0;
        for (let d = 0; d < 4; d++) {
          const y = nb[x * 4 + d]!;
          if (y < 0 || reg[y]! < 0 || (seen >>> reg[y]!) & 1) continue;
          seen |= 1 << reg[y]!;
          frontier[reg[y]!]!++;
        }
      }
      let bestSize = minSize;
      let bestFrontier = Number.MAX_SAFE_INTEGER;
      let ties = 0;
      for (let g = 0; g < n; g++) {
        const s = size[g]!;
        if (s >= minSize || this.frozen[g]) continue;
        const f = frontier[g]!;
        if (s < bestSize || (s === bestSize && f < bestFrontier)) {
          bestSize = s;
          bestFrontier = f;
          ties = 0;
        }
        if (s === bestSize && f === bestFrontier) this.cellBuf[ties++] = g;
      }
      if (ties === 0) return true;
      const g = this.cellBuf[this.rng.int(ties)]!;
      let count = 0;
      for (let x = 0; x < this.cells; x++) {
        if (reg[x] !== -1) continue;
        for (let d = 0; d < 4; d++) {
          const y = nb[x * 4 + d]!;
          if (y >= 0 && reg[y] === g) {
            this.pairBuf[count] = x;
            this.weightBuf[count++] = this.shapeWeight(x, g);
            break;
          }
        }
      }
      let placed = false;
      while (count > 0 && !placed) {
        const i = this.pickWeighted(count);
        const x = this.pairBuf[i]!;
        if (this.tryPlace(x, g)) {
          placed = true;
          this.free--;
        } else {
          if (this.aborted) return false;
          count--;
          this.pairBuf[i] = this.pairBuf[count]!;
          this.weightBuf[i] = this.weightBuf[count]!;
        }
      }
      if (!placed) return false;
    }
    for (let g = 0; g < n; g++) if (size[g]! < minSize && !this.frozen[g]) return false;
    return true;
  }

  /**
   * Poches : composantes de cases libres ne touchant qu'une région. Elles ne peuvent rejoindre que
   * cette région : on les y place au plus tôt (une paire sûre peut devenir refusée, jamais l'inverse).
   * Renvoie vrai si au moins une case a été placée.
   */
  private fillPockets(): boolean {
    const { n, nb, reg } = this;
    const id = ++this.stampId;
    let total = 0;
    for (let s = 0; s < this.cells; s++) {
      if (reg[s] !== -1 || this.stamp[s] === id) continue;
      let head = 0;
      let tail = 0;
      this.queue[tail++] = s;
      this.stamp[s] = id;
      let regs = 0;
      while (head < tail) {
        const x = this.queue[head++]!;
        for (let d = 0; d < 4; d++) {
          const z = nb[x * 4 + d]!;
          if (z < 0) continue;
          const g = reg[z]!;
          if (g >= 0) regs |= 1 << g;
          else if (this.stamp[z] !== id) {
            this.stamp[z] = id;
            this.queue[tail++] = z;
          }
        }
      }
      if (popcount32(regs) !== 1) continue;
      for (let i = 0; i < tail; i++) this.cellBuf2[total++] = this.queue[i]!;
    }
    if (total === 0) return false;
    let placed = false;
    // Passes successives : une case de poche devient voisine de la région quand sa voisine est posée.
    for (let progress = true; progress; ) {
      progress = false;
      for (let i = 0; i < total; i++) {
        const x = this.cellBuf2[i]!;
        if (reg[x] !== -1) continue;
        let g = -1;
        for (let d = 0; d < 4 && g < 0; d++) {
          const z = nb[x * 4 + d]!;
          if (z >= 0 && reg[z]! >= 0) g = reg[z]!;
        }
        if (g < 0 || this.frozen[g] || this.blocked(x, g)) continue;
        if (this.tryPlace(x, g)) {
          this.free--;
          placed = progress = true;
        } else if (this.aborted) return false;
      }
    }
    return placed;
  }

  private sizeClass(g: number): number {
    const s = this.size[g]!;
    return s < this.shape.minSize ? 0 : s < this.target[g]! ? 1 : s < this.maxSize ? 2 : 3;
  }

  /**
   * Un pas de croissance : région tirée selon sa classe (sous la cible, sous le maximum, au-delà)
   * et son retard, puis case tirée selon la forme. Faux s'il n'existe aucune paire autorisée.
   */
  private growStep(): boolean {
    const { n, nb, reg, size, target, maxSize } = this;
    // Paires autorisées, groupées par région via pairBuf (x * n + g).
    let pairs = 0;
    let regionsWithPairs = 0;
    for (let x = 0; x < this.cells; x++) {
      if (reg[x] !== -1) continue;
      let seen = 0;
      for (let d = 0; d < 4; d++) {
        const y = nb[x * 4 + d]!;
        if (y < 0) continue;
        const g = reg[y]!;
        if (g < 0 || (seen >>> g) & 1) continue;
        seen |= 1 << g;
        if (this.frozen[g] || this.blocked(x, g)) continue;
        this.pairBuf[pairs++] = x * n + g;
        regionsWithPairs |= 1 << g;
      }
    }
    if (pairs === 0) return false;
    // Classe : 0 = sous minSize (après une réparation), 1 = sous la cible (poids = retard),
    // 2 = sous le maximum (poids = marge), 3 = au-delà (poids 1). On tire dans la meilleure classe.
    let bestClass = 4;
    for (let g = 0; g < n; g++) {
      if ((regionsWithPairs >>> g) & 1) bestClass = Math.min(bestClass, this.sizeClass(g));
    }
    let regionCount = 0;
    for (let g = 0; g < n; g++) {
      if (!((regionsWithPairs >>> g) & 1) || this.sizeClass(g) !== bestClass) continue;
      const s = size[g]!;
      this.cellBuf[regionCount] = g;
      this.weightBuf[regionCount++] =
        bestClass === 0 ? this.shape.minSize - s : bestClass === 1 ? target[g]! - s : bestClass === 2 ? maxSize - s : 1;
    }
    const g = this.cellBuf[this.pickWeighted(regionCount)]!;
    let count = 0;
    for (let i = 0; i < pairs; i++) {
      const p = this.pairBuf[i]!;
      if (p % n !== g) continue;
      const x = (p / n) | 0;
      this.pairBuf[count] = x;
      this.weightBuf[count++] = this.shapeWeight(x, g);
    }
    const x = this.pairBuf[this.pickWeighted(count)]!;
    if (this.tryPlace(x, g)) this.free--;
    return true;
  }

  // ─── Équilibrage ───────────────────────────────────────────────────────────────────────────────

  /**
   * Régions passées sous minSize (réparation, passe 1) : une case voisine retirable les rejoint, si
   * c'est sûr. Faux si une région reste trop petite.
   */
  private fillSmall(maxChecks: number): boolean {
    const { n, nb, reg, size } = this;
    for (let g = 0; g < n; g++) {
      if (this.frozen[g]) continue;
      while (size[g]! < this.shape.minSize) {
        if (this.checks >= maxChecks) return false;
        let count = 0;
        for (let y = 0; y < this.cells; y++) {
          const h = reg[y]!;
          if (h < 0 || h === g) continue;
          let adj = false;
          for (let d = 0; d < 4 && !adj; d++) {
            const z = nb[y * 4 + d]!;
            adj = z >= 0 && reg[z] === g;
          }
          if (!adj || !this.removable(y)) continue;
          this.pairBuf[count] = y;
          this.weightBuf[count++] = this.shapeWeight(y, g);
        }
        let moved = false;
        for (let t = 0; t < BALANCE_TRIES && count > 0 && !moved; t++) {
          const i = this.pickWeighted(count);
          moved = this.moveCell(this.pairBuf[i]!, g);
          if (this.aborted) return false;
          count--;
          this.pairBuf[i] = this.pairBuf[count]!;
          this.weightBuf[i] = this.weightBuf[count]!;
        }
        if (!moved) return false;
      }
    }
    return true;
  }

  /**
   * Grille complète et unique : la plus grande région au-delà de maxSize cède une case de bord à une
   * voisine plus petite (≤ maxSize après coup), si c'est sûr. Une région qui ne peut rien céder est
   * laissée telle quelle (maxSize reste souple). Borné en déplacements et en vérifications.
   */
  private balance(maxChecks: number): void {
    const { n, nb, reg, size, maxSize } = this;
    let skip = 0;
    for (let move = 0; move < BALANCE_MOVES_PER_LINE * n && this.checks < maxChecks; move++) {
      let big = -1;
      for (let g = 0; g < n; g++) {
        if ((skip >>> g) & 1 || size[g]! <= maxSize) continue;
        if (big < 0 || size[g]! > size[big]!) big = g;
      }
      if (big < 0) return;
      // Paires (y, h) : y de bord de `big`, retirable ; h voisine, plus petite d'au moins 2.
      let count = 0;
      for (let y = 0; y < this.cells; y++) {
        if (reg[y] !== big) continue;
        let seen = 0;
        let ok = -1;
        for (let d = 0; d < 4; d++) {
          const z = nb[y * 4 + d]!;
          if (z < 0) continue;
          const h = reg[z]!;
          if (h === big || (seen >>> h) & 1 || this.frozen[h] || size[h]! >= maxSize || size[h]! + 2 > size[big]!) continue;
          seen |= 1 << h;
          if (ok < 0) ok = this.removable(y) ? 1 : 0;
          if (ok === 0) break;
          this.pairBuf[count] = y * n + h;
          this.weightBuf[count++] = this.shapeWeight(y, h);
        }
      }
      let moved = false;
      for (let t = 0; t < BALANCE_TRIES && count > 0 && !moved; t++) {
        const i = this.pickWeighted(count);
        const p = this.pairBuf[i]!;
        moved = this.moveCell((p / n) | 0, p % n);
        if (this.aborted) return;
        count--;
        this.pairBuf[i] = this.pairBuf[count]!;
        this.weightBuf[i] = this.weightBuf[count]!;
      }
      if (!moved) skip |= 1 << big;
    }
  }

  // ─── Réparation (blocage) ──────────────────────────────────────────────────────────────────────

  /** Cases libres touchant une région, mélangées (dans cellBuf2) ; renvoie leur nombre. */
  private stuckCells(): number {
    const { nb, reg } = this;
    let k = 0;
    for (let x = 0; x < this.cells; x++) {
      if (reg[x] !== -1) continue;
      for (let d = 0; d < 4; d++) {
        const y = nb[x * 4 + d]!;
        if (y >= 0 && reg[y]! >= 0) {
          this.cellBuf2[k++] = x;
          break;
        }
      }
    }
    for (let i = k - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      const t = this.cellBuf2[i]!;
      this.cellBuf2[i] = this.cellBuf2[j]!;
      this.cellBuf2[j] = t;
    }
    return k;
  }

  private shuffleSmall(buf: Int16Array, k: number): void {
    for (let i = k - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      const t = buf[i]!;
      buf[i] = buf[j]!;
      buf[j] = t;
    }
  }

  /** Cases du témoin de (x, g), hors reines de S et hors x, mélangées. */
  private witnessCells(x: number, g: number, out: Int16Array): number {
    const n = this.n;
    const p = x * n + g;
    let k = 0;
    for (let r = 0; r < n; r++) {
      const c = this.wit[p * n + r]!;
      if (c === this.sol[r]) continue;
      const y = r * n + c;
      if (y !== x) out[k++] = y;
    }
    this.shuffleSmall(out, k);
    return k;
  }

  /** Déplace y (retirable) vers h si sûr ; met à jour les témoins. */
  private moveCell(y: number, h: number): boolean {
    if (!this.tryPlace(y, h)) return false;
    this.invalidate(y);
    return true;
  }

  /**
   * Secousse : libère les cases (hors reines) autour d'une case bloquée, avec leurs branches
   * courtes ; la zone sera regrandie autrement. Toujours sûr (retirer n'ôte que des solutions).
   */
  private shake(): boolean {
    if (this.stuckCells() === 0) return false;
    const n = this.n;
    const x = this.cellBuf2[0]!;
    const r0 = (x / n) | 0;
    const c0 = x % n;
    let released = 0;
    for (let r = Math.max(0, r0 - SHAKE_RADIUS); r <= Math.min(n - 1, r0 + SHAKE_RADIUS); r++) {
      for (let c = Math.max(0, c0 - SHAKE_RADIUS); c <= Math.min(n - 1, c0 + SHAKE_RADIUS); c++) {
        const z = r * n + c;
        if (this.reg[z]! < 0) continue;
        const cut = this.branchOf(z, 1);
        if (cut < 0 || cut > SHAKE_MAX_BRANCH) continue;
        const branch = this.cellBuf.slice(0, cut);
        this.release(z);
        for (let i = 0; i < cut; i++) this.release(branch[i]!);
        released++;
      }
    }
    return released > 0;
  }

  /** Le témoin de (x, g) passe-t-il par la case y ? */
  private witnessHas(x: number, g: number, y: number): boolean {
    const n = this.n;
    return this.wit[(x * n + g) * n + ((y / n) | 0)] === y % n;
  }

  /**
   * Blocage : débloque une case libre, ou modifie la grille sans casser l'invariant.
   * Faux si rien n'est possible (ou abandon).
   */
  private repair(): boolean {
    const stuck = this.stuckCells();
    if (stuck === 0) return false;
    const stuckList = this.cellBuf2.slice(0, stuck);
    const regs = new Int16Array(4);
    const regs2 = new Int16Array(4);
    const ys = new Int16Array(this.n);
    const scan = Math.min(stuck, REPAIR_SCAN);
    const budget = this.checks + REPAIR_CHECKS_PER_LINE * this.n;

    // a. Une voisine y de x passe dans une région h voisine, puis x → h ; annulé si x reste bloquée.
    for (let i = 0; i < scan && this.checks < budget; i++) {
      const x = stuckList[i]!;
      for (let d = 0; d < 4; d++) {
        const y = this.nb[x * 4 + d]!;
        if (y < 0 || this.reg[y]! < 0 || !this.removable(y)) continue;
        const g0 = this.reg[y]!;
        const k = this.neighborRegions(y, g0, regs);
        this.shuffleSmall(regs, k);
        for (let j = 0; j < k; j++) {
          const h = regs[j]!;
          // Inutile si x touche déjà h et que son témoin ne passe pas par y.
          if (this.blocked(x, h) && !this.witnessHas(x, h, y)) continue;
          if (!this.moveCell(y, h)) {
            if (this.aborted) return false;
            continue;
          }
          if (!this.blocked(x, h) && this.tryPlace(x, h)) {
            this.free--;
            return true;
          }
          if (this.aborted) return false;
          // Annulation (grille d'avant : sûre) ; le témoin tout juste trouvé peut passer par y.
          this.setReg(y, g0);
          this.invalidate(y);
        }
      }
    }

    // b. Une case y du témoin de (x, g) passe dans une région voisine (le témoin meurt), puis x → g.
    //    Le déplacement est conservé même si x reste bloquée (autre témoin) : il est sûr.
    for (let i = 0; i < scan && this.checks < budget; i++) {
      const x = stuckList[i]!;
      const k = this.neighborRegions(x, -1, regs);
      this.shuffleSmall(regs, k);
      for (let j = 0; j < k && this.checks < budget; j++) {
        const g = regs[j]!;
        if (!this.blocked(x, g)) {
          if (this.tryPlace(x, g)) {
            this.free--;
            return true;
          }
          if (this.aborted) return false;
        }
        const m = this.witnessCells(x, g, ys);
        for (let t = 0; t < m; t++) {
          const y = ys[t]!;
          if (!this.removable(y)) continue;
          const k2 = this.neighborRegions(y, this.reg[y]!, regs2);
          this.shuffleSmall(regs2, k2);
          for (let u = 0; u < k2; u++) {
            if (!this.moveCell(y, regs2[u]!)) {
              if (this.aborted) return false;
              continue;
            }
            if (!this.blocked(x, g) && this.tryPlace(x, g)) this.free--;
            return !this.aborted;
          }
        }
      }
    }

    // c. Une case y du témoin de (x, g) est libérée, x → g, puis y recasée ailleurs si possible.
    // d. À défaut : la case du témoin qui coupe le moins de cases est libérée (avec sa branche).
    //    Passe 0 : les régions gardent minSize ; passe 1 : une région peut passer dessous (elle
    //    sera regrandie en priorité, classe 0).
    let bestY = -1;
    let bestCut = Number.MAX_SAFE_INTEGER;
    for (let pass = 0; pass < 2 && bestY < 0; pass++) {
      const minKeep = pass === 0 ? this.shape.minSize : 1;
      for (let i = 0; i < scan; i++) {
        const x = stuckList[i]!;
        const k = this.neighborRegions(x, -1, regs);
        this.shuffleSmall(regs, k);
        for (let j = 0; j < k; j++) {
          const g = regs[j]!;
          // Témoin à jour (les stratégies a et b ont pu être écourtées par leur budget).
          if (!this.blocked(x, g)) {
            if (this.tryPlace(x, g)) {
              this.free--;
              return true;
            }
            if (this.aborted) return false;
          }
          const m = this.witnessCells(x, g, ys);
          for (let t = 0; t < m; t++) {
            const y = ys[t]!;
            const cut = this.branchOf(y, minKeep);
            if (cut < 0) continue;
            if (cut < bestCut) {
              bestCut = cut;
              bestY = y;
            }
            if (cut !== 0 || this.checks >= budget) continue;
            const h = this.reg[y]!;
            this.release(y);
            if (!this.blocked(x, g) && this.tryPlace(x, g)) {
              this.free--;
              const k2 = this.neighborRegions(y, h, regs2);
              this.shuffleSmall(regs2, k2);
              for (let u = 0; u < k2; u++) {
                if (this.tryPlace(y, regs2[u]!)) {
                  this.free--;
                  break;
                }
                if (this.aborted) return false;
              }
              return !this.aborted;
            }
            if (this.aborted) return false;
            // Échec : y retrouve sa région (grille d'avant, x toujours libre : sûr).
            this.setReg(y, h);
            this.free--;
          }
        }
      }
    }
    if (bestY < 0) return false;
    const cut = this.branchOf(bestY, 1);
    const branch = this.cellBuf.slice(0, Math.max(cut, 0));
    this.release(bestY);
    for (let i = 0; i < branch.length; i++) this.release(branch[i]!);
    return true;
  }

  // ─── Recherche exhaustive (grille partielle) ───────────────────────────────────────────────────

  /** Vrai si une solution place la reine de g en x (x déjà dans g). Témoin dans `found`. */
  private through(x: number, g: number): boolean {
    const n = this.n;
    const r0 = (x / n) | 0;
    const c0 = x % n;
    // Niveau 1 de la pile : cases affectées, puis la reine imposée en x.
    for (let r = 0; r < n; r++) this.stack[n + r] = this.assigned[r]!;
    this.place(n, r0, c0, g);
    this.qcol[r0] = c0;
    this.searchLimit = 1;
    this.searchCount = 0;
    this.searchNodes = 0;
    this.search(1, 1 << r0, 1 << c0, 1 << g);
    this.qcol[r0] = -1;
    this.totalNodes += this.searchNodes;
    if (this.totalNodes > MAX_TOTAL_NODES_PER_CELL * this.cells) this.aborted = true;
    // Abandon : prudence, la paire est traitée comme refusée (et la tentative échouera).
    return this.searchCount > 0 || this.aborted;
  }

  /** Nombre de solutions de la grille (complète), plafonné à `limit`. */
  private countAll(limit: number): number {
    const n = this.n;
    for (let r = 0; r < n; r++) this.stack[r] = this.assigned[r]!;
    this.searchLimit = limit;
    this.searchCount = 0;
    this.searchNodes = 0;
    this.search(0, 0, 0, 0);
    return this.searchCount;
  }

  /** Pose une reine en (r, c) de la région g sur le niveau `at` de la pile (en place). */
  private place(at: number, r: number, c: number, g: number): void {
    const n = this.n;
    const st = this.stack;
    const bit = 1 << c;
    for (let i = 0; i < n; i++) st[at + i] = st[at + i]! & ~bit;
    for (let m = this.regRows[g]!; m !== 0; m &= m - 1) {
      const i = 31 - Math.clz32(m & -m);
      st[at + i] = st[at + i]! & ~this.rowMask[g * n + i]!;
    }
    st[at + r] = 0;
    const adj = ((bit << 1) | bit | (bit >>> 1)) & this.full;
    if (r > 0) st[at + r - 1] = st[at + r - 1]! & ~adj;
    if (r < n - 1) st[at + r + 1] = st[at + r + 1]! & ~adj;
  }

  /**
   * Branche sur l'unité (ligne, colonne ou région) la plus contrainte. Vrai = arrêt (assez de
   * solutions, ou budget de nœuds épuisé).
   */
  private search(depth: number, rowDone: number, colDone: number, regDone: number): boolean {
    const n = this.n;
    if (depth === n) {
      if (this.searchCount++ === 0) this.found.set(this.qcol);
      return this.searchCount >= this.searchLimit;
    }
    if (++this.searchNodes > MAX_SEARCH_NODES) {
      this.aborted = true;
      return true;
    }
    const st = this.stack;
    const rm = this.rowMask;
    const base = depth * n;
    let kind = 0;
    let idx = -1;
    let best = 99;
    for (let r = 0; r < n; r++) {
      if ((rowDone >>> r) & 1) continue;
      const cnt = popcount32(st[base + r]!);
      if (cnt === 0) return false;
      if (cnt < best) {
        best = cnt;
        kind = 0;
        idx = r;
      }
    }
    for (let c = 0; c < n; c++) {
      if ((colDone >>> c) & 1) continue;
      let cnt = 0;
      for (let r = 0; r < n; r++) cnt += (st[base + r]! >>> c) & 1;
      if (cnt === 0) return false;
      if (cnt < best) {
        best = cnt;
        kind = 1;
        idx = c;
      }
    }
    for (let g = 0; g < n; g++) {
      if ((regDone >>> g) & 1) continue;
      let cnt = 0;
      for (let m = this.regRows[g]!; m !== 0; m &= m - 1) {
        const r = 31 - Math.clz32(m & -m);
        cnt += popcount32(st[base + r]! & rm[g * n + r]!);
      }
      if (cnt === 0) return false;
      if (cnt < best) {
        best = cnt;
        kind = 2;
        idx = g;
      }
    }
    const next = base + n;
    for (let r = 0; r < n; r++) {
      let mask: number;
      if (kind === 0) mask = r === idx ? st[base + r]! : 0;
      else if (kind === 1) mask = st[base + r]! & (1 << idx);
      else mask = st[base + r]! & rm[idx * n + r]!;
      while (mask !== 0) {
        const low = mask & -mask;
        const c = 31 - Math.clz32(low);
        mask ^= low;
        for (let i = 0; i < n; i++) st[next + i] = st[base + i]!;
        const g = this.reg[r * n + c]!;
        this.place(next, r, c, g);
        this.qcol[r] = c;
        const stop = this.search(depth + 1, rowDone | (1 << r), colDone | (1 << c), regDone | (1 << g));
        this.qcol[r] = -1;
        if (stop) return true;
      }
    }
    return false;
  }
}
