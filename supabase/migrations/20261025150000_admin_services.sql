create extension if not exists pgcrypto with schema extensions;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table public.admin_bootstrap (
  code_hash text primary key,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  subtitle text not null default '',
  description text not null default '',
  duration_label text not null default '',
  whatsapp_message text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_prices (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  label text not null,
  price_amount numeric(10, 2) check (price_amount >= 0),
  custom_value text,
  is_promotional boolean not null default false,
  original_price numeric(10, 2) check (original_price >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_prices_has_value check (
    price_amount is not null or nullif(btrim(custom_value), '') is not null
  )
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger services_set_updated_at
before update on public.services
for each row execute function public.set_updated_at();

create trigger service_prices_set_updated_at
before update on public.service_prices
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

create or replace function public.claim_first_admin(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code_hash text := encode(extensions.digest(p_code, 'sha256'), 'hex');
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  perform 1
  from public.admin_bootstrap
  where code_hash = v_code_hash and claimed_at is null
  for update;

  if not found or exists (select 1 from public.admin_users) then
    return false;
  end if;

  insert into public.admin_users (user_id, created_by)
  values (v_user_id, v_user_id);

  update public.admin_bootstrap
  set claimed_at = now()
  where code_hash = v_code_hash;

  return true;
end;
$$;

create or replace function public.replace_service_prices(p_service_id uuid, p_prices jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  if not exists (select 1 from public.services where id = p_service_id) then
    raise exception 'Service not found';
  end if;

  delete from public.service_prices where service_id = p_service_id;

  insert into public.service_prices (
    id,
    service_id,
    label,
    price_amount,
    custom_value,
    is_promotional,
    original_price,
    sort_order,
    is_active
  )
  select
    coalesce(nullif(item.value->>'id', '')::uuid, gen_random_uuid()),
    p_service_id,
    btrim(item.value->>'label'),
    nullif(item.value->>'price_amount', '')::numeric,
    nullif(btrim(item.value->>'custom_value'), ''),
    coalesce((item.value->>'is_promotional')::boolean, false),
    nullif(item.value->>'original_price', '')::numeric,
    coalesce((item.value->>'sort_order')::integer, item.ordinality::integer - 1),
    coalesce((item.value->>'is_active')::boolean, true)
  from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb)) with ordinality as item(value, ordinality)
  where nullif(btrim(item.value->>'label'), '') is not null
    and (
      nullif(item.value->>'price_amount', '') is not null
      or nullif(btrim(item.value->>'custom_value'), '') is not null
    );
end;
$$;

alter table public.admin_users enable row level security;
alter table public.admin_bootstrap enable row level security;
alter table public.services enable row level security;
alter table public.service_prices enable row level security;

revoke all on public.admin_bootstrap from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;

grant select on public.services, public.service_prices to anon, authenticated;
grant insert, update, delete on public.services, public.service_prices to authenticated;

revoke all on function public.claim_first_admin(text) from public, anon;
grant execute on function public.claim_first_admin(text) to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
revoke all on function public.replace_service_prices(uuid, jsonb) from public, anon;
grant execute on function public.replace_service_prices(uuid, jsonb) to authenticated;

create policy "Public reads active services"
on public.services for select
to anon, authenticated
using (is_active or public.is_admin());

create policy "Admins manage services"
on public.services for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Public reads active prices"
on public.service_prices for select
to anon, authenticated
using (
  public.is_admin()
  or (
    is_active
    and exists (
      select 1 from public.services
      where services.id = service_prices.service_id
        and services.is_active
    )
  )
);

create policy "Admins manage prices"
on public.service_prices for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins read own membership"
on public.admin_users for select
to authenticated
using (user_id = auth.uid());

insert into public.admin_bootstrap (code_hash)
values ('ff371c4c0dad27676c1e360591d2f4cdf5bc93abcf44dc41ca95d0e25938a4a4');

insert into public.services (
  id, slug, name, subtitle, description, duration_label, whatsapp_message, sort_order
) values
  (
    '9ef8a3ef-58d2-4f1e-a19d-32e0af88b101',
    'drenagem-linfatica',
    'Drenagem linfática',
    'Leveza e cuidado em cada sessão',
    'Técnica suave com movimentos precisos que estimula o fluxo linfático, reduz o inchaço, elimina toxinas e proporciona uma sensação imediata de leveza corporal.',
    'Duração: 1 hora',
    'Olá, Beatriz! Gostaria de agendar uma sessão de Drenagem Linfática no Studio B. Quais os horários disponíveis?',
    1
  ),
  (
    '9ef8a3ef-58d2-4f1e-a19d-32e0af88b102',
    'relax',
    'Relax',
    'Massagem terapêutica com aromaterapia',
    'Combina toques terapêuticos envolventes com o poder dos óleos essenciais, aliviando tensões musculares, dissolvendo o estresse e restaurando a harmonia entre corpo e mente.',
    'Duração: 1 hora',
    'Olá, Beatriz! Gostaria de agendar uma massagem Relax com aromaterapia no Studio B. Quais os horários disponíveis?',
    2
  ),
  (
    '9ef8a3ef-58d2-4f1e-a19d-32e0af88b103',
    'fitness',
    'Fitness',
    'Massagem modeladora',
    'Manobras firmes e ritmadas focadas na ativação da circulação sanguínea, oxigenação tecidual, auxílio na redução de medidas e definição das curvas corporais.',
    'Duração: 40 minutos',
    'Olá, Beatriz! Gostaria de agendar uma massagem modeladora Fitness no Studio B. Quais os horários disponíveis?',
    3
  ),
  (
    '9ef8a3ef-58d2-4f1e-a19d-32e0af88b104',
    'limpeza-de-pele',
    'Limpeza de pele',
    'Renovação e cuidado facial profundo',
    'Higienização profunda com extração cuidadosa, desobstrução dos poros e hidratação intensa, devolvendo viço, frescor e equilíbrio natural à pele.',
    'Duração: 40 minutos',
    'Olá, Beatriz! Gostaria de agendar uma sessão de Limpeza de Pele no Studio B. Quais os horários disponíveis?',
    4
  );

insert into public.service_prices (
  service_id, label, price_amount, custom_value, is_promotional, sort_order
) values
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b101', 'Sessão avulsa', 99.00, null, false, 1),
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b101', 'Pacote com 5 sessões', 399.00, null, false, 2),
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b101', 'Pacote com 10 sessões', 699.00, null, false, 3),
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b102', 'Sessão avulsa', 99.00, null, false, 1),
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b102', 'Pacote com 5 sessões', 333.00, null, false, 2),
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b103', 'Sessão avulsa', 99.00, null, false, 1),
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b103', 'Pacote com 4 sessões', 333.00, null, false, 2),
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b103', 'Pacote com 8 sessões', 660.00, null, false, 3),
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b104', 'Sessão', 145.00, null, true, 1),
  ('9ef8a3ef-58d2-4f1e-a19d-32e0af88b104', 'Pacotes', null, 'A consultar', false, 2);
