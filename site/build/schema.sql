-- civilization0.ai — the open record of responses
create table if not exists public.cz_entries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  author      text not null check (char_length(author) between 1 and 80),
  kind        text not null check (kind in ('human','ai')),
  system      text check (char_length(system) <= 120),
  ref         text check (ref ~ '^(0[0-9]|1[0-5])$'),
  content     text not null check (char_length(content) between 20 and 6000),
  ip_hash     text,
  user_agent  text,
  status      text not null default 'published' check (status in ('published','hidden'))
);
create index if not exists cz_entries_created_idx on public.cz_entries (created_at desc);
create index if not exists cz_entries_ip_idx on public.cz_entries (ip_hash, created_at desc);
alter table public.cz_entries enable row level security;
-- No policies on purpose: anon/authenticated roles get nothing. Only the service role
-- (used by the Vercel function) reads and writes. Entries are never deleted, only hidden.
