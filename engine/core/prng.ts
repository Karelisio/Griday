/**
 * PRNG déterministe — FIGÉ POUR TOUJOURS.
 *
 * Toute modification de ce fichier change les puzzles déjà publiés.
 * Les vecteurs de référence dans prng.test.ts doivent rester identiques.
 *
 * - Hash de chaîne : cyrb128 (4 × uint32), opérations entières 32 bits (Math.imul, >>>).
 * - Générateur : sfc32 (Small Fast Counter), sorties uint32.
 * - Tirages bornés par rejet (aucun flottant, aucun biais de modulo).
 * Math.random n'est jamais utilisé dans le moteur.
 */

export type Seed128 = readonly [number, number, number, number];

/** Hash 128 bits d'une chaîne (unités UTF-16). Résultat identique sur tout moteur JS conforme. */
export function cyrb128(str: string): Seed128 {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Empreinte hexadécimale (32 caractères) d'une chaîne — utile pour les tests « golden ». */
export function hashHex(str: string): string {
  return cyrb128(str)
    .map((h) => h.toString(16).padStart(8, '0'))
    .join('');
}

/** Interface de tirage utilisée par tous les générateurs. */
export interface Rng {
  /** Entier uniforme dans [0, 2^32). */
  nextU32(): number;
  /** Entier uniforme dans [0, n), 1 ≤ n ≤ 2^32. */
  int(n: number): number;
  /** Entier uniforme dans [min, max] (bornes incluses). */
  range(min: number, max: number): number;
  /** Vrai avec probabilité num/den (entiers, 0 ≤ num ≤ den, den ≥ 1). */
  chance(num: number, den: number): boolean;
  /** Élément uniforme d'un tableau non vide. */
  pick<T>(items: readonly T[]): T;
  /** Mélange de Fisher–Yates en place ; renvoie le même tableau. */
  shuffle<T>(items: T[]): T[];
}

const TWO_POW_32 = 0x100000000;
const WARMUP_ROUNDS = 15;

/** sfc32 — état 128 bits, période ≥ 2^32, entièrement en arithmétique entière 32 bits. */
export class Sfc32 implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: Seed128) {
    this.a = seed[0] | 0;
    this.b = seed[1] | 0;
    this.c = seed[2] | 0;
    this.d = seed[3] | 0;
    for (let i = 0; i < WARMUP_ROUNDS; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  int(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > TWO_POW_32) {
      throw new RangeError(`Rng.int: borne invalide ${n}`);
    }
    // Plus grand multiple de n ≤ 2^32 : les tirages au-delà sont rejetés (pas de biais).
    const limit = TWO_POW_32 - (TWO_POW_32 % n);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return x % n;
  }

  range(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Rng.range: bornes invalides [${min}, ${max}]`);
    }
    return min + this.int(max - min + 1);
  }

  chance(num: number, den: number): boolean {
    if (!Number.isInteger(num) || !Number.isInteger(den) || den < 1 || num < 0 || num > den) {
      throw new RangeError(`Rng.chance: probabilité invalide ${num}/${den}`);
    }
    return this.int(den) < num;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: tableau vide');
    return items[this.int(items.length)]!;
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }
}

/** Crée un générateur à partir d'une chaîne de graine. */
export function rngFromString(seed: string): Sfc32 {
  return new Sfc32(cyrb128(seed));
}
