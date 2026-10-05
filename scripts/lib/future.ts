/** Utilitaires purs de la validation long terme (testés par future.test.ts). */
import { addDays, diffDays, formatISODate, parseISODate, type ISODate } from '../../engine/core/date';

export interface DateWindow {
  /** Premier jour (inclus), toujours un 1er du mois. */
  readonly from: ISODate;
  /** Jour de fin (exclu), toujours un 1er du mois. */
  readonly to: ISODate;
  readonly days: number;
}

/** Fenêtre de mois entiers : du 1er du mois de `start` au 1er du même mois `years` ans plus tard (exclu). */
export function monthWindow(start: ISODate, years: number): DateWindow {
  if (!Number.isInteger(years) || years < 1) throw new RangeError(`Nombre d'années invalide : ${years}`);
  const { y, m } = parseISODate(start);
  const from = formatISODate(y, m, 1);
  const to = formatISODate(y + years, m, 1);
  return { from, to, days: diffDays(from, to) };
}

/** Jours de la fenêtre, dans l'ordre. */
export function* windowDays(w: DateWindow): Generator<ISODate> {
  for (let i = 0; i < w.days; i++) yield addDays(w.from, i);
}

/** Clé de mois « YYYY-MM ». */
export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

/** Empreintes mensuelles « YYYY-MM » → condensé. */
export type GoldenMonths = Readonly<Record<string, string>>;

export interface GoldenComparison {
  readonly checked: number;
  /** Mois dont l'empreinte diffère de la référence (puzzles publiés modifiés !). */
  readonly mismatches: readonly string[];
  /** Mois calculés absents de la référence. */
  readonly missing: readonly string[];
}

export function compareGolden(golden: GoldenMonths, computed: GoldenMonths): GoldenComparison {
  const mismatches: string[] = [];
  const missing: string[] = [];
  let checked = 0;
  for (const [month, digest] of Object.entries(computed)) {
    const ref = golden[month];
    if (ref === undefined) missing.push(month);
    else {
      checked++;
      if (ref !== digest) mismatches.push(month);
    }
  }
  return { checked, mismatches: mismatches.sort(), missing: missing.sort() };
}

/** Fusion en ajout seul : une empreinte existante n'est JAMAIS remplacée (conflit signalé). */
export function mergeGolden(
  existing: GoldenMonths,
  computed: GoldenMonths,
): { merged: Record<string, string>; added: string[]; conflicts: string[] } {
  const merged: Record<string, string> = { ...existing };
  const added: string[] = [];
  const conflicts: string[] = [];
  for (const [month, digest] of Object.entries(computed)) {
    const ref = existing[month];
    if (ref === undefined) {
      merged[month] = digest;
      added.push(month);
    } else if (ref !== digest) conflicts.push(month);
  }
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k]!;
  return { merged: sorted, added: added.sort(), conflicts: conflicts.sort() };
}

/** Quantile d'un tableau TRIÉ (méthode du rang inférieur). */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}
