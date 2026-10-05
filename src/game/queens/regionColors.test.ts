import { describe, expect, it } from 'vitest';
import { addDays } from '../../../engine/core/date';
import { getDailyPuzzle } from '../../../engine/index';
import type { QueensPuzzle } from '../../../engine/queens/types';
import { COLOR_VISION_DEFICIENCIES, deltaE, deltaEColorVision } from '../../theme/color';
import { regionPalette, type RegionColor } from '../../theme/regions';
import { GRIDAY_SEED } from '../../theme/scheme';
import { assignRegionColors, assignRegionPatterns, regionAdjacency, regionFillDistance } from './regionColors';

// --- Jeux d'essai ------------------------------------------------------------------------------

/** 56 puzzles du jour réels (tailles 6 à 10). */
const DAILY: QueensPuzzle[] = Array.from({ length: 56 }, (_, i) => getDailyPuzzle(addDays('2026-10-05', i)).puzzle);

/** Générateur pseudo-aléatoire à graine fixe (mulberry32) pour les puzzles synthétiques. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Puzzle synthétique : `size` régions connectées nées de `size` cases au hasard, étiquettes canoniques (ordre d'apparition). */
function grownPuzzle(size: number, seed: number): QueensPuzzle {
  const rnd = mulberry32(seed);
  const total = size * size;
  const cells = new Array<number>(total).fill(-1);
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const members: number[][] = [];
  for (let r = 0; r < size; r++) {
    cells[order[r]] = r;
    members.push([order[r]]);
  }
  for (let left = total - size; left > 0; ) {
    const r = Math.floor(rnd() * size);
    const free: number[] = [];
    for (const c of members[r]) {
      const x = c % size;
      if (x > 0 && cells[c - 1] < 0) free.push(c - 1);
      if (x < size - 1 && cells[c + 1] < 0) free.push(c + 1);
      if (c >= size && cells[c - size] < 0) free.push(c - size);
      if (c < total - size && cells[c + size] < 0) free.push(c + size);
    }
    if (free.length === 0) continue;
    const pick = free[Math.floor(rnd() * free.length)];
    cells[pick] = r;
    members[r].push(pick);
    left--;
  }
  const labels = new Map<number, number>();
  const regions = cells.map((r) => {
    if (!labels.has(r)) labels.set(r, labels.size);
    return labels.get(r) as number;
  });
  return { size, regions };
}

/** Puzzles synthétiques de 4 à 12 régions (la borne haute du jeu), dix par taille. */
const SYNTHETIC: QueensPuzzle[] = [4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((size) =>
  Array.from({ length: 10 }, (_, k) => grownPuzzle(size, 7000 * size + k)),
);

/** Thèmes d'essai : couleur de marque et quelques autres graines, en clair et en sombre. */
const SOURCES = [
  { name: 'marque', seed: GRIDAY_SEED },
  { name: 'bleu', seed: 0xff0061a4 },
  { name: 'rouge', seed: 0xffb3261e },
  { name: 'jaune', seed: 0xffe3b800 },
].flatMap((s) => [false, true].map((dark) => ({ ...s, dark, label: `${s.name} ${dark ? 'sombre' : 'clair'}` })));

const paletteOf = (source: (typeof SOURCES)[number], count: number): RegionColor[] =>
  regionPalette({ seed: source.seed, dark: source.dark, count });

// --- Références indépendantes de l'implémentation ----------------------------------------------

/** Arêtes (a < b) de voisinage calculées case par case, sans `regionAdjacency` (`size` = largeur ; une rangée suffit). */
function naiveEdges(p: QueensPuzzle): string[] {
  const out = new Set<string>();
  const rows = p.regions.length / p.size;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < p.size; c++) {
      const a = p.regions[r * p.size + c];
      const right = c + 1 < p.size ? p.regions[r * p.size + c + 1] : a;
      const below = r + 1 < rows ? p.regions[(r + 1) * p.size + c] : a;
      for (const b of [right, below]) if (a !== b) out.add(`${Math.min(a, b)}-${Math.max(a, b)}`);
    }
  }
  return [...out].sort();
}

const edgesOf = (p: QueensPuzzle): [number, number][] => naiveEdges(p).map((e) => e.split('-').map(Number) as [number, number]);

/** Métrique voulue : minimum des ΔE en vision normale, protanopie, deutéranopie et tritanopie. */
const pairDistance = (a: string, b: string): number =>
  Math.min(deltaE(a, b), ...COLOR_VISION_DEFICIENCIES.map((kind) => deltaEColorVision(a, b, kind)));

const worstPair = (edges: readonly [number, number][], colors: readonly RegionColor[]): number =>
  Math.min(...edges.map(([a, b]) => pairDistance(colors[a].fill, colors[b].fill)));

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Vérificateur exhaustif : existe-t-il une affectation injective de couleurs de `palette` aux `n` régions dont
 * toutes les paires voisines sont à une distance > `floor` ? (retour arrière en largeur d'abord, sans astuce).
 */
function existsAbove(n: number, edges: readonly [number, number][], palette: readonly RegionColor[], floor: number): boolean {
  const near: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    near[a].push(b);
    near[b].push(a);
  }
  let hub = 0;
  for (let r = 1; r < n; r++) if (near[r].length > near[hub].length) hub = r;
  const order = [hub];
  for (let i = 0; i < order.length; i++) for (const v of near[order[i]]) if (!order.includes(v)) order.push(v);
  const dist = palette.map((x) => palette.map((y) => pairDistance(x.fill, y.fill)));
  const col = new Array<number>(n).fill(-1);
  const used = new Array<boolean>(palette.length).fill(false);
  const place = (i: number): boolean => {
    if (i === n) return true;
    const u = order[i];
    for (let c = 0; c < palette.length; c++) {
      if (used[c] || near[u].some((v) => col[v] >= 0 && !(dist[c][col[v]] > floor))) continue;
      col[u] = c;
      used[c] = true;
      if (place(i + 1)) return true;
      col[u] = -1;
      used[c] = false;
    }
    return false;
  };
  return place(0);
}

// --- Voisinage ---------------------------------------------------------------------------------

describe('regionAdjacency', () => {
  it('relie les régions qui se touchent par un côté, pas en diagonale', () => {
    // 0 0 1 1 / 0 2 2 1 / 3 2 2 1 / 3 3 2 1 : 1 et 3 ne se touchent pas.
    const p: QueensPuzzle = { size: 4, regions: [0, 0, 1, 1, 0, 2, 2, 1, 3, 2, 2, 1, 3, 3, 2, 1] };
    const m = regionAdjacency(p);
    const edges = m.flatMap((row, a) => row.map((v, b) => (v && a < b ? `${a}-${b}` : '')).filter(Boolean));
    expect(edges).toEqual(['0-1', '0-2', '0-3', '1-2', '2-3']);
    // 1 et 2 ne se touchent qu'en diagonale.
    const diagonal = regionAdjacency({ size: 2, regions: [0, 1, 2, 0] });
    expect(diagonal[1][2]).toBe(false);
    expect(diagonal[0][1] && diagonal[0][2]).toBe(true);
  });

  it('est symétrique, sans boucle, connexe, et égale un calcul case par case (puzzles réels et synthétiques)', () => {
    for (const p of [...DAILY, ...SYNTHETIC]) {
      const m = regionAdjacency(p);
      const n = Math.max(...p.regions) + 1;
      expect(m).toHaveLength(n);
      for (let a = 0; a < n; a++) {
        expect(m[a][a]).toBe(false);
        for (let b = 0; b < n; b++) expect(m[a][b]).toBe(m[b][a]);
      }
      const pairs = m.flatMap((row, a) => row.map((v, b) => (v && a < b ? `${a}-${b}` : '')).filter(Boolean));
      expect(pairs.sort()).toEqual(naiveEdges(p));
      // Connexe : le plateau est d'un seul tenant.
      const seen = new Set([0]);
      for (const a of seen) m[a].forEach((v, b) => v && seen.add(b));
      expect(seen.size).toBe(n);
    }
  });
});

// --- Couleurs ----------------------------------------------------------------------------------

describe('assignRegionColors', () => {
  it('la distance de référence est le minimum des quatre visions', () => {
    for (const source of SOURCES) {
      const palette = paletteOf(source, 8);
      for (const a of palette) {
        expect(regionFillDistance(a.fill, a.fill)).toBe(0);
        for (const b of palette) {
          expect(regionFillDistance(a.fill, b.fill)).toBeCloseTo(pairDistance(a.fill, b.fill), 9);
          expect(regionFillDistance(a.fill, b.fill)).toBeCloseTo(regionFillDistance(b.fill, a.fill), 9);
        }
      }
    }
  });

  it('renvoie une permutation de la palette : `on` suit son fond, textures de 0 à 3', () => {
    for (const p of [...DAILY, ...SYNTHETIC]) {
      const n = Math.max(...p.regions) + 1;
      for (const source of SOURCES) {
        const palette = paletteOf(source, n);
        const out = assignRegionColors(p, palette);
        expect(out, `${source.label} n=${n}`).toHaveLength(n);
        expect(out.map((c) => c.fill).sort()).toEqual(palette.map((c) => c.fill).sort());
        for (const c of out) {
          expect(palette.some((q) => q.fill === c.fill && q.on === c.on)).toBe(true);
          expect([0, 1, 2, 3]).toContain(c.pattern);
        }
      }
    }
  });

  it('ne modifie ni le puzzle ni la palette', () => {
    const p = structuredClone(DAILY[3]);
    const palette = paletteOf(SOURCES[0], p.size);
    const before = JSON.stringify([p, palette]);
    // Objets gelés : toute écriture lèverait une erreur (modules ES = mode strict).
    const frozen = Object.freeze(palette.map((c) => Object.freeze({ ...c })));
    Object.freeze(p.regions);
    assignRegionColors(p, frozen);
    assignRegionPatterns(p);
    regionAdjacency(p);
    expect(JSON.stringify([p, palette])).toBe(before);
  });

  it('est déterministe (mêmes entrées, copies profondes, appels répétés)', () => {
    for (const p of DAILY.slice(0, 20)) {
      for (const source of SOURCES) {
        const palette = paletteOf(source, p.size);
        const first = assignRegionColors(p, palette);
        expect(assignRegionColors(p, palette)).toEqual(first);
        expect(assignRegionColors(structuredClone(p), structuredClone(palette))).toEqual(first);
      }
    }
  });

  it('deux régions voisines n’ont jamais la même texture (puzzles réels et synthétiques de 4 à 12 régions)', () => {
    for (const p of [...DAILY, ...SYNTHETIC]) {
      const n = Math.max(...p.regions) + 1;
      const out = assignRegionColors(p, paletteOf(SOURCES[0], n));
      for (const [a, b] of edgesOf(p)) expect(out[a].pattern, `n=${n} ${a}-${b}`).not.toBe(out[b].pattern);
      // Les textures ne dépendent que du puzzle : mêmes valeurs quel que soit le thème.
      expect(out.map((c) => c.pattern)).toEqual(assignRegionPatterns(p));
    }
  });

  it('maximise la plus petite distance entre voisines : aucune autre permutation ne fait mieux (preuve indépendante)', () => {
    for (const source of SOURCES) {
      for (const p of DAILY) {
        const palette = paletteOf(source, p.size);
        const out = assignRegionColors(p, palette);
        const edges = edgesOf(p);
        const worst = worstPair(edges, out);
        expect(existsAbove(p.size, edges, palette, worst + 1e-6), `${source.label} n=${p.size} pire=${worst.toFixed(2)}`).toBe(false);
      }
    }
  });

  it('relève fortement la pire paire voisine par rapport à l’attribution par indice', () => {
    for (const source of SOURCES) {
      const before: number[] = [];
      const after: number[] = [];
      let neighbours = 0;
      let closeBefore = 0;
      let closeAfter = 0;
      for (const p of DAILY) {
        const palette = paletteOf(source, p.size);
        const out = assignRegionColors(p, palette);
        const edges = edgesOf(p);
        before.push(worstPair(edges, palette));
        after.push(worstPair(edges, out));
        for (const [a, b] of edges) {
          neighbours++;
          if (pairDistance(palette[a].fill, palette[b].fill) < 4) closeBefore++;
          if (pairDistance(out[a].fill, out[b].fill) < 4) closeAfter++;
        }
      }
      const info =
        `${source.label} : médiane ${median(before).toFixed(2)} → ${median(after).toFixed(2)}, ` +
        `min ${Math.min(...before).toFixed(2)} → ${Math.min(...after).toFixed(2)}`;
      // Jamais pire que l'attribution par indice (c'est une des permutations candidates)...
      after.forEach((w, i) => expect(w, `${info} puzzle ${i}`).toBeGreaterThanOrEqual(before[i] - 1e-9));
      // ... médiane au moins doublée et au-dessus de 4,5 (mesuré : ×2,4 à ×5, de 4,7 à 7,3).
      expect(median(after), info).toBeGreaterThanOrEqual(2 * median(before));
      expect(median(after), info).toBeGreaterThanOrEqual(4.5);
      // Plancher 2,5 : le seuil des tests de palette pour TOUTES les paires en vision normale (regions.test.ts) ;
      // ici il vaut pour les voisines sous les quatre visions (optimum prouvé ci-dessus : plus bas = 2,6).
      expect(Math.min(...after), info).toBeGreaterThanOrEqual(2.5);
      // Paires voisines à ΔE < 4 : de ~20 % à moins de 5 %.
      expect(closeBefore / neighbours, info).toBeGreaterThan(0.1);
      expect(closeAfter / neighbours, info).toBeLessThan(0.05);
    }
  });

  it('choisit les n meilleures couleurs d’une palette plus grande', () => {
    const p: QueensPuzzle = { size: 2, regions: [0, 0, 1, 1] }; // deux régions voisines
    const palette = paletteOf(SOURCES[0], 6);
    const out = assignRegionColors(p, palette);
    const best = Math.max(...palette.flatMap((x, i) => palette.slice(i + 1).map((y) => pairDistance(x.fill, y.fill))));
    expect(pairDistance(out[0].fill, out[1].fill)).toBeCloseTo(best, 9);

    // Sur de vrais puzzles : jamais moins bien qu'avec les n premières couleurs, couleurs toutes distinctes.
    for (const source of SOURCES) {
      for (const puzzle of DAILY.slice(0, 12)) {
        const big = paletteOf(source, 12);
        const outBig = assignRegionColors(puzzle, big);
        expect(outBig).toHaveLength(puzzle.size);
        expect(new Set(outBig.map((c) => c.fill)).size).toBe(puzzle.size);
        for (const c of outBig) expect(big.some((q) => q.fill === c.fill && q.on === c.on)).toBe(true);
        const edges = edgesOf(puzzle);
        const firstN = worstPair(edges, assignRegionColors(puzzle, big.slice(0, puzzle.size)));
        expect(worstPair(edges, outBig), `${source.label} n=${puzzle.size}`).toBeGreaterThanOrEqual(firstN - 1e-9);
      }
    }
  });

  it('sur trois régions en ligne, les deux couleurs les plus proches vont aux extrémités', () => {
    const p: QueensPuzzle = { size: 3, regions: [0, 1, 2] };
    const palette = paletteOf(SOURCES[0], 3);
    const out = assignRegionColors(p, palette);
    const edges = edgesOf(p);
    const permutations = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const best = Math.max(...permutations.map((perm) => worstPair(edges, perm.map((i) => palette[i]))));
    expect(worstPair(edges, out)).toBeCloseTo(best, 9);
  });

  it('une palette plus petite que le nombre de régions réutilise des couleurs sans voisines identiques', () => {
    for (const p of DAILY.slice(0, 20)) {
      const palette = paletteOf(SOURCES[0], 4);
      const out = assignRegionColors(p, palette);
      expect(out).toHaveLength(p.size);
      for (const c of out) expect(palette.some((q) => q.fill === c.fill)).toBe(true);
      for (const [a, b] of edgesOf(p)) expect(out[a].fill, `n=${p.size} ${a}-${b}`).not.toBe(out[b].fill);
    }
  });

  it('cas limites : palette vide, aucune région, une seule région, fond illisible', () => {
    const palette = paletteOf(SOURCES[0], 4);
    expect(assignRegionColors(DAILY[0], [])).toEqual([]);
    expect(assignRegionColors({ size: 0, regions: [] }, palette)).toEqual([]);
    expect(assignRegionColors({ size: 1, regions: [0] }, palette)).toEqual([{ ...palette[0], pattern: 0 }]);
    const broken = palette.map((c, i) => (i === 1 ? { ...c, fill: 'var(--x)' } : c));
    expect(() => assignRegionColors({ size: 2, regions: [0, 1, 0, 1] }, broken)).not.toThrow();
    expect(assignRegionColors({ size: 2, regions: [0, 1, 0, 1] }, broken)).toHaveLength(2);
  });

  it('rapidité : moins de 2 ms en moyenne, jusqu’à 12 régions', () => {
    const run = (puzzles: QueensPuzzle[]): { mean: number; max: number } => {
      const times: number[] = [];
      for (const p of puzzles) {
        for (const source of SOURCES) {
          const palette = paletteOf(source, p.size);
          const t0 = performance.now();
          assignRegionColors(p, palette);
          times.push(performance.now() - t0);
        }
      }
      return { mean: times.reduce((s, t) => s + t, 0) / times.length, max: Math.max(...times) };
    };
    run(DAILY.slice(0, 10)); // échauffement du moteur JS
    const daily = run(DAILY);
    const all = run(SYNTHETIC);
    const twelve = run(SYNTHETIC.filter((p) => p.size === 12));
    // Mesuré (V8, machine de développement) : ~0,25 ms sur les puzzles réels, ~0,5 ms de 4 à 12 régions, ~1,1 ms à 12.
    expect(daily.mean, `réels : moyenne ${daily.mean.toFixed(2)} ms, max ${daily.max.toFixed(2)} ms`).toBeLessThan(2);
    expect(all.mean, `4 à 12 régions : moyenne ${all.mean.toFixed(2)} ms, max ${all.max.toFixed(2)} ms`).toBeLessThan(2);
    // 12 régions n'existe pas encore en jeu (6 à 10) : borne plus lâche, garde-fou contre une explosion de la recherche.
    expect(twelve.mean, `12 régions : moyenne ${twelve.mean.toFixed(2)} ms, max ${twelve.max.toFixed(2)} ms`).toBeLessThan(4);
  });
});

// --- Textures ----------------------------------------------------------------------------------

describe('assignRegionPatterns', () => {
  /** Coût Σ aire × texture minimal parmi toutes les colorations propres en 4 textures (énumération exhaustive). */
  function bestCost(p: QueensPuzzle): number {
    const n = Math.max(...p.regions) + 1;
    const area = new Array<number>(n).fill(0);
    for (const r of p.regions) area[r]++;
    const edges = edgesOf(p);
    const col = new Array<number>(n).fill(0);
    let best = Infinity;
    const rec = (u: number, cost: number): void => {
      if (cost >= best) return;
      if (u === n) {
        best = cost;
        return;
      }
      for (let t = 0; t < 4; t++) {
        if (edges.some(([a, b]) => (a === u && b < u && col[b] === t) || (b === u && a < u && col[a] === t))) continue;
        col[u] = t;
        rec(u + 1, cost + area[u] * t);
      }
    };
    rec(0, 0);
    return best;
  }

  it('colorie proprement le graphe des régions, au coût minimal Σ aire × texture (le moins de surface texturée possible)', () => {
    for (const p of DAILY.filter((q) => q.size <= 8)) {
      const patterns = assignRegionPatterns(p);
      const area = new Array<number>(p.size).fill(0);
      for (const r of p.regions) area[r]++;
      for (const [a, b] of edgesOf(p)) expect(patterns[a]).not.toBe(patterns[b]);
      expect(patterns.reduce((s, t, r) => s + area[r] * t, 0)).toBe(bestCost(p));
    }
  });

  it('les textures couvrent moins de surface que l’attribution par indice (plateau plus calme)', () => {
    let texturedBefore = 0;
    let texturedAfter = 0;
    let cells = 0;
    for (const p of DAILY) {
      const patterns = assignRegionPatterns(p);
      const area = new Array<number>(p.size).fill(0);
      for (const r of p.regions) area[r]++;
      texturedAfter += area.reduce((s, a, r) => s + (patterns[r] ? a : 0), 0);
      texturedBefore += area.reduce((s, a, r) => s + (r % 4 ? a : 0), 0); // attribution par indice : r % 4
      cells += p.size * p.size;
    }
    // Mesuré : 67 % de la surface texturée par indice, 58 % ici.
    expect(texturedAfter / cells).toBeLessThan(texturedBefore / cells - 0.05);
  });

  it('graphe non planaire (cinq régions toutes voisines) : repli sans exception, un seul conflit au minimum', () => {
    // Une rangée dont les paires consécutives parcourent les dix paires de K5 : 0 1 2 3 4 0 2 4 1 3 0.
    const k5: QueensPuzzle = { size: 11, regions: [0, 1, 2, 3, 4, 0, 2, 4, 1, 3, 0] };
    const adjacency = regionAdjacency(k5);
    expect(adjacency.flat().filter(Boolean)).toHaveLength(20);
    const patterns = assignRegionPatterns(k5);
    expect(patterns).toHaveLength(5);
    for (const t of patterns) expect([0, 1, 2, 3]).toContain(t);
    const conflicts = edgesOf(k5).filter(([a, b]) => patterns[a] === patterns[b]).length;
    expect(conflicts).toBe(1);
    expect(assignRegionColors(k5, paletteOf(SOURCES[0], 5))).toHaveLength(5);
  });
});
