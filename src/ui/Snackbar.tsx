import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMotionTokens } from '../theme/motion';
import { Icon } from './Icon';
import { Ripple } from './internal/Ripple';
import './Snackbar.css';

export interface SnackbarOptions {
  /** Message (texte déjà traduit). */
  readonly message: string;
  /** Libellé du bouton d'action (ex. « Annuler »). */
  readonly actionLabel?: string;
  /** Appelé au clic sur l'action ; le snackbar se ferme ensuite. */
  readonly onAction?: () => void;
  /**
   * Durée d'affichage en ms. Défaut : 4000 (8000 avec une action). `Infinity` = jusqu'à fermeture
   * (bouton de fermeture ou `dismiss`). La minuterie est suspendue au survol et au focus.
   */
  readonly duration?: number;
}

export interface SnackbarApi {
  /** Affiche un message (mis en file si un autre est visible) ; renvoie son identifiant. */
  readonly show: (options: SnackbarOptions) => string;
  /** Ferme le message `id`, ou celui qui est affiché si `id` est omis. */
  readonly dismiss: (id?: string) => void;
}

interface Item extends SnackbarOptions {
  readonly id: string;
}

const SnackbarContext = createContext<SnackbarApi | null>(null);

/** Accès à l'affichage de snackbars. À utiliser sous `<SnackbarHost>`. */
export function useSnackbar(): SnackbarApi {
  const api = useContext(SnackbarContext);
  if (!api) throw new Error('useSnackbar hors de SnackbarHost');
  return api;
}

export interface SnackbarHostProps {
  readonly children?: ReactNode;
  /** Nom accessible du bouton de fermeture (ex. « Fermer »). Sans lui, pas de bouton de fermeture. */
  readonly closeLabel?: string;
}

/** File d'attente maximale des messages en attente (les plus anciens sont abandonnés). */
const MAX_QUEUE = 3;
let nextId = 0;

/**
 * Fournit `useSnackbar()` et affiche le snackbar courant dans une zone `aria-live` collée en bas,
 * au-dessus de la barre de navigation (`--md-navigation-bar-height`) et de la zone sûre.
 */
export function SnackbarHost({ children, closeLabel }: SnackbarHostProps) {
  const [current, setCurrent] = useState<Item | null>(null);
  const currentRef = useRef<Item | null>(null);
  const queueRef = useRef<Item[]>([]);

  const show = useCallback((options: SnackbarOptions): string => {
    const item: Item = { ...options, id: `md-snackbar-${++nextId}` };
    if (currentRef.current === null) {
      currentRef.current = item;
      setCurrent(item);
    } else {
      queueRef.current.push(item);
      if (queueRef.current.length > MAX_QUEUE) queueRef.current.shift();
    }
    return item.id;
  }, []);

  const dismiss = useCallback((id?: string): void => {
    if (id === undefined || currentRef.current?.id === id) {
      if (currentRef.current === null) return;
      currentRef.current = null;
      setCurrent(null);
    } else {
      queueRef.current = queueRef.current.filter((item) => item.id !== id);
    }
  }, []);

  const api = useMemo<SnackbarApi>(() => ({ show, dismiss }), [show, dismiss]);

  // Le message suivant apparaît une fois la sortie du précédent terminée.
  const onExitComplete = useCallback((): void => {
    const next = queueRef.current.shift();
    if (next && currentRef.current === null) {
      currentRef.current = next;
      setCurrent(next);
    }
  }, []);

  return (
    <SnackbarContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined'
        ? createPortal(
            <div className="md-snackbar-host" data-md-keep="" role="status" aria-live="polite" aria-atomic="true">
              <AnimatePresence mode="wait" onExitComplete={onExitComplete}>
                {current ? <SnackbarView key={current.id} item={current} closeLabel={closeLabel} onDismiss={dismiss} /> : null}
              </AnimatePresence>
            </div>,
            document.body,
          )
        : null}
    </SnackbarContext.Provider>
  );
}

function SnackbarView({ item, closeLabel, onDismiss }: { readonly item: Item; readonly closeLabel?: string; readonly onDismiss: (id: string) => void }) {
  const { spatial, effects } = useMotionTokens();
  const duration = item.duration ?? (item.actionLabel ? 8000 : 4000);

  // Minuterie de fermeture, suspendue au survol, au focus et à l'appui.
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holds = useRef(0);

  const start = useCallback((): void => {
    if (!Number.isFinite(remaining.current)) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(item.id), remaining.current);
  }, [item.id, onDismiss]);

  const hold = useCallback((): void => {
    holds.current += 1;
    if (holds.current === 1 && timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
      remaining.current = Math.max(1000, remaining.current - (Date.now() - startedAt.current));
    }
  }, []);

  const release = useCallback((): void => {
    holds.current = Math.max(0, holds.current - 1);
    if (holds.current === 0 && timer.current === undefined) start();
  }, [start]);

  useEffect(() => {
    start();
    return () => clearTimeout(timer.current);
  }, [start]);

  return (
    <motion.div
      className="md-snackbar"
      initial={{ opacity: 0, y: 32, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ default: spatial.default, opacity: effects.default }}
      onPointerEnter={hold}
      onPointerLeave={release}
      onFocus={hold}
      onBlur={release}
    >
      <span className="md-snackbar__message md-typescale-body-medium">{item.message}</span>
      {item.actionLabel ? (
        <button
          type="button"
          className="md-snackbar__action md-state-host md-typescale-label-large"
          onClick={() => {
            item.onAction?.();
            onDismiss(item.id);
          }}
        >
          <Ripple />
          {item.actionLabel}
        </button>
      ) : null}
      {closeLabel ? (
        <button type="button" className="md-snackbar__close md-state-host md-touch-target" aria-label={closeLabel} onClick={() => onDismiss(item.id)}>
          <Ripple />
          <Icon name="close" size={20} />
        </button>
      ) : null}
    </motion.div>
  );
}
