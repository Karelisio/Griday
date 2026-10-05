/** Formats localisés via Intl (dates, nombres, durées). */
import type { ISODate } from '../../engine/core/date';
import type { Language } from './index';

/** Étiquette BCP 47 des formats Intl par langue de l'app. */
export const BCP47: Readonly<Record<Language, string>> = { fr: 'fr-FR', en: 'en-US' };

/** Date civile ISO formatée sans décalage de fuseau (construite à midi UTC, affichée en UTC). */
export function formatDate(date: ISODate, lang: Language, style: 'full' | 'long' | 'medium' | 'weekday' = 'long'): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const instant = new Date(Date.UTC(y, m - 1, d, 12));
  const options: Intl.DateTimeFormatOptions =
    style === 'full'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
      : style === 'long'
        ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
        : style === 'medium'
          ? { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
          : { weekday: 'long', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(BCP47[lang], options).format(instant);
}

export function formatNumber(n: number, lang: Language): string {
  return new Intl.NumberFormat(BCP47[lang]).format(n);
}

/** Chronomètre « m:ss » (ou « h:mm:ss »), chiffres localisés. */
export function formatClock(ms: number, lang: Language): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = new Intl.NumberFormat(BCP47[lang], { minimumIntegerDigits: 2, useGrouping: false });
  const one = new Intl.NumberFormat(BCP47[lang], { useGrouping: false });
  return h > 0 ? `${one.format(h)}:${two.format(m)}:${two.format(s)}` : `${one.format(m)}:${two.format(s)}`;
}

/**
 * Durée en toutes lettres (« 3 min 5 s » / « 3 min, 5 sec »), Intl.DurationFormat si disponible.
 * Secondes entières écoulées, comme le chronomètre (jamais arrondies au-dessus).
 */
export function formatDuration(ms: number, lang: Language): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const parts = { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
  const DF = (Intl as unknown as { DurationFormat?: new (l: string, o: object) => { format(d: object): string } }).DurationFormat;
  if (DF) {
    const d: Record<string, number> = {};
    if (parts.hours) d['hours'] = parts.hours;
    if (parts.hours || parts.minutes) d['minutes'] = parts.minutes;
    d['seconds'] = parts.seconds;
    return new DF(BCP47[lang], { style: 'short', secondsDisplay: 'always' }).format(d);
  }
  const unit = (value: number, u: 'hour' | 'minute' | 'second') =>
    new Intl.NumberFormat(BCP47[lang], { style: 'unit', unit: u, unitDisplay: 'short' }).format(value);
  const out: string[] = [];
  if (parts.hours) out.push(unit(parts.hours, 'hour'));
  if (parts.hours || parts.minutes) out.push(unit(parts.minutes, 'minute'));
  out.push(unit(parts.seconds, 'second'));
  return out.join(' ');
}

/** Heure « HH:MM » au format local (« 19:00 » / « 7:00 PM »). */
export function formatTimeOfDay(hhmm: string, lang: Language): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(BCP47[lang], { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}
