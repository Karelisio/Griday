/**
 * Actions Premium communes à la page Premium et aux réglages : achat et restauration des achats Google Play,
 * avec un retour par snackbar pour chaque issue. Une action à la fois (`busy`).
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMonetization } from '../monetization/MonetizationContext';
import type { BuyOutcome } from '../monetization/purchases';
import { useSnackbar } from '../ui';

/** Message de chaque issue d'achat (la confirmation « Premium est activé » vient, elle, du magasin). */
const BUY_MESSAGE: Record<BuyOutcome, string> = {
  purchased: 'premium.thanks',
  pending: 'premium.pending',
  cancelled: 'premium.cancelled',
  error: 'premium.error',
};

export function usePremiumActions() {
  const { t } = useTranslation();
  const snackbar = useSnackbar();
  const { premium, purchaseAvailable, buyPremium, restorePurchases } = useMonetization();
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

  /** Relit les achats du compte Google Play. Sans magasin (hors ligne, hors Android), un message le dit. */
  const restore = () =>
    run(async () => {
      if (!premium && !purchaseAvailable) {
        snackbar.show({ message: t('premium.unavailable'), duration: 6000 });
        return;
      }
      snackbar.show({ message: t((await restorePurchases()) ? 'premium.restored' : 'premium.notFound') });
    }, 'premium.unavailable');

  return { busy, buy, restore };
}
