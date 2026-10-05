/** Clés du stockage local et ménage des données périmées. */
import { diffDays, isValidISODate, type ISODate } from '../engine/core/date';
import { listKeys, loadJSON, removeKey } from './platform/storage';

export const dailyPuzzleKey = (date: ISODate) => `daily.puzzle.${date}`;
export const dailyProgressKey = (date: ISODate) => `daily.progress.${date}`;
export const UNLIMITED_CURRENT_KEY = 'unlimited.current.v1';
export const UNLIMITED_PREFS_KEY = 'unlimited.prefs.v1';
export const unlimitedProgressKey = (token: string) => `unlimited.progress.${token}`;
export const selfCheckKey = (appVersion: string) => `selfcheck.${appVersion}`;

/** Grilles du jour en cache (régénérables) gardées N jours. */
export const PUZZLE_CACHE_DAYS = 7;
/** Parties du jour non terminées gardées N jours. */
export const PROGRESS_DAYS = 30;

/**
 * Supprime ce qui ne sert plus : caches de grilles anciens, parties du jour terminées (`solved`)
 * ou trop anciennes, parties illimitées abandonnées, auto-vérifications d'anciennes versions,
 * anciens résultats isolés (remplacés par l'historique). Renvoie les clés supprimées.
 */
export async function pruneStorage(today: ISODate, appVersion: string, solved: ReadonlySet<ISODate>): Promise<string[]> {
  const keys = await listKeys();
  const current = await loadJSON<{ token?: unknown }>(UNLIMITED_CURRENT_KEY);
  const token = typeof current?.token === 'string' ? current.token : null;
  const age = (date: string) => (isValidISODate(date) ? diffDays(date, today) : Infinity);
  const stale = keys.filter((key) => {
    const [, kind, id = ''] = /^(daily\.puzzle|daily\.progress|daily\.result|unlimited\.progress|selfcheck)\.(.+)$/.exec(key) ?? [];
    switch (kind) {
      case 'daily.puzzle':
        return age(id) > PUZZLE_CACHE_DAYS;
      case 'daily.progress':
        return age(id) > PROGRESS_DAYS || (age(id) > 0 && solved.has(id));
      case 'daily.result':
        return true;
      case 'unlimited.progress':
        return id !== token;
      case 'selfcheck':
        return id !== appVersion;
      default:
        return false;
    }
  });
  await Promise.all(stale.map(removeKey));
  return stale;
}
