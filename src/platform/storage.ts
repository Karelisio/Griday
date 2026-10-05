/** Stockage local persistant (Capacitor Preferences ; localStorage sur le web). Valeurs JSON. */
import { Preferences } from '@capacitor/preferences';

export async function loadJSON<T>(key: string): Promise<T | undefined> {
  try {
    const { value } = await Preferences.get({ key });
    return value === null ? undefined : (JSON.parse(value) as T);
  } catch {
    return undefined; // donnée illisible : on repart de zéro plutôt que de planter
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

export async function removeKey(key: string): Promise<void> {
  await Preferences.remove({ key });
}

/** Toutes les clés stockées (sans le préfixe interne de Preferences). */
export async function listKeys(): Promise<string[]> {
  try {
    return (await Preferences.keys()).keys;
  } catch {
    return [];
  }
}
