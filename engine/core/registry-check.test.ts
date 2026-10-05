import { describe, expect, it } from 'vitest';
import type { Registry } from './pipeline';
import { validateRegistry } from './registry-check';
import type { Schedule } from './schedule';
import type { GenerationTarget, GeneratorVersion, WeeklyPlan } from './types';

const PLAN: WeeklyPlan = [
  { size: 6, tier: 1 },
  { size: 6, tier: 1 },
  { size: 7, tier: 2 },
  { size: 7, tier: 2 },
  { size: 8, tier: 3 },
  { size: 8, tier: 3 },
  { size: 8, tier: 4 },
];

const SCHED: Schedule = {
  epoch: '2026-10-05',
  rotations: [{ from: '2026-01-01', types: ['queens'] }],
  versions: { queens: [{ from: '2026-01-01', version: 1 }] },
};

function gen(over: Partial<GeneratorVersion<number>> = {}): GeneratorVersion<number> {
  return {
    version: 1,
    weeklyPlan: PLAN,
    sizes: [6, 7, 8],
    maxAttempts: 10,
    attempt: () => null,
    fallback: (t: GenerationTarget) => ({ puzzle: t.size, rating: { tier: t.tier, score: 1, hardest: 'x' } }),
    ...over,
  };
}

const reg = (versions: Record<number, GeneratorVersion<number>>, id = 'queens'): Registry =>
  ({ queens: { id, versions } }) as unknown as Registry;

describe('validateRegistry', () => {
  it('registre cohérent → aucune erreur', () => {
    expect(validateRegistry(reg({ 1: gen() }), SCHED)).toEqual([]);
  });

  it('détecte chaque incohérence', () => {
    expect(validateRegistry(reg({ 1: gen() }, 'autre'), SCHED)).toEqual(['registre : "queens" déclare l\'id "autre"']);
    expect(validateRegistry(reg({ 1: gen({ version: 2 }) }), SCHED)).toEqual(['queens v1 : numéro incohérent (2)']);
    expect(validateRegistry(reg({ 1: gen({ maxAttempts: 0 }) }), SCHED)).toEqual(['queens v1 : maxAttempts invalide']);
    expect(validateRegistry(reg({ 1: gen({ sizes: [6, 7] }) }), SCHED)).toEqual([
      'queens v1 : taille 8 du plan absente de sizes',
      'queens v1 : taille 8 du plan absente de sizes',
      'queens v1 : taille 8 du plan absente de sizes',
    ]);
    const noFallback = gen({
      fallback: (t) => {
        if (t.size === 8 && t.tier === 4) throw new Error('vide');
        return { puzzle: 0, rating: { tier: t.tier, score: 1, hardest: 'x' } };
      },
    });
    expect(validateRegistry(reg({ 1: noFallback }), SCHED)).toEqual([
      'queens v1 : pas de secours pour 8/4 (vide)',
      'queens v1 : pas de secours pour 8/4 (vide)',
    ]);
  });

  it('inclut la validation du calendrier (version inconnue du registre)', () => {
    const sched: Schedule = { ...SCHED, versions: { queens: [{ from: '2026-01-01', version: 2 }] } };
    expect(validateRegistry(reg({ 1: gen() }), sched)).toEqual(['versions.queens : version 2 inconnue du registre']);
  });

  it('type absent du registre', () => {
    expect(validateRegistry({} as Registry, SCHED)).toContain('registre : type "queens" absent');
  });
});
