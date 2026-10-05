import { BINAIRO_MAX_SIZE, BINAIRO_MIN_SIZE, CELL_A, CELL_B, CELL_EMPTY, type BinairoCell, type BinairoPuzzle } from './types';

/** Cases (0, 1, 2) → un chiffre par case, ligne par ligne. */
export function encodeBinairoCells(values: readonly number[]): string {
  let out = '';
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== CELL_EMPTY && v !== CELL_A && v !== CELL_B) throw new RangeError(`encodeBinairo: valeur invalide ${String(v)} (case ${i})`);
    out += String(v);
  }
  return out;
}

/** Données du puzzle : un chiffre par case (0 = vide, 1 = A, 2 = B), ligne par ligne. FORMAT FIGÉ. */
export function encodeBinairo(p: BinairoPuzzle): string {
  return encodeBinairoCells(p.givens);
}

export function decodeBinairo(code: string): BinairoPuzzle {
  const size = Math.round(Math.sqrt(code.length));
  if (size * size !== code.length) throw new Error(`Code Binairo invalide (longueur ${code.length})`);
  const givens = Array.from(code, (ch) => {
    const v = ch.charCodeAt(0) - 48;
    if (v !== CELL_EMPTY && v !== CELL_A && v !== CELL_B) throw new Error(`Code Binairo invalide (caractère "${ch}")`);
    return v as BinairoCell;
  });
  const p = { size, givens };
  const errors = validateBinairoStructure(p);
  if (errors.length > 0) throw new Error(`Code Binairo invalide : ${errors.join('; ')}`);
  return p;
}

/** Vérifie la structure : taille paire dans les limites, n² cases valant 0, 1 ou 2. */
export function validateBinairoStructure(p: BinairoPuzzle): string[] {
  const n = p.size;
  if (!Number.isInteger(n) || n < BINAIRO_MIN_SIZE || n > BINAIRO_MAX_SIZE) return [`taille hors limites : ${n}`];
  if (n % 2 !== 0) return [`taille impaire : ${n}`];
  if (p.givens.length !== n * n) return [`longueur ${p.givens.length} ≠ ${n * n}`];
  for (let i = 0; i < p.givens.length; i++) {
    const v = p.givens[i];
    if (v !== CELL_EMPTY && v !== CELL_A && v !== CELL_B) return [`case ${i} invalide : ${String(v)}`];
  }
  return [];
}
