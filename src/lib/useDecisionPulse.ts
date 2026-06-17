import { useCallback, useEffect, useState } from 'react';
import type { StrategyId } from './types';
import type { DecisionPulsePreferences } from './decisionPulseTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-decision-pulse';

const DEFAULT_PREFERENCES: DecisionPulsePreferences = {
  isCollapsed: false,
  lastExploredBudget: null,
  pinnedVerdictStrategy: null,
  budgetStep: 100,
  updatedAt: new Date(0).toISOString(),
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

function loadLocalPreferences(): DecisionPulsePreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as DecisionPulsePreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: DecisionPulsePreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseDecisionPulseResult {
  preferences: DecisionPulsePreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setLastExploredBudget: (budget: number) => Promise<void>;
  setPinnedVerdictStrategy: (strategy: StrategyId | null) => Promise<void>;
  setBudgetStep: (step: number) => Promise<void>;
}

export function useDecisionPulse(): UseDecisionPulseResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<DecisionPulsePreferences>(
    DEFAULT_PREFERENCES,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloudBacked, setCloudBacked] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setPreferences(loadLocalPreferences());
      setCloudBacked(false);
      setLoading(false);
      return;
    }

    try {
      const headers = await authorizedHeaders();
      const res = await fetch('/api/decision-pulse', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: DecisionPulsePreferences };
        setPreferences(data.preferences);
        setCloudBacked(true);
      } else {
        setPreferences(loadLocalPreferences());
        setCloudBacked(false);
      }
    } catch {
      setPreferences(loadLocalPreferences());
      setCloudBacked(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = useCallback(
    async (patch: Partial<DecisionPulsePreferences>) => {
      const next: DecisionPulsePreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/decision-pulse', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              lastExploredBudget: next.lastExploredBudget,
              pinnedVerdictStrategy: next.pinnedVerdictStrategy,
              budgetStep: next.budgetStep,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: DecisionPulsePreferences };
            setPreferences(data.preferences);
            setCloudBacked(true);
          } else {
            saveLocalPreferences(next);
            setCloudBacked(false);
          }
        } else {
          saveLocalPreferences(next);
          setCloudBacked(false);
        }
      } catch {
        saveLocalPreferences(next);
        setCloudBacked(false);
      } finally {
        setSaving(false);
      }
    },
    [preferences, user],
  );

  const setCollapsed = useCallback(
    async (collapsed: boolean) => {
      await persist({ isCollapsed: collapsed });
    },
    [persist],
  );

  const setLastExploredBudget = useCallback(
    async (budget: number) => {
      await persist({ lastExploredBudget: budget });
    },
    [persist],
  );

  const setPinnedVerdictStrategy = useCallback(
    async (strategy: StrategyId | null) => {
      await persist({ pinnedVerdictStrategy: strategy });
    },
    [persist],
  );

  const setBudgetStep = useCallback(
    async (step: number) => {
      const clamped = Math.min(5000, Math.max(50, Math.round(step)));
      await persist({ budgetStep: clamped });
    },
    [persist],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setLastExploredBudget,
    setPinnedVerdictStrategy,
    setBudgetStep,
  };
}
