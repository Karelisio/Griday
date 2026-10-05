import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { addDays } from './date';
import { cyrb128, hashHex, rngFromString, Sfc32, type Rng, type Seed128 } from './prng';

/*
 * GARDE-FOUS DE GEL DU PRNG.
 * Vecteurs calculés une fois puis figés, recoupés avec une implémentation Python
 * indépendante (masques uint32, unités UTF-16) et avec la référence BigInt ci-dessous.
 * Un échec ici = TOUS les puzzles publiés (quotidiens + archives) changent sur tous les appareils.
 * Ne JAMAIS « mettre à jour » ces valeurs : corriger le code à la place.
 */

// [chaîne, cyrb128, hashHex] — chaînes non ASCII écrites en échappements (indépendant de l'encodage du fichier).
const GOLDEN_HASHES: readonly [string, Seed128, string][] = [
  ['', [41608494, 3485963809, 1435736333, 1262568316], '027ae52ecfc796215593990d4b41437c'],
  ['a', [1589175524, 148824423, 2405369273, 1476957317], '5eb8e4e408dee1678f5f05b958089485'],
  ['Griday', [2480575625, 983204354, 2145872894, 1501877657], '93da94893a9a82027fe76bfe5984d599'],
  ['2026-10-05:queens:v1', [4253865251, 1663883342, 1224073129, 3827231205], 'fd8cd523632cd84e48f5dfa9e41ee9e5'],
  ['2026-10-05:queens:v1#0', [1888571600, 1206019718, 3243912728, 185914415], '709150d047e26686c15a2e180b14d42f'],
  ['2026-10-05:queens:v1#1', [3904625319, 1774100602, 3456562895, 2673464586], 'e8bbdaa769bea07ace06f6cf9f59d50a'],
  // é précomposé (NFC) puis décomposé (NFD) : hash différent → les graines doivent rester ASCII.
  ['\u00e9', [1621247514, 3528421196, 473986565, 5574360], '60a2461ad24f6f4c1c40760500550ed8'],
  ['e\u0301', [1558618666, 691707880, 1552096913, 4054777447], '5ce6a22a293a9fe85c831e91f1aefe67'],
  // Latin-1, tiret cadratin, CJK, emoji (paire de substituts).
  ['Gr\u00efd\u00e4y \u2014 \u65e5\u672c\u8a9e \ud83d\ude00', [3578155697, 2550568762, 1282858804, 3590840851], 'd54652b19806973a4c76df34d607e213'],
  // Substitut isolé : hashé tel quel (unités UTF-16, aucune normalisation).
  ['\ud800', [3550877959, 4192461366, 3666210956, 2309501018], 'd3a61907f9e3e236da85f08c89a8305a'],
];

// 10 premiers nextU32 (après les 15 tours de chauffe).
const GOLDEN_U32: readonly [string, number[]][] = [
  ['', [2420727049, 3315390910, 31621017, 4095259433, 4180064351, 2911900625, 2048170805, 1255559921, 37096647, 3933766783]],
  ['griday', [1171315048, 2646993962, 971861685, 1405093798, 3481103669, 3206093063, 2118895526, 2116343413, 1747131452, 3300241847]],
  ['2026-10-05:queens:v1#0', [354294629, 2804433776, 2530018231, 1986444589, 339692231, 962166053, 2669209624, 2220174804, 20103720, 4110556024]],
  ['2026-10-05:queens:v1#1', [1434325492, 902535485, 3854130922, 1616531560, 854399662, 1083662753, 462066338, 3032122493, 276845192, 490231885]],
  ['9999-12-31:queens:v1#41', [4274433693, 3098923520, 3918384780, 2329034457, 1451002244, 1861810431, 157309286, 1252727768, 469434906, 1956776615]],
];

// Un seul flux 'golden:int', 6 tirages par borne, dans cet ordre (le rejet consomme des tirages).
const GOLDEN_INT: readonly [number, number[]][] = [
  [1, [0, 0, 0, 0, 0, 0]],
  [2, [0, 1, 0, 0, 0, 1]],
  [3, [1, 0, 2, 1, 0, 1]],
  [6, [2, 1, 4, 0, 1, 2]],
  [7, [5, 5, 6, 4, 1, 1]],
  [10, [7, 7, 7, 1, 0, 7]],
  [1000, [422, 682, 494, 856, 26, 749]],
  [2 ** 31 + 1, [1107095308, 1376731286, 1413283376, 1399521338, 1662151474, 1671404518]],
  [3 * 2 ** 30, [1321318364, 2304702864, 2269852387, 439515626, 1472627907, 1064191340]],
  [2 ** 32 - 1, [2549606330, 3753192583, 3742548903, 1825961725, 10177060, 1492970101]],
  [2 ** 32, [3634389983, 1494566332, 947124160, 3858018183, 3944322356, 399338693]],
];

const GOLDEN_RANGE: readonly [number, number, number[]][] = [
  [-5, 5, [5, 3, 5, 2, -4, -5]],
  [0, 0, [0, 0, 0, 0, 0, 0]],
  [1, 6, [5, 4, 3, 2, 2, 2]],
  [-2147483648, 2147483647, [-771460614, 1643334479, 1607202427, 1146148606, -12163140, 367970646]],
  [100, 1100, [1093, 949, 518, 237, 521, 1100]],
];

const GOLDEN_CHANCE: readonly [number, number, string][] = [
  [1, 2, '000101001011'],
  [1, 3, '011001001010'],
  [0, 5, '000000000000'],
  [5, 5, '111111111111'],
  [999, 1000, '111111111111'],
];

const PICK_ITEMS = ['queens', 'binairo', 'nonogram', 'sudoku', 'kakuro'] as const;
const GOLDEN_PICK = ['binairo', 'nonogram', 'kakuro', 'kakuro', 'kakuro', 'nonogram', 'sudoku', 'sudoku', 'sudoku', 'binairo', 'queens', 'binairo'];

describe('PRNG — vecteurs figés (NE PAS MODIFIER)', () => {
  it('cyrb128 / hashHex', () => {
    for (const [str, words, hex] of GOLDEN_HASHES) {
      expect(cyrb128(str), JSON.stringify(str)).toEqual(words);
      expect(hashHex(str), JSON.stringify(str)).toBe(hex);
    }
  });

  it('nextU32 : 10 premières sorties', () => {
    for (const [seed, outputs] of GOLDEN_U32) {
      const rng = rngFromString(seed);
      expect(Array.from({ length: 10 }, () => rng.nextU32()), seed).toEqual(outputs);
    }
  });

  it('int (y compris rejet, n = 1 et n = 2^32)', () => {
    const rng = rngFromString('golden:int');
    for (const [n, outputs] of GOLDEN_INT) {
      expect(Array.from({ length: 6 }, () => rng.int(n)), `n=${n}`).toEqual(outputs);
    }
  });

  it('range', () => {
    const rng = rngFromString('golden:range');
    for (const [min, max, outputs] of GOLDEN_RANGE) {
      expect(Array.from({ length: 6 }, () => rng.range(min, max)), `[${min}, ${max}]`).toEqual(outputs);
    }
  });

  it('chance', () => {
    const rng = rngFromString('golden:chance');
    for (const [num, den, bits] of GOLDEN_CHANCE) {
      const got = Array.from({ length: 12 }, () => (rng.chance(num, den) ? '1' : '0')).join('');
      expect(got, `${num}/${den}`).toBe(bits);
    }
  });

  it('pick', () => {
    const rng = rngFromString('golden:pick');
    expect(Array.from({ length: 12 }, () => rng.pick(PICK_ITEMS))).toEqual(GOLDEN_PICK);
  });

  it('shuffle (+ état final du flux)', () => {
    const rng = rngFromString('golden:shuffle');
    expect(rng.shuffle(Array.from({ length: 10 }, (_, i) => i))).toEqual([6, 3, 5, 7, 1, 4, 8, 0, 9, 2]);
    expect(rng.shuffle(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual(['b', 'e', 'd', 'g', 'f', 'c', 'a']);
    expect(rng.shuffle(Array.from({ length: 12 }, (_, i) => i))).toEqual([0, 9, 7, 1, 4, 10, 8, 6, 11, 2, 5, 3]);
    // Nombre exact de tirages consommés par les mélanges.
    expect(rng.nextU32()).toBe(178495202);
  });

  it('Sfc32 construit depuis cyrb128 ≡ rngFromString', () => {
    const a = new Sfc32(cyrb128('griday'));
    const b = rngFromString('griday');
    for (let i = 0; i < 50; i++) expect(a.nextU32()).toBe(b.nextU32());
  });
});

// --- Référence indépendante (BigInt, aucune astuce int32) pour tests différentiels -------------
const M32 = 0xffffffffn;
const mul32 = (a: bigint, b: bigint): bigint => (a * b) & M32;

function refCyrb128(str: string): bigint[] {
  let h1 = 1779033703n;
  let h2 = 3144134277n;
  let h3 = 1013904242n;
  let h4 = 2773480762n;
  for (let i = 0; i < str.length; i++) {
    const k = BigInt(str.charCodeAt(i));
    h1 = h2 ^ mul32(h1 ^ k, 597399067n);
    h2 = h3 ^ mul32(h2 ^ k, 2869860233n);
    h3 = h4 ^ mul32(h3 ^ k, 951274213n);
    h4 = h1 ^ mul32(h4 ^ k, 2716044179n);
  }
  h1 = mul32(h3 ^ (h1 >> 18n), 597399067n);
  h2 = mul32(h4 ^ (h2 >> 22n), 2869860233n);
  h3 = mul32(h1 ^ (h3 >> 17n), 951274213n);
  h4 = mul32(h2 ^ (h4 >> 19n), 2716044179n);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1, h2, h3, h4];
}

class RefSfc32 {
  private s: bigint[];
  constructor(seed: bigint[]) {
    this.s = [...seed];
    for (let i = 0; i < 15; i++) this.next();
  }
  next(): bigint {
    const [a, b, c, d] = this.s as [bigint, bigint, bigint, bigint];
    const t = (a + b + d) & M32;
    const c2 = (((c << 21n) | (c >> 11n)) & M32) + t;
    this.s = [b ^ (b >> 9n), (c + (c << 3n)) & M32, c2 & M32, (d + 1n) & M32];
    return t;
  }
  int(n: number): number {
    const bn = BigInt(n);
    const limit = (1n << 32n) - ((1n << 32n) % bn);
    let x = this.next();
    while (x >= limit) x = this.next();
    return Number(x % bn);
  }
}

describe('PRNG — conformité à la référence BigInt', () => {
  it('cyrb128 + sfc32 + int identiques sur 300 chaînes aléatoires (UTF-16 arbitraire)', () => {
    const gen = rngFromString('differentiel');
    const pools = [
      () => 32 + gen.int(95), // ASCII imprimable
      () => gen.int(256), // Latin-1 + contrôles
      () => gen.int(0x10000), // BMP entier, substituts isolés compris
      () => 0xd800 + gen.int(0x800), // substituts uniquement
    ];
    for (let i = 0; i < 300; i++) {
      const pool = pools[i % pools.length]!;
      const len = gen.int(48);
      const str = String.fromCharCode(...Array.from({ length: len }, pool));
      const words = cyrb128(str);
      expect(words.map(BigInt), JSON.stringify(str)).toEqual(refCyrb128(str));
      const rng = rngFromString(str);
      const ref = new RefSfc32(refCyrb128(str));
      for (let j = 0; j < 16; j++) expect(BigInt(rng.nextU32())).toBe(ref.next());
      for (let j = 0; j < 8; j++) {
        const n = j % 2 === 0 ? 1 + gen.int(100) : 2 ** 31 + gen.int(2 ** 31) + 1;
        expect(rng.int(n)).toBe(ref.int(n));
      }
    }
  });
});

// --- Propriétés -------------------------------------------------------------------------------

/** Quantile approché du χ² (Wilson–Hilferty) pour `df` degrés de liberté et un score z. */
function chi2Quantile(df: number, z: number): number {
  const a = 2 / (9 * df);
  return df * (1 - a + z * Math.sqrt(a)) ** 3;
}

/** χ² d'adéquation à l'uniforme, calculé à partir des effectifs entiers. */
function chi2Uniform(counts: readonly number[]): number {
  const k = counts.length;
  const total = counts.reduce((s, c) => s + c, 0);
  let num = 0;
  for (const c of counts) num += (k * c - total) ** 2; // entiers exacts (< 2^53)
  return num / (k * total);
}

describe('PRNG — bornes et uniformité de int(n)', () => {
  it('int(n) ∈ [0, n) et entier, pour des bornes variées', () => {
    const rng = rngFromString('bornes');
    const ns = [1, 2, 3, 5, 7, 12, 144, 65537, 2 ** 31 - 1, 2 ** 31, 2 ** 31 + 1, 3 * 2 ** 30, 2 ** 32 - 1, 2 ** 32];
    for (const n of ns) {
      let bad = 0;
      for (let i = 0; i < 3000; i++) {
        const v = rng.int(n);
        if (!Number.isInteger(v) || v < 0 || v >= n) bad++;
      }
      expect(bad, `n=${n}`).toBe(0);
    }
  });

  // Graines fixes : le test est déterministe (seuils z = ±4,5, très larges).
  it.each([
    [2, 40_000],
    [3, 60_000],
    [6, 60_000],
    [7, 70_000],
    [10, 100_000],
    [1000, 200_000],
  ])('χ² uniforme pour n = %i (%i tirages)', (n, draws) => {
    const rng = rngFromString(`uniformite:${n}`);
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < draws; i++) counts[rng.int(n)]!++;
    const stat = chi2Uniform(counts);
    expect(stat).toBeLessThan(chi2Quantile(n - 1, 4.5));
    // Trop parfait = suspect (ex. compteur) ; borne basse pertinente seulement pour df assez grand.
    if (n - 1 >= 9) expect(stat).toBeGreaterThan(chi2Quantile(n - 1, -4.5));
  });

  it('chacun des 32 bits de nextU32 est équilibré', () => {
    const rng = rngFromString('bits');
    const ones = new Array<number>(32).fill(0);
    const draws = 65_536;
    for (let i = 0; i < draws; i++) {
      const x = rng.nextU32();
      for (let b = 0; b < 32; b++) ones[b]! += (x >>> b) & 1;
    }
    for (let b = 0; b < 32; b++) expect(Math.abs(ones[b]! - draws / 2), `bit ${b}`).toBeLessThan(4.5 * 128);
  });
});

describe('PRNG — cas limites et sémantique de composition (figée)', () => {
  const twins = (seed: string): [Sfc32, Sfc32] => [rngFromString(seed), rngFromString(seed)];

  it('int(1) renvoie 0 mais consomme exactement un tirage', () => {
    const [a, b] = twins('n=1');
    for (let i = 0; i < 100; i++) {
      expect(a.int(1)).toBe(0);
      b.nextU32();
    }
    expect(a.nextU32()).toBe(b.nextU32());
  });

  it('int(2^32) ≡ nextU32 (aucun rejet)', () => {
    const [a, b] = twins('n=2^32');
    for (let i = 0; i < 1000; i++) expect(a.int(2 ** 32)).toBe(b.nextU32());
  });

  it('rejet exact : int(2^31 + 1) rejette x ≥ 2^31 + 1 puis renvoie x mod n', () => {
    const [a, b] = twins('rejet');
    const n = 2 ** 31 + 1;
    const limit = 2 ** 32 - (2 ** 32 % n);
    expect(limit).toBe(2 ** 31 + 1);
    let rejected = 0;
    for (let i = 0; i < 2000; i++) {
      let x = b.nextU32();
      while (x >= limit) {
        rejected++;
        x = b.nextU32();
      }
      expect(a.int(n)).toBe(x % n);
    }
    expect(rejected).toBeGreaterThan(800); // ≈ 50 % de rejets attendus
    expect(a.nextU32()).toBe(b.nextU32());
  });

  it('range / chance / pick se ramènent exactement à int', () => {
    const [a, b] = twins('composition');
    for (let i = 0; i < 300; i++) {
      expect(a.range(-7, 12)).toBe(-7 + b.int(20));
      expect(a.chance(3, 8)).toBe(b.int(8) < 3);
      expect(a.chance(0, 4)).toBe(false); // consomme quand même un tirage
      b.int(4);
      expect(a.chance(4, 4)).toBe(true);
      b.int(4);
      expect(a.pick(PICK_ITEMS)).toBe(PICK_ITEMS[b.int(PICK_ITEMS.length)]);
    }
    expect(a.nextU32()).toBe(b.nextU32());
  });

  it('arguments invalides : RangeError sans consommer de tirage', () => {
    const [a, b] = twins('invalides');
    const calls: [string, (r: Rng) => unknown][] = [
      ['int(0)', (r) => r.int(0)],
      ['int(-1)', (r) => r.int(-1)],
      ['int(1.5)', (r) => r.int(1.5)],
      ['int(NaN)', (r) => r.int(Number.NaN)],
      ['int(Infinity)', (r) => r.int(Number.POSITIVE_INFINITY)],
      ['int(2^32 + 1)', (r) => r.int(2 ** 32 + 1)],
      ['int("3")', (r) => r.int('3' as unknown as number)],
      ['range(5, 4)', (r) => r.range(5, 4)],
      ['range(0.5, 2)', (r) => r.range(0.5, 2)],
      ['range(0, NaN)', (r) => r.range(0, Number.NaN)],
      ['range(0, 2^32)', (r) => r.range(0, 2 ** 32)],
      ['chance(-1, 2)', (r) => r.chance(-1, 2)],
      ['chance(3, 2)', (r) => r.chance(3, 2)],
      ['chance(1, 0)', (r) => r.chance(1, 0)],
      ['chance(0.5, 1)', (r) => r.chance(0.5, 1)],
      ['chance(1, 1.5)', (r) => r.chance(1, 1.5)],
      ['pick([])', (r) => r.pick([])],
    ];
    for (const [label, call] of calls) expect(() => call(a), label).toThrow(RangeError);
    expect(a.nextU32()).toBe(b.nextU32());
  });

  it('shuffle : permutation en place, déterministe ; longueurs 0 et 1 sans tirage', () => {
    for (const len of [0, 1, 2, 3, 10, 100]) {
      const identity = Array.from({ length: len }, (_, i) => i);
      const arr = [...identity];
      const out = rngFromString(`shuffle:${len}`).shuffle(arr);
      expect(out).toBe(arr);
      expect([...out].sort((x, y) => x - y)).toEqual(identity);
      expect(rngFromString(`shuffle:${len}`).shuffle([...identity])).toEqual(out);
    }
    const [a, b] = twins('shuffle-vide');
    a.shuffle([]);
    a.shuffle(['seul']);
    expect(a.nextU32()).toBe(b.nextU32());
  });

  it('shuffle uniforme sur les 6 permutations de 3 éléments', () => {
    const rng = rngFromString('shuffle-uniforme');
    const index = new Map<string, number>();
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 60_000; i++) {
      const key = rng.shuffle([0, 1, 2]).join('');
      if (!index.has(key)) index.set(key, index.size);
      counts[index.get(key)!]!++;
    }
    expect(index.size).toBe(6);
    expect(chi2Uniform(counts)).toBeLessThan(chi2Quantile(5, 4.5));
  });
});

describe('PRNG — indépendance des graines', () => {
  it('graines distinctes → hash et débuts de flux distincts', () => {
    const hashes = new Set<string>();
    const starts = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      const seed = `seed:${i}`;
      hashes.add(hashHex(seed));
      const rng = rngFromString(seed);
      starts.add(`${rng.nextU32()}:${rng.nextU32()}`);
    }
    expect(hashes.size).toBe(20_000);
    expect(starts.size).toBe(20_000);
  });

  it('avalanche : changer le dernier caractère inverse ≈ 64 bits sur 128', () => {
    let total = 0;
    const pairs = 2000;
    const popcount = (x: number): number => {
      let c = 0;
      for (let v = x >>> 0; v !== 0; v >>>= 1) c += v & 1;
      return c;
    };
    for (let i = 0; i < pairs; i++) {
      const a = cyrb128(`2026-10-05:queens:v1#${i}`);
      const b = cyrb128(`2026-10-05:queens:v1#${i + 1}`);
      for (let w = 0; w < 4; w++) total += popcount(a[w]! ^ b[w]!);
    }
    const mean = total / pairs;
    expect(mean).toBeGreaterThan(62);
    expect(mean).toBeLessThan(66);
  });

  // Sanity : les tentatives « x#0 » / « x#1 » d'une même date, et deux jours consécutifs, sont décorrélés.
  it('tentatives #0/#1 et jours consécutifs : tables de contingence ≈ uniformes', () => {
    const days = 20_000;
    const pairK = new Array<number>(64).fill(0);
    const pairDay = new Array<number>(64).fill(0);
    let prev = -1;
    let sxy = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < days; i++) {
      const base = `${addDays('2026-01-01', i)}:queens:v1`;
      const r0 = rngFromString(`${base}#0`);
      const r1 = rngFromString(`${base}#1`);
      const x = r0.nextU32() / 2 ** 32;
      const y = r1.nextU32() / 2 ** 32;
      sx += x;
      sy += y;
      sxy += x * y;
      sxx += x * x;
      syy += y * y;
      const a = r0.int(8);
      pairK[a * 8 + r1.int(8)]!++;
      if (prev >= 0) pairDay[prev * 8 + a]!++;
      prev = a;
    }
    expect(chi2Uniform(pairK)).toBeLessThan(chi2Quantile(63, 4.5));
    expect(chi2Uniform(pairDay)).toBeLessThan(chi2Quantile(63, 4.5));
    const cov = sxy / days - (sx / days) * (sy / days);
    const corr = cov / Math.sqrt((sxx / days - (sx / days) ** 2) * (syy / days - (sy / days) ** 2));
    expect(Math.abs(corr)).toBeLessThan(4.5 / Math.sqrt(days));
  });
});

// --- Garde-fou statique : aucune source de non-déterminisme dans le moteur -----------------------
describe('Moteur — sources déterministes', () => {
  const engineDir = fileURLToPath(new URL('../', import.meta.url));
  const listSources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return listSources(p);
      return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : [];
    });
  // Commentaires retirés en gardant les sauts de ligne (approximation suffisante : pas d'URL dans le moteur).
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/\/\/[^\n]*/g, '');

  const RULES: [string, RegExp, readonly string[]][] = [
    ['Math.random', /\bMath\.random\b/, []],
    // Fonctions « implementation-approximated » (ECMA-262) : résultats variables selon le moteur.
    [
      'Math transcendant',
      /\bMath\.(exp|expm1|log|log1p|log2|log10|pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|cbrt|hypot)\b/,
      [],
    ],
    ['locale / Intl', /\b(toLocaleString|toLocaleDateString|toLocaleTimeString|toLocaleUpperCase|toLocaleLowerCase|localeCompare)\b|\bIntl\./, []],
    // Horloge : seule l'horloge par défaut du filet temps réel (pipeline) est tolérée.
    ['horloge', /\bnew Date\b|\bDate\.now\b|\bperformance\.now\b/, ['core/pipeline.ts']],
  ];

  it('pas de Math.random, de flottant transcendant, de locale ni d’horloge hors pipeline', () => {
    const files = listSources(engineDir);
    expect(files.length).toBeGreaterThan(5);
    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(engineDir, file).split('\\').join('/');
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
      for (const [label, re, allowed] of RULES) {
        if (allowed.includes(rel)) continue;
        lines.forEach((line, i) => {
          if (re.test(line)) violations.push(`${rel}:${i + 1} [${label}] ${line.trim()}`);
        });
      }
    }
    expect(violations).toEqual([]);
  });
});
