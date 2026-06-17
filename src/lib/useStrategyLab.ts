import { useCallback, useEffect, useRef, useState } from 'react';
import type { StrategyId } from './snowball';
import {
  dbRowToScenario,
  defaultScenarioName,
  scenarioMatchesActive,
  scenarioToDbInsert,
  STRATEGY_LAB_MAX_SCENARIOS,
  STRATEGY_LAB_STORAGE_KEY,
  type StrategyLabDbRow,
  type StrategyLabScenario,
} from './strategyLab';
import { getSupabase } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

export type StrategyLabSyncStatus = 'idle' | 'loading' | 'synced' | 'error' | 'local';

export interface UseStrategyLabResult {
  scenarios: StrategyLabScenario[];
  loading: boolean;
  syncStatus: StrategyLabSyncStatus;
  error: string | null;
  canSync: boolean;
  pinCurrent: (budget: number, strategyId: StrategyId, name?: string) => Promise<boolean>;
  removeScenario: (id: string) => Promise<void>;
  renameScenario: (id: string, name: string) => Promise<void>;
  reorderScenario: (id: string, sortOrder: number) => Promise<void>;
  hasActivePinned: (budget: number, strategyId: StrategyId) => boolean;
}

function loadLocal(): StrategyLabScenario[] {
  try {
    const raw = localStorage.getItem(STRATEGY_LAB_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StrategyLabScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(STRATEGY_LAB_STORAGE_KEY);
    return [];
  }
}

function saveLocal(scenarios: StrategyLabScenario[]) {
  localStorage.setItem(STRATEGY_LAB_STORAGE_KEY, JSON.stringify(scenarios));
}

export function useStrategyLab(): UseStrategyLabResult {
  const { user, configured } = useAuth();
  const [scenarios, setScenarios] = useState<StrategyLabScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<StrategyLabSyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const canSync = Boolean(configured && user);

  const loadFromCloud = useCallback(async () => {
    if (!user) return loadLocal();
    const supabase = await getSupabase();
    const { data, error: fetchError } = await supabase
      .from('strategy_lab_scenarios')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_pinned', true)
      .order('sort_order', { ascending: true });

    if (fetchError) throw new Error(fetchError.message);
    return (data as StrategyLabDbRow[]).map(dbRowToScenario);
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        if (canSync) {
          const rows = await loadFromCloud();
          if (mountedRef.current) {
            setScenarios(rows);
            setSyncStatus('synced');
          }
        } else {
          const rows = loadLocal();
          if (mountedRef.current) {
            setScenarios(rows);
            setSyncStatus('local');
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setScenarios(loadLocal());
          setSyncStatus('error');
          setError(err instanceof Error ? err.message : 'Failed to load scenarios');
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [canSync, loadFromCloud]);

  const persistLocal = useCallback((next: StrategyLabScenario[]) => {
    setScenarios(next);
    saveLocal(next);
    if (!canSync) setSyncStatus('local');
  }, [canSync]);

  const pinCurrent = useCallback(
    async (budget: number, strategyId: StrategyId, name?: string) => {
      if (scenarios.length >= STRATEGY_LAB_MAX_SCENARIOS) {
        setError(`Maximum ${STRATEGY_LAB_MAX_SCENARIOS} pinned scenarios`);
        return false;
      }

      const existingNames = scenarios.map((s) => s.name);
      const resolvedName =
        name?.trim() ||
        defaultScenarioName(budget, strategyId, existingNames);

      const sortOrder =
        scenarios.length === 0
          ? 0
          : Math.max(...scenarios.map((s) => s.sortOrder), -1) + 1;

      const draft: Omit<StrategyLabScenario, 'id' | 'createdAt' | 'updatedAt'> = {
        name: resolvedName,
        extraMonthlyBudget: budget,
        strategyId,
        isPinned: true,
        sortOrder,
      };

      if (canSync && user) {
        setSyncStatus('loading');
        try {
          const supabase = await getSupabase();
          const { data, error: insertError } = await supabase
            .from('strategy_lab_scenarios')
            .insert(scenarioToDbInsert(user.id, draft) as never)
            .select()
            .single();

          if (insertError) throw new Error(insertError.message);
          const created = dbRowToScenario(data as StrategyLabDbRow);
          setScenarios((prev) => [...prev, created]);
          setSyncStatus('synced');
          setError(null);
          return true;
        } catch (err) {
          setSyncStatus('error');
          setError(err instanceof Error ? err.message : 'Failed to pin scenario');
          return false;
        }
      }

      const created: StrategyLabScenario = {
        ...draft,
        id: crypto.randomUUID(),
      };
      persistLocal([...scenarios, created]);
      setError(null);
      return true;
    },
    [canSync, persistLocal, scenarios, user],
  );

  const removeScenario = useCallback(
    async (id: string) => {
      if (canSync && user) {
        setSyncStatus('loading');
        try {
          const supabase = await getSupabase();
          const { error: deleteError } = await supabase
            .from('strategy_lab_scenarios')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);
          if (deleteError) throw new Error(deleteError.message);
          setScenarios((prev) => prev.filter((s) => s.id !== id));
          setSyncStatus('synced');
        } catch (err) {
          setSyncStatus('error');
          setError(err instanceof Error ? err.message : 'Failed to remove scenario');
        }
        return;
      }
      persistLocal(scenarios.filter((s) => s.id !== id));
    },
    [canSync, persistLocal, scenarios, user],
  );

  const renameScenario = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      if (canSync && user) {
        setSyncStatus('loading');
        try {
          const supabase = await getSupabase();
          const { data, error: updateError } = await supabase
            .from('strategy_lab_scenarios')
            .update({ name: trimmed, updated_at: new Date().toISOString() } as never)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();
          if (updateError) throw new Error(updateError.message);
          const updated = dbRowToScenario(data as StrategyLabDbRow);
          setScenarios((prev) => prev.map((s) => (s.id === id ? updated : s)));
          setSyncStatus('synced');
        } catch (err) {
          setSyncStatus('error');
          setError(err instanceof Error ? err.message : 'Failed to rename scenario');
        }
        return;
      }

      persistLocal(
        scenarios.map((s) => (s.id === id ? { ...s, name: trimmed } : s)),
      );
    },
    [canSync, persistLocal, scenarios, user],
  );

  const reorderScenario = useCallback(
    async (id: string, sortOrder: number) => {
      if (canSync && user) {
        const supabase = await getSupabase();
        await supabase
          .from('strategy_lab_scenarios')
          .update({ sort_order: sortOrder } as never)
          .eq('id', id)
          .eq('user_id', user.id);
      }
      persistLocal(
        scenarios.map((s) => (s.id === id ? { ...s, sortOrder } : s)),
      );
    },
    [canSync, persistLocal, scenarios, user],
  );

  const hasActivePinned = useCallback(
    (budget: number, strategyId: StrategyId) =>
      scenarios.some((s) => s.isPinned && scenarioMatchesActive(s, budget, strategyId)),
    [scenarios],
  );

  return {
    scenarios,
    loading,
    syncStatus,
    error,
    canSync,
    pinCurrent,
    removeScenario,
    renameScenario,
    reorderScenario,
    hasActivePinned,
  };
}
