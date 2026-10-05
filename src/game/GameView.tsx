/**
 * Vue de jeu partagée (puzzle du jour, mode illimité) : grille, barre d'actions, chronomètre,
 * indice expliqué (feuille du bas), règles, carte de victoire.
 */
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { QueensHint } from '../../engine/queens/hint';
import { MARK_EMPTY, QUEENS_MAX_SIZE, type QueensMark, type QueensSolvedPuzzle } from '../../engine/queens/types';
import { engine } from '../engine-client/client';
import type { Language } from '../i18n';
import { formatDuration } from '../i18n/format';
import { pushBackHandler } from '../platform';
import { springs, useTheme } from '../theme';
import { useSettings } from '../settings/SettingsContext';
import { BottomSheet, Button, Card, Dialog, ExtendedFab, IconButton, Icon, InfoChip, useSnackbar } from '../ui';
import { explainHint, hintKey, hintMoves, type HintExplanation } from './queens/explain';
import { QueensBoard } from './queens/QueensBoard';
import { assignRegionColors } from './queens/regionColors';
import type { useQueensGame } from './queens/useQueensGame';
import { Timer } from './Timer';
import './GameView.css';

export type QueensGameApi = ReturnType<typeof useQueensGame>;

/** Palette de départ des régions (taille maximale d'une grille) : plus de choix, voisines plus distinctes. */
const PALETTE_SIZE = QUEENS_MAX_SIZE;
const NO_CELLS: readonly number[] = [];

export interface GameViewProps {
  readonly puzzle: QueensSolvedPuzzle;
  readonly api: QueensGameApi;
  /** Contenu de la carte de victoire sous le titre (compte à rebours, nouvelle grille…). */
  readonly victoryExtra?: ReactNode;
  readonly visible: boolean;
}

/** Ferme un élément ouvert avec le geste retour Android (retour prédictif). */
function useBackClose(open: boolean, close: () => void) {
  useEffect(() => (open ? pushBackHandler(close) : undefined), [open, close]);
}

/** Premier ancêtre qui défile verticalement. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/**
 * Feuille non modale au-dessus de la page : réserve sa hauteur en bas de la zone qui défile
 * (`--sheet-inset`) et fait défiler pour garder visibles les cases concernées.
 */
function useSheetInset(
  open: boolean,
  sheetContent: RefObject<HTMLElement | null>,
  anchor: RefObject<HTMLElement | null>,
  focus: () => { top: number; bottom: number } | null,
) {
  const reduce = useReducedMotion();
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    if (!open) return;
    const sheet = sheetContent.current?.closest<HTMLElement>('.md-sheet');
    const scroller = scrollParent(anchor.current);
    if (!sheet || !scroller) return;
    const update = () => {
      const sheetTop = window.innerHeight - sheet.offsetHeight;
      const inset = Math.max(0, scroller.getBoundingClientRect().bottom - sheetTop);
      scroller.style.setProperty('--sheet-inset', `${Math.ceil(inset)}px`);
      return sheetTop;
    };
    const sheetTop = update();
    const target = focusRef.current();
    if (target) {
      const margin = 12;
      const top = scroller.getBoundingClientRect().top + margin;
      const bottom = sheetTop - margin;
      let delta = target.bottom > bottom ? target.bottom - bottom : 0;
      if (target.top - delta < top) delta = target.top - top;
      if (delta !== 0) scroller.scrollBy({ top: delta, behavior: reduce ? 'auto' : 'smooth' });
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => update());
    observer?.observe(sheet);
    return () => {
      observer?.disconnect();
      scroller.style.removeProperty('--sheet-inset');
    };
  }, [open, sheetContent, anchor, reduce]);
}

export function GameView({ puzzle, api, victoryExtra, visible }: GameViewProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const { regionColors } = useTheme();
  const { settings } = useSettings();
  const snackbar = useSnackbar();
  const { game } = api;
  const [hint, setHint] = useState<{ hint: QueensHint; ex: HintExplanation; marks: readonly QueensMark[] } | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [victoryOpen, setVictoryOpen] = useState(true);
  const boardRef = useRef<HTMLDivElement>(null);
  const hintContentRef = useRef<HTMLDivElement>(null);
  const victoryTitleRef = useRef<HTMLHeadingElement>(null);
  const cancelResetRef = useRef<HTMLButtonElement>(null);

  // Couleurs et textures réparties selon le voisinage : deux régions voisines restent bien distinctes
  // (choisies parmi une palette plus large que le nombre de régions : écarts nettement plus grands).
  const colors = useMemo(() => assignRegionColors(puzzle, regionColors(PALETTE_SIZE)), [regionColors, puzzle]);
  const closeHint = useCallback(() => setHintOpen(false), []);
  const closeRules = useCallback(() => setRulesOpen(false), []);
  const closeReset = useCallback(() => setResetOpen(false), []);
  const sheetOpen = hintOpen && visible && hint !== null;
  useBackClose(sheetOpen, closeHint);
  useBackClose(visible && rulesOpen, closeRules);
  useBackClose(visible && resetOpen, closeReset);

  // Écran quitté (autre onglet) ou grille modifiée : l'indice affiché n'a plus cours.
  useEffect(() => {
    if (!visible) setHintOpen(false);
  }, [visible]);
  useEffect(() => {
    if (hintOpen && hint && game && game.marks !== hint.marks) setHintOpen(false);
  }, [game, hint, hintOpen]);

  const askHint = async () => {
    if (!game || hintLoading) return;
    setHintLoading(true);
    try {
      const h = await engine.queensHint(puzzle, game.marks);
      const ex = explainHint(h, puzzle, lang, (key, n) => t(key, { n }));
      if (h.kind !== 'solved') api.noteHint(hintKey(h));
      setHint({ hint: h, ex, marks: game.marks });
      setHintOpen(true);
    } catch {
      snackbar.show({ message: t('errors.hint') });
    } finally {
      setHintLoading(false);
    }
  };

  const applyHint = () => {
    setHintOpen(false);
    if (hint && game) api.applyHint(hintMoves(hint.hint, game.marks));
  };

  // Cases à garder visibles au-dessus de la feuille : celles de l'indice, sinon toute la grille.
  const hintFocus = useCallback(() => {
    const board = boardRef.current?.getBoundingClientRect();
    if (!board || !hint) return null;
    const h = hint.ex.highlight;
    const cells = [...h.focus, ...h.targets, ...h.eliminate, ...h.mistakes, ...(h.reveal === null ? [] : [h.reveal])];
    if (cells.length === 0) return { top: board.top, bottom: board.bottom };
    const n = puzzle.size;
    const rows = cells.map((c) => Math.floor(c / n));
    const cell = board.height / n;
    return { top: board.top + Math.min(...rows) * cell, bottom: board.top + (Math.max(...rows) + 1) * cell };
  }, [hint, puzzle.size]);
  useSheetInset(sheetOpen, hintContentRef, boardRef, hintFocus);

  // Victoire obtenue en jouant (pas au chargement d'une partie déjà finie) : la carte s'affiche,
  // prend le focus et vient dans le champ de vision.
  const solved = game?.solved ?? false;
  const wasSolved = useRef<boolean | null>(null);
  useEffect(() => {
    if (!game) return;
    const liveWin = wasSolved.current === false && game.solved;
    wasSolved.current = game.solved;
    if (!liveWin) return;
    setVictoryOpen(true);
    setHintOpen(false);
    const id = requestAnimationFrame(() => {
      victoryTitleRef.current?.focus({ preventScroll: true });
      victoryTitleRef.current?.closest('.game__victory')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [game]);

  if (!game) return null;
  const hintKind = hint?.hint.kind;
  // Indice « erreur » affiché : seules les cases fausses sont encadrées (pas les autres reines en conflit).
  const mistakesShown = sheetOpen && hintKind === 'mistake';
  const canApply = hintKind === 'step' || hintKind === 'reveal' || hintKind === 'mistake';
  const time = formatDuration(api.elapsed(), lang);
  const announcement = solved ? `${t('victory.title')} ${t('victory.time', { time })}` : api.conflicts.length > 0 ? t('game.conflicts', { count: api.conflicts.length }) : '';

  return (
    <div className="game">
      {/* Annonces pour les lecteurs d'écran (région permanente : conflits, victoire). */}
      <p className="md-sr-only" aria-live="polite">
        {announcement}
      </p>

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
              aria-hidden="true"
            >
              <Icon name="warning" size={18} />
              {t('game.conflicts', { count: api.conflicts.length })}
            </motion.span>
          )}
        </AnimatePresence>
        <IconButton icon="help" label={t('game.rules')} onClick={() => setRulesOpen(true)} />
      </div>

      <div className="game__board" ref={boardRef}>
        <QueensBoard
          puzzle={puzzle}
          marks={game.marks}
          regionColors={colors}
          conflicts={mistakesShown ? NO_CELLS : api.conflicts}
          attacked={api.attacked}
          highlight={sheetOpen ? hint.ex.highlight : null}
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
              disabled={game.marks.every((m) => m === MARK_EMPTY)}
              onClick={() => setResetOpen(true)}
            />
          </div>
          <ExtendedFab icon="lightbulb" color="primary" onClick={() => void askHint()} disabled={hintLoading || sheetOpen}>
            {t('game.hint')}
          </ExtendedFab>
        </div>
      )}

      {solved && !victoryOpen && (
        <div className="game__actions">
          <Button variant="tonal" icon="emoji_events" onClick={() => setVictoryOpen(true)}>
            {t('victory.show')}
          </Button>
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
                  <h2 className="md-typescale-headline-small victory-card__title" ref={victoryTitleRef} tabIndex={-1}>
                    {t('victory.title')}
                  </h2>
                  <p className="md-typescale-body-large">{t('victory.time', { time })}</p>
                </div>
              </div>
              <div className="victory-card__chips">
                <InfoChip icon="lightbulb">{t('victory.hints', { count: game.hintsUsed })}</InfoChip>
              </div>
              {victoryExtra}
              <Button variant="text" icon="visibility" onClick={() => setVictoryOpen(false)}>
                {t('victory.viewBoard')}
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomSheet open={sheetOpen} onClose={closeHint} modal={false} aria-label={t('hint.title')} dismissLabel={t('common.close')}>
        {hint && (
          <div className="hint-sheet" ref={hintContentRef}>
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
                <Button
                  variant="filled"
                  icon={hintKind === 'mistake' ? 'backspace' : hint.ex.highlight.revealMark === 'cross' ? 'close' : 'crown'}
                  onClick={applyHint}
                >
                  {t(hintKind === 'mistake' ? 'hint.fix' : 'hint.apply')}
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
        role="alertdialog"
        initialFocusRef={cancelResetRef}
        title={t('game.reset')}
        icon="restart_alt"
        actions={
          <>
            <Button variant="text" onClick={closeReset} ref={cancelResetRef}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="text"
              onClick={() => {
                api.reset();
                closeReset();
              }}
            >
              {t('game.resetAction')}
            </Button>
          </>
        }
      >
        <p className="md-typescale-body-medium">{t('game.resetConfirm')}</p>
      </Dialog>
    </div>
  );
}
