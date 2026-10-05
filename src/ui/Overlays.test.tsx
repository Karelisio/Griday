import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet, shouldDismissSheet } from './BottomSheet';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { SnackbarHost, useSnackbar, type SnackbarApi } from './Snackbar';
import { installMatchMedia } from './testing';

installMatchMedia();

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Page factice avec un bouton d’ouverture, pour vérifier le focus, l’inertie et le défilement. */
function Page({ children, onClose }: { children: (open: boolean, setOpen: (v: boolean) => void) => React.ReactNode; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="app">
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      {children(open, (v) => {
        if (!v) onClose?.();
        setOpen(v);
      })}
    </div>
  );
}

const keyDown = (key: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

describe('BottomSheet (modale)', () => {
  const renderSheet = (extra: Partial<React.ComponentProps<typeof BottomSheet>> = {}, onClose = vi.fn()) =>
    render(
      <Page onClose={onClose}>
        {(open, setOpen) => (
          <BottomSheet open={open} onClose={() => setOpen(false)} aria-label="Indice" {...extra}>
            <button type="button">Première</button>
            <button type="button">Dernière</button>
          </BottomSheet>
        )}
      </Page>,
    );

  it('fermée : rien dans le document', () => {
    renderSheet();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ouverte : boîte de dialogue modale nommée, focus dans la feuille, voile présent', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const sheet = screen.getByRole('dialog', { name: 'Indice' });
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(sheet);
    expect(document.querySelector('.md-scrim')).toBeTruthy();
    expect(document.documentElement.classList.contains('md-scroll-locked')).toBe(true);
  });

  it('rend le reste de la page inerte et masqué, puis le rétablit à la fermeture', async () => {
    renderSheet();
    const root = document.body.firstElementChild as HTMLElement; // conteneur React de la page
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.inert).toBe(true);
    keyDown('Escape');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(root.hasAttribute('aria-hidden')).toBe(false);
    expect(root.inert).toBeFalsy(); // jsdom n'implémente pas `inert` : valeur absente plutôt que false
    expect(document.documentElement.classList.contains('md-scroll-locked')).toBe(false);
  });

  it('Échap appelle onClose et ferme ; le focus revient au bouton d’ouverture', async () => {
    const onClose = vi.fn();
    renderSheet({}, onClose);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();
    fireEvent.click(opener);
    const event = keyDown('Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('un clic sur le voile ferme (sauf closeOnScrim=false)', async () => {
    const onClose = vi.fn();
    const { unmount } = renderSheet({ closeOnScrim: false }, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    fireEvent.click(document.querySelector('.md-scrim') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    unmount();

    const onClose2 = vi.fn();
    renderSheet({}, onClose2);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    fireEvent.click(document.querySelector('.md-scrim') as HTMLElement);
    expect(onClose2).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('piège le focus : Tab sur le dernier élément revient au premier, Maj+Tab inversement', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const first = screen.getByRole('button', { name: 'Première' });
    const last = screen.getByRole('button', { name: 'Dernière' });
    // Sans mise en page (jsdom), on rend les éléments « visibles » pour le calcul des éléments focalisables.
    for (const el of [first, last]) el.getClientRects = () => [{}] as unknown as DOMRectList;
    last.focus();
    const forward = keyDown('Tab');
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    const backward = keyDown('Tab', { shiftKey: true });
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('la poignée devient un bouton de fermeture avec `dismissLabel`', async () => {
    const onClose = vi.fn();
    renderSheet({ dismissLabel: 'Fermer' }, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('sans `dismissLabel`, la poignée est décorative', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(document.querySelector('.md-sheet__handle-button')).toBeNull();
    expect(document.querySelector('.md-sheet__handle')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('le glissement vers le bas ferme au-delà d’une distance ou d’une vitesse', () => {
    expect(shouldDismissSheet(120, 0)).toBe(true);
    expect(shouldDismissSheet(20, 900)).toBe(true);
    expect(shouldDismissSheet(40, 100)).toBe(false);
    expect(shouldDismissSheet(-200, -900)).toBe(false);
  });
});

describe('BottomSheet non modale (modal={false})', () => {
  const renderSheet = (onClose = vi.fn()) =>
    render(
      <Page onClose={onClose}>
        {(open, setOpen) => (
          <BottomSheet open={open} modal={false} onClose={() => setOpen(false)} aria-label="Indice" dismissLabel="Fermer">
            <button type="button">Première</button>
            <button type="button">Dernière</button>
          </BottomSheet>
        )}
      </Page>,
    );

  it('ni voile, ni inertie, ni blocage du défilement ; la couche ne capte pas les gestes', () => {
    renderSheet();
    const root = document.body.firstElementChild as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const sheet = screen.getByRole('dialog', { name: 'Indice' });
    expect(sheet.hasAttribute('aria-modal')).toBe(false);
    expect(document.querySelector('.md-scrim')).toBeNull();
    expect(root.hasAttribute('aria-hidden')).toBe(false);
    expect(root.inert).toBeFalsy();
    expect(document.documentElement.classList.contains('md-scroll-locked')).toBe(false);
    expect(sheet.parentElement?.className).toContain('md-sheet-root--non-modal');
    // La page derrière reste utilisable.
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toBeTruthy();
  });

  it('le focus entre dans la feuille à l’ouverture et revient à la fermeture', async () => {
    renderSheet();
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();
    fireEvent.click(opener);
    const sheet = screen.getByRole('dialog');
    expect(document.activeElement).toBe(sheet);
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('Échap ferme toujours la feuille', async () => {
    const onClose = vi.fn();
    renderSheet(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    keyDown('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('pas de piège à focus : Tab n’est pas détourné', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const last = screen.getByRole('button', { name: 'Dernière' });
    last.getClientRects = () => [{}] as unknown as DOMRectList;
    last.focus();
    expect(keyDown('Tab').defaultPrevented).toBe(false);
    expect(keyDown('Tab', { shiftKey: true }).defaultPrevented).toBe(false);
  });
});

describe('Dialog', () => {
  const renderDialog = (props: Partial<React.ComponentProps<typeof Dialog>> = {}, onClose = vi.fn()) =>
    render(
      <Page onClose={onClose}>
        {(open, setOpen) => (
          <Dialog
            open={open}
            onClose={() => setOpen(false)}
            title="Recommencer ?"
            actions={
              <>
                <Button variant="text" onClick={() => setOpen(false)}>
                  Annuler
                </Button>
                <Button variant="text">Confirmer</Button>
              </>
            }
            {...props}
          >
            Toute la grille sera effacée.
          </Dialog>
        )}
      </Page>,
    );

  it('dialogue nommé par son titre et décrit par son corps', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Recommencer ?' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute('aria-describedby') as string)?.textContent).toBe('Toute la grille sera effacée.');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Recommencer ?' })).toBeTruthy();
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Annuler', 'Confirmer']);
  });

  it('role="alertdialog" pour une confirmation', () => {
    renderDialog({ role: 'alertdialog' });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('alertdialog', { name: 'Recommencer ?' })).toBeTruthy();
  });

  it('sans titre, utilise aria-label', () => {
    renderDialog({ title: undefined, 'aria-label': 'Confirmation' });
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('dialog', { name: 'Confirmation' })).toBeTruthy();
  });

  it('Échap et clic sur le voile ferment ; le focus revient à l’ouverture', async () => {
    const onClose = vi.fn();
    renderDialog({}, onClose);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    keyDown('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);

    fireEvent.click(opener);
    fireEvent.click(document.querySelector('.md-scrim') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('un bouton d’action ferme le dialogue ; la page est inerte tant qu’il est ouvert', async () => {
    renderDialog();
    const root = document.body.firstElementChild as HTMLElement;
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(root.inert).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(root.inert).toBeFalsy(); // jsdom n'implémente pas `inert` : valeur absente plutôt que false
  });

  it('piège le focus entre ses boutons', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const cancel = screen.getByRole('button', { name: 'Annuler' });
    const confirm = screen.getByRole('button', { name: 'Confirmer' });
    for (const el of [cancel, confirm]) el.getClientRects = () => [{}] as unknown as DOMRectList;
    confirm.focus();
    expect(keyDown('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);
  });

  it('une seule modale réagit à Échap : la plus haute', async () => {
    const closeInner = vi.fn();
    const closeOuter = vi.fn();
    render(
      <>
        <Dialog open onClose={closeOuter} title="Dehors">
          x
        </Dialog>
        <Dialog open onClose={closeInner} title="Dedans">
          y
        </Dialog>
      </>,
    );
    keyDown('Escape');
    expect(closeInner).toHaveBeenCalledTimes(1);
    expect(closeOuter).not.toHaveBeenCalled();
  });
});

describe('Snackbar', () => {
  function Trigger({ onApi }: { onApi: (api: SnackbarApi) => void }) {
    onApi(useSnackbar());
    return null;
  }
  const setup = (closeLabel?: string) => {
    let api!: SnackbarApi;
    render(
      <SnackbarHost closeLabel={closeLabel}>
        <Trigger onApi={(a) => (api = a)} />
      </SnackbarHost>,
    );
    return () => api;
  };

  it('la zone est un « status » aria-live toujours présent, au-dessus de la barre de navigation', () => {
    setup();
    const host = document.querySelector('.md-snackbar-host') as HTMLElement;
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-live')).toBe('polite');
    expect(host.hasAttribute('data-md-keep')).toBe(true);
  });

  it('show() affiche le message ; il disparaît après sa durée', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const api = setup();
    act(() => {
      api().show({ message: 'Grille résolue', duration: 3000 });
    });
    expect(screen.getByText('Grille résolue')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2900);
    });
    expect(screen.queryByText('Grille résolue')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();
    await waitFor(() => expect(screen.queryByText('Grille résolue')).toBeNull());
  });

  it('l’action appelle onAction puis ferme le message', async () => {
    const api = setup();
    const onAction = vi.fn();
    act(() => {
      api().show({ message: 'Partie recommencée', actionLabel: 'Annuler', onAction });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Partie recommencée')).toBeNull());
  });

  it('les messages sont mis en file : le suivant s’affiche après la sortie du précédent', async () => {
    const api = setup();
    act(() => {
      api().show({ message: 'Premier', duration: Infinity });
      api().show({ message: 'Deuxième', duration: Infinity });
    });
    expect(screen.queryByText('Premier')).toBeTruthy();
    expect(screen.queryByText('Deuxième')).toBeNull();
    act(() => api().dismiss());
    await waitFor(() => expect(screen.queryByText('Deuxième')).toBeTruthy());
    expect(screen.queryByText('Premier')).toBeNull();
  });

  it('dismiss(id) retire un message en attente sans toucher à l’affiché', async () => {
    const api = setup();
    let queued = '';
    act(() => {
      api().show({ message: 'Affiché', duration: Infinity });
      queued = api().show({ message: 'En attente', duration: Infinity });
    });
    act(() => api().dismiss(queued));
    act(() => api().dismiss());
    await waitFor(() => expect(screen.queryByText('Affiché')).toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('En attente')).toBeNull();
  });

  it('bouton de fermeture seulement si `closeLabel` est fourni', async () => {
    const api = setup('Fermer');
    act(() => {
      api().show({ message: 'Info', duration: Infinity });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByText('Info')).toBeNull());
  });

  it('sans closeLabel, pas de bouton de fermeture', () => {
    const api = setup();
    act(() => {
      api().show({ message: 'Info', duration: Infinity });
    });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('useSnackbar hors de SnackbarHost lève une erreur claire', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger onApi={() => {}} />)).toThrow(/SnackbarHost/);
    spy.mockRestore();
  });
});
