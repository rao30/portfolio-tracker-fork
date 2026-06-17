-- Strategy Lab: pinned budget + payoff strategy what-if scenarios per user.

create table if not exists public.strategy_lab_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Untitled',
  extra_monthly_budget numeric not null default 0,
  strategy_id text not null,
  is_pinned boolean not null default true,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint strategy_lab_scenarios_name_check
    check (char_length(trim(both from name)) > 0),
  constraint strategy_lab_scenarios_budget_check
    check (
      extra_monthly_budget >= 0
      and extra_monthly_budget <= 1000000
    ),
  constraint strategy_lab_scenarios_strategy_check
    check (
      strategy_id = any (
        array[
          'highestRate',
          'highestPiPerDollar',
          'highestCashflowBoost',
          'lowestBalance',
          'lowestDscr',
          'highestInterestCost'
        ]::text[]
      )
    ),
  constraint strategy_lab_scenarios_notes_check
    check (notes is null or char_length(notes) <= 500),
  constraint strategy_lab_scenarios_sort_order_check
    check (sort_order >= 0 and sort_order <= 1000)
);

comment on table public.strategy_lab_scenarios is
  'Pinned Strategy Lab what-if scenarios (budget + payoff strategy) per authenticated user.';

create index if not exists strategy_lab_scenarios_user_sort_idx
  on public.strategy_lab_scenarios (user_id, sort_order, created_at);

alter table public.strategy_lab_scenarios enable row level security;

create policy strategy_lab_scenarios_select_own
  on public.strategy_lab_scenarios
  for select
  to authenticated
  using (user_id = auth.uid());

create policy strategy_lab_scenarios_insert_own
  on public.strategy_lab_scenarios
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy strategy_lab_scenarios_update_own
  on public.strategy_lab_scenarios
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy strategy_lab_scenarios_delete_own
  on public.strategy_lab_scenarios
  for delete
  to authenticated
  using (user_id = auth.uid());
