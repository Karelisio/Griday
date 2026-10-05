import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n, setLanguage } from '../i18n';
import { PLAY_REDEEM_URL } from '../monetization/config';
import { MonetizationProvider } from '../monetization/MonetizationContext';
import { setPurchaseServiceForTesting } from '../monetization/purchases';
import { EMPTY_MONETIZATION, type MonetizationState } from '../monetization/state';
import { fakePurchases, type FakePurchasesOptions } from '../monetization/testing';
import { SnackbarHost } from '../ui';
import { installMatchMedia } from '../ui/testing';
import { PremiumPage } from './PremiumPage';

installMatchMedia();

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => localStorage.clear());
afterEach(async () => {
  setPurchaseServiceForTesting(null);
  vi.restoreAllMocks();
  await setLanguage('fr');
});

/** Page Premium dans ses fournisseurs ; `store` : magasin factice (sans lui, comme dans un navigateur : achat indisponible). */
function renderPage({ store, monetization = EMPTY_MONETIZATION, visible = true }: { store?: FakePurchasesOptions; monetization?: MonetizationState; visible?: boolean } = {}) {
  const service = store ? fakePurchases(store) : null;
  setPurchaseServiceForTesting(service);
  render(
    <SnackbarHost closeLabel="Fermer">
      <MonetizationProvider initial={monetization}>
        <PremiumPage visible={visible} />
      </MonetizationProvider>
    </SnackbarHost>,
  );
  return service;
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const buy = () => button(/^Passer à Premium/);
/** Le snackbar affiché ; les suivants attendent la fin du précédent : on le ferme pour les voir. */
const toast = async (text: string | RegExp) => {
  const message = await screen.findByText(text);
  return message.closest('[role="status"]')!;
};
const dismissToast = (host: Element) => fireEvent.click(within(host as HTMLElement).getByRole('button', { name: 'Fermer' }));

describe('page Premium', () => {
  it('en-tête, avantages, achat avec le prix localisé, restauration et code promo', async () => {
    renderPage({ store: { price: '2,99 €' } });
    expect(screen.getByRole('region', { name: 'Griday Premium' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Griday Premium');
    expect(screen.getByText('Un achat unique pour jouer sans publicité et sans limite.')).toBeTruthy();

    const benefits = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(benefits.map((item) => item.textContent)).toEqual(['Plus aucune publicité', 'Indices illimités, sans vidéo', 'Toutes les archives ouvertes', 'Gel de série sans vidéo']);

    await waitFor(() => expect(buy().disabled).toBe(false));
    expect(buy().textContent).toMatch(/^Passer à Premium pour 2,99\s€$/);
    expect(screen.queryByText(/L’achat n’est pas disponible/)).toBeNull();
    expect(button('Restaurer mes achats')).toBeTruthy();
    expect(button('Utiliser un code promo')).toBeTruthy();
    expect(screen.getByText('Les codes s’échangent dans le Play Store ; Premium s’active ensuite tout seul.')).toBeTruthy();
    expect(screen.queryByText('Premium est actif')).toBeNull();
  });

  it('achat réussi : Premium s’active (page, message du magasin, remerciement)', async () => {
    const store = renderPage({ store: { buy: 'purchased' } })!;
    await waitFor(() => expect(buy().disabled).toBe(false));
    fireEvent.click(buy());

    expect(store.buy).toHaveBeenCalledTimes(1);
    const first = await toast('Premium est activé. Profitez de tout, sans publicité.');
    expect(await screen.findByText('Premium est actif')).toBeTruthy(); // la page passe à l’état actif
    expect(screen.queryByRole('button', { name: /^Passer à Premium/ })).toBeNull();
    dismissToast(first);
    expect(await toast('Merci de soutenir Griday !')).toBeTruthy();
  });

  it.each([
    ['cancelled', 'Achat annulé.'],
    ['pending', 'Paiement en attente de validation. Premium s’activera dès qu’il sera confirmé.'],
    ['error', 'L’achat n’a pas pu aboutir. Réessayez plus tard.'],
  ] as const)('achat « %s » : message, Premium reste inactif', async (outcome, message) => {
    renderPage({ store: { buy: outcome } });
    await waitFor(() => expect(buy().disabled).toBe(false));
    fireEvent.click(buy());
    await toast(message);
    expect(screen.queryByText('Premium est actif')).toBeNull();
    await waitFor(() => expect(buy().disabled).toBe(false)); // l’achat peut être retenté
  });

  it('magasin en panne pendant l’achat : message d’erreur', async () => {
    const store = renderPage({ store: {} })!;
    store.buy.mockRejectedValueOnce(new Error('Play'));
    await waitFor(() => expect(buy().disabled).toBe(false));
    fireEvent.click(buy());
    await toast('L’achat n’a pas pu aboutir. Réessayez plus tard.');
  });

  it('magasin en panne pendant la restauration : message d’indisponibilité', async () => {
    const store = renderPage({ store: {} })!;
    store.restore.mockRejectedValueOnce(new Error('Play'));
    await waitFor(() => expect(buy().disabled).toBe(false));
    fireEvent.click(button('Restaurer mes achats'));
    await toast(/L’achat n’est pas disponible pour le moment/);
    expect(screen.queryByText(/Aucun achat Premium trouvé/)).toBeNull();
  });

  it('achat indisponible (hors ligne, hors Google Play) : bouton désactivé sans prix, avec l’explication', async () => {
    renderPage({ store: { price: null, available: false } });
    expect(buy().textContent).toBe('Passer à Premium');
    expect(buy().disabled).toBe(true);
    const note = screen.getByText('L’achat n’est pas disponible pour le moment. Il nécessite Google Play et une connexion à Internet.');
    expect(buy().getAttribute('aria-describedby')).toBe(note.closest('p')!.id); // l'explication décrit le bouton
    expect(button('Utiliser un code promo').disabled).toBe(false); // le code promo reste possible
  });

  it('navigateur (aucun magasin) : même état indisponible', () => {
    renderPage();
    expect(buy().disabled).toBe(true);
    expect(screen.getByText(/L’achat n’est pas disponible/)).toBeTruthy();
  });

  it('restaurer les achats : achat retrouvé', async () => {
    const store = renderPage({ store: { restore: true } })!;
    await waitFor(() => expect(buy().disabled).toBe(false));
    fireEvent.click(button('Restaurer mes achats'));
    expect(store.restore).toHaveBeenCalledTimes(1);
    const first = await toast('Premium est activé. Profitez de tout, sans publicité.');
    dismissToast(first);
    await toast('Votre achat a été restauré.');
    expect(await screen.findByText('Premium est actif')).toBeTruthy();
  });

  it('restaurer les achats : aucun achat trouvé', async () => {
    renderPage({ store: { restore: false } });
    await waitFor(() => expect(buy().disabled).toBe(false));
    fireEvent.click(button('Restaurer mes achats'));
    await toast('Aucun achat Premium trouvé sur ce compte Google Play.');
    expect(screen.queryByText('Premium est actif')).toBeNull();
  });

  it('restaurer sans magasin : le message dit que l’achat est indisponible, pas qu’il est introuvable', async () => {
    renderPage({ store: { price: null, available: false } });
    fireEvent.click(button('Restaurer mes achats'));
    const host = document.querySelector<HTMLElement>('.md-snackbar-host')!; // la page affiche déjà la même explication
    await waitFor(() => expect(host.textContent).toMatch(/L’achat n’est pas disponible pour le moment/));
    expect(screen.queryByText(/Aucun achat Premium trouvé/)).toBeNull();
  });

  it('une action à la fois : achat et restauration sont désactivés pendant l’attente', async () => {
    const store = renderPage({ store: { buy: 'cancelled' } })!;
    let finish!: (owned: boolean) => void;
    store.restore.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await waitFor(() => expect(buy().disabled).toBe(false));
    fireEvent.click(button('Restaurer mes achats'));
    await waitFor(() => expect(buy().disabled).toBe(true));
    expect(button('Restaurer mes achats').disabled).toBe(true);
    fireEvent.click(buy()); // ignoré
    expect(store.buy).not.toHaveBeenCalled();
    await act(async () => finish(false));
    await waitFor(() => expect(buy().disabled).toBe(false));
    await toast('Aucun achat Premium trouvé sur ce compte Google Play.');
  });

  it('code promo : ouvre la page d’échange du Play Store', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderPage({ store: {} });
    fireEvent.click(button('Utiliser un code promo'));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(PLAY_REDEEM_URL, '_blank');
    expect(PLAY_REDEEM_URL).toBe('https://play.google.com/redeem');
  });

  it('Premium actif : statut et remerciement à la place de l’achat', () => {
    renderPage({ store: { owned: true }, monetization: { ...EMPTY_MONETIZATION, premium: true } });
    const status = document.querySelector<HTMLElement>('.premium__status')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(within(status).getByText('Premium est actif')).toBeTruthy();
    expect(within(status).getByText('Merci de soutenir Griday !')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Passer à Premium/ })).toBeNull();
    expect(screen.queryByText(/L’achat n’est pas disponible/)).toBeNull();
    expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(4); // les avantages restent présentés
    expect(button('Restaurer mes achats')).toBeTruthy();
  });

  it('page masquée quand elle n’est pas visible', () => {
    renderPage({ visible: false });
    expect(document.querySelector('section.premium')!.hasAttribute('hidden')).toBe(true);
  });

  it('anglais', async () => {
    await setLanguage('en');
    renderPage({ store: { price: '$2.99' } });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Griday Premium');
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'No more ads',
      'Unlimited hints, no videos',
      'Every archive puzzle unlocked',
      'Streak freezes without videos',
    ]);
    await waitFor(() => expect(button('Get Premium for $2.99').disabled).toBe(false));
    expect(button('Restore purchases')).toBeTruthy();
    expect(button('Redeem a promo code')).toBeTruthy();
    expect(screen.getByText('Codes are redeemed in the Play Store; Premium then activates by itself.')).toBeTruthy();
  });
});
