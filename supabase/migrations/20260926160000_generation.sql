-- Prompt-to-emoji generation: a private cache of generated images and a log
-- used for per-visitor and global daily limits. Only the generate-emoji Edge
-- Function (secret key) touches either; browsers get no access.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generation-cache', 'generation-cache', false, 5242880, array['image/png'])
on conflict (id) do nothing;

create table if not exists public.generation_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- sha256 of the visitor's IP plus the day, so raw IPs are never stored.
  visitor_hash text not null,
  cache_key text not null,
  cache_hit boolean not null,
  model text not null,
  quality text not null
);

alter table public.generation_log enable row level security;

create index if not exists generation_log_visitor_day on public.generation_log (visitor_hash, created_at);
create index if not exists generation_log_day on public.generation_log (created_at) where not cache_hit;
