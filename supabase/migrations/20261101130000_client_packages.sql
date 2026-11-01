create table public.client_packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete restrict,
  service_price_id uuid references public.service_prices(id) on delete set null,
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 100),
  customer_email text not null,
  customer_phone text not null,
  package_label text not null check (char_length(btrim(package_label)) between 2 and 160),
  total_sessions integer not null check (total_sessions between 1 and 100),
  price_amount numeric(10, 2) check (price_amount is null or price_amount >= 0),
  purchased_on date not null default current_date,
  expires_on date,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_packages_email_normalized check (customer_email = lower(btrim(customer_email))),
  constraint client_packages_phone_normalized check (customer_phone ~ '^[0-9]{10,13}$'),
  constraint client_packages_valid_expiry check (expires_on is null or expires_on >= purchased_on)
);

alter table public.appointments
add column if not exists client_package_id uuid
references public.client_packages(id) on delete set null;

create table public.package_sessions (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.client_packages(id) on delete cascade,
  appointment_id uuid unique references public.appointments(id) on delete cascade,
  session_date timestamptz not null,
  attendance_status text not null default 'scheduled'
    check (attendance_status in ('scheduled', 'completed', 'no_show', 'cancelled')),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_packages_customer_idx
on public.client_packages (customer_email, customer_phone);

create index client_packages_service_idx
on public.client_packages (service_id, expires_on);

create index package_sessions_package_date_idx
on public.package_sessions (package_id, session_date desc);

create trigger client_packages_set_updated_at
before update on public.client_packages
for each row execute function public.set_updated_at();

create trigger package_sessions_set_updated_at
before update on public.package_sessions
for each row execute function public.set_updated_at();

create or replace function public.validate_package_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_package public.client_packages%rowtype;
  v_reserved integer;
  v_appointment_service uuid;
begin
  select * into v_package
  from public.client_packages
  where id = new.package_id;

  if not found then
    raise exception 'Package not found';
  end if;

  if new.appointment_id is not null then
    select service_id into v_appointment_service
    from public.appointments
    where id = new.appointment_id;

    if v_appointment_service is distinct from v_package.service_id then
      raise exception 'The appointment service does not match the package';
    end if;
  end if;

  if new.attendance_status in ('scheduled', 'completed') then
    if v_package.expires_on is not null
      and (new.session_date at time zone 'America/Sao_Paulo')::date > v_package.expires_on then
      raise exception 'The session is after the package expiration date';
    end if;

    select count(*) into v_reserved
    from public.package_sessions
    where package_id = new.package_id
      and attendance_status in ('scheduled', 'completed')
      and id is distinct from new.id;

    if v_reserved >= v_package.total_sessions then
      raise exception 'The package has no remaining sessions';
    end if;
  end if;

  return new;
end;
$$;

create trigger package_sessions_validate
before insert or update on public.package_sessions
for each row execute function public.validate_package_session();

create or replace function public.validate_package_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved integer;
  v_last_reserved_date date;
  v_price_service uuid;
begin
  if new.service_price_id is not null then
    select service_id into v_price_service
    from public.service_prices
    where id = new.service_price_id;

    if v_price_service is distinct from new.service_id then
      raise exception 'The selected price does not match the package service';
    end if;
  end if;

  select count(*), max((session_date at time zone 'America/Sao_Paulo')::date)
  into v_reserved, v_last_reserved_date
  from public.package_sessions
  where package_id = new.id
    and attendance_status in ('scheduled', 'completed');

  if new.total_sessions < v_reserved then
    raise exception 'Total sessions cannot be lower than scheduled or completed sessions';
  end if;

  if new.expires_on is not null and v_last_reserved_date > new.expires_on then
    raise exception 'Expiration cannot be earlier than a scheduled or completed session';
  end if;

  return new;
end;
$$;

create trigger client_packages_validate_capacity
before insert or update on public.client_packages
for each row execute function public.validate_package_capacity();

create or replace function public.sync_package_session_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_status text;
begin
  if old.client_package_id is not null
    and old.client_package_id is distinct from new.client_package_id then
    delete from public.package_sessions where appointment_id = new.id;
  end if;

  if new.client_package_id is null then
    delete from public.package_sessions where appointment_id = new.id;
    return new;
  end if;

  v_session_status := case
    when new.status = 'cancelled' then 'cancelled'
    when new.attendance_status = 'completed' then 'completed'
    when new.attendance_status = 'no_show' then 'no_show'
    else 'scheduled'
  end;

  insert into public.package_sessions (
    package_id,
    appointment_id,
    session_date,
    attendance_status
  ) values (
    new.client_package_id,
    new.id,
    new.starts_at,
    v_session_status
  )
  on conflict (appointment_id) do update set
    package_id = excluded.package_id,
    session_date = excluded.session_date,
    attendance_status = excluded.attendance_status;

  return new;
end;
$$;

create trigger appointments_sync_package_session
after insert or update of client_package_id, starts_at, status, attendance_status
on public.appointments
for each row execute function public.sync_package_session_from_appointment();

alter table public.client_packages enable row level security;
alter table public.package_sessions enable row level security;

grant select, insert, update, delete on public.client_packages to authenticated;
grant select, insert, update, delete on public.package_sessions to authenticated;
revoke all on public.client_packages, public.package_sessions from anon;

create policy "Admins manage client packages"
on public.client_packages for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins manage package sessions"
on public.package_sessions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

comment on table public.client_packages is
  'Pacotes contratados por clientes, com quantidade, valor, compra e validade.';
comment on table public.package_sessions is
  'Histórico de sessões vinculadas ou registradas manualmente para cada pacote.';
