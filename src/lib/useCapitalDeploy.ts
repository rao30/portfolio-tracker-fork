import { useCallback, useEffect, useState } from 'react';
import type { CapitalDeployPreferences, DeployLane } from './capitalDeployTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-capital-deploy';

const DEFAULT_PREFERENCES: CapitalDeployPreferences = {
  isCollapsed: false,
  targetReserveMonths: 6,
  acquisitionCocHurdle: 0.08,
  lastExploredDeployAmount: null,
  pinnedLane: null,
  deployStep: 100,
  showLaneComparison: true,
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

function loadLocalPreferences(): CapitalDeployPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as CapitalDeployPreferences;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: CapitalDeployPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseCapitalDeployResult {
  preferences: CapitalDeployPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setTargetReserveMonths: (months: number) => Promise<void>;
  setAcquisitionCocHurdle: (hurdle: number) => Promise<void>;
  setLastExploredDeployAmount: (amount: number | null) => Promise<void>;
  setPinnedLane: (lane: DeployLane | null) => Promise<void>;
  setDeployStep: (step: number) => Promise<void>;
  setShowLaneComparison: (show: boolean) => Promise<void>;
}

export function useCapitalDeploy(): UseCapitalDeployResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<CapitalDeployPreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/capital-deploy', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: CapitalDeployPreferences };
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
    async (patch: Partial<CapitalDeployPreferences>) => {
      const next: CapitalDeployPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/capital-deploy', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              targetReserveMonths: next.targetReserveMonths,
              acquisitionCocHurdle: next.acquisitionCocHurdle,
              lastExploredDeployAmount: next.lastExploredDeployAmount,
              pinnedLane: next.pinnedLane,
              deployStep: next.deployStep,
              showLaneComparison: next.showLaneComparison,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: CapitalDeployPreferences };
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

  const setTargetReserveMonths = useCallback(
    async (months: number) => {
      await persist({ targetReserveMonths: months });
    },
    [persist],
  );

  const setAcquisitionCocHurdle = useCallback(
    async (hurdle: number) => {
      await persist({ acquisitionCocHurdle: hurdle });
    },
    [persist],
  );

  const setLastExploredDeployAmount = useCallback(
    async (amount: number | null) => {
      await persist({ lastExploredDeployAmount: amount });
    },
    [persist],
  );

  const setPinnedLane = useCallback(
    async (lane: DeployLane | null) => {
      await persist({ pinnedLane: lane });
    },
    [persist],
  );

  const setDeployStep = useCallback(
    async (step: number) => {
      await persist({ deployStep: step });
    },
    [persist],
  );

  const setShowLaneComparison = useCallback(
    async (show: boolean) => {
      await persist({ showLaneComparison: show });
    },
    [persist],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setTargetReserveMonths,
    setAcquisitionCocHurdle,
    setLastExploredDeployAmount,
    setPinnedLane,
    setDeployStep,
    setShowLaneComparison,
  };
}
