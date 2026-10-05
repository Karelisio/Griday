/**
 * Vue de jeu partagée (puzzle du jour, mode illimité) : grille, barre d'actions, chronomètre,
 * indice expliqué (feuille du bas), règles, carte de victoire.
 */
import { motion, AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueensHint } from '../../engine/queens/hint';
import type { QueensSolvedPuzzle } from '../../engine/queens/types';
import { engine } from '../engine-client/client';
import type { Language } from '../i18n';
import { formatDuration } from '../i18n/format';
import { pushBackHandler } from '../platform';
import { springs, useTheme } from '../theme';
import { useSettings } from '../settings/SettingsContext';
import { BottomSheet, Button, Card, Chip, Dialog, ExtendedFab, IconButton, Icon } from '../ui';
import { explainHint, type HintExplanation } from './queens/explain';
import { QueensBoard } from './queens/QueensBoard';
import type { useQueensGame } from './queens/useQueensGame';
import { Timer } from './Timer';
import './GameView.css';

export type QueensGameApi = ReturnType<typeof useQueensGame>;

export interface GameViewProps {
  readonly puzzle: QueensSolvedPuzzle;
  readonly api: QueensGameApi;
  /** Contenu de la carte de victoire sous le titre (compte à rebours, nouvelle grille…). */
  readonly victoryExtra?: ReactNode;
  readonly visible: boolean;
}

const revealIcon = (h: QueensHint) => (h.kind === 'step' || h.kind === 'reveal' ? (h.reveal.mark === 'queen' ? 'crown' : 'close') : undefined);

/** Ferme un élément ouvert avec le geste retour Android (retour prédictif). */
function useBackClose(open: boolean, close: () => void) {
  useEffect(() => (open ? pushBackHandler(close) : undefined), [open, close]);
}

export function GameView({ puzzle, api, victoryExtra, visible }: GameViewProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const { regionColors } = useTheme();
  const { settings } = useSettings();
  const { game } = api;
  const [hint, setHint] = useState<{ hint: QueensHint; ex: HintExplanation } | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [victoryOpen, setVictoryOpen] = useState(true);

  const colors = useMemo(() => regionColors(puzzle.size), [regionColors, puzzle.size]);
  const closeHint = useCallback(() => setHintOpen(false), []);
  const closeRules = useCallback(() => setRulesOpen(false), []);
  const closeReset = useCallback(() => setResetOpen(false), []);
  useBackClose(visible && hintOpen, closeHint);
  useBackClose(visible && rulesOpen, closeRules);
  useBackClose(visible && resetOpen, closeReset);

  // Toute modification de la grille rend l'indice affiché obsolète : on le referme.
  const hintMarks = useRef<readonly unknown[] | null>(null);
  useEffect(() => {
    if (hintOpen && hintMarks.current && game && game.marks !== hintMarks.current) setHintOpen(false);
    if (!hintOpen) hintMarks.current = null;
  }, [game, hintOpen]);

  const askHint = async () => {
    if (!game || hintLoading) return;
    setHintLoading(true);
    try {
      const h = await engine.queensHint(puzzle, game.marks);
      const ex = explainHint(h, puzzle, lang, (key, n) => t(key, { n }));
      if (h.kind === 'step' || h.kind === 'reveal') api.noteHint();
      setHint({ hint: h, ex });
      hintMarks.current = game.marks;
      setHintOpen(true);
    } finally {
      setHintLoading(false);
    }
  };

  const applyHint = () => {
    const h = hint?.hint;
    setHintOpen(false);
    if (h && (h.kind === 'step' || h.kind === 'reveal')) api.applyHint(h.reveal.cell, h.reveal.mark);
  };

  if (!game) return null;
  const solved = game.solved;
  const canApply = hint && (hint.hint.kind === 'step' || hint.hint.kind === 'reveal');

  return (
    <div className="game">
      <div className="game__status">
        <span className="game__timer-wrap">
          <Icon name="timer" size={20} />
          <Timer elapsed={api.elapsed} running={visible && game.runningSince !== null} />
        </span>
        <AnimatePresence>
          {api.conflicts.length > 0 && !solved && (
            <motion.span
              className="game__conflicts md-typescale-label-large"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="status"
            >
              <Icon name="warning" size={18} />
              {t('game.conflicts', { count: api.conflicts.length })}
            </motion.span>
          )}
        </AnimatePresence>
        <IconButton icon="help" label={t('game.rules')} onClick={() => setRulesOpen(true)} />
      </div>

      <div className="game__board">
        <QueensBoard
          puzzle={puzzle}
          marks={game.marks}
          regionColors={colors}
          conflicts={api.conflicts}
          attacked={api.attacked}
          highlight={hintOpen ? (hint?.ex.highlight ?? null) : null}
          patterns={settings.regionPatterns}
          disabled={solved}
          celebrate={solved}
          onGesture={api.gesture}
        />
      </div>

      {!solved && (
        <div className="game__actions">
          {/* Barre d'outils flottante M3 Expressive + FAB de l'action principale. */}
          <div className="game__toolbar" role="toolbar" aria-label={t('game.actions')}>
            <IconButton icon="undo" label={t('game.undo')} size="s" disabled={game.past.length === 0} onClick={api.undo} />
            <IconButton icon="redo" label={t('game.redo')} size="s" disabled={game.future.length === 0} onClick={api.redo} />
            <IconButton
              icon="restart_alt"
              label={t('game.reset')}
              size="s"
              disabled={game.past.length === 0 && game.marks.every((m) => m === 0)}
              onClick={() => setResetOpen(true)}
            />
          </div>
          <ExtendedFab icon="lightbulb" color="primary" onClick={() => void askHint()} disabled={hintLoading}>
            {t('game.hint')}
          </ExtendedFab>
        </div>
      )}

      <AnimatePresence>
        {solved && victoryOpen && (
          <motion.div
            className="game__victory"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={springs.spatial.default}
          >
            <Card variant="filled" className="victory-card">
              <div className="victory-card__head">
                <span className="victory-card__icon" aria-hidden="true">
                  <Icon name="celebration" size={28} />
                </span>
                <div>
                  <h2 className="md-typescale-headline-small victory-card__title">{t('victory.title')}</h2>
                  <p className="md-typescale-body-large">{t('victory.time', { time: formatDuration(api.elapsed(), lang) })}</p>
                </div>
              </div>
              <div className="victory-card__chips">
                <Chip icon="lightbulb">{t('victory.hints', { count: game.hintsUsed })}</Chip>
              </div>
              {victoryExtra}
              <Button variant="text" onClick={() => setVictoryOpen(false)}>
                {t('victory.viewBoard')}
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomSheet open={hintOpen} onClose={closeHint} modal={false} aria-label={t('hint.title')} dismissLabel={t('common.close')}>
        {hint && (
          <div className="hint-sheet">
            <div className="hint-sheet__head">
              <span className="hint-sheet__icon" aria-hidden="true">
                <Icon name="lightbulb" filled size={24} />
              </span>
              <div>
                <p className="md-typescale-label-large hint-sheet__overline">{t('hint.title')}</p>
                <h2 className="md-typescale-title-large">{t(hint.ex.titleKey)}</h2>
              </div>
            </div>
            <p className="md-typescale-body-large hint-sheet__text">{t(hint.ex.textKey, hint.ex.params)}</p>
            <div className="hint-sheet__actions">
              <Button variant="text" onClick={closeHint}>
                {t('common.close')}
              </Button>
              {canApply && (
                <Button variant="filled" icon={revealIcon(hint.hint)} onClick={applyHint}>
                  {t('hint.apply')}
                </Button>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      <Dialog
        open={rulesOpen}
        onClose={closeRules}
        title={t('puzzle.queens.name')}
        icon="crown"
        actions={
          <Button variant="text" onClick={closeRules}>
            {t('common.close')}
          </Button>
        }
      >
        <p className="md-typescale-body-medium">{t('puzzle.queens.rules')}</p>
        <p className="md-typescale-body-medium rules__howto">{t('puzzle.queens.howTo')}</p>
      </Dialog>

      <Dialog
        open={resetOpen}
        onClose={closeReset}
        title={t('game.reset')}
        icon="restart_alt"
        actions={
          <>
            <Button variant="text" onClick={closeReset}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="text"
              onClick={() => {
                api.reset();
                closeReset();
              }}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="md-typescale-body-medium">{t('game.resetConfirm')}</p>
      </Dialog>
    </div>
  );
}
