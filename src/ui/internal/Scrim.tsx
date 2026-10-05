import { motion } from 'motion/react';
import { useMotionTokens } from '../../theme/motion';
import './scrim.css';

/** Voile derrière une modale : fondu, clic = fermeture (si `onDismiss`). */
export function Scrim({ onDismiss }: { readonly onDismiss?: () => void }) {
  const { effects } = useMotionTokens();
  return (
    <motion.div
      className="md-scrim"
      aria-hidden="true"
      onClick={onDismiss}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={effects.default}
    />
  );
}
