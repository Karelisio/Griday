import { diffDays, isValidISODate, isoToDays, type ISODate } from './date';
import type { PuzzleTypeId } from './types';

/**
 * Calendrier versionné. Les tables ne se modifient JAMAIS rétroactivement après publication :
 * on ajoute uniquement des entrées dont la date `from` est dans le futur.
 */
export interface RotationEntry {
  /** Premier jour d'application (inclus). */
  readonly from: ISODate;
  /** Types en rotation, dans l'ordre (index = jours depuis `from` modulo longueur). */
  readonly types: readonly PuzzleTypeId[];
}

export interface VersionEntry {
  readonly from: ISODate;
  readonly version: number;
}

export interface Schedule {
  /** Jour n°1 (numérotation, début des archives). Sans effet sur la génération. */
  readonly epoch: ISODate;
  readonly rotations: readonly RotationEntry[];
  readonly versions: Readonly<Record<PuzzleTypeId, readonly VersionEntry[]>>;
}

/** Dernière entrée dont `from` ≤ date (la première entrée s'applique aux dates antérieures). */
function entryFor<T extends { readonly from: ISODate }>(entries: readonly T[], date: ISODate): T {
  if (entries.length === 0) throw new Error('Table de calendrier vide');
  const day = isoToDays(date);
  let found = entries[0]!;
  for (const e of entries) {
    if (isoToDays(e.from) <= day) found = e;
    else break;
  }
  return found;
}

export function typeForDate(schedule: Schedule, date: ISODate): PuzzleTypeId {
  const entry = entryFor(schedule.rotations, date);
  const offset = diffDays(entry.from, date);
  const n = entry.types.length;
  return entry.types[((offset % n) + n) % n]!;
}

export function versionForDate(schedule: Schedule, type: PuzzleTypeId, date: ISODate): number {
  const entries = Object.hasOwn(schedule.versions, type) ? schedule.versions[type] : undefined;
  if (!entries) throw new Error(`Aucune version déclarée pour le type "${type}"`);
  return entryFor(entries, date).version;
}

/** Numéro du jour (1 = epoch). */
export function dayNumber(schedule: Schedule, date: ISODate): number {
  return diffDays(schedule.epoch, date) + 1;
}

/** Vérifie la cohérence d'un calendrier (tests + démarrage). Renvoie la liste des erreurs. */
export function validateSchedule(schedule: Schedule, knownVersions: (type: PuzzleTypeId) => readonly number[]): string[] {
  const errors: string[] = [];
  if (!isValidISODate(schedule.epoch)) errors.push(`epoch invalide : ${schedule.epoch}`);

  const checkSorted = (label: string, entries: readonly { from: ISODate }[]) => {
    if (entries.length === 0) errors.push(`${label} : table vide`);
    for (let i = 0; i < entries.length; i++) {
      const from = entries[i]!.from;
      if (!isValidISODate(from)) errors.push(`${label}[${i}] : date invalide ${from}`);
      else if (i > 0 && isValidISODate(entries[i - 1]!.from) && isoToDays(entries[i - 1]!.from) >= isoToDays(from)) {
        errors.push(`${label}[${i}] : dates non strictement croissantes`);
      }
    }
  };

  checkSorted('rotations', schedule.rotations);
  for (const [i, r] of schedule.rotations.entries()) {
    if (r.types.length === 0) errors.push(`rotations[${i}] : aucun type`);
    for (const t of r.types) {
      const versions = Object.hasOwn(schedule.versions, t) ? schedule.versions[t] : undefined;
      if (!versions) errors.push(`rotations[${i}] : type sans versions "${t}"`);
      else if (
        versions.length > 0 &&
        isValidISODate(versions[0]!.from) &&
        isValidISODate(r.from) &&
        isoToDays(versions[0]!.from) > isoToDays(r.from)
      ) {
        errors.push(`rotations[${i}] : "${t}" actif avant sa première version`);
      }
    }
  }
  for (const [type, entries] of Object.entries(schedule.versions) as [PuzzleTypeId, readonly VersionEntry[]][]) {
    checkSorted(`versions.${type}`, entries);
    const known = knownVersions(type);
    let prev = 0;
    for (const e of entries) {
      if (!known.includes(e.version)) errors.push(`versions.${type} : version ${e.version} inconnue du registre`);
      if (e.version <= prev) errors.push(`versions.${type} : versions non croissantes`);
      prev = e.version;
    }
  }
  return errors;
}
