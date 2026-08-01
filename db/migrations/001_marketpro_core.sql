-- MarketPro normalized storage. Run this only against the staging Supabase project first.
-- Existing identifiers remain TEXT so historical data can be migrated without remapping.

create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  phone text,
  profile_image text,
  password_hash text not null,
  password_salt text not null,
  email_verified boolean not null default false,
  verification_status text not null default 'not_started',
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_private_identities (
  user_id text primary key references users(id) on delete cascade,
  encrypted_identity jsonb not null,
  document_media jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists user_sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists listings (
  id text primary key,
  seller_id text references users(id) on delete set null,
  title text not null,
  description text not null,
  price numeric(14,2) not null check (price >= 0),
  currency char(3) not null default 'UYU',
  category text not null,
  condition text not null,
  location text,
  status text not null default 'active',
  verified boolean not null default false,
  posted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_active_search_idx on listings (status, category, posted_at desc);
create index if not exists listings_seller_idx on listings (seller_id, posted_at desc);

create table if not exists listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references listings(id) on delete cascade,
  storage_path text not null,
  is_cover boolean not null default false,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);

create table if not exists favorites (
  user_id text not null references users(id) on delete cascade,
  listing_id text not null references listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table if not exists conversations (
  id text primary key,
  listing_id text references listings(id) on delete set null,
  order_id text,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists conversation_participants (
  conversation_id text not null references conversations(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  sender_id text references users(id) on delete set null,
  body text,
  attachment jsonb,
  risk jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists messages_conversation_created_idx on messages (conversation_id, created_at);

create table if not exists orders (
  id text primary key,
  listing_id text references listings(id) on delete set null,
  buyer_id text references users(id) on delete set null,
  seller_id text references users(id) on delete set null,
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'UYU',
  status text not null,
  snapshot jsonb not null,
  delivery jsonb not null default '{}'::jsonb,
  security jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_buyer_created_idx on orders (buyer_id, created_at desc);
create index if not exists orders_seller_created_idx on orders (seller_id, created_at desc);

create table if not exists payments (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  provider text not null default 'mercadopago',
  external_reference text,
  preference_id text,
  provider_payment_id text,
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'UYU',
  status text not null default 'pending',
  raw_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

create table if not exists disputes (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  opened_by text references users(id) on delete set null,
  status text not null,
  reason text,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists reports (
  id text primary key,
  reporter_id text references users(id) on delete set null,
  subject_type text not null,
  subject_id text not null,
  status text not null default 'open',
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists audit_events (
  id text primary key,
  actor_id text references users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create table if not exists migration_runs (
  id uuid primary key default gen_random_uuid(),
  source_hash text not null,
  source_counts jsonb not null,
  target text not null check (target in ('staging', 'production')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table users enable row level security;
alter table user_private_identities enable row level security;
alter table user_sessions enable row level security;
alter table listings enable row level security;
alter table listing_images enable row level security;
alter table favorites enable row level security;
alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;
alter table orders enable row level security;
alter table payments enable row level security;
alter table disputes enable row level security;
alter table reports enable row level security;
alter table audit_events enable row level security;
alter table migration_runs enable row level security;

-- No browser role receives data by default. The server uses its private service role.
