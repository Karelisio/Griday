/** Internationalisation : i18next + react-i18next, français et anglais, aucun texte en dur. */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../../locales/en.json';
import fr from '../../locales/fr.json';

export const LANGUAGES = ['fr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export type LanguagePreference = 'system' | Language;

/** Langue effective : choix manuel, sinon première langue système supportée, sinon anglais. */
export function resolveLanguage(pref: LanguagePreference, systemLanguages: readonly string[]): Language {
  if (pref !== 'system') return pref;
  for (const tag of systemLanguages) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if ((LANGUAGES as readonly string[]).includes(base ?? '')) return base as Language;
  }
  return 'en';
}

export async function initI18n(language: Language): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources: { fr: { translation: fr }, en: { translation: en } },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false }, // React échappe déjà
    returnNull: false,
  });
  document.documentElement.lang = language;
}

export async function setLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
  document.documentElement.lang = language;
}

export { i18n };
