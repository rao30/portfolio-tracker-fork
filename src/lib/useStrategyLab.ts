import { useCallback, useEffect, useState } from 'react';
import type { StrategyLabScenario } from './strategyLab';
import { getAccessToken } from './supabaseClient';
import { getClientConfig } from './clientConfig';

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

export interface UseStrategyLabResult {
  scenarios: StrategyLabScenario[];
  loading: boolean;
  error: string | null;
  canPersist: boolean;
  saving: boolean;
  refresh: () => Promise<void>;
  pinScenario: (input: {
    name: string;
    extraMonthlyBudget: number;
    strategyId: string;
    notes?: string | null;
  }) => Promise<StrategyLabScenario | null>;
  removeScenario: (id: string) => Promise<boolean>;
}

export function useStrategyLab(userId: string | undefined): UseStrategyLabResult {
  const [scenarios, setScenarios] = useState<StrategyLabScenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canPersist = Boolean(userId);

  const refresh = useCallback(async () => {
    if (!userId) {
      setScenarios([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/strategy-lab', {
        headers: await authorizedHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { scenarios: StrategyLabScenario[] };
      setScenarios(data.scenarios);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scenarios');
      setScenarios([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pinScenario = useCallback(
    async (input: {
      name: string;
      extraMonthlyBudget: number;
      strategyId: string;
      notes?: string | null;
    }) => {
      if (!userId) return null;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch('/api/strategy-lab', {
          method: 'POST',
          headers: await authorizedHeaders(true),
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { scenario: StrategyLabScenario };
        setScenarios((prev) => [...prev, data.scenario]);
        return data.scenario;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save scenario');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [userId],
  );

  const removeScenario = useCallback(
    async (id: string) => {
      if (!userId) return false;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/strategy-lab/${id}`, {
          method: 'DELETE',
          headers: await authorizedHeaders(),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        setScenarios((prev) => prev.filter((s) => s.id !== id));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete scenario');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [userId],
  );

  return {
    scenarios,
    loading,
    error,
    canPersist,
    saving,
    refresh,
    pinScenario,
    removeScenario,
  };
}
