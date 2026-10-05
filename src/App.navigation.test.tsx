import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { initI18n } from './i18n';
import { dispatchBack } from './platform/back';
import { EMPTY_STREAK } from './progress/streak';
import { DEFAULT_SETTINGS } from './settings/types';

beforeAll(async () => {
  await initI18n('fr');
});
// 7 octobre 2026 (puzzle n° 3) : les 5 et 6 sont dans les archives. Seule la date est simulée.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7, 10));
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

const nav = (label: string) => fireEvent.click(screen.getByText(label, { selector: 'nav *' }));
const back = () => act(() => void dispatchBack());
const todayTitle = () => screen.queryByRole('heading', { name: 'Puzzle du jour' });

describe('navigation', () => {
  it('pages secondaires, retour Android, jour d’archive ouvert au bon endroit', async () => {
    render(
      <App
        initialSettings={{ ...DEFAULT_SETTINGS, language: 'fr' }}
        systemLanguages={['fr-FR']}
        initialPalettes={null}
        initialProgress={{ history: new Map(), unlimited: [], streak: EMPTY_STREAK }}
      />,
    );
    await screen.findByRole('grid', {}, { timeout: 15_000 });

    // Réglages : page au-dessus de l'onglet (masqué, chrono en pause), fermée par le retour.
    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(await screen.findByRole('heading', { name: 'Réglages' })).toBeTruthy();
    expect(todayTitle()).toBeNull();
    back();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Réglages' })).toBeNull());
    expect(todayTitle()).toBeTruthy();

    // Autre onglet : le retour ramène à « Aujourd'hui ».
    nav('Stats');
    expect(await screen.findByRole('heading', { name: 'Statistiques' })).toBeTruthy();
    back();
    await waitFor(() => expect(todayTitle()).toBeTruthy());

    // Archives : le jour même ouvre l'onglet « Aujourd'hui » (focus sur son titre)…
    nav('Archives');
    fireEvent.click(await screen.findByRole('button', { name: /\b7 octobre 2026/ }));
    await waitFor(() => expect(todayTitle()).toBeTruthy());
    await waitFor(() => expect(document.activeElement).toBe(todayTitle()));

    // … un jour passé ouvre sa page, que le retour referme.
    nav('Archives');
    fireEvent.click(await screen.findByRole('button', { name: /\b6 octobre 2026/ }));
    expect(await screen.findByRole('heading', { name: 'Puzzle n° 2' }, { timeout: 15_000 })).toBeTruthy();
    back();
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Puzzle n° 2' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Archives' })).toBeTruthy();
  }, 60_000);
});
