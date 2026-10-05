/**
 * Mesure à froid dans un processus neuf (comme au premier lancement sur téléphone), chargement des
 * modules du moteur compris : node --import tsx scripts/lib/cold-run.ts <type> <version> <YYYY-MM-DD>
 * → JSON { total, load, generate } (ms) sur stdout.
 */
import type { PuzzleTypeDefinition, PuzzleTypeId } from '../../engine/core/types';

const [type, version, date] = process.argv.slice(2);
if (!type || !version || !date) throw new Error(`Usage : cold-run <type> <version> <date> (reçu ${process.argv.slice(2).join(' ')})`);
const t0 = performance.now();
const [{ REGISTRY }, { generateDailyForVersion }] = await Promise.all([
  import('../../engine/registry'),
  import('../../engine/core/pipeline'),
]);
const def = REGISTRY[type as PuzzleTypeId] as PuzzleTypeDefinition<unknown> | undefined;
if (!def) throw new Error(`Type inconnu : ${type}`);
const t1 = performance.now();
generateDailyForVersion(def, Number(version), date);
const t2 = performance.now();
process.stdout.write(JSON.stringify({ total: t2 - t0, load: t1 - t0, generate: t2 - t1 }));
