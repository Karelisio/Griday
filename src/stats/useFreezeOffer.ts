/**
 * Gel de série offert, côté React : proposé tous les FREEZE_REWARD_EVERY_DAYS jours tant que la réserve n'est pas
 * pleine, contre une vidéo (directement en Premium ou dans un build sans publicité). Le gel gagné s'ajoute à la
 * réserve de la série ; le jour de la demande est noté pour compter le délai.
 */
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMonetization } from '../monetization/MonetizationContext';
import { freezeOffer } from '../monetization/rules';
import { useProgress } from '../progress/ProgressContext';
import { MAX_FREEZES } from '../progress/streak';
import { useOptionalSnackbar } from '../ui';
import type { FreezeAction } from './StreakCard';

/** `freezes` : gels actuellement en réserve. */
export function useFreezeOffer(freezes: number): FreezeAction {
  const { t } = useTranslation();
  const snackbar = useOptionalSnackbar(); // l'écran des statistiques reste utilisable sans hôte de snackbars
  const { today, addFreeze } = useProgress();
  const { freezeClaimedOn, unlimited, requestReward, markFreezeClaimed } = useMonetization();
  const offer = freezeOffer(freezeClaimedOn, today, freezes, MAX_FREEZES);

  // Une demande à la fois, et jamais sur une offre périmée (double toucher avant le nouveau rendu).
  const availableRef = useRef(offer.available);
  availableRef.current = offer.available;
  const claiming = useRef(false);
  const claim = useCallback(async () => {
    if (claiming.current || !availableRef.current) return;
    claiming.current = true;
    try {
      if (!(await requestReward('freeze')) || !addFreeze()) return;
      markFreezeClaimed(today);
      snackbar?.show({ message: t('streak.freezeEarned'), duration: 8000 });
    } finally {
      claiming.current = false;
    }
  }, [requestReward, addFreeze, markFreezeClaimed, today, snackbar, t]);

  return { available: offer.available, nextOn: offer.nextOn, instant: unlimited, onClaim: () => void claim() };
}
