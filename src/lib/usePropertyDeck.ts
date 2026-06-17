import { useCallback, useEffect, useState } from 'react';
import type {
  PropertyDeckFinancingFilter,
  PropertyDeckInspectorTab,
  PropertyDeckPreferences,
  PropertyDeckViewMode,
} from './propertyDeckTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-property-deck';

const DEFAULT_PREFERENCES: PropertyDeckPreferences = {
  viewMode: 'deck',
  focusedIndex: 0,
  inspectorTab: 'core',
  financingFilter: 'all',
  searchQuery: '',
  mobileHintDismissed: false,
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

function loadLocalPreferences(): PropertyDeckPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as PropertyDeckPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: PropertyDeckPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UsePropertyDeckResult {
  preferences: PropertyDeckPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setViewMode: (mode: PropertyDeckViewMode) => Promise<void>;
  setFocusedIndex: (index: number) => Promise<void>;
  setInspectorTab: (tab: PropertyDeckInspectorTab) => Promise<void>;
  setFinancingFilter: (filter: PropertyDeckFinancingFilter) => Promise<void>;
  setSearchQuery: (query: string) => Promise<void>;
  dismissMobileHint: () => Promise<void>;
}

export function usePropertyDeck(): UsePropertyDeckResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<PropertyDeckPreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/property-deck', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: PropertyDeckPreferences };
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
    async (patch: Partial<PropertyDeckPreferences>) => {
      const next: PropertyDeckPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/property-deck', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              viewMode: next.viewMode,
              focusedIndex: next.focusedIndex,
              inspectorTab: next.inspectorTab,
              financingFilter: next.financingFilter,
              searchQuery: next.searchQuery,
              mobileHintDismissed: next.mobileHintDismissed,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: PropertyDeckPreferences };
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

  const setViewMode = useCallback(
    async (mode: PropertyDeckViewMode) => {
      await persist({ viewMode: mode });
    },
    [persist],
  );

  const setFocusedIndex = useCallback(
    async (index: number) => {
      await persist({ focusedIndex: index });
    },
    [persist],
  );

  const setInspectorTab = useCallback(
    async (tab: PropertyDeckInspectorTab) => {
      await persist({ inspectorTab: tab });
    },
    [persist],
  );

  const setFinancingFilter = useCallback(
    async (filter: PropertyDeckFinancingFilter) => {
      await persist({ financingFilter: filter });
    },
    [persist],
  );

  const setSearchQuery = useCallback(
    async (query: string) => {
      await persist({ searchQuery: query });
    },
    [persist],
  );

  const dismissMobileHint = useCallback(async () => {
    await persist({ mobileHintDismissed: true });
  }, [persist]);

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setViewMode,
    setFocusedIndex,
    setInspectorTab,
    setFinancingFilter,
    setSearchQuery,
    dismissMobileHint,
  };
}
