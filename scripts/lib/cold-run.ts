/**
 * Mesure à froid dans un processus neuf (comme au premier lancement sur téléphone) :
 * node --import tsx scripts/lib/cold-run.ts <type> <version> <YYYY-MM-DD>  → millisecondes sur stdout.
 */
import { generateDailyForVersion } from '../../engine/core/pipeline';
import type { PuzzleTypeDefinition, PuzzleTypeId } from '../../engine/core/types';
import { REGISTRY } from '../../engine/registry';

const [type, version, date] = process.argv.slice(2);
const def = REGISTRY[type as PuzzleTypeId] as PuzzleTypeDefinition<unknown> | undefined;
if (!def || !version || !date) throw new Error(`Usage : cold-run <type> <version> <date> (reçu ${process.argv.slice(2).join(' ')})`);
const t0 = performance.now();
generateDailyForVersion(def, Number(version), date);
process.stdout.write(String(performance.now() - t0));
