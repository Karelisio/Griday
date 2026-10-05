import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { QueensSolvedPuzzle } from '../../../engine/queens/types';
import { QUEENS_V1 } from '../../../engine/queens/v1/version';
import { QUEENS_RULES } from '../queens/rules';
import { useGameSession } from './useGameSession';

const A = QUEENS_V1.fallback({ size: 6, tier: 1 }, 0).puzzle;
const B = QUEENS_V1.fallback({ size: 7, tier: 1 }, 0).puzzle;

type Props = { puzzle: QueensSolvedPuzzle; storageKey: string };
const setup = (initial: Props) => renderHook((p: Props) => useGameSession(QUEENS_RULES, { ...p, visible: false }), { initialProps: initial });

beforeEach(() => localStorage.clear());

describe('indices : nouvel indice ou indice redemandé', () => {
  it('isNewHint suit la logique de noteHint : seul le dernier indice compté est reconnu', async () => {
    const { result } = setup({ puzzle: A, storageKey: 'a' });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    const hints = () => result.current.game!.hintsUsed;

    expect(result.current.isNewHint('x')).toBe(true);
    act(() => result.current.noteHint('x'));
    expect(hints()).toBe(1);
    expect(result.current.isNewHint('x')).toBe(false); // redemandé sans nouvelle déduction

    act(() => result.current.noteHint('x'));
    expect(hints()).toBe(1); // et non recompté

    expect(result.current.isNewHint('y')).toBe(true);
    act(() => result.current.noteHint('y'));
    expect(hints()).toBe(2);
    expect(result.current.isNewHint('x')).toBe(true); // seul le dernier est retenu : x compterait de nouveau
    expect(result.current.isNewHint('y')).toBe(false);
  });

  it('demander la nouveauté ne compte rien', async () => {
    const { result } = setup({ puzzle: A, storageKey: 'a' });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    expect(result.current.isNewHint('x')).toBe(true);
    expect(result.current.isNewHint('x')).toBe(true);
    expect(result.current.game!.hintsUsed).toBe(0);
  });

  it('autre grille : le même indice redevient nouveau', async () => {
    const { result, rerender } = setup({ puzzle: A, storageKey: 'a' });
    await waitFor(() => expect(result.current.game).not.toBeNull());
    act(() => result.current.noteHint('x'));
    expect(result.current.isNewHint('x')).toBe(false);

    rerender({ puzzle: B, storageKey: 'b' });
    await waitFor(() => expect(result.current.game?.puzzle).toBe(B));
    expect(result.current.isNewHint('x')).toBe(true);
    act(() => result.current.noteHint('x'));
    expect(result.current.game!.hintsUsed).toBe(1);
  });
});
