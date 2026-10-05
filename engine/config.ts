import type { Schedule } from './core/schedule';

/**
 * Calendrier officiel de Griday.
 *
 * RÈGLE D'OR (après publication) : ne jamais modifier une entrée existante.
 * Pour changer la rotation ou un générateur, AJOUTER une entrée avec une date `from` future.
 */
export const SCHEDULE: Schedule = {
  // Puzzle n°1. N'affecte que la numérotation et le début des archives.
  epoch: '2026-10-05',
  rotations: [{ from: '2026-01-01', types: ['queens'] }],
  versions: {
    queens: [{ from: '2026-01-01', version: 1 }],
  },
};
