create extension if not exists pgcrypto;

create table public.business_requests (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('adintecho', 'adelpro')),
  request_type text not null check (request_type in ('lead', 'contact', 'emergency')),
  idempotency_key uuid not null,
  name text,
  email text,
  phone text,
  plan text,
  service_type text,
  preferred_date date,
  county text,
  issue_class text,
  message text,
  consent boolean not null default false,
  status text not null default 'new' check (status in ('new', 'acknowledged', 'in_progress', 'closed', 'spam')),
  source text not null,
  ip_hash text,
  user_agent_hash text,
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sent', 'failed', 'not_configured')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, idempotency_key),
  check (name is null or char_length(name) between 1 and 120),
  check (email is null or char_length(email) between 3 and 254),
  check (phone is null or char_length(phone) between 7 and 30),
  check (message is null or char_length(message) <= 4000),
  check (plan is null or char_length(plan) <= 80),
  check (service_type is null or char_length(service_type) <= 100),
  check (county is null or county in ('Los Angeles', 'Orange')),
  check (
    (brand = 'adintecho' and request_type in ('lead', 'contact'))
    or
    (brand = 'adelpro' and request_type in ('contact', 'emergency'))
  )
);

create table public.request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.business_requests(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'notification_sent', 'notification_failed', 'status_changed')),
  provider text,
  provider_message_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index business_requests_brand_created_idx
  on public.business_requests (brand, created_at desc);
create index business_requests_status_created_idx
  on public.business_requests (status, created_at desc);
create index business_requests_ip_created_idx
  on public.business_requests (ip_hash, created_at desc)
  where ip_hash is not null;
create index request_events_request_created_idx
  on public.request_events (request_id, created_at);

alter table public.business_requests enable row level security;
alter table public.business_requests force row level security;
alter table public.request_events enable row level security;
alter table public.request_events force row level security;

revoke all on public.business_requests from anon, authenticated;
revoke all on public.request_events from anon, authenticated;
revoke all on sequence public.request_events_id_seq from anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger business_requests_set_updated_at
before update on public.business_requests
for each row execute function public.set_updated_at();
