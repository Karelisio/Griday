import { describe, expect, it } from 'vitest';
import { SCHEDULE } from '../../config';
import { addDays } from '../../core/date';
import { generateWithAttempts } from '../../core/pipeline';
import { rngFromString } from '../../core/prng';
import { validateRegistry } from '../../core/registry-check';
import { DIFFICULTY_TIERS } from '../../core/types';
import { getDailyPuzzle, getUnlimitedPuzzle } from '../../index';
import { REGISTRY } from '../../registry';
import { encodeQueens, validateQueensStructure } from '../encoding';
import { solveQueensExact } from '../exact';
import { QUEENS_DEFINITION } from '../index';
import { isQueensSolution } from '../rules';
import type { QueensSolvedPuzzle } from '../types';
import { QUEENS_FALLBACKS_V1 } from './fallbacks';
import { QUEENS_TECHNIQUES_V1, rateQueens } from './solver';
import { encodeDigits } from './util';
import { acceptsV1, QUEENS_V1, rateQueensV1 } from './version';

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

  it('configuration gelée (aucune mutation possible du plan ou de la version)', () => {
    expect(Object.isFrozen(QUEENS_V1)).toBe(true);
    expect(Object.isFrozen(QUEENS_V1.weeklyPlan)).toBe(true);
    expect(Object.isFrozen(QUEENS_V1.weeklyPlan[0])).toBe(true);
    const p = getDailyPuzzle('2026-10-05');
    expect(p.target).not.toBe(QUEENS_V1.weeklyPlan[0]);
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

  it('chaque secours est reproductible depuis sa graine, valide, unique et conforme à sa cible', () => {
    for (const e of QUEENS_FALLBACKS_V1) {
      const target = { size: e.size, tier: e.tier };
      const res = generateWithAttempts(QUEENS_DEFINITION, 1, e.seed, target);
      expect(res.source, e.seed).toBe('generated');
      expect(res.attempt, e.seed).toBe(e.attempt);
      expect(encodeDigits(res.puzzle.regions), e.seed).toBe(e.regions);
      expect(encodeDigits(res.puzzle.solution), e.seed).toBe(e.solution);
      expect(res.rating).toEqual({ tier: e.tier, score: e.score, hardest: e.hardest });
      expect(acceptsV1(target, res.rating)).toBe(true);
      expectValid(res.puzzle);
    }
  });

  it('fallback() : choix déterministe par pick, données identiques au recalcul', () => {
    for (const target of QUEENS_V1.weeklyPlan) {
      const a = QUEENS_V1.fallback(target, 7);
      expect(QUEENS_V1.fallback(target, 7)).toEqual(a);
      expect(a.puzzle.size).toBe(target.size);
      expect(a.rating).toEqual(rateQueensV1(a.puzzle));
      expect(acceptsV1(target, a.rating)).toBe(true);
      expectValid(a.puzzle);
      const codes = new Set([0, 1, 2].map((pick) => encodeQueens(QUEENS_V1.fallback(target, pick).puzzle)));
      expect(codes.size).toBe(3);
    }
  });
});

describe('Queens V1 — tentative', () => {
  it('ne renvoie que des grilles uniques, logiques et conformes à la cible (palier + bande de score)', () => {
    for (const target of QUEENS_V1.weeklyPlan) {
      let accepted = 0;
      for (let k = 0; k < 20; k++) {
        const res = QUEENS_V1.attempt(rngFromString(`v1-attempt:${target.size}:${target.tier}#${k}`), target);
        if (!res) continue;
        accepted++;
        expect(res.puzzle.size).toBe(target.size);
        expect(res.rating).toEqual(rateQueensV1(res.puzzle));
        expect(acceptsV1(target, res.rating)).toBe(true);
        expectValid(res.puzzle);
      }
      expect(accepted, `${target.size}/${target.tier}`).toBeGreaterThan(0);
    }
  });

  it('acceptsV1 : palier exact et bandes de score', () => {
    const r = (tier: 1 | 2 | 3 | 4, score: number) => ({ tier, score, hardest: 'x' });
    expect(acceptsV1({ size: 6, tier: 1 }, r(1, 10))).toBe(true);
    expect(acceptsV1({ size: 6, tier: 1 }, r(1, 11))).toBe(false);
    expect(acceptsV1({ size: 6, tier: 1 }, r(2, 8))).toBe(false);
    expect(acceptsV1({ size: 9, tier: 3 }, r(3, 49))).toBe(false);
    expect(acceptsV1({ size: 9, tier: 3 }, r(3, 50))).toBe(true);
    expect(acceptsV1({ size: 10, tier: 4 }, r(4, 59))).toBe(false);
    expect(acceptsV1({ size: 10, tier: 4 }, r(4, 200))).toBe(true);
    expect(acceptsV1({ size: 10, tier: 4 }, r(4, 201))).toBe(false);
    expect(acceptsV1({ size: 6, tier: 4 }, r(4, 999))).toBe(true); // hors plan : pas de bande
  });
});

describe('Queens V1 — puzzle du jour', () => {
  it('quatre semaines : plan et bandes respectés, grilles générées valides, déterministes', () => {
    for (let i = 0; i < 28; i++) {
      const date = addDays('2026-10-05', i);
      const p = getDailyPuzzle(date);
      expect(p.type).toBe('queens');
      expect(p.source, date).toBe('generated');
      expect(p.target).toEqual(QUEENS_V1.weeklyPlan[p.weekday - 1]);
      expect(p.puzzle.size).toBe(p.target.size);
      expect(acceptsV1(p.target, p.rating)).toBe(true);
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
    expect(a.version).toBe(1);
    expect(a.puzzle.size).toBe(8);
    expect(a.rating.tier).toBe(2);
    expectValid(a.puzzle);
    const b = getUnlimitedPuzzle('queens', target, 'abc124', '2026-10-05');
    expect(encodeQueens(b.puzzle)).not.toBe(encodeQueens(a.puzzle));
  });

  it('version explicite (partie sauvegardée) : même puzzle quelle que soit la date', () => {
    const target = { size: 7, tier: 3 } as const;
    const a = getUnlimitedPuzzle('queens', target, 'save42', '2026-10-05');
    expect(getUnlimitedPuzzle('queens', target, 'save42', '2040-01-01', { version: 1 })).toEqual(a);
  });

  it('rejette jetons non ASCII/vides, tailles et paliers invalides, version inconnue', () => {
    for (const token of ['', 'é', 'a b', 'x'.repeat(65)]) {
      expect(() => getUnlimitedPuzzle('queens', { size: 6, tier: 1 }, token, '2026-10-05')).toThrow(RangeError);
    }
    const bad = [{ size: 5, tier: 1 }, { size: 11, tier: 1 }, { size: 6, tier: 0 }, { size: 6, tier: 5 }, { size: 6, tier: '2' }];
    for (const target of bad) {
      expect(() => getUnlimitedPuzzle('queens', target as never, 'tok', '2026-10-05')).toThrow(RangeError);
    }
    expect(() => getUnlimitedPuzzle('queens', { size: 6, tier: 1 }, 'tok', '2026-10-05', { version: 9 })).toThrow(RangeError);
  });
});
