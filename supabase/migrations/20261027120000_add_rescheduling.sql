alter table public.appointments
add column if not exists rescheduled_at timestamptz;

comment on column public.appointments.rescheduled_at is
  'Momento da alteração mais recente de data ou horário pelo cliente.';
