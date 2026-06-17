import type { StrategyId } from './snowball';

export interface StrategyLabScenario {
  id: string;
  name: string;
  extraMonthlyBudget: number;
  strategyId: StrategyId;
  isPinned: boolean;
  notes?: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StrategyLabMetrics {
  monthsToPayoff: number;
  totalInterest: number;
  interestSaved: number;
  debtFreeYear: number;
  monthsDeltaVsCurrent: number;
  interestDeltaVsCurrent: number;
}

export const STRATEGY_LAB_STORAGE_KEY = 'rental-snowball-strategy-lab';
export const MAX_STRATEGY_LAB_SCENARIOS = 6;

function authHeaders(token: string | null, apiKey: string | null): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export function loadLocalStrategyLabScenarios(): StrategyLabScenario[] {
  try {
    const raw = localStorage.getItem(STRATEGY_LAB_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StrategyLabScenario[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(STRATEGY_LAB_STORAGE_KEY);
    return [];
  }
}

export function saveLocalStrategyLabScenarios(scenarios: StrategyLabScenario[]): void {
  localStorage.setItem(STRATEGY_LAB_STORAGE_KEY, JSON.stringify(scenarios));
}

export async function fetchStrategyLabScenarios(
  token: string | null,
  apiKey: string | null,
): Promise<StrategyLabScenario[]> {
  const res = await fetch('/api/strategy-lab/scenarios', {
    headers: authHeaders(token, apiKey),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load scenarios (${res.status})`);
  }
  const data = await res.json();
  return data.scenarios ?? [];
}

export async function createRemoteStrategyLabScenario(
  input: Pick<StrategyLabScenario, 'name' | 'extraMonthlyBudget' | 'strategyId' | 'notes'>,
  token: string | null,
  apiKey: string | null,
): Promise<StrategyLabScenario> {
  const res = await fetch('/api/strategy-lab/scenarios', {
    method: 'POST',
    headers: authHeaders(token, apiKey),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to pin scenario (${res.status})`);
  }
  const data = await res.json();
  return data.scenario;
}

export async function updateRemoteStrategyLabScenario(
  id: string,
  patch: Partial<Pick<StrategyLabScenario, 'name' | 'extraMonthlyBudget' | 'strategyId' | 'notes' | 'sortOrder'>>,
  token: string | null,
  apiKey: string | null,
): Promise<StrategyLabScenario> {
  const res = await fetch(`/api/strategy-lab/scenarios/${id}`, {
    method: 'PUT',
    headers: authHeaders(token, apiKey),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update scenario (${res.status})`);
  }
  const data = await res.json();
  return data.scenario;
}

export async function deleteRemoteStrategyLabScenario(
  id: string,
  token: string | null,
  apiKey: string | null,
): Promise<void> {
  const res = await fetch(`/api/strategy-lab/scenarios/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token, apiKey),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to delete scenario (${res.status})`);
  }
}

export function createLocalStrategyLabScenario(
  scenarios: StrategyLabScenario[],
  input: Pick<StrategyLabScenario, 'name' | 'extraMonthlyBudget' | 'strategyId' | 'notes'>,
): StrategyLabScenario[] {
  if (scenarios.length >= MAX_STRATEGY_LAB_SCENARIOS) {
    throw new Error(`You can pin at most ${MAX_STRATEGY_LAB_SCENARIOS} scenarios`);
  }
  const next: StrategyLabScenario = {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    extraMonthlyBudget: input.extraMonthlyBudget,
    strategyId: input.strategyId,
    isPinned: true,
    notes: input.notes,
    sortOrder: scenarios.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return [...scenarios, next];
}

export function updateLocalStrategyLabScenario(
  scenarios: StrategyLabScenario[],
  id: string,
  patch: Partial<Pick<StrategyLabScenario, 'name' | 'extraMonthlyBudget' | 'strategyId' | 'notes' | 'sortOrder'>>,
): StrategyLabScenario[] {
  return scenarios.map((scenario) =>
    scenario.id === id
      ? {
          ...scenario,
          ...patch,
          name: patch.name !== undefined ? patch.name.trim() : scenario.name,
          updatedAt: new Date().toISOString(),
        }
      : scenario,
  );
}

export function deleteLocalStrategyLabScenario(
  scenarios: StrategyLabScenario[],
  id: string,
): StrategyLabScenario[] {
  return scenarios
    .filter((scenario) => scenario.id !== id)
    .map((scenario, index) => ({ ...scenario, sortOrder: index }));
}

export function defaultScenarioName(
  budget: number,
  strategyLabel: string,
): string {
  const budgetLabel =
    budget >= 1000 ? `$${Math.round(budget / 100) / 10}k/mo` : `$${budget}/mo`;
  return `${budgetLabel} · ${strategyLabel}`;
}
