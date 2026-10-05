import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayPurchases } from './purchases.native';
import { NO_PURCHASES, type PurchaseService } from './purchases';

const PRODUCT = 'griday_premium';
const GOOGLE_PLAY = 'android-playstore';

/** Achat tel que Google Play le connaît (côté natif). */
interface PlayPurchase {
  readonly purchaseToken: string;
  readonly productId: string;
  state: 'purchased' | 'pending';
  acknowledged: boolean;
  readonly purchaseTime: number;
}

type Callback = (value?: unknown) => void;
type OrderScript = 'purchased' | 'pending' | 'cancelled' | 'alreadyOwned' | 'error' | 'noReceipt' | 'silent';

interface Tx {
  readonly className: 'Transaction';
  readonly platform: string;
  readonly transactionId: string;
  readonly products: { id: string }[];
  readonly purchaseDate: Date;
  state: string;
  isPending: boolean;
  isAcknowledged: boolean;
  isConsumed?: boolean;
  expirationDate?: Date;
  readonly parentReceipt: Receipt;
  verify(): Promise<void>;
  finish(): Promise<void>;
}

interface Receipt {
  readonly className: 'Receipt';
  readonly platform: string;
  readonly purchaseToken: string;
  readonly transactions: Tx[];
}

/**
 * Faux `CdvPurchase` (Google Play), calqué sur cordova-plugin-purchase 13 et son code natif :
 * - chaque message natif est évalué à part (une tâche), dans l'ordre d'envoi ; un achat répond d'abord
 *   (`order()` se résout), puis envoie le reçu ; une relecture envoie la liste puis répond ;
 * - les reçus modifiés sont regroupés (500 ms) avant les événements, eux-mêmes différés ;
 * - paiement différé : `isPending`, état « initiated » ; achat retiré (annulé, remboursé) : état
 *   « cancelled » et date d'expiration passée, sans événement (date gardée si l'achat réapparaît) ;
 * - `owned()` et `canPurchase` ne jugent que la plus ancienne transaction du produit ;
 * - un même rappel enregistré deux fois fait lever, comme dans le plugin.
 */
function fakeCdvPurchase() {
  const ErrorCode = { SETUP: 6777001, LOAD: 6777002, PURCHASE: 6777003, PAYMENT_CANCELLED: 6777006, PAYMENT_NOT_ALLOWED: 6777008 };
  const TransactionState = { INITIATED: 'initiated', PENDING: 'pending', APPROVED: 'approved', CANCELLED: 'cancelled', FINISHED: 'finished', UNKNOWN_STATE: '' };
  const Platform = { GOOGLE_PLAY, TEST: 'test' };
  const ProductType = { CONSUMABLE: 'consumable', NON_CONSUMABLE: 'non consumable' };
  const LogLevel = { QUIET: 0, ERROR: 1, WARNING: 2, INFO: 3, DEBUG: 4 };

  /** Message natif → JS. */
  const message = (fn: () => void) => setTimeout(fn, 0);
  const storeError = (code: number, msg: string) => ({ isError: true as const, code, message: msg, platform: GOOGLE_PLAY, productId: PRODUCT });

  let seq = 0;
  const purchase = (state: PlayPurchase['state'], acknowledged = false): PlayPurchase => ({
    purchaseToken: `jeton-${++seq}`,
    productId: PRODUCT,
    state,
    acknowledged,
    purchaseTime: Date.now(),
  });

  // Côté natif (Google Play Billing).
  const play = {
    /** Achats du compte. */
    purchases: [] as PlayPurchase[],
    /** Issue des prochaines commandes. */
    order: 'purchased' as OrderScript,
    /** Connexion au service de facturation : jamais établie si faux. */
    connects: true,
    /** Produits chargés à l'initialisation (sinon : le plugin réessaie indéfiniment, hors ligne). */
    productsLoad: true,
    /** Prochaine relecture des achats : en erreur, ou sans réponse (rappel natif perdu). */
    readError: null as string | null,
    readSilent: false,
    reads: 0,
    acknowledge: vi.fn<(token: string) => void>(),
    purchase,
    /** Achat signalé par le natif hors commande (code promo échangé, paiement confirmé…). */
    push(p: PlayPurchase) {
      if (!play.purchases.includes(p)) play.purchases.push(p);
      message(() => onPurchasesUpdated([p]));
    },
  };

  // Rappels du magasin (Internal.Callbacks : double enregistrement refusé ; appels différés).
  const callbacks = new Map<string, Callback[]>();
  let receiptsReadyFired = false;
  const trigger = (name: string, value?: unknown) => {
    const list = callbacks.get(name) ?? [];
    if (name === 'receiptsReady') {
      receiptsReadyFired = true;
      callbacks.set(name, []);
    }
    for (const cb of list) setTimeout(() => cb(value), 0);
  };
  const when: Record<string, (cb: Callback) => typeof when> = {};
  for (const name of ['productUpdated', 'receiptUpdated', 'approved', 'pending', 'finished', 'initiated', 'verified', 'receiptsReady']) {
    when[name] = (cb) => {
      if (name === 'receiptsReady' && receiptsReadyFired) {
        setTimeout(() => cb(), 0);
        return when;
      }
      const list = callbacks.get(name) ?? [];
      if (list.includes(cb)) throw new Error('REGISTERING THE SAME CALLBACK TWICE? This is indicative of a bug in your integration.');
      callbacks.set(name, [...list, cb]);
      return when;
    };
  }

  // Adaptateur Google Play.
  const adapter = { id: GOOGLE_PLAY, ready: false };
  let initializeCalled = false;
  let productLoaded = false;
  const receipts: Receipt[] = [];

  const toState = (p: PlayPurchase, fromConstructor: boolean) =>
    p.state === 'pending' ? 'initiated' : p.acknowledged ? 'approved' : fromConstructor ? 'initiated' : 'approved';
  const refresh = (t: Tx, p: PlayPurchase, fromConstructor = false) => {
    t.isPending = p.state === 'pending';
    t.isAcknowledged = p.acknowledged;
    t.state = toState(p, fromConstructor);
  };
  const newReceipt = (p: PlayPurchase): Receipt => {
    const receipt: Receipt = { className: 'Receipt', platform: GOOGLE_PLAY, purchaseToken: p.purchaseToken, transactions: [] };
    const t: Tx = {
      className: 'Transaction',
      platform: GOOGLE_PLAY,
      transactionId: `GPA.${p.purchaseToken}`,
      products: [{ id: p.productId }],
      purchaseDate: new Date(p.purchaseTime),
      state: '',
      isPending: false,
      isAcknowledged: false,
      parentReceipt: receipt,
      // Sans serveur de validation : reçu tenu pour vérifié 200 ms plus tard.
      verify: async () => void setTimeout(() => trigger('verified', { sourceReceipt: receipt, finish: async () => finish(receipt) }), 200),
      finish: async () => finish(receipt),
    };
    refresh(t, p, true);
    receipt.transactions.push(t);
    return receipt;
  };

  // Regroupement des reçus modifiés (StoreAdapterListener.receiptsUpdated).
  let toProcess: Receipt[] = [];
  let processor: ReturnType<typeof setTimeout> | undefined;
  const lastState = new Map<string, string>();
  const lastApproved = new Map<string, number>();
  const receiptsUpdated = (receipt: Receipt) => {
    if (!toProcess.includes(receipt)) toProcess.push(receipt);
    clearTimeout(processor);
    processor = setTimeout(() => {
      const list = toProcess;
      toProcess = [];
      for (const r of list) {
        trigger('receiptUpdated', r);
        for (const t of r.transactions) {
          if (t.state === 'approved') {
            if (Date.now() - (lastApproved.get(t.transactionId) ?? -Infinity) > 60_000) {
              lastApproved.set(t.transactionId, Date.now());
              trigger('approved', t);
            }
          } else if (lastState.get(t.transactionId) !== t.state) {
            if (t.state === 'initiated') trigger('initiated', t);
            else if (t.state === 'finished') trigger('finished', t);
            else if (t.state === 'pending') trigger('pending', t);
          }
          lastState.set(t.transactionId, t.state);
        }
      }
    }, 500);
  };

  /** GooglePlay.Adapter.onPurchasesUpdated : les reçus absents de la liste sont retirés (sans événement). */
  function onPurchasesUpdated(list: PlayPurchase[]) {
    for (const r of receipts) {
      if (list.some((p) => p.purchaseToken === r.purchaseToken)) continue;
      for (const t of r.transactions) {
        // Transaction.removed() : `renewalIntent` toujours fourni par le natif, d'où une expiration passée.
        t.expirationDate = new Date(Date.now() - 60_000);
        t.state = 'cancelled';
      }
    }
    for (const p of list) {
      const existing = receipts.find((r) => r.purchaseToken === p.purchaseToken);
      if (existing) {
        refresh(existing.transactions[0]!, p);
        receiptsUpdated(existing);
        continue;
      }
      const receipt = newReceipt(p);
      receipts.push(receipt);
      receiptsUpdated(receipt);
      const t = receipt.transactions[0]!;
      if (t.state === 'initiated' && !t.isPending) {
        refresh(t, p);
        receiptsUpdated(receipt);
      }
    }
  }

  /** Acquittement natif, puis réponse : transaction « finished ». */
  function finish(receipt: Receipt) {
    for (const t of receipt.transactions) {
      if (t.isAcknowledged) continue;
      message(() => {
        const p = play.purchases.find((x) => x.purchaseToken === receipt.purchaseToken);
        if (p) p.acknowledged = true;
        play.acknowledge(receipt.purchaseToken);
        message(() => {
          if (t.state === 'finished') return;
          t.state = 'finished';
          receiptsUpdated(receipt);
        });
      });
    }
  }

  /** Relecture native : la liste des achats (`setPurchases`) puis la réponse, deux messages dans cet ordre. */
  function getPurchases(): Promise<ReturnType<typeof storeError> | undefined> {
    play.reads++;
    return new Promise((resolve) => {
      if (play.readSilent) return;
      message(() => {
        if (play.readError) {
          resolve(storeError(ErrorCode.LOAD, play.readError));
          return;
        }
        onPurchasesUpdated([...play.purchases]);
        message(() => resolve(undefined));
      });
    });
  }

  const find = () => {
    let found: Tx | undefined;
    for (const r of receipts) {
      for (const t of r.transactions) {
        if (!t.products.some((p) => p.id === PRODUCT)) continue;
        if (!found || t.purchaseDate < found.purchaseDate) found = t;
      }
    }
    return found;
  };
  /** LocalReceipts.isOwned / canPurchase (plus ancienne transaction du produit). */
  const isOwned = () => {
    const t = find();
    if (!t || t.isConsumed || t.isPending) return false;
    return !t.expirationDate || t.expirationDate.getTime() > Date.now();
  };
  const canPurchase = () => {
    const t = find();
    if (!t || t.isConsumed) return true;
    if (t.isPending) return false;
    return !!t.expirationDate && t.expirationDate.getTime() <= Date.now();
  };

  const orderPlaced = vi.fn<() => void>();
  const order = (): Promise<ReturnType<typeof storeError> | undefined> => {
    if (!adapter.ready) return Promise.resolve(storeError(ErrorCode.PAYMENT_NOT_ALLOWED, 'Adapter not found or not ready'));
    orderPlaced();
    const script = play.order;
    return new Promise((resolve) => {
      if (script === 'silent') return;
      message(() => {
        if (script === 'cancelled') return resolve(storeError(ErrorCode.PAYMENT_CANCELLED, 'USER_CANCELED'));
        if (script === 'alreadyOwned') return resolve(storeError(ErrorCode.PURCHASE, 'ITEM_ALREADY_OWNED'));
        if (script === 'error') return resolve(storeError(ErrorCode.PURCHASE, 'SERVICE_UNAVAILABLE'));
        // callSuccess() puis sendToListener("purchasesUpdated") : la réponse précède le reçu.
        resolve(undefined);
        if (script === 'noReceipt') return;
        const p = purchase(script === 'pending' ? 'pending' : 'purchased');
        play.purchases.push(p);
        message(() => onPurchasesUpdated([p]));
      });
    });
  };
  const offer = { id: PRODUCT, productId: PRODUCT, platform: GOOGLE_PLAY, order };
  const product = {
    id: PRODUCT,
    platform: GOOGLE_PLAY,
    type: ProductType.NON_CONSUMABLE,
    pricing: { price: '2,99 €', currency: 'EUR', priceMicros: 2_990_000 },
    offers: [offer],
    get canPurchase() {
      return adapter.ready && canPurchase();
    },
    getOffer: () => offer,
  };

  const store = {
    verbosity: LogLevel.ERROR,
    register: vi.fn(),
    when: () => when,
    off: (cb: Callback) => {
      for (const [name, list] of callbacks) callbacks.set(name, list.filter((x) => x !== cb));
    },
    initialize: vi.fn(async () => {
      initializeCalled = true;
      if (!play.connects) await new Promise(() => {}); // init en échec : le plugin ne s'en relève pas
      await new Promise<void>((resolve) => message(resolve));
      adapter.ready = true;
      if (!play.productsLoad) await new Promise(() => {});
      await new Promise<void>((resolve) => message(resolve));
      productLoaded = true;
      trigger('productUpdated', product);
      await getPurchases();
      trigger('receiptsReady');
      return [];
    }),
    update: vi.fn(async () => {}),
    get isReady() {
      return adapter.ready && productLoaded;
    },
    getAdapter: (platform: string) => (initializeCalled && platform === GOOGLE_PLAY ? adapter : undefined),
    get: (id: string, platform?: string) => (adapter.ready && productLoaded && id === PRODUCT && (!platform || platform === GOOGLE_PLAY) ? product : undefined),
    owned: ({ id }: { id: string }) => id === PRODUCT && isOwned(),
    get localReceipts() {
      return receipts;
    },
    get localTransactions() {
      return receipts.flatMap((r) => r.transactions);
    },
    findInLocalReceipts: (p: { id: string }) => (p.id === PRODUCT ? find() : undefined),
    /** Ne fait rien (sans erreur) si aucun adaptateur n'est prêt. */
    restorePurchases: vi.fn(async () => (adapter.ready ? getPurchases() : undefined)),
  };

  return { store, ProductType, Platform, LogLevel, ErrorCode, TransactionState, play, orderPlaced };
}

let cdv: ReturnType<typeof fakeCdvPurchase>;
const win = window as unknown as { CdvPurchase?: unknown };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  cdv = fakeCdvPurchase();
  win.CdvPurchase = cdv;
});
afterEach(() => {
  delete win.CdvPurchase;
  vi.useRealTimers();
});

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** Issue d'une promesse, lisible sans l'attendre. */
function track<T>(promise: Promise<T>) {
  const state: { done: boolean; value?: T } = { done: false };
  void promise.then((value) => {
    state.done = true;
    state.value = value;
  });
  return state;
}

/** Service démarré : magasin initialisé, reçus lus, événements regroupés passés. */
async function started() {
  const onOwned = vi.fn<(owned: boolean) => void>();
  const changed = vi.fn();
  const service = await createPlayPurchases(PRODUCT);
  service.onChange(changed);
  void service.start(onOwned);
  await advance(1_000);
  return { service, onOwned, changed };
}

/** Premium sur le compte, déjà acquitté (acheté plus tôt). */
const alreadyBought = () => cdv.play.purchases.push(cdv.play.purchase('purchased', true));

describe('démarrage', () => {
  it('reçus lus : possession publiée (« non possédé » compris), prix et achat possible', async () => {
    const { service, onOwned } = await started();
    expect(cdv.store.register).toHaveBeenCalledWith([{ id: PRODUCT, type: 'non consumable', platform: GOOGLE_PLAY }]);
    expect(cdv.store.initialize).toHaveBeenCalledExactlyOnceWith([GOOGLE_PLAY]);
    expect(onOwned).toHaveBeenLastCalledWith(false);
    expect(service.price()).toBe('2,99 €');
    expect(service.available()).toBe(true);
    expect(service.pending()).toBe(false);
  });

  it('Premium déjà possédé : publié, achat indisponible', async () => {
    alreadyBought();
    const { service, onOwned } = await started();
    expect(onOwned).toHaveBeenLastCalledWith(true);
    expect(onOwned).not.toHaveBeenCalledWith(false);
    expect(service.available()).toBe(false);
  });

  it('CdvPurchase créé juste après deviceready : attendu', async () => {
    delete win.CdvPurchase;
    const service = track(createPlayPurchases(PRODUCT));
    await advance(5_000);
    expect(service.done).toBe(false);
    win.CdvPurchase = cdv;
    document.dispatchEvent(new Event('deviceready'));
    await advance(0);
    expect(service.done).toBe(true);
    expect(service.value).not.toBe(NO_PURCHASES);
  });

  it('CdvPurchase toujours absent après 30 s : magasin indisponible', async () => {
    delete win.CdvPurchase;
    const service = track(createPlayPurchases(PRODUCT));
    await advance(29_000);
    expect(service.done).toBe(false);
    await advance(1_000);
    expect(service.value).toBe(NO_PURCHASES);
  });
});

describe('achat', () => {
  it('« purchased » une fois le reçu arrivé (order se résout avant lui), puis acquitté', async () => {
    const { service, onOwned } = await started();
    onOwned.mockClear();
    const ownedWhenDone: boolean[] = [];
    const result = track(
      service.buy().then((outcome) => {
        ownedWhenDone.push(onOwned.mock.calls.at(-1)?.[0] ?? false);
        return outcome;
      }),
    );
    // Réponse native puis reçu : à ce stade, l'achat n'est pas encore dans les reçus.
    await advance(0);
    expect(cdv.orderPlaced).toHaveBeenCalledTimes(1);
    expect(result.done).toBe(false);
    await advance(1_000);
    expect(result.value).toBe('purchased');
    // Premium était déjà publié quand l'achat a rendu la main.
    expect(ownedWhenDone).toEqual([true]);
    await advance(1_000);
    expect(cdv.play.acknowledge).toHaveBeenCalledTimes(1);
    expect(service.available()).toBe(false);
  });

  it('paiement différé : « pending », pending() vrai et achat indisponible ; confirmé : Premium et acquittement', async () => {
    cdv.play.order = 'pending';
    const { service, onOwned, changed } = await started();
    changed.mockClear();
    const result = track(service.buy());
    await advance(1_000);
    expect(result.value).toBe('pending');
    expect(service.pending()).toBe(true);
    expect(service.available()).toBe(false);
    expect(changed).toHaveBeenCalled();
    expect(onOwned).not.toHaveBeenCalledWith(true);
    // Un second appel n'ouvre pas une nouvelle commande.
    await expect(service.buy()).resolves.toBe('pending');
    expect(cdv.orderPlaced).toHaveBeenCalledTimes(1);

    // Paiement confirmé (espèces versées) : le natif signale l'achat.
    const p = cdv.play.purchases[0]!;
    p.state = 'purchased';
    changed.mockClear();
    cdv.play.push(p);
    await advance(2_000);
    expect(onOwned).toHaveBeenLastCalledWith(true);
    expect(service.pending()).toBe(false);
    expect(changed).toHaveBeenCalled();
    expect(cdv.play.acknowledge).toHaveBeenCalledWith(p.purchaseToken);
  });

  it('paiement différé puis annulé (retiré à la relecture) : plus en attente', async () => {
    cdv.play.order = 'pending';
    const { service, onOwned } = await started();
    const result = track(service.buy());
    await advance(1_000);
    expect(result.value).toBe('pending');
    cdv.play.purchases = [];
    const refreshed = track(service.refresh());
    await advance(1_000);
    expect(refreshed.done).toBe(true);
    expect(service.pending()).toBe(false);
    expect(service.available()).toBe(true);
    expect(onOwned).toHaveBeenLastCalledWith(false);

    // Nouveau paiement différé : en attente, même si le plugin juge sur l'ancienne transaction (annulée).
    const again = track(service.buy());
    await advance(1_000);
    expect(again.value).toBe('pending');
    expect(service.pending()).toBe(true);
    expect(service.available()).toBe(false);
  });

  it('paiement différé annulé puis nouvel achat dans la même session : « purchased » (que le plugin ne voit pas)', async () => {
    cdv.play.order = 'pending';
    const { service, onOwned } = await started();
    const first = track(service.buy());
    await advance(1_000);
    expect(first.value).toBe('pending');
    cdv.play.purchases = [];
    void service.refresh();
    await advance(1_000);

    cdv.play.order = 'purchased';
    const second = track(service.buy());
    await advance(1_000);
    expect(second.value).toBe('purchased');
    expect(onOwned).toHaveBeenLastCalledWith(true);
    expect(service.pending()).toBe(false);
    expect(service.available()).toBe(false);
    // Le plugin juge sur la plus ancienne transaction (le paiement annulé).
    expect(cdv.store.owned({ id: PRODUCT })).toBe(false);
  });

  it('annulé : « cancelled »', async () => {
    cdv.play.order = 'cancelled';
    const { service, onOwned } = await started();
    const result = track(service.buy());
    await advance(1_000);
    expect(result.value).toBe('cancelled');
    expect(onOwned).not.toHaveBeenCalledWith(true);
  });

  it('erreur du magasin : « error »', async () => {
    cdv.play.order = 'error';
    const { service } = await started();
    const result = track(service.buy());
    await advance(1_000);
    expect(result.value).toBe('error');
  });

  it('déjà possédé (ITEM_ALREADY_OWNED : code promo, autre appareil) : relecture puis « purchased »', async () => {
    const { service, onOwned } = await started();
    // Acheté ailleurs depuis le démarrage : inconnu des reçus locaux.
    alreadyBought();
    cdv.play.order = 'alreadyOwned';
    const reads = cdv.play.reads;
    const result = track(service.buy());
    await advance(1_000);
    expect(result.value).toBe('purchased');
    expect(cdv.play.reads).toBe(reads + 1);
    expect(onOwned).toHaveBeenLastCalledWith(true);
  });

  it('commande acceptée sans reçu dans les 8 s : « pending » (le magasin confirmera)', async () => {
    cdv.play.order = 'noReceipt';
    const { service } = await started();
    const result = track(service.buy());
    await advance(7_999);
    expect(result.done).toBe(false);
    await advance(1);
    expect(result.value).toBe('pending');
  });

  it('garde de 5 min : commande sans réponse, « error » ; les opérations suivantes ne sont pas bloquées', async () => {
    cdv.play.order = 'silent';
    const { service } = await started();
    const result = track(service.buy());
    await advance(5 * 60_000 - 1);
    expect(result.done).toBe(false);
    await advance(1);
    expect(result.value).toBe('error');

    const restored = track(service.restore());
    await advance(1_000);
    expect(restored.value).toBe('notFound');
  });

  it('produit pas encore chargé : « error », sans commande', async () => {
    cdv.play.productsLoad = false;
    const { service } = await started();
    expect(service.price()).toBeNull();
    expect(service.available()).toBe(false);
    await expect(service.buy()).resolves.toBe('error');
    expect(cdv.orderPlaced).not.toHaveBeenCalled();
  });
});

describe('restauration', () => {
  it('Premium retrouvé : « owned » et publié', async () => {
    const { service, onOwned } = await started();
    alreadyBought();
    const result = track(service.restore());
    await advance(1_000);
    expect(result.value).toBe('owned');
    expect(onOwned).toHaveBeenLastCalledWith(true);
  });

  it('aucun achat sur le compte : « notFound »', async () => {
    const { service } = await started();
    const result = track(service.restore());
    await advance(1_000);
    expect(result.value).toBe('notFound');
  });

  it('produit pas encore chargé (hors ligne au démarrage) : restauration possible quand même', async () => {
    cdv.play.productsLoad = false;
    alreadyBought();
    const { service, onOwned } = await started();
    expect(service.price()).toBeNull();
    const result = track(service.restore());
    await advance(1_000);
    expect(result.value).toBe('owned');
    expect(onOwned).toHaveBeenLastCalledWith(true);
  });

  it('erreur renvoyée par le magasin (sans lever) : « unavailable »', async () => {
    const { service } = await started();
    cdv.play.readError = 'Failed to query purchases: 2';
    const result = track(service.restore());
    await advance(1_000);
    expect(result.value).toBe('unavailable');
  });

  it('magasin pas prêt (pas démarré, ou connexion jamais établie) : « unavailable », sans relecture', async () => {
    const service = await createPlayPurchases(PRODUCT);
    await expect(service.restore()).resolves.toBe('unavailable');

    cdv.play.connects = false;
    void service.start(vi.fn());
    await advance(1_000);
    await expect(service.restore()).resolves.toBe('unavailable');
    expect(cdv.store.restorePurchases).not.toHaveBeenCalled();
    expect(service.available()).toBe(false);
  });

  it('relecture sans réponse : « unavailable » après 30 s', async () => {
    const { service } = await started();
    cdv.play.readSilent = true;
    const result = track(service.restore());
    await advance(29_999);
    expect(result.done).toBe(false);
    await advance(1);
    expect(result.value).toBe('unavailable');
  });
});

describe('achats hors de l’app et relecture silencieuse', () => {
  it('code promo échangé dans le Play Store : acquitté et Premium publié', async () => {
    const { service, onOwned } = await started();
    const promo = cdv.play.purchase('purchased');
    cdv.play.push(promo);
    await advance(2_000);
    expect(cdv.play.acknowledge).toHaveBeenCalledExactlyOnceWith(promo.purchaseToken);
    expect(onOwned).toHaveBeenLastCalledWith(true);
    expect(service.available()).toBe(false);
  });

  it('code promo échangé app fermée : acquitté au démarrage', async () => {
    cdv.play.purchases.push(cdv.play.purchase('purchased'));
    const { onOwned } = await started();
    await advance(1_000);
    expect(cdv.play.acknowledge).toHaveBeenCalledTimes(1);
    expect(onOwned).toHaveBeenLastCalledWith(true);
  });

  it('remboursement constaté à la relecture : onOwned(false)', async () => {
    alreadyBought();
    const { service, onOwned } = await started();
    expect(onOwned).toHaveBeenLastCalledWith(true);
    cdv.play.purchases = [];
    const done = track(service.refresh());
    await advance(1_000);
    expect(done.done).toBe(true);
    expect(onOwned).toHaveBeenLastCalledWith(false);
    expect(cdv.store.update).not.toHaveBeenCalled();
  });

  it('achat absent d’une relecture puis revenu : Premium de nouveau publié', async () => {
    alreadyBought();
    const bought = cdv.play.purchases[0]!;
    const { service, onOwned } = await started();
    cdv.play.purchases = [];
    void service.refresh();
    await advance(1_000);
    expect(onOwned).toHaveBeenLastCalledWith(false);
    cdv.play.purchases = [bought];
    void service.refresh();
    await advance(1_000);
    expect(onOwned).toHaveBeenLastCalledWith(true);
    expect(service.available()).toBe(false);
    // Le plugin garde la date d'expiration posée lors du retrait.
    expect(cdv.store.owned({ id: PRODUCT })).toBe(false);
  });

  it('relecture en échec ou magasin pas prêt : sans erreur, rien de publié', async () => {
    const service = await createPlayPurchases(PRODUCT);
    await expect(service.refresh()).resolves.toBeUndefined();

    const { service: ready, onOwned } = await started();
    onOwned.mockClear();
    cdv.play.readError = 'Failed to query purchases: 2';
    const done = track(ready.refresh());
    await advance(1_000);
    expect(done.done).toBe(true);
    expect(onOwned).not.toHaveBeenCalled();
  });

  it('pendant un achat : relecture ignorée (le natif ne suit qu’un appel à la fois)', async () => {
    cdv.play.order = 'silent';
    const { service } = await started();
    const reads = cdv.play.reads;
    void service.buy();
    await advance(0);
    await expect(service.refresh()).resolves.toBeUndefined();
    expect(cdv.play.reads).toBe(reads);
  });

  it('restauration pendant un achat : attend la fin de l’achat', async () => {
    const { service } = await started();
    const bought = track(service.buy());
    const restored = track(service.restore());
    await advance(0);
    expect(cdv.store.restorePurchases).not.toHaveBeenCalled();
    await advance(2_000);
    expect(bought.value).toBe('purchased');
    expect(restored.value).toBe('owned');
  });
});

describe('abonnements', () => {
  it('onChange : désabonnement', async () => {
    const service: PurchaseService = await createPlayPurchases(PRODUCT);
    const changed = vi.fn();
    const off = service.onChange(changed);
    off();
    void service.start(vi.fn());
    await advance(1_000);
    expect(changed).not.toHaveBeenCalled();
  });
});
