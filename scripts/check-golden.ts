/**
 * Références figées en AJOUT SEUL : compare scripts/golden/*.json à une révision git de base.
 * Usage : npx tsx scripts/check-golden.ts <révision>   (SHA du push précédent, base de la PR…)
 * Échec (code 1) si une clé de la base est supprimée ou modifiée.
 * Contournement explicite, AVANT LANCEMENT UNIQUEMENT : GOLDEN_RESET=1 (CI : « [golden-reset] » dans le
 * message du commit ou le titre de la PR).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appendOnlyViolations, type GoldenMonths } from './lib/future';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.argv[2] ?? '';
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

if (!base || /^0+$/.test(base)) {
  console.log('Références : pas de révision de base (nouvelle branche ou planification), contrôle ignoré.');
  process.exit(0);
}
try {
  git('cat-file', '-e', `${base}^{commit}`);
} catch {
  console.error(`✗ Révision de base introuvable : ${base} (historique incomplet ou réécrit ?)`);
  process.exit(1);
}

const files = git('ls-tree', '--name-only', base, 'scripts/golden/')
  .split('\n')
  .filter((f) => f.endsWith('.json'));
let violations = 0;
for (const file of files) {
  const before = JSON.parse(git('show', `${base}:${file}`)) as GoldenMonths;
  const path = root + file;
  const now = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as GoldenMonths) : undefined;
  const v = appendOnlyViolations(before, now);
  violations += v.length;
  console.log(`${file} : ${Object.keys(before).length} références de base, ${v.length} violation(s)`);
  for (const x of v.slice(0, 20)) console.log(`  - ${x}`);
  if (v.length > 20) console.log(`  … et ${v.length - 20} autre(s)`);
}
if (violations === 0) {
  console.log('✓ Références en ajout seul');
} else if (process.env['GOLDEN_RESET'] === '1') {
  console.log(`⚠ ${violations} violation(s) acceptée(s) : GOLDEN_RESET=1 (interdit après lancement)`);
} else {
  console.error(`✗ ${violations} référence(s) publiée(s) supprimée(s) ou modifiée(s) : des puzzles déjà servis changeraient.`);
  process.exitCode = 1;
}
