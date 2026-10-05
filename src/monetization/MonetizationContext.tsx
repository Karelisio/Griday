/**
 * Monétisation côté React : Premium (achat Google Play, état mis en cache), consentement et
 * annonces AdMob, dialogue des vidéos avec récompense, interstitiels aux transitions.
 *
 * En Premium ou dans un build sans publicité (`VITE_ADS=false`), tout est débloqué et aucune
 * annonce n'est jamais chargée. Hors fournisseur (tests de composants isolés), même comportement.
 *
 * Interstitiel : une partie résolue le rend dû (un après le puzzle du jour, un toutes les N parties
 * illimitées) ; il n'est montré qu'à la transition suivante voulue par le joueur (changement d'onglet,
 * page ouverte, nouvelle grille), app au premier plan, sans dialogue ouvert ni vidéo récente.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ISODate } from '../../engine/core/date';
import { onAppActiveChange, pushBackHandler } from '../platform';
import { loadJSON, saveJSON } from '../platform/storage';
import { Button, CircularProgress, Dialog, useSnackbar, type IconName } from '../ui';
import { NO_ADS, getAdsService, type AdsService, type RewardOutcome } from './ads';
import { ADS_ENABLED, FREE_ARCHIVE_DAYS, FREE_HINTS_PER_PUZZLE, INTERSTITIAL_AFTER_REWARD_MS } from './config';
import { NO_PURCHASES, getPurchaseService, type BuyOutcome, type PurchaseService, type RestoreOutcome } from './purchases';
import { onSolved, type SolvedEvent } from './rules';
import { MONETIZATION_KEY, decodeMonetization, encodeMonetization, withUnlocked, type MonetizationState } from './state';
import './monetization.css';

export type RewardKind = 'hint' | 'archive' | 'freeze';

export interface MonetizationValue {
  /** État lu du stockage (avant : Premium et déblocages encore inconnus). */
  readonly ready: boolean;
  /** Build avec publicités et achat Premium. */
  readonly adsEnabled: boolean;
  readonly premium: boolean;
  /** Tout est débloqué, sans annonce : Premium, ou build sans publicité. */
  readonly unlimited: boolean;
  /** Jours d'archive débloqués par une vidéo. */
  readonly unlocked: ReadonlySet<ISODate>;
  /** Dernier gel de série offert. */
  readonly freezeClaimedOn: ISODate | null;
  /** Prix localisé de Premium (null : magasin indisponible). */
  readonly price: string | null;
  readonly purchaseAvailable: boolean;
  /** Un paiement Premium attend sa confirmation (espèces, validation parentale…). */
  readonly purchasePending: boolean;
  readonly buyPremium: () => Promise<BuyOutcome>;
  readonly restorePurchases: () => Promise<RestoreOutcome>;
  /** Choix de confidentialité publicitaires à proposer dans les réglages (UMP). */
  readonly privacyOptionsRequired: boolean;
  readonly showPrivacyOptions: () => Promise<void>;
  /** Propose une vidéo pour `kind` ; vrai si la récompense est acquise (toujours, en illimité). */
  readonly requestReward: (kind: RewardKind) => Promise<boolean>;
  readonly unlockArchive: (date: ISODate) => void;
  readonly markFreezeClaimed: (today: ISODate) => void;
  /** Partie résolue : rend un interstitiel dû (un après le puzzle du jour, un toutes les N parties illimitées). */
  readonly notifySolved: (event: SolvedEvent) => void;
  /** Transition voulue par le joueur : montre l'interstitiel dû, s'il y en a un (se résout à sa fermeture). */
  readonly showPendingInterstitial: () => Promise<void>;
  /** Page Premium (ouverte depuis le dialogue des vidéos). */
  readonly setPremiumOpener: (open: (() => void) | null) => void;
}

const NOOP = () => {};

/** Hors fournisseur : tout débloqué, aucune annonce. */
const UNLIMITED_FALLBACK: MonetizationValue = {
  ready: true,
  adsEnabled: false,
  premium: false,
  unlimited: true,
  unlocked: new Set(),
  freezeClaimedOn: null,
  price: null,
  purchaseAvailable: false,
  purchasePending: false,
  buyPremium: async () => 'error',
  restorePurchases: async () => 'unavailable',
  privacyOptionsRequired: false,
  showPrivacyOptions: async () => {},
  requestReward: async () => true,
  unlockArchive: NOOP,
  markFreezeClaimed: NOOP,
  notifySolved: NOOP,
  showPendingInterstitial: async () => {},
  setPremiumOpener: NOOP,
};

const Ctx = createContext<MonetizationValue | null>(null);

export function useMonetization(): MonetizationValue {
  return useContext(Ctx) ?? UNLIMITED_FALLBACK;
}

/**
 * Attente maximale de la réponse du magasin avant de démarrer les annonces : un acheteur Premium
 * (nouvelle installation) ne doit voir ni formulaire de consentement ni annonce.
 */
const STORE_WAIT_MS = 8000;
/** Relecture silencieuse des achats au retour au premier plan (remboursement, code promo) : au plus toutes les 6 h. */
const STORE_REFRESH_MS = 6 * 3_600_000;

const REWARD_ICON: Record<RewardKind, IconName> = { hint: 'lightbulb', archive: 'lock_open', freeze: 'ac_unit' };

export interface MonetizationProviderProps {
  readonly children: ReactNode;
  /** État initial (tests) ; sinon lu dans le stockage. */
  readonly initial?: MonetizationState;
}

export function MonetizationProvider({ children, initial }: MonetizationProviderProps) {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const [state, setState] = useState<MonetizationState | null>(initial ?? null);
  const stateRef = useRef(state);
  const loaded = state !== null;

  // Changements demandés avant la lecture du stockage : appliqués juste après (l'état enregistré
  // n'est jamais écrasé, et rien n'est perdu).
  const queued = useRef<((s: MonetizationState) => MonetizationState)[]>([]);
  const commit = useCallback((next: MonetizationState) => {
    stateRef.current = next;
    setState(next);
    void saveJSON(MONETIZATION_KEY, encodeMonetization(next));
  }, []);
  const update = useCallback(
    (change: (s: MonetizationState) => MonetizationState) => {
      const current = stateRef.current;
      if (!current) {
        queued.current.push(change);
        return;
      }
      const next = change(current);
      if (next !== current) commit(next);
    },
    [commit],
  );

  useEffect(() => {
    if (stateRef.current) return;
    let cancelled = false;
    void loadJSON<unknown>(MONETIZATION_KEY)
      .catch(() => null)
      .then((raw) => {
        if (cancelled || stateRef.current) return;
        const read = decodeMonetization(raw);
        const next = queued.current.reduce((s, change) => change(s), read);
        queued.current = [];
        if (next !== read) commit(next);
        else {
          stateRef.current = read;
          setState(read);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [commit]);

  const premium = state?.premium ?? false;
  const unlimited = !ADS_ENABLED || premium;
  const unlimitedRef = useRef(unlimited);
  unlimitedRef.current = unlimited;

  // Premier plan / arrière-plan : jamais d'annonce hors premier plan.
  const appActive = useRef(true);

  // Magasin : possession de Premium (achat, code promo, remboursement), prix, paiement en attente.
  const [purchases, setPurchases] = useState<PurchaseService>(NO_PURCHASES);
  const [, setStoreVersion] = useState(0);
  // Possession connue (ou magasin muet trop longtemps) : les annonces peuvent démarrer.
  const [storeKnown, setStoreKnown] = useState(!ADS_ENABLED);
  const lastRefresh = useRef(Date.now());
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    if (!ADS_ENABLED || !loaded) return;
    let cancelled = false;
    let off = NOOP;
    const timer = setTimeout(() => setStoreKnown(true), STORE_WAIT_MS);
    void getPurchaseService().then((service) => {
      if (cancelled) return;
      setPurchases(service);
      if (service === NO_PURCHASES) setStoreKnown(true);
      off = service.onChange(() => setStoreVersion((n) => n + 1));
      void service.start((owned) => {
        setStoreKnown(true);
        const before = stateRef.current?.premium ?? false;
        update((s) => (s.premium === owned ? s : { ...s, premium: owned }));
        if (owned && !before) snackbar.show({ message: tRef.current('premium.activated') });
      });
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      off();
    };
  }, [loaded, update, snackbar]);

  const purchasesRef = useRef(purchases);
  purchasesRef.current = purchases;
  useEffect(
    () =>
      onAppActiveChange((active) => {
        appActive.current = active;
        if (!active || Date.now() - lastRefresh.current < STORE_REFRESH_MS) return;
        lastRefresh.current = Date.now();
        void purchasesRef.current.refresh().catch(() => {});
      }),
    [],
  );

  // Annonces : consentement relu en silence au démarrage (aucun formulaire, aucune annonce chargée).
  const adsRef = useRef<AdsService>(NO_ADS);
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  useEffect(() => {
    if (!loaded || unlimited || !storeKnown) return;
    let cancelled = false;
    let off = NOOP;
    void getAdsService().then(async (service) => {
      if (cancelled) return;
      adsRef.current = service;
      off = service.onChange(() => setPrivacyOptionsRequired(service.privacyOptionsRequired()));
      await service.start();
      if (!cancelled) setPrivacyOptionsRequired(service.privacyOptionsRequired());
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [loaded, unlimited, storeKnown]);

  /** Service d'annonces (chargé à la demande si le démarrage n'a pas encore eu lieu). */
  const ads = useCallback(async () => {
    if (adsRef.current === NO_ADS) adsRef.current = await getAdsService();
    return adsRef.current;
  }, []);

  const showPrivacyOptions = useCallback(async () => {
    const service = await ads();
    await service.showPrivacyOptions();
    setPrivacyOptionsRequired(service.privacyOptionsRequired());
  }, [ads]);

  // Dialogue des vidéos avec récompense : une demande à la fois, la précédente est refusée.
  const rewardResolver = useRef<((ok: boolean) => void) | null>(null);
  const [rewardKind, setRewardKind] = useState<RewardKind | null>(null);
  const [shownKind, setShownKind] = useState<RewardKind>('hint');
  const [watching, setWatching] = useState(false);
  const watchingRef = useRef(false);
  const lastRewardedAt = useRef(-Infinity);
  const settle = useCallback((ok: boolean) => {
    const resolve = rewardResolver.current;
    rewardResolver.current = null;
    setRewardKind(null);
    resolve?.(ok);
  }, []);
  const requestReward = useCallback((kind: RewardKind) => {
    if (unlimitedRef.current) return Promise.resolve(true);
    rewardResolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      rewardResolver.current = resolve;
      setShownKind(kind);
      setRewardKind(kind);
    });
  }, []);
  useEffect(() => () => rewardResolver.current?.(false), []);

  const cancelReward = useCallback(() => {
    if (!watchingRef.current) settle(false);
  }, [settle]);
  useEffect(() => (rewardKind !== null ? pushBackHandler(cancelReward) : undefined), [rewardKind, cancelReward]);

  const watch = async () => {
    // Bouton jamais désactivé pendant le chargement (le focus resterait dans le dialogue) : appuis ignorés.
    if (watchingRef.current) return;
    watchingRef.current = true;
    setWatching(true);
    let outcome: RewardOutcome = 'unavailable';
    try {
      outcome = await (await ads()).showRewarded();
    } catch {
      outcome = 'unavailable';
    }
    lastRewardedAt.current = Date.now();
    watchingRef.current = false;
    setWatching(false);
    settle(outcome === 'rewarded');
    if (outcome === 'unavailable') snackbar.show({ message: t('ads.unavailable'), duration: 6000 });
    else if (outcome === 'dismissed') snackbar.show({ message: t('ads.dismissed') });
  };

  const premiumOpener = useRef<(() => void) | null>(null);
  const setPremiumOpener = useCallback((open: (() => void) | null) => {
    premiumOpener.current = open;
  }, []);
  const openPremium = () => {
    settle(false);
    premiumOpener.current?.();
  };

  // Interstitiel dû (en mémoire seulement : une app fermée entre-temps n'en montre pas).
  const interstitialDue = useRef(false);
  const notifySolved = useCallback(
    (event: SolvedEvent) => {
      const current = stateRef.current;
      if (!current) return;
      const r = onSolved(current, event);
      if (r.state !== current) commit(r.state);
      if (!r.interstitial || unlimitedRef.current) return;
      interstitialDue.current = true;
      void ads().then((service) => service.prepareInterstitial());
    },
    [ads, commit],
  );

  const showPendingInterstitial = useCallback(async () => {
    if (!interstitialDue.current) return;
    interstitialDue.current = false;
    // Une seule chance, et seulement à un moment opportun ; sinon l'interstitiel est abandonné.
    if (unlimitedRef.current || !appActive.current || rewardResolver.current !== null) return;
    if (Date.now() - lastRewardedAt.current < INTERSTITIAL_AFTER_REWARD_MS) return;
    try {
      await (await ads()).showInterstitial();
    } catch {
      // annonce indisponible : rien à montrer
    }
  }, [ads]);

  const unlockArchive = useCallback((date: ISODate) => update((s) => withUnlocked(s, date)), [update]);
  const markFreezeClaimed = useCallback((today: ISODate) => update((s) => (s.freezeClaimedOn === today ? s : { ...s, freezeClaimedOn: today })), [update]);
  const buyPremium = useCallback(() => purchases.buy(), [purchases]);
  const restorePurchases = useCallback(() => purchases.restore(), [purchases]);

  const unlockedList = state?.unlocked;
  const unlocked = useMemo(() => new Set(unlockedList ?? []), [unlockedList]);
  const price = purchases.price();
  const purchaseAvailable = purchases.available();
  const purchasePending = purchases.pending();

  const value = useMemo<MonetizationValue>(
    () => ({
      ready: loaded,
      adsEnabled: ADS_ENABLED,
      premium,
      unlimited,
      unlocked,
      freezeClaimedOn: state?.freezeClaimedOn ?? null,
      price,
      purchaseAvailable,
      purchasePending,
      buyPremium,
      restorePurchases,
      privacyOptionsRequired,
      showPrivacyOptions,
      requestReward,
      unlockArchive,
      markFreezeClaimed,
      notifySolved,
      showPendingInterstitial,
      setPremiumOpener,
    }),
    [
      loaded,
      premium,
      unlimited,
      unlocked,
      state?.freezeClaimedOn,
      price,
      purchaseAvailable,
      purchasePending,
      buyPremium,
      restorePurchases,
      privacyOptionsRequired,
      showPrivacyOptions,
      requestReward,
      unlockArchive,
      markFreezeClaimed,
      notifySolved,
      showPendingInterstitial,
      setPremiumOpener,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog
        open={rewardKind !== null}
        onClose={cancelReward}
        closeOnScrim={!watching}
        icon={REWARD_ICON[shownKind]}
        title={t(`ads.reward.${shownKind}.title`)}
        className="reward-dialog"
        actions={
          <>
            <Button
              variant="filled"
              icon={watching ? undefined : 'smart_display'}
              onClick={() => void watch()}
              aria-busy={watching || undefined}
              className="reward-dialog__watch"
            >
              {watching ? <CircularProgress size={18} aria-label={t('ads.loading')} /> : t('ads.watch')}
            </Button>
            <Button variant="text" icon="workspace_premium" onClick={openPremium} disabled={watching} className="reward-dialog__premium">
              {t('premium.short')}
            </Button>
            <Button variant="text" onClick={cancelReward} disabled={watching}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        <p className="md-typescale-body-medium">{t(`ads.reward.${shownKind}.body`, { count: FREE_HINTS_PER_PUZZLE, days: FREE_ARCHIVE_DAYS })}</p>
        <p className="md-typescale-body-small reward-dialog__note">{t('ads.reward.premiumNote')}</p>
        {/* Chargement annoncé aux lecteurs d'écran (la vidéo peut mettre quelques secondes à arriver). */}
        <p className="md-sr-only" role="status">
          {watching ? t('ads.loading') : ''}
        </p>
      </Dialog>
    </Ctx.Provider>
  );
}
