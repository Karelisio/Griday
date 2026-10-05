/** Utilitaires purs de la validation long terme (testés par future.test.ts). */
import { addDays, diffDays, formatISODate, parseISODate, type ISODate } from '../../engine/core/date';

export interface DateWindow {
  /** Premier jour (inclus), toujours un 1er du mois. */
  readonly from: ISODate;
  /** Jour de fin (exclu), toujours un 1er du mois. */
  readonly to: ISODate;
  readonly days: number;
}

/**
 * Fenêtre de mois entiers couvrant [start, start + years] : du 1er du mois de `start`
 * au 1er du mois qui suit `start + years` (exclu).
 */
export function monthWindow(start: ISODate, years: number): DateWindow {
  if (!Number.isInteger(years) || years < 1) throw new RangeError(`Nombre d'années invalide : ${years}`);
  const { y, m } = parseISODate(start);
  const from = formatISODate(y, m, 1);
  const to = m === 12 ? formatISODate(y + years + 1, 1, 1) : formatISODate(y + years, m + 1, 1);
  return { from, to, days: diffDays(from, to) };
}

/** Premier jour du mois. */
export function monthStart(date: ISODate): ISODate {
  const { y, m } = parseISODate(date);
  return formatISODate(y, m, 1);
}

/** Premier jour du mois suivant. */
export function nextMonthStart(date: ISODate): ISODate {
  const { y, m } = parseISODate(date);
  return m === 12 ? formatISODate(y + 1, 1, 1) : formatISODate(y, m + 1, 1);
}

/**
 * Jours couverts par une clé de référence : « YYYY-MM » (mois entier) ou « YYYY-MM-DD..DD »
 * (plage d'un mois, ex. dernier mois partiel avant validThrough).
 */
export function keyDays(key: string): ISODate[] {
  const full = /^(\d{4})-(\d{2})$/.exec(key);
  const range = /^(\d{4})-(\d{2})-(\d{2})\.\.(\d{2})$/.exec(key);
  if (!full && !range) throw new RangeError(`Clé de référence invalide : ${key}`);
  const first = full ? `${key}-01` : key.slice(0, 10);
  const last = full ? addDays(nextMonthStart(first), -1) : `${key.slice(0, 8)}${range![4]}`;
  parseISODate(first);
  parseISODate(last);
  const n = diffDays(first, last);
  if (n < 0 || monthKey(first) !== monthKey(last)) throw new RangeError(`Plage invalide : ${key}`);
  return Array.from({ length: n + 1 }, (_, i) => addDays(first, i));
}

/** Clé « YYYY-MM-DD..DD » d'une plage d'un même mois. */
export function rangeKey(first: ISODate, last: ISODate): string {
  return `${first}..${last.slice(8, 10)}`;
}

/** Clé de mois « YYYY-MM ». */
export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

/** Empreintes mensuelles « YYYY-MM » → condensé. */
export type GoldenMonths = Readonly<Record<string, string>>;

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
