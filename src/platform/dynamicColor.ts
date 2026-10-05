/**
 * Couleurs dynamiques (Material You, Android 12+) : palettes tonales du système.
 *
 * Côté natif, le plugin MaterialYou (android/.../MaterialYouPlugin.java) lit les ressources
 * android.R.color.system_<palette>_{0,10,50,...,1000}. Un int ARGB Java est signé ; le plugin
 * l'envoie déjà non signé (conversion en long), et ce module normalise à nouveau avec `>>> 0`
 * pour accepter aussi des valeurs signées. Résultat : entiers dans [0, 2^32).
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { SYSTEM_PALETTE_TONES, type SystemPalettes } from '../shared/systemPalettes';
import { isNativeAndroid } from './device';
import { subscribe } from './internal';

interface MaterialYouPlugin {
  /** Réponse brute (non fiable) : `{ supported: false }` ou `{ supported: true, accent1, ... }`. */
  getPalettes(): Promise<unknown>;
  addListener(eventName: 'paletteChanged', listener: () => void): Promise<PluginListenerHandle>;
}

// Enregistré à la demande : rien ne s'exécute à l'import, et hors Android natif le plugin n'est jamais créé.
let plugin: MaterialYouPlugin | undefined;
function materialYou(): MaterialYouPlugin {
  return (plugin ??= registerPlugin<MaterialYouPlugin>('MaterialYou'));
}

const PALETTE_NAMES = ['accent1', 'accent2', 'accent3', 'neutral1', 'neutral2'] as const;
const INT32_MIN = -0x80000000;
const UINT32_MAX = 0xffffffff;

/**
 * Valide la réponse du plugin : toutes les palettes présentes, 13 entiers 32 bits chacune.
 * Renvoie null au moindre doute (le thème retombe alors sur la palette de la marque).
 */
export function parseSystemPalettes(raw: unknown): SystemPalettes | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  if (source['supported'] !== true) return null;
  const out: Record<string, readonly number[]> = {};
  for (const name of PALETTE_NAMES) {
    const colors = parsePalette(source[name]);
    if (colors === null) return null;
    out[name] = colors;
  }
  return out as unknown as SystemPalettes;
}

function parsePalette(value: unknown): readonly number[] | null {
  if (!Array.isArray(value) || value.length !== SYSTEM_PALETTE_TONES.length) return null;
  const colors: number[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'number' || !Number.isInteger(entry) || entry < INT32_MIN || entry > UINT32_MAX) return null;
    colors.push(entry >>> 0);
  }
  return Object.freeze(colors);
}

/** Palettes du système, ou null (web, Android < 12, réponse invalide, erreur). Ne lève jamais. */
export async function getSystemPalettes(): Promise<SystemPalettes | null> {
  if (!isNativeAndroid()) return null;
  try {
    return parseSystemPalettes(await materialYou().getPalettes());
  } catch {
    return null;
  }
}

/**
 * Appelle `cb` avec les palettes relues quand le système a pu les changer (fond d'écran, au retour
 * dans l'app). `null` si la relecture échoue. Renvoie la fonction de désabonnement.
 */
export function onSystemPalettesChanged(cb: (palettes: SystemPalettes | null) => void): () => void {
  if (!isNativeAndroid()) return () => {};
  let active = true;
  const unsubscribe = subscribe(() =>
    materialYou().addListener('paletteChanged', () => {
      void getSystemPalettes().then((palettes) => {
        if (active) cb(palettes);
      });
    }),
  );
  return () => {
    active = false;
    unsubscribe();
  };
}
