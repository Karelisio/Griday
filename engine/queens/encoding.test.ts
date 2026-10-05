import { describe, expect, it } from 'vitest';
import { rngFromString } from '../core/prng';
import { canonicalizeRegions, decodeQueens, encodeQueens, validateQueensStructure } from './encoding';
import { randomQueensLayout, randomUniqueQueens } from './testing';
import { QUEENS_MAX_SIZE, QUEENS_MIN_SIZE, type QueensPuzzle } from './types';

const stripes = (n: number): QueensPuzzle => ({ size: n, regions: Array.from({ length: n * n }, (_, i) => i % n) });
const grid = (...rows: string[]): QueensPuzzle => ({ size: rows.length, regions: Array.from(rows.join(''), (ch) => parseInt(ch, 36)) });

describe('canonicalizeRegions', () => {
  it('ré-étiquette par ordre de première apparition', () => {
    expect(canonicalizeRegions([3, 3, 1, 0, 1, 7])).toEqual([0, 0, 1, 2, 1, 3]);
    expect(canonicalizeRegions([])).toEqual([]);
    expect(canonicalizeRegions([5])).toEqual([0]);
  });

  it('idempotent et préserve la partition', () => {
    const rng = rngFromString('canon');
    for (let i = 0; i < 200; i++) {
      const raw = Array.from({ length: 36 }, () => rng.int(9) * 7 - 20);
      const canon = canonicalizeRegions(raw);
      expect(canonicalizeRegions(canon)).toEqual(canon);
      let broken = 0;
      for (let a = 0; a < raw.length; a++) {
        for (let b = 0; b < raw.length; b++) if ((canon[a] === canon[b]) !== (raw[a] === raw[b])) broken++;
      }
      expect(broken).toBe(0);
    }
  });
});

describe('encodeQueens / decodeQueens', () => {
  it('codes figés', () => {
    expect(encodeQueens(stripes(4))).toBe('0123012301230123');
    expect(encodeQueens(stripes(12)).slice(0, 12)).toBe('0123456789ab');
    expect(decodeQueens('0001100012000123332234422')).toEqual({
      size: 5,
      regions: [0, 0, 0, 1, 1, 0, 0, 0, 1, 2, 0, 0, 0, 1, 2, 3, 3, 3, 2, 2, 3, 4, 4, 2, 2],
    });
  });

  it('aller-retour sur des grilles aléatoires de toutes les tailles', () => {
    for (let n = QUEENS_MIN_SIZE; n <= QUEENS_MAX_SIZE; n++) {
      const rng = rngFromString(`encodage:${n}`);
      for (let i = 0; i < 10; i++) {
        const p = randomQueensLayout(rng, n);
        const code = encodeQueens(p);
        expect(code).toHaveLength(n * n);
        expect(code).toMatch(/^[0-9a-b]+$/);
        expect(decodeQueens(code)).toEqual({ size: n, regions: p.regions });
        expect(encodeQueens(decodeQueens(code))).toBe(code);
      }
    }
    const unique = randomUniqueQueens(rngFromString('encodage:unique'), 9)!;
    expect(decodeQueens(encodeQueens(unique))).toEqual({ size: 9, regions: unique.regions });
  });

  it.each([
    ['vide', '', /taille hors limites : 0/],
    ['longueur non carrée', '012', /longueur 3/],
    ['taille 3', '000111222', /taille hors limites : 3/],
    ['taille 13', '0'.repeat(169), /taille hors limites : 13/],
    ['majuscule', `000A${'1'.repeat(12)}`, /caractère "A"/],
    ['espace', `0123 ${'0'.repeat(11)}`, /caractère " "/],
    ['étiquette ≥ n', `0123012301230z23`, /étiquette de région invalide : 35/],
    ['non canonique', '1111000022223333', /étiquettes non canoniques/],
    ['non connexe', '0011022132113330', /région 0 non connexe/],
    ['région manquante', '0000000011111111', /région 2 vide; région 3 vide/],
  ])('rejette : %s', (_label, code, message) => {
    expect(() => decodeQueens(code)).toThrow(message);
  });
});

describe('validateQueensStructure', () => {
  it('grilles valides', () => {
    expect(validateQueensStructure(stripes(QUEENS_MIN_SIZE))).toEqual([]);
    expect(validateQueensStructure(stripes(QUEENS_MAX_SIZE))).toEqual([]);
    expect(validateQueensStructure(grid('0011', '0211', '3221', '3331'))).toEqual([]);
  });

  it('tailles invalides', () => {
    for (const size of [0, 3, 13, 4.5, Number.NaN, -4]) {
      expect(validateQueensStructure({ size, regions: [] }), String(size)).toEqual([`taille hors limites : ${size}`]);
    }
  });

  it('longueur incohérente', () => {
    expect(validateQueensStructure({ size: 4, regions: new Array<number>(15).fill(0) })).toEqual(['longueur 15 ≠ 16']);
  });

  it('étiquettes hors domaine (arrêt immédiat)', () => {
    for (const bad of [-1, 4, 1.5, Number.NaN]) {
      const regions = stripes(4).regions.slice();
      regions[9] = bad;
      expect(validateQueensStructure({ size: 4, regions }), String(bad)).toEqual([`étiquette de région invalide : ${bad}`]);
    }
  });

  it('région vide', () => {
    expect(validateQueensStructure(grid('0000', '0000', '1111', '1112'))).toEqual(['région 3 vide']);
  });

  it('étiquettes non canoniques (partition valide par ailleurs)', () => {
    expect(validateQueensStructure(grid('1100', '1100', '2233', '2233'))).toEqual(['étiquettes non canoniques']);
  });

  it('connexité 4-voisins : un contact diagonal ne suffit pas', () => {
    expect(validateQueensStructure(grid('0122', '1022', '3333', '3333'))).toEqual(['région 1 non connexe', 'région 0 non connexe']);
  });

  it('erreur dédoublonnée pour une région en plusieurs morceaux', () => {
    // Région 0 en trois cases isolées, les autres régions connexes.
    expect(validateQueensStructure(grid('0110', '1111', '0223', '2223'))).toEqual(['région 0 non connexe']);
  });

  it('cumule vide + non canonique + non connexe', () => {
    expect(validateQueensStructure(grid('1100', '0000', '2222', '2221'))).toEqual([
      'région 3 vide',
      'étiquettes non canoniques',
      'région 1 non connexe',
    ]);
  });
});
