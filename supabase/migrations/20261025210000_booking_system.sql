create extension if not exists btree_gist with schema extensions;

alter table public.services
add column duration_minutes integer;

update public.services
set duration_minutes = case slug
  when 'drenagem-linfatica' then 60
  when 'relax' then 60
  when 'fitness' then 40
  when 'limpeza-de-pele' then 40
  else 60
end;

alter table public.services
alter column duration_minutes set default 60,
alter column duration_minutes set not null,
add constraint services_duration_minutes_check check (duration_minutes between 10 and 480);

create table public.booking_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'America/Sao_Paulo',
  booking_horizon_days integer not null default 45 check (booking_horizon_days between 1 and 365),
  minimum_notice_hours integer not null default 12 check (minimum_notice_hours between 0 and 720),
  cancellation_notice_hours integer not null default 12 check (cancellation_notice_hours between 0 and 720),
  slot_interval_minutes integer not null default 20 check (slot_interval_minutes between 5 and 120),
  booking_enabled boolean not null default false,
  calendar_label text not null default 'Studio B - Beatriz Rogoziz',
  updated_at timestamptz not null default now()
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_rules_valid_period check (start_time < end_time),
  constraint availability_rules_unique_period unique (weekday, start_time, end_time)
);

create table public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint blocked_periods_valid_period check (starts_at < ends_at)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  calendar_sync_requested boolean not null default false,
  google_event_id text unique,
  manage_token_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint appointments_valid_period check (starts_at < ends_at),
  constraint appointments_email_normalized check (customer_email = lower(btrim(customer_email))),
  constraint appointments_phone_normalized check (customer_phone ~ '^[0-9]{10,13}$'),
  constraint appointments_no_overlap exclude using gist (
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed'))
);

create table public.booking_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 10),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index appointments_customer_lookup_idx
on public.appointments (customer_email, customer_phone, starts_at)
where status in ('pending', 'confirmed');

create index appointments_upcoming_idx
on public.appointments (starts_at)
where status in ('pending', 'confirmed');

create index recovery_codes_appointment_idx
on public.booking_recovery_codes (appointment_id, created_at desc);

create trigger booking_settings_set_updated_at
before update on public.booking_settings
for each row execute function public.set_updated_at();

create trigger availability_rules_set_updated_at
before update on public.availability_rules
for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

alter table public.booking_settings enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blocked_periods enable row level security;
alter table public.appointments enable row level security;
alter table public.booking_recovery_codes enable row level security;

grant select, insert, update, delete on public.booking_settings to authenticated;
grant select, insert, update, delete on public.availability_rules to authenticated;
grant select, insert, update, delete on public.blocked_periods to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
revoke all on public.booking_recovery_codes from anon, authenticated;

create policy "Admins manage booking settings"
on public.booking_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins manage availability rules"
on public.availability_rules for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins manage blocked periods"
on public.blocked_periods for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins manage appointments"
on public.appointments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.replace_availability_rules(p_rules jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  delete from public.availability_rules;

  insert into public.availability_rules (weekday, start_time, end_time, is_active)
  select
    (item.value->>'weekday')::smallint,
    (item.value->>'start_time')::time,
    (item.value->>'end_time')::time,
    coalesce((item.value->>'is_active')::boolean, true)
  from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) as item(value)
  where (item.value->>'weekday')::integer between 0 and 6
    and (item.value->>'start_time')::time < (item.value->>'end_time')::time;
end;
$$;

revoke all on function public.replace_availability_rules(jsonb) from public, anon;
grant execute on function public.replace_availability_rules(jsonb) to authenticated;

insert into public.booking_settings (id) values (true);
