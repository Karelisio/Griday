/**
 * Achat Premium : interface commune et choix de l'implémentation (Google Play via
 * cordova-plugin-purchase sur Android ; indisponible ailleurs).
 */
import { isNativeAndroid } from '../platform';
import { ADS_ENABLED, PREMIUM_PRODUCT_ID } from './config';

export type BuyOutcome = 'purchased' | 'pending' | 'cancelled' | 'error';
/** Restauration : Premium retrouvé, aucun achat sur ce compte, ou magasin injoignable (hors ligne…). */
export type RestoreOutcome = 'owned' | 'notFound' | 'unavailable';

export interface PurchaseService {
  /**
   * Connexion au magasin. `onOwned` reçoit l'état de possession chaque fois que le magasin le
   * connaît avec certitude (démarrage, achat, code promo échangé, remboursement).
   */
  start(onOwned: (owned: boolean) => void): Promise<void>;
  /** Prix localisé (« 2,99 € »), null tant que le produit n'est pas chargé. */
  price(): string | null;
  /** Achat possible maintenant (magasin prêt, produit chargé, aucun paiement en attente). */
  available(): boolean;
  /** Un paiement attend sa confirmation (espèces, validation parentale…) : Premium s'activera ensuite. */
  pending(): boolean;
  /**
   * Achat : se résout une fois l'issue connue (reçu du magasin), y compris pour un paiement différé
   * (« pending ») ; un produit déjà possédé (code promo, autre appareil) compte comme acheté.
   */
  buy(): Promise<BuyOutcome>;
  /** Relit les achats du compte Google Play. */
  restore(): Promise<RestoreOutcome>;
  /** Relecture silencieuse (retour au premier plan) : remboursement, code promo échangé ailleurs. */
  refresh(): Promise<void>;
  /** Prix, disponibilité ou paiement en attente modifiés. Renvoie la fonction de désabonnement. */
  onChange(listener: () => void): () => void;
}

export const NO_PURCHASES: PurchaseService = {
  start: async () => {},
  price: () => null,
  available: () => false,
  pending: () => false,
  buy: async () => 'error',
  restore: async () => 'unavailable',
  refresh: async () => {},
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
