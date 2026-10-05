/**
 * Règles de la version gratuite (logique pure) : indices, archives, gel offert, interstitiels.
 * `unlimited` : Premium acheté, ou build sans publicité — tout est alors débloqué, sans annonce.
 */
import { addDays, compareISO, diffDays, type ISODate } from '../../engine/core/date';
import { FREE_ARCHIVE_DAYS, FREE_HINTS_PER_PUZZLE, FREEZE_REWARD_EVERY_DAYS, INTERSTITIAL_UNLIMITED_EVERY } from './config';
import type { MonetizationState } from './state';

/** Un nouvel indice demande-t-il une vidéo ? (`hintsUsed` : indices déjà vus sur cette grille) */
export function hintNeedsReward(hintsUsed: number, unlimited: boolean): boolean {
  return !unlimited && hintsUsed >= FREE_HINTS_PER_PUZZLE;
}

/**
 * Jour d'archive verrouillé : plus vieux que FREE_ARCHIVE_DAYS, ni débloqué par une vidéo, ni
 * déjà commencé ou résolu (une partie entamée n'est jamais confisquée).
 */
export function archiveLocked(
  date: ISODate,
  today: ISODate,
  opts: { readonly unlimited: boolean; readonly unlocked: ReadonlySet<ISODate>; readonly played: boolean },
): boolean {
  if (opts.unlimited || opts.played || opts.unlocked.has(date)) return false;
  return diffDays(date, today) > FREE_ARCHIVE_DAYS;
}

/** Gel offert : réserve non pleine et délai écoulé depuis le dernier. `nextOn` : prochain jour possible. */
export function freezeOffer(
  claimedOn: ISODate | null,
  today: ISODate,
  freezes: number,
  maxFreezes: number,
): { readonly available: boolean; readonly nextOn: ISODate | null } {
  const nextOn = claimedOn === null ? null : addDays(claimedOn, FREEZE_REWARD_EVERY_DAYS);
  const waiting = nextOn !== null && compareISO(today, nextOn) < 0;
  return { available: freezes < maxFreezes && !waiting, nextOn: waiting ? nextOn : null };
}

export type SolvedEvent = { readonly mode: 'daily'; readonly date: ISODate } | { readonly mode: 'unlimited' };

/**
 * Partie résolue : nouvel état des compteurs et interstitiel à montrer ou non.
 * Un seul après le puzzle du jour (par date de puzzle), puis une partie illimitée sur N.
 */
export function onSolved(state: MonetizationState, event: SolvedEvent): { readonly state: MonetizationState; readonly interstitial: boolean } {
  if (event.mode === 'daily') {
    if (state.dailyInterstitialFor === event.date) return { state, interstitial: false };
    return { state: { ...state, dailyInterstitialFor: event.date }, interstitial: true };
  }
  const unlimitedSolved = state.unlimitedSolved + 1;
  return { state: { ...state, unlimitedSolved }, interstitial: unlimitedSolved % INTERSTITIAL_UNLIMITED_EVERY === 0 };
}
