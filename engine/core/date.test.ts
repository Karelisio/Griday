import { afterEach, describe, expect, it } from 'vitest';
import {
  addDays,
  civilFromDays,
  compareISO,
  daysFromCivil,
  daysInMonth,
  daysToISO,
  diffDays,
  formatISODate,
  isLeapYear,
  isoToDays,
  isoWeekday,
  isValidISODate,
  localISODate,
  MAX_YEAR,
  MIN_YEAR,
  parseISODate,
} from './date';

const DAY_MS = 86_400_000;
const FIRST = -25_567; // 1900-01-01
const LAST = 2_932_896; // 9999-12-31

/** Date ISO attendue, calculée indépendamment par Date (UTC). */
const utcISO = (days: number): string => new Date(days * DAY_MS).toISOString().slice(0, 10);
/** Jour ISO attendu (1 = lundi … 7 = dimanche) d'après getUTCDay. */
const utcWeekday = (days: number): number => ((new Date(days * DAY_MS).getUTCDay() + 6) % 7) + 1;

describe('daysFromCivil / civilFromDays', () => {
  it('points de repère', () => {
    expect(MIN_YEAR).toBe(1900);
    expect(MAX_YEAR).toBe(9999);
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(daysFromCivil(1900, 1, 1)).toBe(FIRST);
    expect(daysFromCivil(9999, 12, 31)).toBe(LAST);
    expect(daysFromCivil(2000, 3, 1)).toBe(11_017);
    expect(daysFromCivil(2026, 10, 5)).toBe(20_731);
    expect(civilFromDays(-1)).toEqual({ y: 1969, m: 12, d: 31 });
  });

  // Exhaustif (2 958 464 jours, ≈ 0,5 s) : compteur civil indépendant + Date.UTC comme oracle.
  it('aller-retour exact pour chaque jour de 1900-01-01 à 9999-12-31, recoupé avec Date.UTC', () => {
    let y = 1900;
    let m = 1;
    let d = 1;
    let monthLength = 31;
    let mismatches = 0;
    let count = 0;
    for (let days = FIRST; days <= LAST; days++) {
      count++;
      if (Date.UTC(y, m - 1, d) !== days * DAY_MS) mismatches++;
      if (daysFromCivil(y, m, d) !== days) mismatches++;
      const c = civilFromDays(days);
      if (c.y !== y || c.m !== m || c.d !== d) mismatches++;
      if (++d > monthLength) {
        d = 1;
        if (++m > 12) {
          m = 1;
          y++;
        }
        // Longueur du mois via Date (indépendant de daysInMonth).
        monthLength = new Date(Date.UTC(y, m, 0)).getUTCDate();
        if (daysInMonth(y, m) !== monthLength) mismatches++;
      }
    }
    expect(count).toBe(2_958_464);
    expect([y, m, d]).toEqual([10000, 1, 1]);
    expect(mismatches).toBe(0);
  });

  // Couche chaîne (regex + padStart) et jour de semaine : échantillonnage dense plutôt qu'exhaustif
  // (≈ 4,5 s sinon). L'arithmétique est déjà couverte jour par jour ci-dessus ; ici : tous les jours
  // 1900–2200 (règles 1900/2000/2100, toute la vie réaliste de l'app), un pas premier de 97 jours sur
  // toute la plage (toutes les phases de semaine et de mois) et les 3 dernières années.
  it('daysToISO / isoToDays / parseISODate / isoWeekday sur échantillon dense', () => {
    const sample: number[] = [];
    for (let days = FIRST; days <= daysFromCivil(2200, 12, 31); days++) sample.push(days);
    for (let days = FIRST; days <= LAST; days += 97) sample.push(days);
    for (let days = daysFromCivil(9997, 1, 1); days <= LAST; days++) sample.push(days);
    let mismatches = 0;
    for (const days of sample) {
      const iso = daysToISO(days);
      if (iso !== utcISO(days)) mismatches++;
      if (!isValidISODate(iso) || isoToDays(iso) !== days) mismatches++;
      const p = parseISODate(iso);
      if (formatISODate(p.y, p.m, p.d) !== iso) mismatches++;
      if (isoWeekday(iso) !== utcWeekday(days)) mismatches++;
    }
    expect(sample.length).toBeGreaterThan(140_000);
    expect(mismatches).toBe(0);
  });

  // Hors plage ISO (fonctions exportées) : division entière par défaut (floor), années ≤ 0 comprises.
  it('reste exact hors plage ISO (années −2000 à 1899, grégorien proleptique)', () => {
    const utc = new Date(0);
    let mismatches = 0;
    for (let days = daysFromCivil(-2000, 1, 1); days < FIRST; days += 37) {
      utc.setTime(days * DAY_MS);
      const [y, m, d] = [utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate()];
      if (daysFromCivil(y, m, d) !== days) mismatches++;
      const c = civilFromDays(days);
      if (c.y !== y || c.m !== m || c.d !== d) mismatches++;
    }
    expect(daysFromCivil(0, 3, 1)).toBe(-719_468); // origine de l'algorithme de Hinnant
    expect(civilFromDays(-719_469)).toEqual({ y: 0, m: 2, d: 29 }); // l'an 0 est bissextile
    expect(mismatches).toBe(0);
  });

  it('jours de semaine connus', () => {
    expect(isoWeekday('1900-01-01')).toBe(1); // lundi
    expect(isoWeekday('1970-01-01')).toBe(4); // jeudi
    expect(isoWeekday('2000-01-01')).toBe(6); // samedi
    expect(isoWeekday('2026-10-05')).toBe(1); // lundi (epoch de Griday)
    expect(isoWeekday('2026-10-11')).toBe(7); // dimanche
    expect(isoWeekday('9999-12-31')).toBe(5); // vendredi
  });
});

describe('années bissextiles', () => {
  it('règles grégoriennes', () => {
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2400)).toBe(true);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m))).toEqual([
      31, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ]);
  });

  it('29 février', () => {
    expect(isValidISODate('1900-02-29')).toBe(false);
    expect(isValidISODate('2000-02-29')).toBe(true);
    expect(isValidISODate('2100-02-29')).toBe(false);
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
    expect(diffDays('2000-02-28', '2000-03-01')).toBe(2);
    expect(diffDays('1900-02-28', '1900-03-01')).toBe(1);
  });
});

describe('validation des chaînes ISO', () => {
  const INVALID = [
    '2026-02-29',
    '2026-13-01',
    '26-1-1',
    ' 2026-01-01',
    '2026-1-01',
    '2026-01-1',
    '2026-01-01 ',
    '2026-01-01\n',
    '\n2026-01-01',
    '2026-00-10',
    '2026-01-00',
    '2026-01-32',
    '2026-04-31',
    '1900-02-29',
    '1899-12-31',
    '0000-01-01',
    '10000-01-01',
    '+2026-01-01',
    '-2026-01-01',
    '2026/01/01',
    '2026-01-01T00:00:00Z',
    '20260101',
    '',
    '2026-1e-01',
    '２０２６-01-01', // chiffres pleine chasse
    '٢٠٢٦-01-01', // chiffres arabes-indiens
  ];

  it.each(INVALID.map((s) => [JSON.stringify(s), s]))('rejette %s', (_label, iso) => {
    expect(isValidISODate(iso)).toBe(false);
    expect(() => parseISODate(iso)).toThrow(RangeError);
    expect(() => isoToDays(iso)).toThrow(RangeError);
    expect(() => isoWeekday(iso)).toThrow(RangeError);
    expect(() => addDays(iso, 0)).toThrow(RangeError);
    expect(() => diffDays(iso, '2026-01-01')).toThrow(RangeError);
    expect(() => compareISO('2026-01-01', iso)).toThrow(RangeError);
  });

  it('accepte les bornes et renvoie les composantes', () => {
    expect(parseISODate('1900-01-01')).toEqual({ y: 1900, m: 1, d: 1 });
    expect(parseISODate('9999-12-31')).toEqual({ y: 9999, m: 12, d: 31 });
    expect(parseISODate('2026-10-05')).toEqual({ y: 2026, m: 10, d: 5 });
  });

  it('formatISODate complète par des zéros et refuse toute date invalide', () => {
    expect(formatISODate(2026, 1, 5)).toBe('2026-01-05');
    expect(formatISODate(1900, 1, 1)).toBe('1900-01-01');
    const bad: [number, number, number][] = [
      [1899, 12, 31],
      [10000, 1, 1],
      [2026, 0, 1],
      [2026, 13, 1],
      [2026, 1, 0],
      [2026, 1, 32],
      [2026, 2, 29],
      [2026.5, 1, 1],
      [2026, 1.5, 1],
      [Number.NaN, 1, 1],
      [-2026, 1, 1],
      [1e21, 1, 1],
    ];
    for (const [y, m, d] of bad) expect(() => formatISODate(y, m, d), `${y}-${m}-${d}`).toThrow(RangeError);
  });
});

describe('arithmétique sur les dates', () => {
  it('addDays franchit mois, années et bissextiles', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2026-10-05', 0)).toBe('2026-10-05');
    expect(addDays('2026-10-05', -0)).toBe('2026-10-05');
    expect(addDays('2026-10-05', 365)).toBe('2027-10-05');
    expect(addDays('2000-01-01', 36_525)).toBe('2100-01-01');
    expect(addDays('1900-01-01', LAST - FIRST)).toBe('9999-12-31');
  });

  it('addDays refuse un décalage non entier et toute sortie de [1900, 9999]', () => {
    for (const n of [0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => addDays('2026-10-05', n), String(n)).toThrow(RangeError);
    }
    expect(() => addDays('9999-12-31', 1)).toThrow(RangeError);
    expect(() => addDays('1900-01-01', -1)).toThrow(RangeError);
    // Très grands entiers : jamais de date « valide » fantaisiste due à une perte de précision.
    for (const n of [2 ** 31, 2 ** 53, -(2 ** 53), 1e300]) {
      expect(() => addDays('2026-10-05', n), String(n)).toThrow(RangeError);
    }
  });

  it('diffDays est antisymétrique et cohérent avec addDays', () => {
    expect(diffDays('2026-10-05', '2026-10-06')).toBe(1);
    expect(diffDays('2026-10-06', '2026-10-05')).toBe(-1);
    expect(diffDays('2026-10-05', '2026-10-05')).toBe(0);
    expect(diffDays('1900-01-01', '9999-12-31')).toBe(2_958_463);
    let seed = 12345;
    for (let i = 0; i < 2000; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      const a = daysToISO(FIRST + (seed % (LAST - FIRST + 1 - 20_000)));
      const n = (seed >>> 7) % 20_000;
      const b = addDays(a, n);
      expect(diffDays(a, b)).toBe(n);
      expect(diffDays(b, a)).toBe(-n);
      expect(addDays(b, -n)).toBe(a);
    }
  });

  it('compareISO ≡ comparaison lexicographique des chaînes valides', () => {
    expect(compareISO('2026-10-05', '2026-10-06')).toBe(-1);
    expect(compareISO('2026-10-06', '2026-10-05')).toBe(1);
    expect(compareISO('2026-10-05', '2026-10-05')).toBe(0);
    expect(compareISO('1999-12-31', '2000-01-01')).toBe(-1);
    let seed = 777;
    for (let i = 0; i < 2000; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      const a = daysToISO(FIRST + (seed % 400_000));
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      const b = daysToISO(FIRST + (seed % 400_000));
      expect(compareISO(a, b)).toBe(a < b ? -1 : a > b ? 1 : 0);
    }
  });
});

describe('localISODate (fuseau du système)', () => {
  const savedTZ = process.env.TZ;
  afterEach(() => {
    if (savedTZ === undefined) delete process.env.TZ;
    else process.env.TZ = savedTZ;
  });
  const localAt = (tz: string, instant: string): string => {
    process.env.TZ = tz; // Node relit le fuseau à chaque affectation de TZ.
    return localISODate(new Date(instant));
  };

  it.each([
    // [fuseau, instant UTC, date locale attendue] — instants passés uniquement : les règles tz
    // futures peuvent encore changer (tzdata), pas celles déjà appliquées.
    ['UTC', '2026-10-01T23:59:59.999Z', '2026-10-01'],
    ['UTC', '2026-10-02T00:00:00.000Z', '2026-10-02'],
    ['Pacific/Kiritimati', '2026-10-01T09:59:59.999Z', '2026-10-01'], // UTC+14
    ['Pacific/Kiritimati', '2026-10-01T10:00:00.000Z', '2026-10-02'],
    ['Pacific/Pago_Pago', '2026-10-02T10:59:59.999Z', '2026-10-01'], // UTC−11
    ['Pacific/Pago_Pago', '2026-10-02T11:00:00.000Z', '2026-10-02'],
    ['Asia/Kathmandu', '2026-10-01T18:14:59.999Z', '2026-10-01'], // UTC+5:45
    ['Asia/Kathmandu', '2026-10-01T18:15:00.000Z', '2026-10-02'],
    ['Europe/Paris', '2025-10-25T21:59:59.999Z', '2025-10-25'], // heure d'été
    ['Europe/Paris', '2025-10-26T22:59:59.999Z', '2025-10-26'], // heure d'hiver (changement le 26)
    ['Europe/Paris', '2025-10-26T23:00:00.000Z', '2025-10-27'],
    // Chili : heure d'été à minuit (00:00 n'existe pas le 6 sept. 2026, on passe à 01:00).
    ['America/Santiago', '2026-09-06T03:59:59.999Z', '2026-09-05'],
    ['America/Santiago', '2026-09-06T04:00:00.000Z', '2026-09-06'],
    // Chili : retour à 23:00 la veille à minuit — le 4 avril 2026 dure 25 h, sans recul de date.
    ['America/Santiago', '2026-04-05T02:59:59.999Z', '2026-04-04'],
    ['America/Santiago', '2026-04-05T03:00:00.000Z', '2026-04-04'],
    ['America/Santiago', '2026-04-05T03:59:59.999Z', '2026-04-04'],
    ['America/Santiago', '2026-04-05T04:00:00.000Z', '2026-04-05'],
    // Samoa a sauté le 30 décembre 2011 : une date locale peut ne jamais exister.
    ['Pacific/Apia', '2011-12-30T09:59:59.999Z', '2011-12-29'],
    ['Pacific/Apia', '2011-12-30T10:00:00.000Z', '2011-12-31'],
  ])('%s à %s → %s', (tz, instant, expected) => {
    expect(localAt(tz, instant)).toBe(expected);
  });

  it('piège DST : +24 h en millisecondes ≠ +1 jour ; addDays sur la chaîne est sûr', () => {
    process.env.TZ = 'Europe/Paris';
    const midnight = new Date(2025, 9, 26); // minuit local, jour de 25 h
    expect(localISODate(midnight)).toBe('2025-10-26');
    expect(localISODate(new Date(midnight.getTime() + DAY_MS))).toBe('2025-10-26'); // 23:00 le même jour
    expect(addDays(localISODate(midnight), 1)).toBe('2025-10-27');
  });

  it('Date invalide ou hors plage → RangeError', () => {
    process.env.TZ = 'UTC';
    expect(() => localISODate(new Date(Number.NaN))).toThrow(RangeError);
    expect(() => localISODate(new Date('1899-12-31T12:00:00Z'))).toThrow(RangeError);
    expect(() => localISODate(new Date('+010000-01-01T12:00:00Z'))).toThrow(RangeError);
  });

  it('le reste du module ne dépend pas du fuseau', () => {
    const probe = () => [isoWeekday('2026-10-05'), addDays('2026-03-29', 1), diffDays('2026-03-28', '2026-03-30'), isoToDays('2026-10-25')];
    process.env.TZ = 'UTC';
    const ref = probe();
    for (const tz of ['Europe/Paris', 'Pacific/Kiritimati', 'America/Santiago', 'Asia/Kathmandu']) {
      process.env.TZ = tz;
      expect(probe(), tz).toEqual(ref);
    }
  });
});
