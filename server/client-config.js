export function getSupabaseClientConfig() {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || null;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY?.trim() ??
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ??
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ??
    null;

  return {
    supabaseUrl,
    supabaseAnonKey,
    portfolioApiKey:
      process.env.VITE_PORTFOLIO_API_KEY?.trim() ||
      process.env.PORTFOLIO_API_KEY?.trim() ||
      null,
    portfolioWriteKey: process.env.VITE_PORTFOLIO_WRITE_KEY?.trim() || null,
  };
}
