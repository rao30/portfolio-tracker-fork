import { useCallback, useEffect, useState } from 'react';
import type { ExitAnalysisMode } from './exitCompassTypes';
import type { ExitCompassPreferences } from './exitCompassTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-exit-compass';

const DEFAULT_PREFERENCES: ExitCompassPreferences = {
  isCollapsed: false,
  pinnedProperty: null,
  analysisMode: 'all',
  sellAtMonth: 12,
  closingCostPct: 0.06,
  capitalGainsRate: 0.15,
  recaptureRate: 0.25,
  holdHorizonMonths: 120,
  proceedsToDebtPct: 1.0,
  showTaxBreakdown: true,
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

function loadLocalPreferences(): ExitCompassPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as ExitCompassPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: ExitCompassPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseExitCompassResult {
  preferences: ExitCompassPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setPinnedProperty: (property: string | null) => Promise<void>;
  setAnalysisMode: (mode: ExitAnalysisMode) => Promise<void>;
  setSellAtMonth: (month: number) => Promise<void>;
  setClosingCostPct: (pct: number) => Promise<void>;
  setCapitalGainsRate: (rate: number) => Promise<void>;
  setRecaptureRate: (rate: number) => Promise<void>;
  setHoldHorizonMonths: (months: number) => Promise<void>;
  setProceedsToDebtPct: (pct: number) => Promise<void>;
  setShowTaxBreakdown: (show: boolean) => Promise<void>;
  persistPatch: (patch: Partial<ExitCompassPreferences>) => Promise<void>;
}

export function useExitCompass(): UseExitCompassResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<ExitCompassPreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/exit-compass', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: ExitCompassPreferences };
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
    async (patch: Partial<ExitCompassPreferences>) => {
      const next: ExitCompassPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/exit-compass', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              pinnedProperty: next.pinnedProperty,
              analysisMode: next.analysisMode,
              sellAtMonth: next.sellAtMonth,
              closingCostPct: next.closingCostPct,
              capitalGainsRate: next.capitalGainsRate,
              recaptureRate: next.recaptureRate,
              holdHorizonMonths: next.holdHorizonMonths,
              proceedsToDebtPct: next.proceedsToDebtPct,
              showTaxBreakdown: next.showTaxBreakdown,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: ExitCompassPreferences };
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
    async (collapsed: boolean) => persist({ isCollapsed: collapsed }),
    [persist],
  );

  const setPinnedProperty = useCallback(
    async (property: string | null) => persist({ pinnedProperty: property }),
    [persist],
  );

  const setAnalysisMode = useCallback(
    async (mode: ExitAnalysisMode) => persist({ analysisMode: mode }),
    [persist],
  );

  const setSellAtMonth = useCallback(
    async (month: number) => {
      const clamped = Math.min(360, Math.max(1, Math.round(month)));
      await persist({ sellAtMonth: clamped });
    },
    [persist],
  );

  const setClosingCostPct = useCallback(
    async (pct: number) => {
      const clamped = Math.min(0.15, Math.max(0, pct));
      await persist({ closingCostPct: clamped });
    },
    [persist],
  );

  const setCapitalGainsRate = useCallback(
    async (rate: number) => {
      const clamped = Math.min(0.4, Math.max(0, rate));
      await persist({ capitalGainsRate: clamped });
    },
    [persist],
  );

  const setRecaptureRate = useCallback(
    async (rate: number) => {
      const clamped = Math.min(0.35, Math.max(0, rate));
      await persist({ recaptureRate: clamped });
    },
    [persist],
  );

  const setHoldHorizonMonths = useCallback(
    async (months: number) => {
      const clamped = Math.min(360, Math.max(12, Math.round(months)));
      await persist({ holdHorizonMonths: clamped });
    },
    [persist],
  );

  const setProceedsToDebtPct = useCallback(
    async (pct: number) => {
      const clamped = Math.min(1, Math.max(0, pct));
      await persist({ proceedsToDebtPct: clamped });
    },
    [persist],
  );

  const setShowTaxBreakdown = useCallback(
    async (show: boolean) => persist({ showTaxBreakdown: show }),
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
    setSellAtMonth,
    setClosingCostPct,
    setCapitalGainsRate,
    setRecaptureRate,
    setHoldHorizonMonths,
    setProceedsToDebtPct,
    setShowTaxBreakdown,
    persistPatch: persist,
  };
}
