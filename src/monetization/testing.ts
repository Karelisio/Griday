/**
 * Services de monétisation factices pour les tests : à brancher avec `setAdsServiceForTesting` et
 * `setPurchaseServiceForTesting` (puis à remettre à `null`). Chaque méthode est un `vi.fn` observable.
 */
import { vi } from 'vitest';
import type { AdsService, RewardOutcome } from './ads';
import type { BuyOutcome, PurchaseService } from './purchases';

/** Annonces : la vidéo avec récompense se termine par `outcome` ; `privacyOptions` : choix de confidentialité exigés. */
export function fakeAds(outcome: RewardOutcome = 'rewarded', { privacyOptions = false }: { readonly privacyOptions?: boolean } = {}) {
  return {
    start: vi.fn(async () => {}),
    showRewarded: vi.fn(async (): Promise<RewardOutcome> => outcome),
    showInterstitial: vi.fn(async () => true),
    privacyOptionsRequired: vi.fn(() => privacyOptions),
    showPrivacyOptions: vi.fn(async () => {}),
  } satisfies AdsService;
}

export interface FakePurchasesOptions {
  /** Prix localisé (null : produit pas encore chargé). */
  readonly price?: string | null;
  /** Achat possible maintenant (magasin prêt, produit chargé). */
  readonly available?: boolean;
  /** Premium déjà possédé au démarrage. */
  readonly owned?: boolean;
  /** Issue de l'achat ; « purchased » rend Premium possédé. */
  readonly buy?: BuyOutcome;
  /** La restauration retrouve Premium. */
  readonly restore?: boolean;
}

/** Magasin : prix de Google Play avec espace insécable, comme en vrai (« 2,99 € »). */
export function fakePurchases({ price = '2,99 €', available = true, owned = false, buy = 'purchased', restore = false }: FakePurchasesOptions = {}) {
  let report: ((owned: boolean) => void) | null = null;
  const listeners = new Set<() => void>();
  const state = { price, available, owned };
  const setOwned = (value: boolean) => {
    state.owned = value;
    report?.(value);
  };
  const service = {
    start: vi.fn(async (onOwned: (owned: boolean) => void) => {
      report = onOwned;
      onOwned(state.owned);
    }),
    price: () => state.price,
    available: () => state.available,
    buy: vi.fn(async (): Promise<BuyOutcome> => {
      if (buy === 'purchased') setOwned(true);
      return buy;
    }),
    restore: vi.fn(async () => {
      if (restore) setOwned(true);
      return state.owned;
    }),
    onChange: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  } satisfies PurchaseService;
  return Object.assign(service, {
    /** Le magasin annonce un changement de possession (code promo échangé, remboursement…). */
    setOwned,
    /** Prix ou disponibilité modifiés. */
    update(next: { readonly price?: string | null; readonly available?: boolean }) {
      if (next.price !== undefined) state.price = next.price;
      if (next.available !== undefined) state.available = next.available;
      listeners.forEach((listener) => listener());
    },
  });
}
