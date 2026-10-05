/**
 * Utilitaires FIGÉS de Binairo V1 (copies volontaires : la V1 ne dépend d'aucun code partagé
 * susceptible d'évoluer, hormis core/prng.ts lui-même figé). Verrouillé par freeze.test.ts.
 */

export const V1_MIN_SIZE = 4;
export const V1_MAX_SIZE = 14;

/** Cases (mêmes valeurs que binairo/types.ts). */
export const EMPTY = 0;
export const SYM_A = 1;
export const SYM_B = 2;

/** Nombre de bits à 1 d'un entier 32 bits. */
export function popcount32(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return Math.imul(v, 0x01010101) >>> 24;
}

/** Index du bit à 1 le plus faible (x ≠ 0). */
export function ctz32(x: number): number {
  return 31 - Math.clz32(x & -x);
}

const PATTERNS: Int32Array[] = [];

/**
 * Lignes valides de longueur n (règles 1 et 2), ordre numérique croissant.
 * Masque : bit i à 1 ⇔ symbole A en position i (colonne d'une rangée, rangée d'une colonne).
 */
export function linePatterns(n: number): Int32Array {
  const cached = PATTERNS[n];
  if (cached) return cached;
  if (!Number.isInteger(n) || n < 2 || n > V1_MAX_SIZE || n % 2 !== 0) throw new RangeError(`Binairo V1 : taille invalide ${n}`);
  const full = (1 << n) - 1;
  const out: number[] = [];
  for (let m = 0; m <= full; m++) {
    const z = full & ~m;
    if (popcount32(m) === n >> 1 && (m & (m >>> 1) & (m >>> 2)) === 0 && (z & (z >>> 1) & (z >>> 2)) === 0) out.push(m);
  }
  const res = Int32Array.from(out);
  PATTERNS[n] = res;
  return res;
}

/** Cases (0, 1, 2) → chaîne de chiffres. */
export function encodeCells(values: readonly number[]): string {
  let out = '';
  for (const v of values) {
    if (v !== EMPTY && v !== SYM_A && v !== SYM_B) throw new RangeError(`Binairo V1 : valeur invalide ${v}`);
    out += String(v);
  }
  return out;
}

/** Chaîne de chiffres 0, 1, 2 → cases. */
export function decodeCells(code: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < code.length; i++) {
    const v = code.charCodeAt(i) - 48;
    if (v !== EMPTY && v !== SYM_A && v !== SYM_B) throw new RangeError(`Binairo V1 : caractère invalide "${code[i]}"`);
    out.push(v);
  }
  return out;
}
