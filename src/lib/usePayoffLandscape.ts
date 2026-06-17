import { useCallback, useEffect, useState } from 'react';
import type { PayoffLandscapeMetric, PayoffLandscapePreferences } from './payoffLandscapeTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-payoff-landscape';

const DEFAULT_PREFERENCES: PayoffLandscapePreferences = {
  metric: 'monthsToPayoff',
  budgetMin: 0,
  budgetMax: 5000,
  budgetStep: 500,
  isCollapsed: false,
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

function loadLocalPreferences(): PayoffLandscapePreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as PayoffLandscapePreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: PayoffLandscapePreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UsePayoffLandscapeResult {
  preferences: PayoffLandscapePreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setMetric: (metric: PayoffLandscapeMetric) => Promise<void>;
  setViewport: (patch: {
    budgetMin?: number;
    budgetMax?: number;
    budgetStep?: number;
  }) => Promise<void>;
}

export function usePayoffLandscape(): UsePayoffLandscapeResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<PayoffLandscapePreferences>(
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
      const res = await fetch('/api/payoff-landscape', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: PayoffLandscapePreferences };
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
    async (patch: Partial<PayoffLandscapePreferences>) => {
      const next: PayoffLandscapePreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/payoff-landscape', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              metric: next.metric,
              budgetMin: next.budgetMin,
              budgetMax: next.budgetMax,
              budgetStep: next.budgetStep,
              isCollapsed: next.isCollapsed,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: PayoffLandscapePreferences };
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

  const setMetric = useCallback(
    async (metric: PayoffLandscapeMetric) => {
      await persist({ metric });
    },
    [persist],
  );

  const setViewport = useCallback(
    async (patch: { budgetMin?: number; budgetMax?: number; budgetStep?: number }) => {
      await persist(patch);
    },
    [persist],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setMetric,
    setViewport,
  };
}
