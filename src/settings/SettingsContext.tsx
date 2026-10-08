/** Réglages de l'app : contexte React + persistance locale (valeurs validées au chargement). */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LANGUAGES } from '../i18n';
import { loadJSON, saveJSON } from '../platform/storage';
import { DEFAULT_SETTINGS, isReminderTime, type Settings } from './types';

const KEY = 'settings.v1';

/** Fusionne une sauvegarde avec les valeurs par défaut en ignorant tout champ invalide. */
export function sanitizeSettings(raw: unknown): Settings {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = <T,>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  return {
    language: pick(s['language'], ['system', ...LANGUAGES] as const, DEFAULT_SETTINGS.language),
    theme: pick(s['theme'], ['system', 'light', 'dark'] as const, DEFAULT_SETTINGS.theme),
    dynamicColor: bool(s['dynamicColor'], DEFAULT_SETTINGS.dynamicColor),
    haptics: bool(s['haptics'], DEFAULT_SETTINGS.haptics),
    autoCross: bool(s['autoCross'], DEFAULT_SETTINGS.autoCross),
    showConflicts: bool(s['showConflicts'], DEFAULT_SETTINGS.showConflicts),
    regionPatterns: bool(s['regionPatterns'], DEFAULT_SETTINGS.regionPatterns),
    reminder: bool(s['reminder'], DEFAULT_SETTINGS.reminder),
    reminderTime: isReminderTime(s['reminderTime']) ? s['reminderTime'] : DEFAULT_SETTINGS.reminderTime,
    reminderPrompted: bool(s['reminderPrompted'], DEFAULT_SETTINGS.reminderPrompted),
  };
}

export async function loadSettings(): Promise<Settings> {
  return sanitizeSettings(await loadJSON<unknown>(KEY));
}

interface SettingsValue {
  readonly settings: Settings;
  readonly update: (patch: Partial<Settings>) => void;
}

const Ctx = createContext<SettingsValue | null>(null);

export function SettingsProvider({ initial, onChange, children }: { initial: Settings; onChange?: (s: Settings) => void; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);
  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = sanitizeSettings({ ...prev, ...patch });
        void saveJSON(KEY, next);
        onChange?.(next);
        return next;
      });
    },
    [onChange],
  );
  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings hors de SettingsProvider');
  return v;
}
