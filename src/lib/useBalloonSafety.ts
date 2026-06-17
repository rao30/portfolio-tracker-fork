import { useCallback, useEffect, useState } from 'react';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-balloon-safety';

export interface BalloonSafetyPreferences {
  isCollapsed: boolean;
  pinnedProperty: string | null;
  showCleared: boolean;
  updatedAt: string;
}

const DEFAULT_PREFERENCES: BalloonSafetyPreferences = {
  isCollapsed: false,
  pinnedProperty: null,
  showCleared: true,
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

function loadLocalPreferences(): BalloonSafetyPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as BalloonSafetyPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: BalloonSafetyPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseBalloonSafetyResult {
  preferences: BalloonSafetyPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setPinnedProperty: (name: string | null) => Promise<void>;
  setShowCleared: (show: boolean) => Promise<void>;
}

export function useBalloonSafety(): UseBalloonSafetyResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<BalloonSafetyPreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/balloon-safety', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: BalloonSafetyPreferences };
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
    async (patch: Partial<BalloonSafetyPreferences>) => {
      const next: BalloonSafetyPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/balloon-safety', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              pinnedProperty: next.pinnedProperty,
              showCleared: next.showCleared,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: BalloonSafetyPreferences };
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

  const setShowCleared = useCallback(
    async (show: boolean) => {
      await persist({ showCleared: show });
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
    setShowCleared,
  };
}
