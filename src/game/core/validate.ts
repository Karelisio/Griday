/**
 * Puzzle généré (du jour ou illimité) relu du cache local : métadonnées et grille cohérentes,
 * sinon ignoré (régénéré). Commun à tous les types ; la grille est vérifiée par son type.
 */
import type { GameKindUI } from './kind';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTier = (v: unknown) => v === 1 || v === 2 || v === 3 || v === 4;

export interface StoredExpectation {
  readonly version?: number;
  readonly size?: number;
  /** Grille de secours temps réel acceptée (mode illimité seulement : jamais pour le puzzle du jour). */
  readonly allowEmergency?: boolean;
}

export function isStoredGenerated<P>(v: unknown, kind: GameKindUI<P>, expect: StoredExpectation = {}): boolean {
  if (!isRecord(v) || v['type'] !== kind.id || !Number.isInteger(v['version'])) return false;
  const sources = expect.allowEmergency ? ['generated', 'fallback', 'emergency'] : ['generated', 'fallback'];
  if (!sources.includes(v['source'] as string)) return false;
  if (expect.version !== undefined && v['version'] !== expect.version) return false;
  const target = v['target'];
  if (!isRecord(target) || !Number.isInteger(target['size']) || !isTier(target['tier'])) return false;
  if (expect.size !== undefined && target['size'] !== expect.size) return false;
  const puzzle = v['puzzle'];
  return kind.isPuzzle(puzzle) && kind.size(puzzle) === target['size'];
}
