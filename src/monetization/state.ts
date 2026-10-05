/** État persistant de la monétisation (Preferences) : Premium en cache, archives débloquées, compteurs. */
import { compareISO, isValidISODate, type ISODate } from '../../engine/core/date';

export interface MonetizationState {
  /** Premium possédé (dernier état connu du Play Store : l'app reste hors ligne). */
  readonly premium: boolean;
  /** Jours d'archive débloqués par une vidéo. */
  readonly unlocked: readonly ISODate[];
  /** Dernier gel de série offert (vidéo ou Premium). */
  readonly freezeClaimedOn: ISODate | null;
  /** Parties illimitées résolues (cadence des interstitiels). */
  readonly unlimitedSolved: number;
  /** Puzzle du jour après lequel le dernier interstitiel a été proposé. */
  readonly dailyInterstitialFor: ISODate | null;
}

export const MONETIZATION_KEY = 'monetization';
/** Garde-fou : ≈ 27 ans de jours débloqués un par un. */
const MAX_UNLOCKED = 10_000;

export const EMPTY_MONETIZATION: MonetizationState = {
  premium: false,
  unlocked: [],
  freezeClaimedOn: null,
  unlimitedSolved: 0,
  dailyInterstitialFor: null,
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const dateOrNull = (v: unknown): ISODate | null => (typeof v === 'string' && isValidISODate(v) ? v : null);

export function encodeMonetization(s: MonetizationState) {
  return { v: 1 as const, ...s };
}

/** Lecture tolérante : toute valeur illisible retombe sur sa valeur par défaut. */
export function decodeMonetization(raw: unknown): MonetizationState {
  if (!isRecord(raw) || raw['v'] !== 1) return EMPTY_MONETIZATION;
  const unlocked = Array.isArray(raw['unlocked'])
    ? [...new Set(raw['unlocked'].filter((d): d is ISODate => typeof d === 'string' && isValidISODate(d)))].sort(compareISO).slice(-MAX_UNLOCKED)
    : [];
  const solved = raw['unlimitedSolved'];
  return {
    premium: raw['premium'] === true,
    unlocked,
    freezeClaimedOn: dateOrNull(raw['freezeClaimedOn']),
    unlimitedSolved: typeof solved === 'number' && Number.isSafeInteger(solved) && solved >= 0 ? solved : 0,
    dailyInterstitialFor: dateOrNull(raw['dailyInterstitialFor']),
  };
}

export function withUnlocked(s: MonetizationState, date: ISODate): MonetizationState {
  if (s.unlocked.includes(date)) return s;
  return { ...s, unlocked: [...s.unlocked, date].sort(compareISO).slice(-MAX_UNLOCKED) };
}
