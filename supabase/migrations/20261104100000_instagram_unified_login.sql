alter table public.instagram_connections
  add column if not exists auth_method text not null default 'instagram_login',
  add column if not exists client_business_id text;

alter table public.instagram_connections
  drop constraint if exists instagram_connections_auth_method_check;

alter table public.instagram_connections
  add constraint instagram_connections_auth_method_check
  check (auth_method in ('instagram_login', 'unified_login'));

comment on column public.instagram_connections.auth_method is
  'Fluxo OAuth usado pela conexão: legado Instagram Login ou Meta Unified Login.';
comment on column public.instagram_connections.client_business_id is
  'Identificador do portfólio empresarial retornado pelo Meta Unified Login.';
