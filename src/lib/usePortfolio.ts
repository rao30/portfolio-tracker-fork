import { useCallback, useEffect, useRef, useState } from 'react';
import type { Portfolio, PortfolioFile, Property } from './types';
import { denormalizePortfolio, normalizePortfolio } from './snowball';
import type { PropertyDraft } from './types';

const STORAGE_KEY = 'rental-snowball-portfolio';
const SAVE_DEBOUNCE_MS = 800;

export type DataSource = 'file' | 'local' | 'cloud';

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

export type PortfolioSettingKey =
  | 'extraMonthlyBudget'
  | 'annualRentGrowthRate'
  | 'annualExpenseInflationRate'
  | 'reinvestSurplus'
  | 'monthlyReserveTarget';

export interface UsePortfolioResult {
  portfolio: Portfolio | null;
  loading: boolean;
  error: string | null;
  source: DataSource;
  syncStatus: SyncStatus;
  cloudEnabled: boolean;
  setBudget: (budget: number) => void;
  updatePortfolioSetting: (field: PortfolioSettingKey, value: number | boolean) => void;
  updateProperty: (index: number, field: keyof Property, value: string) => void;
  addProperty: (draft: PropertyDraft) => void;
  removeProperty: (index: number) => void;
  resetFromFile: () => Promise<void>;
  exportJson: () => void;
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
}

async function loadFromApi(): Promise<ApiPortfolioResponse | null> {
  try {
    const res = await fetch('/api/portfolio');
    if (!res.ok) return null;
    return (await res.json()) as ApiPortfolioResponse;
  } catch {
    return null;
  }
}

function writeHeaders(): HeadersInit {
  const key = import.meta.env.VITE_PORTFOLIO_WRITE_KEY;
  if (!key) return { 'Content-Type': 'application/json' };
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
}

async function saveToApi(file: PortfolioFile): Promise<boolean> {
  try {
    const res = await fetch('/api/portfolio', {
      method: 'PUT',
      headers: writeHeaders(),
      body: JSON.stringify({ portfolio: file }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Load portfolio from API, localStorage, or repo JSON; persist edits to cloud + local cache. */
export function usePortfolio(): UsePortfolioResult {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>('file');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portfolioRef = useRef<Portfolio | null>(null);

  portfolioRef.current = portfolio;

  const scheduleCloudSave = useCallback((next: Portfolio) => {
    saveLocal(next);
    if (!cloudEnabled) {
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const file = denormalizePortfolio(next);
        const ok = await saveToApi(file);
        setSyncStatus(ok ? 'saved' : 'error');
      })();
    }, SAVE_DEBOUNCE_MS);
  }, [cloudEnabled]);

  const persist = useCallback(
    (next: Portfolio, nextSource: DataSource) => {
      setPortfolio(next);
      setSource(nextSource);
      scheduleCloudSave(next);
    },
    [scheduleCloudSave],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = await loadFromApi();
        if (cancelled) return;

        if (api?.cloudStorage) setCloudEnabled(true);

        if (api?.portfolio) {
          const normalized = normalizePortfolio(api.portfolio);
          setPortfolio(normalized);
          setSource(api.source === 'cloud' ? 'cloud' : 'file');
          saveLocal(normalized);
          setSyncStatus(api.cloudStorage ? 'saved' : 'idle');
          return;
        }

        const stored = loadFromStorage();
        if (stored) {
          setPortfolio(stored);
          setSource('local');
          setSyncStatus('offline');
          return;
        }

        const file = await loadFromFile();
        setPortfolio(file);
        setSource('file');
        setSyncStatus('offline');
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
  }, []);

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

  const updateProperty = useCallback(
    (index: number, field: keyof Property, value: string) => {
      if (!portfolio) return;
      const props = [...portfolio.properties];
      const current = { ...props[index] };
      if (field === 'name') {
        current.name = value;
      } else {
        const num = parseFloat(value);
        if (Number.isNaN(num)) return;
        current[field] = num;
      }
      props[index] = current;
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

  const resetFromFile = useCallback(async () => {
    if (
      source !== 'file' &&
      !window.confirm('Discard all edits and reload the default portfolio from the repo?')
    ) {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    setLoading(true);
    setError(null);
    setSyncStatus('saving');
    try {
      const file = await loadFromFile();
      setPortfolio(file);
      setSource('file');
      if (cloudEnabled) {
        const ok = await saveToApi(denormalizePortfolio(file));
        setSyncStatus(ok ? 'saved' : 'error');
        setSource(ok ? 'cloud' : 'file');
      } else {
        setSyncStatus('offline');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset');
      setSyncStatus('error');
    } finally {
      setLoading(false);
    }
  }, [source, cloudEnabled]);

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

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return {
    portfolio,
    loading,
    error,
    source,
    syncStatus,
    cloudEnabled,
    setBudget,
    updatePortfolioSetting,
    updateProperty,
    addProperty,
    removeProperty,
    resetFromFile,
    exportJson,
  };
}
