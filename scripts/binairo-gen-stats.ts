/**
 * Banc de réglage du générateur Binairo : npx tsx scripts/binairo-gen-stats.ts [options]
 *
 *   --sizes=6,8,10,12      tailles mesurées
 *   --tiers=1,2,3,4        paliers visés
 *   --samples=300          tentatives par (taille, palier)
 *   --seed=stats           préfixe des graines (graine = préfixe:taille:palier#i)
 *   --show=2               affiche 2 grilles par (taille, palier) (A = 1, B = 2, · = vide)
 *   --daily=N              en plus : N jours consécutifs du pipeline V1 (plan hebdomadaire, bandes comprises)
 *
 * Par (taille, palier) : candidats produits, temps par tentative (candidat + notation : moyenne, p95, max),
 * données restantes, palier obtenu, score (p10 / médiane / p90) des candidats au bon palier, étapes par niveau,
 * puis acceptation par tentative avec les bandes de score V1 et temps attendu par puzzle accepté.
 */
import { performance } from 'node:perf_hooks';
import { addDays, isoWeekday } from '../engine/core/date';
import { generateDailyForVersion } from '../engine/core/pipeline';
import { rngFromString } from '../engine/core/prng';
import type { DifficultyTier } from '../engine/core/types';
import { BINAIRO_DEFINITION } from '../engine/binairo';
import { generateBinairoCandidate } from '../engine/binairo/v1/generator';
import { BINAIRO_TECHNIQUES_V1, rateBinairo } from '../engine/binairo/v1/solver';
import { acceptsV1, BINAIRO_V1 } from '../engine/binairo/v1/version';
import type { BinairoSolvedPuzzle } from '../engine/binairo/types';

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=(.*)$/.exec(a);
  if (m) args.set(m[1]!, m[2]!);
}
const sizes = (args.get('sizes') ?? '6,8,10,12').split(',').map(Number);
const tiers = (args.get('tiers') ?? '1,2,3,4').split(',').map(Number) as DifficultyTier[];
const samples = Number(args.get('samples') ?? 300);
const seedPrefix = args.get('seed') ?? 'stats';
const show = Number(args.get('show') ?? 0);
const dailyDays = Number(args.get('daily') ?? 0);

const quantile = (sorted: readonly number[], q: number): number =>
  sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
const pct = (a: number, b: number): string => (b === 0 ? '  -' : ((100 * a) / b).toFixed(0).padStart(3)) + '%';
const sortNum = (a: readonly number[]) => [...a].sort((x, y) => x - y);

function render(p: BinairoSolvedPuzzle): string {
  const lines: string[] = [];
  for (let r = 0; r < p.size; r++) {
    let line = '  ';
    for (let c = 0; c < p.size; c++) line += ['·', 'A', 'B'][p.givens[r * p.size + c]!] + ' ';
    lines.push(line);
  }
  return lines.join('\n');
}

const levels = BINAIRO_TECHNIQUES_V1.techniques.map((t) => t.id);
console.log(`Binairo V1 — ${samples} tentatives par (taille, palier) ; niveaux : ${levels.map((id, i) => `${i + 1}=${id}`).join(' ')}\n`);
console.log('taille palier cand.  ms moy   p95    max | données min/méd/max | p1   p2   p3   p4  | score p10/méd/p90 (bon palier) | étapes/niveau (méd) | accept  ms/accepté');
for (const n of sizes) {
  for (const tier of tiers) {
    const times: number[] = [];
    const givens: number[] = [];
    const got = [0, 0, 0, 0, 0];
    const scores: number[] = [];
    const perLevel: number[][] = levels.map(() => []);
    let ok = 0;
    let accepted = 0;
    let shown = 0;
    for (let i = 0; i < samples; i++) {
      const rng = rngFromString(`${seedPrefix}:${n}:${tier}#${i}`);
      const t0 = performance.now();
      const p = generateBinairoCandidate(rng, n, tier);
      const rating = p ? rateBinairo(p) : null;
      times.push(performance.now() - t0);
      if (!p || !rating) continue;
      ok++;
      givens.push(p.givens.filter((v) => v !== 0).length);
      if (rating.solvable) got[rating.tier]!++;
      if (rating.solvable && rating.tier === tier) {
        scores.push(rating.score);
        levels.forEach((_, k) => perLevel[k]!.push(rating.levelCounts[k + 1] ?? 0));
        if (acceptsV1({ size: n, tier }, { tier: rating.tier, score: rating.score, hardest: rating.hardest })) accepted++;
        if (shown < show) {
          shown++;
          console.log(`  [${n}×${n} palier ${tier} #${i} score ${rating.score} (${rating.hardest})]\n${render(p)}`);
        }
      }
    }
    const t = sortNum(times);
    const g = sortNum(givens);
    const sc = sortNum(scores);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const acc = accepted / samples;
    console.log(
      `${String(n).padStart(6)} ${String(tier).padStart(6)} ${pct(ok, samples)} ${mean.toFixed(2).padStart(6)} ${quantile(t, 0.95).toFixed(2).padStart(6)} ${t.at(-1)!.toFixed(1).padStart(6)} |` +
        `   ${String(g[0] ?? '-').padStart(3)}/${String(quantile(g, 0.5)).padStart(3)}/${String(g.at(-1) ?? '-').padStart(3)}     |` +
        ` ${pct(got[1]!, ok)} ${pct(got[2]!, ok)} ${pct(got[3]!, ok)} ${pct(got[4]!, ok)} |` +
        `   ${String(quantile(sc, 0.1)).padStart(4)}/${String(quantile(sc, 0.5)).padStart(4)}/${String(quantile(sc, 0.9)).padStart(4)}               |` +
        ` ${perLevel.map((l) => String(quantile(sortNum(l), 0.5))).join(' ').padEnd(19)} | ${pct(accepted, samples)}  ${acc > 0 ? (mean / acc).toFixed(1).padStart(8) : '       ∞'}`,
    );
  }
}

if (dailyDays > 0) {
  // Pipeline réel (bandes et budget compris) sur N jours : temps, tentatives, scores par jour de semaine.
  const DAY = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  const byDay = new Map<number, { ms: number[]; attempts: number[]; scores: number[]; fallbacks: number }>();
  for (let i = 0; i < dailyDays; i++) {
    const date = addDays('2026-10-05', i);
    const wd = isoWeekday(date);
    const t0 = performance.now();
    const g = generateDailyForVersion(BINAIRO_DEFINITION, 1, date);
    const ms = performance.now() - t0;
    let d = byDay.get(wd);
    if (!d) byDay.set(wd, (d = { ms: [], attempts: [], scores: [], fallbacks: 0 }));
    d.ms.push(ms);
    d.attempts.push(g.attempt + 1);
    d.scores.push(g.rating.score);
    if (g.source !== 'generated') d.fallbacks++;
  }
  console.log(`\nPuzzle du jour V1 sur ${dailyDays} jours (depuis 2026-10-05) :`);
  console.log('jour cible  ms méd    p99    max | tentatives moy/max | score p10/méd/p90/max | secours');
  for (let wd = 1; wd <= 7; wd++) {
    const d = byDay.get(wd);
    if (!d) continue;
    const t = BINAIRO_V1.weeklyPlan[wd - 1]!;
    const ms = sortNum(d.ms);
    const sc = sortNum(d.scores);
    const att = d.attempts;
    console.log(
      `${DAY[wd]}  ${`${t.size}/${t.tier}`.padEnd(5)} ${quantile(ms, 0.5).toFixed(1).padStart(6)} ${quantile(ms, 0.99).toFixed(1).padStart(6)} ${ms.at(-1)!.toFixed(1).padStart(6)} |` +
        ` ${(att.reduce((a, b) => a + b, 0) / att.length).toFixed(2).padStart(6)} / ${String(Math.max(...att)).padStart(3)}      |` +
        ` ${quantile(sc, 0.1)}/${quantile(sc, 0.5)}/${quantile(sc, 0.9)}/${sc.at(-1)} | ${d.fallbacks}`,
    );
  }
}
