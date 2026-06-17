import { useCallback, useEffect, useState } from 'react';
import type { StressLabCustomKnobs, StressLabPreferences } from './stressLabTypes';
import { DEFAULT_CUSTOM_KNOBS } from './stressLabTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-stress-lab';

const DEFAULT_PREFERENCES: StressLabPreferences = {
  isCollapsed: false,
  lastExploredScenarioId: null,
  pinnedPresetId: null,
  showSellScenarios: false,
  customKnobs: DEFAULT_CUSTOM_KNOBS,
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

function loadLocalPreferences(): StressLabPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as StressLabPreferences;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      customKnobs: { ...DEFAULT_CUSTOM_KNOBS, ...parsed.customKnobs },
    };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: StressLabPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseStressLabResult {
  preferences: StressLabPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setLastExploredScenarioId: (id: string | null) => Promise<void>;
  setPinnedPresetId: (id: string | null) => Promise<void>;
  setShowSellScenarios: (show: boolean) => Promise<void>;
  setCustomKnobs: (knobs: Partial<StressLabCustomKnobs>) => Promise<void>;
}

export function useStressLab(): UseStressLabResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<StressLabPreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/stress-lab', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: StressLabPreferences };
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...data.preferences,
          customKnobs: {
            ...DEFAULT_CUSTOM_KNOBS,
            ...data.preferences.customKnobs,
          },
        });
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
    async (patch: Partial<StressLabPreferences>) => {
      const next: StressLabPreferences = {
        ...preferences,
        ...patch,
        customKnobs: patch.customKnobs
          ? { ...preferences.customKnobs, ...patch.customKnobs }
          : preferences.customKnobs,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/stress-lab', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              lastExploredScenarioId: next.lastExploredScenarioId,
              pinnedPresetId: next.pinnedPresetId,
              showSellScenarios: next.showSellScenarios,
              customKnobs: next.customKnobs,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: StressLabPreferences };
            setPreferences({
              ...DEFAULT_PREFERENCES,
              ...data.preferences,
              customKnobs: {
                ...DEFAULT_CUSTOM_KNOBS,
                ...data.preferences.customKnobs,
              },
            });
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

  const setLastExploredScenarioId = useCallback(
    async (id: string | null) => {
      await persist({ lastExploredScenarioId: id });
    },
    [persist],
  );

  const setPinnedPresetId = useCallback(
    async (id: string | null) => {
      await persist({ pinnedPresetId: id });
    },
    [persist],
  );

  const setShowSellScenarios = useCallback(
    async (show: boolean) => {
      await persist({ showSellScenarios: show });
    },
    [persist],
  );

  const setCustomKnobs = useCallback(
    async (knobs: Partial<StressLabCustomKnobs>) => {
      await persist({ customKnobs: { ...preferences.customKnobs, ...knobs } });
    },
    [persist, preferences.customKnobs],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setCollapsed,
    setLastExploredScenarioId,
    setPinnedPresetId,
    setShowSellScenarios,
    setCustomKnobs,
  };
}
