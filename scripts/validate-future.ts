/**
 * Validation long terme : génère et vérifie N années de puzzles du jour, pour CHAQUE type
 * (indépendamment de la rotation : un type doit rester valide même s'il n'est pas tiré ce jour-là).
 *
 * Pour chaque jour et chaque type, avec la version active à cette date :
 * - génération nominale (jamais de secours) en moins de --max-ms (une 2e mesure écarte une pause GC) ;
 * - vérification indépendante (structure, solution unique = solution fournie) ;
 * - difficulté conforme : note recalculée identique, critère d'acceptation de la version, cible du plan ;
 * - empreintes mensuelles comparées aux références scripts/golden/<type>-v<N>.json (puzzles figés).
 * Plus : cohérence registre/calendrier et vérification de tous les puzzles de secours.
 *
 * Usage : npx tsx scripts/validate-future.ts [--years=10] [--from=YYYY-MM-DD] [--max-ms=500]
 *         [--types=queens] [--report=rapport.json] [--write-golden]
 * --write-golden ajoute les mois manquants aux références (jamais de remplacement d'un mois existant).
 * Code de sortie 1 si une vérification échoue.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoWeekday, isValidISODate, localISODate, type ISODate } from '../engine/core/date';
import { fingerprintPuzzle, generateDailyForVersion } from '../engine/core/pipeline';
import { hashHex } from '../engine/core/prng';
import { isScheduleStale, typeForDate, versionForDate } from '../engine/core/schedule';
import { DIFFICULTY_TIERS, PUZZLE_TYPE_IDS, type DifficultyRating, type PuzzleTypeId } from '../engine/core/types';
import { REGISTRY, SCHEDULE, validateRegistry } from '../engine/index';
import {
  compareGolden,
  mergeGolden,
  monthKey,
  monthWindow,
  quantile,
  windowDays,
  type GoldenMonths,
} from './lib/future';

// ─── Arguments ──────────────────────────────────────────────────────────────────────────────────
const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
  if (!m) throw new Error(`Argument inconnu : ${a}`);
  args.set(m[1]!, m[2] ?? 'true');
}
const today = localISODate(new Date());
const years = Number(args.get('years') ?? 10);
const start = args.get('from') ?? today;
if (!isValidISODate(start)) throw new Error(`--from invalide : ${start}`);
const maxMs = Number(args.get('max-ms') ?? 500);
const types = (args.get('types') ?? PUZZLE_TYPE_IDS.join(',')).split(',') as PuzzleTypeId[];
const writeGolden = args.get('write-golden') === 'true';
const reportPath = args.get('report');
const window = monthWindow(start, years);
const goldenDir = fileURLToPath(new URL('./golden/', import.meta.url));

for (const t of types) {
  if (!PUZZLE_TYPE_IDS.includes(t)) throw new Error(`Type inconnu : ${t}`);
}

const errors: string[] = [];
const warnings: string[] = [];
/** Trop d'erreurs du même genre : on n'en garde qu'un échantillon par type. */
const MAX_ERRORS_PER_TYPE = 50;

console.log(`Validation ${window.from} → ${window.to} (exclu) : ${window.days} jours × ${types.join(', ')} ; limite ${maxMs} ms`);

// ─── Registre et calendrier ─────────────────────────────────────────────────────────────────────
for (const e of validateRegistry(REGISTRY, SCHEDULE)) errors.push(`registre : ${e}`);
if (isScheduleStale(SCHEDULE, today)) {
  warnings.push(`validThrough (${SCHEDULE.validThrough}) dépassé : le repousser dans engine/config.ts avant de publier`);
}

const sameRating = (a: DifficultyRating | null, b: DifficultyRating): boolean =>
  a !== null && a.tier === b.tier && a.score === b.score && a.hardest === b.hardest;

interface TypeReport {
  type: PuzzleTypeId;
  days: number;
  dailyDays: number;
  versions: number[];
  fallbacksChecked: number;
  errors: number;
  timeMs: { cold: number; mean: number; p50: number; p99: number; max: number; maxDate: string };
  attempts: { mean: number; max: number; maxDate: string };
  weekdays: { weekday: number; target: string; scoreP10: number; scoreMedian: number; scoreP90: number; scoreMax: number }[];
  golden: { file: string; checked: number; mismatches: string[]; missing: number; added: number }[];
}
const reports: TypeReport[] = [];

for (const type of types) {
  const def = REGISTRY[type];
  const typeErrors: string[] = [];
  const fail = (msg: string) => {
    if (typeErrors.length < MAX_ERRORS_PER_TYPE) typeErrors.push(`${type} ${msg}`);
    else if (typeErrors.length === MAX_ERRORS_PER_TYPE) typeErrors.push(`${type} : erreurs suivantes omises…`);
  };

  // Secours de chaque version utilisée dans la fenêtre.
  const versionsUsed = new Set<number>();
  for (const date of windowDays(window)) versionsUsed.add(versionForDate(SCHEDULE, type, date));
  let fallbacksChecked = 0;
  for (const version of [...versionsUsed].sort((a, b) => a - b)) {
    const gen = def.versions[version]!;
    for (const size of gen.sizes) {
      for (const tier of DIFFICULTY_TIERS) {
        const target = { size, tier };
        const seen = new Set<string>();
        for (let pick = 0; pick < 16; pick++) {
          const fb = gen.fallback(target, pick);
          const code = def.encode(fb.puzzle);
          if (seen.has(code)) continue;
          seen.add(code);
          fallbacksChecked++;
          for (const e of def.verify(fb.puzzle)) fail(`v${version} secours ${size}/${tier} : ${e}`);
          if (!sameRating(gen.rate(fb.puzzle), fb.rating)) fail(`v${version} secours ${size}/${tier} : note incohérente`);
          if (!gen.accepts(target, fb.rating)) fail(`v${version} secours ${size}/${tier} : hors critères de la cible`);
        }
      }
    }
  }

  // Jours de la fenêtre.
  const times: number[] = [];
  const attempts: number[] = [];
  let cold = Number.NaN;
  let maxTime = { ms: -1, date: '' };
  let maxAttempt = { k: -1, date: '' };
  let dailyDays = 0;
  const scores = new Map<number, number[]>();
  /** Empreintes par version puis par mois ; mois partagés entre deux versions exclus des références. */
  const fingerprints = new Map<number, Map<string, string[]>>();
  const partialMonths = new Set<string>();

  for (const date of windowDays(window)) {
    const version = versionForDate(SCHEDULE, type, date);
    const gen = def.versions[version]!;
    let t0 = performance.now();
    const g = generateDailyForVersion(def, version, date);
    let ms = performance.now() - t0;
    if (Number.isNaN(cold)) cold = ms;
    if (ms > maxMs) {
      // Seconde mesure : écarte une pause du ramasse-miettes ou du JIT, pas une lenteur réelle.
      t0 = performance.now();
      generateDailyForVersion(def, version, date);
      ms = Math.min(ms, performance.now() - t0);
      if (ms > maxMs) fail(`${date} : génération en ${ms.toFixed(0)} ms (> ${maxMs} ms)`);
    }
    times.push(ms);
    if (ms > maxTime.ms) maxTime = { ms, date };
    attempts.push(g.attempt);
    if (g.attempt > maxAttempt.k) maxAttempt = { k: g.attempt, date };
    if (typeForDate(SCHEDULE, date) === type) dailyDays++;

    const weekday = isoWeekday(date);
    const planned = gen.weeklyPlan[weekday - 1]!;
    if (g.source !== 'generated') fail(`${date} : source ${g.source} (budget de ${gen.maxAttempts} tentatives épuisé)`);
    if (g.target.size !== planned.size || g.target.tier !== planned.tier) fail(`${date} : cible ≠ plan hebdomadaire`);
    for (const e of def.verify(g.puzzle)) fail(`${date} : ${e}`);
    if (!sameRating(gen.rate(g.puzzle), g.rating)) fail(`${date} : note recalculée différente (ou non résoluble par logique)`);
    if (!gen.accepts(g.target, g.rating)) fail(`${date} : difficulté non conforme à la cible ${planned.size}/${planned.tier}`);

    let list = scores.get(weekday);
    if (!list) scores.set(weekday, (list = []));
    list.push(g.rating.score);

    const month = monthKey(date);
    for (const [v, months] of fingerprints) if (v !== version && months.has(month)) partialMonths.add(month);
    let byMonth = fingerprints.get(version);
    if (!byMonth) fingerprints.set(version, (byMonth = new Map()));
    let fps = byMonth.get(month);
    if (!fps) byMonth.set(month, (fps = []));
    fps.push(fingerprintPuzzle(def, g));
  }

  // Références mensuelles (une par version).
  const golden: TypeReport['golden'] = [];
  for (const [version, byMonth] of fingerprints) {
    const computed: Record<string, string> = {};
    for (const [month, fps] of byMonth) if (!partialMonths.has(month)) computed[month] = hashHex(fps.join(','));
    const file = `${type}-v${version}.json`;
    const path = goldenDir + file;
    const existing: GoldenMonths = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as GoldenMonths) : {};
    const cmp = compareGolden(existing, computed);
    for (const month of cmp.mismatches) fail(`v${version} ${month} : empreinte ≠ référence (${file}) — puzzles publiés modifiés !`);
    let added = 0;
    if (writeGolden) {
      const merged = mergeGolden(existing, computed);
      for (const month of merged.conflicts) fail(`v${version} ${month} : refus de remplacer une référence existante`);
      if (merged.added.length > 0) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify(merged.merged, null, 2)}\n`);
      }
      added = merged.added.length;
    } else if (cmp.missing.length > 0) {
      warnings.push(`${type} v${version} : ${cmp.missing.length} mois sans référence (${cmp.missing[0]} → ${cmp.missing.at(-1)}) ; --write-golden pour les figer`);
    }
    golden.push({ file, checked: cmp.checked, mismatches: [...cmp.mismatches], missing: cmp.missing.length, added });
  }

  const sortedTimes = [...times].sort((a, b) => a - b);
  const weekdays: TypeReport['weekdays'] = [];
  for (let wd = 1; wd <= 7; wd++) {
    const s = [...(scores.get(wd) ?? [])].sort((a, b) => a - b);
    const plan = def.versions[versionForDate(SCHEDULE, type, window.from)]!.weeklyPlan[wd - 1]!;
    weekdays.push({
      weekday: wd,
      target: `${plan.size}/${plan.tier}`,
      scoreP10: quantile(s, 0.1),
      scoreMedian: quantile(s, 0.5),
      scoreP90: quantile(s, 0.9),
      scoreMax: s.at(-1) ?? Number.NaN,
    });
  }
  const mean = (a: readonly number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  reports.push({
    type,
    days: window.days,
    dailyDays,
    versions: [...versionsUsed].sort((a, b) => a - b),
    fallbacksChecked,
    errors: typeErrors.length,
    timeMs: {
      cold: round(cold),
      mean: round(mean(times)),
      p50: round(quantile(sortedTimes, 0.5)),
      p99: round(quantile(sortedTimes, 0.99)),
      max: round(maxTime.ms),
      maxDate: maxTime.date,
    },
    attempts: { mean: round(mean(attempts) + 1), max: maxAttempt.k + 1, maxDate: maxAttempt.date },
    weekdays,
    golden,
  });
  errors.push(...typeErrors);
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

// ─── Rapport ────────────────────────────────────────────────────────────────────────────────────
const DAY = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
for (const r of reports) {
  console.log(`\n■ ${r.type} — versions ${r.versions.join(', ')} — ${r.days} jours (dont ${r.dailyDays} en puzzle du jour)`);
  console.log(`  temps (ms) : froid ${r.timeMs.cold} · moyenne ${r.timeMs.mean} · médiane ${r.timeMs.p50} · p99 ${r.timeMs.p99} · max ${r.timeMs.max} (${r.timeMs.maxDate})`);
  console.log(`  tentatives : moyenne ${r.attempts.mean} · max ${r.attempts.max} (${r.attempts.maxDate})`);
  console.log(`  secours vérifiés : ${r.fallbacksChecked}`);
  console.log('  score par jour (p10 / médiane / p90 / max) :');
  for (const w of r.weekdays) {
    console.log(`    ${DAY[w.weekday]} ${w.target.padEnd(5)} ${w.scoreP10} / ${w.scoreMedian} / ${w.scoreP90} / ${w.scoreMax}`);
  }
  for (const g of r.golden) {
    const added = g.added > 0 ? ` · ${g.added} ajoutés` : '';
    console.log(`  références ${g.file} : ${g.checked} mois vérifiés · ${g.mismatches.length} divergents · ${g.missing} absents${added}`);
  }
}
for (const w of warnings) console.log(`\n⚠ ${w}`);
if (errors.length > 0) {
  console.log(`\n✗ ${errors.length} erreur(s) :`);
  for (const e of errors) console.log(`  - ${e}`);
} else {
  console.log('\n✓ Validation réussie');
}

if (reportPath) {
  const report = { from: window.from, to: window.to, maxMs, generatedOn: today, ok: errors.length === 0, errors, warnings, types: reports };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
process.exitCode = errors.length > 0 ? 1 : 0;

export type { ISODate };
