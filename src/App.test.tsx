import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { initI18n } from './i18n';
import { DEFAULT_SETTINGS } from './settings/types';

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => localStorage.clear());

describe('application', () => {
  it('affiche le puzzle du jour, permet de poser une reine et de naviguer', async () => {
    render(<App initialSettings={{ ...DEFAULT_SETTINGS, language: 'fr' }} systemLanguages={['fr-FR']} initialPalettes={null} />);
    expect(screen.getByRole('heading', { name: 'Puzzle du jour' })).toBeTruthy();
    const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
    const cells = within(grid).getAllByRole('gridcell');
    expect(cells.length).toBeGreaterThanOrEqual(36);
    expect(cells[0]!.getAttribute('aria-label')).toMatch(/^Ligne 1, colonne 1, région [A-L]\s: vide$/);

    // Toucher (pointer down/up sur la même case) → reine.
    const rect = { left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) };
    grid.getBoundingClientRect = () => rect as DOMRect;
    await act(async () => {
      fireEvent.pointerDown(grid, { clientX: 10, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(grid, { clientX: 10, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
    });
    await waitFor(() => expect(within(grid).getAllByRole('gridcell')[0]!.getAttribute('aria-label')).toMatch(/reine/));

    // Réglages : page secondaire ouverte par l'engrenage, refermée par la flèche de retour.
    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(await screen.findByRole('heading', { name: 'Réglages' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retour' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Réglages' })).toBeNull());

    // Onglets : archives, illimité, statistiques.
    fireEvent.click(screen.getByText('Archives', { selector: 'nav *' }));
    expect(await screen.findByRole('heading', { name: 'Archives' })).toBeTruthy();
    fireEvent.click(screen.getByText('Illimité', { selector: 'nav *' }));
    expect(await screen.findByRole('heading', { name: 'Mode illimité' })).toBeTruthy();
    fireEvent.click(screen.getByText('Stats', { selector: 'nav *' }));
    expect(await screen.findByRole('heading', { name: 'Statistiques' })).toBeTruthy();
  }, 30_000);
});
