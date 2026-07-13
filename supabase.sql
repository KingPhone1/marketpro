create table if not exists public.marketpro_store (
  id text primary key,
  store_data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.marketpro_store enable row level security;

drop policy if exists "MarketPro server only" on public.marketpro_store;

create policy "MarketPro server only"
on public.marketpro_store
for all
using (false)
with check (false);

create index if not exists marketpro_store_updated_at_idx
on public.marketpro_store (updated_at desc);
