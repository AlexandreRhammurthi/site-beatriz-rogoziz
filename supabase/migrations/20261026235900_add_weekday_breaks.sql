alter table public.availability_rules
add column pause_start_time time,
add column pause_end_time time,
add constraint availability_rules_valid_pause check (
  (pause_start_time is null and pause_end_time is null)
  or (
    pause_start_time is not null
    and pause_end_time is not null
    and start_time < pause_start_time
    and pause_start_time < pause_end_time
    and pause_end_time < end_time
  )
);

create or replace function public.replace_availability_rules(p_rules jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  delete from public.availability_rules
  where id is not null;

  insert into public.availability_rules (
    weekday,
    start_time,
    end_time,
    pause_start_time,
    pause_end_time,
    is_active
  )
  select distinct
    (item.value->>'weekday')::smallint,
    (item.value->>'start_time')::time,
    (item.value->>'end_time')::time,
    nullif(item.value->>'pause_start_time', '')::time,
    nullif(item.value->>'pause_end_time', '')::time,
    coalesce((item.value->>'is_active')::boolean, true)
  from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) as item(value)
  where (item.value->>'weekday')::integer between 0 and 6
    and (item.value->>'start_time')::time < (item.value->>'end_time')::time
    and (
      (
        nullif(item.value->>'pause_start_time', '') is null
        and nullif(item.value->>'pause_end_time', '') is null
      )
      or (
        (item.value->>'start_time')::time < nullif(item.value->>'pause_start_time', '')::time
        and nullif(item.value->>'pause_start_time', '')::time < nullif(item.value->>'pause_end_time', '')::time
        and nullif(item.value->>'pause_end_time', '')::time < (item.value->>'end_time')::time
      )
    );
end;
$$;

revoke all on function public.replace_availability_rules(jsonb) from public, anon;
grant execute on function public.replace_availability_rules(jsonb) to authenticated;
