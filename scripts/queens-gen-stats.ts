/**
 * Banc de réglage du générateur Queens : npx tsx scripts/queens-gen-stats.ts [options]
 *
 *   --sizes=6,7,8,9,10     tailles mesurées
 *   --presets=easy,hard    préréglages (défaut : tous)
 *   --samples=300          tentatives par (taille, préréglage)
 *   --seed=stats           préfixe des graines (graine = préfixe:préréglage:taille:i)
 *   --show=2               affiche 2 grilles par case du tableau (lettres ; minuscule = reine)
 *
 * Par (taille, préréglage) : succès, temps par appel (moyenne, p95, max), tailles de régions,
 * formes, et — si engine/queens/solver.ts est présent (import dynamique) — paliers de difficulté
 * et part des grilles non résolubles par logique. Puis, pour chaque cible (taille, palier) du plan
 * hebdomadaire : meilleur préréglage, taux d'acceptation par tentative, temps attendu.
 */
import { performance } from 'node:perf_hooks';
import { rngFromString } from '../engine/core/prng';
import { generateQueensCandidate, QUEENS_SHAPE_PRESETS } from '../engine/queens/generator';
import type { QueensPuzzle, QueensSolvedPuzzle } from '../engine/queens/types';

interface Rating {
  readonly solvable: boolean;
  readonly tier: number;
}
type RateFn = (p: QueensPuzzle) => Rating;

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=(.*)$/.exec(a);
  if (m) args.set(m[1]!, m[2]!);
}
const sizes = (args.get('sizes') ?? '6,7,8,9,10').split(',').map(Number);
const presets = (args.get('presets') ?? Object.keys(QUEENS_SHAPE_PRESETS).join(',')).split(',');
const samples = Number(args.get('samples') ?? 300);
const seedPrefix = args.get('seed') ?? 'stats';
const show = Number(args.get('show') ?? 0);

// Solveur logique facultatif (spécificateur calculé : le script fonctionne sans lui).
let rate: RateFn | null = null;
try {
  const spec = '../engine/queens/solver';
  const mod = (await import(spec)) as { rateQueens?: RateFn };
  if (typeof mod.rateQueens === 'function') rate = mod.rateQueens;
} catch {
  rate = null;
}

const WEEKLY: readonly [string, number, number][] = [
  ['lun', 6, 1],
  ['mar', 7, 1],
  ['mer', 7, 2],
  ['jeu', 8, 2],
  ['ven', 8, 3],
  ['sam', 9, 3],
  ['dim', 10, 4],
];

interface CellStats {
  ok: number;
  times: number[];
  rateMs: number;
  tiers: number[];
  unsolvable: number;
  sizes: number[];
  maxSizes: number[];
  bars: number;
  regions: number;
  perimeter: number;
}

function regionStats(p: QueensSolvedPuzzle, st: CellStats): void {
  const n = p.size;
  const size = new Array<number>(n).fill(0);
  const rows = new Array<number>(n).fill(0);
  const cols = new Array<number>(n).fill(0);
  const per = new Array<number>(n).fill(0);
  for (let x = 0; x < n * n; x++) {
    const g = p.regions[x]!;
    const r = Math.floor(x / n);
    const c = x % n;
    size[g]!++;
    rows[g]! |= 1 << r;
    cols[g]! |= 1 << c;
    // Bords de la région (bord de grille compris).
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= n || cc < 0 || cc >= n || p.regions[rr * n + cc] !== g) per[g]!++;
    }
  }
  for (let g = 0; g < n; g++) {
    st.sizes.push(size[g]!);
    if (size[g]! >= 2 && (popcount(rows[g]!) === 1 || popcount(cols[g]!) === 1)) st.bars++;
    st.perimeter += per[g]! / size[g]!;
  }
  st.regions += n;
  st.maxSizes.push(Math.max(...size));
}

function popcount(x: number): number {
  let c = 0;
  for (let v = x; v !== 0; v &= v - 1) c++;
  return c;
}

function render(p: QueensSolvedPuzzle): string {
  const A = 'ABCDEFGHIJKL';
  const lines: string[] = [];
  for (let r = 0; r < p.size; r++) {
    let line = '  ';
    for (let c = 0; c < p.size; c++) {
      const ch = A[p.regions[r * p.size + c]!]!;
      line += (p.solution[r] === c ? ch.toLowerCase() : ch) + ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

const quantile = (sorted: readonly number[], q: number): number =>
  sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
const pct = (a: number, b: number): string => (b === 0 ? '  -' : ((100 * a) / b).toFixed(0).padStart(3)) + '%';

const results = new Map<string, CellStats>();
console.log(`Queens — générateur : ${samples} tentatives par case ; solveur logique ${rate ? 'présent' : 'ABSENT (paliers non mesurés)'}\n`);
console.log(
  'taille préréglage  succès  ms moy   p95   max | tailles min/méd/max  ≤2   ≤3  max moy | barres bord/case' +
    (rate ? ' | p1   p2   p3   p4  non-log  note ms' : ''),
);
for (const n of sizes) {
  for (const name of presets) {
    const shape = QUEENS_SHAPE_PRESETS[name];
    if (!shape) throw new Error(`Préréglage inconnu : ${name}`);
    const st: CellStats = { ok: 0, times: [], rateMs: 0, tiers: [0, 0, 0, 0, 0], unsolvable: 0, sizes: [], maxSizes: [], bars: 0, regions: 0, perimeter: 0 };
    let shown = 0;
    for (let i = 0; i < samples; i++) {
      const rng = rngFromString(`${seedPrefix}:${name}:${n}:${i}`);
      const t0 = performance.now();
      const p = generateQueensCandidate(rng, n, shape);
      st.times.push(performance.now() - t0);
      if (!p) continue;
      st.ok++;
      regionStats(p, st);
      let tierText = '';
      if (rate) {
        const t1 = performance.now();
        const rt = rate(p);
        st.rateMs += performance.now() - t1;
        if (rt.solvable) st.tiers[rt.tier]!++;
        else st.unsolvable++;
        tierText = rt.solvable ? ` palier ${rt.tier}` : ' non résoluble par logique';
      }
      if (shown < show) {
        shown++;
        console.log(`  [${name} n=${n} #${i}${tierText}]\n${render(p)}`);
      }
    }
    results.set(`${n}:${name}`, st);
    const times = [...st.times].sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const sz = [...st.sizes].sort((a, b) => a - b);
    const le = (k: number) => pct(st.sizes.filter((s) => s <= k).length, st.sizes.length);
    const maxMean = st.maxSizes.reduce((a, b) => a + b, 0) / Math.max(1, st.maxSizes.length);
    let line =
      `${String(n).padStart(6)} ${name.padEnd(10)} ${pct(st.ok, samples)}  ${mean.toFixed(2).padStart(6)} ${quantile(times, 0.95).toFixed(2).padStart(5)} ${times[times.length - 1]!.toFixed(1).padStart(5)} |` +
      `   ${String(sz[0] ?? '-').padStart(3)}/${String(quantile(sz, 0.5)).padStart(3)}/${String(sz[sz.length - 1] ?? '-').padStart(3)}   ${le(2)} ${le(3)} ${maxMean.toFixed(1).padStart(6)} |` +
      ` ${pct(st.bars, st.regions)}  ${(st.perimeter / Math.max(1, st.regions)).toFixed(2).padStart(8)}`;
    if (rate) {
      const t = st.tiers;
      line += ` | ${pct(t[1]!, st.ok)} ${pct(t[2]!, st.ok)} ${pct(t[3]!, st.ok)} ${pct(t[4]!, st.ok)}  ${pct(st.unsolvable, st.ok)}  ${(st.rateMs / Math.max(1, st.ok)).toFixed(2).padStart(6)}`;
    }
    console.log(line);
  }
}

if (rate) {
  // Acceptation par tentative = succès × P(palier visé) ; temps attendu par puzzle accepté.
  const best = (n: number, tier: number): { name: string; acc: number; ms: number } | null => {
    let res: { name: string; acc: number; ms: number } | null = null;
    for (const name of presets) {
      const st = results.get(`${n}:${name}`);
      if (!st) continue;
      const acc = st.tiers[tier]! / samples;
      const ms = (st.times.reduce((a, b) => a + b, 0) + st.rateMs) / samples;
      if (!res || acc > res.acc) res = { name, acc, ms: acc > 0 ? ms / acc : Infinity };
    }
    return res;
  };
  console.log('\nPlan hebdomadaire — meilleur préréglage par cible (acceptation par tentative, ms par puzzle accepté) :');
  for (const [day, n, tier] of WEEKLY) {
    const b = best(n, tier);
    console.log(`  ${day} ${n}×${n} palier ${tier} : ${b ? `${b.name.padEnd(8)} ${pct(b.acc * samples, samples)}  ~${b.ms.toFixed(1)} ms` : 'non mesuré'}`);
  }
  console.log('\nMode illimité — acceptation du meilleur préréglage par (taille, palier) :');
  console.log('taille   p1          p2          p3          p4');
  for (const n of sizes) {
    let line = String(n).padStart(6);
    for (let tier = 1; tier <= 4; tier++) {
      const b = best(n, tier);
      line += b ? `  ${b.name.slice(0, 6).padEnd(6)}${pct(b.acc * samples, samples)}` : '      -     ';
    }
    console.log(line);
  }
}
