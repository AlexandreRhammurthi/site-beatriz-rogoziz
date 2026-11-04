create table if not exists public.instagram_connections (
  id boolean primary key default true check (id),
  instagram_user_id text not null,
  username text not null,
  display_name text,
  token_ciphertext text not null,
  token_iv text not null,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_oauth_states (
  state_hash text primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.instagram_connections enable row level security;
alter table public.instagram_oauth_states enable row level security;

revoke all on table public.instagram_connections from anon, authenticated;
revoke all on table public.instagram_oauth_states from anon, authenticated;
grant all on table public.instagram_connections to service_role;
grant all on table public.instagram_oauth_states to service_role;

create index if not exists instagram_oauth_states_expires_at_idx
  on public.instagram_oauth_states (expires_at);

comment on table public.instagram_connections is
  'Conexão privada do Instagram. O token é cifrado pela Edge Function e nunca é exposto ao navegador.';
comment on table public.instagram_oauth_states is
  'Estados OAuth descartáveis e de curta duração usados para impedir falsificação de requisições.';
