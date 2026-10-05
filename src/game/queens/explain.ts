/**
 * Indice → texte localisable (clé i18n + paramètres) et surbrillances pour la grille.
 * Pur : la traduction est faite par l'appelant avec `t(textKey, params)`.
 */
import type { QueensHint } from '../../../engine/queens/hint';
import type { QueensStep, QueensUnitRef } from '../../../engine/queens/v1/solver';
import { MARK_EMPTY, type QueensMark, type QueensPuzzle } from '../../../engine/queens/types';
import type { Language } from '../../i18n';

export interface HintHighlight {
  /** Cases des unités qui portent le raisonnement (région, ligne, colonne). */
  readonly focus: readonly number[];
  /** Cases des unités où ont lieu les éliminations. */
  readonly targets: readonly number[];
  /** Cases exclues par la déduction. */
  readonly eliminate: readonly number[];
  /** Case jouée par l'indice. */
  readonly reveal: number | null;
  readonly revealMark: 'queen' | 'cross' | null;
  /** Cases fausses (erreurs du joueur). */
  readonly mistakes: readonly number[];
}

export interface HintExplanation {
  readonly titleKey: string;
  readonly textKey: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly highlight: HintHighlight;
}

const BCP47: Record<Language, string> = { fr: 'fr-FR', en: 'en-US' };

export function unitCells(p: QueensPuzzle, u: QueensUnitRef): number[] {
  const n = p.size;
  const out: number[] = [];
  for (let cell = 0; cell < n * n; cell++) {
    const hit =
      u.kind === 'row' ? Math.floor(cell / n) === u.index : u.kind === 'column' ? cell % n === u.index : p.regions[cell] === u.index;
    if (hit) out.push(cell);
  }
  return out;
}

const cellsOf = (p: QueensPuzzle, units: readonly QueensUnitRef[]) => [...new Set(units.flatMap((u) => unitCells(p, u)))].sort((a, b) => a - b);

function list(numbers: readonly number[], lang: Language): string {
  const items = numbers.map((x) => new Intl.NumberFormat(BCP47[lang]).format(x));
  const LF = (Intl as unknown as { ListFormat?: new (l: string, o: object) => { format(a: string[]): string } }).ListFormat;
  return LF ? new LF(BCP47[lang], { style: 'long', type: 'conjunction' }).format(items) : items.join(', ');
}

/** Libellé d'unité : clé + paramètres (traduits par l'appelant via `hint.unit.*`). */
function unitParam(u: QueensUnitRef): { key: string; n: number } {
  return { key: `hint.unit.${u.kind}`, n: u.index + 1 };
}

const EMPTY: HintHighlight = { focus: [], targets: [], eliminate: [], reveal: null, revealMark: null, mistakes: [] };

/**
 * Explique un indice. `unitLabel` traduit une unité (« la ligne 3 », « row 3 »…) :
 * fourni par l'appelant pour garder ce module pur.
 */
export function explainHint(
  hint: QueensHint,
  p: QueensPuzzle,
  lang: Language,
  unitLabel: (key: string, n: number) => string,
): HintExplanation {
  switch (hint.kind) {
    case 'solved':
      return { titleKey: 'hint.technique.solved', textKey: 'hint.queens.solved', params: {}, highlight: EMPTY };
    case 'mistake':
      return {
        titleKey: 'hint.technique.mistake',
        textKey: 'hint.queens.mistake',
        params: { count: hint.cells.length },
        highlight: { ...EMPTY, mistakes: hint.cells },
      };
    case 'reveal':
      return {
        titleKey: 'hint.technique.reveal',
        textKey: 'hint.queens.reveal',
        params: {},
        highlight: { ...EMPTY, reveal: hint.reveal.cell, revealMark: hint.reveal.mark },
      };
    case 'step':
      return explainStep(hint.step, hint.reveal, p, lang, unitLabel);
  }
}

function explainStep(
  step: QueensStep,
  reveal: { cell: number; mark: 'queen' | 'cross' },
  p: QueensPuzzle,
  lang: Language,
  unitLabel: (key: string, n: number) => string,
): HintExplanation {
  const highlight: HintHighlight = {
    focus: cellsOf(p, step.units),
    targets: cellsOf(p, step.targets),
    eliminate: step.eliminate,
    reveal: reveal.cell,
    revealMark: reveal.mark,
    mistakes: [],
  };
  const titleKey = `hint.technique.${step.technique}`;
  const u0 = step.units[0];
  const t0 = step.targets[0];
  const label = (u: QueensUnitRef | undefined) => (u ? unitLabel(unitParam(u).key, unitParam(u).n) : '');
  switch (step.technique) {
    case 'single':
      return { titleKey, textKey: `hint.queens.single.${u0?.kind ?? 'region'}`, params: lineParams(u0), highlight };
    case 'region-line':
      // Unité = la région ; cible = la ligne ou colonne qui la contient.
      return { titleKey, textKey: `hint.queens.region-line.${t0?.kind === 'column' ? 'column' : 'row'}`, params: lineParams(t0), highlight };
    case 'line-region':
      // Unité = la ligne ou colonne ; cible = la région qui la contient.
      return { titleKey, textKey: `hint.queens.line-region.${u0?.kind === 'column' ? 'column' : 'row'}`, params: lineParams(u0), highlight };
    case 'attack':
      return { titleKey, textKey: 'hint.queens.attack', params: { unit: label(u0), count: step.eliminate.length }, highlight };
    case 'contradiction':
      return { titleKey, textKey: 'hint.queens.contradiction', params: { unit: label(u0) }, highlight };
    case 'locked-pair':
    case 'locked-set': {
      const src = u0?.kind ?? 'region';
      const dst = t0?.kind ?? 'row';
      const family = `${plural(src)}-${plural(dst)}`;
      const numbers = (units: readonly QueensUnitRef[]) => list(units.map((u) => u.index + 1), lang);
      const params: Record<string, string | number> =
        src === 'region'
          ? { count: step.units.length, lines: numbers(step.targets) }
          : dst === 'region'
            ? { count: step.targets.length, lines: numbers(step.units) }
            : { lines: numbers(step.units), targets: numbers(step.targets) };
      return { titleKey, textKey: `hint.queens.locked.${family}`, params, highlight };
    }
  }
}

const plural = (k: QueensUnitRef['kind']) => (k === 'region' ? 'regions' : k === 'row' ? 'rows' : 'columns');

function lineParams(u: QueensUnitRef | undefined): Record<string, number> {
  if (!u || u.kind === 'region') return {};
  return u.kind === 'row' ? { row: u.index + 1 } : { col: u.index + 1 };
}

/** Changement de marque joué par un indice. */
export interface HintMove {
  readonly cell: number;
  readonly mark: 'queen' | 'cross' | 'empty';
}

/** Identité d'une déduction : un même indice redemandé n'est compté qu'une fois. */
export function hintKey(h: QueensHint): string {
  switch (h.kind) {
    case 'step':
      return `step:${h.step.technique}:${h.step.place.join(',')}:${h.step.eliminate.join(',')}`;
    case 'reveal':
      return `reveal:${h.reveal.cell}`;
    case 'mistake':
      return `mistake:${h.cells.join(',')}`;
    case 'solved':
      return 'solved';
  }
}

/** Coups joués par « Jouer ce coup » : toute la déduction (reine posée et cases exclues encore vides). */
export function hintMoves(h: QueensHint, marks: readonly QueensMark[]): HintMove[] {
  switch (h.kind) {
    case 'step':
      return [
        ...h.step.place.map((cell) => ({ cell, mark: 'queen' as const })),
        ...h.step.eliminate.filter((cell) => marks[cell] === MARK_EMPTY).map((cell) => ({ cell, mark: 'cross' as const })),
      ];
    case 'reveal':
      return [h.reveal];
    case 'mistake':
      return h.cells.map((cell) => ({ cell, mark: 'empty' as const }));
    case 'solved':
      return [];
  }
}
