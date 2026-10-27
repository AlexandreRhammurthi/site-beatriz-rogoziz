alter table public.appointments
add column if not exists attendance_status text not null default 'scheduled'
  check (attendance_status in ('scheduled', 'completed', 'no_show')),
add column if not exists admin_notes text not null default ''
  check (char_length(admin_notes) <= 2000);

comment on column public.appointments.attendance_status is
  'Acompanhamento interno do comparecimento, separado do estado da reserva.';
comment on column public.appointments.admin_notes is
  'Observações privadas acessíveis somente a administradores.';
