interface ClientConfig {
  portfolioApiKey?: string | null;
  portfolioWriteKey?: string | null;
}

export async function getClientConfig(): Promise<ClientConfig> {
  // Shared server credentials must never enter the browser, including through
  // Vite build variables or an older server's public configuration endpoint.
  // Existing callers use the signed-in user's session before this fallback.
  return {};
}
