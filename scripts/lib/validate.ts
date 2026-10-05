/**
 * Cœur de la validation long terme (sans E/S : références et mesures à froid injectées, testable).
 *
 * Pour chaque type et chaque jour de la plage, avec la version active à cette date :
 * - génération nominale (jamais de secours) ; temps de la 1re mesure ≤ maxMs (une 2e mesure
 *   n'excuse qu'une pause isolée : signalée, plafonnée, et jamais au-delà de 2 × maxMs) ;
 * - vérification indépendante (structure, solution unique = solution fournie), taille et palier
 *   égaux à la cible, note recalculée identique, critère d'acceptation de la version ;
 * - courbe hebdomadaire : médiane des scores non décroissante du lundi au dimanche ;
 * - références figées (ajout seul) : par version (sortie de la version, mois entiers, indépendante
 *   du calendrier) et puzzle du jour effectivement servi (type + version, jusqu'à validThrough).
 * Plus : registre/calendrier cohérents, tous les puzzles de secours vérifiés, temps à froid.
 */
import { addDays, diffDays, isoToDays, isoWeekday, type ISODate } from '../../engine/core/date';
import { fingerprintPuzzle, generateDailyForVersion, type Registry } from '../../engine/core/pipeline';
import { hashHex } from '../../engine/core/prng';
import { validateRegistry } from '../../engine/core/registry-check';
import { typeForDate, versionForDate, type Schedule } from '../../engine/core/schedule';
import {
  DIFFICULTY_TIERS,
  type DifficultyRating,
  type GeneratedPuzzle,
  type GenerationTarget,
  type PuzzleTypeDefinition,
  type PuzzleTypeId,
} from '../../engine/core/types';
import { keyDays, mergeGolden, monthKey, monthStart, nextMonthStart, quantile, rangeKey } from './future';

export type GoldenData = Readonly<Record<string, string>>;

/** Accès aux fichiers de références (scripts/golden/). */
export interface GoldenStore {
  read(file: string): GoldenData | undefined;
  write(file: string, data: GoldenData): void;
}

export interface ValidationOptions {
  /** Fenêtre demandée [from, to[ (étendue automatiquement aux références existantes et à l'epoch). */
  readonly from: ISODate;
  readonly to: ISODate;
  readonly maxMs: number;
  readonly types: readonly PuzzleTypeId[];
  readonly writeGolden: boolean;
  readonly store: GoldenStore;
  /** Horloge (ms) ; par défaut performance.now. */
  readonly now?: () => number;
  /** Mesure à froid dans un processus neuf (ms) ; absente = non mesurée. */
  readonly coldRun?: (type: PuzzleTypeId, version: number, date: ISODate) => number;
  /** Secondes mesures tolérées par type (pauses isolées). */
  readonly maxRetries?: number;
}

export interface TypeStats {
  readonly type: PuzzleTypeId;
  readonly days: number;
  readonly dailyDays: number;
  readonly versions: readonly number[];
  readonly fallbacksChecked: number;
  readonly timeMs: { mean: number; p50: number; p99: number; max: number; maxDate: ISODate };
  readonly retries: readonly ISODate[];
  readonly coldMs: readonly { weekday: number; date: ISODate; ms: number }[];
  readonly attempts: { mean: number; max: number; maxDate: ISODate; fallbacks: number };
  readonly weekdays: readonly { version: number; weekday: number; target: string; p10: number; median: number; p90: number; max: number }[];
}

export interface GoldenResult {
  readonly file: string;
  readonly checked: number;
  readonly mismatches: readonly string[];
  readonly missing: readonly string[];
  readonly pending: readonly string[];
  readonly added: readonly string[];
}

export interface ValidationReport {
  readonly from: ISODate;
  readonly to: ISODate;
  readonly days: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly types: readonly TypeStats[];
  readonly golden: readonly GoldenResult[];
  readonly written: boolean;
}

export const DAILY_FILE = 'daily.json';
export const versionFile = (type: PuzzleTypeId, version: number) => `${type}-v${version}.json`;

const FALLBACK_PICKS = 256;
const MIN_CURVE_SAMPLES = 20;

const sameRating = (a: DifficultyRating | null, b: DifficultyRating): boolean =>
  a !== null && a.tier === b.tier && a.score === b.score && a.hardest === b.hardest;

const round = (x: number) => Math.round(x * 100) / 100;
const mean = (a: readonly number[]) => (a.length === 0 ? Number.NaN : a.reduce((x, y) => x + y, 0) / a.length);
const minDate = (a: ISODate, b: ISODate) => (isoToDays(a) <= isoToDays(b) ? a : b);
const maxDate = (a: ISODate, b: ISODate) => (isoToDays(a) >= isoToDays(b) ? a : b);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Plage [start, end[ jour par jour. */
function daysBetween(start: ISODate, end: ISODate): ISODate[] {
  return Array.from({ length: Math.max(0, diffDays(start, end)) }, (_, i) => addDays(start, i));
}

/** Clés attendues pour le puzzle du jour : mois entiers ≤ validThrough, puis le mois partiel éventuel. */
export function dailyKeys(epoch: ISODate, validThrough: ISODate): string[] {
  const keys: string[] = [];
  let m = monthStart(epoch);
  while (isoToDays(m) <= isoToDays(validThrough)) {
    const next = nextMonthStart(m);
    const last = addDays(next, -1);
    keys.push(isoToDays(last) <= isoToDays(validThrough) ? monthKey(m) : rangeKey(m, validThrough));
    m = next;
  }
  return keys;
}

export function runValidation(registry: Registry, schedule: Schedule, opts: ValidationOptions): ValidationReport {
  const now = opts.now ?? (() => performance.now());
  const maxRetries = opts.maxRetries ?? 3;
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (msg: string) => errors.push(msg);

  for (const e of validateRegistry(registry, schedule)) fail(`registre : ${e}`);

  // ── Plage effective : fenêtre demandée ∪ epoch ∪ toutes les références existantes ──
  const stored = new Map<string, GoldenData>();
  const files: string[] = [DAILY_FILE];
  for (const type of opts.types) {
    for (const v of Object.keys(registry[type].versions).map(Number)) files.push(versionFile(type, v));
  }
  let start = minDate(monthStart(opts.from), monthStart(schedule.epoch));
  let end = opts.to;
  for (const file of files) {
    const data = opts.store.read(file);
    if (!data) continue;
    stored.set(file, data);
    for (const key of Object.keys(data)) {
      try {
        const days = keyDays(key);
        start = minDate(start, days[0]!);
        end = maxDate(end, addDays(days.at(-1)!, 1));
      } catch (e) {
        fail(`${file} : ${message(e)}`);
      }
    }
  }
  const range = daysBetween(start, end);
  const validThrough = schedule.validThrough;

  const typeStats: TypeStats[] = [];
  const goldenResults: GoldenResult[] = [];
  const toWrite = new Map<string, GoldenData>();
  /** Empreinte du puzzle du jour servi, par date (tous types confondus). */
  const dailyFp = new Map<ISODate, string>();

  for (const type of opts.types) {
    const def = registry[type] as PuzzleTypeDefinition<unknown>;
    const tag = (msg: string) => `${type} ${msg}`;

    // ── Secours de chaque version utilisée ──
    const versionsUsed = [...new Set(range.map((d) => versionForDate(schedule, type, d)))].sort((a, b) => a - b);
    let fallbacksChecked = 0;
    for (const version of versionsUsed) {
      const gen = def.versions[version]!;
      for (const size of gen.sizes) {
        for (const tier of DIFFICULTY_TIERS) {
          const target: GenerationTarget = { size, tier };
          const seen = new Set<string>();
          for (let pick = 0; pick < FALLBACK_PICKS; pick++) {
            const where = `v${version} secours ${size}/${tier} (pick ${pick})`;
            try {
              const fb = gen.fallback(target, pick);
              const code = def.encode(fb.puzzle);
              if (seen.has(code)) continue;
              seen.add(code);
              fallbacksChecked++;
              for (const e of def.verify(fb.puzzle)) fail(tag(`${where} : ${e}`));
              if (def.sizeOf(fb.puzzle) !== size) fail(tag(`${where} : taille ${def.sizeOf(fb.puzzle)}`));
              if (fb.rating.tier !== tier) fail(tag(`${where} : palier ${fb.rating.tier}`));
              if (!sameRating(gen.rate(fb.puzzle), fb.rating)) fail(tag(`${where} : note incohérente`));
              if (!gen.accepts(target, fb.rating)) fail(tag(`${where} : hors critères de la cible`));
            } catch (e) {
              fail(tag(`${where} : exception ${message(e)}`));
              break;
            }
          }
        }
      }
    }

    // ── Chaque jour, version active ──
    const times: number[] = [];
    const attempts: number[] = [];
    const retries: ISODate[] = [];
    let fallbacks = 0;
    let slowest = { ms: -1, date: '' };
    let mostAttempts = { k: -1, date: '' };
    let dailyDays = 0;
    const slowestByWeekday = new Map<number, { ms: number; date: ISODate; version: number }>();
    const scores = new Map<string, number[]>(); // `${version}:${weekday}`
    const fpByVersion = new Map<number, Map<ISODate, string>>();

    for (const date of range) {
      const version = versionForDate(schedule, type, date);
      const gen = def.versions[version]!;
      let g: GeneratedPuzzle<unknown>;
      let first: number;
      try {
        const t0 = now();
        g = generateDailyForVersion(def, version, date);
        first = now() - t0;
        if (first > opts.maxMs) {
          const t1 = now();
          generateDailyForVersion(def, version, date);
          const second = now() - t1;
          retries.push(date);
          warnings.push(tag(`${date} : 1re mesure ${first.toFixed(0)} ms > ${opts.maxMs} ms (2e : ${second.toFixed(0)} ms)`));
          if (Math.min(first, second) > opts.maxMs) fail(tag(`${date} : génération en ${Math.min(first, second).toFixed(0)} ms (> ${opts.maxMs} ms)`));
          else if (first > 2 * opts.maxMs) fail(tag(`${date} : 1re mesure ${first.toFixed(0)} ms (> 2 × ${opts.maxMs} ms)`));
        }
      } catch (e) {
        fail(tag(`${date} : exception à la génération : ${message(e)}`));
        continue;
      }
      times.push(first);
      if (first > slowest.ms) slowest = { ms: first, date };
      const weekday = isoWeekday(date);
      const prevSlow = slowestByWeekday.get(weekday);
      if (!prevSlow || first > prevSlow.ms) slowestByWeekday.set(weekday, { ms: first, date, version });
      const usedAttempts = g.source === 'generated' ? g.attempt + 1 : gen.maxAttempts;
      attempts.push(usedAttempts);
      if (usedAttempts > mostAttempts.k) mostAttempts = { k: usedAttempts, date };

      try {
        const planned = gen.weeklyPlan[weekday - 1]!;
        if (g.source !== 'generated') {
          fallbacks++;
          fail(tag(`${date} : source « ${g.source} » (budget de ${gen.maxAttempts} tentatives épuisé)`));
        }
        if (g.target.size !== planned.size || g.target.tier !== planned.tier) fail(tag(`${date} : cible ≠ plan hebdomadaire`));
        if (def.sizeOf(g.puzzle) !== planned.size) fail(tag(`${date} : grille ${def.sizeOf(g.puzzle)} ≠ taille ${planned.size} du plan`));
        if (g.rating.tier !== planned.tier) fail(tag(`${date} : palier ${g.rating.tier} ≠ ${planned.tier} du plan`));
        for (const e of def.verify(g.puzzle)) fail(tag(`${date} : ${e}`));
        if (!sameRating(gen.rate(g.puzzle), g.rating)) fail(tag(`${date} : note recalculée différente (ou non résoluble par logique)`));
        if (!gen.accepts(g.target, g.rating)) fail(tag(`${date} : difficulté hors critères de la cible ${planned.size}/${planned.tier}`));

        const fp = fingerprintPuzzle(def, g);
        let byDate = fpByVersion.get(version);
        if (!byDate) fpByVersion.set(version, (byDate = new Map()));
        byDate.set(date, fp);
        if (typeForDate(schedule, date) === type) {
          dailyDays++;
          dailyFp.set(date, fp);
        }
        const key = `${version}:${weekday}`;
        let list = scores.get(key);
        if (!list) scores.set(key, (list = []));
        list.push(g.rating.score);
      } catch (e) {
        fail(tag(`${date} : exception à la vérification : ${message(e)}`));
      }
    }
    if (retries.length > maxRetries) fail(tag(`${retries.length} jours ont nécessité une 2e mesure (> ${maxRetries}) : lenteur réelle probable`));

    // ── Temps à froid (processus neuf), jour le plus lent de chaque jour de semaine ──
    const coldMs: { weekday: number; date: ISODate; ms: number }[] = [];
    if (opts.coldRun) {
      for (const [weekday, s] of [...slowestByWeekday].sort((a, b) => a[0] - b[0])) {
        try {
          const ms = opts.coldRun(type, s.version, s.date);
          coldMs.push({ weekday, date: s.date, ms: round(ms) });
          if (ms > opts.maxMs) fail(tag(`${s.date} : ${ms.toFixed(0)} ms à froid (> ${opts.maxMs} ms)`));
        } catch (e) {
          fail(tag(`${s.date} : mesure à froid impossible : ${message(e)}`));
        }
      }
    }

    // ── Courbe hebdomadaire : médianes non décroissantes du lundi au dimanche (par version) ──
    const weekdays: TypeStats['weekdays'][number][] = [];
    for (const version of versionsUsed) {
      const plan = def.versions[version]!.weeklyPlan;
      let prev = Number.NEGATIVE_INFINITY;
      let enough = true;
      for (let wd = 1; wd <= 7; wd++) {
        const s = [...(scores.get(`${version}:${wd}`) ?? [])].sort((a, b) => a - b);
        if (s.length < MIN_CURVE_SAMPLES) enough = false;
        const median = quantile(s, 0.5);
        weekdays.push({
          version,
          weekday: wd,
          target: `${plan[wd - 1]!.size}/${plan[wd - 1]!.tier}`,
          p10: quantile(s, 0.1),
          median,
          p90: quantile(s, 0.9),
          max: s.at(-1) ?? Number.NaN,
        });
        if (enough && median < prev) fail(tag(`v${version} : courbe hebdomadaire non croissante (jour ${wd} : médiane ${median} < ${prev})`));
        prev = Math.max(prev, median);
      }
      if (!enough) warnings.push(tag(`v${version} : moins de ${MIN_CURVE_SAMPLES} jours par jour de semaine, courbe non vérifiée`));
    }

    // ── Références par version (sortie de la version, indépendante du calendrier) ──
    for (const version of Object.keys(def.versions).map(Number)) {
      const file = versionFile(type, version);
      const existing = stored.get(file) ?? {};
      const active = fpByVersion.get(version) ?? new Map<ISODate, string>();
      const months = new Set<string>(Object.keys(existing));
      for (const date of active.keys()) months.add(monthKey(date));
      const computed: Record<string, string> = {};
      const fpFor = (date: ISODate): string => {
        const cached = active.get(date);
        if (cached !== undefined) return cached;
        return fingerprintPuzzle(def, generateDailyForVersion(def, version, date));
      };
      for (const key of [...months].sort()) {
        try {
          computed[key] = hashHex(keyDays(key).map(fpFor).join(','));
        } catch (e) {
          fail(tag(`${file} ${key} : exception ${message(e)}`));
        }
      }
      // Mois obligatoires : version servie au moins un jour jusqu'à validThrough.
      const required = new Set([...active.keys()].filter((d) => isoToDays(d) <= isoToDays(validThrough)).map(monthKey));
      goldenResults.push(compareAndMerge(file, existing, computed, required, opts.writeGolden, errors, warnings, toWrite));
    }

    const sorted = [...times].sort((a, b) => a - b);
    typeStats.push({
      type,
      days: range.length,
      dailyDays,
      versions: versionsUsed,
      fallbacksChecked,
      timeMs: { mean: round(mean(times)), p50: round(quantile(sorted, 0.5)), p99: round(quantile(sorted, 0.99)), max: round(slowest.ms), maxDate: slowest.date },
      retries,
      coldMs,
      attempts: { mean: round(mean(attempts)), max: mostAttempts.k, maxDate: mostAttempts.date, fallbacks },
      weekdays,
    });
  }

  // ── Puzzle du jour servi (type + version) : epoch → validThrough ──
  const rotationTypes = new Set(schedule.rotations.flatMap((r) => r.types));
  const allTypes = [...rotationTypes].every((t) => opts.types.includes(t));
  if (!allTypes) {
    warnings.push(`références ${DAILY_FILE} non vérifiées : tous les types de la rotation doivent être validés`);
  } else {
    const existing = stored.get(DAILY_FILE) ?? {};
    const keys = new Set([...Object.keys(existing), ...dailyKeys(schedule.epoch, validThrough)]);
    const computed: Record<string, string> = {};
    for (const key of [...keys].sort()) {
      const fps = keyDays(key).map((d) => dailyFp.get(d));
      if (fps.some((f) => f === undefined)) {
        fail(`${DAILY_FILE} ${key} : jours non générés (voir erreurs ci-dessus)`);
        continue;
      }
      computed[key] = hashHex(fps.join(','));
    }
    const required = new Set(dailyKeys(schedule.epoch, validThrough));
    goldenResults.push(compareAndMerge(DAILY_FILE, existing, computed, required, opts.writeGolden, errors, warnings, toWrite));
  }

  // ── Écriture des références : uniquement si tout est valide ──
  let written = false;
  if (opts.writeGolden && toWrite.size > 0) {
    if (errors.length > 0) fail('références NON écrites : corriger d’abord les erreurs');
    else {
      for (const [file, data] of toWrite) opts.store.write(file, data);
      written = true;
    }
  }

  return { from: start, to: end, days: range.length, errors, warnings, types: typeStats, golden: goldenResults, written };
}

/** Compare (divergence = erreur ; obligatoire absent = erreur sauf écriture ; facultatif absent = avertissement). */
function compareAndMerge(
  file: string,
  existing: GoldenData,
  computed: Readonly<Record<string, string>>,
  required: ReadonlySet<string>,
  writeGolden: boolean,
  errors: string[],
  warnings: string[],
  toWrite: Map<string, GoldenData>,
): GoldenResult {
  const mismatches: string[] = [];
  const missing: string[] = [];
  const pending: string[] = [];
  let checked = 0;
  for (const [key, digest] of Object.entries(computed)) {
    const ref = existing[key];
    if (ref === undefined) (required.has(key) ? missing : pending).push(key);
    else {
      checked++;
      if (ref !== digest) mismatches.push(key);
    }
  }
  for (const key of mismatches) errors.push(`${file} ${key} : empreinte ≠ référence — puzzles publiés modifiés !`);
  let added: string[] = [];
  if (writeGolden) {
    const merged = mergeGolden(existing, computed);
    for (const key of merged.conflicts) if (!mismatches.includes(key)) errors.push(`${file} ${key} : refus de remplacer une référence`);
    if (merged.added.length > 0) toWrite.set(file, merged.merged);
    added = merged.added;
  } else {
    if (missing.length > 0) {
      errors.push(`${file} : ${missing.length} référence(s) obligatoire(s) absente(s) (${missing[0]} → ${missing.at(-1)}), --write-golden pour les figer`);
    }
    if (pending.length > 0) {
      warnings.push(`${file} : ${pending.length} mois au-delà de validThrough sans référence (${pending[0]} → ${pending.at(-1)})`);
    }
  }
  return { file, checked, mismatches, missing, pending, added };
}
