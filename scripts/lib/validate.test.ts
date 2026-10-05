/**
 * Régression du validateur long terme : un type factice et des mutations ciblées
 * (chacune doit faire échouer la validation, sauf les pauses isolées tolérées).
 */
import { describe, expect, it } from 'vitest';
import { isoWeekday } from '../../engine/core/date';
import type { Registry } from '../../engine/core/pipeline';
import type { Rng } from '../../engine/core/prng';
import type { Schedule } from '../../engine/core/schedule';
import type { DifficultyTier, GenerationTarget, GeneratorVersion, PuzzleTypeDefinition, WeeklyPlan } from '../../engine/core/types';
import { DAILY_FILE, dailyKeys, runValidation, versionFile, type GoldenData, type ValidationOptions } from './validate';

interface Fake {
  readonly size: number;
  readonly tier: DifficultyTier;
  readonly score: number;
  readonly label: string;
}

const PLAN: WeeklyPlan = [
  { size: 4, tier: 1 },
  { size: 5, tier: 1 },
  { size: 5, tier: 2 },
  { size: 6, tier: 2 },
  { size: 6, tier: 3 },
  { size: 7, tier: 3 },
  { size: 8, tier: 4 },
];

interface Mutations {
  /** Prédicat sur le tirage d'une tentative (sous-ensemble déterministe de jours). */
  readonly when?: (u: number) => boolean;
  readonly wrongSize?: boolean;
  readonly badVerify?: boolean;
  readonly alwaysReject?: boolean;
  readonly throws?: boolean;
  readonly decreasingCurve?: boolean;
  /** Durée simulée (ms) des tentatives concernées, la 1re fois seulement ou à chaque fois. */
  readonly slowMs?: number;
  readonly slowOnce?: boolean;
  readonly label?: string;
}

let clock = 0;
const now = () => clock;

function makeVersion(version: number, m: Mutations = {}): GeneratorVersion<Fake> {
  const seenSlow = new Set<number>();
  const hit = (u: number) => (m.when ?? (() => false))(u);
  const scoreFor = (t: GenerationTarget, u: number) => (m.decreasingCurve ? 100 - t.size * 10 : t.size * 10) + (u % 3);
  return {
    version,
    weeklyPlan: PLAN,
    sizes: [4, 5, 6, 7, 8],
    maxAttempts: 5,
    rate: (p) => ({ tier: p.tier, score: p.score, hardest: 'x' }),
    accepts: (t, r) => r.tier === t.tier,
    attempt(rng: Rng, target: GenerationTarget) {
      const u = rng.nextU32();
      clock += 1;
      if (hit(u)) {
        if (m.throws) throw new Error('panne simulée');
        if (m.alwaysReject) return null;
        if (m.slowMs !== undefined && (!m.slowOnce || !seenSlow.has(u))) {
          seenSlow.add(u);
          clock += m.slowMs;
        }
      }
      const size = m.wrongSize && hit(u) ? target.size + 1 : target.size;
      const label = `${m.label ?? 'v'}${version}:${u}${m.badVerify && hit(u) ? ':bad' : ''}`;
      return { puzzle: { size, tier: target.tier, score: scoreFor(target, u), label }, rating: { tier: target.tier, score: scoreFor(target, u), hardest: 'x' } };
    },
    fallback(target) {
      const score = scoreFor(target, 0);
      return { puzzle: { size: target.size, tier: target.tier, score, label: `fb${target.size}` }, rating: { tier: target.tier, score, hardest: 'x' } };
    },
  };
}

function makeRegistry(versions: GeneratorVersion<Fake>[]): Registry {
  const def: PuzzleTypeDefinition<Fake> = {
    id: 'queens',
    versions: Object.fromEntries(versions.map((v) => [v.version, v])),
    encode: (p) => `${p.size}/${p.tier}/${p.score}/${p.label}`,
    verify: (p) => (p.label.endsWith(':bad') ? ['2 solutions'] : []),
    sizeOf: (p) => p.size,
  };
  // Second type du registre (hors rotation, non validé ici) : même définition, autre identifiant.
  return { queens: def, binairo: { ...def, id: 'binairo' } } as unknown as Registry;
}

const SCHED: Schedule = {
  epoch: '2026-01-05',
  validThrough: '2026-03-15',
  rotations: [{ from: '2026-01-01', types: ['queens'] }],
  versions: { queens: [{ from: '2026-01-01', version: 1 }], binairo: [{ from: '2026-01-01', version: 1 }] },
};

function memoryStore(initial: Record<string, GoldenData> = {}) {
  const files = new Map<string, GoldenData>(Object.entries(initial));
  return {
    files,
    read: (f: string) => files.get(f),
    write: (f: string, d: GoldenData) => void files.set(f, d),
  };
}

function run(registry: Registry, o: Partial<ValidationOptions> & { store: ValidationOptions['store'] }, schedule = SCHED) {
  clock = 0;
  return runValidation(registry, schedule, {
    from: '2026-01-01',
    to: '2026-07-01',
    maxMs: 500,
    types: ['queens'],
    writeGolden: false,
    now,
    ...o,
  });
}

/** Références valides pour le registre nominal. */
function frozenStore() {
  const store = memoryStore();
  const res = run(makeRegistry([makeVersion(1)]), { store, writeGolden: true });
  expect(res.errors).toEqual([]);
  expect(res.written).toBe(true);
  return store;
}

const every7 = (u: number) => u % 7 === 0;

describe('validateur long terme', () => {
  it('nominal : aucune erreur, références écrites puis vérifiées', () => {
    const store = frozenStore();
    expect([...store.files.keys()].sort()).toEqual([DAILY_FILE, versionFile('queens', 1)]);
    // Seuls les mois servis jusqu'à validThrough sont figés.
    expect(Object.keys(store.files.get(versionFile('queens', 1))!)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(Object.keys(store.files.get(DAILY_FILE)!)).toEqual(dailyKeys(SCHED.epoch, SCHED.validThrough));
    const res = run(makeRegistry([makeVersion(1)]), { store });
    expect(res.errors).toEqual([]);
    expect(res.golden.every((g) => g.mismatches.length === 0 && g.missing.length === 0)).toBe(true);
    expect(res.golden.find((g) => g.file === DAILY_FILE)!.checked).toBe(3); // 2026-01, 2026-02, 2026-03-01..15
  });

  it('dailyKeys : mois entiers jusqu’à validThrough puis plage partielle', () => {
    expect(dailyKeys('2026-01-05', '2026-03-15')).toEqual(['2026-01', '2026-02', '2026-03-01..15']);
    expect(dailyKeys('2026-01-05', '2026-03-31')).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('références absentes : erreur jusqu’à validThrough, simple avertissement au-delà', () => {
    const res = run(makeRegistry([makeVersion(1)]), { store: memoryStore() });
    expect(res.errors.some((e) => e.startsWith(`${DAILY_FILE} : 3 référence(s) obligatoire(s)`))).toBe(true);
    expect(res.errors.some((e) => e.startsWith(`${versionFile('queens', 1)} : 3 référence(s) obligatoire(s)`))).toBe(true);
    expect(res.warnings.some((w) => w.includes('au-delà de validThrough ou non servis'))).toBe(true);
  });

  it('référence modifiée : erreur', () => {
    const store = frozenStore();
    const v1 = { ...store.files.get(versionFile('queens', 1))!, '2026-02': '0'.repeat(32) };
    store.files.set(versionFile('queens', 1), v1);
    const res = run(makeRegistry([makeVersion(1)]), { store });
    expect(res.errors).toContain(`${versionFile('queens', 1)} 2026-02 : empreinte ≠ référence — puzzles publiés modifiés !`);
  });

  it('calendrier modifié a posteriori (nouvelle version avant validThrough) : puzzle du jour divergent', () => {
    const store = frozenStore();
    const changed: Schedule = { ...SCHED, versions: { ...SCHED.versions, queens: [{ from: '2026-01-01', version: 1 }, { from: '2026-02-01', version: 2 }] } };
    const res = run(makeRegistry([makeVersion(1), makeVersion(2, { label: 'w' })]), { store }, changed);
    expect(res.errors).toContain(`${DAILY_FILE} 2026-02 : empreinte ≠ référence — puzzles publiés modifiés !`);
    // La sortie de la V1 elle-même n'a pas changé : ses références restent valides.
    expect(res.golden.find((g) => g.file === versionFile('queens', 1))!.mismatches).toEqual([]);
  });

  it.each<[string, Mutations, RegExp]>([
    ['grille de mauvaise taille', { when: every7, wrongSize: true }, /grille \d+ ≠ taille \d+ du plan/],
    ['solution non unique', { when: every7, badVerify: true }, /: 2 solutions$/],
    ['budget épuisé → secours', { when: () => true, alwaysReject: true }, /source « fallback »/],
    ['exception pendant la génération', { when: every7, throws: true }, /exception à la génération : panne simulée/],
    ['lenteur systématique', { when: every7, slowMs: 600 }, /génération en \d+ ms \(> 500 ms\)/],
    ['1re mesure > 2 × limite', { when: (u) => u % 97 === 0, slowMs: 1200, slowOnce: true }, /1re mesure \d+ ms \(> 2 × 500 ms\)/],
    ['courbe hebdomadaire décroissante', { decreasingCurve: true }, /courbe hebdomadaire non croissante/],
  ])('%s : erreur', (_name, mutations, pattern) => {
    const res = run(makeRegistry([makeVersion(1, mutations)]), { store: frozenStore() });
    expect(res.errors.some((e) => pattern.test(e)), res.errors.slice(0, 5).join('\n')).toBe(true);
  });

  it('pauses isolées : tolérées (avertissement) jusqu’à 3, erreur au-delà', () => {
    let firstSlow = -1;
    const once = makeVersion(1, {
      when: (u) => {
        if (firstSlow === -1 && u % 50 === 0) firstSlow = u;
        return u === firstSlow;
      },
      slowMs: 700,
      slowOnce: true,
    });
    const ok = run(makeRegistry([once]), { store: frozenStore() });
    expect(ok.errors).toEqual([]);
    expect(ok.warnings.some((w) => /1re mesure 70\d ms > 500 ms/.test(w))).toBe(true);

    const many = run(makeRegistry([makeVersion(1, { when: (u) => u % 11 === 0, slowMs: 700, slowOnce: true })]), { store: frozenStore() });
    expect(many.types[0]!.retries).toHaveLength(3);
    expect(many.errors.some((e) => /plus de 2e mesure : 3 déjà utilisées/.test(e))).toBe(true);
  });

  it('arrêt anticipé après trop d’erreurs de temps (rapport partiel, échec)', () => {
    const progress: string[] = [];
    const res = run(makeRegistry([makeVersion(1, { when: () => true, slowMs: 600 })]), {
      store: frozenStore(),
      maxTimingErrors: 5,
      onProgress: (m) => progress.push(m),
    });
    expect(res.errors.filter((e) => /génération en \d+ ms/.test(e))).toHaveLength(5);
    expect(res.errors.some((e) => /arrêt anticipé après 5 erreurs de temps/.test(e))).toBe(true);
    expect(res.errors).toContain('queens références non vérifiées (arrêt anticipé)');
    expect(progress).toEqual(['queens 2026…']);
  });

  it('version non servie (inscrite au registre, jamais activée) : aucune référence exigée', () => {
    const res = run(makeRegistry([makeVersion(1), makeVersion(2, { label: 'w' })]), { store: frozenStore() });
    expect(res.errors).toEqual([]);
    expect(res.golden.find((g) => g.file === versionFile('queens', 2))).toEqual({
      file: versionFile('queens', 2), checked: 0, mismatches: [], missing: [], pending: [], added: [],
    });
  });

  it('version activée après validThrough : références en attente (avertissement), jamais écrites', () => {
    const later: Schedule = { ...SCHED, versions: { ...SCHED.versions, queens: [{ from: '2026-01-01', version: 1 }, { from: '2026-05-01', version: 2 }] } };
    const store = frozenStore();
    const res = run(makeRegistry([makeVersion(1), makeVersion(2, { label: 'w' })]), { store, writeGolden: true }, later);
    expect(res.errors).toEqual([]);
    expect(res.golden.find((g) => g.file === versionFile('queens', 2))!.pending).toEqual(['2026-05', '2026-06']);
    expect(store.files.has(versionFile('queens', 2))).toBe(false);
    expect(res.warnings.some((w) => w.startsWith(`${versionFile('queens', 2)} : 2 mois sans référence`))).toBe(true);
  });

  it('type hors rotation : validé chaque jour ; épinglé, toutes ses références sont obligatoires puis figées', () => {
    const store = frozenStore();
    const registry = makeRegistry([makeVersion(1)]);
    const file = versionFile('binairo', 1);
    // Non servi : validé (6 mois de la plage) mais aucune référence exigée.
    const free = run(registry, { store, types: ['binairo'] });
    expect(free.errors).toEqual([]);
    expect(free.types[0]).toMatchObject({ type: 'binairo', days: 181, dailyDays: 0 });
    expect(free.golden.find((g) => g.file === file)!.pending).toHaveLength(6);
    // Épinglé : absence = erreur ; --write-golden fige tous les mois calculés.
    const missing = run(registry, { store, types: ['binairo'], pinned: ['binairo:1'] });
    expect(missing.errors).toContain(`${file} : 6 référence(s) obligatoire(s) absente(s) (2026-01 → 2026-06), --write-golden pour les figer`);
    const written = run(registry, { store, types: ['binairo'], pinned: ['binairo:1'], writeGolden: true });
    expect(written.errors).toEqual([]);
    expect(Object.keys(store.files.get(file)!)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']);
    // Ensuite vérifiées à chaque validation, épinglage ou non ; une sortie modifiée est détectée.
    expect(run(registry, { store, types: ['binairo'] }).golden.find((g) => g.file === file)!.checked).toBe(6);
    const changed = run(makeRegistry([makeVersion(1, { label: 'autre' })]), { store, types: ['binairo'] });
    expect(changed.errors).toContain(`${file} 2026-01 : empreinte ≠ référence — puzzles publiés modifiés !`);
  });

  it('fichier de références illisible : erreur nommant le fichier', () => {
    const store = frozenStore();
    const broken = { ...store, read: (f: string) => (f === DAILY_FILE ? (() => { throw new Error('JSON invalide'); })() : store.read(f)) };
    const res = run(makeRegistry([makeVersion(1)]), { store: broken });
    expect(res.errors).toContain(`${DAILY_FILE} : illisible (JSON invalide)`);
  });

  it('mesure à froid au-delà de la limite : erreur', () => {
    const res = run(makeRegistry([makeVersion(1)]), { store: frozenStore(), coldRun: (_t, _v, date) => (isoWeekday(date) === 7 ? 650 : 40) });
    expect(res.types[0]!.coldMs).toHaveLength(7);
    expect(res.errors.some((e) => /ms à froid \(> 500 ms\)/.test(e))).toBe(true);
  });

  it('--write-golden avec erreurs : rien n’est écrit', () => {
    const store = memoryStore();
    const res = run(makeRegistry([makeVersion(1, { when: every7, badVerify: true })]), { store, writeGolden: true });
    expect(res.written).toBe(false);
    expect(store.files.size).toBe(0);
    expect(res.errors).toContain('références NON écrites : corriger d’abord les erreurs');
  });

  it('--write-golden ne remplace jamais une référence existante', () => {
    const store = frozenStore();
    const res = run(makeRegistry([makeVersion(1, { label: 'autre' })]), { store, writeGolden: true });
    expect(res.errors.some((e) => e.includes('empreinte ≠ référence'))).toBe(true);
    expect(res.written).toBe(false);
  });

  it('plage étendue aux références existantes (archives et années lointaines toujours revérifiées)', () => {
    const store = frozenStore();
    const res = run(makeRegistry([makeVersion(1)]), { store, from: '2026-05-01', to: '2026-06-01' });
    expect(res.from).toBe('2026-01-01');
    expect(res.to).toBe('2026-06-01');
    expect(res.golden.find((g) => g.file === versionFile('queens', 1))!.checked).toBe(3);
  });
});
