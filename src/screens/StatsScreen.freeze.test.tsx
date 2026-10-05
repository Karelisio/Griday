/** Gel de série offert dans les statistiques : vidéo (ou Premium), un tous les 7 jours, réserve de 2 au plus. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initI18n } from '../i18n';
import { setAdsServiceForTesting } from '../monetization/ads';
import { FREEZE_REWARD_EVERY_DAYS } from '../monetization/config';
import { MonetizationProvider } from '../monetization/MonetizationContext';
import { EMPTY_MONETIZATION, MONETIZATION_KEY, type MonetizationState } from '../monetization/state';
import { fakeAds } from '../monetization/testing';
import { loadJSON } from '../platform/storage';
import { ProgressProvider } from '../progress/ProgressContext';
import { daily, day, freezeToday, progress } from '../stats/testing';
import { SnackbarHost } from '../ui';
import { ICON_PATHS } from '../ui/icons.generated';
import { installMatchMedia } from '../ui/testing';
import { StatsScreen } from './StatsScreen';

installMatchMedia();
const NBSP = ' ';

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => {
  localStorage.clear();
  freezeToday(); // mercredi 18 novembre 2026
});
afterEach(() => setAdsServiceForTesting(null));

/** Statistiques avec `freezes` gels en réserve (deux jours résolus : l'écran n'est pas vide). */
function renderStats(freezes: number, monetization: MonetizationState = EMPTY_MONETIZATION) {
  return render(
    <SnackbarHost closeLabel="Fermer">
      <ProgressProvider initial={progress([daily(0), daily(1)], [], freezes)}>
        <MonetizationProvider initial={monetization}>
          <StatsScreen visible />
        </MonetizationProvider>
      </ProgressProvider>
    </SnackbarHost>,
  );
}

const claim = () => screen.queryByRole('button', { name: 'Obtenir un gel' });
const slots = (n: number) => screen.queryByRole('img', { name: `Gels disponibles${NBSP}: ${n} sur 2` });
const videoDialog = () => screen.findByRole('dialog', { name: 'Obtenir un gel de série' });

describe('gel de série offert', () => {
  it('vidéo vue : un gel de plus en réserve, jour noté, confirmation, et plus d’offre avant 7 jours', async () => {
    const ads = fakeAds('rewarded');
    setAdsServiceForTesting(ads);
    renderStats(1);
    expect(slots(1)).toBeTruthy();
    expect(claim()!.querySelector('svg path')!.getAttribute('d')).toBe(ICON_PATHS.smart_display.outline); // une vidéo à regarder

    fireEvent.click(claim()!);
    const box = await videoDialog();
    expect(within(box).getByText(/Regardez une courte vidéo pour en obtenir un/)).toBeTruthy();
    fireEvent.click(within(box).getByRole('button', { name: 'Regarder' }));

    await waitFor(() => expect(slots(2)).toBeTruthy());
    expect(ads.showRewarded).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Gel de série gagné/)).toBeTruthy();
    expect(claim()).toBeNull();
    expect(screen.getByText('Réserve pleine')).toBeTruthy(); // 2 sur 2
    await waitFor(async () => expect(await loadJSON(MONETIZATION_KEY)).toMatchObject({ freezeClaimedOn: day(0) }));
  });

  it(`déjà demandé il y a moins de ${FREEZE_REWARD_EVERY_DAYS} jours : pas de bouton, le prochain jour possible est annoncé`, () => {
    setAdsServiceForTesting(fakeAds());
    renderStats(0, { ...EMPTY_MONETIZATION, freezeClaimedOn: day(3) }); // le 15 novembre
    expect(claim()).toBeNull();
    expect(screen.getByText('Prochain gel offert le dimanche 22 novembre')).toBeTruthy();
  });

  it(`${FREEZE_REWARD_EVERY_DAYS} jours après : de nouveau disponible`, () => {
    setAdsServiceForTesting(fakeAds());
    renderStats(0, { ...EMPTY_MONETIZATION, freezeClaimedOn: day(FREEZE_REWARD_EVERY_DAYS) });
    expect(claim()).toBeTruthy();
    expect(screen.queryByText(/Prochain gel/)).toBeNull();
  });

  it('réserve pleine : ni bouton ni délai, même si le dernier gel est ancien', () => {
    renderStats(2);
    expect(claim()).toBeNull();
    expect(screen.getByText('Réserve pleine')).toBeTruthy();
    expect(screen.queryByText(/Prochain gel/)).toBeNull();
    expect(slots(2)).toBeTruthy();
  });

  it('dialogue fermé ou vidéo non terminée : rien n’est accordé, la demande reste possible', async () => {
    const ads = fakeAds('dismissed');
    setAdsServiceForTesting(ads);
    renderStats(0);

    fireEvent.click(claim()!);
    fireEvent.click(within(await videoDialog()).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(claim()!);
    fireEvent.click(within(await videoDialog()).getByRole('button', { name: 'Regarder' }));
    expect(await screen.findByText(/Vidéo interrompue/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(slots(0)).toBeTruthy();
    expect(claim()).toBeTruthy();
    expect(screen.queryByText(/Gel de série gagné/)).toBeNull();
    expect(await loadJSON(MONETIZATION_KEY)).toBeUndefined();
  });

  it('Premium : directement, sans vidéo, avec l’icône de gel ; un double toucher ne donne qu’un gel', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderStats(0, { ...EMPTY_MONETIZATION, premium: true });
    const button = claim()!;
    expect(button.querySelector('svg path')!.getAttribute('d')).toBe(ICON_PATHS.ac_unit.outline); // pas de vidéo : icône de gel
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(slots(1)).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ads.showRewarded).not.toHaveBeenCalled();
    expect(await screen.findByText(/Gel de série gagné/)).toBeTruthy();
    expect(claim()).toBeNull(); // délai de 7 jours entamé
    expect(screen.getByText('Prochain gel offert le mercredi 25 novembre')).toBeTruthy();
    expect(slots(2)).toBeNull();
  });

  it('isolé (sans fournisseur de monétisation, ni hôte de snackbars) : le gel est donné directement', async () => {
    render(
      <ProgressProvider initial={progress([daily(0), daily(1)], [], 0)}>
        <StatsScreen visible />
      </ProgressProvider>,
    );
    fireEvent.click(claim()!);
    await waitFor(() => expect(slots(1)).toBeTruthy());
  });
});
