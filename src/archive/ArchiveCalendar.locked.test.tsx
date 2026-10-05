/** Calendrier : jours verrouillés (cadenas, état, légende, description), sans écran ni monétisation. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ISODate } from '../../engine/core/date';
import { initI18n, setLanguage } from '../i18n';
import { ICON_PATHS } from '../ui/icons.generated';
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
const FIRST = '2026-10-05';
const TODAY = '2026-11-18';

function Harness({ locked, onSelect = () => {} }: { locked?: (date: ISODate) => boolean; onSelect?: (date: ISODate) => void }) {
  const [month, setMonth] = useState<MonthRef>({ year: 2026, month: 11 });
  return <ArchiveCalendar month={month} onMonthChange={setMonth} today={TODAY} first={FIRST} status={() => 'none'} locked={locked} onSelect={onSelect} />;
}

const day = (date: ISODate) => document.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)!;
const legend = () => [...document.querySelectorAll<HTMLElement>('.archive-cal__legend li')];
/** Verrouillé avant le 10 novembre. */
const before10 = (date: ISODate) => date < '2026-11-10';

describe('calendrier : jours verrouillés', () => {
  it('cadenas, état et nom accessible des seuls jours verrouillés', () => {
    render(<Harness locked={before10} />);
    const locked = day('2026-11-09');
    expect(locked.dataset['status']).toBe('locked');
    expect(locked.getAttribute('aria-label')).toBe(`lundi 9 novembre 2026${NBSP}: verrouillé`);
    expect(locked.querySelector('.archive-day__badge path')!.getAttribute('d')).toBe(ICON_PATHS.lock.filled);
    expect(locked.disabled).toBe(false);

    const free = day('2026-11-10');
    expect(free.dataset['status']).toBe('none');
    expect(free.getAttribute('aria-label')).toBe(`mardi 10 novembre 2026${NBSP}: non joué`);
    expect(free.querySelector('.archive-day__badge')).toBeNull();
    // Le futur n'est jamais verrouillé : il reste désactivé.
    expect(day('2026-11-19').dataset['status']).toBeUndefined();
    expect(day('2026-11-19').disabled).toBe(true);
  });

  it('un jour verrouillé se sélectionne comme les autres (à l’appelant de réagir) ; les gestes clavier y passent', () => {
    const onSelect = vi.fn();
    render(<Harness locked={before10} onSelect={onSelect} />);
    fireEvent.click(day('2026-11-03'));
    expect(onSelect).toHaveBeenCalledWith('2026-11-03');
    day('2026-11-03').focus();
    fireEvent.keyDown(day('2026-11-03'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(day('2026-11-04'));
  });

  it('légende : l’entrée « verrouillé » (cadenas) s’ajoute aux autres états', () => {
    render(<Harness locked={before10} />);
    expect(legend().map((item) => item.textContent)).toEqual(['résolu à temps', 'résolu plus tard', 'gel de série utilisé', 'en cours', 'verrouillé']);
    expect(legend().at(-1)!.dataset['status']).toBe('locked');
    expect(legend().at(-1)!.querySelector('path')!.getAttribute('d')).toBe(ICON_PATHS.lock.filled);
  });

  it('légende selon le mois : l’entrée apparaît en octobre (jours verrouillés) mais pas quand le mois en est exempt', () => {
    // Tout ce qui précède le 10 octobre est verrouillé : novembre n'en compte aucun.
    render(<Harness locked={(date) => date < '2026-10-10'} />);
    expect(legend()).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(legend().map((item) => item.dataset['status'])).toEqual(['solved', 'late', 'frozen', 'progress', 'locked']);
    fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
    expect(legend()).toHaveLength(4);
  });

  it('description « toucher pour débloquer » partagée par les jours verrouillés', () => {
    render(<Harness locked={before10} />);
    const hint = document.getElementById(day('2026-11-09').getAttribute('aria-describedby')!)!;
    expect(hint.textContent).toBe('Touchez pour débloquer ce puzzle avec une courte vidéo');
    expect(hint.className).toContain('md-sr-only');
    expect(day('2026-11-08').getAttribute('aria-describedby')).toBe(hint.id);
    expect(day('2026-11-12').hasAttribute('aria-describedby')).toBe(false);
  });

  it('sans verrouillage fourni : calendrier inchangé, ni légende ni description', () => {
    render(<Harness />);
    expect(legend()).toHaveLength(4);
    expect(document.querySelector('[aria-describedby]')).toBeNull();
    expect(document.querySelector('[data-status="locked"]')).toBeNull();
  });

  it('anglais', async () => {
    await setLanguage('en');
    render(<Harness locked={before10} />);
    expect(day('2026-11-09').getAttribute('aria-label')).toBe('Monday, November 9, 2026: locked');
    expect(within(screen.getByRole('list', { name: 'Legend' })).getAllByRole('listitem').at(-1)!.textContent).toBe('locked');
    expect(document.getElementById(day('2026-11-09').getAttribute('aria-describedby')!)!.textContent).toBe('Tap to unlock this puzzle with a short video');
  });
});
