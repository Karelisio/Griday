import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Limites Google Play : titre 30, description courte 80, description complète 4000 caractères.
const LIMITS = { 'title.txt': 30, 'short_description.txt': 80, 'full_description.txt': 4000 } as const;
const read = (lang: string, file: string) => readFileSync(new URL(`./${lang}/${file}`, import.meta.url), 'utf8');

describe('fiche Play Store', () => {
  it.each(['fr-FR', 'en-US'])('%s : textes présents et dans les limites', (lang) => {
    for (const [file, max] of Object.entries(LIMITS)) {
      const text = read(lang, file).trim();
      expect(text.length, `${lang}/${file}`).toBeGreaterThan(10);
      expect([...text].length, `${lang}/${file}`).toBeLessThanOrEqual(max);
    }
  });
});
