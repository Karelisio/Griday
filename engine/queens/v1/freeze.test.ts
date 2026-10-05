/**
 * VERROU DE GEL DE QUEENS V1.
 *
 * Ces valeurs ne doivent JAMAIS être modifiées pour faire passer un test : un échec signifie que des
 * puzzles déjà publiés changeraient. Corriger (annuler) la modification du code, ou créer une v2/.
 * Couverture : empreinte des sources figées (toute édition), puzzles du jour (dates fixes + 120 jours),
 * chaque candidat du générateur y compris rejeté (PRNG, notation complète), secours servis.
 * Indépendant du calendrier : reste valable après l'activation d'une V2 ou d'un nouveau type.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  attemptDigests,
  dailyDigestV1,
  dailyFingerprintV1,
  fallbackDigest,
  GOLDEN_DATES,
  GOLDEN_DIGEST_DAYS,
  GOLDEN_DIGEST_START,
  sourceHash,
  V1_FROZEN_FILES,
} from './freeze-data';

const SOURCES: Readonly<Record<(typeof V1_FROZEN_FILES)[number], string>> = {
  'core/prng.ts': '3d4600fee5f768b7f8591279238dbb87',
  'queens/v1/fallbacks.ts': '7d9329a4d305c116392c74803598f333',
  'queens/v1/generator.ts': '0c95a358a3050fefe1a8a8e379048f47',
  'queens/v1/solver.ts': 'b324594039b794079d3c56e011ca30aa',
  'queens/v1/util.ts': 'fbf2cf83dd14380c08fcf8a552fd70a9',
  'queens/v1/version.ts': '31a3168c9ef5c9ae623f90419b51509a',
};

const DAILY: Readonly<Record<string, string>> = {
  '2026-10-05': 'cce86084fc2f956e8d6ff8a3e04ed9e4',
  '2026-10-06': '83990f07c630af445f401c2e84f4cfec',
  '2026-10-07': 'f28a0da8bec15351532145e47d3f31cf',
  '2026-10-08': '4067a55dddef351b7ffd95b31218e4e7',
  '2026-10-09': '84bd4fe277fccdf55f58c729a5a11fb4',
  '2026-10-10': '4a41b2cdf842542b5612bb295bd9848f',
  '2026-10-11': '7280388483e999d0d3973e9a38c6fb6c',
  '2026-10-12': '1ae29d10d8d90b42597aff791f54eceb',
  '2026-10-13': 'c78a4863ab89a68eaed3fce37e7f4625',
  '2026-10-14': 'e49ef890b8fa244fe21ad7ae8565f80d',
  '2026-10-15': 'e4ac744ebae2c9fb84d769df3d760257',
  '2026-10-16': 'd4cfb2ed3b7737813879bdaa28a3f3d6',
  '2026-10-17': 'fe668a721dad06ae33fb80002b84f37a',
  '2026-10-18': 'e9aa06347f8f6488766b029c11ddb8a1',
  '2027-01-01': '326b204e25dabd7b29e87e81f3c0c4a5',
  '2028-02-29': '1d0549498f0bb422a99ed910986bf564',
  '2029-12-31': '439d9c656045dd500f0d2efbf72d2832',
  '2031-07-14': 'ec6e01f758456bdcddcc901a7ffc54f7',
  '2033-03-27': 'bd74b3ee83a87e204a04673b456a86f9',
  '2036-02-29': 'ce3a00eaf1adc04af5cd7ec3fdc3fecc',
  '2036-10-04': '9cb49e9ffbe3dd5270c8aba1034428c9',
};
const DAILY_DIGEST = '577225509b48e21cac813af440d89674';

const ATTEMPTS: Readonly<Record<string, string>> = {
  'beginner:6': 'd0904401f2e1ade1c9d79f70c1491014',
  'beginner:7': 'ce6fccf37da462da09799c517aab7ab0',
  'beginner:8': 'd933cccc58c9a53d0c48b83f87792393',
  'beginner:9': 'c4aa5b42c4b0934e54da602ee92cc589',
  'beginner:10': 'b6f4b2058320a7b1ca03a12f00e19432',
  'easy:6': '6fee8a9951fc9b468e8f793590e585ae',
  'easy:7': '6eb5612960f52f2bdfa715d752bd9b13',
  'easy:8': 'b2f11d05f2d8c654211b1b1ff9ee3bde',
  'easy:9': '30ecdffd94dcdd4fe35a632c5dea5f34',
  'easy:10': '3adfa71dccd61f54208f7b45962c8e66',
  'medium:6': '605a37663581d4f060e7f9a7e23008bd',
  'medium:7': 'ea8495ca024f002ad50997c5441a3190',
  'medium:8': 'ffc67f53786ffbc3f9a4ac6cce2890c9',
  'medium:9': '3fc779ab7226b9383d8cfddb92b61bb8',
  'medium:10': '7260ed1020437c74ff328858a6bcf602',
  'hard:6': 'fc7f119a68f4a9c90b47164d09142d55',
  'hard:7': '7008b0d6035b8cc56d8746cf44e8da0e',
  'hard:8': 'c6421e956576b05d85ef45c5f16be870',
  'hard:9': '4853d124365f35ef36e878fa62644a31',
  'hard:10': '37747da5fbec12fb1c3ce680bd23147e',
  'expert:6': '087633fa7569fe972b43ac003b38d3b6',
  'expert:7': 'd2179ad742beaeeb62afbc295868419d',
  'expert:8': 'a56975b3afcde5673e7969a8b0e0e681',
  'expert:9': 'd9123a0bc9e5412c9349421616ed5af3',
  'expert:10': 'f1696d17b9776d014b3415a1ac4d4be3',
};
const FALLBACKS = 'aa141250060eb3a1a5f87f0c9128cf5a';

const engineDir = fileURLToPath(new URL('../../', import.meta.url));

describe('Queens V1 figée', () => {
  it.each(V1_FROZEN_FILES)('source inchangé : %s', (file) => {
    const hash = sourceHash(readFileSync(engineDir + file, 'utf8'));
    expect(hash, `${file} est FIGÉ : annuler la modification ou créer une nouvelle version`).toBe(SOURCES[file]);
  });

  it('toutes les dates golden sont couvertes', () => {
    expect(Object.keys(DAILY)).toEqual([...GOLDEN_DATES]);
  });

  it.each(Object.entries(DAILY))('puzzle du jour %s', (date, expected) => {
    expect(dailyFingerprintV1(date)).toBe(expected);
  });

  it(`condensé de ${GOLDEN_DIGEST_DAYS} jours consécutifs`, () => {
    expect(dailyDigestV1(GOLDEN_DIGEST_START, GOLDEN_DIGEST_DAYS)).toBe(DAILY_DIGEST);
  });

  it('chaque candidat du générateur (préréglage × taille), notation V1 comprise', () => {
    expect(attemptDigests()).toEqual(ATTEMPTS);
  });

  it('puzzles de secours servis', () => {
    expect(fallbackDigest()).toBe(FALLBACKS);
  });
});
