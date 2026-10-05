import { deepFreeze } from './core/freeze';
import type { Schedule } from './core/schedule';

/**
 * Calendrier officiel de Griday.
 *
 * RÈGLE D'OR (après publication) : ne jamais modifier une entrée existante.
 * Pour changer la rotation ou un générateur, AJOUTER une entrée dont la date `from` est
 * postérieure au `validThrough` de tous les builds déjà publiés, puis repousser `validThrough`.
 */
export const SCHEDULE: Schedule = deepFreeze({
  // Puzzle n°1. N'affecte que la numérotation et le début des archives (visible : à fixer au lancement).
  epoch: '2026-10-05',
  // Garantie de ce build (≈ 6 mois) : à repousser à chaque publication.
  validThrough: '2027-04-04',
  rotations: [{ from: '2026-01-01', types: ['queens'] }],
  versions: {
    queens: [{ from: '2026-01-01', version: 1 }],
  },
});
