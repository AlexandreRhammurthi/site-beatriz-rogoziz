alter table public.appointments
add column if not exists booking_source text not null default 'online';

alter table public.appointments
drop constraint if exists appointments_booking_source_check;

alter table public.appointments
add constraint appointments_booking_source_check
check (booking_source in ('online', 'admin'));

comment on column public.appointments.booking_source is
  'Origem do agendamento: fluxo público online ou lançamento manual administrativo.';
