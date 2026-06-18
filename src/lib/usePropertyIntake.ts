import { useCallback, useEffect, useState } from 'react';
import type {
  IntakeFinancingType,
  IntakeStep,
  IntakeTemplateSource,
  PropertyIntakePreferences,
} from './propertyIntakeTypes';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-property-intake';

const DEFAULT_PREFERENCES: PropertyIntakePreferences = {
  isCollapsed: false,
  preferredTemplate: 'clone_last',
  defaultFinancingType: 'conventional',
  lastCompletedStep: 'template',
  autoCalculatePayment: true,
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

function loadLocalPreferences(): PropertyIntakePreferences {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as PropertyIntakePreferences) };
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return DEFAULT_PREFERENCES;
  }
}

function saveLocalPreferences(prefs: PropertyIntakePreferences): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(prefs));
}

export interface UsePropertyIntakeResult {
  preferences: PropertyIntakePreferences;
  loading: boolean;
  saving: boolean;
  cloudBacked: boolean;
  setPreferredTemplate: (value: IntakeTemplateSource) => Promise<void>;
  setDefaultFinancingType: (value: IntakeFinancingType) => Promise<void>;
  setLastCompletedStep: (value: IntakeStep) => Promise<void>;
  setAutoCalculatePayment: (value: boolean) => Promise<void>;
}

export function usePropertyIntake(): UsePropertyIntakeResult {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<PropertyIntakePreferences>(DEFAULT_PREFERENCES);
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
      const res = await fetch('/api/property-intake', { headers });
      if (res.ok) {
        const data = (await res.json()) as { preferences: PropertyIntakePreferences };
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
    async (patch: Partial<PropertyIntakePreferences>) => {
      const next = { ...preferences, ...patch, updatedAt: new Date().toISOString() };
      setPreferences(next);

      if (!user) {
        saveLocalPreferences(next);
        return;
      }

      setSaving(true);
      try {
        const headers = await authorizedHeaders(true);
        const res = await fetch('/api/property-intake', {
          method: 'PUT',
          headers,
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const data = (await res.json()) as { preferences: PropertyIntakePreferences };
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

  const setPreferredTemplate = useCallback(
    (value: IntakeTemplateSource) => persist({ preferredTemplate: value }),
    [persist],
  );

  const setDefaultFinancingType = useCallback(
    (value: IntakeFinancingType) => persist({ defaultFinancingType: value }),
    [persist],
  );

  const setLastCompletedStep = useCallback(
    (value: IntakeStep) => persist({ lastCompletedStep: value }),
    [persist],
  );

  const setAutoCalculatePayment = useCallback(
    (value: boolean) => persist({ autoCalculatePayment: value }),
    [persist],
  );

  return {
    preferences,
    loading,
    saving,
    cloudBacked,
    setPreferredTemplate,
    setDefaultFinancingType,
    setLastCompletedStep,
    setAutoCalculatePayment,
  };
}
