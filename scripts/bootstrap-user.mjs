/**
 * Create or update a Supabase Auth user and seed their portfolio row.
 *
 * Usage (never commit passwords):
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='your-password' node scripts/bootstrap-user.mjs
 *
 * Requires SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */
import { createClient } from '@supabase/supabase-js';
import { copyPortfolioRow, LEGACY_PORTFOLIO_ROW_ID, loadPortfolio } from '../server/portfolio-store.js';

const url = process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_PASSWORD;

if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY');
  process.exit(1);
}
if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: list, error: listError } = await supabase.auth.admin.listUsers();
if (listError) {
  console.error('listUsers failed:', listError.message);
  process.exit(1);
}

let userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;

if (!userId) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error('createUser failed:', error.message);
    process.exit(1);
  }
  userId = data.user.id;
  console.log(`Created user ${email} (${userId})`);
} else {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error('updateUser failed:', error.message);
    process.exit(1);
  }
  console.log(`Updated password for ${email} (${userId})`);
}

try {
  await copyPortfolioRow(LEGACY_PORTFOLIO_ROW_ID, userId);
  console.log('Portfolio row seeded for user');
} catch (err) {
  const loaded = await loadPortfolio(userId);
  if (loaded.data) {
    console.log('Portfolio row already exists for user');
  } else {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

console.log('Done.');
