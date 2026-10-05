import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BinairoSolvedPuzzle } from '../../../engine/binairo/types';
import { i18n, initI18n } from '../../i18n';
import { SettingsProvider } from '../../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../../settings/types';
import { ThemeProvider } from '../../theme';
import { SnackbarHost } from '../../ui';
import { useGameSession } from '../core/useGameSession';
import { gameKind } from '../kinds';
import { GameView } from '../GameView';
import { isBinairoHighlight } from './explain';
import { BINAIRO_KIND } from './kind';

// Grille 6 × 6 à solution unique (1 = soleil, 2 = lune).
const puzzle: BinairoSolvedPuzzle = {
  size: 6,
  givens: [2, 0, 0, 2, 2, 0, 0, 1, 0, 2, 1, 2, 1, 2, 0, 0, 0, 2, 0, 0, 2, 0, 2, 1, 0, 0, 0, 0, 1, 2, 0, 2, 0, 0, 0, 0],
  solution: [2, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 1, 2, 2, 1, 2, 1],
};

function Harness() {
  const session = useGameSession(BINAIRO_KIND.rules, { puzzle, storageKey: 'test.binairo', visible: true });
  return session.game ? <GameView kind={BINAIRO_KIND} puzzle={puzzle} session={session} visible /> : null;
}

function renderGame(lang: 'fr' | 'en' = 'fr') {
  return render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: lang }}>
      <ThemeProvider mode={lang === 'fr' ? 'light' : 'dark'} dynamic={false}>
        <SnackbarHost closeLabel="Fermer">
          <Harness />
        </SnackbarHost>
      </ThemeProvider>
    </SettingsProvider>,
  );
}

const hintButton = () => screen.getByRole('button', { name: 'Indice' });
const cellsOf = (grid: HTMLElement) => within(grid).getAllByRole('gridcell');
const stateOf = (cell: HTMLElement) => (cell.getAttribute('aria-label') ?? '').split('\u00a0: ')[1] ?? '';

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => localStorage.clear());

describe('Binairo dans la vue de jeu commune', () => {
  it('le type est enregistré, avec ses textes et son icône', () => {
    expect(gameKind('binairo')).toBe(BINAIRO_KIND);
    expect(BINAIRO_KIND.id).toBe('binairo');
    expect(BINAIRO_KIND.size(puzzle)).toBe(6);
    expect(BINAIRO_KIND.isPuzzle(puzzle)).toBe(true);
    expect(BINAIRO_KIND.isPuzzle({ ...puzzle, size: 5 })).toBe(false);
  });

  it('hint : indice complet pour la vue de jeu (déduction, erreur, grille résolue)', async () => {
    const t = i18n.getFixedT('fr');
    const start = BINAIRO_KIND.rules.initial(puzzle);

    const step = await BINAIRO_KIND.hint(puzzle, start, t, 'fr');
    expect(step.kind).toBe('step');
    expect(step.moves.length).toBeGreaterThan(0);
    for (const m of step.moves) {
      expect(start[m.cell]).toBe(0);
      expect(m.mark).toBe(puzzle.solution[m.cell]);
    }
    expect(isBinairoHighlight(step.highlight)).toBe(true);
    for (const key of [step.titleKey, step.textKey]) expect(i18n.exists(key, { lng: 'fr', ...step.params }), key).toBe(true);
    expect(step.key).toMatch(/^step:/);
    expect([...step.focus]).toEqual([...new Set(step.focus)].sort((a, b) => a - b));
    expect(step.focus.length).toBeGreaterThan(0);
    expect(['light_mode', 'dark_mode', 'check']).toContain(step.applyIcon);

    const wrong = [...start];
    wrong[1] = 2; // la solution porte un soleil en case 1
    const mistake = await BINAIRO_KIND.hint(puzzle, wrong, t, 'fr');
    expect(mistake).toMatchObject({ kind: 'mistake', key: 'mistake:1', moves: [{ cell: 1, mark: 0 }], applyIcon: 'backspace', focus: [1] });

    const solved = await BINAIRO_KIND.hint(puzzle, BINAIRO_KIND.rules.solution(puzzle), t, 'fr');
    expect(solved).toMatchObject({ kind: 'solved', key: 'solved', moves: [], focus: [] });
  });

  it('toucher une case la fait tourner ; les conflits sont annoncés puis corrigés par l’indice « Corriger »', async () => {
    renderGame();
    const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
    expect(grid.getAttribute('aria-label')).toBe(i18n.t('game.board', { n: 6 }));
    const cell = (i: number) => cellsOf(grid)[i]!;
    expect(stateOf(cell(2))).toBe('vide');
    expect(stateOf(cell(0))).toBe('lune, case donnée');

    // Entrée = un toucher : vide → soleil → lune → vide.
    act(() => cell(2).focus());
    fireEvent.keyDown(cell(2), { key: 'Enter' });
    await waitFor(() => expect(stateOf(cell(2))).toBe('soleil'));
    fireEvent.keyDown(cell(2), { key: 'Enter' });
    await waitFor(() => expect(stateOf(cell(2))).toMatch(/^lune/));
    // 2 . [2] 2 2 . : trois lunes de suite avec les données 3 et 4 → conflit (annoncé après la fenêtre du second toucher).
    await waitFor(() => expect(stateOf(cell(2))).toBe('lune, en conflit'), { timeout: 3_000 });
    expect(stateOf(cell(3))).toBe('lune, case donnée, en conflit');
    expect(screen.getByText(/en conflit/, { selector: '.game__conflicts' }).textContent).toContain('cases en conflit');

    // Une case donnée ne change jamais.
    act(() => cell(0).focus());
    fireEvent.keyDown(cell(0), { key: 'Enter' });
    fireEvent.keyDown(cell(0), { key: '1' });
    expect(cell(0).getAttribute('aria-label')).toContain('lune, case donnée');

    // L'indice signale la case fausse ; « Corriger » la vide.
    fireEvent.click(hintButton());
    const sheet = await screen.findByRole('dialog', { name: 'Indice' }, { timeout: 5_000 });
    expect(within(sheet).getByText('Erreur')).toBeTruthy();
    expect(within(sheet).getByText(/Une case est fausse/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Corriger' }));
    });
    await waitFor(() => expect(stateOf(cell(2))).toBe('vide'), { timeout: 5_000 });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Indice' })).toBeNull(), { timeout: 5_000 });
  }, 30_000);

  it('saisie directe au clavier : 2 pose une lune en une seule étape annulable', async () => {
    renderGame();
    const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
    const cell = (i: number) => cellsOf(grid)[i]!;
    act(() => cell(5).focus());
    fireEvent.keyDown(cell(5), { key: '2' });
    await waitFor(() => expect(stateOf(cell(5))).toMatch(/^lune/));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(stateOf(cell(5))).toBe('vide'));
  }, 30_000);

  it('indices joués en boucle : chaque déduction est expliquée, la grille se résout, la victoire est annoncée', async () => {
    renderGame();
    const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
    // Cases remplies : le contenu est le premier état annoncé (« lune proposée par l’indice » n'en est pas un).
    const filled = () => cellsOf(grid).filter((c) => /^(soleil|lune)/.test(stateOf(c))).length;
    const titles = new Set<string>();
    for (let guard = 0; guard < 4 * puzzle.size * puzzle.size; guard++) {
      if (screen.queryByRole('heading', { name: /^Bravo/ })) break;
      if (!screen.queryByRole('dialog', { name: 'Indice' })) {
        await waitFor(() => expect((hintButton() as HTMLButtonElement).disabled).toBe(false), { timeout: 5_000 });
        fireEvent.click(hintButton());
      }
      const dialog = await screen.findByRole('dialog', { name: 'Indice' }, { timeout: 5_000 });
      titles.add(within(dialog).getByRole('heading', { level: 2 }).textContent ?? '');
      const before = filled();
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Jouer ce coup' }));
      });
      await waitFor(() => expect(filled() > before || screen.queryByRole('heading', { name: /^Bravo/ })).toBeTruthy(), { timeout: 5_000 });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Indice' })).toBeNull(), { timeout: 5_000 });
    }
    const title = await screen.findByRole('heading', { name: /^Bravo/ }, { timeout: 5_000 });
    await waitFor(() => expect(document.activeElement).toBe(title), { timeout: 5_000 });
    expect(filled()).toBe(36);
    expect(titles.size).toBeGreaterThan(0);
    expect([...titles].every((t) => t.length > 0 && !t.startsWith('hint.'))).toBe(true);
    // Grille gagnée : désactivée, plus aucune réaction.
    expect(grid.getAttribute('aria-disabled')).toBe('true');
  }, 60_000);

  it('règles du jeu : titre, règles et consigne de Binairo', async () => {
    renderGame();
    await screen.findByRole('grid', {}, { timeout: 15_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Règles' }));
    const dialog = await screen.findByRole('dialog', { name: 'Binairo' }, { timeout: 5_000 });
    expect(within(dialog).getByText(/autant de soleils que de lunes/)).toBeTruthy();
    expect(within(dialog).getByText(/Touchez une case vide/)).toBeTruthy();
  }, 30_000);
});
