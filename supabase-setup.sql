-- ZIP Arcade - configuração do catálogo compartilhado
-- Execute no SQL Editor do projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  storage_path text not null,
  version integer not null default 1,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.games add column if not exists description text default '';
alter table public.games add column if not exists storage_path text;
alter table public.games add column if not exists version integer not null default 1;
alter table public.games add column if not exists published boolean not null default false;
alter table public.games add column if not exists created_at timestamptz not null default now();
alter table public.games add column if not exists updated_at timestamptz not null default now();

alter table public.games enable row level security;

grant select on public.games to anon, authenticated;

drop policy if exists "Anyone can view published games" on public.games;
create policy "Anyone can view published games"
on public.games
for select
to anon, authenticated
using (published = true);
