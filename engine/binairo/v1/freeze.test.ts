/**
 * VERROU DE GEL DE BINAIRO V1.
 *
 * Ces valeurs ne doivent JAMAIS être modifiées pour faire passer un test : un échec signifie que des
 * puzzles déjà publiés changeraient. Corriger (annuler) la modification du code, ou créer une v2/.
 * Couverture : empreinte des sources figées (toute édition), puzzles du jour (dates fixes + 120 jours),
 * chaque candidat du générateur y compris nul (PRNG, notation complète), secours servis, références
 * mensuelles (30 ans). Indépendant du calendrier : valable avant l'entrée de Binairo dans la rotation
 * comme après l'activation d'une V2.
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
  goldenFileDigest,
  sourceHash,
  V1_FROZEN_FILES,
  V1_GOLDEN_LAST_MONTH,
} from './freeze-data';

const SOURCES: Readonly<Record<(typeof V1_FROZEN_FILES)[number], string>> = {
  'core/prng.ts': '3d4600fee5f768b7f8591279238dbb87',
  'binairo/v1/fallbacks.ts': 'f467b7f32859861b9db06463b2a2490f',
  'binairo/v1/generator.ts': '636964d55f7d1b8d1d1739f6bd61b2b6',
  'binairo/v1/solver.ts': '417f93eeed971f1e8cdb4c62d99a9088',
  'binairo/v1/util.ts': 'd871b0a6ed65e80757f5fda542ce63ec',
  'binairo/v1/version.ts': 'a48927bbba07d479dde13ccc6c4a2cc2',
};

const DAILY: Readonly<Record<string, string>> = {
  '2026-10-05': '0db28e78f0206a9e005e9b5564bc025b',
  '2026-10-06': '17b8e01ec5126d0055d2e9f451661756',
  '2026-10-07': 'b89e4078030daf66a14eb79d7ef07170',
  '2026-10-08': 'bdb3b3db763dfef4983fcde110914b61',
  '2026-10-09': 'f370f24f56aab3badf2fe87168a229f0',
  '2026-10-10': 'e613d4bb856da075b8ad3e44bdfdac26',
  '2026-10-11': 'db45d59c68946c63bd40ba466bde8262',
  '2026-10-12': 'eb9414ae65f427b9d07401c6eae5a65b',
  '2026-10-13': '5ca1027ece1fdf0ef2c627ad74394cff',
  '2026-10-14': '3c94ee576c2e2131bdfe895375005576',
  '2026-10-15': '4e0e125534b783e3b22ed091965a0d79',
  '2026-10-16': 'fa004cffea22845e7949bee58d3864bf',
  '2026-10-17': '441f384e5d65a49efb5122aebcac5117',
  '2026-10-18': 'd98329640ffb02aa07824b03d342bdbe',
  '2027-01-01': '945196c88864a56afe7732314fb5a4b9',
  '2028-02-29': '03d767c6391f47dbe0b9645305b66911',
  '2029-12-31': 'ed5c9c6b81405304b09d6e604d806b72',
  '2031-07-14': 'ee4f1a959d85b367e2850a8de37acd99',
  '2033-03-27': '308feaec94ac4418a42baf82d2bfd8c2',
  '2036-02-29': '148a500dc2911ca5d2d97938d5d32621',
  '2036-10-04': '602bd9e6cf585f79bb76d8b89f9ee577',
};
const DAILY_DIGEST = '43f599f6ec620de6a5738bd853b5e628';

/** Clés palier:taille. */
const ATTEMPTS: Readonly<Record<string, string>> = {
  '1:6': 'b32b38e50c00fbbdbc31361e06b25ec3',
  '1:8': '7de82c973bc51242f64f1202e42bb686',
  '1:10': '8c2f4e1eb69db122e22717ce3d263572',
  '1:12': '7d6fda17467dcdc870400bf57bb03c11',
  '2:6': '836a57836016cb72caa0a6c578b871f0',
  '2:8': 'ebd59b9a9f1e588166a92a1b996ca908',
  '2:10': 'b0cefd3a1a508462ed1aa87248b2e0f0',
  '2:12': 'aada5a6b829974b40202fb84f208e195',
  '3:6': '37bd0e003f48ccb80c4fed63de571e4c',
  '3:8': '6e8287b76775593986b728629719044b',
  '3:10': '07c8dad1bdcfe70d480130e5743b2757',
  '3:12': 'c96ca61c366d7d35e82da170c6ebf6ba',
  '4:6': '4e0230d7a95578a9f03762cc60112701',
  '4:8': '9f33a671c1f39403939a87bded4d4292',
  '4:10': 'e5bad752ea1b6254896e5a4391ca28b2',
  '4:12': '2f7cbec07757fbeef65fdf96a85c1ac0',
};
/** Références mensuelles 2026-10 → 2056-09 (scripts/golden/binairo-v1.json, vérifiées par validate-future). */
const GOLDEN_FILE = '2ea56228227d5b5fd88a12096cb85a78';

const FALLBACKS = '81290d1625b4175381301d3cef906373';

const engineDir = fileURLToPath(new URL('../../', import.meta.url));

describe('Binairo V1 figée', () => {
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

  it('chaque candidat du générateur (palier × taille), notation V1 comprise', () => {
    expect(attemptDigests()).toEqual(ATTEMPTS);
  });

  it('références mensuelles figées (30 ans) inchangées', () => {
    const path = fileURLToPath(new URL('../../../scripts/golden/binairo-v1.json', import.meta.url));
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    expect(Object.keys(data).filter((k) => k <= V1_GOLDEN_LAST_MONTH)).toHaveLength(360);
    expect(goldenFileDigest(data, V1_GOLDEN_LAST_MONTH), 'binairo-v1.json est FIGÉ (ajout seul après 2056-09)').toBe(GOLDEN_FILE);
  });

  it('puzzles de secours servis', () => {
    expect(fallbackDigest()).toBe(FALLBACKS);
  });
});
