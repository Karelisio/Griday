import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMotionTokens } from '../theme/motion';
import { cx } from './internal/cx';
import { Scrim } from './internal/Scrim';
import { useModal } from './internal/useModal';
import './BottomSheet.css';

export interface BottomSheetProps {
  /** Feuille ouverte ou fermée (composant contrôlé). */
  readonly open: boolean;
  /** Demande de fermeture : Échap, clic sur le voile, glissement vers le bas, poignée. À relier aussi au bouton Retour d'Android. */
  readonly onClose: () => void;
  readonly children?: ReactNode;
  /** Nom accessible de la feuille (ou `aria-labelledby`). */
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  /** Si fourni, la poignée devient un bouton de fermeture portant ce nom (alternative accessible au glissement). */
  readonly dismissLabel?: string;
  /**
   * `true` (défaut) : feuille modale — voile, focus piégé, page inerte et défilement bloqué.
   * `false` : feuille non modale — ni voile ni blocage (la page derrière reste visible et utilisable),
   * pas de piège à focus ; le focus entre dans la feuille à l'ouverture, Échap et le glissement
   * vers le bas la ferment toujours. Utile pour une explication qui doit laisser le plateau visible.
   */
  readonly modal?: boolean;
  /** Modale uniquement : un clic sur le voile ferme la feuille (défaut : oui). */
  readonly closeOnScrim?: boolean;
  /** Élément à focaliser à l'ouverture (défaut : la feuille). */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly className?: string;
}

/** Distance (px) ou vitesse (px/s) de glissement au-delà de laquelle la feuille se ferme. */
const DISMISS_OFFSET = 96;
const DISMISS_VELOCITY = 600;

/** Un glissement vers le bas ferme la feuille s'il est assez long ou assez rapide. */
export function shouldDismissSheet(offsetY: number, velocityY: number): boolean {
  return offsetY > DISMISS_OFFSET || velocityY > DISMISS_VELOCITY;
}

/**
 * Feuille basse M3, modale par défaut : voile, poignée, fermeture par glissement (ressort), focus
 * piégé, Échap, arrière-plan inerte. Avec `modal={false}` : même feuille, sans voile ni blocage de
 * la page. Rendue dans `document.body`.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  dismissLabel,
  modal = true,
  closeOnScrim = true,
  initialFocusRef,
  className,
}: BottomSheetProps) {
  const { spatial } = useMotionTokens();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  useModal({ open, onClose, containerRef: sheetRef, initialFocusRef, modal });

  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo): void => {
    if (shouldDismissSheet(info.offset.y, info.velocity.y)) onClose();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="sheet" className={cx('md-sheet-root', !modal && 'md-sheet-root--non-modal')}>
          {modal ? <Scrim onDismiss={closeOnScrim ? onClose : undefined} /> : null}
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal={modal ? 'true' : undefined}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            tabIndex={-1}
            className={cx('md-sheet', className)}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spatial.default}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.9 }}
            dragTransition={{ bounceStiffness: 700, bounceDamping: 40 }}
            onDragEnd={onDragEnd}
          >
            <div className="md-sheet__grab" onPointerDown={(event) => dragControls.start(event)}>
              {dismissLabel ? (
                <button type="button" className="md-sheet__handle-button" aria-label={dismissLabel} onClick={onClose}>
                  <span className="md-sheet__handle" aria-hidden="true" />
                </button>
              ) : (
                <span className="md-sheet__handle" aria-hidden="true" />
              )}
            </div>
            <div className="md-sheet__content">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
