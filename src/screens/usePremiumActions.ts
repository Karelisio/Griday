/**
 * Actions Premium communes à la page Premium et aux réglages : achat et restauration des achats Google Play,
 * avec un retour par snackbar pour chaque issue. Une action à la fois (`busy`).
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMonetization } from '../monetization/MonetizationContext';
import type { BuyOutcome, RestoreOutcome } from '../monetization/purchases';
import { useSnackbar } from '../ui';

/** Message de chaque issue d'achat (la confirmation « Premium est activé » vient, elle, du magasin). */
const BUY_MESSAGE: Record<BuyOutcome, string> = {
  purchased: 'premium.thanks',
  pending: 'premium.pending',
  cancelled: 'premium.cancelled',
  error: 'premium.error',
};

/** Message de chaque issue de restauration : un magasin injoignable n'est pas « aucun achat ». */
const RESTORE_MESSAGE: Record<RestoreOutcome, string> = {
  owned: 'premium.restored',
  notFound: 'premium.notFound',
  unavailable: 'premium.unavailable',
};

export function usePremiumActions() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const { buyPremium, restorePurchases } = useMonetization();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  /** Une action à la fois ; `failure` : message si le magasin lève une erreur. */
  const run = async (action: () => Promise<void>, failure: string) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
    } catch {
      snackbar.show({ message: t(failure), duration: 6000 });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  /** Achat de Premium (feuille de paiement Google Play). */
  const buy = () =>
    run(async () => {
      snackbar.show({ message: t(BUY_MESSAGE[await buyPremium()]) });
    }, 'premium.error');

  /** Relit les achats du compte Google Play. Sans magasin joignable (hors ligne, hors Android), un message le dit. */
  const restore = () =>
    run(async () => {
      const outcome = await restorePurchases();
      snackbar.show({ message: t(RESTORE_MESSAGE[outcome]), duration: outcome === 'unavailable' ? 6000 : undefined });
    }, 'premium.unavailable');

  return { busy, buy, restore };
}
