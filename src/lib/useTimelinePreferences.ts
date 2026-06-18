import { useCallback, useEffect, useState } from 'react';
import type { TimelinePreferences } from './timelineTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-timeline-preferences';

const DEFAULT_PREFERENCES: TimelinePreferences = {
  isCollapsed: false,
  focusedPropertyIndex: 0,
  lastExploredPlanId: null,
  showCommittedGhost: true,
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

function loadLocalPreferences(): TimelinePreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as TimelinePreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: TimelinePreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseTimelinePreferencesResult {
  preferences: TimelinePreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setCollapsed: (collapsed: boolean) => Promise<void>;
  setFocusedPropertyIndex: (index: number) => Promise<void>;
  setLastExploredPlanId: (planId: string | null) => Promise<void>;
  setShowCommittedGhost: (show: boolean) => Promise<void>;
}

export function useTimelinePreferences(): UseTimelinePreferencesResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<TimelinePreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/timeline-preferences', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: TimelinePreferences };
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
    async (patch: Partial<TimelinePreferences>) => {
      const next: TimelinePreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/timeline-preferences', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              isCollapsed: next.isCollapsed,
              focusedPropertyIndex: next.focusedPropertyIndex,
              lastExploredPlanId: next.lastExploredPlanId,
              showCommittedGhost: next.showCommittedGhost,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: TimelinePreferences };
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

  const setLastExploredPlanId = useCallback(
    async (planId: string | null) => {
      await persist({ lastExploredPlanId: planId });
    },
    [persist],
  );

  const setShowCommittedGhost = useCallback(
    async (show: boolean) => {
      await persist({ showCommittedGhost: show });
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
    setLastExploredPlanId,
    setShowCommittedGhost,
  };
}
