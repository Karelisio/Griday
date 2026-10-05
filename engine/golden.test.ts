/**
 * GEL DES PUZZLES PUBLIÉS. Ces empreintes ne doivent JAMAIS changer pour une version publiée :
 * un échec ici signifie que des puzzles déjà joués seraient modifiés. Corriger le code, pas les valeurs.
 * (Nouvelle version de générateur = nouvelles dates ⇒ nouvelles empreintes ajoutées, jamais remplacées.)
 */
import { describe, expect, it } from 'vitest';
import { addDays } from './core/date';
import { fingerprintPuzzle } from './core/pipeline';
import { hashHex } from './core/prng';
import { GOLDEN_DATES, GOLDEN_DIGEST_DAYS, GOLDEN_DIGEST_START } from './golden-dates';
import { getDailyPuzzle, REGISTRY } from './index';
import { engineSelfCheck } from './selfcheck';

const GOLDEN: Readonly<Record<string, string>> = {
  '2026-10-05': 'a4c2ae829a11fa7597b325edb2245331',
  '2026-10-06': '83990f07c630af445f401c2e84f4cfec',
  '2026-10-07': 'f28a0da8bec15351532145e47d3f31cf',
  '2026-10-08': '4067a55dddef351b7ffd95b31218e4e7',
  '2026-10-09': '84bd4fe277fccdf55f58c729a5a11fb4',
  '2026-10-10': 'd97449f29d79257bb10d218aa6d7d502',
  '2026-10-11': 'f90ab7aa0247a391db8e6758bfab98d0',
  '2026-10-12': '1ae29d10d8d90b42597aff791f54eceb',
  '2026-10-13': 'de77a8cab77f741c14486d2db423b68d',
  '2026-10-14': 'e49ef890b8fa244fe21ad7ae8565f80d',
  '2026-10-15': 'e6fafb07e99d3cf753b07e2596c943c2',
  '2026-10-16': '8c57eb227bdb8838e429456974da815b',
  '2026-10-17': '2408315763a6bde238c06369a29944f0',
  '2026-10-18': 'e9aa06347f8f6488766b029c11ddb8a1',
  '2027-01-01': '326b204e25dabd7b29e87e81f3c0c4a5',
  '2028-02-29': '80d77a937b6deed565b1951a3aea59d5',
  '2029-12-31': '7e1a1ac8b537a26659625214810a1615',
  '2031-07-14': '4dfabd052e639dc662ab76f9a038a6ff',
  '2033-03-27': 'bd74b3ee83a87e204a04673b456a86f9',
  '2036-02-29': '990cc6c4409c85e0bb37158ed15f3bd1',
  '2036-10-04': '9a67596e0125064d813b53e488f08a8f',
};
const GOLDEN_DIGEST = '05820e3102b4ef4e73c49333791a77c7';

const fp = (date: string) => {
  const p = getDailyPuzzle(date);
  return fingerprintPuzzle(REGISTRY[p.type], p);
};

describe('puzzles du jour figés (golden)', () => {
  it('toutes les dates golden sont couvertes', () => {
    expect(Object.keys(GOLDEN)).toEqual([...GOLDEN_DATES]);
  });

  it.each(Object.entries(GOLDEN))('%s', (date, expected) => {
    expect(fp(date)).toBe(expected);
  });

  it(`condensé de ${GOLDEN_DIGEST_DAYS} jours consécutifs`, () => {
    const all: string[] = [];
    for (let i = 0; i < GOLDEN_DIGEST_DAYS; i++) all.push(fp(addDays(GOLDEN_DIGEST_START, i)));
    expect(hashHex(all.join(','))).toBe(GOLDEN_DIGEST);
  });

  it('auto-vérification de démarrage OK', () => {
    expect(engineSelfCheck()).toEqual([]);
  });
});
