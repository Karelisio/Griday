/** Plateforme et appareil : détection d'Android natif, langues système, version de l'app. */
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
// Version affichée hors natif : on lit package.json (source de vérité, aussi lue par Gradle pour
// versionName). Vite inline la seule chaîne `version` ; le reste du fichier est élagué du bundle.
import { version as packageVersion } from '../../package.json';

/** Vrai dans l'app Android (WebView Capacitor), faux dans un navigateur (dev, tests). */
export function isNativeAndroid(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Langues préférées du système, par ordre de priorité (étiquettes BCP 47 : « fr-FR », « en »...). */
export async function getSystemLanguages(): Promise<string[]> {
  const tags: string[] = [];
  if (Capacitor.isNativePlatform()) tags.push(...(await nativeLanguage()));
  // Le plugin Device ne donne que la langue principale ; navigator.languages du WebView
  // porte la liste complète (2e, 3e langue...), utile pour choisir fr/en parmi plusieurs préférences.
  tags.push(...browserLanguages());
  return unique(tags);
}

async function nativeLanguage(): Promise<string[]> {
  try {
    const { value } = await Device.getLanguageTag();
    if (value) return [value];
  } catch {
    // repli sur le code de langue
  }
  try {
    const { value } = await Device.getLanguageCode();
    if (value) return [value];
  } catch {
    // repli sur navigator
  }
  return [];
}

function browserLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages && navigator.languages.length > 0) return [...navigator.languages];
  return navigator.language ? [navigator.language] : [];
}

/** Doublons exclus (sans tenir compte de la casse), ordre conservé, entrées vides ignorées. */
function unique(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = typeof raw === 'string' ? raw.trim() : '';
    const key = tag.toLowerCase();
    if (tag === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** Version de l'app : versionName Android en natif, version de package.json sinon. */
export async function getAppVersion(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { version } = await App.getInfo();
      if (version) return version;
    } catch {
      // repli sur package.json
    }
  }
  return packageVersion;
}
