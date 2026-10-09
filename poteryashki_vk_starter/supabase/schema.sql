-- Initial schema for Poteryashki.
-- Apply in Supabase SQL Editor, then configure authentication/RLS before public deployment.
create extension if not exists pgcrypto;

create table if not exists public.managers (
  vk_user_id text primary key,
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('found', 'missing')),
  branch text not null check (branch in ('sovetskaya', 'titova')),
  title text not null,
  description text,
  found_date date,
  handover_date date,
  status text not null default 'open' check (status in ('open','searching','matched','transferred','closed','handed_over')),
  image_url text,
  author_vk_id text,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records(id) on delete cascade,
  claimant_vk_id text,
  claimant_name text,
  status text not null default 'new' check (status in ('new','seen','resolved','rejected')),
  created_at timestamptz not null default now(),
  unique (record_id, claimant_vk_id)
);

create index if not exists records_branch_idx on public.records(branch);
create index if not exists records_type_status_idx on public.records(type, status);
create index if not exists claims_record_idx on public.claims(record_id);

-- IMPORTANT:
-- Do not enable write access for anon users in production.
-- Implement server-side authorization that verifies VK identity and checks public.managers.
-- Add Row Level Security policies only after deciding whether browsing is public or staff-only.
