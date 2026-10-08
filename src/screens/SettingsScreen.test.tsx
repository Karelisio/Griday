import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n, setLanguage } from '../i18n';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS, type Settings } from '../settings/types';
import { SnackbarHost } from '../ui';
import { installMatchMedia } from '../ui/testing';
import { SettingsScreen } from './SettingsScreen';

installMatchMedia();

const h = vi.hoisted(() => ({
  notificationsAvailable: vi.fn(),
  notificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  scheduleReminders: vi.fn(),
  cancelReminders: vi.fn(),
}));
vi.mock('../platform/notifications', () => h);

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(async () => {
  localStorage.clear();
  h.notificationsAvailable.mockReset().mockReturnValue(true);
  h.notificationPermission.mockReset().mockResolvedValue('granted');
  h.requestNotificationPermission.mockReset().mockResolvedValue('granted');
  await setLanguage('fr');
});

/** Réglages montés comme dans l'app ; `saved()` donne le dernier état enregistré. */
function renderSettings(initial: Partial<Settings> = {}) {
  const onChange = vi.fn();
  render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr', ...initial }} onChange={onChange}>
      <SnackbarHost closeLabel="Fermer">
        <SettingsScreen visible dynamicSupported={false} />
      </SnackbarHost>
    </SettingsProvider>,
  );
  return { saved: () => onChange.mock.lastCall?.[0] as Settings | undefined };
}
const reminderSwitch = () => screen.getByRole('switch', { name: 'Activer le rappel' });
const timeField = () => screen.getByLabelText('Heure du rappel') as HTMLInputElement;
const checked = (el: HTMLElement) => el.getAttribute('aria-checked');

describe('réglages : rappel quotidien', () => {
  it('section « Rappel quotidien » entre « Jeu » et « À propos »', () => {
    renderSettings();
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h2) => h2.textContent);
    expect(titles).toEqual(['Apparence', 'Jeu', 'Rappel quotidien', 'À propos']);
  });

  it('désactivé par défaut : heure grisée, explication affichée', () => {
    renderSettings();
    expect(checked(reminderSwitch())).toBe('false');
    expect((reminderSwitch() as HTMLButtonElement).disabled).toBe(false);
    expect(timeField().type).toBe('time');
    expect(timeField().value).toBe('19:00');
    expect(timeField().disabled).toBe(true);
    expect(screen.getByText('Une notification par jour, sauf si le puzzle du jour est déjà résolu')).toBeTruthy();
  });

  it('activation avec autorisation déjà accordée : rappel activé, heure modifiable', async () => {
    const { saved } = renderSettings();
    fireEvent.click(reminderSwitch());
    await waitFor(() => expect(checked(reminderSwitch())).toBe('true'));
    expect(h.requestNotificationPermission).not.toHaveBeenCalled();
    expect(saved()).toMatchObject({ reminder: true, reminderPrompted: true });
    expect(timeField().disabled).toBe(false);
  });

  it('activation : l’autorisation est demandée, puis le rappel s’active', async () => {
    h.notificationPermission.mockResolvedValue('prompt');
    const { saved } = renderSettings();
    fireEvent.click(reminderSwitch());
    await waitFor(() => expect(checked(reminderSwitch())).toBe('true'));
    expect(h.requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(saved()).toMatchObject({ reminder: true, reminderPrompted: true });
  });

  it('autorisation refusée : le commutateur reste éteint et un message explique comment autoriser', async () => {
    h.notificationPermission.mockResolvedValue('prompt');
    h.requestNotificationPermission.mockResolvedValue('denied');
    const { saved } = renderSettings();
    fireEvent.click(reminderSwitch());
    const message = await screen.findByText(/Les notifications sont désactivées pour Griday/);
    expect(message.textContent).toContain('réglages d’Android');
    expect(message.closest('[role="status"]')).toBeTruthy();
    expect(checked(reminderSwitch())).toBe('false');
    expect(timeField().disabled).toBe(true);
    expect(saved()).toMatchObject({ reminder: false, reminderPrompted: true });
  });

  it('un clic sur la ligne entière bascule aussi le rappel', async () => {
    renderSettings();
    fireEvent.click(screen.getByText('Activer le rappel'));
    await waitFor(() => expect(checked(reminderSwitch())).toBe('true'));
  });

  it('désactivation : le rappel s’éteint et l’heure se grise', async () => {
    const { saved } = renderSettings({ reminder: true });
    expect(checked(reminderSwitch())).toBe('true');
    fireEvent.click(reminderSwitch());
    await waitFor(() => expect(checked(reminderSwitch())).toBe('false'));
    expect(h.notificationPermission).not.toHaveBeenCalled();
    expect(saved()).toMatchObject({ reminder: false });
    expect(timeField().disabled).toBe(true);
  });

  it('heure : le champ natif enregistre la nouvelle heure, une valeur vide est ignorée', () => {
    const { saved } = renderSettings({ reminder: true });
    expect(timeField().disabled).toBe(false);
    fireEvent.change(timeField(), { target: { value: '08:30' } });
    expect(saved()).toMatchObject({ reminderTime: '08:30' });
    expect(timeField().value).toBe('08:30');
    fireEvent.change(timeField(), { target: { value: '' } });
    expect(saved()).toMatchObject({ reminderTime: '08:30' });
    expect(timeField().value).toBe('08:30');
  });

  it('navigateur (notifications indisponibles) : commutateur désactivé avec une explication', async () => {
    h.notificationsAvailable.mockReturnValue(false);
    const { saved } = renderSettings();
    expect((reminderSwitch() as HTMLButtonElement).disabled).toBe(true);
    expect(checked(reminderSwitch())).toBe('false');
    expect(screen.getByText('Disponible dans l’application Android')).toBeTruthy();
    expect(screen.queryByText('Une notification par jour, sauf si le puzzle du jour est déjà résolu')).toBeNull();
    expect(timeField().disabled).toBe(true);
    fireEvent.click(reminderSwitch());
    await act(async () => undefined);
    expect(h.notificationPermission).not.toHaveBeenCalled();
    expect(saved()).toBeUndefined();
  });

  it('anglais : mêmes éléments, textes traduits', async () => {
    await setLanguage('en');
    renderSettings({ language: 'en' });
    expect(screen.getByRole('heading', { name: 'Daily reminder' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Enable reminder' })).toBeTruthy();
    expect((screen.getByLabelText('Reminder time') as HTMLInputElement).value).toBe('19:00');
  });
});

describe('réglages : signaler les erreurs', () => {
  it('activé par défaut ; désactivé, le choix est enregistré', async () => {
    const { saved } = renderSettings();
    const toggle = () => screen.getByRole('switch', { name: 'Signaler les erreurs' });
    expect(checked(toggle())).toBe('true');
    fireEvent.click(toggle());
    await waitFor(() => expect(checked(toggle())).toBe('false'));
    expect(saved()).toMatchObject({ showConflicts: false });
  });
});
