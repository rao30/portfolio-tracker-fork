import { useCallback, useEffect, useState } from 'react';
import type {
  ExpensePresetId,
  OperatingCostsEntryMode,
  OperatingCostsPreferences,
} from './operatingCostsTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-operating-costs';

const DEFAULT_PREFERENCES: OperatingCostsPreferences = {
  isCollapsed: false,
  focusedPropertyIndex: 0,
  showScheduleE: true,
  entryMode: 'breakdown',
  lastExploredPreset: null,
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

function loadLocalPreferences(): OperatingCostsPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as OperatingCostsPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: OperatingCostsPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseOperatingCostsResult {
  preferences: OperatingCostsPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (value: boolean) => Promise<void>;
  setFocusedPropertyIndex: (value: number) => Promise<void>;
  setShowScheduleE: (value: boolean) => Promise<void>;
  setEntryMode: (value: OperatingCostsEntryMode) => Promise<void>;
  setLastExploredPreset: (value: ExpensePresetId | null) => Promise<void>;
}

export function useOperatingCosts(): UseOperatingCostsResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<OperatingCostsPreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/operating-costs', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: OperatingCostsPreferences };
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
    async (patch: Partial<OperatingCostsPreferences>) => {
      const next = { ...preferences, ...patch, updatedAt: new Date().toISOString() };
      setPreferences(next);

      if (!user) {
        saveLocalPreferences(next);
        return;
      }

      setSaving(true);
      try {
        const headers = await authorizedHeaders(true);
        const res = await fetch('/api/operating-costs', {
          method: 'PUT',
          headers,
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const data = (await res.json()) as { preferences: OperatingCostsPreferences };
          setPreferences(data.preferences);
          setCloudBacked(true);
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

  const setCollapsed = useCallback((value: boolean) => persist({ isCollapsed: value }), [persist]);
  const setFocusedPropertyIndex = useCallback(
    (value: number) => persist({ focusedPropertyIndex: value }),
    [persist],
  );
  const setShowScheduleE = useCallback(
    (value: boolean) => persist({ showScheduleE: value }),
    [persist],
  );
  const setEntryMode = useCallback(
    (value: OperatingCostsEntryMode) => persist({ entryMode: value }),
    [persist],
  );
  const setLastExploredPreset = useCallback(
    (value: ExpensePresetId | null) => persist({ lastExploredPreset: value }),
    [persist],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setFocusedPropertyIndex,
    setShowScheduleE,
    setEntryMode,
    setLastExploredPreset,
  };
}
