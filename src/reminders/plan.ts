/** Planification (pure) du rappel quotidien : un rappel par jour local, à l'heure choisie, pour les prochains jours. */
import type { TFunction } from 'i18next';
import { addDays, localISODate, parseISODate, type ISODate } from '../../engine/core/date';
import type { Language } from '../i18n';
import { formatNumber } from '../i18n/format';
import type { Reminder } from '../platform/notifications';
import { isReminderTime } from '../settings/types';

/** Rappels programmés d'avance. Renouvelés à chaque ouverture de l'app : un joueur absent plus longtemps n'est plus relancé. */
export const REMINDER_DAYS = 14;

export interface PlanOptions {
  /** Instant présent : un rappel déjà passé n'est pas programmé. */
  readonly now: Date;
  /** Heure locale du rappel, « HH:MM ». */
  readonly time: string;
  /** Nombre de rappels à programmer, un par jour. */
  readonly days?: number;
  /** Le puzzle d'aujourd'hui est résolu : pas de rappel aujourd'hui. */
  readonly todaySolved: boolean;
  /** Série en cours (jours résolus consécutifs, aujourd'hui compris s'il l'est). */
  readonly streak: number;
  /** Numéro du puzzle d'un jour (1 = jour de lancement). */
  readonly dayNumberOf: (date: ISODate) => number;
  readonly t: TFunction;
  readonly lang: Language;
}

/**
 * Rappels des `days` prochains jours, le premier étant celui d'aujourd'hui s'il est encore à venir et utile,
 * sinon celui de demain. Chaque jour est construit en heure locale (`new Date(a, m, j, h, min)`) : l'heure
 * d'horloge reste celle choisie à travers un changement d'heure, une addition de 24 h la décalerait.
 * Le premier rappel encourage à garder la série ; les suivants, dont on ignore tout, invitent à jouer.
 */
export function planReminders({ now, time, days = REMINDER_DAYS, todaySolved, streak, dayNumberOf, t, lang }: PlanOptions): Reminder[] {
  if (!isReminderTime(time)) throw new RangeError(`Heure de rappel invalide : "${time}"`);
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  const instant = (date: ISODate): Date => {
    const { y, m, d } = parseISODate(date);
    return new Date(y, m - 1, d, hours, minutes);
  };

  const today = localISODate(now);
  const startsToday = !todaySolved && instant(today).getTime() > now.getTime();
  // La série ne vaut la peine d'être défendue que si elle tient encore au premier rappel : aujourd'hui résolu
  // (elle l'inclut), ou rappel du jour à venir. Rappel du jour manqué et puzzle non résolu : elle cassera à minuit.
  const defendStreak = streak > 0 && (todaySolved || startsToday);

  return Array.from({ length: days }, (_, i) => {
    const date = addDays(today, startsToday ? i : i + 1);
    const n = dayNumberOf(date);
    return {
      id: Number(date.replace(/-/g, '')),
      at: instant(date),
      title: n > 0 ? t('reminder.notification.title', { n: formatNumber(n, lang) }) : t('reminder.notification.titleGeneric'),
      body: i === 0 && defendStreak ? t('reminder.notification.streak', { count: streak }) : t('reminder.notification.body'),
    };
  });
}
