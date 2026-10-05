/**
 * Valeurs attendues de l'auto-vérification (engine/selfcheck.ts). Données pures, importables par
 * l'application sans charger le moteur : SELFCHECK_REVISION change dès que l'une d'elles change,
 * et l'app relance alors le contrôle (son résultat est sinon gardé pour la version installée).
 */
import { hashHex } from './core/prng';

/** Puzzles du calendrier : Queens (lundi facile, dimanche expert, samedi) et un dimanche Binairo. */
export const SELFCHECK_DATES = ['2026-10-05', '2026-10-11', '2026-10-18', '2026-11-14'] as const;
/** Binairo V1 hors calendrier (version explicite) : un dimanche 10×10 expert (tentatives rejetées, unicité, contradictions). */
export const BINAIRO_SELFCHECK_DATE = '2026-10-11';

export const SELFCHECK_EXPECTED = {
  hash: 'd954ff7afdfe75c1efd9755b7146fdcd',
  rng: [1171315048, 2646993962, 971861685],
  daily: {
    '2026-10-05': 'cce86084fc2f956e8d6ff8a3e04ed9e4',
    '2026-10-11': '7280388483e999d0d3973e9a38c6fb6c',
    '2026-10-18': 'd98329640ffb02aa07824b03d342bdbe',
    '2026-11-14': 'c8849ea64cb037b6e6a7aee881b668cb',
  } as Readonly<Record<(typeof SELFCHECK_DATES)[number], string>>,
  binairo: 'db45d59c68946c63bd40ba466bde8262',
} as const;

/** Empreinte des valeurs attendues (et des dates contrôlées). */
export const SELFCHECK_REVISION = hashHex(JSON.stringify([SELFCHECK_DATES, BINAIRO_SELFCHECK_DATE, SELFCHECK_EXPECTED])).slice(0, 12);
