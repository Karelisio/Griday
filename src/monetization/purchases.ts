/**
 * Achat Premium : interface commune et choix de l'implémentation (Google Play via
 * cordova-plugin-purchase sur Android ; indisponible ailleurs).
 */
import { isNativeAndroid } from '../platform';
import { ADS_ENABLED, PREMIUM_PRODUCT_ID } from './config';

export type BuyOutcome = 'purchased' | 'pending' | 'cancelled' | 'error';

export interface PurchaseService {
  /**
   * Connexion au magasin. `onOwned` reçoit l'état de possession chaque fois que le magasin le
   * connaît avec certitude (démarrage, achat, code promo échangé, remboursement).
   */
  start(onOwned: (owned: boolean) => void): Promise<void>;
  /** Prix localisé (« 2,99 € »), null tant que le produit n'est pas chargé. */
  price(): string | null;
  /** Achat possible maintenant (magasin prêt, produit chargé). */
  available(): boolean;
  buy(): Promise<BuyOutcome>;
  /** Relit les achats du compte Google Play ; vrai si Premium est possédé. */
  restore(): Promise<boolean>;
  /** Prix ou disponibilité modifiés. Renvoie la fonction de désabonnement. */
  onChange(listener: () => void): () => void;
}

export const NO_PURCHASES: PurchaseService = {
  start: async () => {},
  price: () => null,
  available: () => false,
  buy: async () => 'error',
  restore: async () => false,
  onChange: () => () => {},
};

let override: PurchaseService | null = null;

/** Tests : remplace l'implémentation (null : retour au choix normal). */
export function setPurchaseServiceForTesting(service: PurchaseService | null): void {
  override = service;
}

let native: Promise<PurchaseService> | null = null;

export function getPurchaseService(): Promise<PurchaseService> {
  if (override) return Promise.resolve(override);
  if (!ADS_ENABLED || !isNativeAndroid()) return Promise.resolve(NO_PURCHASES);
  native ??= import('./purchases.native').then((m) => m.createPlayPurchases(PREMIUM_PRODUCT_ID), () => NO_PURCHASES);
  return native;
}
