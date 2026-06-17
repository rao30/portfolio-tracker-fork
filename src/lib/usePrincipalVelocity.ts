import { useCallback, useEffect, useState } from 'react';
import type {
  PrincipalVelocityHorizon,
  PrincipalVelocityPreferences,
  PrincipalVelocityViewMode,
} from './principalVelocityTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-principal-velocity';

const DEFAULT_PREFERENCES: PrincipalVelocityPreferences = {
  isCollapsed: false,
  viewMode: 'monthly',
  horizonMonths: 120,
  showBaselineComparison: true,
  pinnedPropertyName: null,
  lastExploredBudget: null,
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

function loadLocalPreferences(): PrincipalVelocityPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as PrincipalVelocityPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: PrincipalVelocityPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UsePrincipalVelocityResult {
  preferences: PrincipalVelocityPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setViewMode: (mode: PrincipalVelocityViewMode) => Promise<void>;
  setHorizonMonths: (months: PrincipalVelocityHorizon) => Promise<void>;
  setShowBaselineComparison: (show: boolean) => Promise<void>;
  setPinnedPropertyName: (name: string | null) => Promise<void>;
  setLastExploredBudget: (budget: number | null) => Promise<void>;
}

export function usePrincipalVelocity(): UsePrincipalVelocityResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<PrincipalVelocityPreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/principal-velocity', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: PrincipalVelocityPreferences };
        setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences });
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
    async (patch: Partial<PrincipalVelocityPreferences>) => {
      const next: PrincipalVelocityPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/principal-velocity', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              viewMode: next.viewMode,
              horizonMonths: next.horizonMonths,
              showBaselineComparison: next.showBaselineComparison,
              pinnedPropertyName: next.pinnedPropertyName,
              lastExploredBudget: next.lastExploredBudget,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: PrincipalVelocityPreferences };
            setPreferences({ ...DEFAULT_PREFERENCES, ...data.preferences });
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

  const setViewMode = useCallback(
    async (mode: PrincipalVelocityViewMode) => {
      await persist({ viewMode: mode });
    },
    [persist],
  );

  const setHorizonMonths = useCallback(
    async (months: PrincipalVelocityHorizon) => {
      await persist({ horizonMonths: months });
    },
    [persist],
  );

  const setShowBaselineComparison = useCallback(
    async (show: boolean) => {
      await persist({ showBaselineComparison: show });
    },
    [persist],
  );

  const setPinnedPropertyName = useCallback(
    async (name: string | null) => {
      await persist({ pinnedPropertyName: name });
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
    setViewMode,
    setHorizonMonths,
    setShowBaselineComparison,
    setPinnedPropertyName,
    setLastExploredBudget,
  };
}
