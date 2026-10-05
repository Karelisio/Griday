/**
 * Première partie d'un type de puzzle : ses règles s'affichent une fois dans la page (sans bloquer le jeu)
 * jusqu'à « Compris » ou l'ouverture du dialogue des règles. Mémorisé par type dans le stockage local.
 */
import { useCallback, useEffect, useState } from 'react';
import { loadJSON, saveJSON } from '../platform/storage';

export const RULES_SEEN_KEY = 'rules.seen.v1';

async function loadSeen(): Promise<Set<string>> {
  try {
    const v = await loadJSON<unknown>(RULES_SEEN_KEY);
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function useRulesIntro(type: string): { readonly show: boolean; readonly markSeen: () => void } {
  // null : pas encore lu (rien n'est affiché, pour ne pas faire clignoter la carte).
  const [seen, setSeen] = useState<{ type: string; seen: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSeen().then((all) => {
      if (!cancelled) setSeen({ type, seen: all.has(type) });
    });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const markSeen = useCallback(() => {
    setSeen({ type, seen: true });
    void loadSeen().then((all) => (all.has(type) ? undefined : saveJSON(RULES_SEEN_KEY, [...all, type])));
  }, [type]);

  return { show: seen !== null && seen.type === type && !seen.seen, markSeen };
}
