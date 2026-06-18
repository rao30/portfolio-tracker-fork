import { useCallback, useEffect, useState } from 'react';
import type { StrategyId } from './types';
import type { PayoffPlaybookState } from './payoffPlaybook';
import { getClientConfig } from './clientConfig';
import { getAccessToken } from './supabaseClient';
import { useAuth } from '../context/AuthContext';

const LOCAL_KEY = 'rental-snowball-payoff-playbook';

export interface PayoffPlaybookInput {
  propertyOrder: string[];
  baseStrategy?: StrategyId | null;
  isActive?: boolean;
}

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

function loadLocalPlaybook(): PayoffPlaybookState | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PayoffPlaybookState;
    if (!Array.isArray(parsed.propertyOrder)) return null;
    return parsed;
  } catch {
    localStorage.removeItem(LOCAL_KEY);
    return null;
  }
}

function saveLocalPlaybook(state: PayoffPlaybookState): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

export interface UsePayoffPlaybookResult {
  playbook: PayoffPlaybookState | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  cloudBacked: boolean;
  savePlaybook: (input: PayoffPlaybookInput) => Promise<boolean>;
  clearPlaybook: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function usePayoffPlaybook(): UsePayoffPlaybookResult {
  const { user } = useAuth();
  const [playbook, setPlaybook] = useState<PayoffPlaybookState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudBacked, setCloudBacked] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/payoff-playbook', {
        headers: await authorizedHeaders(),
      });

      if (res.status === 401) {
        setCloudBacked(false);
        setPlaybook(loadLocalPlaybook());
        return;
      }

      if (res.status === 404) {
        setCloudBacked(true);
        setPlaybook(null);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
        );
      }

      const data = (await res.json()) as { playbook: PayoffPlaybookState | null };
      setCloudBacked(true);
      setPlaybook(data.playbook ?? null);
    } catch {
      // Cloud is unreachable (e.g. demo mode with no API). Fall back to local
      // storage silently — the feature still works, so there's nothing for the
      // user to act on.
      setCloudBacked(false);
      setPlaybook(loadLocalPlaybook());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, user?.id]);

  const savePlaybook = useCallback(
    async (input: PayoffPlaybookInput): Promise<boolean> => {
      setSaving(true);
      setError(null);

      const next: PayoffPlaybookState = {
        propertyOrder: input.propertyOrder,
        baseStrategy: input.baseStrategy ?? null,
        isActive: input.isActive ?? true,
        updatedAt: new Date().toISOString(),
      };

      try {
        if (cloudBacked && user) {
          const res = await fetch('/api/payoff-playbook', {
            method: 'PUT',
            headers: await authorizedHeaders(true),
            body: JSON.stringify({
              propertyOrder: next.propertyOrder,
              baseStrategy: next.baseStrategy,
              isActive: next.isActive,
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
            );
          }
          const data = (await res.json()) as { playbook: PayoffPlaybookState };
          setPlaybook(data.playbook);
          return true;
        }

        saveLocalPlaybook(next);
        setPlaybook(next);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save playbook');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [cloudBacked, user],
  );

  const clearPlaybook = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);

    try {
      if (cloudBacked && user) {
        const res = await fetch('/api/payoff-playbook', {
          method: 'DELETE',
          headers: await authorizedHeaders(),
        });
        if (!res.ok && res.status !== 404) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body.error === 'string' ? body.error : `HTTP ${res.status}`,
          );
        }
      } else {
        localStorage.removeItem(LOCAL_KEY);
      }
      setPlaybook(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear playbook');
      return false;
    } finally {
      setSaving(false);
    }
  }, [cloudBacked, user]);

  return {
    playbook,
    loading,
    saving,
    error,
    cloudBacked,
    savePlaybook,
    clearPlaybook,
    refresh,
  };
}
