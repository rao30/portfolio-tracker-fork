import { useCallback, useEffect, useState } from 'react';
import type { TimelineScenarioRecord } from './timeline';
import { getAccessToken } from './supabaseClient';

const LOCAL_KEY = 'rental-snowball-timeline-scenarios';

async function authorizedHeaders(jsonBody = false): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (jsonBody) headers['Content-Type'] = 'application/json';
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function loadLocalScenarios(): TimelineScenarioRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TimelineScenarioRecord[];
  } catch {
    return [];
  }
}

function saveLocalScenarios(scenarios: TimelineScenarioRecord[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(scenarios));
}

export function useTimelineScenarios(cloudEnabled: boolean, userId?: string) {
  const [scenarios, setScenarios] = useState<TimelineScenarioRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (cloudEnabled && userId) {
        const res = await fetch('/api/timeline-scenarios', {
          headers: await authorizedHeaders(),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Failed to load scenarios (${res.status})`);
        }
        const data = (await res.json()) as { scenarios: TimelineScenarioRecord[] };
        setScenarios(data.scenarios ?? []);
      } else {
        setScenarios(loadLocalScenarios());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scenarios');
      setScenarios(loadLocalScenarios());
    } finally {
      setLoading(false);
    }
  }, [cloudEnabled, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveScenario = useCallback(
    async (payload: {
      name: string;
      description?: string;
      propertyEvents: TimelineScenarioRecord['propertyEvents'];
      color?: string;
    }) => {
      if (cloudEnabled && userId) {
        const res = await fetch('/api/timeline-scenarios', {
          method: 'POST',
          headers: await authorizedHeaders(true),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to save scenario');
        }
        const data = (await res.json()) as { scenario: TimelineScenarioRecord };
        setScenarios((prev) => [...prev, data.scenario]);
        return data.scenario;
      }

      const now = new Date().toISOString();
      const scenario: TimelineScenarioRecord = {
        id: crypto.randomUUID(),
        name: payload.name.trim(),
        description: payload.description ?? null,
        propertyEvents: payload.propertyEvents,
        scenarioConfig: null,
        color: payload.color ?? '#06b6d4',
        sortOrder: scenarios.length,
        createdAt: now,
        updatedAt: now,
      };
      const next = [...scenarios, scenario];
      saveLocalScenarios(next);
      setScenarios(next);
      return scenario;
    },
    [cloudEnabled, userId, scenarios],
  );

  const deleteScenario = useCallback(
    async (id: string) => {
      if (cloudEnabled && userId) {
        const res = await fetch(`/api/timeline-scenarios/${id}`, {
          method: 'DELETE',
          headers: await authorizedHeaders(),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? 'Failed to delete scenario');
        }
      } else {
        const next = scenarios.filter((s) => s.id !== id);
        saveLocalScenarios(next);
        setScenarios(next);
        return;
      }
      setScenarios((prev) => prev.filter((s) => s.id !== id));
    },
    [cloudEnabled, userId, scenarios],
  );

  return {
    scenarios,
    loading,
    error,
    refresh,
    saveScenario,
    deleteScenario,
    canPersistCloud: Boolean(cloudEnabled && userId),
  };
}
