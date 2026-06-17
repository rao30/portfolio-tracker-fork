import { useCallback, useEffect, useState } from 'react';
import type { StrategyId } from './snowball';
import {
  MAX_PINNED_SCENARIOS,
  type StrategyLabScenario,
} from './strategyLab';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-strategy-lab';

type SyncStatus = 'idle' | 'loading' | 'saving' | 'error';

function loadLocal(): StrategyLabScenario[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StrategyLabScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(scenarios: StrategyLabScenario[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(scenarios));
}

function newLocalId() {
  return `local-${crypto.randomUUID()}`;
}

async function authHeaders(json = false): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export interface UseStrategyLabResult {
  scenarios: StrategyLabScenario[];
  loading: boolean;
  syncStatus: SyncStatus;
  error: string | null;
  cloudEnabled: boolean;
  canPin: boolean;
  pinScenario: (input: {
    name: string;
    extraMonthlyBudget: number;
    strategyId: StrategyId;
    notes?: string | null;
  }) => Promise<boolean>;
  updateScenario: (
    id: string,
    patch: Partial<
      Pick<
        StrategyLabScenario,
        'name' | 'extraMonthlyBudget' | 'strategyId' | 'notes' | 'sortOrder'
      >
    >,
  ) => Promise<boolean>;
  deleteScenario: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useStrategyLab(): UseStrategyLabResult {
  const { session, configured: authConfigured } = useAuth();
  const [scenarios, setScenarios] = useState<StrategyLabScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const cloudEnabled = authConfigured && Boolean(session);

  const refresh = useCallback(async () => {
    if (!cloudEnabled) {
      setScenarios(loadLocal());
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategy-lab', {
        headers: await authHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
        );
      }
      const body = (await res.json()) as { scenarios: StrategyLabScenario[] };
      setScenarios(body.scenarios ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Strategy Lab');
      setScenarios(loadLocal());
    } finally {
      setLoading(false);
    }
  }, [cloudEnabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pinScenario = useCallback(
    async (input: {
      name: string;
      extraMonthlyBudget: number;
      strategyId: StrategyId;
      notes?: string | null;
    }) => {
      if (scenarios.length >= MAX_PINNED_SCENARIOS) {
        setError(`You can pin at most ${MAX_PINNED_SCENARIOS} scenarios`);
        return false;
      }

      setSyncStatus('saving');
      setError(null);

      if (!cloudEnabled) {
        const next: StrategyLabScenario = {
          id: newLocalId(),
          name: input.name.trim(),
          extraMonthlyBudget: input.extraMonthlyBudget,
          strategyId: input.strategyId,
          isPinned: true,
          notes: input.notes ?? null,
          sortOrder: scenarios.length,
        };
        const updated = [...scenarios, next];
        setScenarios(updated);
        saveLocal(updated);
        setSyncStatus('idle');
        return true;
      }

      try {
        const res = await fetch('/api/strategy-lab', {
          method: 'POST',
          headers: await authHeaders(true),
          body: JSON.stringify(input),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body.error === 'string' ? body.error : 'Failed to pin scenario',
          );
        }
        await refresh();
        setSyncStatus('idle');
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to pin scenario');
        setSyncStatus('error');
        return false;
      }
    },
    [cloudEnabled, refresh, scenarios],
  );

  const updateScenario = useCallback(
    async (
      id: string,
      patch: Partial<
        Pick<
          StrategyLabScenario,
          'name' | 'extraMonthlyBudget' | 'strategyId' | 'notes' | 'sortOrder'
        >
      >,
    ) => {
      setSyncStatus('saving');
      setError(null);

      if (!cloudEnabled || id.startsWith('local-')) {
        const updated = scenarios.map((s) =>
          s.id === id ? { ...s, ...patch } : s,
        );
        setScenarios(updated);
        saveLocal(updated);
        setSyncStatus('idle');
        return true;
      }

      try {
        const res = await fetch(`/api/strategy-lab/${id}`, {
          method: 'PUT',
          headers: await authHeaders(true),
          body: JSON.stringify(patch),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body.error === 'string' ? body.error : 'Failed to update scenario',
          );
        }
        await refresh();
        setSyncStatus('idle');
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update scenario');
        setSyncStatus('error');
        return false;
      }
    },
    [cloudEnabled, refresh, scenarios],
  );

  const deleteScenario = useCallback(
    async (id: string) => {
      setSyncStatus('saving');
      setError(null);

      if (!cloudEnabled || id.startsWith('local-')) {
        const updated = scenarios.filter((s) => s.id !== id);
        setScenarios(updated);
        saveLocal(updated);
        setSyncStatus('idle');
        return true;
      }

      try {
        const res = await fetch(`/api/strategy-lab/${id}`, {
          method: 'DELETE',
          headers: await authHeaders(),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof body.error === 'string' ? body.error : 'Failed to delete scenario',
          );
        }
        await refresh();
        setSyncStatus('idle');
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete scenario');
        setSyncStatus('error');
        return false;
      }
    },
    [cloudEnabled, refresh, scenarios],
  );

  return {
    scenarios,
    loading,
    syncStatus,
    error,
    cloudEnabled,
    canPin: scenarios.length < MAX_PINNED_SCENARIOS,
    pinScenario,
    updateScenario,
    deleteScenario,
    refresh,
  };
}
