import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AcquisitionTemplate,
  ExpenseBreakdown,
  GoalConfig,
  Portfolio,
  PortfolioFile,
  Property,
  PropertyDraft,
  TaxProfile,
} from './types';
import { denormalizePortfolio, normalizePortfolio, resolveMonthlyExpenses } from './snowball';
import { applyPropertyEventOverlays, type PropertyEventOverlay } from './timeline';
import { calendarToSimMonth } from './format';
import { bonusDepreciationForYear } from './tax';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'rental-snowball-portfolio';

function clonePortfolio(portfolio: Portfolio): Portfolio {
  return JSON.parse(JSON.stringify(portfolio)) as Portfolio;
}

export type DataSource = 'file' | 'local' | 'cloud';

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export type PortfolioSettingKey =
  | 'extraMonthlyBudget'
  | 'annualRentGrowthRate'
  | 'annualExpenseInflationRate'
  | 'reinvestSurplus'
  | 'monthlyReserveTarget'
  | 'defaultVacancyRate'
  | 'defaultCapexReserveRate'
  | 'defaultCapexReserveFlat';

export interface UsePortfolioResult {
  portfolio: Portfolio | null;
  loading: boolean;
  error: string | null;
  source: DataSource;
  syncStatus: SyncStatus;
  cloudEnabled: boolean;
  isDirty: boolean;
  saving: boolean;
  save: () => Promise<boolean>;
  discardChanges: () => void;
  setBudget: (budget: number) => void;
  updatePortfolioSetting: (field: PortfolioSettingKey, value: number | boolean) => void;
  updateTaxProfile: (field: keyof TaxProfile, value: number | boolean | string) => void;
  updateAcquisitionTemplate: (
    field: keyof AcquisitionTemplate,
    value: number | boolean | string,
  ) => void;
  updateGoals: (goals: GoalConfig[]) => void;
  updateProperty: (index: number, field: keyof Property, value: string) => void;
  updateAcquisitionDate: (index: number, value: string) => void;
  updateExpenseBreakdown: (index: number, breakdown: ExpenseBreakdown) => void;
  updatePropertyBoolean: (index: number, field: keyof Property, value: boolean) => void;
  addProperty: (draft: PropertyDraft) => void;
  removeProperty: (index: number) => void;
  resetFromFile: () => Promise<void>;
  exportJson: () => void;
  refreshMarketValues: () => Promise<{ ok: boolean; message: string }>;
  applyTimelineEvents: (overlays: PropertyEventOverlay[]) => void;
  clearTimelineEvents: () => void;
}

function saveLocal(portfolio: Portfolio): void {
  const file = denormalizePortfolio(portfolio);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
}

function loadFromStorage(): Portfolio | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizePortfolio(JSON.parse(raw) as unknown);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

async function loadFromFile(): Promise<Portfolio> {
  const url = `${import.meta.env.BASE_URL}data/portfolio.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load portfolio (${res.status})`);
  const raw: unknown = await res.json();
  return normalizePortfolio(raw);
}

interface ApiPortfolioResponse {
  portfolio: unknown;
  source: DataSource;
  updatedAt: string | null;
  cloudStorage: boolean;
  seedVersion?: number;
  upgradedFromVersion?: number;
}

interface HealthResponse {
  ok: boolean;
  cloudStorage: boolean;
  apiKeyRequired: boolean;
}

async function loadHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

async function portfolioApiKey(): Promise<string | undefined> {
  const config = await getClientConfig();
  return config.portfolioApiKey || config.portfolioWriteKey || undefined;
}

async function apiHeaders(jsonBody = false): Promise<HeadersInit> {
  const key = await portfolioApiKey();
  const headers: Record<string, string> = {};
  if (jsonBody) headers['Content-Type'] = 'application/json';
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

async function authorizedHeaders(jsonBody = false): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (jsonBody) headers['Content-Type'] = 'application/json';
  const token = await getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  return apiHeaders(jsonBody);
}

async function loadFromApi(): Promise<{
  response: ApiPortfolioResponse | null;
  error?: string;
}> {
  try {
    const res = await fetch('/api/portfolio', { headers: await authorizedHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const hint =
        typeof body.hint === 'string' ? body.hint : `HTTP ${res.status}`;
      return { response: null, error: hint };
    }
    return { response: (await res.json()) as ApiPortfolioResponse };
  } catch {
    return { response: null, error: 'Could not reach portfolio API' };
  }
}

function writeHeaders(): Promise<HeadersInit> {
  return authorizedHeaders(true);
}

async function saveToApi(file: PortfolioFile): Promise<boolean> {
  try {
    const res = await fetch('/api/portfolio', {
      method: 'PUT',
      headers: await writeHeaders(),
      body: JSON.stringify({ portfolio: file }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Load portfolio from API, localStorage, or repo JSON; persist edits to cloud + local cache. */
export function usePortfolio(): UsePortfolioResult {
  const { session, loading: authLoading, configured: authConfigured } = useAuth();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>('file');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const portfolioRef = useRef<Portfolio | null>(null);
  const savedSnapshotRef = useRef<Portfolio | null>(null);

  portfolioRef.current = portfolio;

  const markSaved = useCallback(
    (next: Portfolio, nextSource: DataSource) => {
      savedSnapshotRef.current = clonePortfolio(next);
      setPortfolio(next);
      setSource(nextSource);
      saveLocal(next);
      setIsDirty(false);
      setSyncStatus(cloudEnabled ? 'saved' : 'offline');
    },
    [cloudEnabled],
  );

  const persist = useCallback(
    (next: Portfolio, nextSource: DataSource) => {
      setPortfolio(next);
      setSource(nextSource);
      saveLocal(next);
      setIsDirty(true);
      setSyncStatus(cloudEnabled ? 'idle' : 'offline');
    },
    [cloudEnabled],
  );

  const save = useCallback(async (): Promise<boolean> => {
    const current = portfolioRef.current;
    if (!current) return false;

    saveLocal(current);
    if (!cloudEnabled) {
      savedSnapshotRef.current = clonePortfolio(current);
      setIsDirty(false);
      setSyncStatus('offline');
      return true;
    }

    setSaving(true);
    setSyncStatus('saving');
    try {
      const ok = await saveToApi(denormalizePortfolio(current));
      if (ok) {
        savedSnapshotRef.current = clonePortfolio(current);
        setIsDirty(false);
        setSyncStatus('saved');
      } else {
        setSyncStatus('error');
      }
      return ok;
    } catch {
      setSyncStatus('error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [cloudEnabled]);

  const discardChanges = useCallback(() => {
    const saved = savedSnapshotRef.current;
    if (!saved) return;
    const restored = clonePortfolio(saved);
    setPortfolio(restored);
    saveLocal(restored);
    setIsDirty(false);
    setSyncStatus(cloudEnabled ? 'saved' : 'offline');
  }, [cloudEnabled]);

  useEffect(() => {
    if (authConfigured && authLoading) return;
    if (authConfigured && !session) {
      setLoading(false);
      setPortfolio(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const health = await loadHealth();
        if (cancelled) return;

        const cloudStorage = health?.cloudStorage ?? false;
        setCloudEnabled(cloudStorage);

        const { response: api, error: apiError } = await loadFromApi();
        if (cancelled) return;

        if (api?.portfolio) {
          const normalized = normalizePortfolio(api.portfolio);
          markSaved(normalized, api.source === 'cloud' ? 'cloud' : 'file');
          if (api.upgradedFromVersion != null) {
            console.info(
              `Portfolio seed upgraded in cloud: v${api.upgradedFromVersion} → v${api.seedVersion ?? normalized.seedVersion}`,
            );
          }
          return;
        }

        if (cloudStorage) {
          throw new Error(
            apiError ??
              'Your portfolio could not be loaded. Refresh the page or reset to the default template.',
          );
        }

        const stored = loadFromStorage();
        if (stored) {
          markSaved(stored, 'local');
          return;
        }

        const file = await loadFromFile();
        markSaved(file, 'file');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load portfolio');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authConfigured, authLoading, session?.access_token, markSaved]);

  const setBudget = useCallback(
    (budget: number) => {
      if (!portfolio) return;
      persist({ ...portfolio, extraMonthlyBudget: budget }, source === 'file' ? 'local' : source);
    },
    [portfolio, persist, source],
  );

  const updatePortfolioSetting = useCallback(
    (field: PortfolioSettingKey, value: number | boolean) => {
      if (!portfolio) return;
      persist({ ...portfolio, [field]: value }, source === 'file' ? 'local' : source);
    },
    [portfolio, persist, source],
  );

  const updateTaxProfile = useCallback(
    (field: keyof TaxProfile, value: number | boolean | string) => {
      if (!portfolio) return;
      const next = { ...portfolio.taxProfile, [field]: value };
      if (field === 'taxYear' && typeof value === 'number') {
        next.bonusDepreciationRate = bonusDepreciationForYear(value);
      }
      persist(
        { ...portfolio, taxProfile: next },
        source === 'file' ? 'local' : source,
      );
    },
    [portfolio, persist, source],
  );

  const updateAcquisitionTemplate = useCallback(
    (field: keyof AcquisitionTemplate, value: number | boolean | string) => {
      if (!portfolio) return;
      persist(
        {
          ...portfolio,
          acquisitionTemplate: { ...portfolio.acquisitionTemplate, [field]: value },
        },
        source === 'file' ? 'local' : source,
      );
    },
    [portfolio, persist, source],
  );

  const updateGoals = useCallback(
    (goals: GoalConfig[]) => {
      if (!portfolio) return;
      persist({ ...portfolio, goals }, source === 'file' ? 'local' : source);
    },
    [portfolio, persist, source],
  );

  const updateExpenseBreakdown = useCallback(
    (index: number, breakdown: ExpenseBreakdown) => {
      if (!portfolio) return;
      const props = [...portfolio.properties];
      const current = { ...props[index], expenseBreakdown: breakdown };
      current.monthlyExpenses = resolveMonthlyExpenses(current);
      props[index] = current;
      persist({ ...portfolio, properties: props }, source === 'file' ? 'local' : source);
    },
    [portfolio, persist, source],
  );

  const updateProperty = useCallback(
    (index: number, field: keyof Property, value: string) => {
      if (!portfolio) return;
      const props = [...portfolio.properties];
      const current = { ...props[index] };
      if (field === 'name') {
        current.name = value;
      } else if (field === 'useCostSeg') {
        current.useCostSeg = value === 'true';
      } else {
        const num = parseFloat(value);
        if (Number.isNaN(num)) return;
        (current as unknown as Record<string, number>)[field as string] = num;
      }
      props[index] = current;
      persist(
        { ...portfolio, properties: props },
        source === 'file' ? 'local' : source,
      );
    },
    [portfolio, persist, source],
  );

  const updatePropertyBoolean = useCallback(
    (index: number, field: keyof Property, value: boolean) => {
      if (!portfolio) return;
      const props = [...portfolio.properties];
      props[index] = { ...props[index], [field]: value };
      persist(
        { ...portfolio, properties: props },
        source === 'file' ? 'local' : source,
      );
    },
    [portfolio, persist, source],
  );

  const addProperty = useCallback(
    (draft: PropertyDraft) => {
      if (!portfolio) return;
      const props = [...portfolio.properties, draft];
      persist(
        { ...portfolio, properties: props },
        source === 'file' ? 'local' : source,
      );
    },
    [portfolio, persist, source],
  );

  const removeProperty = useCallback(
    (index: number) => {
      if (!portfolio || portfolio.properties.length <= 1) return;
      const props = portfolio.properties.filter((_, i) => i !== index);
      persist(
        { ...portfolio, properties: props },
        source === 'file' ? 'local' : source,
      );
    },
    [portfolio, persist, source],
  );

  const applyTimelineEvents = useCallback(
    (overlays: PropertyEventOverlay[]) => {
      if (!portfolio) return;
      const next = applyPropertyEventOverlays(portfolio, overlays);
      persist(next, source === 'file' ? 'local' : source);
    },
    [portfolio, persist, source],
  );

  const clearTimelineEvents = useCallback(() => {
    if (!portfolio) return;
    const next = {
      ...portfolio,
      properties: portfolio.properties.map((p) => {
        const { events: _events, ...rest } = p;
        return rest;
      }),
    };
    persist(next, source === 'file' ? 'local' : source);
  }, [portfolio, persist, source]);

  const updateAcquisitionDate = useCallback(
    (index: number, value: string) => {
      if (!portfolio) return;
      const match = value.trim().match(/^(\d{4})-(\d{1,2})$/);
      if (!match) return;
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (month < 1 || month > 12) return;
      const props = [...portfolio.properties];
      const current = {
        ...props[index],
        closeYear: year,
        closeMonthCalendar: month,
        acquisitionDate: value.trim(),
        closeMonth: calendarToSimMonth(
          year,
          month,
          portfolio.simulationAnchorYear ?? 2026,
          portfolio.simulationAnchorMonth ?? 1,
        ),
      };
      props[index] = current;
      persist(
        { ...portfolio, properties: props },
        source === 'file' ? 'local' : source,
      );
    },
    [portfolio, persist, source],
  );

  const resetFromFile = useCallback(async () => {
    if (
      source !== 'file' &&
      !window.confirm(
        'Discard all edits and reload the default portfolio from the repo? This overwrites cloud storage.',
      )
    ) {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    setLoading(true);
    setError(null);
    setSyncStatus('saving');
    try {
      let normalized: Portfolio;
      let nextSource: DataSource = 'file';

      if (cloudEnabled) {
        const res = await fetch('/api/portfolio/reset', {
          method: 'POST',
          headers: await writeHeaders(),
        });
        if (!res.ok) {
          throw new Error(`Reset failed (${res.status})`);
        }
        const body = (await res.json()) as ApiPortfolioResponse;
        normalized = normalizePortfolio(body.portfolio);
        nextSource = body.source === 'cloud' ? 'cloud' : 'file';
        markSaved(normalized, nextSource);
      } else {
        normalized = await loadFromFile();
        markSaved(normalized, 'file');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset');
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  }, [source, cloudEnabled, markSaved]);

  const exportJson = useCallback(() => {
    if (!portfolio) return;
    const file: PortfolioFile = denormalizePortfolio(portfolio);
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portfolio.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [portfolio]);

  const refreshMarketValues = useCallback(async () => {
    if (!portfolio) return { ok: false, message: 'No portfolio loaded' };
    setSaving(true);
    setSyncStatus('saving');
    try {
      const res = await fetch('/api/portfolio/market-values', {
        method: 'POST',
        headers: await writeHeaders(),
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as {
        error?: string;
        portfolio?: unknown;
        results?: unknown[];
        errors?: unknown[];
      };
      if (!res.ok) {
        throw new Error(body.error ?? `Market value refresh failed (${res.status})`);
      }
      if (body.portfolio) {
        const normalized = normalizePortfolio(body.portfolio);
        markSaved(normalized, source === 'file' ? 'local' : source);
      }
      const count = body.results?.length ?? 0;
      const errCount = body.errors?.length ?? 0;
      if (errCount > 0) setSyncStatus('error');
      return {
        ok: errCount === 0,
        message:
          errCount > 0
            ? `Updated ${count} properties; ${errCount} could not be refreshed`
            : `Updated market values for ${count} properties`,
      };
    } catch (e) {
      setSyncStatus('error');
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Market value refresh failed',
      };
    } finally {
      setSaving(false);
    }
  }, [portfolio, markSaved, source]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  return {
    portfolio,
    loading,
    error,
    source,
    syncStatus,
    cloudEnabled,
    isDirty,
    saving,
    save,
    discardChanges,
    setBudget,
    updatePortfolioSetting,
    updateTaxProfile,
    updateAcquisitionTemplate,
    updateGoals,
    updateProperty,
    updateAcquisitionDate,
    updateExpenseBreakdown,
    updatePropertyBoolean,
    addProperty,
    removeProperty,
    resetFromFile,
    exportJson,
    refreshMarketValues,
    applyTimelineEvents,
    clearTimelineEvents,
  };
}
