/** Gel de série offert dans la carte de série : bouton, délai avant le prochain, réserve pleine. */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initI18n, setLanguage } from '../i18n';
import type { StreakSummary } from '../progress/types';
import { ICON_PATHS } from '../ui/icons.generated';
import { StreakCard, type FreezeAction } from './StreakCard';

beforeAll(async () => {
  await initI18n('fr');
});
afterEach(async () => {
  await setLanguage('fr');
});

const summary = (freezes: number): StreakSummary => ({ current: 12, best: 21, freezes, todaySolved: false, atRisk: true });
const offer = (over: Partial<FreezeAction> = {}): FreezeAction => ({ available: true, nextOn: null, instant: false, onClaim: () => {}, ...over });
const claim = () => screen.queryByRole('button', { name: 'Obtenir un gel' });
const iconOf = (button: HTMLElement) => button.querySelector('svg path')!.getAttribute('d');

describe('gel offert dans la carte de série', () => {
  it('disponible : bouton tonal avec l’icône de vidéo, qui déclenche la demande', () => {
    const onClaim = vi.fn();
    render(<StreakCard summary={summary(1)} freeze={offer({ onClaim })} />);
    const button = claim()!;
    expect(button.className).toContain('md-button--tonal');
    expect(iconOf(button)).toBe(ICON_PATHS.smart_display.outline);
    fireEvent.click(button);
    expect(onClaim).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Prochain gel/)).toBeNull();
    expect(screen.queryByText('Réserve pleine')).toBeNull();
  });

  it('sans vidéo (Premium, build sans publicité) : icône de gel', () => {
    render(<StreakCard summary={summary(0)} freeze={offer({ instant: true })} />);
    expect(iconOf(claim()!)).toBe(ICON_PATHS.ac_unit.outline);
  });

  it('délai non écoulé : le prochain jour possible remplace le bouton', () => {
    render(<StreakCard summary={summary(1)} freeze={offer({ available: false, nextOn: '2026-11-22' })} />);
    expect(claim()).toBeNull();
    expect(screen.getByText('Prochain gel offert le dimanche 22 novembre')).toBeTruthy();
  });

  it('réserve pleine : le texte l’emporte sur le délai', () => {
    const { rerender } = render(<StreakCard summary={summary(2)} freeze={offer({ available: false, nextOn: null })} />);
    expect(claim()).toBeNull();
    expect(screen.getByText('Réserve pleine')).toBeTruthy();
    rerender(<StreakCard summary={summary(2)} freeze={offer({ available: false, nextOn: '2026-11-22' })} />);
    expect(screen.getByText('Réserve pleine')).toBeTruthy();
    expect(screen.queryByText(/Prochain gel/)).toBeNull();
  });

  it('sans offre fournie (carte isolée) : rien de plus que les gels et leur explication', () => {
    render(<StreakCard summary={summary(1)} />);
    expect(claim()).toBeNull();
    expect(screen.queryByText(/Prochain gel/)).toBeNull();
    expect(screen.queryByText('Réserve pleine')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('anglais', async () => {
    await setLanguage('en');
    const { rerender } = render(<StreakCard summary={summary(1)} freeze={offer()} />);
    expect(screen.getByRole('button', { name: 'Get a freeze' })).toBeTruthy();
    rerender(<StreakCard summary={summary(1)} freeze={offer({ available: false, nextOn: '2026-11-22' })} />);
    expect(screen.getByText('Next free freeze on Sunday, November 22')).toBeTruthy();
    rerender(<StreakCard summary={summary(2)} freeze={offer({ available: false })} />);
    expect(screen.getByText('Reserve full')).toBeTruthy();
  });
});
