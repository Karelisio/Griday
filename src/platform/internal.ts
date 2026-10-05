/** Utilitaires internes à src/platform (non exportés par index.ts). */
import type { PluginListenerHandle } from '@capacitor/core';

/**
 * Exécute un appel natif en avalant toute erreur, synchrone ou asynchrone.
 * Renvoie true si l'appel a abouti.
 */
export async function attempt(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ajoute un écouteur Capacitor (dont l'enregistrement est asynchrone) et renvoie une fonction de
 * désabonnement synchrone. Appelée avant la fin de l'enregistrement, elle retire l'écouteur dès
 * qu'il existe. Idempotente ; ne lève jamais (un enregistrement raté est ignoré).
 */
export function subscribe(add: () => Promise<PluginListenerHandle>): () => void {
  let removed = false;
  let handle: PluginListenerHandle | null = null;
  // add() est lancé de façon synchrone : aucun événement n'est manqué après l'appel.
  void attempt(async () => {
    const created = await add();
    if (removed) await created.remove();
    else handle = created;
  });
  return () => {
    if (removed) return;
    removed = true;
    const current = handle;
    handle = null;
    if (current) void attempt(() => current.remove());
  };
}
