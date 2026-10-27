alter table public.booking_settings
add column if not exists reminders_enabled boolean not null default false,
add column if not exists reminder_hours_before integer not null default 24
  check (reminder_hours_before between 1 and 168);

alter table public.appointments
add column if not exists reminder_attempted_at timestamptz,
add column if not exists reminder_sent_at timestamptz;

create or replace function public.claim_due_appointment_reminders(
  p_now timestamptz default now(),
  p_limit integer default 50
)
returns table (
  id uuid,
  customer_name text,
  customer_email text,
  starts_at timestamptz,
  service_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select appointment.id
    from public.appointments as appointment
    cross join public.booking_settings as settings
    where settings.id = true
      and settings.reminders_enabled = true
      and appointment.status = 'confirmed'
      and appointment.reminder_sent_at is null
      and (
        appointment.reminder_attempted_at is null
        or appointment.reminder_attempted_at < p_now - interval '30 minutes'
      )
      and appointment.starts_at >= p_now + make_interval(hours => settings.reminder_hours_before)
      and appointment.starts_at < p_now + make_interval(hours => settings.reminder_hours_before) + interval '10 minutes'
    order by appointment.starts_at
    for update of appointment skip locked
    limit least(greatest(p_limit, 1), 100)
  ), claimed as (
    update public.appointments as appointment
    set reminder_attempted_at = p_now
    from due
    where appointment.id = due.id
    returning appointment.id, appointment.customer_name, appointment.customer_email,
      appointment.starts_at, appointment.service_id
  )
  select claimed.id, claimed.customer_name, claimed.customer_email,
    claimed.starts_at, service.name
  from claimed
  join public.services as service on service.id = claimed.service_id;
end;
$$;

revoke all on function public.claim_due_appointment_reminders(timestamptz, integer)
from public, anon, authenticated;
grant execute on function public.claim_due_appointment_reminders(timestamptz, integer)
to service_role;
