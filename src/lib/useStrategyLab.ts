import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScenarioConfig } from './types';
import type { StrategyId } from './snowball';
import { getSupabase } from './supabaseClient';
import {
  clearSlot,
  emptyStrategyLabState,
  nextEmptySlot,
  normalizeStrategyLabState,
  pinToSlot,
  readLocalStrategyLab,
  STRATEGY_LAB_SLOTS,
  type StrategyLabPin,
  type StrategyLabState,
  writeLocalStrategyLab,
} from './strategyLab';

interface UseStrategyLabOptions {
  userId: string | undefined;
  cloudEnabled: boolean;
  currentScenario: ScenarioConfig;
  currentStrategy: StrategyId;
  currentBudget: number;
  onApplyPin: (pin: StrategyLabPin) => void;
}

function rowToPin(row: {
  sort_order: number;
  name: string;
  scenario: unknown;
  strategy_id: string;
  extra_monthly_budget: number;
  created_at: string;
}): StrategyLabPin | null {
  const state = normalizeStrategyLabState({
    pins: [
      {
        slot: row.sort_order,
        label: row.name,
        scenario: row.scenario,
        strategy: row.strategy_id,
        extraBudget: Number(row.extra_monthly_budget),
        pinnedAt: row.created_at,
      },
    ],
    activeSlot: row.sort_order,
  });
  return state.pins[0] ?? null;
}

export function useStrategyLab({
  userId,
  cloudEnabled,
  currentScenario,
  currentStrategy,
  currentBudget,
  onApplyPin,
}: UseStrategyLabOptions) {
  const [state, setState] = useState<StrategyLabState>(emptyStrategyLabState);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const persistLocal = useCallback((next: StrategyLabState) => {
    writeLocalStrategyLab(next);
    setState(next);
  }, []);

  const loadFromCloud = useCallback(async () => {
    if (!userId || !cloudEnabled) {
      persistLocal(readLocalStrategyLab());
      return;
    }
      try {
        const supabase = await getSupabase();
        const table = supabase.from('strategy_lab_scenarios' as 'portfolio_snapshots');
        const { data, error } = await table
          .select(
            'sort_order, name, scenario, strategy_id, extra_monthly_budget, created_at',
          )
          .eq('user_id', userId)
          .eq('is_pinned', true)
          .order('sort_order', { ascending: true });
      if (error) throw error;
      const pins = (data ?? [])
        .map(rowToPin)
        .filter((p): p is StrategyLabPin => p !== null);
      const local = readLocalStrategyLab();
      const activeSlot = local.activeSlot ?? pins[0]?.slot ?? null;
      const next = normalizeStrategyLabState({ pins, activeSlot });
      persistLocal(next);
    } catch {
      persistLocal(readLocalStrategyLab());
    }
  }, [userId, cloudEnabled, persistLocal]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      await loadFromCloud();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadFromCloud]);

  const syncPinToCloud = useCallback(
    async (pin: StrategyLabPin) => {
      if (!userId || !cloudEnabled) return;
      setSyncing(true);
      try {
        const supabase = await getSupabase();
        // Table types are generated after migration; cast until Database types include strategy_lab_scenarios.
        const table = supabase.from('strategy_lab_scenarios' as 'portfolio_snapshots');
        await table
          .delete()
          .eq('user_id', userId)
          .eq('sort_order', pin.slot)
          .eq('is_pinned', true);
        const { error } = await table.insert({
          user_id: userId,
          sort_order: pin.slot,
          name: pin.label,
          scenario: pin.scenario,
          strategy_id: pin.strategy,
          extra_monthly_budget: pin.extraBudget,
          is_pinned: true,
          created_at: pin.pinnedAt,
          updated_at: new Date().toISOString(),
        } as never);
        if (error) throw error;
      } catch {
        showToast('Cloud sync failed — saved locally');
      } finally {
        setSyncing(false);
      }
    },
    [userId, cloudEnabled, showToast],
  );

  const removePinFromCloud = useCallback(
    async (slot: number) => {
      if (!userId || !cloudEnabled) return;
      try {
        const supabase = await getSupabase();
        const table = supabase.from('strategy_lab_scenarios' as 'portfolio_snapshots');
        await table
          .delete()
          .eq('user_id', userId)
          .eq('sort_order', slot)
          .eq('is_pinned', true);
      } catch {
        showToast('Could not remove pin from cloud');
      }
    },
    [userId, cloudEnabled, showToast],
  );

  const applySlot = useCallback(
    (slot: number) => {
      const pin = stateRef.current.pins.find((p) => p.slot === slot);
      if (!pin) return;
      const next = { ...stateRef.current, activeSlot: slot };
      persistLocal(next);
      onApplyPin(pin);
      showToast(`Applied slot ${slot}: ${pin.label}`);
    },
    [onApplyPin, persistLocal, showToast],
  );

  const pinCurrent = useCallback(
    (targetSlot?: number) => {
      const slot = targetSlot ?? nextEmptySlot(stateRef.current);
      const next = pinToSlot(stateRef.current, slot, {
        label: currentScenario.label,
        scenario: currentScenario,
        strategy: currentStrategy,
        extraBudget: currentBudget,
      });
      persistLocal(next);
      const pin = next.pins.find((p) => p.slot === slot);
      if (pin) void syncPinToCloud(pin);
      showToast(`Pinned to slot ${slot}`);
    },
    [
      currentScenario,
      currentStrategy,
      currentBudget,
      persistLocal,
      syncPinToCloud,
      showToast,
    ],
  );

  const unpinSlot = useCallback(
    (slot: number) => {
      const next = clearSlot(stateRef.current, slot);
      persistLocal(next);
      void removePinFromCloud(slot);
      showToast(`Cleared slot ${slot}`);
    },
    [persistLocal, removePinFromCloud, showToast],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        pinCurrent();
        return;
      }

      const digit = Number(e.key);
      if (!e.ctrlKey && !e.metaKey && !e.altKey && digit >= 1 && digit <= STRATEGY_LAB_SLOTS) {
        const pin = stateRef.current.pins.find((p) => p.slot === digit);
        if (pin) {
          e.preventDefault();
          applySlot(digit);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applySlot, pinCurrent]);

  return {
    state,
    loading,
    syncing,
    toast,
    pinCurrent,
    applySlot,
    unpinSlot,
  };
}
