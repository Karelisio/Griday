/// <reference types="cordova-plugin-purchase" />
/**
 * Premium sur Google Play (cordova-plugin-purchase, API `CdvPurchase` globale après `deviceready`).
 *
 * Produit non consommable, sans serveur de validation : la possession vient des reçus locaux de
 * Google Play. Chaque achat approuvé est acquitté (`finish`), sinon Google le rembourse sous 3 jours.
 * Les codes promo échangés dans le Play Store arrivent comme des achats ordinaires (au démarrage
 * ou en cours de route).
 */
import type { BuyOutcome, PurchaseService } from './purchases';
import { NO_PURCHASES } from './purchases';

/** Attente maximale du pont Cordova. */
const DEVICE_READY_TIMEOUT_MS = 10_000;

function cdvPurchase(): typeof CdvPurchase | undefined {
  return (window as { CdvPurchase?: typeof CdvPurchase }).CdvPurchase;
}

function deviceReady(): Promise<void> {
  if (cdvPurchase()) return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('deviceready', () => resolve(), { once: true });
    setTimeout(resolve, DEVICE_READY_TIMEOUT_MS);
  });
}

export async function createPlayPurchases(productId: string): Promise<PurchaseService> {
  await deviceReady();
  const cdv = cdvPurchase();
  if (!cdv) return NO_PURCHASES;
  const { store, ProductType, Platform, LogLevel, ErrorCode } = cdv;
  const platform = Platform.GOOGLE_PLAY;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());
  let report: ((owned: boolean) => void) | null = null;
  let receiptsLoaded = false;
  let started: Promise<void> | null = null;

  const product = () => store.get(productId, platform);
  const owned = () => store.owned({ id: productId, platform });
  /** Possession certaine seulement une fois les reçus chargés (sinon « faux » ne veut rien dire). */
  const publish = () => {
    if (receiptsLoaded || owned()) report?.(owned());
    changed();
  };

  store.verbosity = LogLevel.WARNING;
  store.register([{ id: productId, type: ProductType.NON_CONSUMABLE, platform }]);
  store
    .when()
    .productUpdated(changed)
    .approved((transaction) => void transaction.verify())
    .verified((receipt) => void receipt.finish())
    .finished(publish)
    .receiptUpdated(publish)
    .receiptsReady(() => {
      receiptsLoaded = true;
      publish();
    });

  return {
    start(onOwned) {
      report = onOwned;
      started ??= store.initialize([platform]).then(
        () => publish(),
        () => {},
      );
      return started;
    },
    price: () => product()?.pricing?.price ?? null,
    available: () => {
      const p = product();
      return p !== undefined && p.canPurchase && p.getOffer() !== undefined;
    },
    async buy(): Promise<BuyOutcome> {
      const offer = product()?.getOffer();
      if (!offer) return 'error';
      const error = await offer.order();
      if (error) return error.code === ErrorCode.PAYMENT_CANCELLED ? 'cancelled' : 'error';
      if (owned()) return 'purchased';
      // Paiement différé (espèces, validation parentale…) : l'achat arrivera plus tard.
      const p = product();
      return p && store.findInLocalReceipts(p)?.isPending ? 'pending' : 'purchased';
    },
    async restore() {
      await store.restorePurchases();
      publish();
      return owned();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
