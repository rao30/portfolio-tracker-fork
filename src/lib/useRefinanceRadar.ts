import { useCallback, useEffect, useState } from 'react';
import type {
  RefinanceAnalysisMode,
  RefinanceRadarPreferences,
} from './refinanceRadarTypes';
import { DEFAULT_REFINANCE_ASSUMPTIONS } from './refinanceRadarTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-refinance-radar';

const DEFAULT_PREFERENCES: RefinanceRadarPreferences = {
  isCollapsed: false,
  pinnedProperty: null,
  analysisMode: 'both',
  ...DEFAULT_REFINANCE_ASSUMPTIONS,
  updatedAt: null,
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

function loadLocalPreferences(): RefinanceRadarPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as RefinanceRadarPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: RefinanceRadarPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseRefinanceRadarResult {
  preferences: RefinanceRadarPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setPinnedProperty: (name: string | null) => Promise<void>;
  setAnalysisMode: (mode: RefinanceAnalysisMode) => Promise<void>;
  setAssumptions: (
    patch: Partial<
      Pick<
        RefinanceRadarPreferences,
        | 'marketRate'
        | 'closingCostPct'
        | 'holdPeriodMonths'
        | 'cashOutLtv'
        | 'minDscr'
        | 'deploymentYield'
        | 'refiTermMonths'
      >
    >,
  ) => Promise<void>;
}

export function useRefinanceRadar(): UseRefinanceRadarResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<RefinanceRadarPreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/refinance-radar', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: RefinanceRadarPreferences };
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
    async (patch: Partial<RefinanceRadarPreferences>) => {
      const next: RefinanceRadarPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/refinance-radar', {
            method: 'PUT',
            headers,
            body: JSON.stringify(next),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: RefinanceRadarPreferences };
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

  const setPinnedProperty = useCallback(
    async (name: string | null) => {
      await persist({ pinnedProperty: name });
    },
    [persist],
  );

  const setAnalysisMode = useCallback(
    async (mode: RefinanceAnalysisMode) => {
      await persist({ analysisMode: mode });
    },
    [persist],
  );

  const setAssumptions = useCallback(
    async (patch: Parameters<UseRefinanceRadarResult['setAssumptions']>[0]) => {
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
    setPinnedProperty,
    setAnalysisMode,
    setAssumptions,
  };
}
