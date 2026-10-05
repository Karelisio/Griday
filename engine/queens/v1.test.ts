import { describe, expect, it } from 'vitest';
import { SCHEDULE } from '../config';
import { addDays } from '../core/date';
import { generateWithAttempts } from '../core/pipeline';
import { rngFromString } from '../core/prng';
import { validateRegistry } from '../core/registry-check';
import { DIFFICULTY_TIERS } from '../core/types';
import { getDailyPuzzle, getUnlimitedPuzzle } from '../index';
import { REGISTRY } from '../registry';
import { encodeQueens, validateQueensStructure } from './encoding';
import { solveQueensExact } from './exact';
import { QUEENS_FALLBACKS_V1 } from './fallbacks.v1';
import { QUEENS_DEFINITION } from './index';
import { isQueensSolution } from './rules';
import { QUEENS_TECHNIQUES_V1, rateQueens } from './solver';
import type { QueensSolvedPuzzle } from './types';
import { QUEENS_V1, rateQueensV1 } from './v1';

function expectValid(p: QueensSolvedPuzzle): void {
  expect(validateQueensStructure(p)).toEqual([]);
  const exact = solveQueensExact(p, 2);
  expect(exact.complete).toBe(true);
  expect(exact.count).toBe(1);
  expect(exact.solutions[0]).toEqual([...p.solution]);
  expect(isQueensSolution(p, p.solution)).toBe(true);
  expect(rateQueens(p, QUEENS_TECHNIQUES_V1).solvable).toBe(true);
}

describe('Queens V1 — registre', () => {
  it('registre et calendrier cohérents', () => {
    expect(validateRegistry(REGISTRY, SCHEDULE)).toEqual([]);
  });

  it('plan hebdomadaire : tailles 6 → 10, difficulté croissante du lundi au dimanche', () => {
    const plan = QUEENS_V1.weeklyPlan;
    expect(plan[0]).toEqual({ size: 6, tier: 1 });
    expect(plan[6]).toEqual({ size: 10, tier: 4 });
    for (let i = 1; i < 7; i++) {
      expect(plan[i]!.size).toBeGreaterThanOrEqual(plan[i - 1]!.size);
      expect(plan[i]!.tier).toBeGreaterThanOrEqual(plan[i - 1]!.tier);
    }
  });
});

describe('Queens V1 — puzzles de secours', () => {
  it('chaque (taille, palier) a au moins 3 secours', () => {
    for (const size of QUEENS_V1.sizes) {
      for (const tier of DIFFICULTY_TIERS) {
        const n = QUEENS_FALLBACKS_V1.filter((e) => e.size === size && e.tier === tier).length;
        expect(n, `${size}/${tier}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('chaque secours est valide, unique, au bon palier et reproductible depuis sa graine', () => {
    for (const e of QUEENS_FALLBACKS_V1) {
      const res = generateWithAttempts(QUEENS_DEFINITION, 1, e.seed, { size: e.size, tier: e.tier });
      expect(res.source, e.seed).toBe('generated');
      expect(res.attempt, e.seed).toBe(e.attempt);
      expect(encodeQueens(res.puzzle), e.seed).toBe(e.code);
      expect(res.rating.tier).toBe(e.tier);
      expectValid(res.puzzle);
    }
  });

  it('fallback() : choix déterministe par pick, grille notée au palier demandé', () => {
    for (const target of QUEENS_V1.weeklyPlan) {
      const a = QUEENS_V1.fallback(target, 7);
      const b = QUEENS_V1.fallback(target, 7);
      expect(a).toEqual(b);
      expect(a.puzzle.size).toBe(target.size);
      expect(a.rating.tier).toBe(target.tier);
      expectValid(a.puzzle);
      const codes = new Set([0, 1, 2].map((pick) => encodeQueens(QUEENS_V1.fallback(target, pick).puzzle)));
      expect(codes.size).toBe(3);
    }
  });
});

describe('Queens V1 — tentative', () => {
  it('ne renvoie que des grilles uniques, logiques et au palier visé', () => {
    for (const target of QUEENS_V1.weeklyPlan) {
      for (let k = 0; k < 15; k++) {
        const res = QUEENS_V1.attempt(rngFromString(`v1-attempt:${target.size}:${target.tier}#${k}`), target);
        if (!res) continue;
        expect(res.puzzle.size).toBe(target.size);
        expect(res.rating).toEqual(rateQueensV1(res.puzzle));
        expect(res.rating.tier).toBe(target.tier);
        expectValid(res.puzzle);
      }
    }
  });
});

describe('Queens V1 — puzzle du jour', () => {
  it('quatre semaines : plan respecté, grilles générées valides, déterministes', () => {
    for (let i = 0; i < 28; i++) {
      const date = addDays('2026-10-05', i);
      const p = getDailyPuzzle(date);
      expect(p.type).toBe('queens');
      expect(p.source, date).toBe('generated');
      expect(p.target).toEqual(QUEENS_V1.weeklyPlan[p.weekday - 1]);
      expect(p.puzzle.size).toBe(p.target.size);
      expect(p.rating.tier).toBe(p.target.tier);
      expect(p.dayNumber).toBe(i + 1);
      expectValid(p.puzzle);
      expect(getDailyPuzzle(date)).toEqual(p);
    }
  });
});

describe('Mode illimité', () => {
  it('déterministe par jeton, cible respectée, jetons distincts → grilles distinctes', () => {
    const target = { size: 8, tier: 2 } as const;
    const a = getUnlimitedPuzzle('queens', target, 'abc123', '2026-10-05');
    expect(getUnlimitedPuzzle('queens', target, 'abc123', '2026-10-05')).toEqual(a);
    expect(a.seed).toBe('unlimited:abc123:queens:v1:8:2');
    expect(a.puzzle.size).toBe(8);
    expect(a.rating.tier).toBe(2);
    expectValid(a.puzzle);
    const b = getUnlimitedPuzzle('queens', target, 'abc124', '2026-10-05');
    expect(encodeQueens(b.puzzle)).not.toBe(encodeQueens(a.puzzle));
  });

  it('rejette un jeton non ASCII ou vide', () => {
    for (const token of ['', 'é', 'a b', 'x'.repeat(65)]) {
      expect(() => getUnlimitedPuzzle('queens', { size: 6, tier: 1 }, token, '2026-10-05')).toThrow(RangeError);
    }
  });
});
