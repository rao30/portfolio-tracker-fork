import { useCallback, useEffect, useState } from 'react';
import type { ScenarioConfig, StrategyId } from './types';
import type {
  StrategyLabPinInput,
  StrategyLabPreferences,
  StrategyLabScenario,
} from './strategyLabTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_SCENARIOS_KEY = 'rental-snowball-strategy-lab';
const LOCAL_PREFS_KEY = 'rental-snowball-strategy-lab-prefs';
const MAX_PINNED = 9;

const DEFAULT_PREFERENCES: StrategyLabPreferences = {
  isCollapsed: false,
  lastExploredPinId: null,
  committedPinId: null,
  updatedAt: null,
};

async function authorizedHeaders(jsonBody = false): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (jsonBody) headers['Content-Type'] = 'application/json';
  const token = await getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  const config = await getClientConfig();
  const key = config.portfolioApiKey || config.portfolioWriteKey;
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function loadLocalScenarios(): StrategyLabScenario[] {
  try {
    const raw = localStorage.getItem(LOCAL_SCENARIOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StrategyLabScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(LOCAL_SCENARIOS_KEY);
    return [];
  }
}

function saveLocalScenarios(scenarios: StrategyLabScenario[]): void {
  localStorage.setItem(LOCAL_SCENARIOS_KEY, JSON.stringify(scenarios));
}

function loadLocalPreferences(): StrategyLabPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_PREFS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as StrategyLabPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_PREFS_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: StrategyLabPreferences): void {
  localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(prefs));
}

function nextLocalSortOrder(scenarios: StrategyLabScenario[]): number {
  const used = new Set(scenarios.map((s) => s.sortOrder));
  for (let slot = 1; slot <= MAX_PINNED; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  throw new Error(`Maximum of ${MAX_PINNED} pinned scenarios reached`);
}

function makeLocalScenario(input: StrategyLabPinInput, sortOrder: number): StrategyLabScenario {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    extraMonthlyBudget: input.extraMonthlyBudget,
    strategyId: input.strategyId,
    scenario: input.scenario,
    isPinned: true,
    notes: input.notes?.trim() || null,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UseStrategyLabResult {
  scenarios: StrategyLabScenario[];
  preferences: StrategyLabPreferences;
  loading: boolean;
  saving: boolean;
  error: string | null;
  cloudBacked: boolean;
  pinCurrent: (input: StrategyLabPinInput) => Promise<StrategyLabScenario | null>;
  updateScenario: (
    id: string,
    patch: Partial<StrategyLabPinInput> & { sortOrder?: number },
  ) => Promise<boolean>;
  deleteScenario: (id: string) => Promise<boolean>;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setLastExploredPinId: (id: string | null) => Promise<void>;
  setCommittedPinId: (id: string | null) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useStrategyLab(): UseStrategyLabResult {
  const { user } = useAuth();
  const [scenarios, setScenarios] = useState<StrategyLabScenario[]>([]);
  const [preferences, setPreferences] = useState<StrategyLabPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudBacked, setCloudBacked] = useState(false);

  const persistPreferences = useCallback(
    async (patch: Partial<StrategyLabPreferences>) => {
      const next = { ...preferences, ...patch, updatedAt: new Date().toISOString() };
      setPreferences(next);

      if (cloudBacked && user) {
        setSaving(true);
        try {
          const res = await fetch('/api/strategy-lab/preferences', {
            method: 'PUT',
            headers: await authorizedHeaders(true),
            body: JSON.stringify(patch),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
            );
          }
          const data = (await res.json()) as { preferences: StrategyLabPreferences };
          setPreferences(data.preferences);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to save preferences');
        } finally {
          setSaving(false);
        }
        return;
      }

      saveLocalPreferences(next);
    },
    [cloudBacked, preferences, user],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/strategy-lab', {
        headers: await authorizedHeaders(),
      });

      if (res.status === 401) {
        setCloudBacked(false);
        setScenarios(loadLocalScenarios());
        setPreferences(loadLocalPreferences());
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
        );
      }

      const data = (await res.json()) as {
        scenarios: StrategyLabScenario[];
        preferences?: StrategyLabPreferences;
      };
      setCloudBacked(true);
      setScenarios(data.scenarios ?? []);
      setPreferences(data.preferences ?? DEFAULT_PREFERENCES);
    } catch (err) {
      setCloudBacked(false);
      setScenarios(loadLocalScenarios());
      setPreferences(loadLocalPreferences());
      setError(err instanceof Error ? err.message : 'Failed to load Strategy Lab');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, user?.id]);

  const pinCurrent = useCallback(
    async (input: StrategyLabPinInput): Promise<StrategyLabScenario | null> => {
      setSaving(true);
      setError(null);

      try {
        if (cloudBacked && user) {
          const res = await fetch('/api/strategy-lab', {
            method: 'POST',
            headers: await authorizedHeaders(true),
            body: JSON.stringify(input),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
            );
          }
          const data = (await res.json()) as { scenario: StrategyLabScenario };
          setScenarios((prev) =>
            [...prev, data.scenario].sort((a, b) => a.sortOrder - b.sortOrder),
          );
          return data.scenario;
        }

        const current = loadLocalScenarios();
        if (current.length >= MAX_PINNED) {
          throw new Error(`Maximum of ${MAX_PINNED} pinned scenarios reached`);
        }
        const created = makeLocalScenario(input, nextLocalSortOrder(current));
        const next = [...current, created].sort((a, b) => a.sortOrder - b.sortOrder);
        saveLocalScenarios(next);
        setScenarios(next);
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to pin scenario');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [cloudBacked, user],
  );

  const updateScenario = useCallback(
    async (
      id: string,
      patch: Partial<StrategyLabPinInput> & { sortOrder?: number },
    ): Promise<boolean> => {
      setSaving(true);
      setError(null);

      try {
        if (cloudBacked && user) {
          const res = await fetch(`/api/strategy-lab/${id}`, {
            method: 'PUT',
            headers: await authorizedHeaders(true),
            body: JSON.stringify(patch),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
            );
          }
          const data = (await res.json()) as { scenario: StrategyLabScenario };
          setScenarios((prev) =>
            prev
              .map((s) => (s.id === id ? data.scenario : s))
              .sort((a, b) => a.sortOrder - b.sortOrder),
          );
          return true;
        }

        const current = loadLocalScenarios();
        const idx = current.findIndex((s) => s.id === id);
        if (idx < 0) throw new Error('Scenario not found');
        const updated: StrategyLabScenario = {
          ...current[idx],
          ...patch,
          name: patch.name?.trim() ?? current[idx].name,
          notes: patch.notes !== undefined ? patch.notes?.trim() || null : current[idx].notes,
          updatedAt: new Date().toISOString(),
        };
        const next = current.map((s) => (s.id === id ? updated : s));
        saveLocalScenarios(next);
        setScenarios(next);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update scenario');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [cloudBacked, user],
  );

  const deleteScenario = useCallback(
    async (id: string): Promise<boolean> => {
      setSaving(true);
      setError(null);

      try {
        if (cloudBacked && user) {
          const res = await fetch(`/api/strategy-lab/${id}`, {
            method: 'DELETE',
            headers: await authorizedHeaders(),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
            );
          }
          setScenarios((prev) => prev.filter((s) => s.id !== id));
          return true;
        }

        const next = loadLocalScenarios().filter((s) => s.id !== id);
        saveLocalScenarios(next);
        setScenarios(next);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete scenario');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [cloudBacked, user],
  );

  const setCollapsed = useCallback(
    (collapsed: boolean) => persistPreferences({ isCollapsed: collapsed }),
    [persistPreferences],
  );

  const setLastExploredPinId = useCallback(
    (id: string | null) => persistPreferences({ lastExploredPinId: id }),
    [persistPreferences],
  );

  const setCommittedPinId = useCallback(
    (id: string | null) => persistPreferences({ committedPinId: id }),
    [persistPreferences],
  );

  return {
    scenarios,
    preferences,
    loading,
    saving,
    error,
    cloudBacked,
    pinCurrent,
    updateScenario,
    deleteScenario,
    setCollapsed,
    setLastExploredPinId,
    setCommittedPinId,
    refresh,
  };
}

export type { StrategyLabScenario, StrategyLabPinInput };
