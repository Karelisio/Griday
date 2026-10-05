/**
 * Auto-vérification au démarrage de l'application (dans le WebView réel, après minification) :
 * détecte un moteur JS ou une compilation qui produirait des puzzles différents.
 * Les dates choisies exercent le générateur (réparations, nombreuses tentatives) et les techniques
 * avancées (ensembles verrouillés, contradiction), pour chaque type du calendrier. Binairo V1 est en
 * plus contrôlé hors calendrier (version explicite). Valeurs attendues : selfcheck-expected.ts.
 * Renvoie la liste des écarts (vide = OK).
 * Coût : quelques dizaines de millisecondes ; à lancer dans le worker, une fois par version d'app.
 */
import { BINAIRO_DEFINITION } from './binairo';
import { SCHEDULE } from './config';
import { fingerprintPuzzle, generateDaily, generateDailyForVersion } from './core/pipeline';
import { hashHex, rngFromString } from './core/prng';
import { REGISTRY } from './registry';
import { BINAIRO_SELFCHECK_DATE, SELFCHECK_DATES, SELFCHECK_EXPECTED } from './selfcheck-expected';

export { BINAIRO_SELFCHECK_DATE, SELFCHECK_DATES };

const EXPECTED = SELFCHECK_EXPECTED;

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
    const b = generateDailyForVersion(BINAIRO_DEFINITION, 1, BINAIRO_SELFCHECK_DATE);
    if (fingerprintPuzzle(BINAIRO_DEFINITION, b) !== EXPECTED.binairo) failures.push(`binairo v1 ${BINAIRO_SELFCHECK_DATE}`);
  } catch (e) {
    failures.push(`exception: ${(e as Error).message}`);
  }
  return failures;
}
