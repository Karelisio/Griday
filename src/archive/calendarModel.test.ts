import { describe, expect, it } from 'vitest';
import { daysInMonth, diffDays, isoWeekday } from '../../engine/core/date';
import {
  addMonths,
  clampDate,
  clampMonth,
  diffMonths,
  firstDayOf,
  focusableDay,
  isPlayable,
  keyboardTarget,
  lastDayOf,
  monthBounds,
  monthGrid,
  monthKey,
  monthOf,
  playableDays,
  shiftMonth,
  type MonthRef,
} from './calendarModel';

const m = (year: number, month: number): MonthRef => ({ year, month });

describe('arithmétique de mois', () => {
  it('addMonths passe les années dans les deux sens', () => {
    expect(addMonths(m(2026, 10), 1)).toEqual(m(2026, 11));
    expect(addMonths(m(2026, 12), 1)).toEqual(m(2027, 1));
    expect(addMonths(m(2027, 1), -1)).toEqual(m(2026, 12));
    expect(addMonths(m(2026, 10), 0)).toEqual(m(2026, 10));
    expect(addMonths(m(2026, 10), 27)).toEqual(m(2029, 1));
    expect(addMonths(m(2026, 10), -22)).toEqual(m(2024, 12));
  });

  it('diffMonths, monthOf, monthKey, premier et dernier jour', () => {
    expect(diffMonths(m(2026, 10), m(2027, 2))).toBe(4);
    expect(diffMonths(m(2027, 2), m(2026, 10))).toBe(-4);
    expect(diffMonths(m(2026, 10), m(2026, 10))).toBe(0);
    expect(monthOf('2026-10-05')).toEqual(m(2026, 10));
    expect(monthKey(m(2026, 3))).toBe('2026-03');
    expect(firstDayOf(m(2026, 2))).toBe('2026-02-01');
    expect(lastDayOf(m(2026, 2))).toBe('2026-02-28');
    expect(lastDayOf(m(2028, 2))).toBe('2028-02-29');
    expect(lastDayOf(m(2026, 12))).toBe('2026-12-31');
  });

  it('shiftMonth garde le quantième, ramené au dernier jour du mois cible', () => {
    expect(shiftMonth('2026-10-05', 1)).toBe('2026-11-05');
    expect(shiftMonth('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonth('2028-03-31', -1)).toBe('2028-02-29');
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftMonth('2026-10-31', 1)).toBe('2026-11-30');
    expect(shiftMonth('2028-02-29', 12)).toBe('2029-02-28');
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-15');
    expect(shiftMonth('2027-01-15', -1)).toBe('2026-12-15');
  });
});

describe('grille du mois', () => {
  // Un mois commençant chaque jour de la semaine (lundi = 1), avec son nombre de semaines.
  const STARTS: readonly { month: MonthRef; weekday: number; weeks: number }[] = [
    { month: m(2025, 9), weekday: 1, weeks: 5 },
    { month: m(2026, 12), weekday: 2, weeks: 5 },
    { month: m(2025, 10), weekday: 3, weeks: 5 },
    { month: m(2026, 10), weekday: 4, weeks: 5 },
    { month: m(2027, 1), weekday: 5, weeks: 5 },
    { month: m(2026, 8), weekday: 6, weeks: 6 },
    { month: m(2026, 11), weekday: 7, weeks: 6 },
  ];

  it.each(STARTS)('mois commençant un jour n° $weekday de la semaine ($month.year-$month.month)', ({ month, weekday, weeks }) => {
    const grid = monthGrid(month);
    expect(grid).toHaveLength(weeks);
    for (const week of grid) expect(week).toHaveLength(7);
    // Le 1er est dans la première semaine, à la colonne de son jour ; avant lui, des jours « outside ».
    expect(grid[0]![weekday - 1]!.date).toBe(firstDayOf(month));
    expect(grid[0]!.slice(0, weekday - 1).every((c) => c.outside)).toBe(true);
    expect(grid[0]!.slice(weekday - 1).every((c) => !c.outside)).toBe(true);
  });

  it('couvre les semaines complètes du lundi au dimanche, sans trou ni doublon', () => {
    for (let year = 2026; year <= 2030; year++) {
      for (let month = 1; month <= 12; month++) {
        const cells = monthGrid(m(year, month)).flat();
        expect(isoWeekday(cells[0]!.date)).toBe(1);
        expect(isoWeekday(cells.at(-1)!.date)).toBe(7);
        expect(cells.length % 7).toBe(0);
        expect(cells.length).toBeGreaterThanOrEqual(28);
        expect(cells.length).toBeLessThanOrEqual(42);
        cells.forEach((cell, i) => {
          if (i > 0) expect(diffDays(cells[i - 1]!.date, cell.date)).toBe(1);
          expect(cell.day).toBe(Number(cell.date.slice(8)));
          expect(cell.outside).toBe(!cell.date.startsWith(monthKey(m(year, month))));
        });
        expect(cells.filter((c) => !c.outside)).toHaveLength(daysInMonth(year, month));
        // Moins d'une semaine avant et après le mois.
        expect(cells.findIndex((c) => !c.outside)).toBeLessThan(7);
        expect(cells.length - 1 - cells.map((c) => c.outside).lastIndexOf(false)).toBeLessThan(7);
      }
    }
  });

  it('mois de l’epoch : octobre 2026, le 5 est un lundi', () => {
    const grid = monthGrid(m(2026, 10));
    expect(grid[0]!.map((c) => c.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(grid[1]![0]).toEqual({ date: '2026-10-05', day: 5, outside: false });
    expect(grid.at(-1)!.map((c) => c.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(grid.at(-1)!.map((c) => c.outside)).toEqual([false, false, false, false, false, false, true]);
  });

  it('février : 28 jours sur exactement 4 semaines (2027), bissextile (2024, 2028), 2100 ne l’est pas', () => {
    const feb2027 = monthGrid(m(2027, 2));
    expect(feb2027).toHaveLength(4);
    expect(feb2027.flat().every((c) => !c.outside)).toBe(true);

    const feb2024 = monthGrid(m(2024, 2)).flat();
    expect(feb2024.filter((c) => !c.outside).map((c) => c.day).at(-1)).toBe(29);
    expect(feb2024.some((c) => c.date === '2024-02-29' && !c.outside)).toBe(true);
    expect(monthGrid(m(2028, 2)).flat().filter((c) => !c.outside)).toHaveLength(29);

    const feb2100 = monthGrid(m(2100, 2)).flat();
    expect(feb2100.filter((c) => !c.outside)).toHaveLength(28);
    expect(feb2100.some((c) => c.date === '2100-02-29')).toBe(false);
  });
});

describe('bornes', () => {
  const first = '2026-10-05';

  it('mois affichables : du mois de l’epoch à celui d’aujourd’hui', () => {
    expect(monthBounds(first, '2027-03-15')).toEqual({ min: m(2026, 10), max: m(2027, 3) });
    expect(monthBounds(first, first)).toEqual({ min: m(2026, 10), max: m(2026, 10) });
    // Horloge avant l’epoch : un seul mois, celui de l’epoch.
    expect(monthBounds(first, '2026-08-01')).toEqual({ min: m(2026, 10), max: m(2026, 10) });
  });

  it('clampMonth ramène dans les bornes et laisse intact ce qui est dedans', () => {
    const today = '2027-03-15';
    expect(clampMonth(m(2026, 9), first, today)).toEqual(m(2026, 10));
    expect(clampMonth(m(2020, 1), first, today)).toEqual(m(2026, 10));
    expect(clampMonth(m(2027, 4), first, today)).toEqual(m(2027, 3));
    expect(clampMonth(m(2030, 1), first, today)).toEqual(m(2027, 3));
    expect(clampMonth(m(2026, 10), first, today)).toEqual(m(2026, 10));
    expect(clampMonth(m(2027, 1), first, today)).toEqual(m(2027, 1));
    expect(clampMonth(m(2027, 3), first, today)).toEqual(m(2027, 3));
  });

  it('jours jouables : de l’epoch à aujourd’hui, inclus', () => {
    const today = '2026-10-20';
    expect(isPlayable('2026-10-04', first, today)).toBe(false);
    expect(isPlayable('2026-10-05', first, today)).toBe(true);
    expect(isPlayable('2026-10-20', first, today)).toBe(true);
    expect(isPlayable('2026-10-21', first, today)).toBe(false);
    expect(clampDate('2026-09-01', first, today)).toBe('2026-10-05');
    expect(clampDate('2026-12-01', first, today)).toBe('2026-10-20');
    expect(clampDate('2026-10-12', first, today)).toBe('2026-10-12');
  });

  it('playableDays : mois de l’epoch, mois courant, mois intermédiaire, mois hors bornes', () => {
    const today = '2026-12-10';
    const oct = playableDays(m(2026, 10), first, today);
    expect(oct).toHaveLength(27);
    expect(oct[0]).toBe('2026-10-05');
    expect(oct.at(-1)).toBe('2026-10-31');
    expect(playableDays(m(2026, 11), first, today)).toHaveLength(30);
    const dec = playableDays(m(2026, 12), first, today);
    expect(dec).toHaveLength(10);
    expect(dec.at(-1)).toBe('2026-12-10');
    expect(playableDays(m(2026, 9), first, today)).toEqual([]);
    expect(playableDays(m(2027, 1), first, today)).toEqual([]);
    // Premier jour : un seul jour jouable.
    expect(playableDays(m(2026, 10), first, first)).toEqual(['2026-10-05']);
  });

  it('focusableDay : jour mémorisé, sinon aujourd’hui, sinon premier jour jouable', () => {
    const today = '2026-12-10';
    expect(focusableDay(m(2026, 12), '2026-12-03', first, today)).toBe('2026-12-03');
    expect(focusableDay(m(2026, 12), null, first, today)).toBe('2026-12-10');
    expect(focusableDay(m(2026, 12), '2026-11-03', first, today)).toBe('2026-12-10');
    expect(focusableDay(m(2026, 12), '2026-12-25', first, today)).toBe('2026-12-10');
    expect(focusableDay(m(2026, 11), null, first, today)).toBe('2026-11-01');
    expect(focusableDay(m(2026, 10), null, first, today)).toBe('2026-10-05');
    expect(focusableDay(m(2026, 10), '2026-10-02', first, today)).toBe('2026-10-05');
    expect(focusableDay(m(2027, 2), null, first, today)).toBeNull();
    expect(focusableDay(m(2026, 9), '2026-09-30', first, today)).toBeNull();
  });
});

describe('navigation au clavier', () => {
  const first = '2026-10-05';
  const today = '2027-03-17'; // mercredi
  const go = (from: string, key: string) => keyboardTarget(from, key, first, today);

  it('flèches : ±1 jour, ±7 jours, en passant les frontières de mois', () => {
    expect(go('2026-11-10', 'ArrowRight')).toBe('2026-11-11');
    expect(go('2026-11-10', 'ArrowLeft')).toBe('2026-11-09');
    expect(go('2026-11-10', 'ArrowDown')).toBe('2026-11-17');
    expect(go('2026-11-10', 'ArrowUp')).toBe('2026-11-03');
    expect(go('2026-11-30', 'ArrowRight')).toBe('2026-12-01');
    expect(go('2026-12-01', 'ArrowLeft')).toBe('2026-11-30');
    expect(go('2026-12-29', 'ArrowDown')).toBe('2027-01-05');
    expect(go('2027-01-03', 'ArrowUp')).toBe('2026-12-27');
  });

  it('PageUp / PageDown : ±1 mois en gardant le quantième (ramené au dernier jour)', () => {
    expect(go('2026-12-15', 'PageDown')).toBe('2027-01-15');
    expect(go('2027-01-15', 'PageUp')).toBe('2026-12-15');
    expect(go('2026-12-31', 'PageDown')).toBe('2027-01-31');
    expect(go('2027-01-31', 'PageDown')).toBe('2027-02-28');
    expect(go('2027-03-17', 'PageUp')).toBe('2027-02-17');
    expect(go('2026-11-30', 'PageUp')).toBe('2026-10-30');
    expect(go('2026-12-31', 'PageUp')).toBe('2026-11-30');
  });

  it('PageDown pour 29 février : mois suivant sans débordement, année bissextile comprise', () => {
    const wide = (from: string, key: string) => keyboardTarget(from, key, '2026-01-01', '2030-01-01');
    expect(wide('2028-02-29', 'PageDown')).toBe('2028-03-29');
    expect(wide('2028-02-29', 'PageUp')).toBe('2028-01-29');
    expect(wide('2028-01-31', 'PageDown')).toBe('2028-02-29');
    expect(wide('2029-01-31', 'PageDown')).toBe('2029-02-28');
  });

  it('Home / End : lundi et dimanche de la semaine', () => {
    // Mercredi 2026-12-09 → lundi 7 / dimanche 13.
    expect(go('2026-12-09', 'Home')).toBe('2026-12-07');
    expect(go('2026-12-09', 'End')).toBe('2026-12-13');
    // Déjà sur le lundi / le dimanche : ne bouge pas.
    expect(go('2026-12-07', 'Home')).toBe('2026-12-07');
    expect(go('2026-12-13', 'End')).toBe('2026-12-13');
    // Semaine à cheval sur deux mois.
    expect(go('2026-12-31', 'Home')).toBe('2026-12-28');
    expect(go('2026-12-31', 'End')).toBe('2027-01-03');
  });

  it('reste entre l’epoch et aujourd’hui', () => {
    // Début : la semaine de l’epoch commence un lundi (le 5), mais un jour avant lui est exclu.
    const midweek = (from: string, key: string) => keyboardTarget(from, key, '2026-10-07', today);
    expect(midweek('2026-10-07', 'ArrowLeft')).toBe('2026-10-07');
    expect(midweek('2026-10-09', 'Home')).toBe('2026-10-07');
    expect(midweek('2026-10-10', 'ArrowUp')).toBe('2026-10-07');
    expect(midweek('2026-10-20', 'PageUp')).toBe('2026-10-07');
    expect(go('2026-10-05', 'ArrowLeft')).toBe('2026-10-05');
    expect(go('2026-10-05', 'ArrowUp')).toBe('2026-10-05');
    // Fin : aujourd’hui (mercredi 17 mars 2027).
    expect(go('2027-03-17', 'ArrowRight')).toBe('2027-03-17');
    expect(go('2027-03-17', 'ArrowDown')).toBe('2027-03-17');
    expect(go('2027-03-17', 'End')).toBe('2027-03-17');
    expect(go('2027-03-16', 'End')).toBe('2027-03-17');
    expect(go('2027-02-10', 'PageDown')).toBe('2027-03-10');
    expect(go('2027-02-17', 'PageDown')).toBe('2027-03-17');
    expect(go('2027-02-26', 'PageDown')).toBe('2027-03-17');
  });

  it('autres touches : aucune cible', () => {
    for (const key of ['Enter', ' ', 'Tab', 'Escape', 'a', 'Shift']) expect(go('2026-11-10', key)).toBeNull();
  });
});
