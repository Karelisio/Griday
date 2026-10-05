import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ISODate } from '../../engine/core/date';
import { initI18n, setLanguage } from '../i18n';
import type { DayStatus } from '../progress/types';
import { installMatchMedia } from '../ui/testing';
import { ArchiveCalendar } from './ArchiveCalendar';
import type { MonthRef } from './calendarModel';

installMatchMedia();
beforeAll(async () => {
  await initI18n('fr');
});
afterEach(async () => {
  await setLanguage('fr');
});

const NBSP = ' ';
const FIRST = '2026-10-05'; // lundi, jour n° 1
const TODAY = '2026-11-18'; // mercredi
const NOVEMBER: MonthRef = { year: 2026, month: 11 };
const OCTOBER: MonthRef = { year: 2026, month: 10 };

interface HarnessProps {
  readonly initial?: MonthRef;
  readonly today?: ISODate;
  readonly first?: ISODate;
  readonly statuses?: Record<ISODate, DayStatus>;
  readonly onSelect?: (date: ISODate) => void;
  readonly onMonthChange?: (month: MonthRef) => void;
}

/** Parent contrôlant le mois, comme l’écran des archives. */
function Harness({ initial = NOVEMBER, today = TODAY, first = FIRST, statuses = {}, onSelect = () => {}, onMonthChange = () => {} }: HarnessProps) {
  const [month, setMonth] = useState(initial);
  return (
    <ArchiveCalendar
      month={month}
      onMonthChange={(next) => {
        onMonthChange(next);
        setMonth(next);
      }}
      today={today}
      first={first}
      status={(date) => statuses[date] ?? 'none'}
      onSelect={onSelect}
    />
  );
}

const day = (date: ISODate) => document.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)!;
const focused = () => (document.activeElement as HTMLElement | null)?.dataset['date'];
const press = (key: string, init: object = {}) => fireEvent.keyDown(document.activeElement!, { key, ...init });
const focus = (date: ISODate) => act(() => day(date).focus());
const heading = () => screen.getByRole('heading', { level: 2 }).textContent;

describe('calendrier des archives', () => {
  it('titre du mois localisé, jours de la semaine à partir du lundi', () => {
    render(<Harness />);
    expect(heading()).toBe('novembre 2026');
    expect(screen.getByRole('grid', { name: 'novembre 2026' })).toBeTruthy();
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.getAttribute('aria-label'))).toEqual(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']);
    expect(headers.map((h) => h.textContent)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
  });

  it('une ligne par semaine de sept cases ; les cases hors mois sont vides', () => {
    render(<Harness />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(1 + 6); // en-tête + 6 semaines (le 1er novembre 2026 est un dimanche)
    const first = within(rows[1]!).getAllByRole('gridcell');
    expect(first).toHaveLength(7);
    expect(first.map((cell) => cell.querySelector('button') !== null)).toEqual([false, false, false, false, false, false, true]);
    expect(document.querySelectorAll('button[data-date]')).toHaveLength(30);
  });

  it('chaque jour porte sa date complète et son état dans son nom accessible', () => {
    render(
      <Harness
        statuses={{ '2026-11-02': 'solved', '2026-11-03': 'late', '2026-11-04': 'frozen', '2026-11-05': 'progress', '2026-11-18': 'solved' }}
      />,
    );
    const name = (date: ISODate) => day(date).getAttribute('aria-label');
    expect(name('2026-11-02')).toBe(`lundi 2 novembre 2026${NBSP}: résolu le jour même`);
    expect(name('2026-11-03')).toBe(`mardi 3 novembre 2026${NBSP}: résolu plus tard`);
    expect(name('2026-11-04')).toBe(`mercredi 4 novembre 2026${NBSP}: gel de série utilisé`);
    expect(name('2026-11-05')).toBe(`jeudi 5 novembre 2026${NBSP}: en cours`);
    expect(name('2026-11-06')).toBe(`vendredi 6 novembre 2026${NBSP}: non joué`);
    expect(name('2026-11-18')).toBe(`mercredi 18 novembre 2026 (aujourd’hui)${NBSP}: résolu le jour même`);
    // Accessible par rôle et nom.
    expect(screen.getByRole('button', { name: /^mardi 3 novembre 2026\s: résolu plus tard$/ })).toBe(day('2026-11-03'));
    // Pastille de coin pour les états résolu, tardif et gelé ; point pour « en cours » ; rien sinon.
    const decoration = (date: ISODate) => day(date).querySelector('.archive-day__badge, .archive-day__dot')?.className ?? null;
    expect(decoration('2026-11-02')).toBe('archive-day__badge');
    expect(decoration('2026-11-03')).toBe('archive-day__badge');
    expect(decoration('2026-11-04')).toBe('archive-day__badge');
    expect(decoration('2026-11-05')).toBe('archive-day__dot');
    expect(decoration('2026-11-06')).toBeNull();
    expect(day('2026-11-02').dataset['status']).toBe('solved');
  });

  it('jours hors de l’intervalle jouable : désactivés, sans nom d’état ni tabindex', () => {
    render(<Harness initial={OCTOBER} today="2026-10-20" />);
    for (const date of ['2026-10-01', '2026-10-04', '2026-10-21', '2026-10-31']) {
      expect(day(date).disabled, date).toBe(true);
      expect(day(date).tabIndex, date).toBe(-1);
    }
    expect(day('2026-10-05').disabled).toBe(false);
    expect(day('2026-10-20').disabled).toBe(false);
    expect(day('2026-10-21').getAttribute('aria-label')).toBe('mercredi 21 octobre 2026');
    // Les cases voisines du mois n’existent pas : 30 septembre absent d’octobre.
    expect(day('2026-09-30')).toBeNull();
  });

  it('aujourd’hui : aria-current="date" sur lui seul', () => {
    render(<Harness />);
    const current = document.querySelectorAll('[aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(day(TODAY));
    expect(current[0]!.getAttribute('aria-current')).toBe('date');
    expect(day(TODAY).dataset['today']).toBeDefined();
  });

  it('un seul jour tabulable (tabindex itinérant) : aujourd’hui, sinon le premier jour jouable', () => {
    const { unmount } = render(<Harness />);
    const stops = () => [...document.querySelectorAll<HTMLButtonElement>('button[data-date]')].filter((b) => b.tabIndex === 0).map((b) => b.dataset['date']);
    expect(stops()).toEqual([TODAY]);
    focus('2026-11-10');
    expect(stops()).toEqual(['2026-11-10']);
    unmount();

    render(<Harness initial={OCTOBER} />);
    expect(stops()).toEqual([FIRST]);
  });

  it('flèches : un jour, une semaine ; Début / Fin : lundi et dimanche (bornés à aujourd’hui)', () => {
    render(<Harness />);
    focus(TODAY);
    press('ArrowLeft');
    expect(focused()).toBe('2026-11-17');
    press('ArrowUp');
    expect(focused()).toBe('2026-11-10');
    press('ArrowRight');
    expect(focused()).toBe('2026-11-11');
    press('Home');
    expect(focused()).toBe('2026-11-09');
    press('End');
    expect(focused()).toBe('2026-11-15');
    press('ArrowDown');
    expect(focused()).toBe('2026-11-18'); // 22 novembre est dans le futur : ramené à aujourd’hui
    press('ArrowRight');
    expect(focused()).toBe('2026-11-18');
    press('End');
    expect(focused()).toBe('2026-11-18');
  });

  it('la touche est consommée seulement quand elle déplace le focus', () => {
    render(<Harness />);
    focus(TODAY);
    expect(fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })).toBe(false); // preventDefault
    expect(fireEvent.keyDown(document.activeElement!, { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(document.activeElement!, { key: 'a' })).toBe(true);
    // Modificateurs : raccourcis du navigateur ou du système, laissés tranquilles.
    for (const init of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
      expect(fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft', ...init })).toBe(true);
    }
    expect(focused()).toBe('2026-11-17');
  });

  it('PageUp / PageDown : mois précédent / suivant, même quantième, focus conservé', () => {
    const onMonthChange = vi.fn();
    render(<Harness onMonthChange={onMonthChange} />);
    focus(TODAY);
    press('PageUp');
    expect(onMonthChange).toHaveBeenLastCalledWith(OCTOBER);
    expect(heading()).toBe('octobre 2026');
    expect(focused()).toBe('2026-10-18');
    press('PageDown');
    expect(onMonthChange).toHaveBeenLastCalledWith(NOVEMBER);
    expect(heading()).toBe('novembre 2026');
    expect(focused()).toBe('2026-11-18');
    // Au-delà d’aujourd’hui : borné.
    press('PageDown');
    expect(heading()).toBe('novembre 2026');
    expect(focused()).toBe('2026-11-18');
  });

  it('le focus suit les flèches dans le mois voisin', () => {
    render(<Harness />);
    focus('2026-11-02');
    press('ArrowLeft');
    expect(focused()).toBe('2026-11-01');
    expect(heading()).toBe('novembre 2026');
    press('ArrowLeft');
    expect(heading()).toBe('octobre 2026');
    expect(focused()).toBe('2026-10-31');
    expect(day('2026-10-31').tabIndex).toBe(0);
    press('ArrowDown'); // 7 novembre : retour en novembre
    expect(heading()).toBe('novembre 2026');
    expect(focused()).toBe('2026-11-07');
  });

  it('bloqué sur le premier jour (epoch)', () => {
    render(<Harness initial={OCTOBER} />);
    focus('2026-10-06');
    press('ArrowLeft');
    expect(focused()).toBe(FIRST);
    press('ArrowLeft');
    press('ArrowUp');
    press('Home');
    press('PageUp');
    expect(heading()).toBe('octobre 2026');
    expect(focused()).toBe(FIRST);
  });

  it('sélection : un clic sur un jour jouable appelle onSelect, jamais sur un jour désactivé', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.click(day('2026-11-03'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('2026-11-03');
    fireEvent.click(day(TODAY));
    expect(onSelect).toHaveBeenLastCalledWith(TODAY);
    fireEvent.click(day('2026-11-19'));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('boutons de mois : désactivés aux bornes, changent de mois ailleurs', () => {
    const onMonthChange = vi.fn();
    render(<Harness onMonthChange={onMonthChange} today="2026-12-10" />);
    const previous = () => screen.getByRole('button', { name: 'Mois précédent' }) as HTMLButtonElement;
    const next = () => screen.getByRole('button', { name: 'Mois suivant' }) as HTMLButtonElement;
    expect([previous().disabled, next().disabled]).toEqual([false, false]);
    fireEvent.click(next());
    expect(onMonthChange).toHaveBeenLastCalledWith({ year: 2026, month: 12 });
    expect(heading()).toBe('décembre 2026');
    expect([previous().disabled, next().disabled]).toEqual([false, true]);
    fireEvent.click(previous());
    fireEvent.click(previous());
    expect(onMonthChange).toHaveBeenLastCalledWith(OCTOBER);
    expect([previous().disabled, next().disabled]).toEqual([true, false]);
    const calls = onMonthChange.mock.calls.length;
    fireEvent.click(previous());
    expect(onMonthChange).toHaveBeenCalledTimes(calls);
  });

  it('un seul mois affichable : les deux boutons sont désactivés', () => {
    render(<Harness initial={OCTOBER} today="2026-10-20" />);
    expect((screen.getByRole('button', { name: 'Mois précédent' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Mois suivant' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('balayage tactile horizontal : mois suivant (vers la gauche) ou précédent (vers la droite)', () => {
    const onMonthChange = vi.fn();
    render(<Harness initial={{ year: 2026, month: 11 }} today="2026-12-10" onMonthChange={onMonthChange} />);
    const grid = screen.getByRole('grid');
    const touch = { pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0 };
    const swipe = (from: number, to: number, y = 100, toY = y) => {
      fireEvent.pointerDown(grid, { ...touch, clientX: from, clientY: y });
      fireEvent.pointerUp(grid, { ...touch, clientX: to, clientY: toY });
    };
    swipe(250, 100);
    expect(onMonthChange).toHaveBeenLastCalledWith({ year: 2026, month: 12 });
    expect(heading()).toBe('décembre 2026');
    swipe(250, 100); // décembre est le dernier mois : rien
    expect(onMonthChange).toHaveBeenCalledTimes(1);
    swipe(100, 250);
    expect(heading()).toBe('novembre 2026');
    swipe(100, 250);
    expect(heading()).toBe('octobre 2026');
    swipe(100, 250); // octobre est le premier mois : rien
    expect(onMonthChange).toHaveBeenCalledTimes(3);
    // Trop court, trop vertical, souris, stylet accepté : seul ce dernier compte.
    swipe(250, 220);
    swipe(250, 150, 50, 200);
    fireEvent.pointerDown(grid, { ...touch, pointerType: 'mouse', clientX: 250, clientY: 100 });
    fireEvent.pointerUp(grid, { ...touch, pointerType: 'mouse', clientX: 100, clientY: 100 });
    expect(onMonthChange).toHaveBeenCalledTimes(3);
    fireEvent.pointerDown(grid, { ...touch, pointerType: 'pen', clientX: 250, clientY: 100 });
    fireEvent.pointerUp(grid, { ...touch, pointerType: 'pen', clientX: 100, clientY: 100 });
    expect(heading()).toBe('novembre 2026');
    // Geste annulé (défilement vertical pris par le navigateur) : ignoré.
    fireEvent.pointerDown(grid, { ...touch, clientX: 250, clientY: 100 });
    fireEvent.pointerCancel(grid, touch);
    fireEvent.pointerUp(grid, { ...touch, clientX: 100, clientY: 100 });
    expect(heading()).toBe('novembre 2026');
  });

  it('légende : couronne, coche, flocon et point, avec le texte des états', () => {
    render(<Harness />);
    const legend = screen.getByRole('list', { name: 'Légende' });
    const items = within(legend).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['résolu le jour même', 'résolu plus tard', 'gel de série utilisé', 'en cours']);
    expect(items.map((item) => item.dataset['status'])).toEqual(['solved', 'late', 'frozen', 'progress']);
    expect(items.map((item) => item.querySelectorAll('svg').length)).toEqual([1, 1, 1, 0]);
    expect(items[3]!.querySelector('.archive-day__dot')).not.toBeNull();
  });

  it('anglais : mois, jours, états et boutons traduits', async () => {
    await setLanguage('en');
    render(<Harness statuses={{ '2026-11-03': 'late' }} />);
    expect(heading()).toBe('November 2026');
    expect(screen.getAllByRole('columnheader').map((h) => h.getAttribute('aria-label'))).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(day('2026-11-03').getAttribute('aria-label')).toBe('Tuesday, November 3, 2026: solved later');
    expect(day(TODAY).getAttribute('aria-label')).toBe('Wednesday, November 18, 2026 (today): not played');
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Legend' })).toBeTruthy();
  });

  it('aucun jour jouable (horloge avant l’epoch) : tout est désactivé, rien ne plante', () => {
    render(<Harness initial={OCTOBER} today="2026-09-01" />);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-date]')];
    expect(buttons).toHaveLength(31);
    expect(buttons.every((b) => b.disabled && b.tabIndex === -1)).toBe(true);
    expect(document.querySelector('[aria-current]')).toBeNull();
    expect((screen.getByRole('button', { name: 'Mois précédent' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Mois suivant' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
