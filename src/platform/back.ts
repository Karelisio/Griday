/**
 * Retour système (geste ou bouton) : pile de gestionnaires de l'app.
 *
 * - Pile vide : le gestionnaire natif du plugin App est désactivé, Android applique son retour
 *   par défaut (animation système « retour à l'accueil » du retour prédictif).
 * - Pile non vide : le gestionnaire natif est activé et l'événement `backButton` appelle
 *   le gestionnaire le plus récent (feuille, dialogue, sous-écran...).
 *
 * Hors Android natif (navigateur, tests) la pile existe mais rien n'est branché ;
 * la touche Échap reste à la charge des composants.
 */
import { App } from '@capacitor/app';
import { isNativeAndroid } from './device';
import { attempt } from './internal';

interface Entry {
  readonly handler: () => void;
}

const stack: Entry[] = [];
let starting: Promise<void> | null = null;
/** L'écouteur natif est en place : l'état du gestionnaire natif peut être piloté. */
let listening = false;
/** Dernier état demandé au natif (null : inconnu ou échec, à renvoyer). */
let requested: boolean | null = null;

/** Branche l'écouteur natif une seule fois (idempotent). Ne rejette jamais. */
export function initBackHandling(): Promise<void> {
  starting ??= start();
  return starting;
}

async function start(): Promise<void> {
  if (!isNativeAndroid()) return;
  const registered = await attempt(() => App.addListener('backButton', onNativeBack));
  if (!registered) return; // sans écouteur, le système garde son comportement par défaut
  listening = true;
  syncNative();
}

/** Aligne le gestionnaire natif sur la pile : activé si et seulement si elle n'est pas vide. */
function syncNative(): void {
  if (!listening) return;
  const wanted = stack.length > 0;
  if (wanted === requested) return;
  requested = wanted;
  void attempt(() => App.toggleBackButtonHandler({ enabled: wanted })).then((ok) => {
    if (!ok && requested === wanted) requested = null; // échec : réessai au prochain changement
  });
}

function onNativeBack(): void {
  if (dispatchBack()) return;
  // Pile vide alors que le natif interceptait encore (course) : comportement système équivalent.
  void attempt(() => App.minimizeApp());
}

/**
 * Enregistre un gestionnaire de retour (le plus récent est appelé en premier).
 * Renvoie la fonction qui le retire ; l'appeler plusieurs fois est sans effet.
 */
export function pushBackHandler(handler: () => void): () => void {
  void initBackHandling();
  const entry: Entry = { handler };
  stack.push(entry);
  syncNative();
  return () => {
    const index = stack.indexOf(entry);
    if (index === -1) return;
    stack.splice(index, 1);
    syncNative();
  };
}

/**
 * Appelle le gestionnaire le plus récent. Renvoie false si la pile est vide.
 * Utilisé par l'écouteur natif ; utile aussi pour simuler un retour (tests, web).
 */
export function dispatchBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.handler();
  return true;
}
