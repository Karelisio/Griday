import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BINAIRO_DEFINITION } from '../../../engine/binairo';
import { generateDailyForVersion } from '../../../engine/core/pipeline';
import { queensDailyV1 } from '../../../engine/queens/testing';
import { haptic } from '../../platform';
import { loadJSON } from '../../platform/storage';
import { BINAIRO_RULES } from '../binairo/rules';
import { QUEENS_RULES } from '../queens/rules';
import type { GameRules } from './rules';
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
