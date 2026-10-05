import { describe, expect, it } from 'vitest';
import { rngFromString } from '../../core/prng';
import { solveBinairoExact } from '../exact';
import { randomBinairoPuzzle, randomUniqueBinairo } from '../testing';
import type { BinairoCell, BinairoPuzzle, BinairoSolvedPuzzle } from '../types';
import {
  BINAIRO_TECHNIQUES_V1,
  createBinairoChecker,
  nextBinairoStep,
  rateBinairo,
  restrictBinairoProfile,
  solveBinairoLogically,
  type BinairoLineRef,
  type BinairoProfile,
  type BinairoStep,
  type BinairoTechnique,
} from './solver';

// ─── Outils ──────────────────────────────────────────────────────────────────────────────────

/** Cases depuis des lignes : 'A' = 1, 'B' = 2, '.' = vide. */
const cells = (rows: readonly string[]): BinairoCell[] => Array.from(rows.join(''), (ch) => (ch === 'A' ? 1 : ch === 'B' ? 2 : 0) as BinairoCell);
const board = (rows: readonly string[]): BinairoPuzzle => ({ size: rows.length, givens: cells(rows) });
const blank = (n: number): BinairoCell[] => new Array<BinairoCell>(n * n).fill(0);
const row = (index: number): BinairoLineRef => ({ kind: 'row', index });
const column = (index: number): BinairoLineRef => ({ kind: 'column', index });

const cache = new Map<string, BinairoSolvedPuzzle[]>();
/** Grilles à solution unique (oracle exact) ; keep = proportion minimale de données (0 : minimales). */
function uniquePuzzles(n: number, count: number, keep = 0): BinairoSolvedPuzzle[] {
  const key = `${n}:${count}:${keep}`;
  let list = cache.get(key);
  if (!list) {
    list = Array.from({ length: count }, (_, i) => randomUniqueBinairo(rngFromString(`solver-test-${n}-${keep}-${i}`), n, keep));
    cache.set(key, list);
  }
  return list;
}

/** Applique une étape (cases posées) à un état. */
function applyStep(st: readonly number[], step: BinairoStep): BinairoCell[] {
  const out = [...st] as BinairoCell[];
  for (const { cell, value } of step.place) out[cell] = value;
  return out;
}

// ─── Référence naïve : définitions littérales sur des tableaux (indépendante du solveur) ─────

type St = readonly number[];
interface RefStep {
  readonly technique: BinairoTechnique;
  readonly place: { cell: number; value: 1 | 2 }[];
  readonly cells: number[];
  readonly line: BinairoLineRef;
  readonly other: BinairoLineRef | null;
}

const sizeOf = (st: St): number => Math.round(Math.sqrt(st.length));
/** Lignes : 0..n-1 rangées, n..2n-1 colonnes ; cases dans l'ordre des positions. */
const lineCells = (n: number, l: number): number[] => Array.from({ length: n }, (_, k) => (l < n ? l * n + k : k * n + (l - n)));
const lineRef = (n: number, l: number): BinairoLineRef => (l < n ? row(l) : column(l - n));
const sortNum = (xs: Iterable<number>): number[] => [...xs].sort((a, b) => a - b);
const other = (v: number): 1 | 2 => (v === 1 ? 2 : 1);
const rowOf = (n: number, x: number): number => Math.floor(x / n);
const colOf = (n: number, x: number): number => x % n;

const validLine = (n: number, v: readonly number[]): boolean =>
  v.filter((x) => x === 1).length === n / 2 && v.filter((x) => x === 2).length === n / 2 && !v.some((x, k) => k >= 2 && x === v[k - 1] && x === v[k - 2]);

const completionCache = new Map<string, number[][]>();
/** Complétions valides (règles 1 et 2) d'une ligne : tous les remplissages des cases vides. */
function completions(n: number, v: readonly number[]): number[][] {
  const key = v.join('');
  let out = completionCache.get(key);
  if (out) return out;
  out = [];
  const empties = v.flatMap((x, k) => (x === 0 ? [k] : []));
  for (let m = 0; m < 1 << empties.length; m++) {
    const w = [...v];
    empties.forEach((k, j) => (w[k] = (m >> j) & 1 ? 2 : 1));
    if (validLine(n, w)) out.push(w);
  }
  completionCache.set(key, out);
  return out;
}

/** Positions vides communes à toutes les complétions (non vide seulement si au moins une complétion). */
function commonForced(v: readonly number[], comps: readonly number[][]): [number, 1 | 2][] {
  if (comps.length === 0) return [];
  const out: [number, 1 | 2][] = [];
  v.forEach((x, k) => {
    if (x === 0 && comps.every((w) => w[k] === comps[0]![k])) out.push([k, comps[0]![k] as 1 | 2]);
  });
  return out;
}

function refPair(st: St): RefStep[] {
  const n = sizeOf(st);
  const out: RefStep[] = [];
  for (let l = 0; l < 2 * n; l++) {
    const L = lineCells(n, l);
    for (let k = 0; k + 1 < n; k++) {
      const v = st[L[k]!]!;
      if (v === 0 || st[L[k + 1]!] !== v) continue;
      const ends = [k - 1, k + 2].filter((j) => j >= 0 && j < n && st[L[j]!] === 0);
      if (ends.length === 0) continue;
      out.push({ technique: 'pair', place: ends.map((j) => ({ cell: L[j]!, value: other(v) })), cells: [L[k]!, L[k + 1]!], line: lineRef(n, l), other: null });
    }
  }
  return out;
}

function refSandwich(st: St): RefStep[] {
  const n = sizeOf(st);
  const out: RefStep[] = [];
  for (let l = 0; l < 2 * n; l++) {
    const L = lineCells(n, l);
    for (let k = 0; k + 2 < n; k++) {
      const v = st[L[k]!]!;
      if (v === 0 || st[L[k + 2]!] !== v || st[L[k + 1]!] !== 0) continue;
      out.push({ technique: 'sandwich', place: [{ cell: L[k + 1]!, value: other(v) }], cells: [L[k]!, L[k + 2]!], line: lineRef(n, l), other: null });
    }
  }
  return out;
}

function refCount(st: St): RefStep[] {
  const n = sizeOf(st);
  const out: RefStep[] = [];
  for (let l = 0; l < 2 * n; l++) {
    const L = lineCells(n, l);
    const empties = L.filter((x) => st[x] === 0);
    if (empties.length === 0) continue;
    for (const s of [1, 2] as const) {
      const own = L.filter((x) => st[x] === s);
      if (own.length !== n / 2) continue;
      out.push({ technique: 'count', place: empties.map((cell) => ({ cell, value: other(s) })), cells: own, line: lineRef(n, l), other: null });
      break; // A d'abord : une seule application par ligne
    }
  }
  return out;
}

function refLine(st: St): RefStep[] {
  const n = sizeOf(st);
  const out: RefStep[] = [];
  for (let l = 0; l < 2 * n; l++) {
    const L = lineCells(n, l);
    const v = L.map((x) => st[x]!);
    if (!v.includes(0)) continue;
    const forced = commonForced(v, completions(n, v));
    if (forced.length === 0) continue;
    out.push({
      technique: 'line',
      place: forced.map(([k, value]) => ({ cell: L[k]!, value })),
      cells: L.filter((x) => st[x] !== 0),
      line: lineRef(n, l),
      other: null,
    });
  }
  return out;
}

function refUnique(st: St): RefStep[] {
  const n = sizeOf(st);
  const out: RefStep[] = [];
  for (let l = 0; l < 2 * n; l++) {
    const L = lineCells(n, l);
    const v = L.map((x) => st[x]!);
    if (!v.includes(0)) continue;
    const comps = completions(n, v);
    if (comps.length < 2) continue;
    const from = l < n ? 0 : n;
    for (let m = from; m < from + n; m++) {
      const M = lineCells(n, m);
      const w = M.map((x) => st[x]!);
      if (w.includes(0)) continue;
      const key = w.join('');
      if (!comps.some((c) => c.join('') === key)) continue;
      const forced = commonForced(
        v,
        comps.filter((c) => c.join('') !== key),
      );
      if (forced.length === 0) continue;
      out.push({ technique: 'unique', place: forced.map(([k, value]) => ({ cell: L[k]!, value })), cells: M, line: lineRef(n, l), other: lineRef(n, m) });
    }
  }
  return out;
}

/** Déductions de base d'une ligne (paire, sandwich, comptage) : positions forcées A et B (cases vides). */
function basicForcedRef(n: number, st: St, l: number): [Set<number>, Set<number>] {
  const v = lineCells(n, l).map((x) => st[x]!);
  const fa = new Set<number>();
  const fb = new Set<number>();
  const to = (s: number): Set<number> => (s === 1 ? fb : fa);
  for (let k = 0; k + 1 < n; k++) {
    if (v[k] === 0 || v[k] !== v[k + 1]) continue;
    for (const j of [k - 1, k + 2]) if (j >= 0 && j < n && v[j] === 0) to(v[k]!).add(j);
  }
  for (let k = 0; k + 2 < n; k++) if (v[k] !== 0 && v[k] === v[k + 2] && v[k + 1] === 0) to(v[k]!).add(k + 1);
  for (const s of [1, 2]) {
    if (v.filter((x) => x === s).length === n / 2) v.forEach((x, k) => x === 0 && to(s).add(k));
  }
  return [fa, fb];
}

/** Un tour : déductions de toutes les lignes `dirty` calculées puis posées (lignes croissantes, A puis B). */
function roundRef(n: number, st: number[], dirty: readonly number[]): number[] {
  const forced = dirty.map((l) => [l, basicForcedRef(n, st, l)] as const);
  const changed = new Set<number>();
  for (const [l, [fa, fb]] of forced) {
    const L = lineCells(n, l);
    for (const [set, sym] of [
      [fa, 1],
      [fb, 2],
    ] as const) {
      for (const k of sortNum(set)) {
        const x = L[k]!;
        if (st[x] !== 0) continue;
        st[x] = sym;
        changed.add(rowOf(n, x));
        changed.add(n + colOf(n, x));
      }
    }
  }
  return sortNum(changed);
}

/** Première faute parmi les lignes `dirty` : triplet ou excès, sinon ligne complète identique à une autre. */
function faultRef(n: number, st: St, dirty: readonly number[]): { line: number; cells: number[]; other: number | null } | null {
  for (const l of dirty) {
    const L = lineCells(n, l);
    const bad = new Set<number>();
    for (let k = 0; k + 2 < n; k++) {
      const s = st[L[k]!];
      if (s !== 0 && st[L[k + 1]!] === s && st[L[k + 2]!] === s) [L[k]!, L[k + 1]!, L[k + 2]!].forEach((x) => bad.add(x));
    }
    for (const s of [1, 2]) {
      const own = L.filter((x) => st[x] === s);
      if (own.length > n / 2) own.forEach((x) => bad.add(x));
    }
    if (bad.size > 0) return { line: l, cells: sortNum(bad), other: null };
    if (L.some((x) => st[x] === 0)) continue;
    const from = l < n ? 0 : n;
    for (let m = from; m < from + n; m++) {
      if (m === l) continue;
      const M = lineCells(n, m);
      if (M.every((x, k) => st[x] !== 0 && st[x] === st[L[k]!])) return { line: l, cells: sortNum([...L, ...M]), other: m };
    }
  }
  return null;
}

/**
 * Contradiction (spécification documentée) : hypothèses (cases vides croissantes, A puis B) propagées en
 * parallèle par tours de déductions de base ; la première réfutée au tour le plus précoce est retenue.
 * Lignes contrôlées : celles modifiées au tour précédent (au départ : lignes de la case, ou toutes si l'état
 * n'est pas fermé pour les déductions de base).
 */
function refContradiction(st: St): RefStep | null {
  const n = sizeOf(st);
  const all = Array.from({ length: 2 * n }, (_, l) => l);
  const open = all.some((l) => basicForcedRef(n, st, l).some((s) => s.size > 0));
  const hyps: { x: number; sym: 1 | 2; s: number[]; dirty: number[]; alive: boolean }[] = [];
  st.forEach((v, x) => {
    if (v !== 0) return;
    for (const sym of [1, 2] as const) {
      const s = [...st];
      s[x] = sym;
      hyps.push({ x, sym, s, dirty: open ? all : sortNum([rowOf(n, x), n + colOf(n, x)]), alive: true });
    }
  });
  for (;;) {
    for (const h of hyps) {
      if (!h.alive) continue;
      const f = faultRef(n, h.s, h.dirty);
      if (f) {
        return {
          technique: 'contradiction',
          place: [{ cell: h.x, value: other(h.sym) }],
          cells: f.cells,
          line: lineRef(n, f.line),
          other: f.other === null ? null : lineRef(n, f.other),
        };
      }
    }
    let progressed = false;
    for (const h of hyps) {
      if (!h.alive) continue;
      const changed = roundRef(n, h.s, h.dirty);
      if (changed.length === 0) h.alive = false;
      else {
        h.dirty = changed;
        progressed = true;
      }
    }
    if (!progressed) return null;
  }
}

const FIRST: Record<Exclude<BinairoTechnique, 'contradiction'>, (st: St) => RefStep[]> = {
  pair: refPair,
  sandwich: refSandwich,
  count: refCount,
  line: refLine,
  unique: refUnique,
};

/** Vérifie une étape du solveur contre la référence : aucune technique plus facile, bon choix, bon contenu. */
function checkStep(st: St, step: BinairoStep): void {
  const L = step.level;
  if (L > 1) expect(refPair(st)).toEqual([]);
  if (L > 2) expect(refSandwich(st)).toEqual([]);
  if (L > 3) expect(refCount(st)).toEqual([]);
  if (L > 4) expect(refLine(st)).toEqual([]);
  if (L > 5) expect(refUnique(st)).toEqual([]);
  const expected = step.technique === 'contradiction' ? refContradiction(st) : FIRST[step.technique](st)[0];
  expect(expected, `aucune application de référence pour ${step.technique}`).toBeDefined();
  expect(step).toEqual({ ...expected!, level: L });
  expect(step.place.length).toBeGreaterThan(0);
  for (const { cell } of step.place) expect(st[cell]).toBe(0);
}

/** Aucune technique de la référence (niveau ≤ maxLevel) ne s'applique. */
function expectStuck(st: St, maxLevel = 6): void {
  const apps = [refPair, refSandwich, refCount, refLine, refUnique].slice(0, Math.min(5, maxLevel)).flatMap((f) => f(st));
  expect(apps).toEqual([]);
  if (maxLevel >= 6) expect(refContradiction(st)).toBeNull();
}

/** Profil réduit à une seule technique : chaque étape = première application de la référence. */
function crossCheckSingle(p: BinairoPuzzle, technique: BinairoTechnique): number {
  const spec = BINAIRO_TECHNIQUES_V1.techniques.find((t) => t.id === technique)!;
  const profile: BinairoProfile = { id: `only-${technique}`, techniques: [spec], tierByLevel: BINAIRO_TECHNIQUES_V1.tierByLevel };
  const res = solveBinairoLogically(p, { profile });
  let st: BinairoCell[] = [...p.givens];
  for (const step of res.steps) {
    const expected = technique === 'contradiction' ? refContradiction(st) : FIRST[technique](st)[0];
    expect(step).toEqual({ ...expected!, level: spec.level });
    st = applyStep(st, step);
  }
  expect(res.marks).toEqual(st);
  if (res.status === 'stuck') {
    if (technique === 'contradiction') expect(refContradiction(st)).toBeNull();
    else expect(FIRST[technique](st)).toEqual([]);
  }
  return res.steps.length;
}

/** Solveur + référence pas à pas ; si le solveur est bloqué, la référence ne trouve rien non plus. */
function crossCheck(p: BinairoPuzzle, maxLevel = 6): void {
  const res = solveBinairoLogically(p, { maxLevel });
  let st: BinairoCell[] = [...p.givens];
  for (const step of res.steps) {
    checkStep(st, step);
    st = applyStep(st, step);
  }
  expect(res.marks).toEqual(st);
  if (res.status === 'stuck') expectStuck(st, maxLevel);
  if (res.status === 'solved') expect(st).not.toContain(0);
}

// ─── Positions construites, une par technique ────────────────────────────────────────────────

const E6 = ['......', '......', '......', '......', '......', '......'];
const with6 = (edits: Record<number, string>): string[] => E6.map((r, i) => edits[i] ?? r);

describe('techniques (positions construites)', () => {
  it('pair : extrémités vides d’une paire, rangées avant colonnes', () => {
    expect(nextBinairoStep(board(with6({ 0: '.AA...' })), blank(6))).toEqual({
      technique: 'pair',
      level: 1,
      place: [
        { cell: 0, value: 2 },
        { cell: 3, value: 2 },
      ],
      cells: [1, 2],
      line: row(0),
      other: null,
    });
    // Paire au bord : une seule extrémité.
    expect(nextBinairoStep(board(with6({ 2: '....BB' })), blank(6))).toMatchObject({ place: [{ cell: 15, value: 1 }], cells: [16, 17], line: row(2) });
    // Une extrémité déjà remplie.
    expect(nextBinairoStep(board(with6({ 1: '.BAA..' })), blank(6))).toMatchObject({ place: [{ cell: 10, value: 2 }], cells: [8, 9] });
    // Paire verticale seulement.
    const col = board(with6({ 3: '..B...', 4: '..B...' }));
    expect(nextBinairoStep(col, blank(6))).toEqual({
      technique: 'pair',
      level: 1,
      place: [
        { cell: 14, value: 1 },
        { cell: 32, value: 1 },
      ],
      cells: [20, 26],
      line: column(2),
      other: null,
    });
    // Paire fermée des deux côtés : rien à poser → pas de « pair ».
    expect(nextBinairoStep(board(with6({ 0: 'BAAB..' })), blank(6))?.technique).not.toBe('pair');
  });

  it('sandwich : X·X → milieu', () => {
    expect(nextBinairoStep(board(with6({ 1: 'A.A...' })), blank(6))).toEqual({
      technique: 'sandwich',
      level: 2,
      place: [{ cell: 7, value: 2 }],
      cells: [6, 8],
      line: row(1),
      other: null,
    });
    expect(nextBinairoStep(board(with6({ 1: '...B..', 3: '...B..' })), blank(6))).toMatchObject({
      technique: 'sandwich',
      place: [{ cell: 15, value: 1 }],
      cells: [9, 21],
      line: column(3),
    });
    expect(nextBinairoStep(board(with6({ 1: 'A.A...' })), blank(6), restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, 1))).toBeNull();
  });

  it('count : n/2 symboles X → cases vides de la ligne', () => {
    // A B A . . A : ni paire ni sandwich exploitable ; 3 A → les vides reçoivent B.
    expect(nextBinairoStep(board(with6({ 0: 'ABA..A' })), blank(6))).toEqual({
      technique: 'count',
      level: 3,
      place: [
        { cell: 3, value: 2 },
        { cell: 4, value: 2 },
      ],
      cells: [0, 2, 5],
      line: row(0),
      other: null,
    });
    expect(nextBinairoStep(board(['B.....', 'A.....', 'B.....', '......', '......', 'B.....']), blank(6))).toMatchObject({
      technique: 'count',
      place: [
        { cell: 18, value: 1 },
        { cell: 24, value: 1 },
      ],
      cells: [0, 12, 30],
      line: column(0),
    });
  });

  it('line : cases communes à toutes les complétions valides', () => {
    // A . . . . A : complétions ABABBA et ABBABA → positions 1 et 4 = B.
    expect(nextBinairoStep(board(with6({ 0: 'A....A' })), blank(6))).toEqual({
      technique: 'line',
      level: 4,
      place: [
        { cell: 1, value: 2 },
        { cell: 4, value: 2 },
      ],
      cells: [0, 5],
      line: row(0),
      other: null,
    });
    expect(nextBinairoStep(board(with6({ 0: 'A....A' })), blank(6), restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, 3))).toBeNull();
  });

  it('unique : la complétion égale à une ligne complète est exclue', () => {
    // Rangée 3 (. . A B B A) : complétions ABABBA (= rangée 0) et BAABBA → B A forcés.
    const p = board(with6({ 0: 'ABABBA', 3: '..ABBA' }));
    expect(nextBinairoStep(p, blank(6))).toEqual({
      technique: 'unique',
      level: 5,
      place: [
        { cell: 18, value: 2 },
        { cell: 19, value: 1 },
      ],
      cells: [0, 1, 2, 3, 4, 5],
      line: row(3),
      other: row(0),
    });
    expect(nextBinairoStep(p, blank(6), restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, 4))).toBeNull();
    // Même position transposée : colonnes.
    const t = { size: 6, givens: p.givens.map((_, i) => p.givens[(i % 6) * 6 + Math.floor(i / 6)]!) };
    expect(nextBinairoStep(t, blank(6))).toMatchObject({
      technique: 'unique',
      place: [
        { cell: 3, value: 2 },
        { cell: 9, value: 1 },
      ],
      cells: [0, 6, 12, 18, 24, 30],
      line: column(3),
      other: column(0),
    });
  });

  it('contradiction : symbole en excès (position 6×6 à solution unique)', () => {
    // Si (2,3) = A : paires AA en colonne 3 et en rangée 2 ⇒ (2,1) = (2,4) = B ⇒ sandwichs B·B en
    // colonnes 1 et 4 ⇒ (1,1) = (1,4) = A ⇒ quatre A en rangée 1. Donc (2,3) = B.
    const rows = ['.B..B.', 'A..A..', '..A...', 'B..B..', '......', '..A...'];
    const p = board(rows);
    expect(solveBinairoExact(p, 2).count).toBe(1);
    const step = nextBinairoStep(p, blank(6));
    expect(step).toEqual({
      technique: 'contradiction',
      level: 6,
      place: [{ cell: 15, value: 2 }],
      cells: [6, 7, 9, 10],
      line: row(1),
      other: null,
    });
    checkStep(cells(rows), step!);
    expect(solveBinairoExact(p, 2).solutions[0]![15]).toBe(2);
    expect(nextBinairoStep(p, blank(6), restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, 5))).toBeNull();
  });

  it('contradiction : deux rangées complètes identiques (position 6×6 à solution unique)', () => {
    const rows = ['....A.', 'BAAB..', '..B..A', '......', 'BA.B..', '.....B'];
    const p = board(rows);
    expect(solveBinairoExact(p, 2).count).toBe(1);
    const step = nextBinairoStep(p, blank(6));
    expect(step).toEqual({
      technique: 'contradiction',
      level: 6,
      place: [{ cell: 23, value: 2 }],
      cells: [6, 7, 8, 9, 10, 11, 24, 25, 26, 27, 28, 29],
      line: row(1),
      other: row(4),
    });
    checkStep(cells(rows), step!);
    expect(solveBinairoExact(p, 2).solutions[0]![23]).toBe(2);
  });

  it('contradiction : vérifiée sur la première grille réelle qui en a besoin', () => {
    const p = uniquePuzzles(8, 30).find((q) => rateBinairo(q).maxLevel === 6);
    expect(p).toBeDefined();
    const res = solveBinairoLogically(p!);
    const i = res.steps.findIndex((s) => s.technique === 'contradiction');
    let st: BinairoCell[] = [...p!.givens];
    for (const step of res.steps.slice(0, i)) st = applyStep(st, step);
    const step = res.steps[i]!;
    checkStep(st, step);
    expect(step.place).toHaveLength(1);
    expect(step.place[0]!.value).toBe(p!.solution[step.place[0]!.cell]);
    expect(nextBinairoStep(p!, st)).toEqual(step);
    expect(nextBinairoStep(p!, st, restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, 5))).toBeNull();
  });

  it('les positions construites passent la vérification croisée complète', () => {
    for (const rows of [with6({ 0: '.AA...' }), with6({ 1: 'A.A...' }), with6({ 0: 'ABA..A' }), with6({ 0: 'A....A' }), with6({ 0: 'ABABBA', 3: '..ABBA' })]) {
      crossCheck(board(rows));
    }
  });
});

// ─── Profil, API ─────────────────────────────────────────────────────────────────────────────

describe('profil V1', () => {
  it('est figé : ordre, niveaux, poids, paliers', () => {
    expect(BINAIRO_TECHNIQUES_V1).toEqual({
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
    expect(Object.isFrozen(BINAIRO_TECHNIQUES_V1)).toBe(true);
    expect(Object.isFrozen(BINAIRO_TECHNIQUES_V1.techniques)).toBe(true);
    expect(Object.isFrozen(BINAIRO_TECHNIQUES_V1.techniques[0])).toBe(true);
    expect(Object.isFrozen(BINAIRO_TECHNIQUES_V1.tierByLevel)).toBe(true);
  });

  it('restrictBinairoProfile ne garde que les niveaux demandés', () => {
    const p3 = restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, 3);
    expect(p3.techniques.map((t) => t.id)).toEqual(['pair', 'sandwich', 'count']);
    expect(p3.tierByLevel).toEqual(BINAIRO_TECHNIQUES_V1.tierByLevel);
    expect(restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, 0).techniques).toEqual([]);
  });

  it('rejette un profil incohérent', () => {
    const p = uniquePuzzles(6, 1)[0]!;
    const unsorted: BinairoProfile = {
      id: 'x',
      techniques: [
        { id: 'count', level: 3, weight: 1 },
        { id: 'pair', level: 1, weight: 1 },
      ],
      tierByLevel: [1],
    };
    expect(() => rateBinairo(p, unsorted)).toThrow(RangeError);
    const unknown: BinairoProfile = { id: 'y', techniques: [{ id: 'magic' as BinairoTechnique, level: 1, weight: 1 }], tierByLevel: [1] };
    expect(() => rateBinairo(p, unknown)).toThrow(RangeError);
  });
});

describe('API', () => {
  it('rejette des entrées invalides', () => {
    expect(() => rateBinairo({ size: 0, givens: [] })).toThrow(RangeError);
    expect(() => rateBinairo({ size: 5, givens: blank(5) })).toThrow(RangeError);
    expect(() => rateBinairo({ size: 16, givens: blank(16) })).toThrow(RangeError);
    expect(() => rateBinairo({ size: 6, givens: blank(5) })).toThrow(RangeError);
    const bad = blank(6) as number[];
    bad[3] = 3;
    expect(() => rateBinairo({ size: 6, givens: bad as BinairoCell[] })).toThrow(RangeError);
    expect(() => solveBinairoLogically(board(E6), { initialMarks: blank(4) })).toThrow(RangeError);
    expect(() => nextBinairoStep(board(E6), blank(5))).toThrow(RangeError);
  });

  it('marques initiales : solution complète, faute, état intermédiaire', () => {
    const p = uniquePuzzles(8, 4, 0.4).find((q) => rateBinairo(q).solvable)!;
    const done = solveBinairoLogically(p, { initialMarks: p.solution as BinairoCell[] });
    expect(done).toMatchObject({ status: 'solved', solved: true, steps: [], maxLevel: 0, score: 0, hardest: 'none' });
    expect(nextBinairoStep(p, p.solution as BinairoCell[])).toBeNull();

    // Triplet dans les marques : état impossible, aucune étape.
    const clash = blank(8);
    const empties = p.givens.flatMap((v, i) => (v === 0 ? [i] : []));
    const r = Math.floor(empties[0]! / 8);
    for (let c = 0; c < 8; c++) if (p.givens[r * 8 + c] === 0) clash[r * 8 + c] = 1;
    const k = solveBinairoLogically(p, { initialMarks: clash });
    expect(k).toMatchObject({ status: 'contradiction', solved: false, steps: [] });
    expect(nextBinairoStep(p, clash)).toBeNull();

    // Partir d'un état intermédiaire du solveur donne la suite exacte de ses étapes.
    const full = solveBinairoLogically(p);
    let marks: BinairoCell[] = blank(8);
    const cut = Math.floor(full.steps.length / 2);
    for (const step of full.steps.slice(0, cut)) marks = applyStep(marks, step);
    expect(solveBinairoLogically(p, { initialMarks: marks }).steps).toEqual(full.steps.slice(cut));
    expect(nextBinairoStep(p, marks)).toEqual(full.steps[cut]);
  });

  it('marques posées sur des cases données : ignorées', () => {
    const p = uniquePuzzles(6, 3, 0.4)[0]!;
    const contrary = p.givens.map((v) => (v === 0 ? 0 : 3 - v)) as BinairoCell[];
    expect(solveBinairoLogically(p, { initialMarks: contrary })).toEqual(solveBinairoLogically(p));
    expect(nextBinairoStep(p, contrary)).toEqual(nextBinairoStep(p, blank(6)));
  });

  it('état final : la solution, statut solved', () => {
    const p = uniquePuzzles(8, 6, 0.4).find((q) => rateBinairo(q).solvable)!;
    const res = solveBinairoLogically(p);
    expect(res.status).toBe('solved');
    expect(res.marks).toEqual(p.solution);
  });

  it('statut contradiction : ligne sans complétion, sans déduction de base disponible', () => {
    // A A . . . . A A (n = 8) : 4 A → comptage impose B B B B (triplet).
    const p = board(['AA....AA', '........', '........', '........', '........', '........', '........', '........']);
    const res = solveBinairoLogically(p);
    expect(res.status).toBe('contradiction');
    expect(res.solved).toBe(false);
    // Profil sans technique : aucune étape, la ligne n'a aucune complétion → contradiction (pas « stuck »).
    expect(solveBinairoLogically(p, { maxLevel: 0 })).toMatchObject({ status: 'contradiction', steps: [] });
    // Grille vide, profil sans technique : bloqué.
    expect(solveBinairoLogically(board(E6), { maxLevel: 0 })).toMatchObject({ status: 'stuck', steps: [] });
  });
});

// ─── Grilles aléatoires ──────────────────────────────────────────────────────────────────────

const SIZES = [4, 6, 8, 10] as const;
const PER_SIZE = 30;
const FAMILIES: [string, number][] = [
  ['minimales', 0],
  ['denses', 0.45],
];

describe('grilles aléatoires à solution unique', () => {
  it(`solidité : ${PER_SIZE} grilles par taille et famille`, () => {
    let steps = 0;
    const statuses: Record<string, number> = {};
    for (const n of SIZES) {
      for (const [, keep] of FAMILIES) {
        for (const p of uniquePuzzles(n, PER_SIZE, keep)) {
          const res = solveBinairoLogically(p);
          let st: BinairoCell[] = [...p.givens];
          for (const step of res.steps) {
            expect(step.place.length).toBeGreaterThan(0);
            for (const { cell, value } of step.place) {
              expect(st[cell]).toBe(0); // jamais une case déjà connue
              expect(value).toBe(p.solution[cell]); // jamais contraire à la solution unique
            }
            expect(step.level).toBe(BINAIRO_TECHNIQUES_V1.techniques.find((t) => t.id === step.technique)!.level);
            expect([...step.cells].sort((a, b) => a - b)).toEqual(step.cells);
            expect([...step.place].sort((a, b) => a.cell - b.cell)).toEqual(step.place);
            st = applyStep(st, step);
          }
          steps += res.steps.length;
          statuses[res.status] = (statuses[res.status] ?? 0) + 1;
          // Une grille à solution unique n'est jamais déclarée contradictoire.
          expect(res.status).not.toBe('contradiction');
          expect(res.marks).toEqual(st);
          if (res.status === 'solved') expect(res.marks).toEqual(p.solution);
          else expect(res.marks).toContain(0);
          // Compteurs cohérents.
          const counts = new Array<number>(7).fill(0);
          for (const step of res.steps) counts[step.level]!++;
          expect(res.levelCounts).toEqual(counts);
          expect(res.maxLevel).toBe(Math.max(0, ...res.steps.map((s) => s.level)));
          const weight = (t: BinairoTechnique) => BINAIRO_TECHNIQUES_V1.techniques.find((s) => s.id === t)!.weight;
          expect(res.score).toBe(res.steps.reduce((acc, s) => acc + weight(s.technique), 0));
          expect(res.steps.reduce((acc, s) => acc + s.place.length, 0)).toBe(st.filter((v) => v !== 0).length - p.givens.filter((v) => v !== 0).length);
        }
      }
    }
    expect(steps).toBeGreaterThan(1000);
    expect(statuses.solved).toBeGreaterThan(100);
  });

  it('rateBinairo = solveBinairoLogically, paliers selon le niveau max', () => {
    const tiers = [1, 1, 1, 1, 2, 3, 4];
    const seen = new Set<string>();
    for (const n of SIZES) {
      for (const [, keep] of FAMILIES) {
        for (const p of uniquePuzzles(n, PER_SIZE, keep)) {
          const res = solveBinairoLogically(p);
          const rating = rateBinairo(p);
          seen.add(res.solved ? String(res.maxLevel) : 'unsolvable');
          const hardest = [...BINAIRO_TECHNIQUES_V1.techniques].reverse().find((t) => res.steps.some((s) => s.technique === t.id))?.id ?? 'none';
          expect(rating).toEqual({
            tier: res.solved ? tiers[res.maxLevel] : 4,
            score: res.score,
            hardest: res.solved ? hardest : 'unsolvable',
            solvable: res.solved,
            steps: res.steps.length,
            maxLevel: res.maxLevel,
            levelCounts: res.levelCounts,
          });
        }
      }
    }
    // Tous les niveaux sont exercés (1 et 2 seuls sont rares : une grille unique demande presque toujours plus).
    for (const k of ['3', '4', '5', '6', 'unsolvable']) expect(seen, k).toContain(k);
  });

  it('déterminisme : deux exécutions identiques', () => {
    for (const n of SIZES) {
      for (const p of uniquePuzzles(n, PER_SIZE).slice(0, 8)) {
        expect(solveBinairoLogically(p)).toEqual(solveBinairoLogically(p));
        expect(rateBinairo(p)).toEqual(rateBinairo(p));
      }
    }
  });

  it('restriction du profil : niveau max − 1 ne suffit pas, niveau max donne le même résultat', () => {
    for (const n of SIZES) {
      for (const [, keep] of FAMILIES) {
        for (const p of uniquePuzzles(n, PER_SIZE, keep).slice(0, 15)) {
          const full = rateBinairo(p);
          if (!full.solvable) continue;
          if (full.maxLevel > 1) {
            const below = rateBinairo(p, restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, full.maxLevel - 1));
            expect(below).toMatchObject({ solvable: false, tier: 4, hardest: 'unsolvable' });
            const stuck = solveBinairoLogically(p, { maxLevel: full.maxLevel - 1 });
            expect(stuck.status).toBe('stuck');
            expect(stuck.marks).toContain(0);
            expect(stuck.steps.every((s) => s.level < full.maxLevel)).toBe(true);
          }
          expect(rateBinairo(p, restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, full.maxLevel))).toEqual(full);
        }
      }
    }
  });

  it('vérification croisée avec la référence naïve (chaque étape, ordre de parcours, blocage)', () => {
    for (const n of SIZES) {
      for (const [, keep] of FAMILIES) {
        for (const p of uniquePuzzles(n, PER_SIZE, keep).slice(0, n <= 6 ? 12 : n === 8 ? 6 : 3)) crossCheck(p);
      }
    }
    // Points de blocage (profils réduits) : la référence ne trouve rien non plus.
    for (const p of uniquePuzzles(8, PER_SIZE).slice(0, 10)) {
      const r = rateBinairo(p);
      if (r.maxLevel < 2) continue;
      const stuck = solveBinairoLogically(p, { maxLevel: r.maxLevel - 1 });
      expectStuck(stuck.marks, r.maxLevel - 1);
    }
  });

  it('les grilles nécessitant une contradiction sont vérifiées pas à pas', () => {
    let checked = 0;
    for (const n of [6, 8, 10]) {
      for (const p of uniquePuzzles(n, PER_SIZE)) {
        if (checked < 6 && rateBinairo(p).maxLevel === 6) {
          crossCheck(p);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('profils à technique unique : chaque étape = première application de la référence (états non fermés)', () => {
    const totals: Record<string, number> = {};
    for (const technique of ['pair', 'sandwich', 'count', 'line', 'unique', 'contradiction'] as const) {
      for (const n of [4, 6, 8]) {
        // Grilles uniques peu remplies + grilles denses (lignes complètes : utile à « unique »).
        const rng = rngFromString(`single-${technique}-${n}`);
        const dense = Array.from({ length: 6 }, () => randomBinairoPuzzle(rng, n, 5, 8));
        // États réels précédant une étape de cette technique (résolution complète V1).
        const before: BinairoPuzzle[] = [];
        for (const q of uniquePuzzles(n, PER_SIZE)) {
          let st: BinairoCell[] = [...q.givens];
          for (const step of solveBinairoLogically(q).steps) {
            if (step.technique === technique && before.length < 4) before.push({ size: n, givens: st });
            st = applyStep(st, step);
          }
        }
        for (const p of [...uniquePuzzles(n, PER_SIZE, 0.45).slice(0, technique === 'contradiction' ? 4 : 8), ...dense, ...before]) {
          totals[technique] = (totals[technique] ?? 0) + crossCheckSingle(p, technique);
        }
      }
    }
    for (const t of ['pair', 'sandwich', 'count', 'line', 'unique', 'contradiction']) expect(totals[t], t).toBeGreaterThan(5);
  });

  it('nextBinairoStep ≡ étape suivante de solveBinairoLogically depuis tout état intermédiaire', () => {
    for (const p of [...uniquePuzzles(6, PER_SIZE).slice(0, 5), ...uniquePuzzles(8, PER_SIZE).slice(0, 5)]) {
      const res = solveBinairoLogically(p);
      let st: BinairoCell[] = blank(p.size);
      res.steps.forEach((step) => {
        expect(nextBinairoStep(p, st)).toEqual(step);
        st = applyStep(st, step);
      });
      if (res.status === 'stuck') expect(nextBinairoStep(p, st)).toBeNull();
    }
  });
});

describe('propriétés métamorphiques', () => {
  const transpose = (n: number, g: readonly number[]): BinairoCell[] => g.map((_, i) => g[(i % n) * n + Math.floor(i / n)]!) as BinairoCell[];
  const mirror = (n: number, g: readonly number[]): BinairoCell[] => g.map((_, i) => g[Math.floor(i / n) * n + (n - 1 - (i % n))]!) as BinairoCell[];
  const flip = (n: number, g: readonly number[]): BinairoCell[] => g.map((_, i) => g[(n - 1 - Math.floor(i / n)) * n + (i % n)]!) as BinairoCell[];
  const swap = (_n: number, g: readonly number[]): BinairoCell[] => g.map((v) => (v === 0 ? 0 : 3 - v)) as BinairoCell[];
  const rot = (n: number, g: readonly number[]): BinairoCell[] => mirror(n, transpose(n, g));
  const TRANSFORMS: [string, (n: number, g: readonly number[]) => BinairoCell[]][] = [
    ['transposition', transpose],
    ['miroir', mirror],
    ['retournement', flip],
    ['rotation', rot],
    ['demi-tour', (n, g) => rot(n, rot(n, g))],
    ['échange des symboles', swap],
    ['rotation + échange', (n, g) => swap(n, rot(n, g))],
  ];

  it('grille vide : aucune déduction (rien ne se déduit de rien)', () => {
    for (const n of [4, 6, 8, 10, 12, 14]) {
      expect(solveBinairoLogically({ size: n, givens: blank(n) })).toMatchObject({ status: 'stuck', steps: [], maxLevel: 0 });
      expect(nextBinairoStep({ size: n, givens: blank(n) }, blank(n))).toBeNull();
    }
  });

  it('symétries du carré et échange des symboles : résolubilité et niveau max invariants', () => {
    for (const n of SIZES) {
      for (const [, keep] of FAMILIES) {
        for (const p of uniquePuzzles(n, PER_SIZE, keep).slice(0, 12)) {
          const ref = rateBinairo(p);
          for (const [label, t] of TRANSFORMS) {
            const q = { size: n, givens: t(n, p.givens) };
            const r = rateBinairo(q);
            expect({ solvable: r.solvable, maxLevel: r.maxLevel, tier: r.tier }, `${label} ${p.givens.join('')}`).toEqual({
              solvable: ref.solvable,
              maxLevel: ref.maxLevel,
              tier: ref.tier,
            });
            // La solution logique est l'image de la solution.
            if (ref.solvable) expect(solveBinairoLogically(q).marks).toEqual(t(n, p.solution));
          }
        }
      }
    }
  });

  it('monotonie : ajouter des données justes ne rend jamais la grille plus difficile', () => {
    const rng = rngFromString('solver-monotone');
    let checked = 0;
    for (const n of SIZES) {
      for (const p of uniquePuzzles(n, PER_SIZE)) {
        const ref = rateBinairo(p);
        for (let k = 0; k < 3; k++) {
          const givens = p.givens.map((v, i) => (v === 0 && rng.chance(1, 6) ? p.solution[i]! : v)) as BinairoCell[];
          const r = rateBinairo({ size: n, givens });
          if (ref.solvable) {
            expect(r.solvable).toBe(true);
            expect(r.maxLevel).toBeLessThanOrEqual(ref.maxLevel);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe('fermeture rapide (générateur) ≡ boucle pas à pas', () => {
  it('createBinairoChecker(n).solves(données, k) ≡ rateBinairo(profil ≤ k).solvable, pour k = 0..6', () => {
    let positives = 0;
    for (const n of SIZES) {
      const checker = createBinairoChecker(n);
      for (const [, keep] of FAMILIES) {
        for (const p of uniquePuzzles(n, PER_SIZE, keep)) {
          const full = rateBinairo(p);
          for (let k = 0; k <= 6; k++) {
            const expected = rateBinairo(p, restrictBinairoProfile(BINAIRO_TECHNIQUES_V1, k)).solvable;
            expect(checker.solves(p.givens, k), `${n} ${p.givens.join('')} k=${k}`).toBe(expected);
            if (expected) positives++;
          }
          // Niveau max = plus petit k suffisant.
          if (full.solvable) {
            expect(checker.solves(p.givens, full.maxLevel - 1)).toBe(false);
            expect(checker.solves(p.givens, full.maxLevel)).toBe(true);
          }
        }
      }
    }
    expect(positives).toBeGreaterThan(200);
  });

  it('cible : résoluble privée d’une donnée ⇔ cette case se déduit', () => {
    const rng = rngFromString('checker-target');
    let checks = 0;
    for (const n of [6, 8, 10]) {
      const checker = createBinairoChecker(n);
      for (const p of uniquePuzzles(n, PER_SIZE, 0.45)) {
        const r = rateBinairo(p);
        if (!r.solvable) continue;
        for (let t = 0; t < 4; t++) {
          const givenCells = p.givens.flatMap((v, i) => (v !== 0 ? [i] : []));
          const x = rng.pick(givenCells);
          const reduced = [...p.givens];
          reduced[x] = 0;
          for (const k of [r.maxLevel, 6]) {
            expect(checker.solves(reduced, k, x)).toBe(checker.solves(reduced, k));
            checks++;
          }
        }
      }
    }
    expect(checks).toBeGreaterThan(100);
  });

  it('entrées invalides → RangeError', () => {
    const checker = createBinairoChecker(6);
    expect(() => checker.solves(blank(5), 6)).toThrow(RangeError);
    const bad = blank(6) as number[];
    bad[2] = 7;
    expect(() => checker.solves(bad, 6)).toThrow(RangeError);
    expect(() => createBinairoChecker(7)).toThrow(RangeError);
  });
});

describe('grilles à solutions multiples ou contradictoires', () => {
  it('ne conclut jamais à tort : chaque case posée a la même valeur dans toutes les solutions', () => {
    let multi = 0;
    let zero = 0;
    for (const n of [4, 6, 8]) {
      for (let i = 0; i < 40; i++) {
        const rng = rngFromString(`solver-multi-${n}-${i}`);
        const base = randomBinairoPuzzle(rng, n, 1 + rng.int(3), 8);
        // Un peu de bruit : quelques données contraires (grilles parfois sans solution).
        const givens = base.givens.map((v) => (v !== 0 && rng.chance(1, 25) ? 3 - v : v) as BinairoCell);
        const p = { size: n, givens };
        const exact = solveBinairoExact(p, 100_000, 5_000_000);
        expect(exact.complete).toBe(true);
        const res = solveBinairoLogically(p);
        if (exact.count === 0) {
          zero++;
          expect(res.solved).toBe(false);
          continue;
        }
        const agreed = (cell: number, value: number): boolean => exact.solutions.every((s) => s[cell] === value);
        for (const step of res.steps) for (const { cell, value } of step.place) expect(agreed(cell, value), `${n} #${i} case ${cell}`).toBe(true);
        expect(res.status).not.toBe('contradiction');
        if (exact.count > 1) {
          multi++;
          expect(res.solved).toBe(false);
          expect(rateBinairo(p).solvable).toBe(false);
          expect(createBinairoChecker(n).solves(givens, 6)).toBe(false);
        } else {
          expect(res.solved).toBe(rateBinairo(p).solvable);
        }
      }
    }
    expect(multi).toBeGreaterThan(20);
    expect(zero).toBeGreaterThan(0);
  });
});

describe('performance (bornes larges)', () => {
  it('rateBinairo sur 10×10 et 14×14 : quelques millisecondes en moyenne', () => {
    const puzzles = [...uniquePuzzles(10, PER_SIZE), ...uniquePuzzles(10, PER_SIZE, 0.45)];
    for (const p of puzzles.slice(0, 5)) rateBinairo(p); // échauffement
    let total = 0;
    let worst = 0;
    for (const p of puzzles) {
      const t0 = performance.now();
      rateBinairo(p);
      const dt = performance.now() - t0;
      total += dt;
      worst = Math.max(worst, dt);
    }
    expect(total / puzzles.length).toBeLessThan(20);
    expect(worst).toBeLessThan(200);
    const big = randomUniqueBinairo(rngFromString('solver-perf-14'), 14, 0.35);
    const t0 = performance.now();
    rateBinairo(big);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
