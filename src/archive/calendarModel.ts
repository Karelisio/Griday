/**
 * Calendrier mensuel des archives (logique pure) : grille de semaines commençant le lundi, arithmétique
 * de mois, bornes (du mois de l'epoch à celui d'aujourd'hui) et cibles de la navigation au clavier.
 * Les jours jouables vont de l'epoch (`first`) à aujourd'hui (`today`), inclus ; on suppose `first` ≤ `today`.
 */
import { addDays, compareISO, daysInMonth, diffDays, formatISODate, isoWeekday, parseISODate, type ISODate } from '../../engine/core/date';

/** Mois civil (`month` de 1 à 12). */
export interface MonthRef {
  readonly year: number;
  readonly month: number;
}

export interface CalendarCell {
  readonly date: ISODate;
  /** Jour du mois (1 à 31). */
  readonly day: number;
  /** Jour d'un mois voisin, qui complète la première ou la dernière semaine. */
  readonly outside: boolean;
}

/** Sept jours, du lundi au dimanche. */
export type CalendarWeek = readonly CalendarCell[];

export function monthOf(date: ISODate): MonthRef {
  const { y, m } = parseISODate(date);
  return { year: y, month: m };
}

/** Clé « AAAA-MM » : triable, sert aussi de préfixe aux dates du mois. */
export const monthKey = ({ year, month }: MonthRef): string => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;

export const firstDayOf = ({ year, month }: MonthRef): ISODate => formatISODate(year, month, 1);
export const lastDayOf = ({ year, month }: MonthRef): ISODate => formatISODate(year, month, daysInMonth(year, month));

/** Nombre de mois de `from` à `to` (positif si `to` est après `from`). */
export const diffMonths = (from: MonthRef, to: MonthRef): number => (to.year - from.year) * 12 + (to.month - from.month);

export function addMonths({ year, month }: MonthRef, n: number): MonthRef {
  const index = year * 12 + (month - 1) + n;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** Semaines (lundi → dimanche) qui couvrent le mois ; les jours des mois voisins sont marqués `outside`. */
export function monthGrid(m: MonthRef): CalendarWeek[] {
  const lead = isoWeekday(firstDayOf(m)) - 1;
  const start = addDays(firstDayOf(m), -lead);
  const prefix = monthKey(m);
  return Array.from({ length: Math.ceil((lead + daysInMonth(m.year, m.month)) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const date = addDays(start, week * 7 + weekday);
      return { date, day: Number(date.slice(8)), outside: !date.startsWith(prefix) };
    }),
  );
}

/** Mois affichables : de celui de l'epoch à celui d'aujourd'hui (un jour antérieur à l'epoch ne l'avance pas). */
export function monthBounds(first: ISODate, today: ISODate): { readonly min: MonthRef; readonly max: MonthRef } {
  return { min: monthOf(first), max: monthOf(compareISO(today, first) < 0 ? first : today) };
}

export function clampMonth(m: MonthRef, first: ISODate, today: ISODate): MonthRef {
  const { min, max } = monthBounds(first, today);
  return diffMonths(min, m) < 0 ? min : diffMonths(max, m) > 0 ? max : m;
}

export const isPlayable = (date: ISODate, first: ISODate, today: ISODate): boolean => compareISO(date, first) >= 0 && compareISO(date, today) <= 0;

/** Ramène un jour entre l'epoch et aujourd'hui. */
export const clampDate = (date: ISODate, first: ISODate, today: ISODate): ISODate =>
  compareISO(date, first) < 0 ? first : compareISO(date, today) > 0 ? today : date;

/** Jours jouables du mois (de l'epoch à aujourd'hui), dans l'ordre. */
export function playableDays(m: MonthRef, first: ISODate, today: ISODate): ISODate[] {
  const from = compareISO(first, firstDayOf(m)) > 0 ? first : firstDayOf(m);
  const to = compareISO(today, lastDayOf(m)) < 0 ? today : lastDayOf(m);
  return Array.from({ length: Math.max(0, diffDays(from, to) + 1) }, (_, i) => addDays(from, i));
}

/**
 * Jour qui reçoit le focus au clavier (tabindex 0) : le dernier jour visité s'il est affiché et jouable,
 * sinon aujourd'hui, sinon le premier jour jouable du mois ; `null` si le mois n'en a aucun.
 */
export function focusableDay(m: MonthRef, remembered: ISODate | null, first: ISODate, today: ISODate): ISODate | null {
  const days = playableDays(m, first, today);
  if (remembered !== null && days.includes(remembered)) return remembered;
  return days.includes(today) ? today : (days[0] ?? null);
}

/** Même quantième `n` mois plus loin, ramené au dernier jour du mois quand il n'existe pas (31 → 30, 29 février…). */
export function shiftMonth(date: ISODate, n: number): ISODate {
  const { y, m, d } = parseISODate(date);
  const target = addMonths({ year: y, month: m }, n);
  return formatISODate(target.year, target.month, Math.min(d, daysInMonth(target.year, target.month)));
}

/**
 * Jour visé par une touche de navigation depuis `from`, ramené entre l'epoch et aujourd'hui :
 * ←/→ ±1 jour, ↑/↓ ±7 jours, PageUp/PageDown ±1 mois, Home/End lundi/dimanche de la semaine.
 * `null` pour toute autre touche.
 */
export function keyboardTarget(from: ISODate, key: string, first: ISODate, today: ISODate): ISODate | null {
  let target: ISODate;
  switch (key) {
    case 'ArrowLeft':
      target = addDays(from, -1);
      break;
    case 'ArrowRight':
      target = addDays(from, 1);
      break;
    case 'ArrowUp':
      target = addDays(from, -7);
      break;
    case 'ArrowDown':
      target = addDays(from, 7);
      break;
    case 'PageUp':
      target = shiftMonth(from, -1);
      break;
    case 'PageDown':
      target = shiftMonth(from, 1);
      break;
    case 'Home':
      target = addDays(from, 1 - isoWeekday(from));
      break;
    case 'End':
      target = addDays(from, 7 - isoWeekday(from));
      break;
    default:
      return null;
  }
  return clampDate(target, first, today);
}
