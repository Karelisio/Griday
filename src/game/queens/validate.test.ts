import { describe, expect, it } from 'vitest';
import { QUEENS_V1 } from '../../../engine/queens/v1/version';
import { isGenerationTarget, isQueensSolvedPuzzle, isStoredQueensPuzzle } from './validate';

const generated = { type: 'queens', version: 1, seed: 's', attempt: 0, source: 'generated', target: { size: 6, tier: 1 }, ...QUEENS_V1.fallback({ size: 6, tier: 1 }, 0) };
const { puzzle } = generated;

describe('validation des données stockées', () => {
  it('accepte une grille cohérente', () => {
    expect(isQueensSolvedPuzzle(puzzle)).toBe(true);
    expect(isStoredQueensPuzzle(generated, { version: 1, size: 6 })).toBe(true);
  });

  it('rejette les grilles corrompues', () => {
    const bad: unknown[] = [
      null,
      'x',
      [],
      { ...puzzle, size: 3 },
      { ...puzzle, size: 6.5 },
      { ...puzzle, regions: puzzle.regions.slice(1) },
      { ...puzzle, regions: puzzle.regions.map((r) => (r === 5 ? 6 : r)) },
      { ...puzzle, regions: puzzle.regions.map((r) => (r === 5 ? 4 : r)) },
      { ...puzzle, solution: puzzle.solution.slice(1) },
      { ...puzzle, solution: [...puzzle.solution].reverse() },
      { ...puzzle, solution: puzzle.solution.map(String) },
    ];
    for (const b of bad) expect(isQueensSolvedPuzzle(b), JSON.stringify(b)).toBe(false);
  });

  it('rejette un cache d’une autre version, d’une autre taille ou non déterministe', () => {
    expect(isStoredQueensPuzzle(generated, { version: 2 })).toBe(false);
    expect(isStoredQueensPuzzle(generated, { size: 7 })).toBe(false);
    expect(isStoredQueensPuzzle({ ...generated, source: 'emergency' })).toBe(false);
    expect(isStoredQueensPuzzle({ ...generated, source: 'emergency' }, { allowEmergency: true })).toBe(true);
    expect(isStoredQueensPuzzle({ ...generated, type: 'binairo' })).toBe(false);
    expect(isStoredQueensPuzzle({ ...generated, target: { size: 7, tier: 1 } })).toBe(false);
  });

  it('cible de génération', () => {
    expect(isGenerationTarget({ size: 7, tier: 2 }, [6, 7])).toBe(true);
    expect(isGenerationTarget({ size: 8, tier: 2 }, [6, 7])).toBe(false);
    expect(isGenerationTarget({ size: 7, tier: 5 })).toBe(false);
    expect(isGenerationTarget({ size: '7', tier: 2 })).toBe(false);
  });
});
