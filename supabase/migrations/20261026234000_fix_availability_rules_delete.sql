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

  insert into public.availability_rules (weekday, start_time, end_time, is_active)
  select
    (item.value->>'weekday')::smallint,
    (item.value->>'start_time')::time,
    (item.value->>'end_time')::time,
    coalesce((item.value->>'is_active')::boolean, true)
  from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) as item(value)
  where (item.value->>'weekday')::integer between 0 and 6
    and (item.value->>'start_time')::time < (item.value->>'end_time')::time;
end;
$$;

revoke all on function public.replace_availability_rules(jsonb) from public, anon;
grant execute on function public.replace_availability_rules(jsonb) to authenticated;
