interface ClientConfig {
  portfolioApiKey?: string | null;
  portfolioWriteKey?: string | null;
}

let resolved: ClientConfig | null = null;
let promise: Promise<ClientConfig> | null = null;

function fromViteEnv(): ClientConfig {
  return {
    portfolioApiKey: import.meta.env.VITE_PORTFOLIO_API_KEY as string | undefined,
    portfolioWriteKey: import.meta.env.VITE_PORTFOLIO_WRITE_KEY as string | undefined,
  };
}

async function loadClientConfig(): Promise<ClientConfig> {
  const vite = fromViteEnv();
  if (vite.portfolioApiKey || vite.portfolioWriteKey) return vite;

  try {
    const res = await fetch('/api/client-config');
    if (!res.ok) return {};
    const data = (await res.json()) as ClientConfig;
    return {
      portfolioApiKey: data.portfolioApiKey ?? undefined,
      portfolioWriteKey: data.portfolioWriteKey ?? undefined,
    };
  } catch {
    return {};
  }
}

export async function getClientConfig(): Promise<ClientConfig> {
  if (resolved) return resolved;
  if (!promise) promise = loadClientConfig();
  resolved = await promise;
  return resolved;
}
