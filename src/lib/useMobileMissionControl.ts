import { useCallback, useEffect, useState } from 'react';
import type {
  MobileMissionControlPreferences,
  MobileMissionModuleId,
} from './mobileMissionControlTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-mobile-mission-control';

const DEFAULT_PREFERENCES: MobileMissionControlPreferences = {
  activeModule: 'pulse',
  collapsedModules: [],
  showHeroStrip: true,
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

function loadLocalPreferences(): MobileMissionControlPreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as MobileMissionControlPreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: MobileMissionControlPreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UseMobileMissionControlResult {
  preferences: MobileMissionControlPreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setActiveModule: (module: MobileMissionModuleId) => Promise<void>;
  toggleModuleCollapsed: (module: MobileMissionModuleId) => Promise<void>;
  setShowHeroStrip: (show: boolean) => Promise<void>;
  isModuleCollapsed: (module: MobileMissionModuleId) => boolean;
}

export function useMobileMissionControl(): UseMobileMissionControlResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<MobileMissionControlPreferences>(
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
      const res = await fetch('/api/mobile-mission-control', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: MobileMissionControlPreferences };
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
    async (patch: Partial<MobileMissionControlPreferences>) => {
      const next: MobileMissionControlPreferences = {
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);
      setSaving(true);

      try {
        if (user) {
          const headers = await authorizedHeaders(true);
          const res = await fetch('/api/mobile-mission-control', {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              activeModule: next.activeModule,
              collapsedModules: next.collapsedModules,
              showHeroStrip: next.showHeroStrip,
            }),
          });
          if (res.ok) {
            const data = (await res.json()) as { preferences: MobileMissionControlPreferences };
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

  const setActiveModule = useCallback(
    async (module: MobileMissionModuleId) => {
      const collapsed = preferences.collapsedModules.filter((id) => id !== module);
      await persist({ activeModule: module, collapsedModules: collapsed });
    },
    [persist, preferences.collapsedModules],
  );

  const toggleModuleCollapsed = useCallback(
    async (module: MobileMissionModuleId) => {
      if (module !== preferences.activeModule) {
        await setActiveModule(module);
        return;
      }
      const isCollapsed = preferences.collapsedModules.includes(module);
      const collapsedModules = isCollapsed
        ? preferences.collapsedModules.filter((id) => id !== module)
        : [...preferences.collapsedModules, module];
      await persist({ collapsedModules });
    },
    [persist, preferences.activeModule, preferences.collapsedModules, setActiveModule],
  );

  const setShowHeroStrip = useCallback(
    async (show: boolean) => {
      await persist({ showHeroStrip: show });
    },
    [persist],
  );

  const isModuleCollapsed = useCallback(
    (module: MobileMissionModuleId) => {
      if (module !== preferences.activeModule) return true;
      return preferences.collapsedModules.includes(module);
    },
    [preferences.activeModule, preferences.collapsedModules],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setActiveModule,
    toggleModuleCollapsed,
    setShowHeroStrip,
    isModuleCollapsed,
  };
}
