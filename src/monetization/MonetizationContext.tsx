/**
 * Monétisation côté React : Premium (achat Google Play, état mis en cache), consentement et
 * annonces AdMob, dialogue des vidéos avec récompense, interstitiels après les victoires.
 *
 * En Premium ou dans un build sans publicité (`VITE_ADS=false`), tout est débloqué et aucune
 * annonce n'est jamais chargée. Hors fournisseur (tests de composants isolés), même comportement.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ISODate } from '../../engine/core/date';
import { pushBackHandler } from '../platform';
import { loadJSON, saveJSON } from '../platform/storage';
import { Button, CircularProgress, Dialog, useSnackbar, type IconName } from '../ui';
import { NO_ADS, getAdsService, type AdsService } from './ads';
import { ADS_ENABLED, FREE_ARCHIVE_DAYS, FREE_HINTS_PER_PUZZLE, INTERSTITIAL_DELAY_MS } from './config';
import { NO_PURCHASES, getPurchaseService, type BuyOutcome, type PurchaseService } from './purchases';
import { onSolved, type SolvedEvent } from './rules';
import { MONETIZATION_KEY, decodeMonetization, encodeMonetization, withUnlocked, type MonetizationState } from './state';
import './monetization.css';

export type RewardKind = 'hint' | 'archive' | 'freeze';

export interface MonetizationValue {
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
  readonly buyPremium: () => Promise<BuyOutcome>;
  readonly restorePurchases: () => Promise<boolean>;
  /** Choix de confidentialité publicitaires à proposer dans les réglages (UMP). */
  readonly privacyOptionsRequired: boolean;
  readonly showPrivacyOptions: () => Promise<void>;
  /** Propose une vidéo pour `kind` ; vrai si la récompense est acquise (toujours, en illimité). */
  readonly requestReward: (kind: RewardKind) => Promise<boolean>;
  readonly unlockArchive: (date: ISODate) => void;
  readonly markFreezeClaimed: (today: ISODate) => void;
  /** Partie résolue : interstitiel éventuel (un après le puzzle du jour, un toutes les N parties illimitées). */
  readonly notifySolved: (event: SolvedEvent) => void;
  /** Page Premium (ouverte depuis le dialogue des vidéos). */
  readonly setPremiumOpener: (open: (() => void) | null) => void;
}

const NOOP = () => {};

/** Hors fournisseur : tout débloqué, aucune annonce. */
const UNLIMITED_FALLBACK: MonetizationValue = {
  adsEnabled: false,
  premium: false,
  unlimited: true,
  unlocked: new Set(),
  freezeClaimedOn: null,
  price: null,
  purchaseAvailable: false,
  buyPremium: async () => 'error',
  restorePurchases: async () => false,
  privacyOptionsRequired: false,
  showPrivacyOptions: async () => {},
  requestReward: async () => true,
  unlockArchive: NOOP,
  markFreezeClaimed: NOOP,
  notifySolved: NOOP,
  setPremiumOpener: NOOP,
};

const Ctx = createContext<MonetizationValue | null>(null);

export function useMonetization(): MonetizationValue {
  return useContext(Ctx) ?? UNLIMITED_FALLBACK;
}

/** Démarrage des annonces (consentement) un peu après l'ouverture : l'app s'affiche d'abord. */
const ADS_START_DELAY_MS = 2500;
/** Un interstitiel retardé de plus que ça (app passée en arrière-plan) n'est plus montré. */
const INTERSTITIAL_STALE_MS = 3000;

const REWARD_ICON: Record<RewardKind, IconName> = { hint: 'lightbulb', archive: 'lock', freeze: 'ac_unit' };

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

  // Avant la lecture du stockage, rien n'est écrit : l'état enregistré serait écrasé.
  const update = useCallback((change: (s: MonetizationState) => MonetizationState) => {
    const current = stateRef.current;
    if (!current) return;
    const next = change(current);
    if (next === current) return;
    stateRef.current = next;
    setState(next);
    void saveJSON(MONETIZATION_KEY, encodeMonetization(next));
  }, []);

  useEffect(() => {
    if (stateRef.current) return;
    let cancelled = false;
    void loadJSON<unknown>(MONETIZATION_KEY)
      .catch(() => null)
      .then((raw) => {
        if (cancelled || stateRef.current) return;
        const s = decodeMonetization(raw);
        stateRef.current = s;
        setState(s);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const premium = state?.premium ?? false;
  const unlimited = !ADS_ENABLED || premium;
  const unlimitedRef = useRef(unlimited);
  unlimitedRef.current = unlimited;

  // Magasin : possession de Premium (achat, code promo, remboursement), prix.
  const [purchases, setPurchases] = useState<PurchaseService>(NO_PURCHASES);
  const [, setStoreVersion] = useState(0);
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    if (!ADS_ENABLED || !loaded) return;
    let cancelled = false;
    let off = NOOP;
    void getPurchaseService().then((service) => {
      if (cancelled) return;
      setPurchases(service);
      off = service.onChange(() => setStoreVersion((n) => n + 1));
      void service.start((owned) => {
        const before = stateRef.current?.premium ?? false;
        update((s) => (s.premium === owned ? s : { ...s, premium: owned }));
        if (owned && !before) snackbar.show({ message: tRef.current('premium.activated') });
      });
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [loaded, update, snackbar]);

  // Annonces : consentement puis préchargement, seulement si elles peuvent servir.
  const adsRef = useRef<AdsService>(NO_ADS);
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  useEffect(() => {
    if (!loaded || unlimited) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void getAdsService().then(async (service) => {
        if (cancelled) return;
        adsRef.current = service;
        await service.start();
        if (!cancelled) setPrivacyOptionsRequired(service.privacyOptionsRequired());
      });
    }, ADS_START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loaded, unlimited]);

  const showPrivacyOptions = useCallback(async () => {
    const service = adsRef.current;
    await service.showPrivacyOptions();
    setPrivacyOptionsRequired(service.privacyOptionsRequired());
  }, []);

  // Dialogue des vidéos avec récompense : une demande à la fois, la précédente est refusée.
  const pending = useRef<((ok: boolean) => void) | null>(null);
  const [rewardKind, setRewardKind] = useState<RewardKind | null>(null);
  const [shownKind, setShownKind] = useState<RewardKind>('hint');
  const [watching, setWatching] = useState(false);
  const settle = useCallback((ok: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setRewardKind(null);
    resolve?.(ok);
  }, []);
  const requestReward = useCallback((kind: RewardKind) => {
    if (unlimitedRef.current) return Promise.resolve(true);
    pending.current?.(false);
    return new Promise<boolean>((resolve) => {
      pending.current = resolve;
      setShownKind(kind);
      setRewardKind(kind);
    });
  }, []);
  useEffect(() => () => pending.current?.(false), []);

  const cancelReward = useCallback(() => {
    if (!watching) settle(false);
  }, [watching, settle]);
  useEffect(() => (rewardKind !== null ? pushBackHandler(cancelReward) : undefined), [rewardKind, cancelReward]);

  const watch = async () => {
    setWatching(true);
    let outcome: Awaited<ReturnType<AdsService['showRewarded']>> = 'unavailable';
    try {
      outcome = await (adsRef.current === NO_ADS ? getAdsService() : Promise.resolve(adsRef.current)).then((s) => {
        adsRef.current = s;
        return s.showRewarded();
      });
    } catch {
      outcome = 'unavailable';
    }
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

  const notifySolved = useCallback(
    (event: SolvedEvent) => {
      let interstitial = false;
      update((s) => {
        const r = onSolved(s, event);
        interstitial = r.interstitial;
        return r.state;
      });
      if (!interstitial || unlimitedRef.current) return;
      const at = Date.now();
      setTimeout(() => {
        if (unlimitedRef.current || Date.now() - at > INTERSTITIAL_DELAY_MS + INTERSTITIAL_STALE_MS) return;
        void adsRef.current.showInterstitial();
      }, INTERSTITIAL_DELAY_MS);
    },
    [update],
  );

  const unlockArchive = useCallback((date: ISODate) => update((s) => withUnlocked(s, date)), [update]);
  const markFreezeClaimed = useCallback((today: ISODate) => update((s) => (s.freezeClaimedOn === today ? s : { ...s, freezeClaimedOn: today })), [update]);
  const buyPremium = useCallback(() => purchases.buy(), [purchases]);
  const restorePurchases = useCallback(() => purchases.restore(), [purchases]);

  const unlockedList = state?.unlocked;
  const unlocked = useMemo(() => new Set(unlockedList ?? []), [unlockedList]);
  const price = purchases.price();
  const purchaseAvailable = purchases.available();

  const value = useMemo<MonetizationValue>(
    () => ({
      adsEnabled: ADS_ENABLED,
      premium,
      unlimited,
      unlocked,
      freezeClaimedOn: state?.freezeClaimedOn ?? null,
      price,
      purchaseAvailable,
      buyPremium,
      restorePurchases,
      privacyOptionsRequired,
      showPrivacyOptions,
      requestReward,
      unlockArchive,
      markFreezeClaimed,
      notifySolved,
      setPremiumOpener,
    }),
    [
      premium,
      unlimited,
      unlocked,
      state?.freezeClaimedOn,
      price,
      purchaseAvailable,
      buyPremium,
      restorePurchases,
      privacyOptionsRequired,
      showPrivacyOptions,
      requestReward,
      unlockArchive,
      markFreezeClaimed,
      notifySolved,
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
            <Button variant="text" icon="workspace_premium" onClick={openPremium} disabled={watching} className="reward-dialog__premium">
              {t('premium.short')}
            </Button>
            <Button variant="text" onClick={cancelReward} disabled={watching}>
              {t('common.cancel')}
            </Button>
            <Button variant="text" icon={watching ? undefined : 'play_arrow'} onClick={() => void watch()} disabled={watching}>
              {watching ? <CircularProgress size={18} aria-label={t('ads.loading')} /> : t('ads.watch')}
            </Button>
          </>
        }
      >
        <p className="md-typescale-body-medium">{t(`ads.reward.${shownKind}.body`, { count: FREE_HINTS_PER_PUZZLE, days: FREE_ARCHIVE_DAYS })}</p>
        <p className="md-typescale-body-small reward-dialog__note">{t('ads.reward.premiumNote')}</p>
      </Dialog>
    </Ctx.Provider>
  );
}
