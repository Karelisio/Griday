/**
 * Auto-vérification au démarrage de l'application (dans le WebView réel, après minification) :
 * détecte un moteur JS ou une compilation qui produirait des puzzles différents.
 * Renvoie la liste des écarts (vide = OK). Coût : quelques millisecondes.
 */
import { SCHEDULE } from './config';
import { fingerprintPuzzle, generateDaily } from './core/pipeline';
import { hashHex, rngFromString } from './core/prng';
import { REGISTRY } from './registry';

const EXPECTED = {
  hash: 'd954ff7afdfe75c1efd9755b7146fdcd',
  rng: [1171315048, 2646993962, 971861685],
  dailyDate: '2026-10-05',
  daily: 'a4c2ae829a11fa7597b325edb2245331',
} as const;

export function engineSelfCheck(): string[] {
  const failures: string[] = [];
  try {
    if (hashHex('griday') !== EXPECTED.hash) failures.push('hash');
    const rng = rngFromString('griday');
    if (EXPECTED.rng.some((v) => rng.nextU32() !== v)) failures.push('prng');
    const p = generateDaily(REGISTRY, SCHEDULE, EXPECTED.dailyDate);
    if (fingerprintPuzzle(REGISTRY[p.type], p) !== EXPECTED.daily) failures.push('daily');
  } catch (e) {
    failures.push(`exception: ${(e as Error).message}`);
  }
  return failures;
}
