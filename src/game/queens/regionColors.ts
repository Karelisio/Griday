/**
 * Couleurs des régions Queens choisies selon le voisinage (régions dont des cases se touchent par un côté).
 *
 * `regionPalette` donne couleurs et textures par indice de région : deux régions voisines peuvent alors se
 * ressembler (surtout en daltonisme) ou porter la même texture. Pour un puzzle donné, on ré-affecte donc :
 * - les fonds : permutation de la palette qui MAXIMISE la plus petite distance entre régions voisines
 *   (départage : somme des distances voisines). Distance = minimum des ΔE (Oklab) en vision normale, protanopie,
 *   deutéranopie et tritanopie (`regionFillDistance`). Départs gloutons + montée par échanges, puis recherche
 *   exacte (propagation de contraintes) qui relève le plancher tant que c'est possible, dans un budget de nœuds
 *   fixe : aucun aléa, aucune horloge, résultat reproductible ;
 * - les textures : coloration propre du graphe des régions avec 4 textures (0 = aucune) de coût minimal
 *   Σ aire × texture. Les grandes régions restent unies, l'ensemble reste calme.
 * `on` suit son fond. Les entrées ne sont jamais modifiées. Coût : ~0,1 à 0,5 ms jusqu'à 10 régions, < 2 ms à 12.
 */
import type { QueensPuzzle } from '../../../engine/queens/types';
import { COLOR_VISION_DEFICIENCIES, deltaE, deltaEColorVision, simulateColorVision, toOklab, type Oklab } from '../../theme/color';
import type { RegionColor } from '../../theme/regions';

/** Plus grand nombre de couleurs ou de régions traitées (masques de bits 32 bits) ; en jeu : 4 à 12. */
const MAX_COLORS = 30;
/** Budgets de nœuds des recherches exactes : bornent le temps (≈ 2 ms) sans rien devoir à l'horloge. */
const FILL_NODE_BUDGET = 2500;
const PATTERN_NODE_BUDGET = 12_000;
/** Départs gloutons des fonds. */
const FILL_STARTS = 2;
/** Distances en milli-ΔE entiers : comparaisons et sommes exactes. */
const SCALE = 1000;
/** Valeur d'une affectation : plus petite distance voisine × PACK + somme des distances voisines (entiers exacts). */
const PACK = 2 ** 27;

// --- Voisinage ---------------------------------------------------------------------------------

/** Nombre de régions : plus grand identifiant + 1 (identifiants canoniques 0..n-1). */
function regionCount(puzzle: QueensPuzzle): number {
  let max = -1;
  for (const r of puzzle.regions) if (r > max) max = r;
  return max + 1;
}

/** `m[a][b]` : vrai si une case de la région `a` touche une case de `b` par un côté (jamais `m[a][a]`). */
export function regionAdjacency(puzzle: QueensPuzzle): boolean[][] {
  const n = regionCount(puzzle);
  const m = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const { size, regions } = puzzle;
  if (size < 1) return m;
  const link = (a: number | undefined, b: number | undefined): void => {
    if (a !== undefined && b !== undefined && a !== b && a >= 0 && b >= 0) m[a][b] = m[b][a] = true;
  };
  for (let i = 0; i < regions.length; i++) {
    if ((i + 1) % size !== 0) link(regions[i], regions[i + 1]); // voisine de droite (même ligne)
    link(regions[i], regions[i + size]); // voisine du dessous
  }
  return m;
}

/** Graphe des régions : arêtes (a < b), voisins en tableaux compacts et aire (nombre de cases) de chaque région. */
interface Graph {
  readonly n: number;
  readonly ea: Int32Array;
  readonly eb: Int32Array;
  /** Voisins de `u` : `nbr[start[u] .. start[u + 1]]` (exclu). */
  readonly start: Int32Array;
  readonly nbr: Int32Array;
  readonly area: Int32Array;
}

function buildGraph(puzzle: QueensPuzzle): Graph {
  const adj = regionAdjacency(puzzle);
  const n = adj.length;
  const ea: number[] = [];
  const eb: number[] = [];
  const nbr: number[] = [];
  const start = new Int32Array(n + 1);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (!adj[a][b]) continue;
      nbr.push(b);
      if (a < b) {
        ea.push(a);
        eb.push(b);
      }
    }
    start[a + 1] = nbr.length;
  }
  const area = new Int32Array(n);
  for (const r of puzzle.regions) if (r >= 0) area[r]++;
  return { n, ea: Int32Array.from(ea), eb: Int32Array.from(eb), start, nbr: Int32Array.from(nbr), area };
}

// --- Distance entre fonds ----------------------------------------------------------------------

/**
 * Distance perceptuelle entre deux fonds `#rrggbb` : minimum des ΔE (Oklab × 100) en vision normale puis sous
 * protanopie, deutéranopie et tritanopie. Une paire n'est « distincte » que si elle l'est pour tout le monde.
 */
export function regionFillDistance(a: string, b: string): number {
  return Math.min(deltaE(a, b), ...COLOR_VISION_DEFICIENCIES.map((kind) => deltaEColorVision(a, b, kind)));
}

/** Couleur vue en Oklab, en vision normale puis sous chaque déficit ; `null` si elle est illisible. */
function colorViews(fill: string): Oklab[] | null {
  try {
    return [toOklab(fill), ...COLOR_VISION_DEFICIENCIES.map((kind) => toOklab(simulateColorVision(fill, kind)))];
  } catch {
    return null;
  }
}

/** Matrice m×m des `regionFillDistance` en milli-ΔE (mêmes calculs, vues Oklab calculées une fois par couleur). */
function distanceMatrix(fills: readonly string[]): Int32Array {
  const m = fills.length;
  const views = fills.map(colorViews);
  const d = new Int32Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      const vi = views[i];
      const vj = views[j];
      if (!vi || !vj) continue; // couleur illisible : distance nulle
      let min = Infinity;
      for (let v = 0; v < vi.length; v++) {
        const [l1, a1, b1] = vi[v];
        const [l2, a2, b2] = vj[v];
        min = Math.min(min, 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2));
      }
      d[i * m + j] = d[j * m + i] = Math.round(min * SCALE);
    }
  }
  return d;
}

// --- Choix des fonds ---------------------------------------------------------------------------

const popcount = (x: number): number => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
};
/** Indice du bit unique de `bit` (puissance de 2). */
const bitIndex = (bit: number): number => 31 - Math.clz32(bit);

/**
 * Couleur (indice dans le réservoir de `m` couleurs, de matrice de distances `D`) de chaque région : maximise la plus
 * petite distance entre régions voisines, puis leur somme. `m ≥ n` ; les couleurs en surplus restent inutilisées.
 */
function solveFills(g: Graph, D: Int32Array, m: number): Int32Array {
  const { n, ea, eb, start, nbr } = g;
  const edges = ea.length;
  const degree = Int32Array.from({ length: n }, (_, u) => start[u + 1] - start[u]);
  let hub = 0; // région la plus connectée
  for (let u = 1; u < n; u++) if (degree[u] > degree[hub]) hub = u;

  const valueOf = (col: Int32Array): number => {
    let lo = Infinity;
    let sum = 0;
    for (let e = 0; e < edges; e++) {
      const d = D[col[ea[e]] * m + col[eb[e]]];
      if (d < lo) lo = d;
      sum += d;
    }
    return lo * PACK + sum;
  };

  /** Construction gloutonne : `first` va au hub, puis chaque région (la plus entourée d'abord) prend la couleur libre la plus éloignée de ses voisines. */
  const greedy = (first: number): Int32Array => {
    const col = new Int32Array(n).fill(-1);
    const taken = new Uint8Array(m);
    const colored = new Int32Array(n); // voisines déjà colorées
    for (let step = 0; step < n; step++) {
      let u = -1;
      for (let r = 0; r < n; r++) {
        if (col[r] < 0 && (u < 0 || colored[r] > colored[u] || (colored[r] === colored[u] && degree[r] > degree[u]))) u = r;
      }
      let best = -1;
      let bestLo = -1;
      let bestSum = -1;
      for (let c = 0; c < m; c++) {
        if (taken[c] || (step === 0 && c !== first)) continue;
        let lo = Infinity;
        let sum = 0;
        for (let k = start[u]; k < start[u + 1]; k++) {
          if (col[nbr[k]] < 0) continue;
          const d = D[c * m + col[nbr[k]]];
          if (d < lo) lo = d;
          sum += d;
        }
        if (lo > bestLo || (lo === bestLo && sum > bestSum)) {
          best = c;
          bestLo = lo;
          bestSum = sum;
        }
      }
      col[u] = best;
      taken[best] = 1;
      for (let k = start[u]; k < start[u + 1]; k++) colored[nbr[k]]++;
    }
    return col;
  };

  /** Montée par échanges (ou remplacement par une couleur libre) : meilleur gain à chaque passe, jusqu'à l'optimum local. */
  const climb = (col: Int32Array): number => {
    const owner = new Int32Array(m).fill(-1); // région qui porte chaque couleur
    for (let r = 0; r < n; r++) owner[col[r]] = r;
    let cur = valueOf(col);
    for (let pass = 0; pass < 100; pass++) {
      let best = cur;
      let bu = -1;
      let bp = -1;
      for (let u = 0; u < n; u++) {
        const cu = col[u];
        for (let p = 0; p < m; p++) {
          const v = owner[p];
          if (p === cu || (v >= 0 && v < u)) continue; // échange déjà essayé depuis v
          col[u] = p;
          if (v >= 0) col[v] = cu;
          const value = valueOf(col);
          col[u] = cu;
          if (v >= 0) col[v] = p;
          if (value > best) {
            best = value;
            bu = u;
            bp = p;
          }
        }
      }
      if (bu < 0) break;
      const v = owner[bp];
      const cu = col[bu];
      col[bu] = bp;
      owner[bp] = bu;
      owner[cu] = v;
      if (v >= 0) col[v] = cu;
      cur = best;
    }
    return cur;
  };

  // Départs : le hub prend, tour à tour, les couleurs qui lui garantissent les voisines les plus éloignées.
  const reach = (c: number): number => {
    const row: number[] = [];
    for (let c2 = 0; c2 < m; c2++) if (c2 !== c) row.push(D[c * m + c2]);
    row.sort((x, y) => y - x);
    return row[Math.min(degree[hub], row.length) - 1] ?? 0;
  };
  const firsts = Array.from({ length: m }, (_, c) => c).sort((a, b) => reach(b) - reach(a) || a - b);
  let best: Int32Array = new Int32Array(0);
  let bestValue = -Infinity;
  for (const first of firsts.slice(0, FILL_STARTS)) {
    const col = greedy(first);
    const value = climb(col);
    if (value > bestValue) {
      best = col;
      bestValue = value;
    }
  }

  // Recherche exacte : « existe-t-il une affectation de plancher ≥ T ? » avec T juste au-dessus du plancher actuel.
  // Domaines (couleurs possibles de chaque région) en masques de bits, maintien de la cohérence d'arc, toutes
  // les couleurs distinctes ; branchement sur la région de plus petit domaine.
  const dom = new Int32Array(n);
  const saved = new Int32Array((n + 1) * n);
  const savedElim = new Int32Array(n + 1);
  const compat = new Int32Array(m); // couleurs à distance ≥ T de chaque couleur
  let nodes = 0;
  let elim = 0; // régions à domaine unique dont la couleur est déjà retirée des autres

  /** Propage les domaines modifiés (`dirty`, masque de régions) ; faux dès qu'un domaine se vide. */
  const propagate = (dirtyIn: number): boolean => {
    let dirty = dirtyIn;
    while (dirty !== 0) {
      const low = dirty & -dirty;
      dirty ^= low;
      const s = bitIndex(low);
      const ds = dom[s];
      if ((ds & (ds - 1)) === 0 && (elim & low) === 0) {
        elim |= low;
        for (let t = 0; t < n; t++) {
          if (t === s || (dom[t] & ds) === 0) continue;
          const nd = dom[t] & ~ds;
          if (nd === 0) return false;
          dom[t] = nd;
          dirty |= 1 << t;
        }
      }
      let support = 0; // couleurs compatibles avec au moins une couleur de s
      for (let bits = ds; bits !== 0; bits &= bits - 1) support |= compat[bitIndex(bits & -bits)];
      for (let k = start[s]; k < start[s + 1]; k++) {
        const r = nbr[k];
        const nd = dom[r] & support;
        if (nd === dom[r]) continue;
        if (nd === 0) return false;
        dom[r] = nd;
        dirty |= 1 << r;
      }
    }
    return true;
  };

  const search = (depth: number): boolean => {
    let u = -1;
    let usize = 0;
    for (let r = 0; r < n; r++) {
      const size = popcount(dom[r]);
      if (size > 1 && (u < 0 || size < usize || (size === usize && degree[r] > degree[u]))) {
        u = r;
        usize = size;
      }
    }
    if (u < 0) return true; // tous les domaines sont réduits à une couleur
    if (++nodes > FILL_NODE_BUDGET) return false;
    const base = depth * n;
    for (let r = 0; r < n; r++) saved[base + r] = dom[r];
    savedElim[depth] = elim;
    for (let bits = saved[base + u]; bits !== 0; bits &= bits - 1) {
      dom[u] = bits & -bits;
      if (propagate(1 << u) && search(depth + 1)) return true;
      for (let r = 0; r < n; r++) dom[r] = saved[base + r];
      elim = savedElim[depth];
      if (nodes > FILL_NODE_BUDGET) return false;
    }
    return false;
  };

  /** Affectation de plancher ≥ `floor`, ou `null` (impossible, ou budget épuisé). */
  const withFloor = (floor: number): Int32Array | null => {
    for (let c = 0; c < m; c++) {
      let mask = 0;
      for (let c2 = 0; c2 < m; c2++) if (c2 !== c && D[c * m + c2] >= floor) mask |= 1 << c2;
      compat[c] = mask;
    }
    // Une région de degré k a besoin d'une couleur qui compte au moins k compatibles.
    for (let r = 0; r < n; r++) {
      let mask = 0;
      for (let c = 0; c < m; c++) if (popcount(compat[c]) >= degree[r]) mask |= 1 << c;
      if (mask === 0) return null;
      dom[r] = mask;
    }
    elim = 0;
    if (!propagate((1 << n) - 1) || !search(0)) return null;
    return Int32Array.from(dom, bitIndex);
  };

  for (;;) {
    const floor = Math.floor(bestValue / PACK);
    let target = Infinity; // plus petite distance strictement au-dessus du plancher
    for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) if (D[i * m + j] > floor && D[i * m + j] < target) target = D[i * m + j];
    if (target === Infinity || nodes > FILL_NODE_BUDGET) break;
    const better = withFloor(target);
    if (!better) break; // plancher optimal (preuve) ou budget épuisé : on garde l'actuel
    best = better;
    bestValue = climb(best);
  }
  return best;
}

// --- Textures ----------------------------------------------------------------------------------

/**
 * Texture (0 = aucune, 1 points, 2 rayures, 3 hachures croisées) de chaque région du puzzle : deux régions voisines
 * n'ont jamais la même quand c'est possible (le graphe des régions est planaire : 4 textures suffisent). Parmi les
 * colorations propres, celle de coût minimal Σ aire × texture : les plus grandes régions restent unies.
 * Si aucune n'existe (graphe non planaire, budget épuisé), minimise les conflits.
 */
export function assignRegionPatterns(puzzle: QueensPuzzle): number[] {
  return patternsOf(buildGraph(puzzle));
}

function patternsOf({ n, start, nbr, area }: Graph): number[] {
  const order = Array.from({ length: n }, (_, u) => u).sort((a, b) => area[b] - area[a] || a - b);
  const col = new Int32Array(n).fill(-1);
  /** Textures déjà prises par les voisines colorées de `u`, en masque de bits. */
  const taken = (u: number): number => {
    let mask = 0;
    for (let k = start[u]; k < start[u + 1]; k++) if (col[nbr[k]] >= 0) mask |= 1 << col[nbr[k]];
    return mask;
  };

  const found: { cost: number; col: number[] | null } = { cost: Infinity, col: null };
  let nodes = 0;
  const place = (i: number, cost: number): void => {
    if (cost >= found.cost || nodes > PATTERN_NODE_BUDGET) return;
    if (i === n) {
      found.cost = cost;
      found.col = Array.from(col);
      return;
    }
    nodes++;
    const u = order[i];
    const busy = taken(u);
    for (let p = 0; p < 4; p++) {
      if ((busy >> p) & 1) continue;
      col[u] = p;
      place(i + 1, cost + area[u] * p);
      col[u] = -1;
    }
  };
  place(0, 0);
  if (found.col) return found.col;

  // Repli : chaque région (grandes d'abord) prend la texture la moins en conflit avec ses voisines déjà traitées.
  col.fill(-1);
  for (const u of order) {
    const conflicts = [0, 0, 0, 0];
    for (let k = start[u]; k < start[u + 1]; k++) if (col[nbr[k]] >= 0) conflicts[col[nbr[k]]]++;
    col[u] = conflicts.indexOf(Math.min(...conflicts));
  }
  return Array.from(col);
}

// --- Assemblage --------------------------------------------------------------------------------

/**
 * Couleurs des régions de `puzzle` (indice = identifiant de région) tirées de `palette` :
 * - les fonds forment une permutation de la palette (les `n` meilleurs si elle est plus grande ; si elle est plus
 *   petite, des couleurs sont réutilisées, loin les unes des autres) qui maximise la plus petite distance entre
 *   régions voisines (voir `regionFillDistance`) ;
 * - `on` suit son fond ; `pattern` est recalculé (voisines toujours différentes quand c'est possible).
 * Déterministe. Palette vide : tableau vide. Ne modifie ni le puzzle ni la palette.
 */
export function assignRegionColors(puzzle: QueensPuzzle, palette: readonly RegionColor[]): RegionColor[] {
  const g = buildGraph(puzzle);
  const { n } = g;
  if (n === 0 || palette.length === 0) return [];

  // Réservoir de couleurs : la palette (limitée à MAX_COLORS), répétée cycliquement s'il y a moins de couleurs que de régions.
  const pool = Array.from({ length: Math.min(MAX_COLORS, Math.max(palette.length, n)) }, (_, i) => palette[i % palette.length]);
  // Rien à optimiser (aucun voisinage) ou hors limites : ordre de la palette.
  const optimize = n <= MAX_COLORS && g.ea.length > 0;
  const pick = optimize ? solveFills(g, distanceMatrix(pool.map((c) => c.fill)), pool.length) : null;
  const patterns = patternsOf(g);
  return Array.from({ length: n }, (_, r) => ({ ...(pick ? pool[pick[r]] : palette[r % palette.length]), pattern: patterns[r] }));
}
