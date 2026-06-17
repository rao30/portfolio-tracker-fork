import { useCallback, useEffect, useState } from 'react';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  createLocalStrategyLabScenario,
  createRemoteStrategyLabScenario,
  deleteLocalStrategyLabScenario,
  deleteRemoteStrategyLabScenario,
  fetchStrategyLabScenarios,
  loadLocalStrategyLabScenarios,
  MAX_STRATEGY_LAB_SCENARIOS,
  saveLocalStrategyLabScenarios,
  type StrategyLabScenario,
  updateLocalStrategyLabScenario,
  updateRemoteStrategyLabScenario,
} from './strategyLab';
import type { StrategyId } from './snowball';

export function useStrategyLab() {
  const { session, configured } = useAuth();
  const [scenarios, setScenarios] = useState<StrategyLabScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const cloudBacked = configured && Boolean(session);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (cloudBacked) {
        const token = await getAccessToken();
        const config = await getClientConfig();
        const remote = await fetchStrategyLabScenarios(
          token,
          config.portfolioApiKey ?? null,
        );
        setScenarios(remote);
        saveLocalStrategyLabScenarios(remote);
      } else {
        setScenarios(loadLocalStrategyLabScenarios());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Strategy Lab';
      setError(message);
      setScenarios(loadLocalStrategyLabScenarios());
    } finally {
      setLoading(false);
    }
  }, [cloudBacked]);

  useEffect(() => {
    void load();
  }, [load]);

  const pinScenario = useCallback(
    async (input: {
      name: string;
      extraMonthlyBudget: number;
      strategyId: StrategyId;
      notes?: string;
    }) => {
      setSyncing(true);
      setError(null);
      try {
        if (cloudBacked) {
          const token = await getAccessToken();
          const config = await getClientConfig();
          const created = await createRemoteStrategyLabScenario(
            input,
            token,
            config.portfolioApiKey ?? null,
          );
          setScenarios((prev) => [...prev, created]);
          saveLocalStrategyLabScenarios([...scenarios, created]);
          return created;
        }

        const next = createLocalStrategyLabScenario(scenarios, input);
        setScenarios(next);
        saveLocalStrategyLabScenarios(next);
        return next[next.length - 1];
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to pin scenario';
        setError(message);
        throw err;
      } finally {
        setSyncing(false);
      }
    },
    [cloudBacked, scenarios],
  );

  const renameScenario = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      setSyncing(true);
      setError(null);
      try {
        if (cloudBacked) {
          const token = await getAccessToken();
          const config = await getClientConfig();
          const updated = await updateRemoteStrategyLabScenario(
            id,
            { name: trimmed },
            token,
            config.portfolioApiKey ?? null,
          );
          setScenarios((prev) => prev.map((s) => (s.id === id ? updated : s)));
        } else {
          const next = updateLocalStrategyLabScenario(scenarios, id, { name: trimmed });
          setScenarios(next);
          saveLocalStrategyLabScenarios(next);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to rename scenario';
        setError(message);
      } finally {
        setSyncing(false);
      }
    },
    [cloudBacked, scenarios],
  );

  const removeScenario = useCallback(
    async (id: string) => {
      setSyncing(true);
      setError(null);
      try {
        if (cloudBacked) {
          const token = await getAccessToken();
          const config = await getClientConfig();
          await deleteRemoteStrategyLabScenario(
            id,
            token,
            config.portfolioApiKey ?? null,
          );
          setScenarios((prev) => prev.filter((s) => s.id !== id));
        } else {
          const next = deleteLocalStrategyLabScenario(scenarios, id);
          setScenarios(next);
          saveLocalStrategyLabScenarios(next);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete scenario';
        setError(message);
      } finally {
        setSyncing(false);
      }
    },
    [cloudBacked, scenarios],
  );

  return {
    scenarios,
    loading,
    error,
    syncing,
    cloudBacked,
    maxScenarios: MAX_STRATEGY_LAB_SCENARIOS,
    canPinMore: scenarios.length < MAX_STRATEGY_LAB_SCENARIOS,
    pinScenario,
    renameScenario,
    removeScenario,
    reload: load,
  };
}
