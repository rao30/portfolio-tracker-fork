import { useCallback, useEffect, useState } from 'react';
import type { Portfolio, PortfolioFile, Property } from './types';
import { denormalizePortfolio, normalizePortfolio } from './snowball';

const STORAGE_KEY = 'rental-snowball-portfolio';

export type DataSource = 'file' | 'local';

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
  setBudget: (budget: number) => void;
  updatePortfolioSetting: (field: PortfolioSettingKey, value: number | boolean) => void;
  updateProperty: (index: number, field: keyof Property, value: string) => void;
  addProperty: () => void;
  removeProperty: (index: number) => void;
  resetFromFile: () => Promise<void>;
  exportJson: () => void;
}

function saveLocal(portfolio: Portfolio): void {
  const file = denormalizePortfolio(portfolio);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
}

async function loadFromFile(): Promise<Portfolio> {
  const url = `${import.meta.env.BASE_URL}data/portfolio.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load portfolio (${res.status})`);
  const raw: unknown = await res.json();
  return normalizePortfolio(raw);
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

/** Load portfolio from localStorage or repo JSON; persist edits locally. */
export function usePortfolio(): UsePortfolioResult {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>('file');

  const persist = useCallback((next: Portfolio, fromLocal: boolean) => {
    setPortfolio(next);
    if (fromLocal) {
      saveLocal(next);
      setSource('local');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = loadFromStorage();
        if (stored) {
          if (!cancelled) {
            setPortfolio(stored);
            setSource('local');
          }
        } else {
          const file = await loadFromFile();
          if (!cancelled) {
            setPortfolio(file);
            setSource('file');
          }
        }
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
      persist({ ...portfolio, extraMonthlyBudget: budget }, true);
    },
    [portfolio, persist],
  );

  const updatePortfolioSetting = useCallback(
    (field: PortfolioSettingKey, value: number | boolean) => {
      if (!portfolio) return;
      persist({ ...portfolio, [field]: value }, true);
    },
    [portfolio, persist],
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
      persist({ ...portfolio, properties: props }, true);
    },
    [portfolio, persist],
  );

  const addProperty = useCallback(() => {
    if (!portfolio) return;
    const props = [
      ...portfolio.properties,
      {
        name: 'New Property',
        balance: 100000,
        marketValue: 150000,
        annualInterestRate: 0.05,
        annualAppreciationRate: 0.03,
        monthlyPayment: 500,
        monthlyRent: 1500,
        monthlyExpenses: 450,
      },
    ];
    persist({ ...portfolio, properties: props }, true);
  }, [portfolio, persist]);

  const removeProperty = useCallback(
    (index: number) => {
      if (!portfolio || portfolio.properties.length <= 1) return;
      const props = portfolio.properties.filter((_, i) => i !== index);
      persist({ ...portfolio, properties: props }, true);
    },
    [portfolio, persist],
  );

  const resetFromFile = useCallback(async () => {
    if (
      source === 'local' &&
      !window.confirm('Discard local edits and reload from repo file?')
    ) {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    setLoading(true);
    setError(null);
    try {
      const file = await loadFromFile();
      setPortfolio(file);
      setSource('file');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setLoading(false);
    }
  }, [source]);

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

  return {
    portfolio,
    loading,
    error,
    source,
    setBudget,
    updatePortfolioSetting,
    updateProperty,
    addProperty,
    removeProperty,
    resetFromFile,
    exportJson,
  };
}
