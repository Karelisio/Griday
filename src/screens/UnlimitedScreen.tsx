/** Mode illimité : grilles aléatoires à la demande (taille et difficulté au choix), partie en cours sauvegardée. */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DifficultyTier, GenerationTarget } from '../../engine/core/types';
import { QUEENS_V1 } from '../../engine/queens/v1/version';
import type { AnyGeneratedPuzzle } from '../../engine/registry';
import { engine } from '../engine-client/client';
import { GameView } from '../game/GameView';
import { useQueensGame } from '../game/queens/useQueensGame';
import { pushBackHandler } from '../platform';
import { loadJSON, removeKey, saveJSON } from '../platform/storage';
import { useSettings } from '../settings/SettingsContext';
import { BottomSheet, Button, Chip, CircularProgress, Icon, SegmentedButton } from '../ui';
import { useToday } from '../useToday';
import './screens.css';

interface CurrentUnlimited {
  readonly token: string;
  readonly target: GenerationTarget;
  readonly puzzle: AnyGeneratedPuzzle;
}

const CURRENT_KEY = 'unlimited.current.v1';
const PREFS_KEY = 'unlimited.prefs.v1';
const progressKey = (token: string) => `unlimited.progress.${token}`;
const SIZES = QUEENS_V1.sizes;
const TIERS: readonly DifficultyTier[] = [1, 2, 3, 4];

/** Jeton aléatoire (aléa cryptographique : le mode illimité n'a pas besoin d'être reproductible). */
function newToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('');
}

function TargetPicker({ target, onChange }: { target: GenerationTarget; onChange: (t: GenerationTarget) => void }) {
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
        options={SIZES.map((n) => ({ value: String(n), label: String(n), ariaLabel: t('unlimited.sizeValue', { n }) }))}
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  useEffect(() => (visible && pickerOpen ? pushBackHandler(closePicker) : undefined), [visible, pickerOpen, closePicker]);

  useEffect(() => {
    void Promise.all([loadJSON<CurrentUnlimited>(CURRENT_KEY), loadJSON<GenerationTarget>(PREFS_KEY)]).then(([cur, prefs]) => {
      if (prefs && SIZES.includes(prefs.size) && TIERS.includes(prefs.tier)) setTarget(prefs);
      if (cur?.puzzle?.type === 'queens') setCurrent(cur);
      setLoaded(true);
    });
  }, []);

  const chooseTarget = (next: GenerationTarget) => {
    setTarget(next);
    void saveJSON(PREFS_KEY, next);
  };

  const start = async () => {
    setPickerOpen(false);
    setLoading(true);
    setError(false);
    try {
      const token = newToken();
      const puzzle = await engine.unlimited('queens', target, token, today);
      const next: CurrentUnlimited = { token, target, puzzle };
      if (current) void removeKey(progressKey(current.token));
      await saveJSON(CURRENT_KEY, next);
      setCurrent(next);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const api = useQueensGame({
    puzzle: current && current.puzzle.type === 'queens' ? current.puzzle.puzzle : null,
    storageKey: current ? progressKey(current.token) : null,
    visible,
    autoCross: settings.autoCross,
  });

  return (
    <section className="screen" aria-labelledby="unlimited-title" hidden={!visible}>
      <header className="screen__header">
        <h1 id="unlimited-title" className="md-typescale-headline-medium screen__title">
          {t('unlimited.title')}
        </h1>
        {current && (
          <div className="screen__chips">
            <Chip icon="grid_view">{t('unlimited.sizeValue', { n: current.target.size })}</Chip>
            <Chip icon="bolt">{t(`difficulty.${current.target.tier}`)}</Chip>
            <Button variant="tonal" size="s" icon="add" onClick={() => setPickerOpen(true)} disabled={loading} className="unlimited__new">
              {t('unlimited.newGame')}
            </Button>
          </div>
        )}
      </header>

      {loading ? (
        <div className="screen__center" role="status">
          <CircularProgress aria-label={t('unlimited.generating')} />
          <p className="md-typescale-body-large">{t('unlimited.generating')}</p>
        </div>
      ) : error ? (
        <div className="screen__center">
          <Icon name="error" size={40} />
          <p className="md-typescale-body-large">{t('errors.generation')}</p>
          <Button variant="tonal" icon="refresh" onClick={() => void start()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : current && current.puzzle.type === 'queens' && api.game ? (
        <GameView
          puzzle={current.puzzle.puzzle}
          api={api}
          visible={visible}
          victoryExtra={
            <Button variant="filled" icon="add" onClick={() => setPickerOpen(true)}>
              {t('victory.newGame')}
            </Button>
          }
        />
      ) : loaded && !current ? (
        <>
          <p className="md-typescale-body-large screen__subtitle">{t('unlimited.empty')}</p>
          <TargetPicker target={target} onChange={chooseTarget} />
          <Button variant="filled" icon="add" size="m" onClick={() => void start()} fullWidth>
            {t('unlimited.newGame')}
          </Button>
        </>
      ) : null}

      <BottomSheet open={pickerOpen} onClose={closePicker} aria-label={t('unlimited.newGame')} dismissLabel={t('common.close')}>
        <div className="unlimited__sheet">
          <h2 className="md-typescale-title-large">{t('unlimited.newGame')}</h2>
          <TargetPicker target={target} onChange={chooseTarget} />
          <Button variant="filled" icon="play_arrow" size="m" onClick={() => void start()} fullWidth>
            {t('unlimited.newGame')}
          </Button>
        </div>
      </BottomSheet>
    </section>
  );
}
