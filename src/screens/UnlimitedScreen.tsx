/** Mode illimité : grilles aléatoires à la demande (taille et difficulté au choix), partie en cours sauvegardée. */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localISODate } from '../../engine/core/date';
import { PUZZLE_TYPE_IDS, type DifficultyTier, type GenerationTarget, type PuzzleTypeId } from '../../engine/core/types';
import type { AnyGeneratedPuzzle } from '../../engine/registry';
import { engine } from '../engine-client/client';
import { GameView } from '../game/GameView';
import { NO_RULES } from '../game/core/rules';
import type { GameState } from '../game/core/state';
import { useGameSession } from '../game/core/useGameSession';
import { isStoredGenerated } from '../game/core/validate';
import { gameKind } from '../game/kinds';
import { isGenerationTarget } from '../game/queens/validate';
import { UNLIMITED_CURRENT_KEY, UNLIMITED_PREFS_KEY, unlimitedProgressKey } from '../persistence';
import { pushBackHandler } from '../platform';
import { loadJSON, removeKey, saveJSON } from '../platform/storage';
import { useProgress } from '../progress/ProgressContext';
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

const isRecordWithType = (v: unknown): v is { type: PuzzleTypeId } =>
  typeof v === 'object' && v !== null && typeof (v as { type?: unknown }).type === 'string' && PUZZLE_TYPE_IDS.includes((v as { type: PuzzleTypeId }).type);

/** Partie relue du stockage : cohérente de bout en bout, sinon ignorée. */
export function isCurrentUnlimited(v: unknown): v is CurrentUnlimited {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Partial<Record<keyof CurrentUnlimited, unknown>>;
  return (
    typeof c.token === 'string' &&
    /^[0-9a-z]{1,64}$/.test(c.token) &&
    isGenerationTarget(c.target) &&
    isRecordWithType(c.puzzle) &&
    (() => {
      const kind = gameKind(c.puzzle.type);
      return kind !== null && isStoredGenerated(c.puzzle, kind, { size: c.target.size, allowEmergency: true });
    })()
  );
}

/** Choix de la partie : type (dès que plusieurs sont jouables), taille, difficulté. */
interface Choice extends GenerationTarget {
  readonly type: PuzzleTypeId;
}

function TargetPicker({
  choice,
  types,
  sizes,
  onChange,
}: {
  choice: Choice;
  types: readonly PuzzleTypeId[];
  sizes: readonly number[];
  onChange: (c: Choice) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="unlimited__controls">
      {types.length > 1 && (
        <>
          <p className="md-typescale-label-large unlimited__label" id="unl-type">
            {t('unlimited.type')}
          </p>
          <SegmentedButton<PuzzleTypeId>
            aria-labelledby="unl-type"
            value={choice.type}
            onChange={(type) => onChange({ ...choice, type })}
            options={types.map((type) => ({ value: type, icon: gameKind(type)?.icon, label: t(`puzzle.${type}.name`) }))}
            showCheck={false}
          />
        </>
      )}
      <p className="md-typescale-label-large unlimited__label" id="unl-size">
        {t('unlimited.size')}
      </p>
      <SegmentedButton
        aria-labelledby="unl-size"
        value={String(choice.size)}
        onChange={(v) => onChange({ ...choice, size: Number(v) })}
        options={sizes.map((n) => ({ value: String(n), label: String(n), ariaLabel: t('unlimited.sizeValue', { n }) }))}
        showCheck={false}
      />
      <p className="md-typescale-label-large unlimited__label" id="unl-tier">
        {t('unlimited.difficulty')}
      </p>
      <SegmentedButton
        aria-labelledby="unl-tier"
        value={String(choice.tier)}
        onChange={(v) => onChange({ ...choice, tier: Number(v) as DifficultyTier })}
        options={TIERS.map((tier) => ({ value: String(tier), label: t(`difficulty.${tier}`) }))}
        showCheck={false}
        className="segmented--fit"
      />
    </div>
  );
}

/** Taille gardée si le type la propose, sinon la plus proche. */
function fitSize(size: number, sizes: readonly number[]): number {
  return sizes.reduce((best, n) => (Math.abs(n - size) < Math.abs(best - size) ? n : best), sizes[0] ?? size);
}

export function UnlimitedScreen({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const today = useToday();
  const [choice, setChoice] = useState<Choice>({ type: 'queens', size: 7, tier: 2 });
  const [current, setCurrent] = useState<CurrentUnlimited | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Types jouables (moteur + interface) et tailles proposées par chacun.
  const [sizesByType, setSizesByType] = useState<Partial<Record<PuzzleTypeId, readonly number[]>>>({});
  const types = PUZZLE_TYPE_IDS.filter((type) => gameKind(type) !== null && sizesByType[type]);
  const sizes = sizesByType[choice.type] ?? [];
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
        const playable = PUZZLE_TYPE_IDS.filter((type) => gameKind(type) !== null);
        const [cur, prefs, ...options] = await Promise.all([
          loadJSON<unknown>(UNLIMITED_CURRENT_KEY),
          loadJSON<unknown>(UNLIMITED_PREFS_KEY),
          ...playable.map((type) => engine.unlimitedOptions(type, today)),
        ]);
        if (cancelled) return;
        const bySize = Object.fromEntries(playable.map((type, i) => [type, options[i]!.sizes])) as Partial<Record<PuzzleTypeId, readonly number[]>>;
        setSizesByType(bySize);
        const savedType = (prefs as { type?: unknown } | undefined)?.type;
        const type = playable.includes(savedType as PuzzleTypeId) ? (savedType as PuzzleTypeId) : 'queens';
        if (isGenerationTarget(prefs, bySize[type])) setChoice({ type, size: prefs.size, tier: prefs.tier });
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

  const choose = (next: Choice) => {
    const fitted = { ...next, size: fitSize(next.size, sizesByType[next.type] ?? []) };
    setChoice(fitted);
    void saveJSON(UNLIMITED_PREFS_KEY, fitted);
  };

  const start = async () => {
    setPickerOpen(false);
    setLoading(true);
    setError(false);
    try {
      const token = newToken();
      const target: GenerationTarget = { size: choice.size, tier: choice.tier };
      const puzzle = await engine.unlimited(choice.type, target, token, today);
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
  const playedType = current?.puzzle.type;
  const onSolved = useCallback(
    (g: GameState<unknown>) => {
      if (!played) return;
      recordUnlimited({ type: playedType, size: played.size, tier: played.tier, timeMs: Math.floor(g.elapsedMs), hintsUsed: g.hintsUsed, solvedOn: localISODate(new Date()) });
    },
    [played, playedType, recordUnlimited],
  );
  const kind = current ? gameKind(current.puzzle.type) : null;
  const api = useGameSession(kind?.rules ?? NO_RULES, {
    puzzle: kind && current ? current.puzzle.puzzle : null,
    storageKey: current ? unlimitedProgressKey(current.token) : null,
    visible,
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
            {types.length > 1 && <InfoChip icon={kind?.icon ?? 'extension'}>{t(`puzzle.${current.puzzle.type}.name`)}</InfoChip>}
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
      ) : current && kind && api.game ? (
        <GameView
          key={current.token}
          puzzle={current.puzzle.puzzle}
          kind={kind}
          session={api}
          visible={visible}
          victoryExtra={
            <div className="victory-card__actions">
              <Button variant="filled" icon="add" onClick={() => setPickerOpen(true)}>
                {t('victory.newGame')}
              </Button>
              <ShareButton
                variant="tonal"
                result={{
                  kind: 'unlimited',
                  type: current.puzzle.type,
                  size: current.target.size,
                  tier: current.target.tier,
                  timeMs: api.game.elapsedMs,
                  hintsUsed: api.game.hintsUsed,
                }}
              />
            </div>
          }
        />
      ) : loaded && !current ? (
        <>
          <p className="md-typescale-body-large screen__subtitle">{t('unlimited.empty')}</p>
          <TargetPicker choice={choice} types={types} sizes={sizes} onChange={choose} />
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
          <TargetPicker choice={choice} types={types} sizes={sizes} onChange={choose} />
          <Button variant="filled" icon="play_arrow" size="m" onClick={() => void start()} fullWidth>
            {t('unlimited.newGame')}
          </Button>
        </div>
      </BottomSheet>
    </section>
  );
}
