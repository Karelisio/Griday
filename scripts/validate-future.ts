/**
 * Validation long terme des puzzles du jour (voir scripts/lib/validate.ts pour le détail des contrôles).
 *
 * Usage : npx tsx scripts/validate-future.ts [--years=10] [--from=YYYY-MM-DD] [--max-ms=500]
 *         [--types=queens,binairo] [--report=rapport.json] [--write-golden] [--pin=binairo:1] [--no-cold]
 * La plage validée couvre [mois courant, aujourd'hui + N ans] (UTC), étendue à l'epoch et à toutes les
 * références figées de scripts/golden/. Chaque type demandé est validé chaque jour (version active à la date),
 * qu'il soit dans la rotation ou non. --write-golden ajoute les références manquantes (jamais de
 * remplacement), et seulement si aucune erreur. --pin=type:version rend obligatoires toutes les références
 * de cette version sur la plage (type pas encore servi dont la sortie est figée d'avance), ex. :
 *   npx tsx scripts/validate-future.ts --types=binairo --years=30 --pin=binairo:1 --write-golden
 * Code de sortie : 0 = OK, 1 = échec, 2 = arguments invalides.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatISODate, isValidISODate, type ISODate } from '../engine/core/date';
import { isScheduleStale } from '../engine/core/schedule';
import { PUZZLE_TYPE_IDS, type PuzzleTypeId } from '../engine/core/types';
import { REGISTRY, SCHEDULE } from '../engine/index';
import { monthWindow } from './lib/future';
import { runValidation, type GoldenData, type ValidationReport } from './lib/validate';

const usage = (msg: string): never => {
  console.error(`Argument invalide : ${msg}`);
  process.exit(2);
};

// ─── Arguments (stricts) ────────────────────────────────────────────────────────────────────────
const KNOWN = new Set(['years', 'from', 'max-ms', 'types', 'report', 'write-golden', 'pin', 'no-cold']);
const FLAGS = new Set(['write-golden', 'no-cold']);
const args = new Map<string, string | true>();
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
  if (!m || !KNOWN.has(m[1]!)) usage(a);
  const [, name, value] = m!;
  if (FLAGS.has(name!)) {
    if (value !== undefined) usage(`--${name} ne prend pas de valeur`);
    args.set(name!, true);
  } else {
    if (value === undefined || value === '') usage(`--${name} attend une valeur`);
    args.set(name!, value!);
  }
}
const str = (name: string): string | undefined => {
  const v = args.get(name);
  return typeof v === 'string' ? v : undefined;
};
const now = new Date();
const today: ISODate = formatISODate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
const years = Number(str('years') ?? 10);
if (!Number.isInteger(years) || years < 1 || years > 100) usage(`--years=${str('years')}`);
const maxMs = Number(str('max-ms') ?? 500);
if (!Number.isFinite(maxMs) || maxMs <= 0) usage(`--max-ms=${str('max-ms')}`);
const from = str('from') ?? today;
if (!isValidISODate(from)) usage(`--from=${from}`);
const types = (str('types') ?? PUZZLE_TYPE_IDS.join(',')).split(',') as PuzzleTypeId[];
for (const t of types) if (!PUZZLE_TYPE_IDS.includes(t)) usage(`type inconnu « ${t} »`);
const pinned = (str('pin') ?? '').split(',').filter(Boolean);
for (const p of pinned) {
  const m = /^([a-z][a-z0-9]*):([1-9][0-9]*)$/.exec(p);
  const t = m?.[1] as PuzzleTypeId | undefined;
  if (!m || !t || !types.includes(t)) usage(`--pin=${p} (type:version d'un type validé)`);
  else if (!Object.keys(REGISTRY[t].versions).includes(m[2]!)) usage(`--pin=${p} : version inconnue du registre`);
}
const reportPath = str('report');
const window = monthWindow(from, years);

// ─── Références (scripts/golden/) et mesure à froid ─────────────────────────────────────────────
const root = fileURLToPath(new URL('../', import.meta.url));
const goldenDir = fileURLToPath(new URL('./golden/', import.meta.url));
const store = {
  read(file: string): GoldenData | undefined {
    const path = goldenDir + file;
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as GoldenData;
    } catch (e) {
      throw new Error(`scripts/golden/${file} : JSON invalide (${(e as Error).message})`);
    }
  },
  write(file: string, data: GoldenData): void {
    mkdirSync(goldenDir, { recursive: true });
    writeFileSync(goldenDir + file, `${JSON.stringify(data, null, 2)}\n`);
  },
};
const coldScript = fileURLToPath(new URL('./lib/cold-run.ts', import.meta.url));
/** Processus neuf : chargement des modules + 1re génération. Minimum de 2 processus (écarte un voisin bruyant). */
const coldRun = (type: PuzzleTypeId, version: number, date: ISODate): number => {
  const once = (): number => {
    const res = spawnSync(process.execPath, ['--import', 'tsx', coldScript, type, String(version), date], { cwd: root, encoding: 'utf8' });
    if (res.status !== 0) {
      const lines = res.stderr.split('\n').map((l) => l.trim()).filter(Boolean);
      throw new Error(lines.find((l) => /Error/.test(l)) ?? lines.at(-1) ?? `code ${res.status}`);
    }
    const { total } = JSON.parse(res.stdout) as { total: number };
    return total;
  };
  return Math.min(once(), once());
};

console.log(
  `Validation ${window.from} → ${window.to} (exclu, ${years} ans) × ${types.join(', ')} ; limite ${maxMs} ms` +
    (pinned.length > 0 ? ` ; épinglées : ${pinned.join(', ')}` : ''),
);

let report: ValidationReport | undefined;
let crash: string | undefined;
try {
  report = runValidation(REGISTRY, SCHEDULE, {
    from: window.from,
    to: window.to,
    maxMs,
    types,
    writeGolden: args.has('write-golden'),
    pinned,
    store,
    coldRun: args.has('no-cold') ? undefined : coldRun,
    onProgress: (m) => console.log(`  … ${m}`),
  });
  print(report);
} catch (e) {
  crash = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error(`\n✗ Arrêt inattendu : ${crash}`);
} finally {
  const warnings = [...(report?.warnings ?? [])];
  if (isScheduleStale(SCHEDULE, today)) warnings.push(`validThrough (${SCHEDULE.validThrough}) dépassé : le repousser dans engine/config.ts avant de publier`);
  if (reportPath) {
    const ok = !crash && report !== undefined && report.errors.length === 0;
    writeFileSync(reportPath, `${JSON.stringify({ today, maxMs, ok, crash, ...report, warnings }, null, 2)}\n`);
  }
  process.exitCode = crash || !report || report.errors.length > 0 ? 1 : 0;
}

function print(r: ValidationReport): void {
  const DAY = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  console.log(`Plage effective ${r.from} → ${r.to} (exclu) : ${r.days} jours (fenêtre ∪ epoch ∪ références)`);
  for (const t of r.types) {
    console.log(`\n■ ${t.type} — versions ${t.versions.join(', ')} — ${t.days} jours (dont ${t.dailyDays} servis en puzzle du jour)`);
    console.log(`  temps (ms, 1re mesure) : moyenne ${t.timeMs.mean} · médiane ${t.timeMs.p50} · p99 ${t.timeMs.p99} · max ${t.timeMs.max} (${t.timeMs.maxDate}) · 2es mesures : ${t.retries.length}`);
    if (t.coldMs.length > 0) {
      console.log(`  à froid (processus neuf, chargement compris, jour le plus lent) : ${t.coldMs.map((c) => `${DAY[c.weekday]} ${c.ms}`).join(' · ')}`);
    }
    console.log(`  tentatives : moyenne ${t.attempts.mean} · max ${t.attempts.max} (${t.attempts.maxDate}) · secours ${t.attempts.fallbacks}`);
    console.log(`  secours vérifiés : ${t.fallbacksChecked}`);
    console.log('  score par jour (p10 / médiane / p90 / max) :');
    for (const w of t.weekdays) console.log(`    v${w.version} ${DAY[w.weekday]} ${w.target.padEnd(5)} ${w.p10} / ${w.median} / ${w.p90} / ${w.max}`);
  }
  for (const g of r.golden) {
    const extra = [g.added.length > 0 ? `${g.added.length} ajoutées` : '', g.pending.length > 0 ? `${g.pending.length} en attente` : '']
      .filter(Boolean)
      .join(' · ');
    console.log(`  références ${g.file} : ${g.checked} vérifiées · ${g.mismatches.length} divergentes · ${g.missing.length} manquantes${extra ? ` · ${extra}` : ''}`);
  }
  for (const w of r.warnings) console.log(`⚠ ${w}`);
  if (r.errors.length === 0) {
    console.log(r.written ? '\n✓ Validation réussie — références mises à jour' : '\n✓ Validation réussie');
    return;
  }
  // Toutes les erreurs de références, puis un échantillon des autres.
  const isGolden = (e: string) => /\.json|références/.test(e);
  const golden = r.errors.filter(isGolden);
  const others = r.errors.filter((e) => !isGolden(e));
  console.log(`\n✗ ${r.errors.length} erreur(s) :`);
  for (const e of golden) console.log(`  - ${e}`);
  for (const e of others.slice(0, 50)) console.log(`  - ${e}`);
  if (others.length > 50) console.log(`  … et ${others.length - 50} autre(s) (voir --report)`);
}
