/**
 * Services de monétisation factices pour les tests : à brancher avec `setAdsServiceForTesting` et
 * `setPurchaseServiceForTesting` (puis à remettre à `null`). Chaque méthode est un `vi.fn` observable.
 */
import { vi } from 'vitest';
import type { AdsService, RewardOutcome } from './ads';
import type { BuyOutcome, PurchaseService, RestoreOutcome } from './purchases';

export interface FakeAdsOptions {
  /** Choix de confidentialité exigés (entrée des réglages). */
  readonly privacyOptions?: boolean;
  /** Issue d'un moment d'interstitiel : annonce vue (sinon : pas prête, formulaire à sa place…). */
  readonly interstitial?: boolean;
}

/** Annonces : la vidéo avec récompense se termine par `outcome`. */
export function fakeAds(outcome: RewardOutcome = 'rewarded', { privacyOptions = false, interstitial = true }: FakeAdsOptions = {}) {
  const listeners = new Set<() => void>();
  const state = { privacyOptions };
  const emitChange = () => listeners.forEach((listener) => listener());
  const service = {
    start: vi.fn(async () => {}),
    showRewarded: vi.fn(async (): Promise<RewardOutcome> => outcome),
    prepareInterstitial: vi.fn(() => {}),
    showInterstitial: vi.fn(async () => interstitial),
    privacyOptionsRequired: vi.fn(() => state.privacyOptions),
    showPrivacyOptions: vi.fn(async () => {}),
    onChange: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    }),
  } satisfies AdsService;
  return Object.assign(service, {
    /** Choix de confidentialité exigés ou non (consentement relu) : les abonnés sont prévenus. */
    setPrivacyOptions(value: boolean) {
      state.privacyOptions = value;
      emitChange();
    },
    /** Prévient les abonnés d'un changement d'état. */
    emitChange,
  });
}

export interface FakePurchasesOptions {
  /** Prix localisé (null : produit pas encore chargé). */
  readonly price?: string | null;
  /** Achat possible maintenant (magasin prêt, produit chargé) ; jamais pendant un paiement en attente. */
  readonly available?: boolean;
  /** Premium déjà possédé au démarrage. */
  readonly owned?: boolean;
  /** Issue de l'achat : « purchased » rend Premium possédé, « pending » met un paiement en attente. */
  readonly buy?: BuyOutcome;
  /**
   * Issue de la restauration : `true` ou « owned » retrouve Premium ; `false` (défaut) rend l'état connu
   * du magasin (« owned » si Premium est déjà possédé, sinon « notFound ») ; « notFound » et
   * « unavailable » sont rendus tels quels.
   */
  readonly restore?: boolean | RestoreOutcome;
  /** Un paiement attend sa confirmation dès le démarrage. */
  readonly pending?: boolean;
  /**
   * Achat réussi : Premium possédé avant que `buy` rende la main (défaut) ; sinon juste après
   * (`setTimeout` 0), comme le vrai magasin dont le reçu suit la réponse.
   */
  readonly ownedOnBuy?: boolean;
}

/** Magasin : prix de Google Play avec espace insécable, comme en vrai (« 2,99 € »). */
export function fakePurchases({
  price = '2,99 €',
  available = true,
  owned = false,
  buy = 'purchased',
  restore = false,
  pending = false,
  ownedOnBuy = true,
}: FakePurchasesOptions = {}) {
  let report: ((owned: boolean) => void) | null = null;
  const listeners = new Set<() => void>();
  const state = { price, available, owned, pending };
  const notify = () => listeners.forEach((listener) => listener());
  const setOwned = (value: boolean) => {
    state.owned = value;
    report?.(value);
    // Paiement confirmé : il n'est plus en attente.
    if (value && state.pending) {
      state.pending = false;
      notify();
    }
  };
  const service = {
    start: vi.fn(async (onOwned: (owned: boolean) => void) => {
      report = onOwned;
      onOwned(state.owned);
    }),
    price: () => state.price,
    available: () => state.available && !state.pending,
    pending: () => state.pending,
    buy: vi.fn(async (): Promise<BuyOutcome> => {
      if (buy === 'purchased') {
        if (ownedOnBuy) setOwned(true);
        else setTimeout(() => setOwned(true), 0);
      } else if (buy === 'pending' && !state.pending) {
        state.pending = true;
        notify();
      }
      return buy;
    }),
    restore: vi.fn(async (): Promise<RestoreOutcome> => {
      const outcome: RestoreOutcome = restore === true ? 'owned' : restore === false ? (state.owned ? 'owned' : 'notFound') : restore;
      if (outcome === 'owned') setOwned(true);
      return outcome;
    }),
    refresh: vi.fn(async () => {}),
    onChange: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  } satisfies PurchaseService;
  return Object.assign(service, {
    /** Le magasin annonce un changement de possession (code promo échangé, paiement confirmé, remboursement…). */
    setOwned,
    /** Prix, disponibilité ou paiement en attente modifiés. */
    update(next: { readonly price?: string | null; readonly available?: boolean; readonly pending?: boolean }) {
      if (next.price !== undefined) state.price = next.price;
      if (next.available !== undefined) state.available = next.available;
      if (next.pending !== undefined) state.pending = next.pending;
      notify();
    },
  });
}
