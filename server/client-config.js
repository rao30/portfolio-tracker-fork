import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let fileDefaults = null;

function getFileDefaults() {
  if (fileDefaults) return fileDefaults;
  const configPath = path.join(__dirname, 'supabase-public.json');
  if (!existsSync(configPath)) return null;
  try {
    fileDefaults = JSON.parse(readFileSync(configPath, 'utf8'));
    return fileDefaults;
  } catch {
    return null;
  }
}

function envOrNull(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getSupabaseClientConfig() {
  const defaults = getFileDefaults();
  const supabaseUrl =
    envOrNull('SUPABASE_URL') || envOrNull('VITE_SUPABASE_URL') || defaults?.supabaseUrl || null;
  const supabaseAnonKey =
    envOrNull('SUPABASE_ANON_KEY') ??
    envOrNull('SUPABASE_PUBLISHABLE_KEY') ??
    envOrNull('VITE_SUPABASE_ANON_KEY') ??
    defaults?.supabaseAnonKey ??
    null;

  return {
    supabaseUrl,
    supabaseAnonKey,
    portfolioApiKey: envOrNull('VITE_PORTFOLIO_API_KEY') || envOrNull('PORTFOLIO_API_KEY'),
    portfolioWriteKey: envOrNull('VITE_PORTFOLIO_WRITE_KEY'),
  };
}
