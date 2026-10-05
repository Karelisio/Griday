import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCHEDULE } from '../../config';
import { addDays, isoWeekday } from '../../core/date';
import { generateDailyForVersion, generateWithAttempts } from '../../core/pipeline';
import { rngFromString } from '../../core/prng';
import { validateRegistry } from '../../core/registry-check';
import { DIFFICULTY_TIERS, type DifficultyTier, type GenerationTarget } from '../../core/types';
import { REGISTRY } from '../../registry';
import { solveBinairoExact } from '../exact';
import { BINAIRO_DEFINITION, verifyBinairo } from '../index';
import { isBinairoSolution } from '../rules';
import { BINAIRO_MAX_SIZE, BINAIRO_MIN_SIZE, type BinairoSolvedPuzzle } from '../types';
import { BINAIRO_FALLBACKS_V1 } from './fallbacks';
import { rateBinairo } from './solver';
import { acceptsV1, BINAIRO_V1, rateBinairoV1 } from './version';

/** Garanties de tout puzzle servi, vérifiées avec l'oracle exact (indépendant du générateur). */
function expectValid(p: BinairoSolvedPuzzle): void {
  expect(verifyBinairo(p)).toEqual([]);
  const exact = solveBinairoExact(p, 2);
  expect(exact.complete).toBe(true);
  expect(exact.count).toBe(1);
  expect(exact.solutions[0]).toEqual([...p.solution]);
  expect(isBinairoSolution(p, p.solution)).toBe(true);
  expect(rateBinairo(p).solvable).toBe(true);
}

const ALL_TARGETS: GenerationTarget[] = [...BINAIRO_V1.weeklyPlan, ...BINAIRO_V1.sizes.flatMap((size) => DIFFICULTY_TIERS.map((tier) => ({ size, tier })))];

describe('Binairo V1 — configuration', () => {
  it('version 1, budget, tailles paires dans les limites', () => {
    expect(BINAIRO_V1.version).toBe(1);
    expect(Number.isInteger(BINAIRO_V1.maxAttempts) && BINAIRO_V1.maxAttempts >= 1).toBe(true);
    expect(BINAIRO_V1.sizes.length).toBeGreaterThan(0);
    for (const n of BINAIRO_V1.sizes) {
      expect(n % 2, `taille ${n}`).toBe(0);
      expect(n).toBeGreaterThanOrEqual(BINAIRO_MIN_SIZE);
      expect(n).toBeLessThanOrEqual(BINAIRO_MAX_SIZE);
    }
    expect([...BINAIRO_V1.sizes].sort((a, b) => a - b)).toEqual(BINAIRO_V1.sizes);
  });

  it('plan hebdomadaire : 7 jours, tailles paires 6 → 10 croissantes, lundi facile → dimanche expert', () => {
    const plan = BINAIRO_V1.weeklyPlan;
    expect(plan).toHaveLength(7);
    for (let i = 0; i < 7; i++) {
      expect(plan[i]!.size % 2).toBe(0);
      expect(plan[i]!.size).toBeGreaterThanOrEqual(6);
      expect(plan[i]!.size).toBeLessThanOrEqual(10);
      expect(BINAIRO_V1.sizes).toContain(plan[i]!.size);
      expect(DIFFICULTY_TIERS).toContain(plan[i]!.tier);
      if (i > 0) expect(plan[i]!.size).toBeGreaterThanOrEqual(plan[i - 1]!.size);
    }
    expect(plan[0]!.tier).toBe(1);
    expect(plan[6]!.tier).toBe(4);
    expect(plan[0]!.size).toBe(Math.min(...plan.map((t) => t.size)));
    expect(plan[6]!.size).toBe(Math.max(...plan.map((t) => t.size)));
    // À taille égale, le palier ne baisse jamais d'un jour au suivant.
    for (let i = 1; i < 7; i++) if (plan[i]!.size === plan[i - 1]!.size) expect(plan[i]!.tier).toBeGreaterThanOrEqual(plan[i - 1]!.tier);
  });

  it('configuration gelée (aucune mutation possible du plan ou de la version)', () => {
    expect(Object.isFrozen(BINAIRO_V1)).toBe(true);
    expect(Object.isFrozen(BINAIRO_V1.weeklyPlan)).toBe(true);
    expect(Object.isFrozen(BINAIRO_V1.weeklyPlan[0])).toBe(true);
    expect(Object.isFrozen(BINAIRO_V1.sizes)).toBe(true);
    const g = generateDailyForVersion(BINAIRO_DEFINITION, 1, '2026-10-05');
    expect(g.target).not.toBe(BINAIRO_V1.weeklyPlan[0]);
    expect(g.target).toEqual(BINAIRO_V1.weeklyPlan[isoWeekday('2026-10-05') - 1]);
  });

  it('registre et calendrier cohérents (secours pour toute cible, versions)', () => {
    expect(REGISTRY.binairo).toBe(BINAIRO_DEFINITION);
    expect(validateRegistry(REGISTRY, SCHEDULE)).toEqual([]);
  });
});

describe('Binairo V1 — notation et acceptation', () => {
  it('rate = notation V1 (null si non logique), accepts = palier exact (+ bande)', () => {
    const rng = rngFromString('v1-rate');
    let nulls = 0;
    for (let i = 0; i < 40; i++) {
      const n = [6, 8, 10][i % 3]!;
      const tier = DIFFICULTY_TIERS[i % 4]!;
      const res = BINAIRO_V1.attempt(rng, { size: n, tier });
      if (!res) continue;
      const r = rateBinairo(res.puzzle);
      expect(BINAIRO_V1.rate(res.puzzle)).toEqual({ tier: r.tier, score: r.score, hardest: r.hardest });
      expect(rateBinairoV1(res.puzzle)).toEqual(res.rating);
      // Retirer des données rend la grille non logique : rate → null.
      const givens = res.puzzle.givens.map(() => 0 as const);
      if (BINAIRO_V1.rate({ ...res.puzzle, givens }) === null) nulls++;
    }
    expect(nulls).toBeGreaterThan(0);
    const r = (tier: DifficultyTier, score: number) => ({ tier, score, hardest: 'x' });
    for (const target of ALL_TARGETS) {
      for (const tier of DIFFICULTY_TIERS) if (tier !== target.tier) expect(acceptsV1(target, r(tier, 50))).toBe(false);
    }
    // Hors plan et hors tailles : pas de bande.
    expect(acceptsV1({ size: 14, tier: 2 }, r(2, 9999))).toBe(true);
    expect(BINAIRO_V1.accepts).toBe(acceptsV1);
  });
});

describe('Binairo V1 — tentative', () => {
  it('ne renvoie que des grilles uniques, logiques et conformes à la cible', () => {
    for (const target of ALL_TARGETS) {
      let accepted = 0;
      for (let k = 0; k < 12; k++) {
        const res = BINAIRO_V1.attempt(rngFromString(`v1-attempt:${target.size}:${target.tier}#${k}`), target);
        if (!res) continue;
        accepted++;
        expect(res.puzzle.size).toBe(target.size);
        expect(res.rating).toEqual(rateBinairoV1(res.puzzle));
        expect(acceptsV1(target, res.rating)).toBe(true);
        expectValid(res.puzzle);
      }
      // Cibles du plan : au moins une réussite sur 12 graines fixes.
      if (BINAIRO_V1.weeklyPlan.includes(target)) expect(accepted, `${target.size}/${target.tier}`).toBeGreaterThan(0);
    }
  });
});

describe('Binairo V1 — puzzles de secours', () => {
  it('toute cible (plan + tailles × paliers) a un secours de même taille et même palier', () => {
    for (const t of ALL_TARGETS) {
      const n = BINAIRO_FALLBACKS_V1.filter((e) => e.size === t.size && e.tier === t.tier).length;
      expect(n, `${t.size}/${t.tier}`).toBeGreaterThanOrEqual(1);
    }
    for (const t of BINAIRO_V1.weeklyPlan) {
      expect(BINAIRO_FALLBACKS_V1.filter((e) => e.size === t.size && e.tier === t.tier).length, `${t.size}/${t.tier}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('chaque secours est reproductible depuis sa graine, valide, unique et conforme à sa cible', () => {
    for (const e of BINAIRO_FALLBACKS_V1) {
      const target = { size: e.size, tier: e.tier };
      const res = generateWithAttempts(BINAIRO_DEFINITION, 1, e.seed, target);
      expect(res.source, e.seed).toBe('generated');
      expect(res.attempt, e.seed).toBe(e.attempt);
      expect(res.puzzle.givens.join(''), e.seed).toBe(e.givens);
      expect(res.puzzle.solution.join(''), e.seed).toBe(e.solution);
      expect(res.rating).toEqual({ tier: e.tier, score: e.score, hardest: e.hardest });
      expect(acceptsV1(target, res.rating)).toBe(true);
      expectValid(res.puzzle);
    }
  });

  it('fallback() : choix déterministe par pick, données identiques au recalcul', () => {
    for (const target of ALL_TARGETS) {
      const a = BINAIRO_V1.fallback(target, 7);
      expect(BINAIRO_V1.fallback(target, 7)).toEqual(a);
      expect(a.puzzle.size).toBe(target.size);
      expect(a.rating).toEqual(rateBinairoV1(a.puzzle));
      expect(a.rating.tier).toBe(target.tier);
      expect(acceptsV1(target, a.rating)).toBe(true);
      expectValid(a.puzzle);
      // pick : modulo du nombre de secours, grand uint32 accepté.
      const list = BINAIRO_FALLBACKS_V1.filter((e) => e.size === target.size && e.tier === target.tier);
      expect(BINAIRO_V1.fallback(target, 0xffffffff)).toEqual(BINAIRO_V1.fallback(target, 0xffffffff % list.length));
    }
    for (const target of BINAIRO_V1.weeklyPlan) {
      const codes = new Set([0, 1, 2].map((pick) => BINAIRO_DEFINITION.encode(BINAIRO_V1.fallback(target, pick).puzzle)));
      expect(codes.size).toBe(3);
    }
  });
});

describe('Binairo V1 — puzzle du jour (indépendant du calendrier)', () => {
  it('douze semaines : plan respecté, générées (jamais de secours), uniques, déterministes', () => {
    const scores: number[][] = Array.from({ length: 7 }, () => []);
    for (let i = 0; i < 84; i++) {
      const date = addDays('2026-10-05', i);
      const g = generateDailyForVersion(BINAIRO_DEFINITION, 1, date);
      const target = BINAIRO_V1.weeklyPlan[isoWeekday(date) - 1]!;
      expect(g.type).toBe('binairo');
      expect(g.version).toBe(1);
      expect(g.seed).toBe(`${date}:binairo:v1`);
      expect(g.source, date).toBe('generated');
      expect(g.target).toEqual(target);
      expect(g.puzzle.size).toBe(target.size);
      expect(g.rating).toEqual(rateBinairoV1(g.puzzle));
      expect(acceptsV1(target, g.rating)).toBe(true);
      expectValid(g.puzzle);
      if (i < 14) expect(generateDailyForVersion(BINAIRO_DEFINITION, 1, date)).toEqual(g);
      scores[isoWeekday(date) - 1]!.push(g.rating.score);
    }
    // Difficulté mesurée (score moyen) : lundi le plus facile, dimanche le plus difficile.
    const mean = scores.map((s) => s.reduce((a, b) => a + b, 0) / s.length);
    expect(Math.min(...mean)).toBe(mean[0]);
    expect(Math.max(...mean)).toBe(mean[6]);
  });

  it('jours différents ⇒ grilles différentes', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 28; i++) codes.add(BINAIRO_DEFINITION.encode(generateDailyForVersion(BINAIRO_DEFINITION, 1, addDays('2027-03-01', i)).puzzle));
    expect(codes.size).toBe(28);
  });
});

describe('Binairo V1 — mode illimité', () => {
  it('toutes les tailles × paliers : générées, valides, déterministes', () => {
    for (const size of BINAIRO_V1.sizes) {
      for (const tier of DIFFICULTY_TIERS) {
        const seed = `unlimited:tok${size}${tier}:binairo:v1:${size}:${tier}`;
        const g = generateWithAttempts(BINAIRO_DEFINITION, 1, seed, { size, tier });
        expect(g.source, seed).toBe('generated');
        expect(g.puzzle.size).toBe(size);
        expect(g.rating.tier).toBe(tier);
        expectValid(g.puzzle);
        expect(generateWithAttempts(BINAIRO_DEFINITION, 1, seed, { size, tier })).toEqual(g);
      }
    }
  });
});

// ─── Garde-fous statiques sur les sources ────────────────────────────────────────────────────

describe('sources Binairo — déterminisme et autonomie de la V1', () => {
  const binairoDir = fileURLToPath(new URL('../', import.meta.url));
  const listSources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return listSources(p);
      return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : [];
    });
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/\/\/[^\n]*/g, '');

  it('pas de Math.random, d’horloge, de flottant transcendant ni de locale (binairo/**)', () => {
    const files = listSources(binairoDir);
    expect(files.some((f) => f.endsWith(join('v1', 'generator.ts')))).toBe(true);
    const RULES: [string, RegExp][] = [
      ['Math.random', /\bMath\.random\b/],
      ['horloge', /\bnew Date\b|\bDate\.now\b|\bperformance\.now\b|\bDate\(/],
      // Fonctions « implementation-approximated » (ECMA-262) ; Math.sqrt est correctement arrondie, donc tolérée.
      ['Math transcendant', /\bMath\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|cbrt|hypot)\b|\*\*/],
      ['locale / Intl', /\b(toLocaleString|localeCompare|toLocaleUpperCase|toLocaleLowerCase)\b|\bIntl\./],
      ['crypto / globalThis', /\bcrypto\b|\bglobalThis\b/],
    ];
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(binairoDir, file).split('\\').join('/');
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
      for (const [label, re] of RULES) {
        lines.forEach((line, i) => {
          if (re.test(line)) violations.push(`${rel}:${i + 1} [${label}] ${line.trim()}`);
        });
      }
    }
    expect(violations).toEqual([]);
  });

  it('v1/ : graphe d’exécution depuis version.ts limité à v1/ et core/prng (le reste en « import type »)', () => {
    // freeze-data.ts (données des tests de gel) n'est pas dans ce graphe : il peut importer le pipeline.
    const v1Dir = join(binairoDir, 'v1');
    const violations: string[] = [];
    const seen = new Set<string>();
    const visit = (name: string): void => {
      if (seen.has(name)) return;
      seen.add(name);
      const src = stripComments(readFileSync(join(v1Dir, name), 'utf8'));
      for (const m of src.matchAll(/^\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+'([^']+)'/gm)) {
        if (m[2] !== undefined) continue; // import type : effacé à la compilation
        const spec = m[4]!;
        if (spec === '../../core/prng') continue;
        if (spec.startsWith('./') && !spec.slice(2).includes('/')) visit(`${spec.slice(2)}.ts`);
        else violations.push(`v1/${name} : ${m[0].trim()}`);
      }
      if (/\bimport\(|\brequire\(/.test(src)) violations.push(`v1/${name} : import dynamique`);
    };
    visit('version.ts');
    expect([...seen].sort()).toEqual(['fallbacks.ts', 'generator.ts', 'solver.ts', 'util.ts', 'version.ts']);
    expect(violations).toEqual([]);
  });
});

describe('performance (bornes larges)', () => {
  it('puzzle du jour : < 300 ms en moyenne, < 2 s au pire (une semaine de chaque palier)', () => {
    let total = 0;
    let worst = 0;
    for (let i = 0; i < 14; i++) {
      const t0 = performance.now();
      generateDailyForVersion(BINAIRO_DEFINITION, 1, addDays('2031-01-06', i));
      const dt = performance.now() - t0;
      total += dt;
      worst = Math.max(worst, dt);
    }
    expect(total / 14).toBeLessThan(300);
    expect(worst).toBeLessThan(2000);
  });
});
