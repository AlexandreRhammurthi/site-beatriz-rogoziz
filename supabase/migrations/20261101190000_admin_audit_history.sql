create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz not null default now(),
  source_audit_id bigint references public.admin_audit_log(id) on delete set null,
  undone_at timestamptz,
  undone_by uuid,
  undo_audit_id bigint references public.admin_audit_log(id) on delete set null
);

create index admin_audit_log_changed_at_idx
on public.admin_audit_log (changed_at desc);

create index admin_audit_log_table_record_idx
on public.admin_audit_log (table_name, record_id, changed_at desc);

create or replace function public.capture_admin_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_record_id text := coalesce(v_new->>'id', v_old->>'id');
  v_source text := current_setting('studio_b.audit_source', true);
begin
  if v_actor is null or not public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  insert into public.admin_audit_log (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    changed_by,
    changed_by_email,
    source_audit_id
  ) values (
    tg_table_name,
    v_record_id,
    lower(tg_op),
    v_old,
    v_new,
    v_actor,
    nullif(auth.jwt()->>'email', ''),
    nullif(v_source, '')::bigint
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_admin_audit() from public, anon, authenticated;

create trigger services_admin_audit
after insert or update or delete on public.services
for each row execute function public.capture_admin_audit();

create trigger service_prices_admin_audit
after insert or update or delete on public.service_prices
for each row execute function public.capture_admin_audit();

create trigger booking_settings_admin_audit
after insert or update or delete on public.booking_settings
for each row execute function public.capture_admin_audit();

create trigger availability_rules_admin_audit
after insert or update or delete on public.availability_rules
for each row execute function public.capture_admin_audit();

create trigger blocked_periods_admin_audit
after insert or update or delete on public.blocked_periods
for each row execute function public.capture_admin_audit();

create trigger appointments_admin_audit
after insert or update or delete on public.appointments
for each row execute function public.capture_admin_audit();

create trigger client_packages_admin_audit
after insert or update or delete on public.client_packages
for each row execute function public.capture_admin_audit();

create trigger package_sessions_admin_audit
after insert or update or delete on public.package_sessions
for each row execute function public.capture_admin_audit();

create or replace function public.undo_admin_change(p_audit_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change public.admin_audit_log%rowtype;
  v_current jsonb;
  v_expected jsonb;
  v_restore jsonb;
  v_assignments text;
  v_undo_audit_id bigint;
  v_allowed_tables constant text[] := array[
    'services',
    'service_prices',
    'booking_settings',
    'availability_rules',
    'blocked_periods',
    'appointments',
    'client_packages',
    'package_sessions'
  ];
begin
  if not public.is_admin() then
    raise exception 'Acesso administrativo necessário.';
  end if;

  select * into v_change
  from public.admin_audit_log
  where id = p_audit_id
  for update;

  if not found then
    raise exception 'Alteração não encontrada.';
  end if;
  if v_change.undone_at is not null then
    raise exception 'Esta alteração já foi desfeita.';
  end if;
  if not (v_change.table_name = any(v_allowed_tables)) then
    raise exception 'Este tipo de alteração não pode ser desfeito.';
  end if;

  execute format(
    'select to_jsonb(target) from public.%I target where target.id::text = $1 for update',
    v_change.table_name
  ) into v_current using v_change.record_id;

  v_expected := v_change.new_data;
  if v_change.action in ('insert', 'update') and v_current is distinct from v_expected then
    raise exception 'O registro foi alterado depois desta ação. Desfaça primeiro as alterações mais recentes.';
  end if;
  if v_change.action = 'delete' and v_current is not null then
    raise exception 'Já existe um registro com o mesmo identificador.';
  end if;

  if v_change.action = 'insert' and v_change.table_name = 'services' then
    if exists (select 1 from public.service_prices where service_id::text = v_change.record_id)
      or exists (select 1 from public.appointments where service_id::text = v_change.record_id)
      or exists (select 1 from public.client_packages where service_id::text = v_change.record_id) then
      raise exception 'Remova ou desfaça primeiro os registros vinculados a este serviço.';
    end if;
  end if;

  if v_change.action = 'insert' and v_change.table_name = 'client_packages'
    and exists (select 1 from public.package_sessions where package_id::text = v_change.record_id) then
    raise exception 'Remova ou desfaça primeiro as sessões vinculadas a este pacote.';
  end if;

  perform set_config('studio_b.audit_source', p_audit_id::text, true);

  if v_change.action = 'insert' then
    execute format('delete from public.%I where id::text = $1', v_change.table_name)
    using v_change.record_id;
  elsif v_change.action = 'delete' then
    execute format(
      'insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1)',
      v_change.table_name
    ) using v_change.old_data;
  else
    v_restore := v_change.old_data;
    select string_agg(format('%1$I = restored.%1$I', attribute.attname), ', ' order by attribute.attnum)
    into v_assignments
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = format('public.%I', v_change.table_name)::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attidentity = ''
      and attribute.attgenerated = '';

    execute format(
      'update public.%1$I as target set %2$s from jsonb_populate_record(null::public.%1$I, $1) as restored where target.id::text = $2',
      v_change.table_name,
      v_assignments
    ) using v_restore, v_change.record_id;
  end if;

  select id into v_undo_audit_id
  from public.admin_audit_log
  where source_audit_id = p_audit_id
  order by id desc
  limit 1;

  update public.admin_audit_log
  set undone_at = now(),
      undone_by = auth.uid(),
      undo_audit_id = v_undo_audit_id
  where id = p_audit_id;

  if v_change.source_audit_id is not null then
    update public.admin_audit_log
    set undone_at = null,
        undone_by = null,
        undo_audit_id = null
    where id = v_change.source_audit_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'audit_id', p_audit_id,
    'inverse_audit_id', v_undo_audit_id
  );
end;
$$;

alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from public, anon, authenticated;
grant select on public.admin_audit_log to authenticated;

create policy "Admins read audit history"
on public.admin_audit_log for select
to authenticated
using (public.is_admin());

revoke all on function public.undo_admin_change(bigint) from public, anon;
grant execute on function public.undo_admin_change(bigint) to authenticated;

comment on table public.admin_audit_log is
'Append-only history of administrative data changes. Customer-facing and service-role operations are not recorded.';

comment on function public.undo_admin_change(bigint) is
'Safely reverses one administrative change only when the affected record has not changed since that action.';
