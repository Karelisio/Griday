/**
 * Calcule les valeurs « golden » (empreintes de puzzles du jour) à figer dans engine/golden.test.ts
 * et engine/selfcheck.ts. Usage : npx tsx scripts/print-golden.ts
 * À n'exécuter que pour une NOUVELLE version : les valeurs d'une version publiée ne changent jamais.
 */
import { addDays } from '../engine/core/date';
import { fingerprintPuzzle } from '../engine/core/pipeline';
import { hashHex, rngFromString } from '../engine/core/prng';
import { GOLDEN_DATES, GOLDEN_DIGEST_DAYS, GOLDEN_DIGEST_START } from '../engine/golden-dates';
import { getDailyPuzzle, REGISTRY } from '../engine/index';

const fp = (date: string) => {
  const p = getDailyPuzzle(date);
  return fingerprintPuzzle(REGISTRY[p.type], p);
};

console.log('// engine/golden.test.ts — GOLDEN');
for (const date of GOLDEN_DATES) console.log(`  '${date}': '${fp(date)}',`);
const all: string[] = [];
for (let i = 0; i < GOLDEN_DIGEST_DAYS; i++) all.push(fp(addDays(GOLDEN_DIGEST_START, i)));
console.log(`// digest ${GOLDEN_DIGEST_DAYS} jours : '${hashHex(all.join(','))}'`);

const rng = rngFromString('griday');
console.log('// engine/selfcheck.ts');
console.log(`  hash: '${hashHex('griday')}',`);
console.log(`  rng: [${[rng.nextU32(), rng.nextU32(), rng.nextU32()].join(', ')}],`);
console.log(`  daily: '${fp(GOLDEN_DATES[0]!)}',`);
