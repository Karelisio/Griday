import { describe, expect, it } from 'vitest';
import { capitalize, DASH, formatPercent, formatShortDate } from './format';

describe('formats des statistiques', () => {
  it('majuscule initiale (accents compris), reste du texte inchangé', () => {
    expect(capitalize('résolu plus tard', 'fr')).toBe('Résolu plus tard');
    expect(capitalize('à temps', 'fr')).toBe('À temps');
    expect(capitalize('solved on time', 'en')).toBe('Solved on time');
    expect(capitalize('Déjà', 'fr')).toBe('Déjà');
    expect(capitalize('', 'en')).toBe('');
  });

  it('pourcentage entier localisé (espace insécable avant « % » en français)', () => {
    // L'espace insécable (U+00A0 ou U+202F selon la version d'ICU) ne doit jamais être une espace ordinaire.
    expect(formatPercent(0.9, 'fr')).toMatch(/^90\s%$/);
    expect(formatPercent(0.9, 'fr')).not.toContain(' ');
    expect(formatPercent(1, 'fr')).toMatch(/^100\s%$/);
    expect(formatPercent(0.9, 'en')).toBe('90%');
    expect(formatPercent(1 / 3, 'en')).toBe('33%');
  });

  it('date courte sans année, avec ou sans jour de la semaine', () => {
    expect(formatShortDate('2026-10-05', 'fr')).toBe('5 oct.');
    expect(formatShortDate('2026-10-05', 'en')).toBe('Oct 5');
    expect(formatShortDate('2026-10-05', 'fr', true)).toBe('lun. 5 oct.');
    expect(formatShortDate('2026-10-05', 'en', true)).toBe('Mon, Oct 5');
  });

  it('pas de décalage de fuseau en bordure de jour', () => {
    expect(formatShortDate('2026-01-01', 'en')).toBe('Jan 1');
    expect(formatShortDate('2026-12-31', 'en')).toBe('Dec 31');
  });

  it('tiret pour une valeur absente', () => {
    expect(DASH).toBe('–');
  });
});
