/**
 * Calcule les valeurs de gel des versions (à recopier dans engine/<type>/v1/freeze.test.ts et
 * engine/selfcheck.ts). Usage : npx tsx scripts/print-golden.ts [queens|binairo]
 * À n'utiliser que pour une version NON publiée : les valeurs d'une version publiée ne changent jamais.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BINAIRO_DEFINITION } from '../engine/binairo';
import * as binairoFreeze from '../engine/binairo/v1/freeze-data';
import { fingerprintPuzzle, generateDailyForVersion } from '../engine/core/pipeline';
import { hashHex, rngFromString } from '../engine/core/prng';
import { getDailyPuzzle, REGISTRY } from '../engine/index';
import * as queensFreeze from '../engine/queens/v1/freeze-data';
import { BINAIRO_SELFCHECK_DATE, SELFCHECK_DATES } from '../engine/selfcheck';

const engineDir = fileURLToPath(new URL('../engine/', import.meta.url));
const only = process.argv[2];

type FreezeData = typeof queensFreeze | typeof binairoFreeze;
const VERSIONS: readonly [string, FreezeData][] = [
  ['queens', queensFreeze],
  ['binairo', binairoFreeze],
];

for (const [type, f] of VERSIONS) {
  if (only && only !== type) continue;
  const test = `${type}/v1/freeze.test.ts`;
  console.log(`// ${test} — SOURCES`);
  for (const file of f.V1_FROZEN_FILES) console.log(`  '${file}': '${f.sourceHash(readFileSync(engineDir + file, 'utf8'))}',`);
  console.log(`// ${test} — DAILY`);
  for (const date of f.GOLDEN_DATES) console.log(`  '${date}': '${f.dailyFingerprintV1(date)}',`);
  console.log(`// ${test} — DIGEST (${f.GOLDEN_DIGEST_DAYS} j) : '${f.dailyDigestV1(f.GOLDEN_DIGEST_START, f.GOLDEN_DIGEST_DAYS)}'`);
  console.log(`// ${test} — ATTEMPTS`);
  for (const [k, v] of Object.entries(f.attemptDigests())) console.log(`  '${k}': '${v}',`);
  console.log(`// ${test} — FALLBACKS : '${f.fallbackDigest()}'`);
  const golden = fileURLToPath(new URL(`./golden/${type}-v1.json`, import.meta.url));
  try {
    const data = JSON.parse(readFileSync(golden, 'utf8')) as Record<string, string>;
    console.log(`// ${test} — GOLDEN_FILE (≤ ${f.V1_GOLDEN_LAST_MONTH}) : '${f.goldenFileDigest(data, f.V1_GOLDEN_LAST_MONTH)}'`);
  } catch {
    console.log(`// ${test} — GOLDEN_FILE : scripts/golden/${type}-v1.json absent`);
  }
}

const rng = rngFromString('griday');
console.log('// selfcheck.ts');
console.log(`  hash: '${hashHex('griday')}',`);
console.log(`  rng: [${[rng.nextU32(), rng.nextU32(), rng.nextU32()].join(', ')}],`);
for (const date of SELFCHECK_DATES) {
  const p = getDailyPuzzle(date);
  console.log(`  '${date}': '${fingerprintPuzzle(REGISTRY[p.type], p)}',`);
}
console.log(`  binairo: '${fingerprintPuzzle(BINAIRO_DEFINITION, generateDailyForVersion(BINAIRO_DEFINITION, 1, BINAIRO_SELFCHECK_DATE))}',`);
