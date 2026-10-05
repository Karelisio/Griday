import { describe, expect, it } from 'vitest';
import { rngFromString } from '../core/prng';
import { decodeBinairo, encodeBinairo, encodeBinairoCells, validateBinairoStructure } from './encoding';
import { BINAIRO_DEFINITION } from './index';
import { randomBinairoPuzzle, randomUniqueBinairo } from './testing';
import { BINAIRO_MAX_SIZE, BINAIRO_MIN_SIZE, type BinairoCell, type BinairoPuzzle } from './types';

const blank = (n: number): BinairoCell[] => new Array<BinairoCell>(n * n).fill(0);

describe('encodeBinairo / decodeBinairo', () => {
  it('limites de taille du contrat', () => {
    expect(BINAIRO_MIN_SIZE).toBe(4);
    expect(BINAIRO_MAX_SIZE).toBe(14);
  });

  it('codes figés : un chiffre par case, ligne par ligne (0 vide, 1 = A, 2 = B)', () => {
    const p: BinairoPuzzle = { size: 4, givens: [1, 0, 0, 2, 0, 2, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1] };
    expect(encodeBinairo(p)).toBe('1002020000102001');
    expect(decodeBinairo('1002020000102001')).toEqual(p);
    expect(encodeBinairo({ size: 4, givens: blank(4) })).toBe('0'.repeat(16));
    expect(encodeBinairoCells([1, 2, 2, 1])).toBe('1221');
    expect(encodeBinairoCells([])).toBe('');
  });

  it('aller-retour sur des grilles aléatoires de toutes les tailles', () => {
    for (let n = BINAIRO_MIN_SIZE; n <= BINAIRO_MAX_SIZE; n += 2) {
      const rng = rngFromString(`encodage:${n}`);
      for (let i = 0; i < 8; i++) {
        const p = randomBinairoPuzzle(rng, n, 1 + rng.int(7), 8);
        const code = encodeBinairo(p);
        expect(code).toHaveLength(n * n);
        expect(code).toMatch(/^[012]+$/);
        expect(decodeBinairo(code)).toEqual({ size: n, givens: p.givens });
        expect(encodeBinairo(decodeBinairo(code))).toBe(code);
        expect(encodeBinairoCells(p.solution)).toMatch(/^[12]+$/);
      }
    }
    const unique = randomUniqueBinairo(rngFromString('encodage:unique'), 10);
    expect(decodeBinairo(encodeBinairo(unique))).toEqual({ size: 10, givens: unique.givens });
  });

  it('encodage de la définition : données / solution (FORMAT FIGÉ)', () => {
    const p = { size: 4, givens: [1, 0, 0, 2, 0, 2, 0, 0, 0, 0, 1, 0, 2, 0, 0, 1] as BinairoCell[], solution: [1, 1, 2, 2, 1, 2, 2, 1, 2, 1, 1, 2, 2, 2, 1, 1] as (1 | 2)[] };
    expect(BINAIRO_DEFINITION.encode(p)).toBe('1002020000102001/1122122121122211');
  });

  it('valeurs invalides à l’encodage → RangeError', () => {
    for (const bad of [3, -1, 1.5, Number.NaN, '1']) {
      const givens = blank(4) as unknown[];
      givens[7] = bad;
      expect(() => encodeBinairo({ size: 4, givens: givens as BinairoCell[] }), String(bad)).toThrow(RangeError);
    }
  });

  it.each([
    ['vide', '', /taille hors limites : 0/],
    ['longueur non carrée', '012', /longueur 3/],
    ['taille 2', '0000', /taille hors limites : 2/],
    ['taille impaire 5', '0'.repeat(25), /taille impaire : 5/],
    ['taille 16', '0'.repeat(256), /taille hors limites : 16/],
    ['chiffre 3', `3${'0'.repeat(15)}`, /caractère "3"/],
    ['lettre', `000A${'1'.repeat(12)}`, /caractère "A"/],
    ['espace', `0120 ${'0'.repeat(11)}`, /caractère " "/],
    ['signe', `-1${'0'.repeat(14)}`, /caractère "-"/],
  ])('rejette : %s', (_label, code, message) => {
    expect(() => decodeBinairo(code)).toThrow(message);
  });
});

describe('validateBinairoStructure', () => {
  it('grilles valides (vides, pleines, partielles)', () => {
    for (let n = BINAIRO_MIN_SIZE; n <= BINAIRO_MAX_SIZE; n += 2) {
      expect(validateBinairoStructure({ size: n, givens: blank(n) })).toEqual([]);
      const p = randomBinairoPuzzle(rngFromString(`structure:${n}`), n, 1, 2);
      expect(validateBinairoStructure(p)).toEqual([]);
      expect(validateBinairoStructure({ size: n, givens: p.solution })).toEqual([]);
    }
  });

  it('tailles invalides', () => {
    for (const size of [0, 2, 16, 4.5, Number.NaN, -4]) {
      expect(validateBinairoStructure({ size, givens: [] }), String(size)).toEqual([`taille hors limites : ${size}`]);
    }
    for (const size of [5, 7, 9, 11, 13]) {
      expect(validateBinairoStructure({ size, givens: new Array<BinairoCell>(size * size).fill(0) })).toEqual([`taille impaire : ${size}`]);
    }
  });

  it('longueur incohérente', () => {
    expect(validateBinairoStructure({ size: 4, givens: new Array<BinairoCell>(15).fill(0) })).toEqual(['longueur 15 ≠ 16']);
    expect(validateBinairoStructure({ size: 6, givens: new Array<BinairoCell>(37).fill(0) })).toEqual(['longueur 37 ≠ 36']);
  });

  it('valeurs hors domaine (arrêt à la première)', () => {
    for (const bad of [3, -1, 1.5, Number.NaN]) {
      const givens = blank(4) as number[];
      givens[9] = bad;
      expect(validateBinairoStructure({ size: 4, givens: givens as BinairoCell[] }), String(bad)).toEqual([`case 9 invalide : ${bad}`]);
    }
  });
});
