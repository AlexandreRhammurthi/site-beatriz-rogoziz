alter table public.booking_settings
add column if not exists buffer_minutes integer not null default 0
  check (buffer_minutes between 0 and 180),
add column if not exists daily_booking_limit integer not null default 0
  check (daily_booking_limit between 0 and 50);

comment on column public.booking_settings.buffer_minutes is
  'Intervalo mínimo de preparação antes e depois de períodos ocupados.';
comment on column public.booking_settings.daily_booking_limit is
  'Quantidade máxima de agendamentos do site por dia; zero significa sem limite.';
