/** Formats propres aux statistiques (pourcentages, dates courtes, majuscule initiale) ; nombres et durées : `i18n/format.ts`. */
import type { ISODate } from '../../engine/core/date';
import type { Language } from '../i18n';
import { BCP47 } from '../i18n/format';


/** Valeur absente (palier sans résultat) : tiret demi-cadratin, sans texte à traduire. */
export const DASH = '–';

/** Première lettre en majuscule selon la langue (« résolu plus tard » → « Résolu plus tard »). */
export function capitalize(text: string, lang: Language): string {
  const [first = '', ...rest] = text; // par point de code
  return first.toLocaleUpperCase(BCP47[lang]) + rest.join('');
}

/** Part de 0 à 1 en pourcentage entier localisé (« 90 % » / « 90% »). */
export function formatPercent(ratio: number, lang: Language): string {
  return new Intl.NumberFormat(BCP47[lang], { style: 'percent' }).format(ratio);
}

/** Date civile courte (« 5 oct. », avec le jour : « lun. 5 oct. »), sans décalage de fuseau. */
export function formatShortDate(date: ISODate, lang: Language, weekday = false): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC', ...(weekday && { weekday: 'short' }) };
  return new Intl.DateTimeFormat(BCP47[lang], options).format(new Date(Date.UTC(y, m - 1, d, 12)));
}
