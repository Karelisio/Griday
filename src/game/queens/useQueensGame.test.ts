import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { QUEENS_V1 } from '../../../engine/queens/v1/version';
import type { QueensSolvedPuzzle } from '../../../engine/queens/types';
import { loadJSON, saveJSON } from '../../platform/storage';
import { DOUBLE_TAP_MS } from './gestures';
import { MARK_QUEEN } from './marks';
import { deserializeGame, serializeGame, useQueensGame, type SavedQueensGame } from './useQueensGame';
import { newGame, reduceQueens } from './state';

const A = QUEENS_V1.fallback({ size: 6, tier: 1 }, 0).puzzle;
const B = QUEENS_V1.fallback({ size: 7, tier: 1 }, 0).puzzle;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Props = { puzzle: QueensSolvedPuzzle | null; storageKey: string | null };
const setup = (initial: Props) =>
  renderHook((p: Props) => useQueensGame({ ...p, visible: true, autoCross: false }), { initialProps: initial });

beforeEach(() => localStorage.clear());

describe('sauvegarde', () => {
  it('aller-retour fidèle', () => {
    let g = newGame(A, 0);
    g = reduceQueens(g, { type: 'tap', cell: 3, now: 10 });
    g = reduceQueens(g, { type: 'hintShown', now: 20 });
    const back = deserializeGame(JSON.parse(JSON.stringify(serializeGame(g, 1000))), A);
    expect(back?.marks).toEqual(g.marks);
    expect(back?.past).toEqual(g.past);
    expect(back?.hintsUsed).toBe(1);
    expect(back?.elapsedMs).toBe(1000);
  });

  it('données corrompues : ignorées sans planter', () => {
    const ok = serializeGame(newGame(A, 0), 0);
    const bad: unknown[] = [
      null,
      42,
      'texte',
      { ...ok, v: 2 },
      { ...ok, puzzle: 'autre' },
      { ...ok, marks: 7 },
      { ...ok, marks: '0'.repeat(35) },
    ];
    for (const b of bad) expect(deserializeGame(b, A)).toBeNull();
    const odd = deserializeGame({ ...ok, past: 'x', future: [1, null, '0'.repeat(36)], elapsedMs: Number.NaN, hintsUsed: -3, solved: 'oui' }, A);
    expect(odd).not.toBeNull();
    expect(odd!.past).toEqual([]);
    expect(odd!.future).toHaveLength(1);
    expect(odd!.elapsedMs).toBe(0);
    expect(odd!.hintsUsed).toBe(0);
    expect(odd!.solved).toBe(false);
  });
});

describe('useQueensGame', () => {
  it('changement de grille : jamais l’ancienne partie affichée pour la nouvelle', async () => {
    const { result, rerender } = setup({ puzzle: A, storageKey: 'a' });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    expect(result.current.game!.puzzle).toBe(A);
    rerender({ puzzle: B, storageKey: 'b' });
    // Avant le chargement de B : rien plutôt que la partie de A.
    expect(result.current.game).toBeNull();
    await waitFor(() => expect(result.current.game?.puzzle).toBe(B));
  });

  it('reprend la partie sauvegardée ; la dernière modification est écrite au changement de grille', async () => {
    const { result, rerender } = setup({ puzzle: A, storageKey: 'a' });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    act(() => result.current.gesture({ type: 'tap', cell: 0 }));
    rerender({ puzzle: B, storageKey: 'b' });
    await waitFor(async () => expect((await loadJSON<SavedQueensGame>('a'))?.marks[0]).toBe(String(MARK_QUEEN)));

    const again = setup({ puzzle: A, storageKey: 'a' });
    await waitFor(() => expect(again.result.current.game?.marks[0]).toBe(MARK_QUEEN));
  });

  it('un même indice redemandé n’est compté qu’une fois', async () => {
    const { result } = setup({ puzzle: A, storageKey: 'a' });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    act(() => result.current.noteHint('x'));
    act(() => result.current.noteHint('x'));
    expect(result.current.game!.hintsUsed).toBe(1);
    act(() => result.current.noteHint('y'));
    expect(result.current.game!.hintsUsed).toBe(2);
  });

  it('jouer un indice : toute la déduction en une seule entrée d’historique', async () => {
    const { result } = setup({ puzzle: A, storageKey: 'a' });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    act(() =>
      result.current.applyHint([
        { cell: 0, mark: 'cross' },
        { cell: 1, mark: 'cross' },
        { cell: 2, mark: 'queen' },
      ]),
    );
    expect(result.current.game!.marks.slice(0, 3)).toEqual([1, 1, MARK_QUEEN]);
    expect(result.current.game!.past).toHaveLength(1);
  });

  it('conflit d’une reine posée : signalé après la fenêtre du double toucher, jamais si c’était une croix', async () => {
    await saveJSON('a', serializeGame(newGame(A, 0), 0));
    const { result } = setup({ puzzle: A, storageKey: 'a' });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    act(() => result.current.gesture({ type: 'tap', cell: 0 }));
    act(() => result.current.gesture({ type: 'tap', cell: 1 }));
    // Deux reines voisines : conflit retenu le temps du double toucher…
    expect(result.current.conflicts).toEqual([]);
    await act(() => sleep(DOUBLE_TAP_MS + 60));
    expect(result.current.conflicts).toEqual([0, 1]);

    // …et jamais affiché si le second toucher en fait une croix.
    act(() => result.current.undo());
    expect(result.current.conflicts).toEqual([]);
    act(() => result.current.gesture({ type: 'tap', cell: 1 }));
    act(() => result.current.gesture({ type: 'doubleTap', cell: 1 }));
    await act(() => sleep(DOUBLE_TAP_MS + 60));
    expect(result.current.conflicts).toEqual([]);
  });

  it('puzzle déjà résolu sans sauvegarde : partie reconstituée gagnée (solution, temps, indices)', async () => {
    const { result } = renderHook(() =>
      useQueensGame({ puzzle: A, storageKey: 'gagne', visible: true, autoCross: false, solvedFallback: { timeMs: 83_000, hintsUsed: 2 } }),
    );
    await waitFor(() => expect(result.current.game).not.toBeNull());
    const g = result.current.game!;
    expect(g.solved).toBe(true);
    expect(g.elapsedMs).toBe(83_000);
    expect(g.hintsUsed).toBe(2);
    expect(A.solution.every((c, r) => g.marks[r * A.size + c] === MARK_QUEEN)).toBe(true);
  });
});
