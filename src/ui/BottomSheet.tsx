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
  /** Un clic sur le voile ferme la feuille (défaut : oui). */
  readonly closeOnScrim?: boolean;
  /** Élément à focaliser à l'ouverture (défaut : la feuille). */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly className?: string;
}

/** Distance (px) ou vitesse (px/s) de glissement au-delà de laquelle la feuille se ferme. */
const DISMISS_OFFSET = 96;
const DISMISS_VELOCITY = 600;

/**
 * Feuille modale basse M3 : voile, poignée, fermeture par glissement (ressort), focus piégé,
 * Échap, arrière-plan inerte. Rendue dans `document.body`.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  dismissLabel,
  closeOnScrim = true,
  initialFocusRef,
  className,
}: BottomSheetProps) {
  const { spatial } = useMotionTokens();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  useModal({ open, onClose, containerRef: sheetRef, initialFocusRef });

  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo): void => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onClose();
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="sheet" className="md-sheet-root">
          <Scrim onDismiss={closeOnScrim ? onClose : undefined} />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
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
