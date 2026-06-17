import { useCallback, useEffect, useState } from 'react';
import type { StrategyId } from './snowball';
import { getAccessToken } from './supabaseClient';

export interface StrategyLabScenario {
  id: string;
  name: string;
  extraMonthlyBudget: number;
  strategyId: StrategyId;
  isPinned: boolean;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface UseStrategyLabResult {
  scenarios: StrategyLabScenario[];
  loading: boolean;
  error: string | null;
  cloudEnabled: boolean;
  pinScenario: (input: {
    name: string;
    extraMonthlyBudget: number;
    strategyId: StrategyId;
    notes?: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  removeScenario: (id: string) => Promise<{ ok: boolean; message?: string }>;
  refresh: () => Promise<void>;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function useStrategyLab(enabled: boolean): UseStrategyLabResult {
  const [scenarios, setScenarios] = useState<StrategyLabScenario[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [cloudEnabled, setCloudEnabled] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setScenarios([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategy-lab/scenarios', {
        headers: await authHeaders(),
      });
      const body = (await res.json()) as {
        scenarios?: StrategyLabScenario[];
        cloudEnabled?: boolean;
        error?: string;
      };
      setCloudEnabled(Boolean(body.cloudEnabled));
      if (!res.ok) {
        setScenarios([]);
        setError(body.error ?? 'Failed to load pinned scenarios');
        return;
      }
      setScenarios(body.scenarios ?? []);
    } catch {
      setError('Failed to load pinned scenarios');
      setScenarios([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pinScenario = useCallback(
    async (input: {
      name: string;
      extraMonthlyBudget: number;
      strategyId: StrategyId;
      notes?: string;
    }) => {
      try {
        const res = await fetch('/api/strategy-lab/scenarios', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify(input),
        });
        const body = (await res.json()) as {
          scenario?: StrategyLabScenario;
          error?: string;
        };
        if (!res.ok) {
          return { ok: false, message: body.error ?? 'Failed to pin scenario' };
        }
        if (body.scenario) {
          setScenarios((prev) => [...prev, body.scenario!]);
        } else {
          await refresh();
        }
        return { ok: true };
      } catch {
        return { ok: false, message: 'Failed to pin scenario' };
      }
    },
    [refresh],
  );

  const removeScenario = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/strategy-lab/scenarios/${id}`, {
          method: 'DELETE',
          headers: await authHeaders(),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          return { ok: false, message: body.error ?? 'Failed to remove scenario' };
        }
        setScenarios((prev) => prev.filter((s) => s.id !== id));
        return { ok: true };
      } catch {
        return { ok: false, message: 'Failed to remove scenario' };
      }
    },
    [],
  );

  return {
    scenarios,
    loading,
    error,
    cloudEnabled,
    pinScenario,
    removeScenario,
    refresh,
  };
}
