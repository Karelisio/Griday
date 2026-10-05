/** Partage d'un résultat : texte sans spoiler (emoji), feuille de partage Android, sinon presse-papiers. */
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import type { TFunction } from 'i18next';
import type { DifficultyTier, PuzzleTypeId } from '../../engine/core/types';
import type { Language } from '../i18n';
import { formatClock } from '../i18n/format';

/** Fiche Play Store (identifiant définitif de l'app). */
export const STORE_URL = 'https://play.google.com/store/apps/details?id=io.github.karelisio.griday';

/** Emoji du type de puzzle dans le texte partagé. */
const TYPE_EMOJI: Readonly<Record<string, string>> = { queens: '👑', binairo: '🌓' };

export interface SharedResult {
  readonly kind: 'daily' | 'archive' | 'unlimited';
  readonly type: PuzzleTypeId;
  /** Numéro du puzzle du jour (daily, archive). */
  readonly n?: number;
  readonly size: number;
  readonly tier: DifficultyTier;
  readonly timeMs: number;
  readonly hintsUsed: number;
  /** Série en cours (daily). */
  readonly streak?: number;
}

/** Texte partagé : une ligne d'en-tête, temps et indices, série, lien. */
export function shareText(r: SharedResult, t: TFunction, lang: Language): string {
  const puzzle = `${TYPE_EMOJI[r.type] ?? '🧩'} ${t(`puzzle.${r.type}.name`)}`;
  const head = { n: r.n ?? 0, puzzle, size: t('unlimited.sizeValue', { n: r.size }), difficulty: t(`difficulty.${r.tier}`) };
  const lines = [
    t(`share.${r.kind}`, head),
    `${t('share.time', { time: formatClock(r.timeMs, lang) })} · ${t('share.hints', { count: r.hintsUsed })}`,
  ];
  if (r.kind === 'daily' && r.streak && r.streak > 1) lines.push(t('share.streak', { count: r.streak }));
  lines.push(t('share.link', { url: STORE_URL }));
  return lines.join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Feuille de partage native (ou Web Share), sinon copie dans le presse-papiers. */
export async function shareResult(text: string, dialogTitle: string): Promise<ShareOutcome> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ text, dialogTitle });
      return 'shared';
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ text });
      return 'shared';
    }
  } catch (error) {
    // Feuille fermée sans choisir d'app : ce n'est pas une erreur.
    if (/cancel|abort/i.test(String((error as { message?: unknown })?.message ?? error))) return 'cancelled';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
