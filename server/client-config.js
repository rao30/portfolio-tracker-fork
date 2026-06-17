function envOrNull(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getSupabaseClientConfig() {
  const supabaseUrl = envOrNull('SUPABASE_URL') || envOrNull('VITE_SUPABASE_URL');
  const supabaseAnonKey =
    envOrNull('SUPABASE_ANON_KEY') ??
    envOrNull('SUPABASE_PUBLISHABLE_KEY') ??
    envOrNull('VITE_SUPABASE_ANON_KEY');

  return {
    supabaseUrl,
    supabaseAnonKey,
    portfolioApiKey: envOrNull('VITE_PORTFOLIO_API_KEY') || envOrNull('PORTFOLIO_API_KEY'),
    portfolioWriteKey: envOrNull('VITE_PORTFOLIO_WRITE_KEY'),
  };
}
