/// <reference types="cordova-plugin-purchase" />
/**
 * Premium sur Google Play (cordova-plugin-purchase 13, API `CdvPurchase` globale après `deviceready`).
 *
 * Produit non consommable, sans serveur de validation : la possession vient des reçus locaux de
 * Google Play. Chaque achat approuvé est acquitté (`verify` puis `finish`), sinon Google le rembourse
 * sous 3 jours — y compris un code promo échangé dans le Play Store, qui arrive comme un achat ordinaire
 * (au démarrage, en cours de route ou à la relecture).
 *
 * Comportements du plugin (vérifiés dans son code) :
 * - `order()` se résout avant l'arrivée du reçu : le natif répond, puis envoie l'achat dans un second
 *   message (évalué à part par le pont Cordova de Capacitor). L'issue d'un achat attend donc le reçu ;
 * - les événements du magasin sont regroupés (500 ms) puis différés ;
 * - Google Play signale un paiement différé par `isPending` (état « initiated », jamais « pending ») ; un
 *   achat retiré (annulé, remboursé) passe à l'état « cancelled », sans événement ;
 * - `store.owned()` et `canPurchase` ne jugent que la plus ancienne transaction du produit et gardent la
 *   date d'expiration posée lors d'un retrait : la possession et l'attente sont donc calculées ici ;
 * - un produit déjà possédé échoue avec le code `PURCHASE` et le message natif `ITEM_ALREADY_OWNED` ;
 * - `restorePurchases()` relit les achats en silence (Google Play) et renvoie l'erreur sans lever ; il ne
 *   fait rien, sans le dire, si le magasin n'est pas prêt. `update()` ne relit que les produits ;
 * - le natif ne garde qu'un rappel en attente à la fois : achat et relectures ne se chevauchent pas ici.
 */
import type { BuyOutcome, PurchaseService, RestoreOutcome } from './purchases';
import { NO_PURCHASES } from './purchases';

/** Attente maximale du pont Cordova (`deviceready`) et de l'objet `CdvPurchase`. */
const DEVICE_READY_TIMEOUT_MS = 30_000;
/** Commande acceptée : attente maximale du reçu (au-delà : « en attente », le magasin confirmera). */
const RECEIPT_WAIT_MS = 8_000;
/** Garde-fou : un achat sans issue (rappel natif perdu…) libère l'interface au bout de ce délai. */
const BUY_GUARD_MS = 5 * 60_000;
/** Garde-fou : relecture des achats restée sans réponse. */
const REREAD_TIMEOUT_MS = 30_000;
/** Google Play : achat refusé, produit déjà possédé (code natif `ITEM_ALREADY_OWNED`). */
const ALREADY_OWNED = /ITEM_ALREADY_OWNED/;

type Cdv = typeof CdvPurchase;

const TIMED_OUT = Symbol('délai dépassé');

function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

function cdvPurchase(): Cdv | undefined {
  const cdv = (window as { CdvPurchase?: Cdv }).CdvPurchase;
  return cdv?.store ? cdv : undefined;
}

/**
 * `CdvPurchase` (créé par le plugin juste après son chargement : au plus tard peu après `deviceready`),
 * ou rien au bout de 30 s.
 */
function whenCdvPurchase(): Promise<Cdv | undefined> {
  const ready = cdvPurchase();
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const cdv = cdvPurchase();
      if (!cdv && Date.now() - startedAt < DEVICE_READY_TIMEOUT_MS) return;
      clearInterval(poll);
      document.removeEventListener('deviceready', onDeviceReady);
      resolve(cdv);
    };
    const onDeviceReady = () => setTimeout(check, 0);
    const poll = setInterval(check, 250);
    document.addEventListener('deviceready', onDeviceReady);
  });
}

interface ReceiptWatch {
  /** Se résout dès que le produit est possédé ou en attente de paiement, au plus tard après `ms`. */
  settled(ms: number): Promise<void>;
  stop(): void;
}

export async function createPlayPurchases(productId: string): Promise<PurchaseService> {
  const cdv = await whenCdvPurchase();
  if (!cdv) return NO_PURCHASES;
  const { store, ProductType, Platform, LogLevel, ErrorCode, TransactionState } = cdv;
  const platform = Platform.GOOGLE_PLAY;
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // un abonné défaillant n'empêche pas les autres
      }
    }
  };
  let report: ((owned: boolean) => void) | null = null;
  /** Liste des achats du compte reçue au moins une fois : « non possédé » devient une certitude. */
  let receiptsLoaded = false;
  let started: Promise<void> | null = null;

  const product = () => store.get(productId, platform);
  const ofProduct = (t: CdvPurchase.Transaction) => t.platform === platform && t.products.some((p) => p.id === productId);
  /** Achat retiré par Google Play (annulé, remboursé) : état « cancelled ». */
  const removed = (t: CdvPurchase.Transaction) => t.state === TransactionState.CANCELLED || t.isConsumed === true;
  /** Paiement différé (espèces, validation parentale…). */
  const waiting = (t: CdvPurchase.Transaction) => t.isPending === true || t.state === TransactionState.PENDING;
  /**
   * Un achat du produit ni retiré ni en attente. (Pas `store.owned()` : il ne juge que la plus ancienne
   * transaction du produit — un paiement différé annulé y masque l'achat suivant — et garde la date
   * d'expiration posée lors d'un retrait même quand l'achat réapparaît.)
   */
  const owned = () => store.localTransactions.some((t) => ofProduct(t) && !removed(t) && !waiting(t));
  const pending = () => !owned() && store.localTransactions.some((t) => ofProduct(t) && !removed(t) && waiting(t));

  /** Possession publiée seulement si elle est certaine ; prix, disponibilité ou paiement en attente notifiés. */
  const publish = () => {
    const has = owned();
    if (receiptsLoaded || has) report?.(has);
    changed();
  };

  store.verbosity = LogLevel.WARNING;
  store.register([{ id: productId, type: ProductType.NON_CONSUMABLE, platform }]);
  store
    .when()
    .productUpdated(changed)
    // Tout achat approuvé est acquitté, même fait hors de l'app (code promo) : sinon Google le rembourse.
    .approved((transaction) => void transaction.verify())
    .verified((receipt) => void receipt.finish())
    .pending(publish)
    .finished(publish)
    .receiptUpdated(publish)
    .receiptsReady(() => {
      receiptsLoaded = true;
      publish();
    });

  // Une opération native à la fois : le plugin Android ne garde qu'un rappel en attente, un second appel
  // détournerait la réponse du premier.
  let tail: Promise<unknown> = Promise.resolve();
  let busy = 0;
  function exclusive<T>(task: () => Promise<T>): Promise<T> {
    busy++;
    const run = tail.then(task).finally(() => {
      busy--;
    });
    tail = run.catch(() => {});
    return run;
  }

  /** Relit les achats du compte (requête silencieuse sur Google Play) ; vrai si le magasin a répondu. */
  async function reread(): Promise<boolean> {
    // Magasin pas prêt : `restorePurchases()` ne ferait rien, sans erreur.
    if (!store.getAdapter(platform)?.ready) return false;
    try {
      const error = await within(store.restorePurchases(), REREAD_TIMEOUT_MS);
      if (error === TIMED_OUT || error) return false;
    } catch {
      return false;
    }
    // La liste complète des achats arrive avant la réponse : reçus à jour, absence certaine.
    receiptsLoaded = true;
    publish();
    return true;
  }

  /** Écoute posée avant la commande : le reçu peut précéder la fin de `order()`. */
  function watchReceipt(): ReceiptWatch {
    let wake: (() => void) | null = null;
    const decided = () => owned() || pending();
    const onEvent = () => {
      if (decided()) wake?.();
    };
    store.when().receiptUpdated(onEvent).approved(onEvent).pending(onEvent).finished(onEvent);
    return {
      settled: (ms) =>
        new Promise<void>((resolve) => {
          if (decided()) return resolve();
          const timer = setTimeout(resolve, ms);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        }),
      stop: () => {
        wake = null;
        store.off(onEvent);
      },
    };
  }

  async function order(offer: CdvPurchase.Offer, watch: ReceiptWatch, attempt: { abandoned: boolean }): Promise<BuyOutcome> {
    let error: CdvPurchase.IError | undefined;
    try {
      error = await offer.order();
    } catch {
      return 'error';
    }
    if (!error) {
      // Commande acceptée : le reçu suit (possédé, ou paiement différé). Rien encore : le magasin confirmera.
      await watch.settled(RECEIPT_WAIT_MS);
      return owned() ? 'purchased' : 'pending';
    }
    if (error.code === ErrorCode.PAYMENT_CANCELLED) return 'cancelled';
    if (!ALREADY_OWNED.test(error.message) || attempt.abandoned) return 'error';
    // Déjà possédé (code promo, autre appareil, reçus pas encore lus) : le magasin le confirme.
    await reread();
    return owned() ? 'purchased' : pending() ? 'pending' : 'error';
  }

  async function buy(): Promise<BuyOutcome> {
    if (owned()) return 'purchased';
    if (pending()) return 'pending';
    const offer = product()?.getOffer();
    if (!offer) return 'error';
    const watch = watchReceipt();
    const attempt = { abandoned: false };
    try {
      const outcome = await within(order(offer, watch, attempt), BUY_GUARD_MS);
      if (outcome !== TIMED_OUT) return outcome;
      attempt.abandoned = true;
      return 'error';
    } finally {
      watch.stop();
    }
  }

  return {
    start(onOwned) {
      report = onOwned;
      started ??= Promise.resolve()
        .then(() => store.initialize([platform]))
        .then(
          () => publish(),
          () => {},
        );
      return started;
    },
    price: () => product()?.pricing?.price ?? null,
    available: () => {
      const p = product();
      // (Pas `p.canPurchase` : le plugin y tient pour toujours en attente un paiement différé annulé.)
      return p !== undefined && p.getOffer() !== undefined && !owned() && !pending();
    },
    pending,
    buy: () => exclusive(buy),
    restore: () =>
      exclusive(async (): Promise<RestoreOutcome> => {
        if (!(await reread())) return 'unavailable';
        return owned() ? 'owned' : 'notFound';
      }),
    async refresh() {
      // Achat ou restauration en cours : ils relisent déjà le magasin.
      if (busy > 0) return;
      await exclusive(reread);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
