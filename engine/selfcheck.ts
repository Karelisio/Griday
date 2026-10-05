/**
 * Auto-vérification au démarrage de l'application (dans le WebView réel, après minification) :
 * détecte un moteur JS ou une compilation qui produirait des puzzles différents.
 * Les dates choisies exercent le générateur (réparations, nombreuses tentatives) et les techniques
 * avancées (ensembles verrouillés, contradiction). Renvoie la liste des écarts (vide = OK).
 * Coût : quelques dizaines de millisecondes ; à lancer dans le worker, une fois par version d'app.
 */
import { SCHEDULE } from './config';
import { fingerprintPuzzle, generateDaily } from './core/pipeline';
import { hashHex, rngFromString } from './core/prng';
import { REGISTRY } from './registry';

export const SELFCHECK_DATES = ['2026-10-05', '2026-10-11', '2026-11-14'] as const;

const EXPECTED = {
  hash: 'd954ff7afdfe75c1efd9755b7146fdcd',
  rng: [1171315048, 2646993962, 971861685],
  daily: {
    '2026-10-05': 'cce86084fc2f956e8d6ff8a3e04ed9e4',
    '2026-10-11': '7280388483e999d0d3973e9a38c6fb6c',
    '2026-11-14': 'c8849ea64cb037b6e6a7aee881b668cb',
  } as Readonly<Record<(typeof SELFCHECK_DATES)[number], string>>,
} as const;

export function engineSelfCheck(): string[] {
  const failures: string[] = [];
  try {
    if (hashHex('griday') !== EXPECTED.hash) failures.push('hash');
    const rng = rngFromString('griday');
    if (EXPECTED.rng.some((v) => rng.nextU32() !== v)) failures.push('prng');
    for (const date of SELFCHECK_DATES) {
      const p = generateDaily(REGISTRY, SCHEDULE, date);
      if (fingerprintPuzzle(REGISTRY[p.type], p) !== EXPECTED.daily[date]) failures.push(`daily ${date}`);
    }
  } catch (e) {
    failures.push(`exception: ${(e as Error).message}`);
  }
  return failures;
}
