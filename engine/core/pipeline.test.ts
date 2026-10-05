import { describe, expect, it } from 'vitest';
import { SCHEDULE } from '../config';
import { addDays, diffDays } from './date';
import { attemptSeed, dailySeed, generateDaily, generateWithAttempts, type Registry } from './pipeline';
import { cyrb128, rngFromString } from './prng';
import type { Schedule } from './schedule';
import {
  PUZZLE_TYPE_IDS,
  type GenerationTarget,
  type GeneratorVersion,
  type PuzzleTypeDefinition,
  type PuzzleTypeId,
  type WeeklyPlan,
} from './types';

// --- Générateur factice : enregistre les flux reçus, réussit selon une règle injectée -----------
interface MockPuzzle {
  readonly label: string;
  readonly probe: readonly number[];
}
interface Recorder {
  readonly attempts: { probe: number[]; target: GenerationTarget }[];
  readonly fallbacks: { target: GenerationTarget; pick: number }[];
}
const newRecorder = (): Recorder => ({ attempts: [], fallbacks: [] });
const PROBE = 4;
const probeOf = (seed: string): number[] => {
  const rng = rngFromString(seed);
  return Array.from({ length: PROBE }, () => rng.nextU32());
};

const PLAN_A: WeeklyPlan = [
  { size: 4, tier: 1 },
  { size: 5, tier: 1 },
  { size: 6, tier: 2 },
  { size: 7, tier: 2 },
  { size: 8, tier: 3 },
  { size: 9, tier: 3 },
  { size: 10, tier: 4 },
];
const PLAN_B: WeeklyPlan = [
  { size: 12, tier: 4 },
  { size: 11, tier: 4 },
  { size: 10, tier: 3 },
  { size: 9, tier: 3 },
  { size: 8, tier: 2 },
  { size: 7, tier: 2 },
  { size: 6, tier: 1 },
];
const TARGET: GenerationTarget = { size: 7, tier: 2 };

interface MockOptions {
  readonly rec: Recorder;
  readonly maxAttempts?: number;
  readonly plan?: WeeklyPlan;
  /** k = rang de l'appel pour ce Recorder. */
  readonly succeed?: (k: number, probe: readonly number[]) => boolean;
  readonly onAttempt?: () => void;
}

function mockVersion(version: number, o: MockOptions): GeneratorVersion<MockPuzzle> {
  return {
    version,
    weeklyPlan: o.plan ?? PLAN_A,
    sizes: [5, 6, 7],
    maxAttempts: o.maxAttempts ?? 10,
    attempt(rng, target) {
      const probe = Array.from({ length: PROBE }, () => rng.nextU32());
      const k = o.rec.attempts.length;
      o.rec.attempts.push({ probe, target });
      o.onAttempt?.();
      if (!(o.succeed ?? (() => false))(k, probe)) return null;
      return { puzzle: { label: `v${version}#${k}`, probe }, rating: { tier: target.tier, score: k, hardest: 'mock' } };
    },
    fallback(target, pick) {
      o.rec.fallbacks.push({ target, pick });
      return { puzzle: { label: `secours:${pick % 3}`, probe: [] }, rating: { tier: target.tier, score: 1000, hardest: 'secours' } };
    },
  };
}

const T = (s: string): PuzzleTypeId => s as PuzzleTypeId;
const mockDef = (id: string, versions: GeneratorVersion<MockPuzzle>[]): PuzzleTypeDefinition<MockPuzzle> => ({
  id: T(id),
  versions: Object.fromEntries(versions.map((v) => [v.version, v])),
});

const SEED = '2026-10-05:queens:v1';

describe('formats de graine (FIGÉS)', () => {
  it('dailySeed / attemptSeed', () => {
    expect(dailySeed('2026-10-05', 'queens', 1)).toBe('2026-10-05:queens:v1');
    expect(dailySeed('9999-12-31', 'queens', 12)).toBe('9999-12-31:queens:v12');
    expect(attemptSeed(SEED, 0)).toBe('2026-10-05:queens:v1#0');
    expect(attemptSeed(SEED, 17)).toBe('2026-10-05:queens:v1#17');
  });

  it('identifiants de type compatibles avec le format (ASCII minuscule, sans « : » ni « # »)', () => {
    for (const id of PUZZLE_TYPE_IDS) expect(id).toMatch(/^[a-z][a-z0-9]*$/);
  });
});

describe('generateWithAttempts', () => {
  it('la tentative k reçoit exactement le flux rngFromString(`${seed}#${k}`) ; 1re réussite renvoyée', () => {
    const rec = newRecorder();
    const def = mockDef('queens', [mockVersion(1, { rec, succeed: (k) => k === 3 })]);
    const res = generateWithAttempts(def, 1, SEED, TARGET);
    expect(rec.attempts.map((a) => a.probe)).toEqual([0, 1, 2, 3].map((k) => probeOf(`2026-10-05:queens:v1#${k}`)));
    expect(rec.attempts.every((a) => a.target === TARGET)).toBe(true);
    expect(rec.fallbacks).toEqual([]);
    expect(res).toEqual({
      type: 'queens',
      version: 1,
      seed: SEED,
      attempt: 3,
      source: 'generated',
      target: TARGET,
      rating: { tier: 2, score: 3, hardest: 'mock' },
      puzzle: { label: 'v1#3', probe: probeOf(`${SEED}#3`) },
    });
  });

  it('réussite immédiate → attempt = 0, une seule tentative', () => {
    const rec = newRecorder();
    const res = generateWithAttempts(mockDef('queens', [mockVersion(1, { rec, succeed: () => true })]), 1, SEED, TARGET);
    expect(res.attempt).toBe(0);
    expect(res.source).toBe('generated');
    expect(rec.attempts).toHaveLength(1);
  });

  it('secours après exactement maxAttempts échecs, choisi par cyrb128(seed)[0]', () => {
    const rec = newRecorder();
    const res = generateWithAttempts(mockDef('queens', [mockVersion(1, { rec, maxAttempts: 7 })]), 1, SEED, TARGET);
    expect(rec.attempts).toHaveLength(7);
    expect(rec.attempts.map((a) => a.probe)).toEqual([0, 1, 2, 3, 4, 5, 6].map((k) => probeOf(`${SEED}#${k}`)));
    // Valeur figée (cf. vecteurs cyrb128 de prng.test.ts).
    expect(rec.fallbacks).toEqual([{ target: TARGET, pick: 4253865251 }]);
    expect(cyrb128(SEED)[0]).toBe(4253865251);
    expect(res).toEqual({
      type: 'queens',
      version: 1,
      seed: SEED,
      attempt: -1,
      source: 'fallback',
      target: TARGET,
      rating: { tier: 2, score: 1000, hardest: 'secours' },
      puzzle: { label: `secours:${4253865251 % 3}`, probe: [] },
    });
  });

  it('maxAttempts = 0 → secours direct, aucune tentative', () => {
    const rec = newRecorder();
    const res = generateWithAttempts(mockDef('queens', [mockVersion(1, { rec, maxAttempts: 0 })]), 1, SEED, TARGET);
    expect(rec.attempts).toEqual([]);
    expect(res.source).toBe('fallback');
  });

  it('version absente du registre → erreur', () => {
    const def = mockDef('queens', [mockVersion(1, { rec: newRecorder() })]);
    expect(() => generateWithAttempts(def, 2, SEED, TARGET)).toThrow(/Version 2 inconnue/);
  });

  it('déterministe : deux exécutions indépendantes donnent le même résultat', () => {
    const run = () =>
      generateWithAttempts(
        mockDef('queens', [mockVersion(1, { rec: newRecorder(), succeed: (_k, p) => p[0]! % 5 === 0, maxAttempts: 50 })]),
        1,
        SEED,
        TARGET,
      );
    const a = run();
    expect(a.source).toBe('generated');
    expect(run()).toEqual(a);
  });

  it('une exception de attempt se propage (pas d’avalement silencieux)', () => {
    const v = mockVersion(1, { rec: newRecorder() });
    const def = mockDef('queens', [
      {
        ...v,
        attempt: () => {
          throw new Error('boum');
        },
      },
    ]);
    expect(() => generateWithAttempts(def, 1, SEED, TARGET)).toThrow('boum');
  });

  it('des champs parasites renvoyés par attempt/fallback n’écrasent pas les métadonnées', () => {
    const parasite = { type: 'x', version: 99, seed: 'x', attempt: 99, source: 'x', target: { size: 1, tier: 1 } };
    const base = mockVersion(1, { rec: newRecorder() });
    const rating = { tier: 2 as const, score: 1, hardest: 'm' };
    const ok = mockDef('queens', [{ ...base, attempt: () => ({ puzzle: { label: 'p', probe: [] }, rating, ...parasite }) }]);
    expect(generateWithAttempts(ok, 1, SEED, TARGET)).toEqual({
      type: 'queens',
      version: 1,
      seed: SEED,
      attempt: 0,
      source: 'generated',
      target: TARGET,
      rating,
      puzzle: { label: 'p', probe: [] },
    });
    const fb = mockDef('queens', [{ ...base, maxAttempts: 0, fallback: () => ({ puzzle: { label: 'f', probe: [] }, rating, ...parasite }) }]);
    expect(generateWithAttempts(fb, 1, SEED, TARGET)).toEqual({
      type: 'queens',
      version: 1,
      seed: SEED,
      attempt: -1,
      source: 'fallback',
      target: TARGET,
      rating,
      puzzle: { label: 'f', probe: [] },
    });
  });
});

describe('filet temps réel (deadlineMs, horloge injectée)', () => {
  /** Horloge factice : chaque tentative « dure » 10 ms. */
  const timed = (deadlineMs: number, maxAttempts = 10) => {
    const rec = newRecorder();
    let t = 1000;
    const def = mockDef('queens', [mockVersion(1, { rec, maxAttempts, onAttempt: () => (t += 10) })]);
    const res = generateWithAttempts(def, 1, SEED, TARGET, { deadlineMs, now: () => t });
    return { res, rec };
  };

  it('dépassement → arrêt entre deux tentatives puis secours marqué « emergency »', () => {
    const { res, rec } = timed(25); // écoulé avant k = 3 : 30 ms > 25
    expect(rec.attempts).toHaveLength(3);
    expect(res.source).toBe('emergency');
    expect(res.attempt).toBe(-1);
    expect(rec.fallbacks).toEqual([{ target: TARGET, pick: cyrb128(SEED)[0] }]);
  });

  it('comparaison stricte : écoulé = deadline ne coupe pas', () => {
    expect(timed(30).rec.attempts).toHaveLength(4);
  });

  it('jamais vérifié avant la tentative 0 (même avec deadline ≤ 0 et une horloge qui avance)', () => {
    for (const deadlineMs of [0, -1]) {
      const rec = newRecorder();
      let t = 0;
      const def = mockDef('queens', [mockVersion(1, { rec, succeed: (k) => k === 0 })]);
      const res = generateWithAttempts(def, 1, SEED, TARGET, { deadlineMs, now: () => ++t });
      expect(rec.attempts, `deadline ${deadlineMs}`).toHaveLength(1);
      expect(res.source).toBe('generated');
      expect(res.attempt).toBe(0);
    }
  });

  it('non déclenché → résultat identique à l’absence de filet (horloge injectée ou Date.now)', () => {
    const make = () => mockDef('queens', [mockVersion(1, { rec: newRecorder(), succeed: (k) => k === 4 })]);
    const ref = generateWithAttempts(make(), 1, SEED, TARGET);
    let t = 0;
    expect(generateWithAttempts(make(), 1, SEED, TARGET, { deadlineMs: 1000, now: () => (t += 1) })).toEqual(ref);
    expect(generateWithAttempts(make(), 1, SEED, TARGET, { deadlineMs: 60_000 })).toEqual(ref);
  });
});

describe('generateDaily', () => {
  // Rotation alpha/beta ; alpha passe en v2 (autre plan hebdomadaire) le 2026-02-01.
  const SCHED = {
    epoch: '2026-01-05',
    rotations: [{ from: '2026-01-01', types: ['alpha', 'beta'] }],
    versions: {
      alpha: [
        { from: '2026-01-01', version: 1 },
        { from: '2026-02-01', version: 2 },
      ],
      beta: [{ from: '2026-01-01', version: 1 }],
    },
  } as unknown as Schedule;

  const MAX = 10;
  const succeed = (_k: number, probe: readonly number[]) => probe[0]! % 8 === 0; // p = 1/8 : secours fréquents
  const makeRegistry = (rec: Recorder): Registry =>
    ({
      alpha: mockDef('alpha', [mockVersion(1, { rec, succeed, maxAttempts: MAX }), mockVersion(2, { rec, succeed, maxAttempts: MAX, plan: PLAN_B })]),
      beta: mockDef('beta', [mockVersion(1, { rec, succeed, maxAttempts: MAX })]),
    }) as unknown as Registry;

  /** Oracle indépendant : première tentative dont le flux commence par un multiple de 8. */
  const firstSuccess = (seed: string): number => {
    for (let k = 0; k < MAX; k++) if (rngFromString(`${seed}#${k}`).nextU32() % 8 === 0) return k;
    return -1;
  };

  it('jour de semaine → weeklyPlan, rotation, version, graine, numéro (4 semaines, bascule v2 incluse)', () => {
    let fallbacks = 0;
    let generated = 0;
    for (let i = 0; i < 28; i++) {
      const date = addDays('2026-01-19', i);
      const rec = newRecorder();
      const res = generateDaily(makeRegistry(rec), SCHED, date);
      const type = diffDays('2026-01-01', date) % 2 === 0 ? 'alpha' : 'beta';
      const version = type === 'alpha' && date >= '2026-02-01' ? 2 : 1;
      const seed = `${date}:${type}:v${version}`;
      const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
      const target = (version === 2 ? PLAN_B : PLAN_A)[weekday - 1]!;
      const k = firstSuccess(seed);
      if (k < 0) fallbacks++;
      else generated++;
      expect(res, date).toEqual({
        type,
        version,
        seed,
        attempt: k,
        source: k >= 0 ? 'generated' : 'fallback',
        target,
        rating: k >= 0 ? { tier: target.tier, score: k, hardest: 'mock' } : { tier: target.tier, score: 1000, hardest: 'secours' },
        puzzle:
          k >= 0
            ? { label: `v${version}#${k}`, probe: probeOf(`${seed}#${k}`) }
            : { label: `secours:${cyrb128(seed)[0] % 3}`, probe: [] },
        date,
        dayNumber: diffDays('2026-01-05', date) + 1,
        weekday,
      });
      expect(rec.attempts.every((a) => a.target === target)).toBe(true);
    }
    // Les deux chemins sont couverts.
    expect(fallbacks).toBeGreaterThan(0);
    expect(generated).toBeGreaterThan(0);
  });

  it('déterministe sur appels répétés', () => {
    for (const date of ['2026-01-31', '2026-02-01', '2026-02-02']) {
      const a = generateDaily(makeRegistry(newRecorder()), SCHED, date);
      expect(generateDaily(makeRegistry(newRecorder()), SCHED, date)).toEqual(a);
    }
  });

  it('erreurs : date invalide, version manquante dans le registre', () => {
    expect(() => generateDaily(makeRegistry(newRecorder()), SCHED, '2026-02-30')).toThrow(RangeError);
    const sched = structuredClone(SCHED) as unknown as { versions: Record<string, { from: string; version: number }[]> };
    sched.versions.beta!.push({ from: '2026-03-01', version: 3 });
    // 2026-03-01 : décalage 59 → beta (v3 absente du registre).
    expect(() => generateDaily(makeRegistry(newRecorder()), sched as unknown as Schedule, '2026-03-01')).toThrow(/Version 3 inconnue pour "beta"/);
  });

  it('SCHEDULE officiel : puzzle n°1 = Queens v1, lundi', () => {
    const rec = newRecorder();
    const registry = { queens: mockDef('queens', [mockVersion(1, { rec, succeed: () => true })]) } as unknown as Registry;
    const res = generateDaily(registry, SCHEDULE, '2026-10-05');
    expect(res).toMatchObject({ type: 'queens', version: 1, seed: '2026-10-05:queens:v1', attempt: 0, dayNumber: 1, weekday: 1, target: PLAN_A[0] });
    expect(rec.attempts[0]!.probe).toEqual(probeOf('2026-10-05:queens:v1#0'));
  });
});
