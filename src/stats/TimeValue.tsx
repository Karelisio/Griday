/** Durée affichée comme un chronomètre (« 3:05 ») mais lue en toutes lettres (« 3 min 5 s ») par les lecteurs d'écran. */
import type { Language } from '../i18n';
import { formatClock, formatDuration } from '../i18n/format';

export function TimeValue({ ms, lang }: { ms: number; lang: Language }) {
  return (
    <>
      <span aria-hidden="true">{formatClock(ms, lang)}</span>
      <span className="md-sr-only">{formatDuration(ms, lang)}</span>
    </>
  );
}
