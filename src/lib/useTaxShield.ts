import { useCallback, useEffect, useState } from 'react';
import type { TaxShieldPreferences } from './taxShieldTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-tax-shield';

const DEFAULT_PREFERENCES: TaxShieldPreferences = {
  isCollapsed: false,
  lastExploredW2Income: null,
  lastExploredCarryover: null,
  incomeStep: 10_000,
  showPropertyBreakdown: true,
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

function loadLocalPreferences(): TaxShieldPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as TaxShieldPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: TaxShieldPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseTaxShieldResult {
  preferences: TaxShieldPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setLastExploredW2Income: (income: number) => Promise<void>;
  setLastExploredCarryover: (carryover: number) => Promise<void>;
  setIncomeStep: (step: number) => Promise<void>;
  setShowPropertyBreakdown: (show: boolean) => Promise<void>;
}

export function useTaxShield(): UseTaxShieldResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<TaxShieldPreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/tax-shield', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: TaxShieldPreferences };
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
    async (patch: Partial<TaxShieldPreferences>) => {
      const next: TaxShieldPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/tax-shield', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              lastExploredW2Income: next.lastExploredW2Income,
              lastExploredCarryover: next.lastExploredCarryover,
              incomeStep: next.incomeStep,
              showPropertyBreakdown: next.showPropertyBreakdown,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: TaxShieldPreferences };
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

  const setLastExploredW2Income = useCallback(
    async (income: number) => {
      await persist({ lastExploredW2Income: income });
    },
    [persist],
  );

  const setLastExploredCarryover = useCallback(
    async (carryover: number) => {
      await persist({ lastExploredCarryover: carryover });
    },
    [persist],
  );

  const setIncomeStep = useCallback(
    async (step: number) => {
      const clamped = Math.min(100_000, Math.max(1_000, Math.round(step)));
      await persist({ incomeStep: clamped });
    },
    [persist],
  );

  const setShowPropertyBreakdown = useCallback(
    async (show: boolean) => {
      await persist({ showPropertyBreakdown: show });
    },
    [persist],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setLastExploredW2Income,
    setLastExploredCarryover,
    setIncomeStep,
    setShowPropertyBreakdown,
  };
}
