/**
 * Indice Binairo → texte localisable (clés i18n + paramètres) et surbrillances pour la grille.
 * Pur : la traduction est injectée par l'appelant (`Translate`), ce module ne connaît aucune langue.
 *
 * Les noms des symboles viennent des traductions (`puzzle.binairo.symbol.*`) : le pluriel nu (« soleils »)
 * et l'article indéfini (« un soleil », « une lune ») sont fournis au texte, qui reste ainsi sans accord
 * de genre à gérer.
 */
import type { BinairoHint, BinairoLineRef, BinairoPlacement, BinairoStep } from '../../../engine/binairo/hint';
import { CELL_A, CELL_B, type BinairoPuzzle, type BinairoSymbol } from '../../../engine/binairo/types';
import type { IconName } from '../../ui';
import type { Mark } from '../core/rules';

/** Surbrillance d'un indice, passée telle quelle au plateau (`BoardProps.highlight`). */
export interface BinairoHighlight {
  /** Cases de la ligne ou colonne qui porte le raisonnement. */
  readonly line: readonly number[];
  /** Cases de la seconde ligne ou colonne du raisonnement (comparée, ou devenue identique). */
  readonly other: readonly number[];
  /** Cases pivots : celles dont les symboles imposent la déduction. */
  readonly pivots: readonly number[];
  /** Cases à remplir, avec le symbole à poser (affiché en filigrane). */
  readonly places: readonly BinairoPlacement[];
  /** Cases fausses (erreurs du joueur). */
  readonly mistakes: readonly number[];
}

export interface HintExplanation {
  readonly titleKey: string;
  readonly textKey: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly highlight: BinairoHighlight;
}

/** Traduction injectée : `t(clé, paramètres)`. */
export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

/** Aucune surbrillance. */
export const NO_HIGHLIGHT: BinairoHighlight = { line: [], other: [], pivots: [], places: [], mistakes: [] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isCells = (v: unknown): v is readonly number[] => Array.isArray(v) && v.every((c) => Number.isInteger(c));

/** La donnée reçue par le plateau est bien une surbrillance Binairo (sinon ignorée). */
export function isBinairoHighlight(v: unknown): v is BinairoHighlight {
  if (!isRecord(v) || !isCells(v['line']) || !isCells(v['other']) || !isCells(v['pivots']) || !isCells(v['mistakes'])) return false;
  const places = v['places'];
  return Array.isArray(places) && places.every((p) => isRecord(p) && Number.isInteger(p['cell']) && (p['value'] === CELL_A || p['value'] === CELL_B));
}

/** Cases d'une ligne (rangée) ou colonne, dans l'ordre. */
export function lineCells(n: number, ref: BinairoLineRef | null): number[] {
  if (!ref) return [];
  return Array.from({ length: n }, (_, k) => (ref.kind === 'row' ? ref.index * n + k : k * n + ref.index));
}

const opposite = (v: BinairoSymbol): BinairoSymbol => (v === CELL_A ? CELL_B : CELL_A);

/** Noms d'un symbole : pluriel nu et article indéfini (« soleils », « un soleil »). */
function names(tr: Translate, v: BinairoSymbol): { readonly plural: string; readonly one: string } {
  return v === CELL_A
    ? { plural: tr('puzzle.binairo.symbol.sun', { count: 2 }), one: tr('puzzle.binairo.symbol.aSun') }
    : { plural: tr('puzzle.binairo.symbol.moon', { count: 2 }), one: tr('puzzle.binairo.symbol.aMoon') };
}

/** Libellé d'une ligne : « la ligne 3 », « la colonne 5 ». */
function lineLabel(tr: Translate, ref: BinairoLineRef | null): string {
  return ref ? tr(`hint.unit.${ref.kind}`, { n: ref.index + 1 }) : '';
}

/**
 * Explique un indice. Les cases à remplir portent un symbole : celui des pivots en est l'opposé pour les
 * paires, sandwichs et quotas ; l'hypothèse d'un raisonnement par l'absurde aussi.
 */
export function explainHint(hint: BinairoHint, p: BinairoPuzzle, tr: Translate): HintExplanation {
  switch (hint.kind) {
    case 'solved':
      return { titleKey: 'hint.technique.solved', textKey: 'hint.binairo.solved', params: {}, highlight: NO_HIGHLIGHT };
    case 'mistake':
      return {
        titleKey: 'hint.technique.mistake',
        textKey: 'hint.binairo.mistake',
        params: { count: hint.cells.length },
        highlight: { ...NO_HIGHLIGHT, mistakes: hint.cells },
      };
    case 'reveal':
      return {
        titleKey: 'hint.technique.reveal',
        textKey: 'hint.binairo.reveal',
        params: { placedOne: names(tr, hint.reveal.value).one },
        highlight: { ...NO_HIGHLIGHT, places: [hint.reveal] },
      };
    case 'step':
      return explainStep(hint.step, p, tr);
  }
}

function explainStep(step: BinairoStep, p: BinairoPuzzle, tr: Translate): HintExplanation {
  const n = p.size;
  const count = step.place.length;
  const line = lineLabel(tr, step.line);
  const kind = step.line?.kind ?? 'row';
  // Symbole posé par la déduction (le premier si elle en pose deux sortes, ce que fait seule l'analyse de ligne).
  const placed = step.place[0]?.value ?? CELL_A;
  const known = opposite(placed);
  const placedNames = names(tr, placed);
  const knownNames = names(tr, known);
  const base: HintExplanation['highlight'] = {
    line: lineCells(n, step.line),
    other: lineCells(n, step.other),
    pivots: [],
    places: step.place,
    mistakes: [],
  };
  const titleKey = `hint.binairo.title.${step.technique}`;
  const symbols = { known: knownNames.plural, knownOne: knownNames.one, placed: placedNames.plural, placedOne: placedNames.one };

  switch (step.technique) {
    case 'pair':
      return {
        titleKey,
        textKey: `hint.binairo.pair.${kind}`,
        params: { ...symbols, line, count },
        highlight: { ...base, pivots: step.cells },
      };
    case 'sandwich':
      return { titleKey, textKey: 'hint.binairo.sandwich', params: { ...symbols, line }, highlight: { ...base, pivots: step.cells } };
    case 'count':
      return {
        titleKey,
        textKey: 'hint.binairo.count',
        params: { ...symbols, line, count, half: n / 2 },
        highlight: { ...base, pivots: step.cells },
      };
    case 'line':
      return { titleKey, textKey: 'hint.binairo.line', params: { line, count }, highlight: base };
    case 'unique':
      return {
        titleKey,
        textKey: 'hint.binairo.unique',
        params: { line, otherLine: lineLabel(tr, step.other), count },
        highlight: base,
      };
    case 'contradiction':
      // L'hypothèse est l'opposé du symbole posé ; deux lignes identiques ou une règle enfreinte sur une ligne.
      return {
        titleKey: 'hint.technique.contradiction',
        textKey: step.other ? 'hint.binairo.contradiction.twins' : 'hint.binairo.contradiction.rule',
        params: { ...symbols, line, otherLine: lineLabel(tr, step.other) },
        highlight: base,
      };
  }
}

/** Identité d'une déduction : un même indice redemandé n'est compté qu'une fois. */
export function hintKey(h: BinairoHint): string {
  switch (h.kind) {
    case 'step':
      return `step:${h.step.technique}:${h.step.place.map((x) => `${x.cell}=${x.value}`).join(',')}`;
    case 'reveal':
      return `reveal:${h.reveal.cell}=${h.reveal.value}`;
    case 'mistake':
      return `mistake:${h.cells.join(',')}`;
    case 'solved':
      return 'solved';
  }
}

/** Coups joués par « Jouer ce coup » / « Corriger » : toute la déduction, ou les cases fausses vidées. */
export function hintMoves(h: BinairoHint): { readonly cell: number; readonly mark: Mark }[] {
  switch (h.kind) {
    case 'step':
      return h.step.place.map((x) => ({ cell: x.cell, mark: x.value }));
    case 'reveal':
      return [{ cell: h.reveal.cell, mark: h.reveal.value }];
    case 'mistake':
      return h.cells.map((cell) => ({ cell, mark: 0 }));
    case 'solved':
      return [];
  }
}

/** Cases à garder visibles au-dessus de la feuille d'indice. */
export function highlightFocus(hl: BinairoHighlight): number[] {
  return [...new Set([...hl.line, ...hl.other, ...hl.pivots, ...hl.places.map((x) => x.cell), ...hl.mistakes])].sort((a, b) => a - b);
}

/** Icône du bouton « Jouer ce coup » : le symbole posé (une coche s'il y en a deux sortes), une gomme pour une erreur. */
export function hintApplyIcon(h: BinairoHint): IconName {
  if (h.kind === 'mistake') return 'backspace';
  const placed = h.kind === 'step' ? h.step.place : h.kind === 'reveal' ? [h.reveal] : [];
  const first = placed[0];
  if (!first || placed.some((x) => x.value !== first.value)) return 'check';
  return first.value === CELL_A ? 'light_mode' : 'dark_mode';
}
