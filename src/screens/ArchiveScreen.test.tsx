import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISODate } from '../../engine/core/date';
import { initI18n, setLanguage } from '../i18n';
import { dailyProgressKey } from '../persistence';
import { saveJSON } from '../platform/storage';
import { ProgressProvider, useProgress } from '../progress/ProgressContext';
import type { ProgressData } from '../progress/store';
import { EMPTY_STREAK } from '../progress/streak';
import type { DailyResult } from '../progress/types';
import { installMatchMedia } from '../ui/testing';
import { ArchiveScreen } from './ArchiveScreen';

installMatchMedia();
beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => {
  localStorage.clear();
  setToday(2026, 11, 18);
});
afterEach(async () => {
  vi.useRealTimers();
  await setLanguage('fr');
});

/** Fige la date du jour (les minuteries restent réelles) : le jour n° 1 est le 5 octobre 2026. */
function setToday(year: number, month: number, day: number): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(year, month - 1, day, 12));
}

/** Minuit passé, l'app revient au premier plan : la date du jour est relue (écran resté monté). */
function nextDay(year: number, month: number, day: number): void {
  setToday(year, month, day);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

const NBSP = ' ';
const result = (date: ISODate, mode: 'daily' | 'archive', solvedOn: ISODate = date): DailyResult => ({
  date,
  size: 7,
  tier: 2,
  timeMs: 61_000,
  hintsUsed: 0,
  mode,
  solvedOn,
});

/** Progression : en novembre deux jours résolus (un à temps, un rattrapé) et un jour gelé ; le 5 octobre résolu. */
function progress(): ProgressData {
  return {
    history: new Map([
      ['2026-11-02', result('2026-11-02', 'daily')],
      ['2026-11-03', result('2026-11-03', 'archive', '2026-11-10')],
      ['2026-10-05', result('2026-10-05', 'daily')],
    ]),
    unlimited: [],
    streak: { ...EMPTY_STREAK, frozen: ['2026-11-04'], settledThrough: '2026-11-17' },
  };
}

/** Aucune progression, les jours précédant `today` réglés. */
const blank = (settledThrough: ISODate): ProgressData => ({ history: new Map(), unlimited: [], streak: { ...EMPTY_STREAK, settledThrough } });

const startedGame = { marks: '0200000', past: ['0000000'] };
const untouchedGame = { marks: '0000000', past: [] };

/** Enregistre un résultat via le contexte, comme le ferait une partie terminée. */
function Recorder({ solved }: { solved: DailyResult }) {
  const { recordDaily } = useProgress();
  return (
    <button type="button" onClick={() => recordDaily(solved)}>
      record
    </button>
  );
}

function renderScreen({ visible = true, onOpen = () => {}, data = progress(), solved }: { visible?: boolean; onOpen?: (date: ISODate) => void; data?: ProgressData; solved?: DailyResult } = {}) {
  const ui = (v: boolean) => (
    <ProgressProvider initial={data}>
      <ArchiveScreen visible={v} onOpen={onOpen} />
      {solved && <Recorder solved={solved} />}
    </ProgressProvider>
  );
  const view = render(ui(visible));
  return { setVisible: (v: boolean) => view.rerender(ui(v)) };
}

const day = (date: ISODate) => document.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)!;
const label = (date: ISODate) => day(date).getAttribute('aria-label');
const month = () => screen.getByRole('heading', { level: 2, hidden: true }).textContent;
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('écran des archives', () => {
  it('en-tête, calendrier du mois courant et état de chaque jour', async () => {
    await saveJSON(dailyProgressKey('2026-11-05'), startedGame);
    await saveJSON(dailyProgressKey('2026-11-07'), untouchedGame); // ouverte puis laissée vierge
    await saveJSON(dailyProgressKey('2026-11-02'), startedGame); // déjà résolu : l’emporte
    renderScreen();

    expect(screen.getByRole('region', { name: 'Archives' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Archives');
    expect(month()).toBe('novembre 2026');

    // Parties entamées relues du stockage (asynchrone).
    expect(await screen.findByRole('button', { name: /^jeudi 5 novembre 2026\s: en cours$/ })).toBeTruthy();
    expect(label('2026-11-02')).toBe(`lundi 2 novembre 2026${NBSP}: résolu à temps`);
    expect(label('2026-11-03')).toBe(`mardi 3 novembre 2026${NBSP}: résolu plus tard`);
    expect(label('2026-11-04')).toBe(`mercredi 4 novembre 2026${NBSP}: gel de série utilisé`);
    expect(label('2026-11-06')).toBe(`vendredi 6 novembre 2026${NBSP}: non joué`);
    expect(label('2026-11-07')).toBe(`samedi 7 novembre 2026${NBSP}: non joué`);
    expect(label('2026-11-18')).toBe(`mercredi 18 novembre 2026 (aujourd’hui)${NBSP}: non joué`);
    expect(label('2026-11-19')).toBe('jeudi 19 novembre 2026');
    expect(day('2026-11-19').disabled).toBe(true);
    expect(day('2026-11-18').getAttribute('aria-current')).toBe('date');
  });

  it('résumé du mois : jours résolus (à temps ou plus tard) sur jours jouables', () => {
    renderScreen();
    expect(screen.getByText('2 jours résolus sur 18')).toBeTruthy();
  });

  it('toucher un jour appelle onOpen avec sa date, aujourd’hui compris', () => {
    const onOpen = vi.fn();
    renderScreen({ onOpen });
    fireEvent.click(day('2026-11-03'));
    expect(onOpen).toHaveBeenLastCalledWith('2026-11-03');
    fireEvent.click(day('2026-11-18'));
    expect(onOpen).toHaveBeenLastCalledWith('2026-11-18');
    fireEvent.click(day('2026-11-19')); // futur : désactivé
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('navigation entre les mois : résumé, parties entamées et bornes (jour n° 1, mois courant)', async () => {
    await saveJSON(dailyProgressKey('2026-10-20'), startedGame);
    renderScreen();
    expect([button('Mois précédent').disabled, button('Mois suivant').disabled]).toEqual([false, true]);

    fireEvent.click(button('Mois précédent'));
    expect(month()).toBe('octobre 2026');
    expect(screen.getByText('1 jour résolu sur 27')).toBeTruthy(); // du 5 au 31 octobre
    expect(await screen.findByRole('button', { name: /^mardi 20 octobre 2026\s: en cours$/ })).toBeTruthy();
    expect(day('2026-10-04').disabled).toBe(true); // avant le jour n° 1
    expect(day('2026-10-05').disabled).toBe(false);
    expect(label('2026-10-05')).toBe(`lundi 5 octobre 2026${NBSP}: résolu à temps`);
    expect([button('Mois précédent').disabled, button('Mois suivant').disabled]).toEqual([true, false]);

    fireEvent.click(button('Mois suivant'));
    expect(month()).toBe('novembre 2026');
    expect(screen.getByText('2 jours résolus sur 18')).toBeTruthy();
    expect([button('Mois précédent').disabled, button('Mois suivant').disabled]).toEqual([false, true]);
  });

  it('app restée ouverte au changement de mois : l’écran suit le nouveau mois courant', () => {
    setToday(2026, 11, 30);
    renderScreen({ data: blank('2026-11-29') });
    expect(month()).toBe('novembre 2026');
    expect(screen.getByText('0 jour résolu sur 30')).toBeTruthy();

    nextDay(2026, 12, 1);
    expect(month()).toBe('décembre 2026');
    expect(screen.getByText('0 jour résolu sur 1')).toBeTruthy(); // le 1er : un seul jour jouable
    expect(day('2026-12-01').getAttribute('aria-current')).toBe('date');
    expect(day('2026-12-02').disabled).toBe(true);
    expect([button('Mois précédent').disabled, button('Mois suivant').disabled]).toEqual([false, true]);

    nextDay(2027, 1, 1); // et ainsi de suite, passage d’année compris
    expect(month()).toBe('janvier 2027');
  });

  it('mois choisi exprès : gardé au changement de mois, suivi de nouveau dès le retour au mois courant', () => {
    setToday(2026, 11, 30);
    renderScreen({ data: blank('2026-11-29') });
    fireEvent.click(button('Mois précédent'));
    expect(month()).toBe('octobre 2026');

    nextDay(2026, 12, 1);
    expect(month()).toBe('octobre 2026'); // le joueur a quitté le mois courant : son choix est respecté
    expect(button('Mois suivant').disabled).toBe(false); // novembre et décembre sont désormais atteignables

    fireEvent.click(button('Mois suivant'));
    expect(month()).toBe('novembre 2026');
    nextDay(2026, 12, 2);
    expect(month()).toBe('novembre 2026'); // toujours son choix : novembre n’est plus le mois courant

    fireEvent.click(button('Mois suivant'));
    expect(month()).toBe('décembre 2026'); // de retour sur le mois courant : l’écran le suit de nouveau
    nextDay(2027, 1, 1);
    expect(month()).toBe('janvier 2027');
  });

  it('résumé d’un mois à un seul jour jouable : « sur 1 jour » au singulier dans les deux langues', async () => {
    setToday(2026, 12, 1);
    renderScreen({ data: { ...blank('2026-11-30'), history: new Map([['2026-12-01', result('2026-12-01', 'daily')]]) } });
    expect(screen.getByText('1 jour résolu sur 1')).toBeTruthy();
    await act(() => setLanguage('en'));
    expect(screen.getByText('1 of 1 day solved')).toBeTruthy();
  });

  it('parties entamées relues quand l’écran redevient visible (retour d’une partie)', async () => {
    const { setVisible } = renderScreen({ visible: false });
    expect(document.querySelector('section')!.hidden).toBe(true);
    // Partie commencée pendant que l’écran était masqué : relue au retour seulement.
    await saveJSON(dailyProgressKey('2026-11-09'), startedGame);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(label('2026-11-09')).toBe(`lundi 9 novembre 2026${NBSP}: non joué`);

    setVisible(true);
    expect(document.querySelector('section')!.hidden).toBe(false);
    expect(await screen.findByRole('button', { name: /^lundi 9 novembre 2026\s: en cours$/ })).toBeTruthy();

    // Partie vidée entre-temps : le point disparaît au retour suivant.
    setVisible(false);
    await saveJSON(dailyProgressKey('2026-11-09'), untouchedGame);
    setVisible(true);
    expect(await screen.findByRole('button', { name: /^lundi 9 novembre 2026\s: non joué$/ })).toBeTruthy();
  });

  it('une partie terminée met à jour le résumé et l’état du jour', async () => {
    await saveJSON(dailyProgressKey('2026-11-10'), startedGame);
    renderScreen({ solved: result('2026-11-10', 'archive', '2026-11-18') });
    expect(await screen.findByRole('button', { name: /^mardi 10 novembre 2026\s: en cours$/ })).toBeTruthy();
    expect(screen.getByText('2 jours résolus sur 18')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'record' }));
    expect(await screen.findByRole('button', { name: /^mardi 10 novembre 2026\s: résolu plus tard$/ })).toBeTruthy();
    expect(screen.getByText('3 jours résolus sur 18')).toBeTruthy();
  });

  it('lendemain du jour n° 1 : un seul mois, deux jours jouables', () => {
    setToday(2026, 10, 6);
    renderScreen({ data: blank('2026-10-05') });
    expect(month()).toBe('octobre 2026');
    expect(screen.getByText('0 jour résolu sur 2')).toBeTruthy();
    expect(day('2026-10-04').disabled).toBe(true);
    expect(day('2026-10-05').disabled).toBe(false);
    expect(day('2026-10-06').disabled).toBe(false);
    expect(day('2026-10-07').disabled).toBe(true);
    expect([button('Mois précédent').disabled, button('Mois suivant').disabled]).toEqual([true, true]);
  });

  it('jour n° 1 (aucun jour passé) : message d’attente à la place du calendrier', () => {
    setToday(2026, 10, 5);
    renderScreen({ data: blank('2026-10-04') });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Archives');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Pas encore d’archives');
    expect(screen.getByText(/dès demain/)).toBeTruthy();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByText(/jours? résolus?/)).toBeNull();
  });

  it('anglais : titre, résumé, états et message d’attente traduits', async () => {
    await setLanguage('en');
    const { unmount } = render(
      <ProgressProvider initial={progress()}>
        <ArchiveScreen visible onOpen={() => {}} />
      </ProgressProvider>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Archive');
    expect(month()).toBe('November 2026');
    expect(screen.getByText('2 of 18 days solved')).toBeTruthy();
    expect(label('2026-11-03')).toBe('Tuesday, November 3, 2026: solved later');
    unmount();

    setToday(2026, 10, 5);
    render(
      <ProgressProvider initial={blank('2026-10-04')}>
        <ArchiveScreen visible onOpen={() => {}} />
      </ProgressProvider>,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('No archives yet');
    expect(screen.queryByRole('grid')).toBeNull();
  });
});
