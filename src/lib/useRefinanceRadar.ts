import { useCallback, useEffect, useState } from 'react';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';
import type { RefinanceAnalysisMode, RefinanceRadarPreferences } from './refinanceRadarTypes';

const LOCAL_KEY = 'rental-snowball-refinance-radar';

export const DEFAULT_REFINANCE_RADAR_PREFERENCES: RefinanceRadarPreferences = {
  isCollapsed: false,
  pinnedProperty: null,
  analysisMode: 'both',
  marketRate: 0.07,
  closingCostPct: 0.025,
  holdPeriodMonths: 60,
  cashOutLtv: 0.75,
  minDscr: 1.0,
  deploymentYield: 0.12,
  refiTermMonths: 360,
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

function loadLocalPreferences(): RefinanceRadarPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_REFINANCE_RADAR_PREFERENCES;
    return { ...DEFAULT_REFINANCE_RADAR_PREFERENCES, ...(JSON.parse(raw) as RefinanceRadarPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_REFINANCE_RADAR_PREFERENCES;
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
  setMarketRate: (rate: number) => Promise<void>;
  setClosingCostPct: (pct: number) => Promise<void>;
  setHoldPeriodMonths: (months: number) => Promise<void>;
  setCashOutLtv: (ltv: number) => Promise<void>;
  setMinDscr: (dscr: number) => Promise<void>;
  setDeploymentYield: (yieldPct: number) => Promise<void>;
  setRefiTermMonths: (months: number) => Promise<void>;
  applyAssumptions: (patch: Partial<RefinanceRadarPreferences>) => Promise<void>;
}

export function useRefinanceRadar(): UseRefinanceRadarResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<RefinanceRadarPreferences>(
    DEFAULT_REFINANCE_RADAR_PREFERENCES,
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
      const next = { ...preferences, ...patch, updatedAt: new Date().toISOString() };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/refinance-radar', {
            method: 'PUT',
            headers,
            body: JSON.stringify(patch),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: RefinanceRadarPreferences };
            setPreferences(data.preferences);
            setCloudBacked(true);
            return;
          }
        }
        saveLocalPreferences(next);
        setCloudBacked(false);
      } finally {
        setSaving(false);
      }
    },
    [preferences, user],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed: (collapsed) => persist({ isCollapsed: collapsed }),
    setPinnedProperty: (pinnedProperty) => persist({ pinnedProperty }),
    setAnalysisMode: (analysisMode) => persist({ analysisMode }),
    setMarketRate: (marketRate) => persist({ marketRate }),
    setClosingCostPct: (closingCostPct) => persist({ closingCostPct }),
    setHoldPeriodMonths: (holdPeriodMonths) => persist({ holdPeriodMonths }),
    setCashOutLtv: (cashOutLtv) => persist({ cashOutLtv }),
    setMinDscr: (minDscr) => persist({ minDscr }),
    setDeploymentYield: (deploymentYield) => persist({ deploymentYield }),
    setRefiTermMonths: (refiTermMonths) => persist({ refiTermMonths }),
    applyAssumptions: persist,
  };
}
