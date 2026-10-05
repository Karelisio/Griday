import { describe, expect, it } from 'vitest';
import { SCHEDULE } from '../config';
import { addDays, diffDays } from './date';
import { dayNumber, isScheduleStale, typeForDate, validateSchedule, versionForDate, type Schedule } from './schedule';
import { PUZZLE_TYPE_IDS, type PuzzleTypeId } from './types';

// Types fictifs (forcés par cast) pour tester des rotations à plusieurs types.
const T = (s: string): PuzzleTypeId => s as PuzzleTypeId;

const MULTI = {
  epoch: '2026-01-05',
  validThrough: '2027-06-30',
  rotations: [
    { from: '2026-01-01', types: ['alpha', 'beta', 'gamma'] },
    { from: '2026-03-01', types: ['beta', 'delta'] },
    { from: '2027-01-01', types: ['gamma'] },
  ],
  versions: {
    alpha: [{ from: '2026-01-01', version: 1 }],
    beta: [
      { from: '2026-01-01', version: 1 },
      { from: '2026-03-01', version: 2 },
    ],
    gamma: [
      { from: '2026-01-01', version: 1 },
      { from: '2026-06-15', version: 2 },
      { from: '2027-02-01', version: 5 },
    ],
    delta: [{ from: '2026-02-01', version: 3 }],
  },
} as unknown as Schedule;

const KNOWN: Record<string, readonly number[]> = { alpha: [1], beta: [1, 2], gamma: [1, 2, 5], delta: [3] };
const known = (t: PuzzleTypeId): readonly number[] => KNOWN[t] ?? [];

/** Copie profonde modifiable d'un calendrier (pour fabriquer des cas invalides). */
type Mutable = {
  epoch: string;
  validThrough: string;
  rotations: { from: string; types: string[] }[];
  versions: Record<string, { from: string; version: number }[]>;
};
const variant = (mutate: (s: Mutable) => void): Schedule => {
  const s = structuredClone(MULTI) as unknown as Mutable;
  mutate(s);
  return s as unknown as Schedule;
};

describe('typeForDate', () => {
  it('rotation modulo dans chaque entrée, bascule exactement à `from`', () => {
    const cases: [string, string][] = [
      ['2026-01-01', 'alpha'],
      ['2026-01-02', 'beta'],
      ['2026-01-03', 'gamma'],
      ['2026-01-04', 'alpha'],
      ['2026-02-28', 'beta'], // veille de la 2e entrée : 58 % 3 = 1
      ['2026-03-01', 'beta'], // jour J : l'index repart de 0
      ['2026-03-02', 'delta'],
      ['2026-03-03', 'beta'],
      ['2026-12-31', 'delta'], // 305 % 2 = 1
      ['2027-01-01', 'gamma'],
      ['2027-01-02', 'gamma'],
      ['9999-12-31', 'gamma'],
    ];
    for (const [date, type] of cases) expect(typeForDate(MULTI, date), date).toBe(type);
  });

  it('avant la première entrée : la première entrée s’applique (modulo positif)', () => {
    expect(typeForDate(MULTI, '2025-12-31')).toBe('gamma'); // décalage −1 → index 2
    expect(typeForDate(MULTI, '2025-12-30')).toBe('beta');
    expect(typeForDate(MULTI, '2025-12-29')).toBe('alpha');
    expect(diffDays('2026-01-01', '1900-01-01')).toBe(-46_021);
    expect(typeForDate(MULTI, '1900-01-01')).toBe('gamma'); // −46 021 ≡ 2 (mod 3)
  });

  it('cohérent avec types[diffDays(from, date) mod n] sur deux ans', () => {
    const rotations = (MULTI.rotations as unknown as { from: string; types: string[] }[]).slice();
    for (let i = -400; i < 800; i++) {
      const date = addDays('2026-01-01', i);
      const entry = [...rotations].reverse().find((r) => r.from <= date) ?? rotations[0]!;
      const n = entry.types.length;
      const offset = diffDays(entry.from, date);
      expect(typeForDate(MULTI, date), date).toBe(entry.types[((offset % n) + n) % n]);
    }
  });

  it('date invalide → RangeError', () => {
    expect(() => typeForDate(MULTI, '2026-02-30')).toThrow(RangeError);
  });
});

describe('versionForDate', () => {
  it('bascule de version la veille / le jour / le lendemain de `from`', () => {
    const g = T('gamma');
    expect(versionForDate(MULTI, g, '2026-06-14')).toBe(1);
    expect(versionForDate(MULTI, g, '2026-06-15')).toBe(2);
    expect(versionForDate(MULTI, g, '2026-06-16')).toBe(2);
    expect(versionForDate(MULTI, g, '2027-01-31')).toBe(2);
    expect(versionForDate(MULTI, g, '2027-02-01')).toBe(5);
    expect(versionForDate(MULTI, g, '9999-12-31')).toBe(5);
    expect(versionForDate(MULTI, T('beta'), '2026-02-28')).toBe(1);
    expect(versionForDate(MULTI, T('beta'), '2026-03-01')).toBe(2);
  });

  it('avant la première entrée : première version', () => {
    expect(versionForDate(MULTI, T('gamma'), '2025-01-01')).toBe(1);
    expect(versionForDate(MULTI, T('delta'), '2026-01-15')).toBe(3);
  });

  it('type inconnu ou date invalide → erreur', () => {
    expect(() => versionForDate(MULTI, T('omega'), '2026-01-01')).toThrow(/omega/);
    expect(() => versionForDate(MULTI, T('gamma'), '2026-1-01')).toThrow(RangeError);
  });
});

describe('dayNumber', () => {
  it('1 = epoch, négatif ou nul avant', () => {
    expect(dayNumber(MULTI, '2026-01-05')).toBe(1);
    expect(dayNumber(MULTI, '2026-01-06')).toBe(2);
    expect(dayNumber(MULTI, '2026-01-04')).toBe(0);
    expect(dayNumber(MULTI, '2025-01-05')).toBe(-364);
    expect(dayNumber(MULTI, '2027-01-05')).toBe(366);
  });
});

describe('validateSchedule', () => {
  it('calendrier cohérent → aucune erreur', () => {
    expect(validateSchedule(MULTI, known)).toEqual([]);
  });

  // Chaque type d'erreur, isolément (liste exacte : pas d'erreur parasite).
  const cases: [string, (s: Mutable) => void, string[]][] = [
    ['epoch invalide', (s) => void (s.epoch = '2026-02-30'), ['epoch invalide : 2026-02-30']],
    ['validThrough invalide', (s) => void (s.validThrough = '2027-02-30'), ['validThrough invalide : 2027-02-30']],
    ['validThrough avant epoch', (s) => void (s.validThrough = '2026-01-04'), ['validThrough antérieur à epoch']],
    [
      'rotations vides',
      (s) => void (s.rotations = []),
      ['rotations : table vide'],
    ],
    [
      'date de rotation invalide',
      (s) => void (s.rotations[1]!.from = '2026-3-01'),
      ['rotations[1] : date invalide 2026-3-01'],
    ],
    [
      'rotations de même date',
      (s) => void (s.rotations[1]!.from = '2026-01-01'),
      // Avancer la rotation rend aussi "delta" actif avant sa première version.
      ['rotations[1] : dates non strictement croissantes', 'rotations[1] : "delta" actif avant sa première version'],
    ],
    [
      'type actif avant sa première version',
      (s) => void (s.versions.delta![0]!.from = '2026-12-31'),
      ['rotations[1] : "delta" actif avant sa première version'],
    ],
    [
      'rotations décroissantes',
      (s) => void (s.rotations[2]!.from = '2026-02-01'),
      ['rotations[2] : dates non strictement croissantes'],
    ],
    ['rotation sans type', (s) => void (s.rotations[0]!.types = []), ['rotations[0] : aucun type']],
    [
      'type de rotation sans versions',
      (s) => void s.rotations[2]!.types.push('omega'),
      ['rotations[2] : type sans versions "omega"'],
    ],
    [
      'table de versions vide',
      (s) => void (s.versions.alpha = []),
      ['versions.alpha : table vide'],
    ],
    [
      'date de version invalide',
      (s) => void (s.versions.beta![1]!.from = '2026-03-32'),
      ['versions.beta[1] : date invalide 2026-03-32'],
    ],
    [
      'dates de version non croissantes',
      (s) => void (s.versions.gamma![1]!.from = '2026-01-01'),
      ['versions.gamma[1] : dates non strictement croissantes'],
    ],
    [
      'version inconnue du registre',
      (s) => void (s.versions.delta![0]!.version = 4),
      ['versions.delta : version 4 inconnue du registre'],
    ],
    [
      'versions non croissantes (retour arrière)',
      (s) => void (s.versions.gamma![2]!.version = 1),
      ['versions.gamma : versions non croissantes'],
    ],
    [
      'versions égales',
      (s) => void (s.versions.beta![1]!.version = 1),
      ['versions.beta : versions non croissantes'],
    ],
  ];

  it.each(cases)('%s', (_label, mutate, expected) => {
    expect(validateSchedule(variant(mutate), known)).toEqual(expected);
  });

  it('version 0 ou négative refusée même si le registre la connaît', () => {
    const s = variant((m) => void (m.versions.alpha = [{ from: '2026-01-01', version: 0 }]));
    expect(validateSchedule(s, (t) => (t === T('alpha') ? [0] : known(t)))).toEqual(['versions.alpha : versions non croissantes']);
  });

  it('cumule plusieurs erreurs', () => {
    const s = variant((m) => {
      m.epoch = 'x';
      m.rotations[0]!.types = [];
      m.versions.delta![0]!.version = 9;
    });
    expect(validateSchedule(s, known)).toEqual([
      'epoch invalide : x',
      'rotations[0] : aucun type',
      'versions.delta : version 9 inconnue du registre',
    ]);
  });
});

describe('SCHEDULE officiel (engine/config.ts)', () => {
  it('est valide avec le registre connu (queens = [1], binairo = [1])', () => {
    expect(validateSchedule(SCHEDULE, (t) => (t === 'queens' || t === 'binairo' ? [1] : []))).toEqual([]);
  });

  it('chaque type déclaré possède une table de versions', () => {
    for (const t of PUZZLE_TYPE_IDS) expect(SCHEDULE.versions[t], t).toBeDefined();
  });

  // GEL : entrées déjà publiées. On peut AJOUTER des entrées futures, jamais modifier celles-ci.
  it('entrées publiées inchangées', () => {
    expect(SCHEDULE.epoch).toBe('2026-10-05');
    expect(SCHEDULE.rotations[0]).toEqual({ from: '2026-01-01', types: ['queens'] });
    expect(SCHEDULE.versions.queens[0]).toEqual({ from: '2026-01-01', version: 1 });
    expect(SCHEDULE.versions.binairo[0]).toEqual({ from: '2026-01-01', version: 1 });
  });

  it('validThrough : build à jour jusqu’à cette date incluse', () => {
    expect(isScheduleStale(SCHEDULE, SCHEDULE.validThrough)).toBe(false);
    expect(isScheduleStale(SCHEDULE, addDays(SCHEDULE.validThrough, 1))).toBe(true);
    expect(isScheduleStale(SCHEDULE, SCHEDULE.epoch)).toBe(false);
  });

  it('gelé en profondeur (aucune mutation accidentelle à l’exécution)', () => {
    expect(Object.isFrozen(SCHEDULE)).toBe(true);
    expect(Object.isFrozen(SCHEDULE.rotations[0])).toBe(true);
    expect(Object.isFrozen(SCHEDULE.rotations[0]!.types)).toBe(true);
    expect(Object.isFrozen(SCHEDULE.versions.queens[0])).toBe(true);
  });

  it('puzzle n°1 = Queens v1 le lundi 2026-10-05', () => {
    expect(dayNumber(SCHEDULE, '2026-10-05')).toBe(1);
    expect(typeForDate(SCHEDULE, '2026-10-05')).toBe('queens');
    expect(versionForDate(SCHEDULE, 'queens', '2026-10-05')).toBe(1);
  });
});
