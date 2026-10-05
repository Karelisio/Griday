import i18next from 'i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SCHEDULE } from '../../engine/config';
import { addDays, localISODate, type ISODate } from '../../engine/core/date';
import { dayNumber } from '../../engine/core/schedule';
import en from '../../locales/en.json';
import fr from '../../locales/fr.json';
import { formatNumber } from '../i18n/format';
import { planReminders, REMINDER_DAYS, type PlanOptions } from './plan';

const i18n = i18next.createInstance();
beforeAll(async () => {
  await i18n.init({ resources: { fr: { translation: fr }, en: { translation: en } }, lng: 'fr', interpolation: { escapeValue: false } });
});

/** Espaces insécables ramenés à des espaces : les attentes restent lisibles (la typographie est testée avec les langues). */
const plain = (s: string) => s.replace(/[  ]/g, ' ');

const TODAY = '2026-10-05'; // puzzle n° 1
const MORNING = new Date(2026, 9, 5, 10, 30);
const dayNumberOf = (date: ISODate) => dayNumber(SCHEDULE, date);
const options = (overrides: Partial<PlanOptions> = {}): PlanOptions => ({
  now: MORNING,
  time: '19:00',
  todaySolved: false,
  streak: 0,
  dayNumberOf,
  t: i18n.getFixedT('fr'),
  lang: 'fr',
  ...overrides,
});
const plan = (overrides: Partial<PlanOptions> = {}) => planReminders(options(overrides));
const english = { t: i18n.getFixedT('en'), lang: 'en' } as const;
const dates = (reminders: ReturnType<typeof plan>) => reminders.map((r) => localISODate(r.at));

describe('rappels à programmer', () => {
  it('un rappel par jour local pendant 14 jours, à l’heure choisie, à partir d’aujourd’hui', () => {
    const reminders = plan();
    expect(REMINDER_DAYS).toBe(14);
    expect(reminders).toHaveLength(14);
    expect(dates(reminders)).toEqual(Array.from({ length: 14 }, (_, i) => addDays(TODAY, i)));
    for (const { at } of reminders) expect([at.getHours(), at.getMinutes(), at.getSeconds()]).toEqual([19, 0, 0]);
    expect(reminders[0]!.at.getTime()).toBe(new Date(2026, 9, 5, 19, 0).getTime());
  });

  it('autre heure et nombre de jours', () => {
    const reminders = plan({ time: '22:05', days: 3 });
    expect(dates(reminders)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(reminders.map((r) => [r.at.getHours(), r.at.getMinutes()])).toEqual([[22, 5], [22, 5], [22, 5]]);
    expect(plan({ days: 0 })).toEqual([]);
  });

  it('identifiant : la date « AAAAMMJJ », entier 32 bits, le même quel que soit l’instant de calcul', () => {
    const reminders = plan();
    expect(reminders.slice(0, 3).map((r) => r.id)).toEqual([20261005, 20261006, 20261007]);
    expect(new Set(reminders.map((r) => r.id)).size).toBe(14);
    for (const { id } of reminders) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeLessThanOrEqual(2 ** 31 - 1);
    }
    const later = plan({ now: new Date(2026, 9, 6, 8, 0) });
    expect(later[0]!.id).toBe(reminders[1]!.id);
    expect(later[0]!.at.getTime()).toBe(reminders[1]!.at.getTime());
  });

  it('fin de mois et d’année : dates et identifiants consécutifs', () => {
    const reminders = plan({ now: new Date(2026, 11, 28, 9, 0), days: 6 });
    expect(reminders.map((r) => r.id)).toEqual([20261228, 20261229, 20261230, 20261231, 20270101, 20270102]);
    expect(dates(reminders)).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(dates(plan({ now: new Date(2028, 1, 28, 9, 0), days: 3 }))).toEqual(['2028-02-28', '2028-02-29', '2028-03-01']); // bissextile
  });

  it('puzzle du jour résolu : pas de rappel aujourd’hui, mais toujours 14 jours devant soi', () => {
    const reminders = plan({ todaySolved: true });
    expect(reminders).toHaveLength(14);
    expect(dates(reminders)[0]).toBe('2026-10-06');
    expect(dates(reminders)[13]).toBe('2026-10-19');
  });

  it('heure déjà passée aujourd’hui : premier rappel demain, à la milliseconde près', () => {
    expect(dates(plan({ now: new Date(2026, 9, 5, 20, 0) }))[0]).toBe('2026-10-06');
    expect(dates(plan({ now: new Date(2026, 9, 5, 19, 0, 0, 0) }))[0]).toBe('2026-10-06');
    expect(dates(plan({ now: new Date(2026, 9, 5, 18, 59, 59, 999) }))[0]).toBe('2026-10-05');
  });

  it('heure invalide : erreur explicite', () => {
    for (const time of ['', '7:00', '24:00', '19:60', '19h00']) expect(() => plan({ time }), time).toThrow(RangeError);
  });
});

describe('textes', () => {
  it('titre en français et en anglais : le numéro du puzzle de chaque jour', () => {
    const fr3 = plan({ days: 3 });
    expect(fr3.map((r) => plain(r.title))).toEqual(['Le puzzle n° 1 est prêt', 'Le puzzle n° 2 est prêt', 'Le puzzle n° 3 est prêt']);
    expect(fr3[0]!.title).toContain('n° 1'); // numéro lié à « n° » (espace insécable)
    expect(plan({ days: 3, ...english }).map((r) => r.title)).toEqual(['Puzzle #1 is ready', 'Puzzle #2 is ready', 'Puzzle #3 is ready']);
  });

  it('numéros à plusieurs chiffres formatés comme dans l’écran du jour', () => {
    const [first] = plan({ dayNumberOf: () => 1234, days: 1 });
    expect(first!.title).toBe(`Le puzzle n° ${formatNumber(1234, 'fr')} est prêt`);
  });

  it('avant le lancement (numéro < 1) : titre sans numéro', () => {
    const [first] = plan({ dayNumberOf: () => 0, days: 1 });
    expect(first!.title).toBe('Votre puzzle du jour est prêt');
    expect(plan({ dayNumberOf: () => -4, days: 1, ...english })[0]!.title).toBe('Your daily puzzle is ready');
  });

  it('sans série : message d’invitation, identique chaque jour', () => {
    const bodies = plan({ days: 4 }).map((r) => r.body);
    expect(new Set(bodies)).toEqual(new Set(['Une nouvelle grille à résoudre en quelques minutes.']));
    expect(plan({ days: 1, ...english })[0]!.body).toBe('A fresh grid to solve in a few minutes.');
  });

  it('série en danger (rappel du jour à venir) : le seul premier rappel défend la série', () => {
    const reminders = plan({ streak: 5 });
    expect(reminders[0]!.body).toBe('Gardez votre série de 5 jours 🔥');
    expect(reminders.slice(1).map((r) => r.body)).toEqual(Array(13).fill('Une nouvelle grille à résoudre en quelques minutes.'));
    expect(plan({ streak: 5, ...english })[0]!.body).toBe('Keep your 5-day streak going 🔥');
  });

  it('pluriel : un jour de série', () => {
    expect(plan({ streak: 1 })[0]!.body).toBe('Gardez votre série de 1 jour 🔥');
    expect(plan({ streak: 1, ...english })[0]!.body).toBe('Keep your 1-day streak going 🔥');
    expect(plan({ streak: 12 })[0]!.body).toBe('Gardez votre série de 12 jours 🔥');
  });

  it('puzzle du jour résolu : la série (aujourd’hui compris) est défendue par le rappel de demain', () => {
    const [first, second] = plan({ todaySolved: true, streak: 6 });
    expect(first!.id).toBe(20261006);
    expect(first!.body).toBe('Gardez votre série de 6 jours 🔥');
    expect(second!.body).toBe('Une nouvelle grille à résoudre en quelques minutes.');
  });

  it('heure du jour passée sans avoir joué : la série cassera à minuit, aucune promesse sur elle', () => {
    const reminders = plan({ now: new Date(2026, 9, 5, 21, 0), streak: 6 });
    expect(dates(reminders)[0]).toBe('2026-10-06');
    expect(new Set(reminders.map((r) => r.body)).size).toBe(1);
    expect(reminders[0]!.body).not.toContain('série');
  });
});

describe('heure locale et changements d’heure', () => {
  const savedTZ = process.env.TZ;
  afterEach(() => {
    if (savedTZ === undefined) delete process.env.TZ;
    else process.env.TZ = savedTZ;
  });
  const HOUR = 3_600_000;
  const gaps = (reminders: ReturnType<typeof plan>) => reminders.slice(1).map((r, i) => (r.at.getTime() - reminders[i]!.at.getTime()) / HOUR);

  it('heure d’hiver (25 h le 26 oct. 2025, Paris) : toujours 19 h 00 sur l’horloge murale', () => {
    process.env.TZ = 'Europe/Paris';
    const reminders = plan({ now: new Date(2025, 9, 24, 10, 0) });
    expect(dates(reminders)[0]).toBe('2025-10-24');
    expect(dates(reminders)[13]).toBe('2025-11-06');
    for (const { at } of reminders) expect([at.getHours(), at.getMinutes()]).toEqual([19, 0]);
    // 24 h entre deux rappels, sauf la veille d’une journée de 25 h : ajouter 24 h aurait décalé l’heure.
    expect(gaps(reminders)).toEqual([24, 25, ...Array(11).fill(24)]);
  });

  it('heure d’été (23 h le 30 mars 2025, Paris)', () => {
    process.env.TZ = 'Europe/Paris';
    const reminders = plan({ now: new Date(2025, 2, 28, 10, 0) });
    for (const { at } of reminders) expect([at.getHours(), at.getMinutes()]).toEqual([19, 0]);
    expect(gaps(reminders)).toEqual([24, 23, ...Array(11).fill(24)]);
  });

  it('heure inexistante (02 h 30 le 30 mars 2025) : décalée à la première heure valide, aucun jour perdu ni doublé', () => {
    process.env.TZ = 'Europe/Paris';
    const reminders = plan({ now: new Date(2025, 2, 28, 1, 0), time: '02:30' });
    expect(reminders).toHaveLength(14);
    expect(dates(reminders)).toEqual(Array.from({ length: 14 }, (_, i) => addDays('2025-03-28', i)));
    expect(reminders.map((r) => r.at.getHours())).toEqual([2, 2, 3, ...Array(11).fill(2)]);
    expect(new Set(reminders.map((r) => r.id)).size).toBe(14);
    for (let i = 1; i < reminders.length; i++) expect(reminders[i]!.at.getTime()).toBeGreaterThan(reminders[i - 1]!.at.getTime());
  });

  it.each(['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kathmandu', 'America/Santiago', 'UTC'])('fuseau %s : jours et heures locaux', (tz) => {
    process.env.TZ = tz;
    const reminders = plan({ now: new Date(2026, 9, 5, 10, 30) });
    expect(dates(reminders)).toEqual(Array.from({ length: 14 }, (_, i) => addDays(TODAY, i)));
    for (const { at } of reminders) expect([at.getHours(), at.getMinutes()]).toEqual([19, 0]);
  });
});
