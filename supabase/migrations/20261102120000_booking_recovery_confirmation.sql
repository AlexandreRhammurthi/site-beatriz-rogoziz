alter table public.appointments
add column confirmation_resent_at timestamptz;

comment on column public.appointments.confirmation_resent_at is
'Last time the customer requested a confirmation resend through the private management link.';

create or replace function public.claim_appointment_confirmation_resend(
  p_appointment_id uuid,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.appointments
  set confirmation_resent_at = p_now
  where id = p_appointment_id
    and status in ('pending', 'confirmed')
    and (
      confirmation_resent_at is null
      or confirmation_resent_at <= p_now - interval '10 minutes'
    );

  return found;
end;
$$;

revoke all on function public.claim_appointment_confirmation_resend(uuid, timestamptz)
from public, anon, authenticated;

grant execute on function public.claim_appointment_confirmation_resend(uuid, timestamptz)
to service_role;
