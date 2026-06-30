-- Sandbox de Nós — cloud state (run this in YOUR dedicated Supabase project,
-- NOT the lab database). SQL editor → paste → Run.
--
-- One JSONB blob per user holding { disciplines, boards, prefs, counters }.
-- Row Level Security ensures each user can only read/write their own row.

create table if not exists public.sdn_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sdn_state enable row level security;

-- One policy per operation, all scoped to the authenticated owner.
drop policy if exists sdn_state_select_own on public.sdn_state;
create policy sdn_state_select_own on public.sdn_state
  for select using (auth.uid() = user_id);

drop policy if exists sdn_state_insert_own on public.sdn_state;
create policy sdn_state_insert_own on public.sdn_state
  for insert with check (auth.uid() = user_id);

drop policy if exists sdn_state_update_own on public.sdn_state;
create policy sdn_state_update_own on public.sdn_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sdn_state_delete_own on public.sdn_state;
create policy sdn_state_delete_own on public.sdn_state
  for delete using (auth.uid() = user_id);
