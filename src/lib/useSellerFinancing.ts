import { useCallback, useEffect, useState } from 'react';
import type {
  SellerFinancingEntryMode,
  SellerFinancingPreferences,
  SellerFinancingPresetId,
} from './sellerFinancingTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-seller-financing';

const DEFAULT_PREFERENCES: SellerFinancingPreferences = {
  isCollapsed: false,
  focusedPropertyIndex: 0,
  entryMode: 'cap_driven',
  lastExploredPreset: null,
  showAmortizationChart: true,
  showRefiImpact: true,
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

function loadLocalPreferences(): SellerFinancingPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as SellerFinancingPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: SellerFinancingPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseSellerFinancingResult {
  preferences: SellerFinancingPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setFocusedPropertyIndex: (index: number) => Promise<void>;
  setEntryMode: (mode: SellerFinancingEntryMode) => Promise<void>;
  setLastExploredPreset: (preset: SellerFinancingPresetId | null) => Promise<void>;
  setShowAmortizationChart: (show: boolean) => Promise<void>;
  setShowRefiImpact: (show: boolean) => Promise<void>;
}

export function useSellerFinancing(): UseSellerFinancingResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<SellerFinancingPreferences>(
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
      const res = await fetch('/api/seller-financing', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: SellerFinancingPreferences };
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
    async (patch: Partial<SellerFinancingPreferences>) => {
      const next: SellerFinancingPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/seller-financing', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              focusedPropertyIndex: next.focusedPropertyIndex,
              entryMode: next.entryMode,
              lastExploredPreset: next.lastExploredPreset,
              showAmortizationChart: next.showAmortizationChart,
              showRefiImpact: next.showRefiImpact,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: SellerFinancingPreferences };
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

  const setFocusedPropertyIndex = useCallback(
    async (index: number) => {
      const clamped = Math.min(999, Math.max(0, Math.round(index)));
      await persist({ focusedPropertyIndex: clamped });
    },
    [persist],
  );

  const setEntryMode = useCallback(
    async (mode: SellerFinancingEntryMode) => {
      await persist({ entryMode: mode });
    },
    [persist],
  );

  const setLastExploredPreset = useCallback(
    async (preset: SellerFinancingPresetId | null) => {
      await persist({ lastExploredPreset: preset });
    },
    [persist],
  );

  const setShowAmortizationChart = useCallback(
    async (show: boolean) => {
      await persist({ showAmortizationChart: show });
    },
    [persist],
  );

  const setShowRefiImpact = useCallback(
    async (show: boolean) => {
      await persist({ showRefiImpact: show });
    },
    [persist],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setFocusedPropertyIndex,
    setEntryMode,
    setLastExploredPreset,
    setShowAmortizationChart,
    setShowRefiImpact,
  };
}
