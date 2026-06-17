import { useCallback, useEffect, useState } from 'react';
import type { Portfolio } from './types';
import {
  clampEquityTarget,
  clampGoalTargetMonth,
  defaultGoalPreferences,
  portfolioGoalsFromPreferences,
} from './goalCommand';
import type { GoalCommandPreferences, GoalCommandTab } from './goalCommandTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-goal-command';

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

function loadLocalPreferences(portfolio: Portfolio): GoalCommandPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return defaultGoalPreferences(portfolio);
    return { ...defaultGoalPreferences(portfolio), ...(JSON.parse(raw) as GoalCommandPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return defaultGoalPreferences(portfolio);
  }
}

function saveLocalPreferences(prefs: GoalCommandPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseGoalCommandResult {
  preferences: GoalCommandPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setActiveGoalType: (tab: GoalCommandTab) => Promise<void>;
  setDebtFreeTargetMonth: (month: number) => Promise<void>;
  setEquityTargetMonth: (month: number) => Promise<void>;
  setEquityTargetValue: (value: number) => Promise<void>;
  setLastExploredBudget: (budget: number | null) => Promise<void>;
}

export function useGoalCommand(
  portfolio: Portfolio | null,
  onGoalsChange?: (goals: Portfolio['goals']) => void,
): UseGoalCommandResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<GoalCommandPreferences>({
    isCollapsed: false,
    activeGoalType: 'debtFree',
    debtFreeTargetMonth: 180,
    equityTargetMonth: 180,
    equityTargetValue: 2_000_000,
    lastExploredBudget: null,
    updatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cloudBacked, setCloudBacked] = useState(false);

  const refresh = useCallback(async () => {
    if (!portfolio) {
      setLoading(false);
      return;
    }

    if (!user) {
      setPreferences(loadLocalPreferences(portfolio));
      setCloudBacked(false);
      setLoading(false);
      return;
    }

    try {
      const headers = await authorizedHeaders();
      const res = await fetch('/api/goal-command', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: GoalCommandPreferences };
        setPreferences(data.preferences);
        setCloudBacked(true);
      } else {
        setPreferences(loadLocalPreferences(portfolio));
        setCloudBacked(false);
      }
    } catch {
      setPreferences(loadLocalPreferences(portfolio));
      setCloudBacked(false);
    } finally {
      setLoading(false);
    }
  }, [portfolio, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = useCallback(
    async (patch: Partial<GoalCommandPreferences>) => {
      const next: GoalCommandPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);
      onGoalsChange?.(portfolioGoalsFromPreferences(next));

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/goal-command', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              activeGoalType: next.activeGoalType,
              debtFreeTargetMonth: next.debtFreeTargetMonth,
              equityTargetMonth: next.equityTargetMonth,
              equityTargetValue: next.equityTargetValue,
              lastExploredBudget: next.lastExploredBudget,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: GoalCommandPreferences };
            setPreferences(data.preferences);
            onGoalsChange?.(portfolioGoalsFromPreferences(data.preferences));
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
    [onGoalsChange, preferences, user],
  );

  const setCollapsed = useCallback(
    async (collapsed: boolean) => {
      await persist({ isCollapsed: collapsed });
    },
    [persist],
  );

  const setActiveGoalType = useCallback(
    async (tab: GoalCommandTab) => {
      await persist({ activeGoalType: tab });
    },
    [persist],
  );

  const setDebtFreeTargetMonth = useCallback(
    async (month: number) => {
      await persist({ debtFreeTargetMonth: clampGoalTargetMonth(month) });
    },
    [persist],
  );

  const setEquityTargetMonth = useCallback(
    async (month: number) => {
      await persist({ equityTargetMonth: clampGoalTargetMonth(month) });
    },
    [persist],
  );

  const setEquityTargetValue = useCallback(
    async (value: number) => {
      await persist({ equityTargetValue: clampEquityTarget(value) });
    },
    [persist],
  );

  const setLastExploredBudget = useCallback(
    async (budget: number | null) => {
      await persist({ lastExploredBudget: budget });
    },
    [persist],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setActiveGoalType,
    setDebtFreeTargetMonth,
    setEquityTargetMonth,
    setEquityTargetValue,
    setLastExploredBudget,
  };
}
