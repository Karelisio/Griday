/**
 * Utilitaires FIGÉS de Queens V1 (copies volontaires : la V1 ne dépend d'aucun code partagé
 * susceptible d'évoluer, hormis core/prng.ts lui-même figé). Verrouillé par freeze.test.ts.
 */

export const V1_MIN_SIZE = 4;
export const V1_MAX_SIZE = 12;

/** Marques (mêmes valeurs que queens/types.ts). */
export const MARK_EMPTY = 0;
export const MARK_CROSS = 1;
export const MARK_QUEEN = 2;

/** Nombre de bits à 1 d'un entier 32 bits. */
export function popcount32(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

/** Ré-étiquette les régions dans l'ordre de première apparition (forme canonique). */
export function canonicalizeRegions(regions: readonly number[]): number[] {
  const map = new Map<number, number>();
  return regions.map((g) => {
    let id = map.get(g);
    if (id === undefined) {
      id = map.size;
      map.set(g, id);
    }
    return id;
  });
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Décode une chaîne de chiffres base 36 (régions ou colonnes) en entiers. */
export function decodeDigits(code: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < code.length; i++) {
    const v = ALPHABET.indexOf(code[i]!);
    if (v < 0) throw new RangeError(`Queens V1 : caractère invalide "${code[i]}"`);
    out.push(v);
  }
  return out;
}

/** Encode des entiers 0..35 en chiffres base 36. */
export function encodeDigits(values: readonly number[]): string {
  return values
    .map((v) => {
      const ch = Number.isInteger(v) ? ALPHABET[v] : undefined;
      if (ch === undefined) throw new RangeError(`Queens V1 : valeur invalide ${v}`);
      return ch;
    })
    .join('');
}
