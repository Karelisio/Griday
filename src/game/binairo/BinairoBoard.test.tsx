/// <reference types="node" />
import { act, fireEvent, render, within } from '@testing-library/react';
import { createInstance, type i18n as I18n } from 'i18next';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useCallback, useState } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { BinairoCell, BinairoSolvedPuzzle } from '../../../engine/binairo/types';
import fr from '../../../locales/fr.json';
import { COLOR_VISION_DEFICIENCIES, contrastRatio, deltaE, deltaEColorVision, hexToRgb, rgbToHex } from '../../theme/color';
import { GRIDAY_SEED, createScheme } from '../../theme/scheme';
import type { GameGesture } from '../core/kind';
import { BinairoBoard, EDGE_ALPHA, GHOST_ALPHA, cellStateKeys, type BinairoBoardProps } from './BinairoBoard';
import { NO_HIGHLIGHT, type BinairoHighlight } from './explain';
import { SYMBOL_LEVELS, binairoPalette } from './palette';
import { BINAIRO_RULES } from './rules';

// --- Banc d'essai ---------------------------------------------------------------------------------

// Vitest vide les imports CSS (même `?raw`) : on lit le fichier directement.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'BinairoBoard.css'), 'utf8');

const N = 6;
/** Grille 6 × 6 à solution unique (1 = soleil, 2 = lune) : 16 cases données, 20 libres. */
const PUZZLE: BinairoSolvedPuzzle = {
  size: N,
  givens: [2, 0, 0, 2, 2, 0, 0, 1, 0, 2, 1, 2, 1, 2, 0, 0, 0, 2, 0, 0, 2, 0, 2, 1, 0, 0, 0, 0, 1, 2, 0, 2, 0, 0, 0, 0],
  solution: [2, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 1, 2, 2, 1, 2, 1],
};
/** Cases données (0, 3, 4, 7, …) et cases libres (1, 2, 5, 6, …). */
const GIVEN = 0;
const FREE = 1;
const START: BinairoCell[] = [...PUZZLE.givens];
const NO_CONFLICTS: readonly number[] = [];

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

type Props = Partial<BinairoBoardProps>;
const board = (props: Props, onGesture: (e: GameGesture) => void) => (
  <I18nextProvider i18n={i18n}>
    <BinairoBoard puzzle={PUZZLE} marks={START} conflicts={NO_CONFLICTS} highlight={null} disabled={false} celebrate={false} onGesture={onGesture} {...props} />
  </I18nextProvider>
);

/** Rend la grille avec une taille fixée (600 px, soit 100 px par case : jsdom n'a pas de mise en page). */
function setup(props: Props = {}) {
  const onGesture = vi.fn<(e: GameGesture) => void>();
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

const withMarks = (changes: Record<number, BinairoCell>): BinairoCell[] => START.map((m, i) => changes[i] ?? m);

const label = (row: number, col: number, keys: string[]) =>
  i18n.t('game.cell.labelPlain', { row, col, state: keys.map((k) => i18n.t(`game.cell.${k}`)).join(', ') });

const labelCalls = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([key]) => key === 'game.cell.labelPlain').length;

/** Scénario d'étiquettes : conflit, erreur, ligne, pivots et symboles proposés dans une seule grille. */
const HIGHLIGHT: BinairoHighlight = {
  line: [6, 7, 8, 9, 10, 11], // rangée 2
  other: [],
  pivots: [7, 9],
  places: [
    { cell: 6, value: 1 },
    { cell: 8, value: 2 },
  ],
  mistakes: [2],
};
const SCENARIO: Props = { marks: withMarks({ 1: 1, 2: 2 }), conflicts: [0, 1], highlight: HIGHLIGHT };

// --- Structure et étiquettes ---------------------------------------------------------------------------

describe('grille et étiquettes des cases', () => {
  it('grille ARIA : une grille nommée, n rangées, n² cases', () => {
    const { grid, container, cells } = setup();
    expect(grid.getAttribute('aria-label')).toBe(i18n.t('game.board', { n: N }));
    expect(container.querySelectorAll('[role="row"]')).toHaveLength(N);
    expect(cells()).toHaveLength(N * N);
    cells().forEach((c, i) => expect(c.dataset['cell']).toBe(String(i)));
  });

  it('chaque étiquette annonce ligne, colonne puis l’état (vide, soleil, lune, case donnée)', () => {
    const { cell } = setup({ marks: withMarks({ 1: 1, 2: 2 }) });
    const expected: [number, number, number, string[]][] = [
      [0, 1, 1, ['moon', 'given']],
      [1, 1, 2, ['sun']],
      [2, 1, 3, ['moon']],
      [5, 1, 6, ['empty']],
      [7, 2, 2, ['sun', 'given']],
      [35, 6, 6, ['empty']],
    ];
    for (const [i, row, col, keys] of expected) expect(cell(i).getAttribute('aria-label'), `case ${i}`).toBe(label(row, col, keys));
    expect(label(1, 2, ['sun'])).toBe('Ligne 1, colonne 2\u00a0: soleil');
  });

  it('seules les cases données sont désactivées (aria-disabled)', () => {
    const { cells } = setup();
    cells().forEach((c, i) => expect(c.getAttribute('aria-disabled'), `case ${i}`).toBe(PUZZLE.givens[i] !== 0 ? 'true' : null));
  });

  it('compose les états annexes dans l’ordre de lecture, séparés par une virgule', () => {
    const { cell } = setup(SCENARIO);
    const expected: Record<number, string[]> = {
      0: ['moon', 'given', 'inConflict'], // donnée en conflit
      1: ['sun', 'inConflict'],
      2: ['moon', 'mistake'],
      3: ['moon', 'given'],
      5: ['empty'],
      6: ['empty', 'highlighted', 'proposedSun'],
      7: ['sun', 'given', 'highlighted'], // pivot
      8: ['empty', 'highlighted', 'proposedMoon'],
      9: ['moon', 'given', 'highlighted'],
      10: ['sun', 'given', 'highlighted'],
      14: ['empty'],
    };
    for (const [i, keys] of Object.entries(expected)) {
      const n = Number(i);
      expect(cell(n).getAttribute('aria-label'), `case ${n}`).toBe(label(Math.floor(n / N) + 1, (n % N) + 1, keys));
    }
  });

  it('cellStateKeys : ordre et conditions des états', () => {
    const base = { mark: 0, given: false, conflict: false, mistake: false, highlighted: false, proposed: 0 } as const;
    expect(cellStateKeys(base)).toEqual(['empty']);
    expect(cellStateKeys({ ...base, mark: 1 })).toEqual(['sun']);
    expect(cellStateKeys({ ...base, mark: 2, given: true, conflict: true })).toEqual(['moon', 'given', 'inConflict']);
    expect(cellStateKeys({ ...base, mistake: true, highlighted: true, proposed: 1 })).toEqual(['empty', 'mistake', 'highlighted', 'proposedSun']);
    expect(cellStateKeys({ ...base, proposed: 2 })).toEqual(['empty', 'proposedMoon']);
    // Un symbole proposé sur une case déjà remplie n'est pas annoncé.
    expect(cellStateKeys({ ...base, mark: 1, proposed: 2 })).toEqual(['sun']);
  });

  it('suit la langue active', async () => {
    const en = createInstance();
    const enJson = (await import('../../../locales/en.json')).default;
    await en.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: enJson } }, interpolation: { escapeValue: false } });
    const view = render(
      <I18nextProvider i18n={en}>
        <BinairoBoard puzzle={PUZZLE} marks={START} conflicts={NO_CONFLICTS} highlight={null} disabled={false} celebrate={false} onGesture={() => undefined} />
      </I18nextProvider>,
    );
    const cell = within(view.getByRole('grid')).getAllByRole('gridcell')[0]!;
    expect(cell.getAttribute('aria-label')).toBe('Row 1, column 1: moon, given cell');
    expect(en.t('game.cell.sun')).toBe('sun');
  });
});

// --- Éléments décoratifs ---------------------------------------------------------------------------

describe('symboles', () => {
  it('soleil et lune ont des formes différentes (disque à rayons / croissant), jamais seulement une couleur', () => {
    const { cell } = setup({ marks: withMarks({ 1: 1, 2: 2 }) });
    const sun = cell(1).querySelector('svg')!;
    const moon = cell(2).querySelector('svg')!;
    expect(sun.classList.contains('bb__sym--sun')).toBe(true);
    expect(sun.querySelector('circle.bb__disc')).not.toBeNull();
    expect(sun.querySelector('path.bb__rays')).not.toBeNull();
    expect(sun.querySelector('path.bb__crescent')).toBeNull();
    expect(moon.classList.contains('bb__sym--moon')).toBe(true);
    expect(moon.querySelector('path.bb__crescent')).not.toBeNull();
    expect(moon.querySelector('circle, path.bb__rays')).toBeNull();
    // Les cases données portent leur symbole même si la marque reçue ne le dit pas.
    const sunGiven = cell(7).querySelector('svg')!;
    expect(sunGiven.classList.contains('bb__sym--sun')).toBe(true);
  });

  it('une case donnée montre sa donnée même avec une marque différente ou vide', () => {
    const { cell } = setup({ marks: withMarks({ 0: 0, 7: 2 }) });
    expect(cell(0).querySelector('.bb__sym--moon')).not.toBeNull();
    expect(cell(7).querySelector('.bb__sym--sun')).not.toBeNull();
    expect(cell(7).querySelector('.bb__sym--moon')).toBeNull();
  });

  it('tous les SVG sont masqués aux lecteurs d’écran et non focalisables', () => {
    const { container } = setup({ ...SCENARIO });
    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs.length).toBeGreaterThanOrEqual(12);
    for (const svg of svgs) {
      expect(svg.getAttribute('aria-hidden'), svg.getAttribute('class') ?? '').toBe('true');
      expect(svg.getAttribute('focusable'), svg.getAttribute('class') ?? '').toBe('false');
    }
    // Les cadres de ligne sont décoratifs aussi.
    container.querySelectorAll('.bb__frame').forEach((f) => expect(f.getAttribute('aria-hidden')).toBe('true'));
  });

  it('un symbole proposé par l’indice sur une case vide dessine un fantôme du bon symbole', () => {
    const { cell, update } = setup({ highlight: { ...NO_HIGHLIGHT, places: [{ cell: 1, value: 1 }, { cell: 2, value: 2 }] } });
    const sun = cell(1).querySelector('.bb__sym--ghost')!;
    const moon = cell(2).querySelector('.bb__sym--ghost')!;
    expect(sun.classList.contains('bb__sym--sun')).toBe(true);
    expect(sun.querySelector('circle')?.getAttribute('pathLength')).toBe('30');
    expect(moon.classList.contains('bb__sym--moon')).toBe(true);
    expect(moon.querySelector('path')?.getAttribute('pathLength')).toBe('60');
    expect((sun as SVGElement).style.opacity).toBe(String(GHOST_ALPHA));
    expect(cell(1).classList.contains('bb__cell--ghost-sun')).toBe(true);
    expect(cell(2).classList.contains('bb__cell--ghost-moon')).toBe(true);
    // Une case déjà remplie n'a pas de fantôme.
    update({ marks: withMarks({ 1: 2 }) });
    expect(cell(1).querySelector('.bb__sym--ghost')).toBeNull();
    expect(cell(1).classList.contains('bb__cell--ghost-sun')).toBe(false);
  });
});

// --- Activation sans événements pointeur -----------------------------------------------------------------

describe('activation par clic synthétique (lecteur d’écran)', () => {
  it('un clic de détail 0 sur une case libre la touche', () => {
    const { cell, onGesture } = setup();
    fireEvent.click(cell(5), { detail: 0 });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: 5 });
  });

  it('un clic de détail 0 sur un symbole à l’intérieur de la case vise la case', () => {
    const { cell, onGesture } = setup({ marks: withMarks({ 5: 1 }) });
    fireEvent.click(cell(5).querySelector('svg')!, { detail: 0 });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: 5 });
  });

  it('un clic de souris ou de doigt (détail ≥ 1) est déjà traité par les événements pointeur', () => {
    const { cell, onGesture } = setup();
    fireEvent.click(cell(5), { detail: 1 });
    fireEvent.click(cell(5), { detail: 2 });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('la grille hors cases ou désactivée ne réagit pas ; une case donnée transmet le toucher (refusé par la session)', () => {
    const { grid, cell, onGesture, update } = setup();
    fireEvent.click(grid, { detail: 0 });
    expect(onGesture).not.toHaveBeenCalled();
    fireEvent.click(cell(GIVEN), { detail: 0 });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: GIVEN });
    onGesture.mockClear();
    update({ disabled: true });
    fireEvent.click(cell(FREE), { detail: 0 });
    expect(onGesture).not.toHaveBeenCalled();
  });
});

// --- Pointeurs -------------------------------------------------------------------------------------------

describe('gestes tactiles : un toucher, jamais de glisser-peindre', () => {
  it('appui puis relâchement sur la même case : un toucher', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerUp(grid, { ...finger, ...at(FREE) });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: FREE });
  });

  it('un doigt qui dérive de 3 px par-dessus une frontière touche la case d’appui', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, clientX: 199, clientY: 50 }); // case 1, à 1 px de la case 2
    fireEvent.pointerMove(grid, { ...finger, clientX: 202, clientY: 50 }); // case 2
    fireEvent.pointerUp(grid, { ...finger, clientX: 202, clientY: 50 });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: 1 });
  });

  it('au-delà de la tolérance (30 px sur des cases de 100 px) : rien, même si le doigt revient', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerMove(grid, { ...finger, ...at(FREE, 40) });
    fireEvent.pointerMove(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerUp(grid, { ...finger, ...at(FREE) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('un relâchement loin de l’appui, sans déplacement intermédiaire, ne touche rien', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(1) });
    fireEvent.pointerUp(grid, { ...finger, ...at(8) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('glisser sur d’autres cases ne pose ni ne peint rien', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(5) });
    for (const cell of [6, 8, 14, 15]) fireEvent.pointerMove(grid, { ...finger, ...at(cell) });
    fireEvent.pointerUp(grid, { ...finger, ...at(15) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('chaque toucher est indépendant : trois touchers rapides font trois touchers (pas de double toucher)', () => {
    const { grid, onGesture } = setup();
    for (let k = 0; k < 3; k++) {
      fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
      fireEvent.pointerUp(grid, { ...finger, ...at(FREE) });
    }
    expect(onGesture.mock.calls.map(([e]) => e)).toEqual([
      { type: 'tap', cell: FREE },
      { type: 'tap', cell: FREE },
      { type: 'tap', cell: FREE },
    ]);
  });

  it('une case donnée : le toucher est transmis, la session le refuse (avec une vibration)', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(GIVEN) });
    fireEvent.pointerUp(grid, { ...finger, ...at(GIVEN) });
    expect(onGesture.mock.calls.map((c) => c[0])).toEqual([{ type: 'tap', cell: GIVEN }]);
  });

  it('un appui hors des cases ne fait rien', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, clientX: 700, clientY: 50 });
    fireEvent.pointerUp(grid, { ...finger, clientX: 700, clientY: 50 });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('les interstices entre tuiles reviennent à la case la plus proche', () => {
    const { grid, onGesture } = setup();
    const style = vi.spyOn(window, 'getComputedStyle').mockReturnValue({ rowGap: '3px' } as unknown as CSSStyleDeclaration);
    const tapAt = (clientX: number, clientY: number) => {
      fireEvent.pointerDown(grid, { ...finger, clientX, clientY });
      fireEvent.pointerUp(grid, { ...finger, clientX, clientY });
    };
    try {
      // Pas d'une tuile = (600 + 3) / 6 = 100,5 px : la tuile 1 s'étend de 100,5 à 197,5 px, l'interstice jusqu'à 201 px,
      // partagé en son milieu (199,25 px) entre les tuiles 1 et 2.
      tapAt(198, 50);
      tapAt(200.5, 50);
      // Bords extérieurs : la demi-largeur d'un interstice compte encore dans la grille, pas au-delà.
      tapAt(-1, 150); // ligne 2, colonne 1 (case 6)
      tapAt(-2, 150);
      tapAt(300, 601); // sous la dernière ligne, dans la demi-largeur de l'interstice : ligne 6, colonne 4 (case 33)
      tapAt(300, 602.5);
    } finally {
      style.mockRestore();
    }
    expect(onGesture.mock.calls.map(([e]) => e)).toEqual([
      { type: 'tap', cell: 1 },
      { type: 'tap', cell: 2 },
      { type: 'tap', cell: 6 },
      { type: 'tap', cell: 33 },
    ]);
  });

  it('un clic droit de souris n’agit pas', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { pointerId: 5, isPrimary: true, pointerType: 'mouse', button: 2, ...at(FREE) });
    fireEvent.pointerUp(grid, { pointerId: 5, isPrimary: true, pointerType: 'mouse', button: 2, ...at(FREE) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('un clic gauche de souris touche la case', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { pointerId: 5, isPrimary: true, pointerType: 'mouse', button: 0, ...at(FREE) });
    fireEvent.pointerUp(grid, { pointerId: 5, isPrimary: true, pointerType: 'mouse', button: 0, ...at(FREE) });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: FREE });
  });

  it('grille désactivée (victoire) : aucun geste', () => {
    const { grid, onGesture } = setup({ disabled: true });
    fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerUp(grid, { ...finger, ...at(FREE) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('victoire pendant l’appui : le relâchement ne touche rien', () => {
    const { grid, onGesture, update } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
    update({ disabled: true });
    fireEvent.pointerUp(grid, { ...finger, ...at(FREE) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('une annulation du pointeur (la page défile, geste système) abandonne le toucher', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerCancel(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerUp(grid, { ...finger, ...at(FREE) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('la capture de pointeur perdue abandonne aussi le toucher', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
    fireEvent.lostPointerCapture(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerUp(grid, { ...finger, ...at(FREE) });
    expect(onGesture).not.toHaveBeenCalled();
  });
});

describe('multi-touch', () => {
  it('un pointeur non primaire est ignoré partout (appui, déplacement, relâchement)', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...second, ...at(FREE) });
    fireEvent.pointerMove(grid, { ...second, ...at(2) });
    fireEvent.pointerUp(grid, { ...second, ...at(FREE) });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('un événement non primaire est ignoré même avec l’identifiant du pointeur suivi', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerUp(grid, { ...finger, isPrimary: false, ...at(FREE) });
    fireEvent.pointerCancel(grid, { ...finger, isPrimary: false, ...at(FREE) });
    expect(onGesture).not.toHaveBeenCalled();
    fireEvent.pointerUp(grid, { ...finger, ...at(FREE, 2) }); // le toucher du doigt primaire est resté intact
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: FREE });
  });

  it('un 2e doigt posé pendant un toucher ne perturbe pas le toucher du 1er', () => {
    const { grid, onGesture } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerDown(grid, { ...second, ...at(8) });
    fireEvent.pointerUp(grid, { ...second, ...at(8) });
    fireEvent.pointerUp(grid, { ...finger, ...at(FREE, 2) });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: FREE });
  });

  it('un autre pointeur, même primaire de son type (souris + doigt), n’est pas celui qui a été capturé', () => {
    const { grid, onGesture } = setup();
    const mouse = { pointerId: 7, isPrimary: true, pointerType: 'mouse', button: 0 };
    fireEvent.pointerDown(grid, { ...finger, ...at(FREE) });
    fireEvent.pointerUp(grid, { ...mouse, ...at(2) });
    expect(onGesture).not.toHaveBeenCalled();
    fireEvent.pointerUp(grid, { ...finger, ...at(FREE) });
    expect(onGesture).toHaveBeenCalledExactlyOnceWith({ type: 'tap', cell: FREE });
  });

  it('le déplacement d’une souris sans bouton enfoncé ne fait rien', () => {
    const { grid, onGesture } = setup();
    const mouse = { pointerId: 7, isPrimary: true, pointerType: 'mouse', button: -1 };
    fireEvent.pointerMove(grid, { ...mouse, ...at(FREE) });
    fireEvent.pointerUp(grid, { ...mouse, ...at(FREE) });
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

  it('les cases données restent atteignables au clavier (lecture) : pas de saisie, Entrée / Espace transmis (refusés par la session)', () => {
    const { cell, onGesture } = setup();
    focus(cell(0));
    expect(cell(0).getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(cell(0), { key: '1' });
    fireEvent.keyDown(cell(0), { key: 'Backspace' });
    expect(onGesture).not.toHaveBeenCalled();
    fireEvent.keyDown(cell(0), { key: 'Enter' });
    fireEvent.keyDown(cell(0), { key: ' ' });
    expect(onGesture.mock.calls.map((c) => c[0])).toEqual([
      { type: 'tap', cell: 0 },
      { type: 'tap', cell: 0 },
    ]);
  });

  it('un focus donné de l’extérieur (lecteur d’écran, programme) déplace la case tabulable', () => {
    const { cells, cell } = setup();
    focus(cell(20));
    expect(tabbable(cells())).toEqual([20]);
    fireEvent.focus(cell(33));
    expect(tabbable(cells())).toEqual([33]);
    fireEvent.keyDown(cell(33), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell(32));
  });

  it('toucher une case rend celle-ci tabulable', () => {
    const { grid, cells } = setup();
    fireEvent.pointerDown(grid, { ...finger, ...at(14) });
    expect(tabbable(cells())).toEqual([14]);
  });

  it('la case tabulable reste dans la grille quand la taille change (nouvelle grille)', () => {
    const big: BinairoSolvedPuzzle = { size: 10, givens: new Array<BinairoCell>(100).fill(0), solution: new Array<1 | 2>(100).fill(1) };
    const bigProps: Props = { puzzle: big, marks: new Array<BinairoCell>(100).fill(0) };
    const { container, update } = setup(bigProps);
    const cellsOf = () => within(within(container).getByRole('grid')).getAllByRole('gridcell');
    focus(cellsOf()[99]!);
    expect(tabbable(cellsOf())).toEqual([99]);
    update({ puzzle: PUZZLE, marks: START });
    expect(cellsOf()).toHaveLength(N * N);
    expect(tabbable(cellsOf())).toEqual([0]);
  });

  it('les touches de navigation et d’action empêchent le comportement par défaut (défilement de la page)', () => {
    const { cell } = setup();
    focus(cell(8));
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' ', '1', '2', '0', 'Delete', 'Backspace']) {
      expect(fireEvent.keyDown(document.activeElement!, { key }), key).toBe(false);
    }
    expect(fireEvent.keyDown(document.activeElement!, { key: 'Tab' })).toBe(true); // Tab quitte la grille normalement
    expect(fireEvent.keyDown(document.activeElement!, { key: 'a' })).toBe(true);
    expect(fireEvent.keyDown(document.activeElement!, { key: 'x' })).toBe(true);
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
  });

  it('Entrée et Espace touchent la case focalisée (sans répétition automatique)', () => {
    const { cell, onGesture } = setup();
    focus(cell(5));
    fireEvent.keyDown(cell(5), { key: 'Enter' });
    fireEvent.keyDown(cell(5), { key: ' ' });
    fireEvent.keyDown(cell(5), { key: 'Enter', repeat: true });
    expect(onGesture.mock.calls.map(([e]) => e)).toEqual([
      { type: 'tap', cell: 5 },
      { type: 'tap', cell: 5 },
    ]);
  });

  it('saisie directe : 1 = soleil, 2 = lune, 0 / Retour arrière / Suppr = vide, en une seule entrée d’historique', () => {
    const { cell, onGesture, update } = setup();
    focus(cell(5));
    fireEvent.keyDown(cell(5), { key: '1' }); // vide → soleil
    update({ marks: withMarks({ 5: 1 }) });
    fireEvent.keyDown(cell(5), { key: '2' }); // soleil → lune
    update({ marks: withMarks({ 5: 2 }) });
    fireEvent.keyDown(cell(5), { key: '1' }); // lune → soleil
    fireEvent.keyDown(cell(5), { key: 'Delete' }); // lune → vide
    fireEvent.keyDown(cell(5), { key: 'Backspace' });
    fireEvent.keyDown(cell(5), { key: '0' });
    const events = onGesture.mock.calls.map(([e]) => e) as Extract<GameGesture, { type: 'paint' }>[];
    expect(events.map((e) => [e.type, e.cells, e.from, e.to])).toEqual([
      ['paint', [5], 0, 1],
      ['paint', [5], 1, 2],
      ['paint', [5], 2, 1],
      ['paint', [5], 2, 0],
      ['paint', [5], 2, 0],
      ['paint', [5], 2, 0],
    ]);
    // Chaque saisie a son identifiant de trait : l'historique ne les fusionne jamais.
    expect(new Set(events.map((e) => e.stroke)).size).toBe(events.length);
  });

  it('saisie directe : rien si la case a déjà ce contenu, ni sur une case donnée, ni en répétition', () => {
    const { cell, onGesture } = setup({ marks: withMarks({ 5: 1 }) });
    focus(cell(5));
    fireEvent.keyDown(cell(5), { key: '1' }); // déjà un soleil
    fireEvent.keyDown(cell(6), { key: '0' }); // déjà vide
    fireEvent.keyDown(cell(0), { key: '2' }); // case donnée
    fireEvent.keyDown(cell(5), { key: '2', repeat: true });
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('les raccourcis du navigateur (Ctrl+1, Alt+flèche) ne sont pas détournés', () => {
    const { cell, onGesture } = setup();
    focus(cell(5));
    expect(fireEvent.keyDown(cell(5), { key: '1', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(cell(5), { key: 'Enter', metaKey: true })).toBe(true);
    expect(fireEvent.keyDown(cell(5), { key: 'Backspace', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(cell(5), { key: 'ArrowRight', altKey: true })).toBe(true);
    expect(document.activeElement).toBe(cell(5));
    expect(onGesture).not.toHaveBeenCalled();
  });

  it('grille désactivée : la navigation reste possible, mais aucune action', () => {
    const { cell, onGesture } = setup({ disabled: true });
    focus(cell(0));
    fireEvent.keyDown(cell(0), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(1));
    fireEvent.keyDown(cell(1), { key: 'Enter' });
    fireEvent.keyDown(cell(1), { key: '1' });
    expect(onGesture).not.toHaveBeenCalled();
  });
});

// --- Rendu : surbrillances, cadres, thème, mémoïsation ---------------------------------------------------

describe('rendu', () => {
  it('états visuels : classes de symbole, case donnée, conflit, erreur, ligne, pivot et case de l’indice', () => {
    const { cell } = setup(SCENARIO);
    expect(cell(0).className).toBe('bb__cell bb__cell--moon bb__cell--given bb__cell--conflict');
    expect(cell(1).className).toBe('bb__cell bb__cell--sun bb__cell--conflict');
    expect(cell(2).className).toBe('bb__cell bb__cell--moon bb__cell--mistake');
    expect(cell(5).className).toBe('bb__cell');
    expect(cell(6).className).toBe('bb__cell bb__cell--line bb__cell--hinted bb__cell--ghost-sun');
    expect(cell(7).className).toBe('bb__cell bb__cell--sun bb__cell--given bb__cell--line bb__cell--pivot');
    expect(cell(8).className).toBe('bb__cell bb__cell--line bb__cell--hinted bb__cell--ghost-moon');
    expect(cell(10).className).toBe('bb__cell bb__cell--sun bb__cell--given bb__cell--line');
  });

  it('seconde ligne d’un indice : classe propre', () => {
    const { cell } = setup({ highlight: { ...NO_HIGHLIGHT, line: [0, 1, 2, 3, 4, 5], other: [18, 19, 20, 21, 22, 23] } });
    expect(cell(1).classList.contains('bb__cell--line')).toBe(true);
    expect(cell(19).classList.contains('bb__cell--other')).toBe(true);
    expect(cell(19).classList.contains('bb__cell--line')).toBe(false);
  });

  it('cadres : un rectangle par ligne surlignée, aux bornes de ses cases', () => {
    const frames = (container: HTMLElement) =>
      [...container.querySelectorAll<HTMLElement>('.bb__frame')].map((f) => ({
        tone: f.classList.contains('bb__frame--other') ? 'other' : 'line',
        r0: f.style.getPropertyValue('--r0'),
        r1: f.style.getPropertyValue('--r1'),
        c0: f.style.getPropertyValue('--c0'),
        c1: f.style.getPropertyValue('--c1'),
      }));
    // Rangée 2 (cases 6 à 11).
    const row = setup({ highlight: { ...NO_HIGHLIGHT, line: [6, 7, 8, 9, 10, 11] } });
    expect(frames(row.container)).toEqual([{ tone: 'line', r0: '1', r1: '1', c0: '0', c1: '5' }]);
    row.unmount();
    // Colonne 4 (cases 3, 9, …) et seconde ligne : rangée 6.
    const both = setup({ highlight: { ...NO_HIGHLIGHT, line: [3, 9, 15, 21, 27, 33], other: [30, 31, 32, 33, 34, 35] } });
    expect(frames(both.container)).toEqual([
      { tone: 'line', r0: '0', r1: '5', c0: '3', c1: '3' },
      { tone: 'other', r0: '5', r1: '5', c0: '0', c1: '5' },
    ]);
    both.unmount();
    // Sans ligne : aucun cadre.
    const none = setup({ highlight: { ...NO_HIGHLIGHT, places: [{ cell: 1, value: 1 }] } });
    expect(frames(none.container)).toEqual([]);
  });

  it('une surbrillance qui n’est pas celle de Binairo est ignorée', () => {
    const { container, cells } = setup({ highlight: { focus: [1], targets: [2] } });
    expect(container.querySelector('.bb__frame')).toBeNull();
    expect(cells().every((c) => !/line|other|pivot|hinted|mistake/.test(c.className))).toBe(true);
  });

  it('palette posée en ligne selon le thème (clair par défaut, sombre sur demande)', () => {
    const light = setup();
    const root = light.container.querySelector<HTMLElement>('.bb')!;
    expect(root.hasAttribute('data-dark')).toBe(false);
    expect(root.style.getPropertyValue('--bb-n')).toBe(String(N));
    expect(root.style.getPropertyValue('--bb-sun-tile')).toBe(binairoPalette(false).sun.tile);
    expect(root.style.getPropertyValue('--bb-moon-given-ink')).toBe(binairoPalette(false).moon.givenInk);
    light.unmount();
    const dark = setup({ dark: true });
    const darkRoot = dark.container.querySelector<HTMLElement>('.bb')!;
    expect(darkRoot.hasAttribute('data-dark')).toBe(true);
    expect(darkRoot.style.getPropertyValue('--bb-sun-tile')).toBe(binairoPalette(true).sun.tile);
    expect(binairoPalette(true).sun.tile).not.toBe(binairoPalette(false).sun.tile);
  });

  it('victoire : animation de célébration et grille désactivée', () => {
    const { container, grid } = setup({ celebrate: true, disabled: true });
    expect(container.querySelector('.bb--celebrate')).not.toBeNull();
    expect(container.querySelector('.bb--disabled')).not.toBeNull();
    expect(grid.getAttribute('aria-disabled')).toBe('true');
  });

  it('grande grille : espacements plus fins (data-dense) à partir de 10 × 10', () => {
    const big: BinairoSolvedPuzzle = { size: 10, givens: new Array<BinairoCell>(100).fill(0), solution: new Array<1 | 2>(100).fill(1) };
    const view = render(
      <I18nextProvider i18n={i18n}>
        <BinairoBoard puzzle={big} marks={big.givens} conflicts={NO_CONFLICTS} highlight={null} disabled={false} celebrate={false} onGesture={() => undefined} />
      </I18nextProvider>,
    );
    expect(view.container.querySelector('.bb')?.hasAttribute('data-dense')).toBe(true);
    expect(setup().container.querySelector('.bb')?.hasAttribute('data-dense')).toBe(false);
  });

  it('mémoïsation : un toucher ne rend que la case modifiée (et celle qui perd l’index tabulable)', () => {
    const spy = vi.spyOn(i18n, 't');
    try {
      function Harness() {
        const [marks, setMarks] = useState<BinairoCell[]>(START);
        const gesture = useCallback((e: GameGesture) => {
          if (e.type === 'tap') setMarks((m) => m.map((v, i) => (i === e.cell ? (BINAIRO_RULES.tap(v) as BinairoCell) : v)));
        }, []);
        return <BinairoBoard puzzle={PUZZLE} marks={marks} conflicts={NO_CONFLICTS} highlight={null} disabled={false} celebrate={false} onGesture={gesture} />;
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
      fireEvent.pointerDown(grid, { ...finger, ...at(8) });
      expect(labelCalls(spy)).toBe(2); // case 0 (perd l'index tabulable) et case 8 (le reçoit)

      spy.mockClear();
      fireEvent.pointerUp(grid, { ...finger, ...at(8) });
      expect(labelCalls(spy)).toBe(1); // case 8 seule : le soleil
      expect(within(grid).getAllByRole('gridcell')[8]!.getAttribute('aria-label')).toBe(label(2, 3, ['sun']));
    } finally {
      spy.mockRestore();
    }
  });

  it('mémoïsation : un indice ne rend que les cases concernées', () => {
    const spy = vi.spyOn(i18n, 't');
    try {
      const { update } = setup();
      spy.mockClear();
      update({ highlight: HIGHLIGHT }); // rangée 2 (6 cases) + case fausse 2
      expect(labelCalls(spy)).toBe(7);
      spy.mockClear();
      update({ highlight: null });
      expect(labelCalls(spy)).toBe(7);
    } finally {
      spy.mockRestore();
    }
  });
});

// --- Contraste, distinction des symboles, cases données ---------------------------------------------------

describe('couleurs (WCAG 1.4.11 : ≥ 3:1 ; symboles ≥ 4,5:1)', () => {
  /** Composition sRGB d'une couleur à l'opacité `alpha` sur un fond opaque (comme le navigateur). */
  const over = (fg: string, bg: string, alpha: number): string => {
    const f = hexToRgb(fg);
    const b = hexToRgb(bg);
    return rgbToHex([0, 1, 2].map((i) => alpha * f[i]! + (1 - alpha) * b[i]!) as [number, number, number]);
  };
  /** Mélange `color-mix(in srgb, a p%, b)`. */
  const mix = (a: string, b: string, p: number) => over(a, b, p);

  const SEEDS = [GRIDAY_SEED, 0xff0061a4, 0xff386a20, 0xffb3261e, 0xffe3b800, 0xff808000, 0xff777777];

  it.each([
    ['clair', false],
    ['sombre', true],
  ] as const)('thème %s : symbole sur sa tuile, case donnée comprise', (_name, dark) => {
    const palette = binairoPalette(dark);
    for (const symbol of ['sun', 'moon'] as const) {
      const c = palette[symbol];
      expect(contrastRatio(c.ink, c.tile), `${symbol} joueur`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.givenInk, c.givenTile), `${symbol} donnée`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each([
    ['clair', false],
    ['sombre', true],
  ] as const)('thème %s : le symbole « fantôme » de l’indice contraste ≥ 3:1 sur sa tuile, pour tous les thèmes de l’app', (_name, dark) => {
    const palette = binairoPalette(dark);
    for (const seed of SEEDS) {
      const scheme = createScheme({ seed, dark });
      const empty = dark ? scheme.surfaceContainerLow : scheme.surfaceContainerLowest;
      for (const symbol of ['sun', 'moon'] as const) {
        const c = palette[symbol];
        const tile = mix(c.tile, empty, 0.75); // .bb__cell--ghost-* (75 % de la tuile du symbole sur la tuile vide)
        const stroke = over(c.ink, tile, GHOST_ALPHA); // contour pointillé et rayons, à l'opacité GHOST_ALPHA
        expect(contrastRatio(stroke, tile), `${symbol} graine ${seed.toString(16)}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.each([
    ['clair', false],
    ['sombre', true],
  ] as const)('thème %s : le liseré d’une case vide ressort à ≥ 3:1 sur sa tuile, pour tous les thèmes de l’app', (_name, dark) => {
    for (const seed of SEEDS) {
      const scheme = createScheme({ seed, dark });
      const empty = dark ? scheme.surfaceContainerLow : scheme.surfaceContainerLowest;
      const edge = over(scheme.outline, empty, EDGE_ALPHA);
      expect(contrastRatio(edge, empty), `graine ${seed.toString(16)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('le test n’est pas trivial : une opacité plus faible passerait sous 3:1', () => {
    const worst = (alpha: number) =>
      Math.min(
        ...[false, true].flatMap((dark) => {
          const palette = binairoPalette(dark);
          const scheme = createScheme({ seed: GRIDAY_SEED, dark });
          const empty = dark ? scheme.surfaceContainerLow : scheme.surfaceContainerLowest;
          return (['sun', 'moon'] as const).map((s) => {
            const tile = mix(palette[s].tile, empty, 0.75);
            return contrastRatio(over(palette[s].ink, tile, alpha), tile);
          });
        }),
      );
    expect(worst(GHOST_ALPHA)).toBeGreaterThanOrEqual(3);
    expect(worst(0.3)).toBeLessThan(3);
  });

  it.each([
    ['clair', false],
    ['sombre', true],
  ] as const)('thème %s : anneaux d’état sur toutes les tuiles (liseré intérieur = encre de la case)', (_name, dark) => {
    const palette = binairoPalette(dark);
    for (const seed of SEEDS) {
      const scheme = createScheme({ seed, dark });
      const empty = dark ? scheme.surfaceContainerLow : scheme.surfaceContainerLowest;
      const onSurface = scheme.onSurface;
      const tiles = [
        { name: 'vide', fill: empty, ink: onSurface },
        ...(['sun', 'moon'] as const).flatMap((s) => [
          { name: `${s} joueur`, fill: palette[s].tile, ink: palette[s].ink },
          { name: `${s} donnée`, fill: palette[s].givenTile, ink: palette[s].givenInk },
        ]),
      ];
      for (const tile of tiles) {
        // Le liseré intérieur (encre de la case) garantit le contraste, quelle que soit la couleur de rôle du liseré extérieur.
        for (const ring of [scheme.error, scheme.primary, scheme.secondary]) {
          expect(Math.max(contrastRatio(ring, tile.fill), contrastRatio(tile.ink, tile.fill)), `${tile.name} ${ring} graine ${seed.toString(16)}`).toBeGreaterThanOrEqual(3);
        }
        expect(contrastRatio(tile.ink, tile.fill), `liseré intérieur ${tile.name}`).toBeGreaterThanOrEqual(4.5);
      }
      // Les cadres de ligne se détachent du fond du plateau.
      const frame = scheme.surfaceContainerHigh;
      for (const role of [scheme.primary, scheme.tertiary]) expect(contrastRatio(role, frame), `cadre ${role} graine ${seed.toString(16)}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each([
    ['clair', false],
    ['sombre', true],
  ] as const)('thème %s : soleil et lune restent distincts sans la forme (vision normale, protanopie, deutéranopie, tritanopie)', (_name, dark) => {
    const palette = binairoPalette(dark);
    expect(deltaE(palette.sun.tile, palette.moon.tile)).toBeGreaterThanOrEqual(8);
    expect(deltaE(palette.sun.givenTile, palette.moon.givenTile)).toBeGreaterThanOrEqual(8);
    for (const kind of COLOR_VISION_DEFICIENCIES) {
      expect(deltaEColorVision(palette.sun.tile, palette.moon.tile, kind), `tuile ${kind}`).toBeGreaterThanOrEqual(6);
      expect(deltaEColorVision(palette.sun.givenTile, palette.moon.givenTile, kind), `donnée ${kind}`).toBeGreaterThanOrEqual(6);
      expect(deltaEColorVision(palette.sun.ink, palette.moon.ink, kind), `encre ${kind}`).toBeGreaterThanOrEqual(6);
    }
  });

  it.each([
    ['clair', false],
    ['sombre', true],
  ] as const)('thème %s : une case donnée se distingue d’une case jouée (luminance et couleur)', (_name, dark) => {
    const palette = binairoPalette(dark);
    for (const symbol of ['sun', 'moon'] as const) {
      const c = palette[symbol];
      expect(contrastRatio(c.tile, c.givenTile), symbol).toBeGreaterThanOrEqual(1.25); // visible sans distinguer les couleurs
      expect(deltaE(c.tile, c.givenTile), symbol).toBeGreaterThanOrEqual(8);
    }
  });

  it('les tons du thème clair sont ceux annoncés (réglage HCT par tons fixes)', () => {
    expect(SYMBOL_LEVELS.light.ink.tone).toBeLessThan(SYMBOL_LEVELS.light.tile.tone - 40);
    expect(SYMBOL_LEVELS.dark.ink.tone).toBeGreaterThan(SYMBOL_LEVELS.dark.tile.tone + 40);
  });
});

// --- Feuille de style --------------------------------------------------------------------------------------

describe('feuille de style', () => {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const bodyOf = (selector: string) => rules.filter(([, sel]) => sel!.split(',').some((part) => part.trim() === selector)).map(([, , body]) => body!).join('\n');

  it('le symbole ne change jamais de couleur selon l’état : tout passe par currentColor et les anneaux', () => {
    const symbolRules = rules.filter(([, selector]) => /bb__(sym|rays|crescent|disc)/.test(selector!));
    expect(symbolRules.length).toBeGreaterThan(0);
    for (const [, selector, body] of symbolRules) {
      for (const decl of body!.matchAll(/(?<![-\w])(fill|stroke|color)\s*:\s*([^;]+);/g)) {
        expect(decl[2]!.trim(), `${selector!.trim()} { ${decl[1]} }`).toMatch(/^(currentColor|none)$/);
      }
    }
    expect(symbolRules.some(([, selector]) => /--(conflict|mistake|hinted|pivot|line)\s+\.bb__(sym|rays|crescent)/.test(selector!))).toBe(false);
  });

  it('chaque anneau (conflit, erreur, pivot, case de l’indice, focus clavier) a un liseré intérieur `currentColor` et un liseré coloré', () => {
    for (const [selector, color] of [
      ['.bb__cell--conflict::before', '--bb-ring-color'],
      ['.bb__cell--mistake::before', '--bb-ring-color'],
      ['.bb__cell--hinted::before', '--bb-ring-color'],
      ['.bb__cell--pivot::before', '--bb-ring-color'],
      ['.bb__cell:focus-visible::after', '--md-sys-color-secondary'],
    ] as const) {
      const body = bodyOf(selector);
      expect(body, selector).toMatch(/border:\s*var\(--bb-ring-inner\)\s+solid\s+currentColor/);
      expect(body, selector).toContain(color);
    }
    expect(bodyOf('.bb__cell--hinted')).toContain('--bb-hl');
    expect(bodyOf('.bb__cell--conflict')).toContain('--bb-error');
    expect(bodyOf('.bb__cell--mistake')).toContain('--bb-error');
    expect(bodyOf('.bb')).toContain('--md-sys-color-error');
    expect(bodyOf('.bb')).toContain('--md-sys-color-primary');
  });

  it('le contour natif de la case est supprimé même face à la règle globale :focus-visible', () => {
    const none = rules.find(([, sel, body]) => sel!.includes('.bb__cell:focus-visible') && !sel!.includes('::') && /outline:\s*none/.test(body!));
    expect(none).toBeDefined();
  });

  it('la grille laisse la page défiler (pas de glisser-peindre) et la victoire bloque les événements', () => {
    expect(bodyOf('.bb')).toMatch(/touch-action:\s*manipulation/);
    expect(bodyOf('.bb--disabled .bb__grid')).toMatch(/pointer-events:\s*none/);
  });

  it('animations coupées avec « réduire les animations »', () => {
    const media = stripped.slice(stripped.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(media).toMatch(/\.bb__cell--hinted::before\s*\{\s*animation:\s*none/);
    expect(media).toMatch(/transition:\s*none/);
  });

  it('les valeurs de repli des symboles sont celles de la palette claire', () => {
    const root = bodyOf('.bb');
    const p = binairoPalette(false);
    for (const [name, value] of [
      ['--bb-sun-tile', p.sun.tile],
      ['--bb-sun-ink', p.sun.ink],
      ['--bb-sun-given-tile', p.sun.givenTile],
      ['--bb-sun-given-ink', p.sun.givenInk],
      ['--bb-moon-tile', p.moon.tile],
      ['--bb-moon-ink', p.moon.ink],
      ['--bb-moon-given-tile', p.moon.givenTile],
      ['--bb-moon-given-ink', p.moon.givenInk],
    ] as const) {
      expect(root, name).toContain(`${name}: ${value};`);
    }
  });

  it('les opacités du liseré (EDGE_ALPHA) sont celles de la feuille de style', () => {
    expect(bodyOf('.bb__cell')).toContain(`var(--md-sys-color-outline, #78767b) ${Math.round(EDGE_ALPHA * 100)}%`);
  });

  it('chaque classe d’état posée par le composant a sa règle', () => {
    for (const cls of ['--sun', '--moon', '--given', '--line', '--other', '--pivot', '--hinted', '--ghost-sun', '--ghost-moon', '--mistake', '--conflict']) {
      expect(stripped, `.bb__cell${cls}`).toContain(`.bb__cell${cls}`);
    }
    for (const cls of ['.bb__frame--line', '.bb__frame--other', '.bb--celebrate', '.bb--disabled', '.bb[data-dense]', '.bb[data-dark]']) {
      expect(stripped, cls).toContain(cls);
    }
  });
});
