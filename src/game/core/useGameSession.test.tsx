import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BINAIRO_DEFINITION } from '../../../engine/binairo';
import { generateDailyForVersion } from '../../../engine/core/pipeline';
import { queensDailyV1 } from '../../../engine/queens/testing';
import { haptic } from '../../platform';
import { loadJSON } from '../../platform/storage';
import { BINAIRO_RULES, CYCLE_HOLD_MS } from '../binairo/rules';
import { QUEENS_RULES } from '../queens/rules';
import type { GameRules, Mark } from './rules';
import { useGameSession, type GameSession } from './useGameSession';

vi.mock('../../platform', async (orig) => ({ ...(await orig<typeof import('../../platform')>()), haptic: vi.fn(async () => {}) }));

afterEach(() => {
  localStorage.clear();
  vi.mocked(haptic).mockClear();
});

const queens = queensDailyV1('2026-10-05');
const binairo = generateDailyForVersion(BINAIRO_DEFINITION, 1, '2026-10-06').puzzle;

let session: GameSession<unknown> | null = null;

function Harness({ rules, puzzle, storageKey }: { rules: GameRules<unknown>; puzzle: unknown; storageKey: string }) {
  session = useGameSession(rules, { puzzle, storageKey, visible: true });
  return null;
}

describe('session de jeu', () => {
  it('changement de type pendant une sauvegarde en attente : l’ancienne grille est écrite avec ses propres règles', async () => {
    const queensProps = { rules: QUEENS_RULES as GameRules<unknown>, puzzle: queens, storageKey: 'test.queens' };
    const { rerender } = render(<Harness {...queensProps} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20)); // chargement (stockage vide : nouvelle partie)
    });
    expect(session?.game).not.toBeNull();
    // Un coup : sauvegarde différée (chronomètre en marche).
    act(() => session!.gesture({ type: 'tap', cell: 0 }));
    // Même rendu : nouvelle grille d'un autre type (« Nouvelle grille » en mode illimité).
    expect(() => rerender(<Harness rules={BINAIRO_RULES as GameRules<unknown>} puzzle={binairo} storageKey="test.binairo" />)).not.toThrow();
    const saved = await loadJSON<{ puzzle: string; past: unknown[] }>('test.queens');
    expect(saved?.puzzle).toBe(QUEENS_RULES.key(queens));
    expect(saved?.past).toHaveLength(1);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(session?.game?.puzzle).toBe(binairo);
  });

  it('toucher une case donnée : rien ne change, une vibration le signale', async () => {
    render(<Harness rules={BINAIRO_RULES as GameRules<unknown>} puzzle={binairo} storageKey="test.locked" />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const given = binairo.givens.findIndex((v) => v !== 0);
    const before = session!.game!;
    act(() => session!.gesture({ type: 'tap', cell: given }));
    expect(session!.game!.marks).toEqual(before.marks);
    expect(session!.game!.past).toHaveLength(0);
    expect(vi.mocked(haptic)).toHaveBeenCalledWith('warning');
  });
});

describe('alertes : retenue après un toucher, réglage « signaler les erreurs »', () => {
  const R = BINAIRO_RULES as GameRules<unknown>;
  const empties = binairo.givens.flatMap((g, i) => (g === 0 ? [i] : []));
  const withMark = (cell: number, mark: 1 | 2) => binairo.givens.map((g, i) => (i === cell ? mark : g)) as Mark[];
  // Case où le soleil crée un conflit que la lune règle (le joueur la fait tourner vers la lune).
  const sunCell = empties.find((c) => R.check(binairo, withMark(c, 1)).conflicts.length > 0 && R.check(binairo, withMark(c, 2)).conflicts.length === 0)!;
  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  const warnings = () => vi.mocked(haptic).mock.calls.filter(([k]) => k === 'warning').length;

  function AlertHarness({ showConflicts, storageKey }: { showConflicts: boolean; storageKey: string }) {
    session = useGameSession(R, { puzzle: binairo, storageKey, visible: true, showConflicts });
    return null;
  }
  // Une clé par test : la partie du test précédent est écrite à son démontage, après le ménage du stockage.
  let run = 0;
  async function start(showConflicts = true) {
    render(<AlertHarness showConflicts={showConflicts} storageKey={`test.alerts.${++run}`} />);
    await advance(20); // chargement (stockage vide : nouvelle partie)
    expect(session?.game).not.toBeNull();
  }
  const tap = (cell: number) => act(() => session!.gesture({ type: 'tap', cell }));

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('soleil fautif : signalé seulement à la fin de la fenêtre (vibration comprise)', async () => {
    expect(sunCell).toBeDefined();
    await start();
    tap(sunCell);
    await advance(CYCLE_HOLD_MS - 50);
    expect(session!.conflicts).toEqual([]);
    expect(warnings()).toBe(0);
    await advance(100);
    expect(session!.conflicts).toContain(sunCell);
    expect(warnings()).toBe(1);
  });

  it('soleil changé en lune pendant la fenêtre (même lentement) : aucune alerte, aucune vibration', async () => {
    await start();
    tap(sunCell);
    await advance(CYCLE_HOLD_MS - 100);
    tap(sunCell);
    expect(session!.game!.marks[sunCell]).toBe(2);
    await advance(CYCLE_HOLD_MS * 2);
    expect(session!.conflicts).toEqual([]);
    expect(warnings()).toBe(0);
  });

  it('alerte déjà signalée puis réglée : effacée aussitôt, sans attendre la fenêtre', async () => {
    await start();
    tap(sunCell);
    await advance(CYCLE_HOLD_MS + 50);
    expect(session!.conflicts).toContain(sunCell);
    tap(sunCell); // lune : plus de conflit
    expect(session!.conflicts).toEqual([]);
  });

  it('autre case touchée : le coup précédent est acquis, son alerte est signalée sans attendre', async () => {
    await start();
    tap(sunCell);
    const afterSun = new Set(R.check(binairo, session!.game!.marks).conflicts);
    const other = empties.find((c) => c !== sunCell && R.check(binairo, withMark(c, 1)).conflicts.length === 0)!;
    tap(other);
    expect(session!.conflicts.length).toBeGreaterThan(0);
    expect(session!.conflicts.every((c) => afterSun.has(c))).toBe(true);
    expect(session!.conflicts).toContain(sunCell);
  });

  it('réglage désactivé : aucune case en conflit ni vibration ; seule une grille remplie mais fausse est signalée', async () => {
    await start(false);
    tap(sunCell);
    await advance(CYCLE_HOLD_MS + 50);
    expect(session!.conflicts).toEqual([]);
    expect(session!.filledWrong).toBe(false);
    expect(warnings()).toBe(0);

    // Tout est rempli selon la solution, sauf une case dont la solution est une lune.
    const last = empties.find((c) => c !== sunCell && binairo.solution[c] === 2)!;
    act(() => session!.applyHint(empties.filter((c) => c !== last).map((c) => ({ cell: c, mark: binairo.solution[c] as Mark }))));
    expect(session!.filledWrong).toBe(false);
    // Soleil : grille remplie mais fausse, signalée après la fenêtre (le joueur va peut-être en faire une lune).
    tap(last);
    expect(session!.filledWrong).toBe(false);
    await advance(CYCLE_HOLD_MS + 50);
    expect(session!.filledWrong).toBe(true);
    expect(session!.conflicts).toEqual([]);
    expect(warnings()).toBe(0);
    // Lune : victoire, plus rien à signaler.
    tap(last);
    expect(session!.game!.solved).toBe(true);
    expect(session!.filledWrong).toBe(false);
  });

  it('réglage réactivé en cours de partie : conflits existants signalés, sans vibration', async () => {
    const storageKey = `test.alerts.${++run}`;
    const { rerender } = render(<AlertHarness showConflicts={false} storageKey={storageKey} />);
    await advance(20);
    tap(sunCell);
    await advance(CYCLE_HOLD_MS + 50);
    expect(session!.conflicts).toEqual([]);
    rerender(<AlertHarness showConflicts storageKey={storageKey} />);
    expect(session!.conflicts).toContain(sunCell);
    expect(warnings()).toBe(0);
  });

  it('Queens : grille remplie = autant de reines que de lignes (croix ignorées)', () => {
    const n = queens.size;
    const marks = new Array<Mark>(n * n).fill(0);
    for (let r = 0; r < n - 1; r++) marks[r * n + queens.solution[r]!] = 2;
    marks[(n - 1) * n] = 1; // une croix ne compte pas
    expect(QUEENS_RULES.filled(queens, marks)).toBe(false);
    marks[(n - 1) * n + 1] = 2;
    expect(QUEENS_RULES.filled(queens, marks)).toBe(true);
  });
});
