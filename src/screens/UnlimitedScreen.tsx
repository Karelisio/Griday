/** Mode illimité : grilles aléatoires à la demande (taille et difficulté au choix), partie en cours sauvegardée. */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localISODate } from '../../engine/core/date';
import type { DifficultyTier, GenerationTarget } from '../../engine/core/types';
import type { AnyGeneratedPuzzle } from '../../engine/registry';
import { engine } from '../engine-client/client';
import { GameView } from '../game/GameView';
import { isGenerationTarget, isStoredQueensPuzzle } from '../game/queens/validate';
import { useQueensGame } from '../game/queens/useQueensGame';
import type { QueensGame } from '../game/queens/state';
import { UNLIMITED_CURRENT_KEY, UNLIMITED_PREFS_KEY, unlimitedProgressKey } from '../persistence';
import { pushBackHandler } from '../platform';
import { loadJSON, removeKey, saveJSON } from '../platform/storage';
import { useProgress } from '../progress/ProgressContext';
import { useSettings } from '../settings/SettingsContext';
import { ShareButton } from '../share/ShareButton';
import { BottomSheet, Button, CircularProgress, Icon, InfoChip, SegmentedButton } from '../ui';
import { useToday } from '../useToday';
import './screens.css';

interface CurrentUnlimited {
  readonly token: string;
  readonly target: GenerationTarget;
  readonly puzzle: AnyGeneratedPuzzle;
}

const TIERS: readonly DifficultyTier[] = [1, 2, 3, 4];

/** Jeton aléatoire (aléa cryptographique : le mode illimité n'a pas besoin d'être reproductible). */
function newToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

/** Partie relue du stockage : cohérente de bout en bout, sinon ignorée. */
export function isCurrentUnlimited(v: unknown): v is CurrentUnlimited {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Partial<Record<keyof CurrentUnlimited, unknown>>;
  return (
    typeof c.token === 'string' &&
    /^[0-9a-z]{1,64}$/.test(c.token) &&
    isGenerationTarget(c.target) &&
    isStoredQueensPuzzle(c.puzzle, { size: c.target.size, allowEmergency: true })
  );
}

function TargetPicker({ target, sizes, onChange }: { target: GenerationTarget; sizes: readonly number[]; onChange: (t: GenerationTarget) => void }) {
  const { t } = useTranslation();
  return (
    <div className="unlimited__controls">
      <p className="md-typescale-label-large unlimited__label" id="unl-size">
        {t('unlimited.size')}
      </p>
      <SegmentedButton
        aria-labelledby="unl-size"
        value={String(target.size)}
        onChange={(v) => onChange({ ...target, size: Number(v) })}
        options={sizes.map((n) => ({ value: String(n), label: String(n), ariaLabel: t('unlimited.sizeValue', { n }) }))}
        showCheck={false}
      />
      <p className="md-typescale-label-large unlimited__label" id="unl-tier">
        {t('unlimited.difficulty')}
      </p>
      <SegmentedButton
        aria-labelledby="unl-tier"
        value={String(target.tier)}
        onChange={(v) => onChange({ ...target, tier: Number(v) as DifficultyTier })}
        options={TIERS.map((tier) => ({ value: String(tier), label: t(`difficulty.${tier}`) }))}
        showCheck={false}
        className="segmented--fit"
      />
    </div>
  );
}

export function UnlimitedScreen({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const today = useToday();
  const { settings } = useSettings();
  const [target, setTarget] = useState<GenerationTarget>({ size: 7, tier: 2 });
  const [current, setCurrent] = useState<CurrentUnlimited | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sizes, setSizes] = useState<readonly number[]>([]);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  useEffect(() => (visible && pickerOpen ? pushBackHandler(closePicker) : undefined), [visible, pickerOpen, closePicker]);
  useEffect(() => {
    if (!visible) setPickerOpen(false);
  }, [visible]);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    void (async () => {
      try {
        const [cur, prefs, options] = await Promise.all([
          loadJSON<unknown>(UNLIMITED_CURRENT_KEY),
          loadJSON<unknown>(UNLIMITED_PREFS_KEY),
          engine.unlimitedOptions('queens', today),
        ]);
        if (cancelled) return;
        setSizes(options.sizes);
        if (isGenerationTarget(prefs, options.sizes)) setTarget(prefs);
        if (isCurrentUnlimited(cur)) setCurrent(cur);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today, loadAttempt]);

  const chooseTarget = (next: GenerationTarget) => {
    setTarget(next);
    void saveJSON(UNLIMITED_PREFS_KEY, next);
  };

  const start = async () => {
    setPickerOpen(false);
    setLoading(true);
    setError(false);
    try {
      const token = newToken();
      const puzzle = await engine.unlimited('queens', target, token, today);
      const next: CurrentUnlimited = { token, target, puzzle };
      if (current) void removeKey(unlimitedProgressKey(current.token));
      await saveJSON(UNLIMITED_CURRENT_KEY, next);
      setCurrent(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const { recordUnlimited } = useProgress();
  const played = current?.target;
  const onSolved = useCallback(
    (g: QueensGame) => {
      if (played) recordUnlimited({ size: played.size, tier: played.tier, timeMs: Math.floor(g.elapsedMs), hintsUsed: g.hintsUsed, solvedOn: localISODate(new Date()) });
    },
    [played, recordUnlimited],
  );
  const api = useQueensGame({
    puzzle: current && current.puzzle.type === 'queens' ? current.puzzle.puzzle : null,
    storageKey: current ? unlimitedProgressKey(current.token) : null,
    visible,
    autoCross: settings.autoCross,
    onSolved,
  });

  return (
    <section className="screen" aria-labelledby="unlimited-title" hidden={!visible}>
      <header className="screen__header">
        <h1 id="unlimited-title" className="md-typescale-headline-medium screen__title">
          {t('unlimited.title')}
        </h1>
        {current && (
          <div className="screen__chips">
            <InfoChip icon="grid_view">{t('unlimited.sizeValue', { n: current.target.size })}</InfoChip>
            <InfoChip icon="bolt">{t(`difficulty.${current.target.tier}`)}</InfoChip>
            {!pickerOpen && (
              <Button variant="tonal" size="s" icon="add" layoutId="unlimited-new" onClick={() => setPickerOpen(true)} disabled={loading} className="unlimited__new">
                {t('unlimited.newGame')}
              </Button>
            )}
          </div>
        )}
      </header>

      {loading ? (
        <div className="screen__center" role="status">
          <CircularProgress aria-label={t('unlimited.generating')} />
          <p className="md-typescale-body-large">{t('unlimited.generating')}</p>
        </div>
      ) : error || loadFailed ? (
        <div className="screen__center">
          <Icon name="error" size={40} />
          <p className="md-typescale-body-large">{t('errors.generation')}</p>
          <Button variant="tonal" icon="refresh" onClick={() => (loadFailed ? setLoadAttempt((a) => a + 1) : void start())}>
            {t('common.retry')}
          </Button>
        </div>
      ) : current && current.puzzle.type === 'queens' && api.game ? (
        <GameView
          key={current.token}
          puzzle={current.puzzle.puzzle}
          api={api}
          visible={visible}
          victoryExtra={
            <div className="victory-card__actions">
              <Button variant="filled" icon="add" onClick={() => setPickerOpen(true)}>
                {t('victory.newGame')}
              </Button>
              <ShareButton
                variant="tonal"
                result={{ kind: 'unlimited', size: current.target.size, tier: current.target.tier, timeMs: api.game.elapsedMs, hintsUsed: api.game.hintsUsed }}
              />
            </div>
          }
        />
      ) : loaded && !current ? (
        <>
          <p className="md-typescale-body-large screen__subtitle">{t('unlimited.empty')}</p>
          <TargetPicker target={target} sizes={sizes} onChange={chooseTarget} />
          <Button variant="filled" icon="add" size="m" onClick={() => void start()} fullWidth>
            {t('unlimited.newGame')}
          </Button>
        </>
      ) : null}

      <BottomSheet
        open={pickerOpen && visible}
        onClose={closePicker}
        aria-label={t('unlimited.newGame')}
        dismissLabel={t('common.close')}
        layoutId={current ? 'unlimited-new' : undefined}
      >
        <div className="unlimited__sheet">
          <h2 className="md-typescale-title-large">{t('unlimited.newGame')}</h2>
          <TargetPicker target={target} sizes={sizes} onChange={chooseTarget} />
          <Button variant="filled" icon="play_arrow" size="m" onClick={() => void start()} fullWidth>
            {t('unlimited.newGame')}
          </Button>
        </div>
      </BottomSheet>
    </section>
  );
}
