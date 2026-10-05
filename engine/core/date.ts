/**
 * Dates civiles « YYYY-MM-DD » en arithmétique entière pure (algorithmes de H. Hinnant).
 * Aucune dépendance au fuseau horaire : la date du jour est calculée par l'UI
 * (localISODate) puis tout le reste se fait sur la chaîne.
 */

export type ISODate = string;

export interface CivilDate {
  readonly y: number;
  readonly m: number;
  readonly d: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MIN_YEAR = 1900;
export const MAX_YEAR = 9999;

function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

/** Nombre de jours depuis 1970-01-01 (peut être négatif). */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = floorDiv(yy, 400);
  const yoe = yy - era * 400;
  const mp = m > 2 ? m - 3 : m + 9;
  const doy = floorDiv(153 * mp + 2, 5) + d - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse de daysFromCivil. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = floorDiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const d = doy - floorDiv(153 * mp + 2, 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export function isValidISODate(iso: string): boolean {
  const match = ISO_RE.exec(iso);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return y >= MIN_YEAR && y <= MAX_YEAR && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function parseISODate(iso: string): CivilDate {
  if (!isValidISODate(iso)) throw new RangeError(`Date ISO invalide : "${iso}"`);
  return { y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) };
}

export function formatISODate(y: number, m: number, d: number): ISODate {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!isValidISODate(iso)) throw new RangeError(`Date invalide : ${y}-${m}-${d}`);
  return iso;
}

export function isoToDays(iso: ISODate): number {
  const { y, m, d } = parseISODate(iso);
  return daysFromCivil(y, m, d);
}

export function daysToISO(days: number): ISODate {
  const { y, m, d } = civilFromDays(days);
  return formatISODate(y, m, d);
}

export function addDays(iso: ISODate, n: number): ISODate {
  if (!Number.isInteger(n)) throw new RangeError(`addDays: décalage non entier ${n}`);
  return daysToISO(isoToDays(iso) + n);
}

/** Nombre de jours de `from` à `to` (positif si `to` est après `from`). */
export function diffDays(from: ISODate, to: ISODate): number {
  return isoToDays(to) - isoToDays(from);
}

export function compareISO(a: ISODate, b: ISODate): number {
  const da = isoToDays(a);
  const db = isoToDays(b);
  return da < db ? -1 : da > db ? 1 : 0;
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(iso: ISODate): number {
  const days = isoToDays(iso);
  // 1970-01-01 était un jeudi (4).
  return ((((days + 3) % 7) + 7) % 7) + 1;
}

/** Date civile locale d'un instant (à appeler côté UI avec `new Date()`). */
export function localISODate(date: Date): ISODate {
  return formatISODate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
