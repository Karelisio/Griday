import { describe, expect, it } from 'vitest';
import { hashHex, rngFromString } from '../core/prng';
import { canonicalizeRegions, decodeQueens, validateQueensStructure } from './encoding';
import { solveQueensExact } from './exact';
import {
  QUEENS_TECHNIQUES_V1,
  nextQueensStep,
  rateQueens,
  restrictQueensProfile,
  solveQueensLogically,
  type QueensProfile,
  type QueensStep,
  type QueensTechnique,
  type QueensUnitKind,
  type QueensUnitRef,
} from './solver';
import { randomQueensLayout, randomUniqueQueens } from './testing';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, type QueensMark, type QueensPuzzle, type QueensSolvedPuzzle } from './types';

// ─── Outils ──────────────────────────────────────────────────────────────────────────────────

/** Grille depuis des lettres (une lettre = une région). */
function board(rows: readonly string[]): QueensPuzzle {
  const p = { size: rows.length, regions: canonicalizeRegions(Array.from(rows.join(''), (ch) => ch.charCodeAt(0))) };
  expect(validateQueensStructure(p)).toEqual([]);
  return p;
}

/** Marques depuis des lignes : '.' vide, 'x' croix, 'Q' reine. */
function grid(rows: readonly string[]): QueensMark[] {
  return Array.from(rows.join(''), (ch) => (ch === 'x' ? MARK_CROSS : ch === 'Q' ? MARK_QUEEN : MARK_EMPTY));
}

const blank = (n: number): QueensMark[] => new Array<QueensMark>(n * n).fill(MARK_EMPTY);
const unit = (kind: QueensUnitKind, index: number): QueensUnitRef => ({ kind, index });
const solutionCells = (p: QueensSolvedPuzzle): Set<number> => new Set(p.solution.map((c, r) => r * p.size + c));

function attacks(p: QueensPuzzle, a: number, b: number): boolean {
  const n = p.size;
  const [ra, ca, rb, cb] = [Math.floor(a / n), a % n, Math.floor(b / n), b % n];
  return a !== b && (ra === rb || ca === cb || p.regions[a] === p.regions[b] || (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1));
}

/** Applique une étape à des marques : reine (+ croix automatiques) et croix. */
function applyStep(p: QueensPuzzle, marks: readonly QueensMark[], step: QueensStep): QueensMark[] {
  const out = [...marks];
  for (const q of step.place) {
    for (let x = 0; x < out.length; x++) if (attacks(p, q, x)) out[x] = MARK_CROSS;
    out[q] = MARK_QUEEN;
  }
  for (const x of step.eliminate) out[x] = MARK_CROSS;
  return out;
}

const cache = new Map<string, QueensSolvedPuzzle[]>();
function uniquePuzzles(n: number, count: number): QueensSolvedPuzzle[] {
  const key = `${n}:${count}`;
  let list = cache.get(key);
  if (!list) {
    list = [];
    for (let i = 0; list.length < count; i++) {
      const p = randomUniqueQueens(rngFromString(`solver-test-${n}-${i}`), n);
      if (p) list.push(p);
    }
    cache.set(key, list);
  }
  return list;
}

// ─── Référence naïve : définitions littérales sur des tableaux (indépendante du solveur) ─────

interface RefUnit extends QueensUnitRef {
  readonly cells: readonly number[];
}
interface RefState {
  readonly p: QueensPuzzle;
  readonly units: readonly RefUnit[];
  readonly live: readonly boolean[];
  readonly queen: readonly boolean[];
}
interface RefApp {
  readonly technique: QueensTechnique;
  readonly place: number[];
  readonly eliminate: number[];
  readonly units: QueensUnitRef[];
  readonly targets: QueensUnitRef[];
}

function refUnits(p: QueensPuzzle): RefUnit[] {
  const n = p.size;
  const idx = Array.from({ length: n }, (_, i) => i);
  return [
    ...idx.map((g) => ({ kind: 'region' as const, index: g, cells: p.regions.flatMap((x, i) => (x === g ? [i] : [])) })),
    ...idx.map((r) => ({ kind: 'row' as const, index: r, cells: idx.map((c) => r * n + c) })),
    ...idx.map((c) => ({ kind: 'column' as const, index: c, cells: idx.map((r) => r * n + c) })),
  ];
}

function refState(p: QueensPuzzle, marks: readonly QueensMark[]): RefState {
  const live = marks.map((m) => m === MARK_EMPTY);
  const queen = marks.map((m) => m === MARK_QUEEN);
  queen.forEach((q, i) => {
    if (q) live.forEach((_, x) => attacks(p, i, x) && (live[x] = false));
  });
  return { p, units: refUnits(p), live, queen };
}

function refApply(st: RefState, app: { place: readonly number[]; eliminate: readonly number[] }): RefState {
  const live = [...st.live];
  const queen = [...st.queen];
  for (const q of app.place) {
    live.forEach((_, x) => attacks(st.p, q, x) && (live[x] = false));
    live[q] = false;
    queen[q] = true;
  }
  for (const x of app.eliminate) live[x] = false;
  return { ...st, live, queen };
}

const ref = (u: QueensUnitRef): QueensUnitRef => ({ kind: u.kind, index: u.index });
const solvedU = (st: RefState, u: RefUnit): boolean => u.cells.some((x) => st.queen[x]);
const candsU = (st: RefState, u: RefUnit): number[] => u.cells.filter((x) => st.live[x]);
const liveCells = (st: RefState, pred: (x: number) => boolean): number[] => st.live.flatMap((l, x) => (l && pred(x) ? [x] : []));
const rowOf = (st: RefState, x: number): number => Math.floor(x / st.p.size);
const colOf = (st: RefState, x: number): number => x % st.p.size;
const uniq = (xs: number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);
const unitsOfKind = (st: RefState, kind: QueensUnitKind): RefUnit[] => st.units.filter((u) => u.kind === kind && !solvedU(st, u));

function refSingles(st: RefState): RefApp[] {
  return st.units
    .filter((u) => !solvedU(st, u) && candsU(st, u).length === 1)
    .map((u) => ({ technique: 'single', place: candsU(st, u), eliminate: [], units: [ref(u)], targets: [] }));
}

function refRegionLine(st: RefState): RefApp[] {
  const out: RefApp[] = [];
  for (const u of unitsOfKind(st, 'region')) {
    const cs = candsU(st, u);
    for (const [kind, of] of [['row', rowOf], ['column', colOf]] as const) {
      const lines = uniq(cs.map((x) => of(st, x)));
      if (lines.length !== 1) continue;
      const elim = liveCells(st, (x) => of(st, x) === lines[0] && st.p.regions[x] !== u.index);
      if (elim.length > 0) out.push({ technique: 'region-line', place: [], eliminate: elim, units: [ref(u)], targets: [unit(kind, lines[0]!)] });
    }
  }
  return out;
}

function refLineRegion(st: RefState): RefApp[] {
  const out: RefApp[] = [];
  for (const u of [...unitsOfKind(st, 'row'), ...unitsOfKind(st, 'column')]) {
    const regs = uniq(candsU(st, u).map((x) => st.p.regions[x]!));
    if (regs.length !== 1) continue;
    const elim = liveCells(st, (x) => st.p.regions[x] === regs[0] && !u.cells.includes(x));
    if (elim.length > 0) out.push({ technique: 'line-region', place: [], eliminate: elim, units: [ref(u)], targets: [unit('region', regs[0]!)] });
  }
  return out;
}

/** Applications d'attaque, triées par nombre de candidates puis ordre des unités (tri stable). */
function refAttacks(st: RefState): RefApp[] {
  const out: (RefApp & { count: number })[] = [];
  for (const u of st.units) {
    const cs = candsU(st, u);
    if (solvedU(st, u) || cs.length < 2) continue;
    const elim = liveCells(st, (x) => cs.every((y) => attacks(st.p, x, y)));
    if (elim.length > 0) out.push({ technique: 'attack', place: [], eliminate: elim, units: [ref(u)], targets: [], count: cs.length });
  }
  return out.sort((a, b) => a.count - b.count).map(({ count: _, ...app }) => app);
}

function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), k - 1)) out.push([item, ...rest]);
  });
  return out;
}

/**
 * Ensembles bloqués : k sources dont les candidates tiennent dans k cibles, six familles.
 * `all` : tous les k de 2 à m−2 ; sinon k ≤ ⌊m/2⌋ dans l'ordre documenté (k, famille, lexicographique).
 */
function refLocked(st: RefState, all: boolean): (RefApp & { level: number })[] {
  const n = st.p.size;
  const m = n - st.queen.filter(Boolean).length;
  const target = (kind: QueensUnitKind, x: number): number => (kind === 'row' ? rowOf(st, x) : kind === 'column' ? colOf(st, x) : st.p.regions[x]!);
  const forms: [QueensUnitKind, QueensUnitKind][] = [
    ['region', 'row'],
    ['region', 'column'],
    ['row', 'region'],
    ['column', 'region'],
    ['row', 'column'],
    ['column', 'row'],
  ];
  const out: (RefApp & { level: number })[] = [];
  for (let k = 2; k <= (all ? m - 2 : Math.floor(m / 2)); k++) {
    for (const [srcKind, dstKind] of forms) {
      for (const srcs of combinations(unitsOfKind(st, srcKind), k)) {
        const targets = uniq(srcs.flatMap((u) => candsU(st, u).map((x) => target(dstKind, x))));
        if (targets.length !== k) continue;
        const inSources = new Set(srcs.flatMap((u) => u.cells));
        const elim = liveCells(st, (x) => targets.includes(target(dstKind, x)) && !inSources.has(x));
        if (elim.length === 0) continue;
        const level = Math.min(k, m - k) === 2 ? 4 : 5;
        out.push({
          technique: level === 4 ? 'locked-pair' : 'locked-set',
          level,
          place: [],
          eliminate: elim,
          units: srcs.map(ref),
          targets: targets.map((t) => unit(dstKind, t)),
        });
      }
    }
  }
  return out;
}

/** Propagation d'une hypothèse dans l'ordre documenté (single, region-line, line-region). */
function refHypothesis(st0: RefState, x: number): { fail: QueensUnitRef | null; chain: RefApp[] } {
  let st = refApply(st0, { place: [x], eliminate: [] });
  const chain: RefApp[] = [];
  for (;;) {
    const empty = st.units.find((u) => !solvedU(st, u) && candsU(st, u).length === 0);
    if (empty) return { fail: ref(empty), chain };
    const app = refSingles(st)[0] ?? refRegionLine(st)[0] ?? refLineRegion(st)[0];
    if (!app) return { fail: null, chain };
    chain.push(app);
    st = refApply(st, app);
  }
}

/** Hypothèses réfutées, triées par longueur de réfutation puis par case. */
function refContradictions(st: RefState): { x: number; fail: QueensUnitRef; chain: RefApp[] }[] {
  const out: { x: number; fail: QueensUnitRef; chain: RefApp[] }[] = [];
  st.live.forEach((l, x) => {
    if (!l) return;
    const h = refHypothesis(st, x);
    if (h.fail) out.push({ x, fail: h.fail, chain: h.chain });
  });
  return out.sort((a, b) => a.chain.length - b.chain.length || a.x - b.x);
}

/** Famille d'un ensemble bloqué impliquant des régions (les 4 familles d'origine). */
const isRegionFamily = (s: RefApp | QueensStep): boolean => s.units[0]?.kind === 'region' || s.targets[0]?.kind === 'region';

const core = (s: RefApp | QueensStep) => ({ technique: s.technique, place: s.place, eliminate: s.eliminate, units: s.units, targets: s.targets });

/** Vérifie une étape du solveur contre la référence : aucune technique plus facile, bon choix, bon contenu. */
function checkStep(st: RefState, step: QueensStep): void {
  const L = step.level;
  if (L > 1) expect(refSingles(st)).toEqual([]);
  if (L > 2 || step.technique === 'line-region') expect(refRegionLine(st)).toEqual([]);
  if (L > 2) expect(refLineRegion(st)).toEqual([]);
  if (L > 3) expect(refAttacks(st)).toEqual([]);
  if (L > 4) expect(refLocked(st, true).filter((a) => a.level === 4)).toEqual([]);
  if (L > 5) expect(refLocked(st, true)).toEqual([]);
  switch (step.technique) {
    case 'single':
      expect(core(step)).toEqual(core(refSingles(st)[0]!));
      expect(step.cells).toEqual(step.place);
      break;
    case 'region-line':
      expect(core(step)).toEqual(core(refRegionLine(st)[0]!));
      break;
    case 'line-region':
      expect(core(step)).toEqual(core(refLineRegion(st)[0]!));
      break;
    case 'attack':
      expect(core(step)).toEqual(core(refAttacks(st)[0]!));
      break;
    case 'locked-pair':
    case 'locked-set': {
      const first = refLocked(st, false).find((a) => a.level === L);
      expect(first).toBeDefined();
      expect(core(step)).toEqual(core(first!));
      break;
    }
    case 'contradiction': {
      const first = refContradictions(st)[0]!;
      expect(step.cells).toEqual([first.x]);
      expect(step.eliminate).toEqual([first.x]);
      expect(step.units).toEqual([first.fail]);
      expect(step.chain.map(core)).toEqual(first.chain.map(core));
      break;
    }
  }
  if (step.technique !== 'contradiction' && step.technique !== 'single') {
    // Cases pivots = candidates des unités sources.
    const pivots = uniq(step.units.flatMap((u) => candsU(st, st.units.find((v) => v.kind === u.kind && v.index === u.index)!)));
    expect(step.cells).toEqual(pivots);
  }
}

/** Solveur + référence pas à pas ; si le solveur est bloqué, la référence ne trouve rien non plus. */
function crossCheck(p: QueensPuzzle): void {
  const res = solveQueensLogically(p);
  let marks = blank(p.size);
  for (const step of res.steps) {
    checkStep(refState(p, marks), step);
    marks = applyStep(p, marks, step);
  }
  expect(marks).toEqual(res.marks);
  if (res.status === 'stuck') {
    const st = refState(p, marks);
    expect([...refSingles(st), ...refRegionLine(st), ...refLineRegion(st), ...refAttacks(st), ...refLocked(st, true)]).toEqual([]);
    expect(refContradictions(st)).toEqual([]);
  }
}

// ─── Grilles construites à la main ───────────────────────────────────────────────────────────

// 5×5 (8 solutions : seules les déductions locales sont testées).
const A = board(['aabbb', 'aabcc', 'dabcc', 'ddeec', 'ddeee']);
// 6×6 : régions a et b enfermées dans les lignes 0–1 (paire bloquée).
const B = board(['aabbcc', 'aabbcc', 'dddccc', 'ddeeff', 'ddeeff', 'ddeeff']);
// 8×8 : régions a, b, c enfermées dans les lignes 0–2 (triplet bloqué), sans paire nulle part.
const C = board(['aabbccdd', 'aabbccdd', 'aabbccdd', 'eeffgggd', 'eeffgghd', 'effgghhd', 'eefghhhh', 'eeegghhh']);
// 8×8 en trois bandes ; avec D_MARKS, les lignes 2 et 5 n'ont plus que les colonnes 1 et 6
// (quatre cases de quatre régions distinctes : ni attaque ni famille « régions »).
const D_ROWS = ['aaabbccc', 'aabbbccc', 'aabbbccc', 'dddeefff', 'ddeeefff', 'ddeeefff', 'gggghhhh', 'gggggghh'];
const D_MARKS = ['........', '........', 'x.xxxx.x', '........', '........', 'x.xxxx.x', '........', '........'];
const D = board(D_ROWS);
const transpose = (rows: readonly string[]): string[] => rows.map((_, c) => rows.map((r) => r[c]).join(''));
// 10×10 réelle (solution unique) : niveau 6 sans la famille lignes↔colonnes, niveau 4 avec.
const RC_REAL = '0000011223001111122200011122224441155552644111555544477775554477775588447777758897777878889999788888';

describe('techniques (grilles construites)', () => {
  it('single : région, puis ligne, puis colonne', () => {
    // Région e réduite à (4,4) et ligne 2 réduite à (2,4) : la région passe d'abord.
    expect(nextQueensStep(A, grid(['.....', '.....', 'xxxx.', '..xx.', '..xx.']))).toEqual({
      technique: 'single',
      level: 1,
      place: [24],
      eliminate: [],
      units: [unit('region', 4)],
      targets: [],
      cells: [24],
      chain: [],
    });
    // Ligne 2 réduite à (2,4) et colonne 1 réduite à (3,1) : la ligne passe d'abord.
    const row = nextQueensStep(A, grid(['.x...', '.x...', 'xxxx.', '.....', '.x...']));
    expect(row).toMatchObject({ technique: 'single', place: [14], units: [unit('row', 2)] });
    const col = nextQueensStep(A, grid(['.x...', '.x...', '.x...', '.....', '.x...']));
    expect(col).toMatchObject({ technique: 'single', place: [16], units: [unit('column', 1)], cells: [16] });
  });

  it('region-line : région enfermée dans une ligne ou une colonne', () => {
    // Région b réduite à la ligne 0 → (0,0) et (0,1) éliminées (l'attaque sur b serait aussi possible).
    expect(nextQueensStep(A, grid(['.....', '..x..', '..x..', '.....', '.....']))).toEqual({
      technique: 'region-line',
      level: 2,
      place: [],
      eliminate: [0, 1],
      units: [unit('region', 1)],
      targets: [unit('row', 0)],
      cells: [2, 3, 4],
      chain: [],
    });
    // Région d réduite à la colonne 0 → (0,0) et (1,0) éliminées.
    expect(nextQueensStep(A, grid(['.....', '.....', '.....', '.x...', '.x...']))).toMatchObject({
      technique: 'region-line',
      eliminate: [0, 5],
      units: [unit('region', 3)],
      targets: [unit('column', 0)],
      cells: [10, 15, 20],
    });
  });

  it('line-region : ligne ou colonne enfermée dans une région', () => {
    // Ligne 1 réduite à la région a → reste de a éliminé.
    expect(nextQueensStep(A, grid(['.....', '..xxx', '.....', '.....', '.....']))).toEqual({
      technique: 'line-region',
      level: 2,
      place: [],
      eliminate: [0, 1, 11],
      units: [unit('row', 1)],
      targets: [unit('region', 0)],
      cells: [5, 6],
      chain: [],
    });
    // Colonne 3 réduite à la région c → reste de c éliminé.
    expect(nextQueensStep(A, grid(['...x.', '.....', '.....', '...x.', '...x.']))).toMatchObject({
      technique: 'line-region',
      eliminate: [9, 14, 19],
      units: [unit('column', 3)],
      targets: [unit('region', 2)],
      cells: [8, 13],
    });
  });

  it('attack : cases qui videraient une unité, groupées par unité', () => {
    // Grille vide : (1,3) touche ou voit les 5 cases de la région b.
    expect(nextQueensStep(A, blank(5))).toMatchObject({ technique: 'attack', level: 3, eliminate: [8], units: [unit('region', 1)], cells: [2, 3, 4, 7, 12] });
    // Région a réduite à deux cases en diagonale (0,0)/(1,1) → (0,2) et (2,0) les voient toutes deux.
    expect(nextQueensStep(A, grid(['.x...', 'x....', '.x...', '.....', '.....']))).toEqual({
      technique: 'attack',
      level: 3,
      place: [],
      eliminate: [2, 10],
      units: [unit('region', 0)],
      targets: [],
      cells: [0, 6],
      chain: [],
    });
    // Région a en L (0,1)/(1,0)/(1,1) → (1,2) voit les trois cases.
    expect(nextQueensStep(A, grid(['x....', '.....', '.x...', '.....', '.....']))).toMatchObject({
      technique: 'attack',
      eliminate: [7],
      units: [unit('region', 0)],
      cells: [1, 5, 6],
    });
  });

  it('locked-pair : deux régions dans deux lignes', () => {
    expect(nextQueensStep(B, blank(6))).toEqual({
      technique: 'locked-pair',
      level: 4,
      place: [],
      eliminate: [4, 5, 10, 11],
      units: [unit('region', 0), unit('region', 1)],
      targets: [unit('row', 0), unit('row', 1)],
      cells: [0, 1, 2, 3, 6, 7, 8, 9],
      chain: [],
    });
    expect(nextQueensStep(B, blank(6), restrictQueensProfile(QUEENS_TECHNIQUES_V1, 3))).toBeNull();
  });

  it('locked-set : trois régions dans trois lignes', () => {
    expect(nextQueensStep(C, blank(8))).toEqual({
      technique: 'locked-set',
      level: 5,
      place: [],
      eliminate: [6, 7, 14, 15, 22, 23],
      units: [unit('region', 0), unit('region', 1), unit('region', 2)],
      targets: [unit('row', 0), unit('row', 1), unit('row', 2)],
      cells: [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21],
      chain: [],
    });
    expect(nextQueensStep(C, blank(8), restrictQueensProfile(QUEENS_TECHNIQUES_V1, 4))).toBeNull();
  });

  it('locked-pair lignes→colonnes : seule déduction possible avant la contradiction', () => {
    const marks = grid(D_MARKS);
    const step = nextQueensStep(D, marks);
    expect(step).toEqual({
      technique: 'locked-pair',
      level: 4,
      place: [],
      eliminate: [1, 6, 9, 14, 25, 30, 33, 38, 49, 54, 57, 62],
      units: [unit('row', 2), unit('row', 5)],
      targets: [unit('column', 1), unit('column', 6)],
      cells: [17, 22, 41, 46],
      chain: [],
    });
    // Référence : rien de plus facile, aucune famille « régions » à aucun k ; seules des contradictions sinon.
    const st = refState(D, marks);
    checkStep(st, step!);
    expect(refLocked(st, true).filter(isRegionFamily)).toEqual([]);
    expect(refContradictions(st).length).toBeGreaterThan(0);
    expect(nextQueensStep(D, marks, restrictQueensProfile(QUEENS_TECHNIQUES_V1, 3))).toBeNull();
  });

  it('locked-pair colonnes→lignes : même grille transposée', () => {
    const p = board(transpose(D_ROWS));
    const marks = grid(transpose(D_MARKS));
    const step = nextQueensStep(p, marks);
    expect(step).toEqual({
      technique: 'locked-pair',
      level: 4,
      place: [],
      eliminate: [8, 9, 11, 12, 14, 15, 48, 49, 51, 52, 54, 55],
      units: [unit('column', 2), unit('column', 5)],
      targets: [unit('row', 1), unit('row', 6)],
      cells: [10, 13, 50, 53],
      chain: [],
    });
    const st = refState(p, marks);
    checkStep(st, step!);
    expect(refLocked(st, true).filter(isRegionFamily)).toEqual([]);
  });

  it('à k égal, les familles « régions » passent avant les familles lignes↔colonnes', () => {
    // D avec (6,0) dans la région d : la paire régions g, h → lignes 6, 7 élimine (6,0).
    const p = board(['aaabbccc', 'aabbbccc', 'aabbbccc', 'dddeefff', 'ddeeefff', 'ddeeefff', 'dggghhhh', 'gggggghh']);
    const marks = grid(D_MARKS);
    const step = nextQueensStep(p, marks)!;
    expect(step).toMatchObject({
      technique: 'locked-pair',
      eliminate: [48],
      units: [unit('region', 6), unit('region', 7)],
      targets: [unit('row', 6), unit('row', 7)],
    });
    checkStep(refState(p, marks), step);
    // La paire lignes 2, 5 → colonnes 1, 6 vient juste après.
    expect(nextQueensStep(p, applyStep(p, marks, step))).toMatchObject({
      technique: 'locked-pair',
      units: [unit('row', 2), unit('row', 5)],
      targets: [unit('column', 1), unit('column', 6)],
    });
  });

  it("famille lignes↔colonnes sur une grille réelle 10×10 : niveau 4 au lieu d'une contradiction", () => {
    const p = decodeQueens(RC_REAL);
    expect(solveQueensExact(p, 2).count).toBe(1);
    expect(rateQueens(p)).toMatchObject({ solvable: true, tier: 3, maxLevel: 4, hardest: 'locked-pair' });
    const res = solveQueensLogically(p);
    const i = res.steps.findIndex((s) => s.technique.startsWith('locked') && !isRegionFamily(s));
    expect(res.steps[i]).toMatchObject({ technique: 'locked-pair', units: [unit('column', 2), unit('column', 6)], targets: [unit('row', 2), unit('row', 5)] });
    // Jusque-là, le chemin est celui des 4 familles d'origine ; ici, elles ne trouvent rien : il faudrait une contradiction.
    let marks = blank(10);
    for (const step of res.steps.slice(0, i)) marks = applyStep(p, marks, step);
    const st = refState(p, marks);
    expect(refLocked(st, true).filter(isRegionFamily)).toEqual([]);
    expect(refContradictions(st).length).toBeGreaterThan(0);
    crossCheck(p);
  });

  it('contradiction : hypothèse réfutée par propagation (grille réelle 5×5 à solution unique)', () => {
    // 00000 / 00012 / 33412 / 33412 / 33111 ; état atteint par le solveur avant sa 7e étape.
    const p = decodeQueens('0000000012334123341233111');
    const marks = grid(['..xxx', 'xxx..', '.x.xx', '.x.x.', '..x.x']);
    // Reine en (1,3) ⇒ la région 2 n'a plus que (3,4) ⇒ la région 4 n'a plus aucune case.
    expect(nextQueensStep(p, marks)).toEqual({
      technique: 'contradiction',
      level: 6,
      place: [],
      eliminate: [8],
      units: [unit('region', 4)],
      targets: [],
      cells: [8],
      chain: [{ technique: 'single', level: 1, place: [19], eliminate: [], units: [unit('region', 2)], targets: [], cells: [19], chain: [] }],
    });
    expect(nextQueensStep(p, marks, restrictQueensProfile(QUEENS_TECHNIQUES_V1, 5))).toBeNull();
    const sol = solveQueensExact(p, 2).solutions;
    expect(sol).toHaveLength(1);
    expect(sol[0]![1]).not.toBe(3);
  });

  it('les grilles construites passent la vérification croisée complète', () => {
    for (const p of [A, B, C, D, board(transpose(D_ROWS))]) crossCheck(p);
  });
});

// ─── Profil, paliers, API ────────────────────────────────────────────────────────────────────

describe('profil V1', () => {
  it('est figé : ordre, niveaux, poids, paliers', () => {
    expect(QUEENS_TECHNIQUES_V1).toEqual({
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
    expect(Object.isFrozen(QUEENS_TECHNIQUES_V1)).toBe(true);
    expect(Object.isFrozen(QUEENS_TECHNIQUES_V1.techniques)).toBe(true);
    expect(Object.isFrozen(QUEENS_TECHNIQUES_V1.techniques[0])).toBe(true);
    expect(Object.isFrozen(QUEENS_TECHNIQUES_V1.tierByLevel)).toBe(true);
  });

  it('restrictQueensProfile ne garde que les niveaux demandés', () => {
    const p3 = restrictQueensProfile(QUEENS_TECHNIQUES_V1, 3);
    expect(p3.techniques.map((t) => t.id)).toEqual(['single', 'region-line', 'line-region', 'attack']);
    expect(p3.tierByLevel).toEqual(QUEENS_TECHNIQUES_V1.tierByLevel);
  });

  it('rejette un profil incohérent', () => {
    const p = uniquePuzzles(6, 1)[0]!;
    const unsorted = { id: 'x', techniques: [{ id: 'attack', level: 3, weight: 1 }, { id: 'single', level: 1, weight: 1 }], tierByLevel: [1] } as const;
    expect(() => rateQueens(p, unsorted)).toThrow(RangeError);
    const unknown: QueensProfile = { id: 'y', techniques: [{ id: 'magic' as QueensTechnique, level: 1, weight: 1 }], tierByLevel: [1] };
    expect(() => rateQueens(p, unknown)).toThrow(RangeError);
  });
});

describe('API', () => {
  it('rejette des entrées invalides', () => {
    expect(() => rateQueens({ size: 0, regions: [] })).toThrow(RangeError);
    expect(() => rateQueens({ size: 13, regions: new Array<number>(169).fill(0) })).toThrow(RangeError);
    expect(() => rateQueens({ size: 5, regions: [0, 1, 2] })).toThrow(RangeError);
    expect(() => rateQueens({ size: 2, regions: [0, 1, 1, 2] })).toThrow(RangeError);
    expect(() => solveQueensLogically(A, { initialMarks: blank(4) })).toThrow(RangeError);
  });

  it('marques initiales : solution complète, reines en conflit, croix', () => {
    const p = uniquePuzzles(7, 1)[0]!;
    const n = p.size;
    const solved = blank(n);
    p.solution.forEach((c, r) => (solved[r * n + c] = MARK_QUEEN));
    const done = solveQueensLogically(p, { initialMarks: solved });
    expect(done).toMatchObject({ status: 'solved', solved: true, steps: [], maxLevel: 0, score: 0, hardest: 'none' });
    expect(nextQueensStep(p, solved)).toBeNull();

    const clash = blank(n);
    clash[0] = MARK_QUEEN;
    clash[1] = MARK_QUEEN;
    expect(solveQueensLogically(p, { initialMarks: clash })).toMatchObject({ status: 'contradiction', solved: false, steps: [] });
    expect(nextQueensStep(p, clash)).toBeNull();

    // Ligne 0 entièrement barrée : état impossible.
    const dead = blank(n);
    for (let c = 0; c < n; c++) dead[c] = MARK_CROSS;
    expect(solveQueensLogically(p, { initialMarks: dead }).status).toBe('contradiction');
    expect(nextQueensStep(p, dead)).toBeNull();

    // Partir d'un état intermédiaire du solveur donne la suite exacte de ses étapes.
    const full = solveQueensLogically(p);
    let marks = blank(n);
    for (let i = 0; i < 4; i++) marks = applyStep(p, marks, full.steps[i]!);
    expect(solveQueensLogically(p, { initialMarks: marks }).steps).toEqual(full.steps.slice(4));
    expect(nextQueensStep(p, marks)).toEqual(full.steps[4]);
  });

  it('état final : n reines à la solution, aucune candidate restante', () => {
    const p = uniquePuzzles(8, 1)[0]!;
    const res = solveQueensLogically(p);
    expect(res.solved).toBe(true);
    const expected = new Array<QueensMark>(64).fill(MARK_CROSS);
    p.solution.forEach((c, r) => (expected[r * 8 + c] = MARK_QUEEN));
    expect(res.marks).toEqual(expected);
  });
});

// ─── Grilles aléatoires ──────────────────────────────────────────────────────────────────────

const SIZES = [5, 6, 7, 8, 9, 10] as const;
const PER_SIZE = 50;

describe('grilles aléatoires à solution unique', () => {
  it(`solidité : ${PER_SIZE} grilles par taille 5–10`, () => {
    let steps = 0;
    for (const n of SIZES) {
      for (const p of uniquePuzzles(n, PER_SIZE)) {
        const sol = solutionCells(p);
        const res = solveQueensLogically(p);
        for (const step of res.steps) {
          for (const x of step.place) expect(sol.has(x)).toBe(true);
          for (const x of step.eliminate) expect(sol.has(x)).toBe(false);
          for (const sub of step.chain) expect(sub.level).toBeLessThanOrEqual(2);
          expect(step.level).toBe(QUEENS_TECHNIQUES_V1.techniques.find((t) => t.id === step.technique)!.level);
          expect(step.place.length + step.eliminate.length).toBeGreaterThan(0);
        }
        steps += res.steps.length;
        // Toute grille unique est résolue par V1 (mesuré : aucune exception sur ces échantillons).
        expect(res.status).toBe('solved');
        res.marks.forEach((m, x) => expect(m === MARK_QUEEN).toBe(sol.has(x)));
        // Compteurs cohérents.
        const counts = new Array<number>(7).fill(0);
        for (const step of res.steps) counts[step.level]!++;
        expect(res.levelCounts).toEqual(counts);
        expect(res.maxLevel).toBe(Math.max(0, ...res.steps.map((s) => s.level)));
        const weight = (t: QueensTechnique) => QUEENS_TECHNIQUES_V1.techniques.find((s) => s.id === t)!.weight;
        expect(res.score).toBe(res.steps.reduce((acc, s) => acc + weight(s.technique), 0));
        expect(res.steps.filter((s) => s.technique === 'single')).toHaveLength(n);
      }
    }
    expect(steps).toBeGreaterThan(0);
  });

  it('rateQueens = solveQueensLogically, paliers selon le niveau max', () => {
    const tiers = [1, 1, 1, 2, 3, 4, 4];
    const seenLevels = new Set<number>();
    for (const n of SIZES) {
      for (const p of uniquePuzzles(n, PER_SIZE)) {
        const res = solveQueensLogically(p);
        const rating = rateQueens(p);
        seenLevels.add(rating.maxLevel);
        const hardest = [...QUEENS_TECHNIQUES_V1.techniques].reverse().find((t) => res.steps.some((s) => s.technique === t.id))!.id;
        expect(rating).toEqual({
          tier: tiers[res.maxLevel],
          score: res.score,
          hardest,
          solvable: true,
          steps: res.steps.length,
          maxLevel: res.maxLevel,
          levelCounts: res.levelCounts,
        });
      }
    }
    expect([...seenLevels].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('déterminisme : deux exécutions identiques', () => {
    for (const n of SIZES) {
      for (const p of uniquePuzzles(n, PER_SIZE).slice(0, 10)) {
        expect(solveQueensLogically(p)).toEqual(solveQueensLogically(p));
        expect(rateQueens(p)).toEqual(rateQueens(p));
      }
    }
  });

  it('restriction du profil : niveau max − 1 ne suffit pas, niveau max donne le même résultat', () => {
    for (const n of SIZES) {
      for (const p of uniquePuzzles(n, PER_SIZE).slice(0, 25)) {
        const full = rateQueens(p);
        if (full.maxLevel > 1) {
          const below = rateQueens(p, restrictQueensProfile(QUEENS_TECHNIQUES_V1, full.maxLevel - 1));
          expect(below).toMatchObject({ solvable: false, tier: 4, hardest: 'unsolvable' });
          const stuck = solveQueensLogically(p, { maxLevel: full.maxLevel - 1 });
          expect(stuck.status).toBe('stuck');
          expect(stuck.marks).toContain(MARK_EMPTY);
          expect(stuck.steps.every((s) => s.level < full.maxLevel)).toBe(true);
        }
        expect(rateQueens(p, restrictQueensProfile(QUEENS_TECHNIQUES_V1, full.maxLevel))).toEqual(full);
      }
    }
  });

  it('vérification croisée avec la référence naïve (chaque étape, ordre de parcours, blocage)', () => {
    for (const n of SIZES) {
      for (const p of uniquePuzzles(n, PER_SIZE).slice(0, n <= 7 ? 12 : 6)) crossCheck(p);
    }
    // Points de blocage (profils réduits) : la référence ne trouve rien non plus.
    for (const p of uniquePuzzles(8, PER_SIZE).slice(0, 10)) {
      const r = rateQueens(p);
      if (r.maxLevel < 2) continue;
      const stuck = solveQueensLogically(p, { maxLevel: r.maxLevel - 1 });
      const st = refState(p, stuck.marks);
      const apps = [...refSingles(st), ...refRegionLine(st), ...refLineRegion(st), ...refAttacks(st), ...refLocked(st, true)];
      expect(apps.filter((a) => QUEENS_TECHNIQUES_V1.techniques.find((t) => t.id === a.technique)!.level < r.maxLevel)).toEqual([]);
    }
  });

  it('toutes les grilles nécessitant une contradiction sont vérifiées pas à pas', () => {
    let checked = 0;
    for (const n of [9, 10]) {
      for (const p of uniquePuzzles(n, PER_SIZE)) {
        if (rateQueens(p).maxLevel === 6 && checked < 4) {
          crossCheck(p);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('grilles à solutions multiples', () => {
  it('ne conclut jamais à tort : poses dans toutes les solutions, éliminations dans aucune', () => {
    let multi = 0;
    for (const n of [5, 6, 7, 8]) {
      for (let i = 0; i < 40; i++) {
        const p = randomQueensLayout(rngFromString(`solver-layout-${n}-${i}`), n);
        const exact = solveQueensExact(p, 100_000, 5_000_000);
        expect(exact.complete).toBe(true);
        const inAll = new Set(exact.solutions[0]!.map((c, r) => r * n + c));
        const inAny = new Set<number>();
        for (const s of exact.solutions) {
          const cells = new Set(s.map((c, r) => r * n + c));
          cells.forEach((x) => inAny.add(x));
          inAll.forEach((x) => cells.has(x) || inAll.delete(x));
        }
        const res = solveQueensLogically(p);
        for (const step of res.steps) {
          for (const x of step.place) expect(inAll.has(x)).toBe(true);
          for (const x of step.eliminate) expect(inAny.has(x)).toBe(false);
        }
        expect(res.status).not.toBe('contradiction');
        if (exact.count > 1) {
          multi++;
          expect(res.solved).toBe(false);
          expect(rateQueens(p).solvable).toBe(false);
        } else {
          expect(res.solved).toBe(rateQueens(p).solvable);
        }
      }
    }
    expect(multi).toBeGreaterThan(20);
  });
});

// ─── Golden : verrouille les résultats V1 (ne JAMAIS mettre à jour après publication) ────────

const trace = (steps: readonly QueensStep[]): string => hashHex(JSON.stringify(steps.map((s) => [s.technique, s.place, s.eliminate])));

const GOLDEN: readonly [string, Omit<ReturnType<typeof rateQueens>, 'solvable'>, string][] = [
  ['011222111222111122111123444444454444', { tier: 1, score: 6, hardest: 'single', steps: 6, maxLevel: 1, levelCounts: [0, 6, 0, 0, 0, 0, 0] }, '80a49d21a2ad7961a635430bb35e8e05'],
  ['001222311112311122311455311445334445', { tier: 4, score: 66, hardest: 'contradiction', steps: 16, maxLevel: 6, levelCounts: [0, 6, 3, 6, 0, 0, 1] }, 'a4017640cd6566ebf398a098ac171ca2'],
  ['0001122033122233322224322222433225543366556666555', { tier: 1, score: 13, hardest: 'region-line', steps: 10, maxLevel: 2, levelCounts: [0, 7, 3, 0, 0, 0, 0] }, '024768384bb93dab61adee0e82da3c75'],
  ['0011122001112201113220013342031334453336443333666', { tier: 3, score: 37, hardest: 'locked-pair', steps: 15, maxLevel: 4, levelCounts: [0, 7, 4, 3, 1, 0, 0] }, 'b87916a8c9cbc2497f0e7c7807342f01'],
  ['0000111100001111002222310042555600425666004456660444444674444446', { tier: 2, score: 22, hardest: 'attack', steps: 14, maxLevel: 3, levelCounts: [0, 8, 5, 1, 0, 0, 0] }, '1d95a84bbe04df4fbc4f0ff841cc53f0'],
  ['0001111203011442033544223335522533665555366655556666657566666775', { tier: 4, score: 80, hardest: 'locked-set', steps: 22, maxLevel: 5, levelCounts: [0, 8, 3, 9, 1, 1, 0] }, 'b99c3285050342762399bf2c940c711f'],
  ['000001222100111333111111133441555155465555557666555777666585557666588877666666888', { tier: 4, score: 71, hardest: 'locked-set', steps: 23, maxLevel: 5, levelCounts: [0, 9, 5, 8, 0, 1, 0] }, '5a09dbc43194b36deeddb445ac9be84f'],
  ['001111112001113333041433333444435333444435536444455566774455566777755555778755555', { tier: 1, score: 13, hardest: 'region-line', steps: 11, maxLevel: 2, levelCounts: [0, 9, 2, 0, 0, 0, 0] }, 'ed00de84ac4a92c6a6c772dc4b99d30a'],
  ['000011123000044223000044225000442255006622555666622225666672525866672525666655555', { tier: 4, score: 73, hardest: 'contradiction', steps: 18, maxLevel: 6, levelCounts: [0, 9, 2, 5, 1, 0, 1] }, '90e9813a72b8e22fdbdb136beaaf9afe'],
  ['0111111112000011111200001112220034112222003331333566333337556633333755633333888866638338889666888888', { tier: 3, score: 48, hardest: 'locked-pair', steps: 20, maxLevel: 4, levelCounts: [0, 10, 4, 5, 1, 0, 0] }, '48e34bfa84882d57a2cd66dcfd9d3727'],
  ['0001122222000012222200000323324403033333550333363755333666775535333667553553666755556666685556666999', { tier: 2, score: 22, hardest: 'attack', steps: 15, maxLevel: 3, levelCounts: [0, 10, 4, 1, 0, 0, 0] }, '3b6e8897dd7e964ff24fdfd4159c1f9e'],
  ['0000011233445501123244500112225555551122555556622675755666667775868666777788866677788886667778988866', { tier: 4, score: 46, hardest: 'locked-set', steps: 16, maxLevel: 5, levelCounts: [0, 10, 2, 3, 0, 1, 0] }, '93806cd97814ed86f26650aabd43275a'],
  ['0000011222000111112231111445223144444555314445455533444555667744445886744994598874499999987999999988', { tier: 4, score: 430, hardest: 'contradiction', steps: 34, maxLevel: 6, levelCounts: [0, 10, 0, 10, 1, 2, 11] }, '6284b63c80e66350fae728c67e449001'],
  ['0011112222000111122340511111224051111226445511226644411176664488116666444881116644888181164988888866', { tier: 1, score: 10, hardest: 'single', steps: 10, maxLevel: 1, levelCounts: [0, 10, 0, 0, 0, 0, 0] }, 'ab5767275ac26d070600141f0a93381b'],
  // Familles lignes↔colonnes (colonnes 7,8 → lignes 2,4).
  ['000000122003000224033055224330052244335556664735566644833536646833336646883366666', { tier: 4, score: 81, hardest: 'contradiction', steps: 20, maxLevel: 6, levelCounts: [0, 9, 2, 7, 1, 0, 1] }, '1f0da090ef413ff31ce3099600d48c5a'],
  // Lignes 1,4,6 → colonnes 3,4,5 (k = 3).
  ['0001222222011111112201333122240533333264555533344455755444445575777744877577444477777774447777777499', { tier: 4, score: 82, hardest: 'contradiction', steps: 19, maxLevel: 6, levelCounts: [0, 10, 3, 4, 0, 1, 1] }, '0d78488935ec57d1f91b2c6f1c83610a'],
  // Lignes 3,4 → colonnes 5,8.
  ['0011222233000122433311112243331514224336551444433657777448365557778866557776866655776666665977776666', { tier: 4, score: 170, hardest: 'contradiction', steps: 26, maxLevel: 6, levelCounts: [0, 10, 3, 6, 4, 0, 3] }, 'acfa36a3b2df6f10110bb0d747a53281'],
  // RC_REAL : colonnes 2,6 → lignes 2,5 (niveau 6 sans cette famille).
  [RC_REAL, { tier: 3, score: 70, hardest: 'locked-pair', steps: 22, maxLevel: 4, levelCounts: [0, 10, 3, 6, 3, 0, 0] }, '80ce79652c7961756b5ad78f4e68115b'],
];

describe('golden V1 (figé)', () => {
  it.each(GOLDEN)('%s', (code, rating, hash) => {
    const p = decodeQueens(code);
    expect(rateQueens(p)).toEqual({ ...rating, solvable: true });
    const res = solveQueensLogically(p);
    expect(trace(res.steps)).toBe(hash);
    expect(solveQueensExact(p, 2).count).toBe(1);
  });

  it('les grilles construites gardent leur note', () => {
    expect(rateQueens(A)).toMatchObject({ solvable: false });
    expect(rateQueens(B)).toEqual({ tier: 4, score: 30, hardest: 'unsolvable', solvable: false, steps: 5, maxLevel: 4, levelCounts: [0, 0, 1, 2, 2, 0, 0] });
    expect(rateQueens(C)).toEqual({ tier: 4, score: 76, hardest: 'unsolvable', solvable: false, steps: 5, maxLevel: 6, levelCounts: [0, 0, 1, 1, 0, 2, 1] });
  });
});

// ─── Performance (borne large : test de fumée) ───────────────────────────────────────────────

describe('performance', () => {
  it('rateQueens sur 10×10 : quelques millisecondes au pire', () => {
    const puzzles = uniquePuzzles(10, PER_SIZE);
    for (const p of puzzles.slice(0, 10)) rateQueens(p); // échauffement
    let total = 0;
    let worst = 0;
    for (const p of puzzles) {
      const t0 = performance.now();
      rateQueens(p);
      const dt = performance.now() - t0;
      total += dt;
      worst = Math.max(worst, dt);
    }
    expect(total / puzzles.length).toBeLessThan(5);
    expect(worst).toBeLessThan(50);
  });
});
