/// <reference types="node" />
import { act, createEvent, fireEvent, render, within } from '@testing-library/react';
import { createInstance, type i18n as I18n } from 'i18next';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useCallback, useState } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, type QueensMark, type QueensPuzzle } from '../../../engine/queens/types';
import fr from '../../../locales/fr.json';
import { contrastRatio, hexToRgb, rgbToHex } from '../../theme/color';
import { regionPalette } from '../../theme/regions';
import { GRIDAY_SEED, createScheme } from '../../theme/scheme';
import type { HintHighlight } from './explain';
import type { GestureEvent } from './gestures';
import { MARKER_ALPHA, QueensBoard, cellStateKeys, regionLetter, type QueensBoardProps } from './QueensBoard';

// --- Banc d'essai ---------------------------------------------------------------------------------

// Vitest vide les imports CSS (même `?raw`) : on lit le fichier directement.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'QueensBoard.css'), 'utf8');

const N = 6;
/** Grille 6 × 6, régions en colonnes : la colonne c porte la région c (lettre « A » + c). */
const PUZZLE: QueensPuzzle = { size: N, regions: Array.from({ length: N * N }, (_, i) => i % N) };
const COLORS = regionPalette({ dark: false, count: N });
const EMPTY_MARKS: QueensMark[] = new Array<QueensMark>(N * N).fill(MARK_EMPTY);

let i18n: I18n;
beforeAll(async () => {
  i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: 'fr',
    resources: { fr: { translation: fr } },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
});

type Props = Partial<QueensBoardProps>;
const board = (props: Props, onGesture: (e: GestureEvent) => void) => (
  <I18nextProvider i18n={i18n}>
    <QueensBoard puzzle={PUZZLE} marks={EMPTY_MARKS} regionColors={COLORS} onGesture={onGesture} {...props} />
  </I18nextProvider>
);

/** Rend la grille avec une taille fixée (600 px, soit 100 px par case : jsdom n'a pas de mise en page). */
function setup(props: Props = {}) {
  const onGesture = vi.fn<(e: GestureEvent) => void>();
  const view = render(board(props, onGesture));
  const grid = within(view.container).getByRole('grid');
  grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  const cells = () => within(grid).getAllByRole('gridcell');
  return {
    ...view,
    grid,
    cells,
    cell: (i: number) => cells()[i]!,
    onGesture,
    update: (next: Props) => view.rerender(board({ ...props, ...next }, onGesture)),
  };
}

/** Centre de la case `cell` (px), décalé de (dx, dy). */
const at = (cell: number, dx = 0, dy = 0) => ({ clientX: (cell % N) * 100 + 50 + dx, clientY: Math.floor(cell / N) * 100 + 50 + dy });
/** Doigt primaire (premier contact). */
const finger = { pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0 };
/** Deuxième doigt : jamais primaire. */
const second = { pointerId: 2, isPrimary: false, pointerType: 'touch', button: 0 };

/** Focus donné « de l'extérieur » (lecteur d'écran, programme), dans un `act` pour vider les mises à jour React. */
const focus = (el: HTMLElement) => act(() => el.focus());

const label = (row: number, col: number, region: string, keys: string[]) =>
  i18n.t('game.cell.label', { row, col, region, state: keys.map((k) => i18n.t(`game.cell.${k}`)).join(', ') });

const labelCalls = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([key]) => key === 'game.cell.label').length;

// Scénario d'étiquettes : toutes les combinaisons d'états utiles dans une seule grille.
const Q = MARK_QUEEN;
const X = MARK_CROSS;
const SCENARIO: Props = {
  marks: EMPTY_MARKS.map((_, i): QueensMark => (i === 0 || i === 1 || i === 10 ? Q : i === 2 || i === 9 ? X : MARK_EMPTY)),
  conflicts: [0, 10],
  attacked: new Set([3, 9, 11]),
  highlight: {
    focus: [5, 10, 11],
    targets: [6],
    eliminate: [7, 9, 11],
    reveal: 11,
    revealMark: 'queen',
    mistakes: [4, 10, 11],
  } satisfies HintHighlight,
};

// --- Étiquettes pour les lecteurs d'écran -----------------------------------------------------------

describe('étiquettes des cases', () => {
  it('la lettre de région est celle de l’identifiant canonique (0 → A)', () => {
    expect([0, 1, 11, 25].map(regionLetter)).toEqual(['A', 'B', 'L', 'Z']);
    expect(regionLetter(26)).toBe('27');
  });

  it('chaque étiquette annonce ligne, colonne, région (lettre) puis l’état', () => {
    const { cell } = setup();
    for (const [i, row, col, region] of [
      [0, 1, 1, 'A'],
      [2, 1, 3, 'C'],
      [5, 1, 6, 'F'],
      [6, 2, 1, 'A'],
      [35, 6, 6, 'F'],
    ] as const) {
      expect(cell(i).getAttribute('aria-label')).toBe(label(row, col, region, ['empty']));
    }
  });

  it('compose la marque et les états annexes dans l’ordre de lecture, séparés par une virgule', () => {
    const { cell } = setup(SCENARIO);
    const expected: Record<number, string[]> = {
      0: ['conflict'], // reine en conflit (remplace « reine »)
      1: ['queen'],
      2: ['cross'],
      3: ['empty', 'attacked'],
      4: ['empty', 'mistake'],
      5: ['empty', 'highlighted'], // unité de l'indice
      6: ['empty', 'highlighted'], // cible
      7: ['empty', 'ruledOut'],
      8: ['empty'],
      9: ['cross'], // exclusions : cases vides seulement
      10: ['conflict', 'mistake', 'highlighted'],
      11: ['empty', 'mistake', 'highlighted', 'ruledOut', 'attacked', 'hinted'],
    };
    for (const [i, keys] of Object.entries(expected)) {
      const n = Number(i);
      expect(cell(n).getAttribute('aria-label'), `case ${n}`).toBe(label(Math.floor(n / N) + 1, (n % N) + 1, regionLetter(n % N), keys));
    }
    // Six états sur la dernière case, séparés par des virgules après la description de la case.
    const state = ['empty', 'mistake', 'highlighted', 'ruledOut', 'attacked', 'hinted'].map((k) => i18n.t(`game.cell.${k}`)).join(', ');
    expect(cell(11).getAttribute('aria-label')?.endsWith(state)).toBe(true);
  });

  it('cellStateKeys : ordre et conditions des états', () => {
    const base = { mark: MARK_EMPTY, conflict: false, mistake: false, highlighted: false, eliminate: false, attacked: false, hinted: false } as const;
    expect(cellStateKeys(base)).toEqual(['empty']);
    expect(cellStateKeys({ ...base, mark: MARK_QUEEN, conflict: true })).toEqual(['conflict']);
    expect(cellStateKeys({ ...base, mark: MARK_QUEEN, eliminate: true, attacked: true })).toEqual(['queen']);
    expect(cellStateKeys({ ...base, mark: MARK_CROSS, hinted: true, highlighted: true })).toEqual(['cross', 'highlighted', 'hinted']);
  });

  it('suit la langue active', async () => {
    const en = createInstance();
    const enJson = (await import('../../../locales/en.json')).default;
    await en.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: enJson } }, interpolation: { escapeValue: false } });
    const view = render(
      <I18nextProvider i18n={en}>
        <QueensBoard puzzle={PUZZLE} marks={EMPTY_MARKS} regionColors={COLORS} onGesture={() => undefined} />
      </I18nextProvider>,
    );
    const expected = en.t('game.cell.label', { row: 1, col: 3, region: 'C', state: en.t('game.cell.empty') });
    expect(expected).not.toBe(label(1, 3, 'C', ['empty'])); // bien une autre langue que le français
    expect(within(view.getByRole('grid')).getAllByRole('gridcell')[2]!.getAttribute('aria-label')).toBe(expected);
  });
});

// --- Éléments décoratifs ---------------------------------------------------------------------------

describe('SVG décoratifs', () => {
  it('reine, croix, fantômes, croix « exclue » et lignes sont masqués aux lecteurs d’écran et non focalisables', () => {
    const { container } = setup(SCENARIO);
    const svgs = [...container.querySelectorAll('svg')];
    for (const cls of ['qb__queen', 'qb__cross', 'qb__queen--ghost', 'qb__cross--ghost', 'qb__cross--attacked', 'qb__lines']) {
      expect(svgs.some((s) => s.classList.contains(cls)), cls).toBe(true);
    }
    expect(svgs.length).toBeGreaterThanOrEqual(8);
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden'), svg.getAttribute('class') ?? '').toBe('true');
      expect(svg.getAttribute('focusable'), svg.getAttribute('class') ?? '').toBe('false');
    }
  });

  it('une croix de l’indice sur une case vide dessine une croix fantôme, une reine de l’indice une reine fantôme', () => {
    const { cell, update } = setup({ highlight: { focus: [], targets: [], eliminate: [], reveal: 3, revealMark: 'cross', mistakes: [] } });
    expect(cell(3).querySelector('.qb__cross--ghost')).not.toBeNull();
    expect(cell(3).querySelector('.qb__queen--ghost')).toBeNull();
    update({ highlight: { focus: [], targets: [], eliminate: [], reveal: 3, revealMark: 'queen', mistakes: [] } });
    expect(cell(3).querySelector('.qb__queen--ghost')).not.toBeNull();
    // Une reine déjà posée n'a pas de fantôme.
    update({ marks: EMPTY_MARKS.map((m, i) => (i === 3 ? MARK_QUEEN : m)) });
    expect(cell(3).querySelector('.qb__queen--ghost')).toBeNull();
  });

  it('le conflit passe par un anneau, jamais par la couleur de la reine (CSS)', () => {
    const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const queenRules = rules.filter(([, selector]) => /qb__queen/.test(selector!));
    expect(queenRules.length).toBeGreaterThan(0);
    for (const [, selector, body] of queenRules) {
      for (const decl of body!.matchAll(/(?<![-\w])(fill|stroke|color)\s*:\s*([^;]+);/g)) {
        expect(decl[2]!.trim(), `${selector!.trim()} { ${decl[1]} }`).toBe('currentColor');
      }
    }
    // Aucun sélecteur ne dépend de l'état de la case pour recolorer la reine.
    expect(queenRules.some(([, selector]) => /--(conflict|mistake|reveal|focus)\s+\.qb__queen/.test(selector!))).toBe(false);
  });

  it('chaque anneau (conflit, erreur, case de l’indice, focus clavier) a un liseré intérieur couleur `on` et un liseré coloré', () => {
    const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const bodyOf = (selector: string) => rules.filter(([, sel]) => sel!.split(',').some((part) => part.trim() === selector)).map(([, , body]) => body!).join('\n');
    for (const [selector, color] of [
      ['.qb__cell--conflict::before', '--qb-ring-color'],
      ['.qb__cell--mistake::before', '--qb-ring-color'],
      ['.qb__cell--reveal::before', '--qb-ring-color'],
      ['.qb__cell:focus-visible::after', '--md-sys-color-secondary'],
    ] as const) {
      const body = bodyOf(selector);
      expect(body, selector).toMatch(/border:\s*var\(--qb-ring-inner\)\s+solid\s+currentColor/);
      expect(body, selector).toContain(color);
    }
    // Les couleurs de rôle des anneaux d'état.
    expect(bodyOf('.qb__cell--reveal')).toContain('--md-sys-color-primary');
    expect(bodyOf('.qb__cell--conflict')).toContain('--md-sys-color-error');
    expect(bodyOf('.qb__cell--mistake')).toContain('--md-sys-color-error');
  });

  it('le contour natif de la case est supprimé même face à la règle globale :focus-visible', () => {
    const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const none = rules.find(([, sel, body]) => sel!.includes('.qb__cell:focus-visible') && !sel!.includes('::') && /outline:\s*none/.test(body!));
    expect(none).toBeDefined();
  });
});

// --- Activation sans événements pointeur ----------------------------------------------------------------

describe('activation par clic synthétique (clavier, lecteur d’écran)', () => {
  it('un clic de détail 0 sur une case la touche', () => {
    const { cell, onGesture } = setup();
    fireEvent.click(cell(7), { detail: 0 });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: 7 });
  });

  it('un clic de détail 0 sur un élément à l’intérieur de la case (ex. la reine) vise la case', () => {
    const { cell, onGesture } = setup({ marks: EMPTY_MARKS.map((m, i) => (i === 7 ? MARK_QUEEN : m)) });
    fireEvent.click(cell(7).querySelector('svg')!, { detail: 0 });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: 7 });
  });

  it('un clic de souris ou de doigt (détail ≥ 1) est déjà traité par les événements pointeur', () => {
    const { cell, onGesture } = setup();
    fireEvent.click(cell(7), { detail: 1 });
    fireEvent.click(cell(7), { detail: 2 });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('un clic hors des cases, ou grille désactivée, ne fait rien', () => {
    const { grid, cell, onGesture, update } = setup();
    fireEvent.click(grid, { detail: 0 });
    expect(onGesture).not.toHaveBeenCalled();
    update({ disabled: true });
    fireEvent.click(cell(1), { detail: 0 });
    expect(onGesture).not.toHaveBeenCalled();
  });
});

// --- Pointeurs -------------------------------------------------------------------------------------------

describe('gestes tactiles', () => {
  it('un toucher dont le doigt dérive de 3 px par-dessus une frontière pose une reine (toucher sur la case d’appui)', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, clientX: 99, clientY: 50 }); // case 0, à 1 px de la case 1
    fireEvent.pointerMove(grid, { ...finger, clientX: 102, clientY: 50 }); // case 1
    fireEvent.pointerUp(grid, { ...finger, clientX: 102, clientY: 50 });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: 0 });
  });

  it('un relâchement sans aucun déplacement précédent est évalué à sa position (pas de toucher fantôme)', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(0) });
    fireEvent.pointerUp(grid, { ...finger, ...at(2) }); // 200 px plus loin, sans pointermove
    expect(onGesture.mock.calls.map(([e]) => e.type)).toEqual(['paint']);
    expect(onGesture.mock.calls[0]![0]).toMatchObject({ cells: [0, 2], mode: 'cross' });
  });

  it('un glisser sur d’autres cases peint ; un seul identifiant de trait par glisser', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(0) });
    fireEvent.pointerMove(grid, { ...finger, ...at(0, 10) }); // dans la tolérance (30 px)
    fireEvent.pointerMove(grid, { ...finger, ...at(1) });
    fireEvent.pointerMove(grid, { ...finger, ...at(2) });
    fireEvent.pointerMove(grid, { ...finger, ...at(2, 5) });
    fireEvent.pointerUp(grid, { ...finger, ...at(2) });
    const events = onGesture.mock.calls.map(([e]) => e);
    expect(events).toEqual([
      { type: 'paint', cells: [0, 1], mode: 'cross', stroke: expect.any(Number) },
      { type: 'paint', cells: [2], mode: 'cross', stroke: expect.any(Number) },
    ]);
    const [a, b] = events as Extract<GestureEvent, { type: 'paint' }>[];
    expect(a!.stroke).toBe(b!.stroke);

    // Un second glisser reçoit un autre identifiant.
    fireEvent.pointerDown(grid, { ...finger, ...at(6) });
    fireEvent.pointerMove(grid, { ...finger, ...at(7) });
    fireEvent.pointerUp(grid, { ...finger, ...at(7) });
    const third = onGesture.mock.calls[2]![0] as Extract<GestureEvent, { type: 'paint' }>;
    expect(third.stroke).toBeGreaterThan(a!.stroke);
  });

  it('glisser depuis une croix gomme', () => {
    const { grid, onGesture } = setup({ marks: EMPTY_MARKS.map((m, i) => (i === 0 ? MARK_CROSS : m)) });
    fireEvent.pointerDown(grid, { ...finger, ...at(0) });
    fireEvent.pointerMove(grid, { ...finger, ...at(1) });
    fireEvent.pointerUp(grid, { ...finger, ...at(1) });
    expect(onGesture.mock.calls[0]![0]).toMatchObject({ type: 'paint', cells: [0, 1], mode: 'erase' });
  });

  it('double toucher : deux touchers rapides sur la même case, malgré la dérive du doigt', () => {
    const { grid, onGesture } = setup();
    const tap = (clientX: number, timeStamp: number) => {
      const up = createEvent.pointerUp(grid, { ...finger, clientX, clientY: 50 });
      Object.defineProperty(up, 'timeStamp', { value: timeStamp });
      fireEvent.pointerDown(grid, { ...finger, clientX: 99, clientY: 50 });
      fireEvent(grid, up);
    };
    tap(101, 1000); // relâché dans la case 1, case d'appui = 0
    tap(102, 1200);
    expect(onGesture.mock.calls.map(([e]) => e)).toEqual([
      { type: 'tap', cell: 0 },
      { type: 'doubleTap', cell: 0 },
    ]);
  });

  it('un clic droit de souris n’agit pas', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { pointerId: 5, isPrimary: true, pointerType: 'mouse', button: 2, ...at(3) });
    fireEvent.pointerUp(grid, { pointerId: 5, isPrimary: true, pointerType: 'mouse', button: 2, ...at(3) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('grille désactivée (victoire) : aucun geste', () => {
    const { grid, onGesture } = setup({ disabled: true });
    fireEvent.pointerDown(grid, { ...finger, ...at(0) });
    fireEvent.pointerMove(grid, { ...finger, ...at(1) });
    fireEvent.pointerUp(grid, { ...finger, ...at(1) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('une annulation du pointeur (geste système) abandonne le geste en cours', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(0) });
    fireEvent.pointerCancel(grid, { ...finger, ...at(0) });
    fireEvent.pointerUp(grid, { ...finger, ...at(0) });
    expect(onGesture).not.toHaveBeenCalled();
  });
});

describe('multi-touch', () => {
  it('un pointeur non primaire est ignoré partout (appui, déplacement, relâchement)', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...second, ...at(0) });
    fireEvent.pointerMove(grid, { ...second, ...at(1) });
    fireEvent.pointerMove(grid, { ...second, ...at(2) });
    fireEvent.pointerUp(grid, { ...second, ...at(2) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('un événement non primaire est ignoré même avec l’identifiant du pointeur suivi', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(0) });
    fireEvent.pointerMove(grid, { ...finger, isPrimary: false, ...at(1) });
    fireEvent.pointerMove(grid, { ...finger, isPrimary: false, ...at(2) });
    fireEvent.pointerUp(grid, { ...finger, isPrimary: false, ...at(2) });
    fireEvent.pointerCancel(grid, { ...finger, isPrimary: false, ...at(2) });
    expect(onGesture).not.toHaveBeenCalled();
    fireEvent.pointerUp(grid, { ...finger, ...at(0, 3) }); // le geste du doigt primaire est resté intact
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: 0 });
  });

  it('un 2e doigt posé pendant un toucher ne peint jamais et ne perturbe pas le toucher du 1er', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(0) });
    fireEvent.pointerDown(grid, { ...second, ...at(8) });
    fireEvent.pointerMove(grid, { ...second, ...at(9) });
    fireEvent.pointerMove(grid, { ...second, ...at(10) });
    fireEvent.pointerUp(grid, { ...second, ...at(10) });
    fireEvent.pointerUp(grid, { ...finger, ...at(0, 2) });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: 0 });
  });

  it('un 2e doigt posé pendant un glisser ne s’ajoute pas à la peinture', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(0) });
    fireEvent.pointerMove(grid, { ...finger, ...at(1) });
    fireEvent.pointerDown(grid, { ...second, ...at(12) });
    fireEvent.pointerMove(grid, { ...second, ...at(13) });
    fireEvent.pointerMove(grid, { ...second, ...at(14) });
    fireEvent.pointerUp(grid, { ...second, ...at(14) });
    fireEvent.pointerUp(grid, { ...finger, ...at(1) });
    expect(onGesture.mock.calls.map(([e]) => e)).toEqual([{ type: 'paint', cells: [0, 1], mode: 'cross', stroke: expect.any(Number) }]);
  });

  it('un autre pointeur, même primaire de son type (souris + doigt), n’est pas celui qui a été capturé', () => {
    const { grid, onGesture } = setup();
    const mouse = { pointerId: 7, isPrimary: true, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(grid, { ...finger, ...at(0) });
    fireEvent.pointerMove(grid, { ...mouse, ...at(1) });
    fireEvent.pointerMove(grid, { ...mouse, ...at(2) });
    fireEvent.pointerUp(grid, { ...mouse, ...at(2) });
    expect(onGesture).not.toHaveBeenCalled();
    fireEvent.pointerUp(grid, { ...finger, ...at(0) });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: 0 });
  });

  it('le déplacement d’une souris sans bouton enfoncé ne fait rien', () => {
    const { grid, onGesture } = setup();
    const mouse = { pointerId: 7, isPrimary: true, pointerType: 'mouse', button: -1 };
    fireEvent.pointerMove(grid, { ...mouse, ...at(0) });
    fireEvent.pointerMove(grid, { ...mouse, ...at(1) });
    expect(onGesture).not.toHaveBeenCalled();
  });
});

// --- Clavier ---------------------------------------------------------------------------------------------

describe('clavier', () => {
  const tabbable = (cells: HTMLElement[]) => cells.filter((c) => c.tabIndex === 0).map((c) => Number(c.dataset['cell']));

  it('une seule case est tabulable (index « roving ») ; le focus clavier la déplace', () => {
    const { cells, cell } = setup();
    expect(tabbable(cells())).toEqual([0]);
    focus(cell(0));
    fireEvent.keyDown(cell(0), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1));
    expect(tabbable(cells())).toEqual([1]);
    fireEvent.keyDown(cell(1), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(1 + N));
    fireEvent.keyDown(cell(1 + N), { key: 'ArrowLeft' });
    fireEvent.keyDown(cell(N), { key: 'ArrowLeft' }); // bord gauche : reste sur place
    expect(document.activeElement).toBe(cell(N));
    fireEvent.keyDown(cell(N), { key: 'ArrowUp' });
    fireEvent.keyDown(cell(0), { key: 'ArrowUp' }); // bord haut
    expect(document.activeElement).toBe(cell(0));
    expect(tabbable(cells())).toEqual([0]);
  });

  it('un focus donné de l’extérieur (lecteur d’écran, programme) déplace la case tabulable', () => {
    const { cells, cell } = setup();
    focus(cell(20));
    expect(tabbable(cells())).toEqual([20]);
    fireEvent.focus(cell(33));
    expect(tabbable(cells())).toEqual([33]);
    // Les flèches partent alors de la case réellement focalisée.
    fireEvent.keyDown(cell(33), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell(32));
  });

  it('toucher une case rend celle-ci tabulable', () => {
    const { grid, cells } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(14) });
    expect(tabbable(cells())).toEqual([14]);
  });

  it('la case tabulable reste dans la grille quand la taille change (nouvelle grille)', () => {
    const big: QueensPuzzle = { size: 10, regions: Array.from({ length: 100 }, (_, i) => i % 10) };
    const bigProps: Props = { puzzle: big, marks: new Array<QueensMark>(100).fill(MARK_EMPTY), regionColors: regionPalette({ dark: false, count: 10 }) };
    const { container, update } = setup(bigProps);
    const cellsOf = () => within(within(container).getByRole('grid')).getAllByRole('gridcell');
    focus(cellsOf()[99]!);
    expect(tabbable(cellsOf())).toEqual([99]);
    update({ puzzle: PUZZLE, marks: EMPTY_MARKS, regionColors: COLORS });
    expect(cellsOf()).toHaveLength(N * N);
    expect(tabbable(cellsOf())).toEqual([0]);
  });

  it('les touches de navigation et d’action empêchent le comportement par défaut (défilement de la page)', () => {
    const { cell } = setup();
    focus(cell(8));
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ', 'x', 'X', 'Delete', 'Backspace']) {
      expect(fireEvent.keyDown(document.activeElement!, { key }), key).toBe(false);
    }
    expect(fireEvent.keyDown(document.activeElement!, { key: 'Tab' })).toBe(true); // Tab quitte la grille normalement
    expect(fireEvent.keyDown(document.activeElement!, { key: 'a' })).toBe(true);
  });

  it('Début / Fin : début et fin de ligne ; Ctrl ou Cmd + Début / Fin : première et dernière case', () => {
    const { cell } = setup();
    focus(cell(8)); // ligne 2, colonne 3
    fireEvent.keyDown(cell(8), { key: 'Home' });
    expect(document.activeElement).toBe(cell(6));
    fireEvent.keyDown(cell(6), { key: 'End' });
    expect(document.activeElement).toBe(cell(11));
    fireEvent.keyDown(cell(11), { key: 'End', ctrlKey: true });
    expect(document.activeElement).toBe(cell(N * N - 1));
    fireEvent.keyDown(cell(N * N - 1), { key: 'Home', metaKey: true });
    expect(document.activeElement).toBe(cell(0));
    fireEvent.keyDown(cell(0), { key: 'End', metaKey: true });
    expect(document.activeElement).toBe(cell(N * N - 1));
    fireEvent.keyDown(cell(N * N - 1), { key: 'Home', ctrlKey: true });
    expect(document.activeElement).toBe(cell(0));
  });

  it('Entrée et Espace touchent la case focalisée (sans répétition automatique)', () => {
    const { cell, onGesture } = setup();
    focus(cell(4));
    expect(fireEvent.keyDown(cell(4), { key: 'Enter' })).toBe(false); // défaut empêché
    fireEvent.keyDown(cell(4), { key: ' ' });
    fireEvent.keyDown(cell(4), { key: 'Enter', repeat: true });
    expect(onGesture.mock.calls.map(([e]) => e)).toEqual([
      { type: 'tap', cell: 4 },
      { type: 'tap', cell: 4 },
    ]);
  });

  it('X pose ou retire une croix ; chaque appui prend un identifiant de trait neuf', () => {
    const { cell, onGesture, update } = setup();
    focus(cell(3));
    fireEvent.keyDown(cell(3), { key: 'x' });
    fireEvent.keyDown(cell(3), { key: 'X', shiftKey: true });
    update({ marks: EMPTY_MARKS.map((m, i) => (i === 3 ? MARK_CROSS : m)) });
    fireEvent.keyDown(cell(3), { key: 'x' });
    const [a, b, c] = onGesture.mock.calls.map(([e]) => e as Extract<GestureEvent, { type: 'paint' }>);
    expect([a, b, c].map((e) => [e!.type, e!.cells, e!.mode])).toEqual([
      ['paint', [3], 'cross'],
      ['paint', [3], 'cross'],
      ['paint', [3], 'erase'],
    ]);
    expect(new Set([a!.stroke, b!.stroke, c!.stroke]).size).toBe(3);
  });

  it('Suppr / Retour arrière : retire la reine (toucher) ou la croix (gomme) ; rien sur une case vide', () => {
    const marks = EMPTY_MARKS.map((m, i): QueensMark => (i === 1 ? MARK_QUEEN : i === 2 ? MARK_CROSS : m));
    const { cell, onGesture } = setup({ marks });
    fireEvent.keyDown(cell(0), { key: 'Delete' });
    expect(onGesture).not.toHaveBeenCalled();
    fireEvent.keyDown(cell(1), { key: 'Delete' });
    fireEvent.keyDown(cell(2), { key: 'Backspace' });
    expect(onGesture.mock.calls.map(([e]) => e)).toEqual([
      { type: 'tap', cell: 1 },
      { type: 'paint', cells: [2], mode: 'erase', stroke: expect.any(Number) },
    ]);
  });

  it('les raccourcis du navigateur (Ctrl+X, Alt+flèche) ne sont pas détournés', () => {
    const { cell, onGesture } = setup();
    focus(cell(0));
    expect(fireEvent.keyDown(cell(0), { key: 'x', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(cell(0), { key: 'Enter', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(cell(0), { key: 'ArrowRight', altKey: true })).toBe(true);
    expect(document.activeElement).toBe(cell(0));
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('grille désactivée : la navigation reste possible, mais aucune action', () => {
    const { cell, onGesture } = setup({ disabled: true });
    focus(cell(0));
    fireEvent.keyDown(cell(0), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1));
    fireEvent.keyDown(cell(1), { key: 'Enter' });
    fireEvent.keyDown(cell(1), { key: 'x' });
    expect(onGesture).not.toHaveBeenCalled();
  });
});

// --- Rendu : surbrillances, motifs, mémoïsation -----------------------------------------------------------

describe('rendu', () => {
  it('états visuels : classes d’indice, de conflit et de case jouée', () => {
    const { cell } = setup(SCENARIO);
    expect(cell(0).classList.contains('qb__cell--conflict')).toBe(true);
    expect(cell(4).classList.contains('qb__cell--mistake')).toBe(true);
    expect(cell(5).classList.contains('qb__cell--focus')).toBe(true);
    expect(cell(6).classList.contains('qb__cell--target')).toBe(true);
    expect(cell(11).classList.contains('qb__cell--reveal')).toBe(true);
    expect(cell(8).className).toBe('qb__cell');
  });

  it('unité surlignée : le filet ne longe que le contour de l’unité, pas les limites entre ses cases', () => {
    const hint = (focus: number[]): HintHighlight => ({ focus, targets: [], eliminate: [], reveal: null, revealMark: null, mistakes: [] });
    const TOP = 'inset 0 2px 0 0';
    const RIGHT = 'inset -2px 0 0 0';
    const BOTTOM = 'inset 0 -2px 0 0';
    const LEFT = 'inset 2px 0 0 0';
    const sides = (el: HTMLElement) => [TOP, RIGHT, BOTTOM, LEFT].filter((side) => el.style.getPropertyValue('--qb-fe').includes(side));

    // Ligne 2 entière : haut et bas partout, gauche au début, droite à la fin.
    const row = setup({ highlight: hint([6, 7, 8, 9, 10, 11]) });
    expect(sides(row.cell(6))).toEqual([TOP, BOTTOM, LEFT]);
    for (const i of [7, 8, 9, 10]) expect(sides(row.cell(i)), `case ${i}`).toEqual([TOP, BOTTOM]);
    expect(sides(row.cell(11))).toEqual([TOP, RIGHT, BOTTOM]);
    expect(sides(row.cell(0))).toEqual([]); // hors unité
    expect(row.cell(0).classList.contains('qb__cell--focus')).toBe(false);
    row.unmount();

    // Bloc 2 × 2 (cases 7, 8, 13, 14) : chaque case ne borde l'extérieur que par deux côtés.
    const block = setup({ highlight: hint([7, 8, 13, 14]) });
    expect(sides(block.cell(7))).toEqual([TOP, LEFT]);
    expect(sides(block.cell(8))).toEqual([TOP, RIGHT]);
    expect(sides(block.cell(13))).toEqual([BOTTOM, LEFT]);
    expect(sides(block.cell(14))).toEqual([RIGHT, BOTTOM]);
    block.unmount();

    // Case isolée, ou colonne au bord de la grille : tout le tour (valeur par défaut du CSS) ou les côtés restants.
    const alone = setup({ highlight: hint([14]) });
    expect(alone.cell(14).classList.contains('qb__cell--focus')).toBe(true);
    expect(alone.cell(14).style.getPropertyValue('--qb-fe')).toBe('');
    alone.unmount();
    const column = setup({ highlight: hint([0, 6, 12, 18, 24, 30]) });
    expect(sides(column.cell(0))).toEqual([TOP, RIGHT, LEFT]);
    expect(sides(column.cell(18))).toEqual([RIGHT, LEFT]);
    expect(sides(column.cell(30))).toEqual([RIGHT, BOTTOM, LEFT]);
  });

  it('motifs de régions seulement si demandés', () => {
    const plain = setup();
    expect(plain.container.querySelector('[class*="qb__cell--pattern"]')).toBeNull();
    plain.unmount();
    const { cell } = setup({ patterns: true });
    expect(cell(1).className).toMatch(/qb__cell--pattern-1/);
    expect(cell(0).className).not.toMatch(/pattern/); // motif 0 = aucun
  });

  it('victoire : animation de célébration et grille désactivée', () => {
    const { container, grid } = setup({ celebrate: true, disabled: true });
    expect(container.querySelector('.qb--celebrate')).not.toBeNull();
    expect(container.querySelector('.qb--disabled')).not.toBeNull();
    expect(grid.getAttribute('aria-disabled')).toBe('true');
  });

  it('grande grille : anneaux d’état plus fins (data-dense)', () => {
    const big: QueensPuzzle = { size: 10, regions: Array.from({ length: 100 }, (_, i) => i % 10) };
    const view = render(
      <I18nextProvider i18n={i18n}>
        <QueensBoard puzzle={big} marks={new Array<QueensMark>(100).fill(MARK_EMPTY)} regionColors={regionPalette({ dark: false, count: 10 })} onGesture={() => undefined} />
      </I18nextProvider>,
    );
    expect(view.container.querySelector('.qb')?.hasAttribute('data-dense')).toBe(true);
    expect(setup().container.querySelector('.qb')?.hasAttribute('data-dense')).toBe(false);
  });

  it('mémoïsation : un toucher ne rend que la case modifiée (et celle qui perd l’index tabulable)', () => {
    const spy = vi.spyOn(i18n, 't');
    try {
      function Harness() {
        const [marks, setMarks] = useState<QueensMark[]>(EMPTY_MARKS);
        const gesture = useCallback((e: GestureEvent) => {
          if (e.type === 'tap') setMarks((m) => m.map((v, i) => (i === e.cell ? (v === MARK_QUEEN ? MARK_EMPTY : MARK_QUEEN) : v)));
        }, []);
        return <QueensBoard puzzle={PUZZLE} marks={marks} regionColors={COLORS} onGesture={gesture} />;
      }
      const view = render(
        <I18nextProvider i18n={i18n}>
          <Harness />
        </I18nextProvider>,
      );
      const grid = view.getByRole('grid');
      grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
      expect(labelCalls(spy)).toBe(N * N); // premier rendu : toutes les cases

      spy.mockClear();
      fireEvent.pointerDown(grid, { ...finger, ...at(7) });
      expect(labelCalls(spy)).toBe(2); // case 0 (perd l'index tabulable) et case 7 (le reçoit)

      spy.mockClear();
      fireEvent.pointerUp(grid, { ...finger, ...at(7) });
      expect(labelCalls(spy)).toBe(1); // case 7 seule : la reine
      expect(within(grid).getAllByRole('gridcell')[7]!.getAttribute('aria-label')).toBe(label(2, 2, 'B', ['queen']));
    } finally {
      spy.mockRestore();
    }
  });

  it('mémoïsation : un indice ne rend que les cases surlignées', () => {
    const spy = vi.spyOn(i18n, 't');
    try {
      const { update } = setup();
      spy.mockClear();
      update({ highlight: { focus: [1, 2], targets: [], eliminate: [3], reveal: null, revealMark: null, mistakes: [] } });
      expect(labelCalls(spy)).toBe(3);
      spy.mockClear();
      update({ highlight: null });
      expect(labelCalls(spy)).toBe(3);
    } finally {
      spy.mockRestore();
    }
  });
});

// --- Contraste des marqueurs ------------------------------------------------------------------------------

describe('contraste des marqueurs (WCAG 1.4.11, ≥ 3:1 ; reine ≥ 4,5:1)', () => {
  /** Composition sRGB d'une couleur à l'opacité `alpha` sur un fond opaque (comme le navigateur). */
  const over = (fg: string, bg: string, alpha: number): string => {
    const f = hexToRgb(fg);
    const b = hexToRgb(bg);
    return rgbToHex([0, 1, 2].map((i) => alpha * f[i]! + (1 - alpha) * b[i]!) as [number, number, number]);
  };

  const SEEDS = [GRIDAY_SEED, 0xff0061a4, 0xff386a20, 0xffb3261e, 0xffe3b800, 0xff808000, 0xff777777];
  // 4 à 12 régions en jeu ; 16 et 24 couvrent une palette plus grande dans laquelle on choisirait les couleurs.
  const COUNTS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 24];
  interface Sample {
    readonly where: string;
    readonly fill: string;
    readonly on: string;
    readonly error: string;
    readonly primary: string;
    readonly secondary: string;
  }
  const samples = (dark: boolean): Sample[] =>
    SEEDS.flatMap((seed) => {
      const scheme = createScheme({ seed, dark });
      return COUNTS.flatMap((count) =>
        regionPalette({ seed, dark, count }).map(
          (c, i): Sample => ({
            where: `${dark ? 'sombre' : 'clair'} graine ${seed.toString(16)} ${count} régions #${i} ${c.fill}/${c.on}`,
            fill: c.fill,
            on: c.on,
            error: scheme.error,
            primary: scheme.primary,
            secondary: scheme.secondary,
          }),
        ),
      );
    });

  it.each([
    ['clair', false],
    ['sombre', true],
  ] as const)('thème %s, sur tous les fonds de toutes les palettes', (_name, dark) => {
    const all = samples(dark);
    expect(all.length).toBeGreaterThan(300);
    for (const s of all) {
      // Reine : couleur `on`, jamais recolorée.
      expect(contrastRatio(s.on, s.fill), `reine ${s.where}`).toBeGreaterThanOrEqual(4.5);
      // Croix du joueur, reine et croix fantômes (contour pointillé), petite croix « case exclue ».
      for (const [name, alpha] of Object.entries(MARKER_ALPHA)) {
        expect(contrastRatio(over(s.on, s.fill, alpha), s.fill), `${name} (opacité ${alpha}) ${s.where}`).toBeGreaterThanOrEqual(3);
      }
      // Anneaux (conflit, erreur, case de l'indice, focus clavier) : le liseré intérieur est en couleur `on`.
      expect(contrastRatio(s.on, s.fill), `liseré intérieur ${s.where}`).toBeGreaterThanOrEqual(4.5);
      for (const ring of [s.error, s.primary, s.secondary]) {
        expect(Math.max(contrastRatio(ring, s.fill), contrastRatio(s.on, s.fill)), `anneau ${ring} ${s.where}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('en clair, le liseré coloré des anneaux contraste lui aussi ≥ 3:1 ; en sombre il ne suffirait pas seul', () => {
    for (const s of samples(false)) {
      for (const ring of [s.error, s.primary, s.secondary]) expect(contrastRatio(ring, s.fill), `${ring} ${s.where}`).toBeGreaterThanOrEqual(3);
    }
    // C'est pourquoi chaque anneau comporte un liseré `on` : en sombre, les rôles de couleur frôlent 2:1 sur certains fonds.
    const darkWorst = Math.min(...samples(true).flatMap((s) => [s.error, s.primary, s.secondary].map((ring) => contrastRatio(ring, s.fill))));
    expect(darkWorst).toBeLessThan(3);
  });

  it('le test n’est pas trivial : des opacités plus faibles passeraient sous 3:1', () => {
    const worst = (alpha: number) =>
      Math.min(...[...samples(false), ...samples(true)].map((s) => contrastRatio(over(s.on, s.fill, alpha), s.fill)));
    expect(worst(MARKER_ALPHA.attacked)).toBeGreaterThanOrEqual(3);
    expect(worst(0.5)).toBeLessThan(3);
  });
});
