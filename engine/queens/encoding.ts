import { QUEENS_MAX_SIZE, QUEENS_MIN_SIZE, type QueensPuzzle } from './types';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

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

/** Chaîne compacte : un caractère par case (0-9a-z), ligne par ligne. */
export function encodeQueens(p: QueensPuzzle): string {
  return p.regions.map((g) => ALPHABET[g]!).join('');
}

export function decodeQueens(code: string): QueensPuzzle {
  const size = Math.round(Math.sqrt(code.length));
  if (size * size !== code.length) throw new Error(`Code Queens invalide (longueur ${code.length})`);
  const regions = Array.from(code, (ch) => {
    const g = ALPHABET.indexOf(ch);
    if (g < 0) throw new Error(`Code Queens invalide (caractère "${ch}")`);
    return g;
  });
  const p = { size, regions };
  const errors = validateQueensStructure(p);
  if (errors.length > 0) throw new Error(`Code Queens invalide : ${errors.join('; ')}`);
  return p;
}

/** Vérifie la structure : taille, n régions non vides, étiquettes canoniques, régions 4-connexes. */
export function validateQueensStructure(p: QueensPuzzle): string[] {
  const errors: string[] = [];
  const n = p.size;
  if (!Number.isInteger(n) || n < QUEENS_MIN_SIZE || n > QUEENS_MAX_SIZE) {
    return [`taille hors limites : ${n}`];
  }
  if (p.regions.length !== n * n) return [`longueur ${p.regions.length} ≠ ${n * n}`];

  const sizes = new Array<number>(n).fill(0);
  for (const g of p.regions) {
    if (!Number.isInteger(g) || g < 0 || g >= n) return [`étiquette de région invalide : ${g}`];
    sizes[g]!++;
  }
  sizes.forEach((s, g) => {
    if (s === 0) errors.push(`région ${g} vide`);
  });

  const canon = canonicalizeRegions(p.regions);
  if (canon.some((g, i) => g !== p.regions[i])) errors.push('étiquettes non canoniques');

  // Connexité 4-voisins de chaque région.
  const seen = new Uint8Array(n * n);
  const visitedRegion = new Uint8Array(n);
  for (let start = 0; start < n * n; start++) {
    const g = p.regions[start]!;
    if (seen[start] || visitedRegion[g]) {
      if (!seen[start] && visitedRegion[g]) errors.push(`région ${g} non connexe`);
      continue;
    }
    visitedRegion[g] = 1;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const cell = stack.pop()!;
      const r = Math.floor(cell / n);
      const c = cell % n;
      const neighbors = [r > 0 ? cell - n : -1, r < n - 1 ? cell + n : -1, c > 0 ? cell - 1 : -1, c < n - 1 ? cell + 1 : -1];
      for (const nb of neighbors) {
        if (nb >= 0 && !seen[nb] && p.regions[nb] === g) {
          seen[nb] = 1;
          stack.push(nb);
        }
      }
    }
  }
  return [...new Set(errors)];
}
