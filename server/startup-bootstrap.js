import { createClient } from '@supabase/supabase-js';
import { copyPortfolioRow, LEGACY_PORTFOLIO_ROW_ID } from './portfolio-store.js';

/**
 * Idempotent admin user + portfolio seed when ADMIN_EMAIL / ADMIN_PASSWORD are set.
 * Safe to run on every deploy (updates password if user exists).
 */
export async function bootstrapAdminUserIfConfigured() {
  const url = process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!url || !serviceKey || !email || !password) {
    return { skipped: true };
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    throw new Error(`listUsers: ${listError.message}`);
  }

  let userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    userId = data.user.id;
    console.info(`[bootstrap] Created admin user ${email}`);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUser: ${error.message}`);
    console.info(`[bootstrap] Updated admin user ${email}`);
  }

  try {
    await copyPortfolioRow(LEGACY_PORTFOLIO_ROW_ID, userId);
    console.info(`[bootstrap] Portfolio seeded for ${userId}`);
  } catch (err) {
    console.info(
      `[bootstrap] Portfolio copy skipped: ${err instanceof Error ? err.message : err}`,
    );
  }

  return { skipped: false, userId, email };
}
