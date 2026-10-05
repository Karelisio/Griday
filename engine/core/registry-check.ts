import type { Registry } from './pipeline';
import { hasOwn, validateSchedule, type Schedule } from './schedule';
import { DIFFICULTY_TIERS, PUZZLE_TYPE_IDS } from './types';

/**
 * Cohérence registre + calendrier (tests et démarrage) : numéros de version, plans hebdomadaires,
 * budgets, couverture des puzzles de secours, calendrier. Renvoie la liste des erreurs.
 */
export function validateRegistry(registry: Registry, schedule: Schedule): string[] {
  const errors: string[] = [];
  for (const id of PUZZLE_TYPE_IDS) {
    const def = hasOwn(registry, id) ? registry[id] : undefined;
    if (!def) {
      errors.push(`registre : type "${id}" absent`);
      continue;
    }
    if (def.id !== id) errors.push(`registre : "${id}" déclare l'id "${def.id}"`);
    const versions = Object.entries(def.versions);
    if (versions.length === 0) errors.push(`${id} : aucune version`);
    for (const [key, gen] of versions) {
      const label = `${id} v${key}`;
      if (gen.version !== Number(key)) errors.push(`${label} : numéro incohérent (${gen.version})`);
      if (!Number.isInteger(gen.maxAttempts) || gen.maxAttempts < 1) errors.push(`${label} : maxAttempts invalide`);
      if (gen.weeklyPlan.length !== 7) errors.push(`${label} : plan hebdomadaire de ${gen.weeklyPlan.length} jours`);
      if (gen.sizes.length === 0) errors.push(`${label} : aucune taille`);
      const targets = [
        ...gen.weeklyPlan,
        ...gen.sizes.flatMap((size) => DIFFICULTY_TIERS.map((tier) => ({ size, tier }))),
      ];
      for (const t of gen.weeklyPlan) {
        if (!gen.sizes.includes(t.size)) errors.push(`${label} : taille ${t.size} du plan absente de sizes`);
        if (!DIFFICULTY_TIERS.includes(t.tier)) errors.push(`${label} : palier ${t.tier} invalide`);
      }
      for (const t of targets) {
        try {
          const fb = gen.fallback(t, 0);
          if (!DIFFICULTY_TIERS.includes(fb.rating.tier)) errors.push(`${label} : secours ${t.size}/${t.tier} mal noté`);
        } catch (e) {
          errors.push(`${label} : pas de secours pour ${t.size}/${t.tier} (${(e as Error).message})`);
        }
      }
    }
  }
  const known = (t: (typeof PUZZLE_TYPE_IDS)[number]) =>
    hasOwn(registry, t) ? Object.keys(registry[t].versions).map(Number) : [];
  return [...errors, ...validateSchedule(schedule, known)];
}
