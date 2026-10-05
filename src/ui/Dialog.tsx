import { AnimatePresence, motion } from 'motion/react';
import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMotionTokens } from '../theme/motion';
import { Icon, type IconName } from './Icon';
import { cx } from './internal/cx';
import { Scrim } from './internal/Scrim';
import { useModal } from './internal/useModal';
import './Dialog.css';

export interface DialogProps {
  /** Dialogue ouvert ou fermé (composant contrôlé). */
  readonly open: boolean;
  /** Demande de fermeture : Échap, clic sur le voile. À relier aussi au bouton Retour d'Android. */
  readonly onClose: () => void;
  /** Titre (texte déjà traduit) : nomme le dialogue pour les lecteurs d'écran. */
  readonly title?: ReactNode;
  /** Icône en tête, au-dessus du titre (dialogue centré). */
  readonly icon?: IconName;
  /** Corps du dialogue. */
  readonly children?: ReactNode;
  /** Boutons d'action (en général des `Button variant="text"`), alignés à droite. */
  readonly actions?: ReactNode;
  /** `alertdialog` pour une confirmation qui interrompt l'utilisateur. */
  readonly role?: 'dialog' | 'alertdialog';
  /** Nom accessible quand il n'y a pas de `title`. */
  readonly 'aria-label'?: string;
  /** Un clic sur le voile ferme le dialogue (défaut : oui). */
  readonly closeOnScrim?: boolean;
  /** Élément à focaliser à l'ouverture (défaut : le dialogue). */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly className?: string;
}

/** Dialogue de base M3 : titre, corps, actions ; focus piégé, Échap, arrière-plan inerte. */
export function Dialog({ open, onClose, title, icon, children, actions, role = 'dialog', 'aria-label': ariaLabel, closeOnScrim = true, initialFocusRef, className }: DialogProps) {
  const { spatial, effects } = useMotionTokens();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useModal({ open, onClose, containerRef: dialogRef, initialFocusRef });

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="dialog" className="md-dialog-root">
          <Scrim onDismiss={closeOnScrim ? onClose : undefined} />
          <motion.div
            ref={dialogRef}
            role={role}
            aria-modal="true"
            aria-label={title ? undefined : ariaLabel}
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={children ? bodyId : undefined}
            tabIndex={-1}
            className={cx('md-dialog', icon && 'md-dialog--with-icon', className)}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ default: spatial.default, opacity: effects.default }}
          >
            {icon ? <Icon name={icon} size={24} className="md-dialog__icon" /> : null}
            {title ? (
              <h2 id={titleId} className="md-dialog__title md-typescale-headline-small">
                {title}
              </h2>
            ) : null}
            {children ? (
              <div id={bodyId} className="md-dialog__body md-typescale-body-medium">
                {children}
              </div>
            ) : null}
            {actions ? <div className="md-dialog__actions">{actions}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
