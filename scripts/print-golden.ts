/**
 * Calcule les valeurs de gel d'une version (à recopier dans engine/queens/v1/freeze.test.ts et
 * engine/selfcheck.ts). Usage : npx tsx scripts/print-golden.ts
 * À n'utiliser que pour une version NON publiée : les valeurs d'une version publiée ne changent jamais.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fingerprintPuzzle } from '../engine/core/pipeline';
import { hashHex, rngFromString } from '../engine/core/prng';
import { getDailyPuzzle, REGISTRY } from '../engine/index';
import {
  attemptDigests,
  dailyDigestV1,
  dailyFingerprintV1,
  fallbackDigest,
  GOLDEN_DATES,
  GOLDEN_DIGEST_DAYS,
  GOLDEN_DIGEST_START,
  sourceHash,
  V1_FROZEN_FILES,
} from '../engine/queens/v1/freeze-data';
import { SELFCHECK_DATES } from '../engine/selfcheck';

const engineDir = fileURLToPath(new URL('../engine/', import.meta.url));

console.log('// freeze.test.ts — SOURCES');
for (const f of V1_FROZEN_FILES) console.log(`  '${f}': '${sourceHash(readFileSync(engineDir + f, 'utf8'))}',`);
console.log('// freeze.test.ts — DAILY');
for (const date of GOLDEN_DATES) console.log(`  '${date}': '${dailyFingerprintV1(date)}',`);
console.log(`// freeze.test.ts — DIGEST (${GOLDEN_DIGEST_DAYS} j) : '${dailyDigestV1(GOLDEN_DIGEST_START, GOLDEN_DIGEST_DAYS)}'`);
console.log('// freeze.test.ts — ATTEMPTS');
for (const [k, v] of Object.entries(attemptDigests())) console.log(`  '${k}': '${v}',`);
console.log(`// freeze.test.ts — FALLBACKS : '${fallbackDigest()}'`);

const rng = rngFromString('griday');
console.log('// selfcheck.ts');
console.log(`  hash: '${hashHex('griday')}',`);
console.log(`  rng: [${[rng.nextU32(), rng.nextU32(), rng.nextU32()].join(', ')}],`);
for (const date of SELFCHECK_DATES) {
  const p = getDailyPuzzle(date);
  console.log(`  '${date}': '${fingerprintPuzzle(REGISTRY[p.type], p)}',`);
}
