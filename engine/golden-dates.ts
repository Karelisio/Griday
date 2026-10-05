import type { ISODate } from './core/date';

/** Dates des empreintes « golden » : deux semaines complètes + dates lointaines (bissextiles, fins d'année). */
export const GOLDEN_DATES: readonly ISODate[] = [
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
  '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
  '2027-01-01', '2028-02-29', '2029-12-31', '2031-07-14', '2033-03-27', '2036-02-29', '2036-10-04',
];

/** Fenêtre du condensé (empreintes de jours consécutifs). */
export const GOLDEN_DIGEST_START: ISODate = '2026-10-05';
export const GOLDEN_DIGEST_DAYS = 120;
