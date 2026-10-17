begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Shared HR classification catalogues only. No business employee mapping,
-- salary policy, role grant, read policy or shared-cache framework is changed.
create function erp_private.hr_lookup_tables() returns text[]
language sql immutable set search_path='' as $$ select array[
 'hr_employee_categories','hr_employment_types','hr_grades','hr_identity_document_types',
 'hr_access_card_types','hr_training_categories','hr_training_types','hr_medical_record_types',
 'hr_leave_types','hr_relationship_types','hr_salary_component_types','hr_payroll_groups','hr_pro_process_types']::text[] $$;
alter function erp_private.hr_lookup_tables() owner to postgres;
revoke all on function erp_private.hr_lookup_tables() from public,anon,authenticated,service_role;

create function erp_private.hr_lookup_fields(t text) returns text[]
language plpgsql immutable set search_path='' as $$
declare extra text[];
begin
 if not t=any(erp_private.hr_lookup_tables()) then raise exception 'Unsupported HR catalogue' using errcode='22023';end if;
 extra:=case t
 when 'hr_grades' then array['grade_level']
 when 'hr_identity_document_types' then array['requires_issue_date','requires_expiry_date','requires_document_number','default_expiry_alert_days','is_government_document','is_sensitive']
 when 'hr_access_card_types' then array['default_expiry_alert_days','scope_type','requires_work_site','requires_client_authority']
 when 'hr_training_types' then array['training_category_id','default_validity_months','default_expiry_alert_days','requires_certificate_number','requires_provider','is_site_required','is_designation_required']
 when 'hr_medical_record_types' then array['default_validity_months','default_expiry_alert_days','is_confidential','requires_dms_document']
 when 'hr_leave_types' then array['is_paid','requires_document','requires_approval','default_entitlement_days','reset_basis','allow_half_day']
 when 'hr_salary_component_types' then array['component_kind','is_basic','is_wps_component','is_taxable']
 when 'hr_payroll_groups' then array['pay_frequency','wps_applicable_default']
 when 'hr_pro_process_types' then array['default_due_days','default_expiry_alert_days','requires_dms_document']
 else array[]::text[] end;
 return array['code','name_en','name_ar','description','is_active','sort_order']||extra;
end$$;
alter function erp_private.hr_lookup_fields(text) owner to postgres;
revoke all on function erp_private.hr_lookup_fields(text) from public,anon,authenticated,service_role;

-- Validate owner/service writes too; never rewrite existing catalogue data in a migration.
create function erp_private.validate_hr_lookup() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 k text; dep record; in_use boolean;
begin
 perform erp_private.hr_lookup_fields(TG_TABLE_NAME);
 if TG_OP='UPDATE' and new.code is distinct from old.code then raise exception 'HR catalogue code is immutable' using errcode='22023';end if;
 if TG_OP='INSERT' and (new.code is null or new.code !~ '^[A-Z0-9_-]{1,50}$') then raise exception 'Invalid HR catalogue code' using errcode='22023';end if;
 new.name_en:=btrim(new.name_en);
 if new.name_en is null or length(new.name_en) not between 1 and 200
  or coalesce(length(new.name_ar),0)>200 or coalesce(length(new.description),0)>1000
  or new.sort_order is null or new.sort_order not between 0 and 9999 then raise exception 'Invalid HR catalogue fields' using errcode='22023';end if;
 foreach k in array array['grade_level','default_validity_months','default_due_days','default_expiry_alert_days'] loop
  if n->>k is not null and (TG_OP='INSERT' or n->k is distinct from o->k) and
   ((n->>k)::numeric<1 or (k='default_expiry_alert_days' and (n->>k)::numeric>365)) then raise exception 'Invalid HR duration or level' using errcode='22023';end if;
 end loop;
 if n->>'default_entitlement_days' is not null and (TG_OP='INSERT' or n->'default_entitlement_days' is distinct from o->'default_entitlement_days')
  and ((n->>'default_entitlement_days')::numeric not between 0 and 365) then raise exception 'Invalid entitlement days' using errcode='22023';end if;
 if new.deleted_at is not null and new.is_active then raise exception 'Archived HR catalogue must be inactive' using errcode='22023';end if;
 -- Referenced rows remain intact; current dependent rows must be retired/reassigned first.
 if TG_OP='UPDATE' and ((old.is_active and not new.is_active) or (old.deleted_at is null and new.deleted_at is not null)) then
  for dep in select ns.nspname,cl.relname,a.attname from pg_constraint c
   join pg_class cl on cl.oid=c.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.confrelid=TG_RELID and array_length(c.conkey,1)=1 loop
   execute format('select exists(select 1 from %I.%I d where d.%I=$1 and to_jsonb(d)->>''deleted_at'' is null and coalesce(to_jsonb(d)->>''is_active'',''true'')<>''false'')',dep.nspname,dep.relname,dep.attname) into in_use using new.id;
   if in_use then raise exception 'HR catalogue has current dependencies' using errcode='23503';end if;
  end loop;
 end if;
 return new;
end$$;
alter function erp_private.validate_hr_lookup() owner to postgres;
revoke all on function erp_private.validate_hr_lookup() from public,anon,authenticated,service_role;

create function erp_private.validate_hr_lookup_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 parent_table text:=TG_ARGV[0];field text:=TG_ARGV[1];parent jsonb;
begin
 perform erp_private.hr_lookup_fields(parent_table);
 if n->>field is null or n->>'deleted_at' is not null or n->>'is_active'='false' then return new;end if;
 if TG_OP='UPDATE' and n->field is not distinct from o->field and o->>'deleted_at' is null and coalesce(o->>'is_active','true')<>'false' then return new;end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for share',parent_table) into parent using (n->>field)::bigint;
 if parent is null or parent->>'is_active'<>'true' or parent->>'deleted_at' is not null then raise exception 'Choose an active HR catalogue record' using errcode='23503';end if;
 return new;
end$$;
alter function erp_private.validate_hr_lookup_reference() owner to postgres;
revoke all on function erp_private.validate_hr_lookup_reference() from public,anon,authenticated,service_role;

do $$declare t text; dep record; existing text;
begin
 foreach t in array erp_private.hr_lookup_tables() loop
  execute format('alter table public.%I add column workspace_revision bigint not null default 1',t);
  execute format('create trigger f06_hr_lookup_revision before insert or update on public.%I for each row execute function erp_private.workspace_revision()',t);
  execute format('create trigger f06_hr_lookup_integrity before insert or update on public.%I for each row execute function erp_private.validate_hr_lookup()',t);
  -- The authenticated API must use the audited transaction, never direct CRUD.
  execute format('revoke insert,update,delete on public.%I from public,anon,authenticated',t);
  for dep in select ns.nspname,cl.relname,a.attname,c.oid from pg_constraint c
   join pg_class cl on cl.oid=c.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.confrelid=format('public.%I',t)::regclass and array_length(c.conkey,1)=1 loop
   execute format('create trigger %I before insert or update on %I.%I for each row execute function erp_private.validate_hr_lookup_reference(%L,%L)',
    'f06_hr_ref_'||substr(md5(dep.nspname||'.'||dep.relname||'.'||dep.attname),1,24),dep.nspname,dep.relname,t,dep.attname);
  end loop;
 end loop;
 select pg_get_expr(conbin,conrelid) into existing from pg_constraint
  where conrelid='erp_private.master_lifecycle_receipts'::regclass and conname='master_lifecycle_receipts_entity_check';
 if existing is null then raise exception 'Expected lifecycle receipt constraint unavailable';end if;
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute format('alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check ((%s) or entity=any(%L::text[]))',existing,erp_private.hr_lookup_tables());
end$$;

create function erp_private.save_hr_lookup(p_table text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb,p_action text default 'save')
returns jsonb language plpgsql security definer set search_path='' as $$
declare allowed text[];payload jsonb:=p_data;prior jsonb;saved jsonb;candidate jsonb;receipt erp_private.master_lifecycle_receipts%rowtype;
 h text;k text;cols text;vals text;assigns text;actor bigint;changed boolean;result jsonb;meta record;
begin
 if auth.uid() is null or not erp_private.business_principal_is_active() or not public.current_user_can_manage_hr_settings() then
  raise exception 'Global HR configuration permission required' using errcode='42501';end if;
 allowed:=erp_private.hr_lookup_fields(p_table);actor:=public.current_user_profile_id();
 if p_operation is null or p_action not in ('save','archive','restore') or p_action is null
  or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000
  or (p_id is null and (p_revision is not null or p_action<>'save'))
  or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1))
  or (p_action='save' and p_data='{}'::jsonb) or (p_action<>'save' and p_data<>'{}'::jsonb)
  or exists(select 1 from jsonb_object_keys(p_data) f where not f=any(allowed)) then raise exception 'Invalid HR save contract' using errcode='22023';end if;
 -- JSON must match actual column types. PostgreSQL's permissive text/boolean and
 -- fractional-to-integer casts must not silently change the requested values.
 for meta in select e.key,e.value,c.data_type,c.is_nullable,c.numeric_scale from jsonb_each(p_data) e join information_schema.columns c
  on c.table_schema='public' and c.table_name=p_table and c.column_name=e.key loop
  if jsonb_typeof(meta.value)='null' then
   if meta.is_nullable='NO' then raise exception 'Required HR value missing' using errcode='22023';end if;
  elsif (meta.data_type='boolean' and jsonb_typeof(meta.value)<>'boolean')
   or (meta.data_type='text' and jsonb_typeof(meta.value)<>'string')
   or (meta.data_type in ('integer','bigint','numeric') and jsonb_typeof(meta.value)<>'number') then raise exception 'Invalid HR field type' using errcode='22023';
  elsif meta.data_type in ('integer','bigint') and (meta.value#>>'{}')::numeric<>trunc((meta.value#>>'{}')::numeric) then raise exception 'Whole number required' using errcode='22023';
  elsif meta.data_type='numeric' and meta.numeric_scale is not null and (meta.value#>>'{}')::numeric<>round((meta.value#>>'{}')::numeric,meta.numeric_scale) then raise exception 'Unsupported decimal precision' using errcode='22023';end if;
 end loop;
 h:=encode(sha256(convert_to(jsonb_build_array(p_table,p_action,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('f06-master-lifecycle:'||auth.uid()::text||':'||p_operation::text,0));
 select m.* into receipt from erp_private.master_lifecycle_receipts m where m.actor=auth.uid() and m.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 for update',p_table) into prior using p_id;
  if prior is null or (p_action='save' and prior->>'deleted_at' is not null) then raise exception 'HR record unavailable' using errcode='PT404';end if;
  if (prior->>'workspace_revision')::bigint<>p_revision then raise exception 'HR record changed' using errcode='PT409';end if;
  if p_data?'code' and p_data->>'code' is distinct from prior->>'code' then raise exception 'HR catalogue code is immutable' using errcode='22023';end if;
 end if;
 foreach k in array array['name_en','name_ar','description','establishment_name','rule_name_en','rule_name_ar','workflow_name_en','workflow_name_ar','notes'] loop
  if jsonb_typeof(payload->k)='string' then payload:=jsonb_set(payload,array[k],case when k in ('name_en','establishment_name','rule_name_en','workflow_name_en') then to_jsonb(btrim(payload->>k)) else coalesce(to_jsonb(nullif(btrim(payload->>k),'')),'null'::jsonb) end);end if;
 end loop;
 if p_id is null then
  foreach k in array array['establishment_number','rule_code','workflow_code'] loop
   if jsonb_typeof(payload->k)='string' then payload:=jsonb_set(payload,array[k],to_jsonb(btrim(payload->>k)));end if;
  end loop;
 end if;
 if p_action='archive' then payload:=(case when p_table='hr_mohre_establishments' then jsonb_build_object('status','inactive') else jsonb_build_object('is_active',false) end)||jsonb_build_object('deleted_at',coalesce(prior->>'deleted_at',clock_timestamp()::text),'deleted_by',coalesce((prior->>'deleted_by')::bigint,actor));
 elsif p_action='restore' then payload:=case when prior->>'deleted_at' is not null then (case when p_table='hr_mohre_establishments' then jsonb_build_object('status','inactive') else jsonb_build_object('is_active',false) end)||jsonb_build_object('deleted_at',null,'deleted_by',null) else '{}'::jsonb end;end if;
 execute format('select to_jsonb(jsonb_populate_record(null::public.%I,$1))',p_table) into candidate using coalesce(prior,'{}'::jsonb)||payload;
 changed:=p_id is null or exists(select 1 from jsonb_object_keys(payload) f where prior->f is distinct from candidate->f);
 if changed then
  payload:=payload||jsonb_build_object('updated_by',actor,'updated_at',clock_timestamp());
  if p_id is null then
   payload:=payload||jsonb_build_object('created_by',actor);
   select string_agg(format('%I',f),',' order by f),string_agg(format('r.%I',f),',' order by f) into cols,vals from jsonb_object_keys(payload) f;
   execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',p_table,cols,vals,p_table,p_table) into saved using payload;
  else
   select string_agg(format('%I=r.%I',f,f),',' order by f) into assigns from jsonb_object_keys(payload) f;
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t)',p_table,assigns,p_table) into saved using payload,p_id;
  end if;
  insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
   values(actor,'HR',p_table,(saved->>'id')::bigint,coalesce(saved->>'code',saved->>'establishment_number',saved->>'rule_code',saved->>'workflow_code',saved->>'id'),case when p_action<>'save' then p_action when p_id is null then 'create'
    when prior->'status' is distinct from saved->'status' then case when saved->>'status'='active' then 'activate' else 'deactivate' end
    when prior->'is_active' is distinct from saved->'is_active' then case when saved->>'is_active'='true' then 'activate' else 'deactivate' end else 'update' end,
    prior-array['created_at','updated_at'],(saved-array['created_at','updated_at'])||jsonb_build_object('operation_id',p_operation));
 else saved:=prior;end if;
 result:=jsonb_build_object('id',saved->'id','revision',saved->>'workspace_revision','changed',changed,'replayed',false,'entity',p_table);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
  values(auth.uid(),p_operation,h,p_table,(saved->>'id')::bigint,result);
 return result;
end$$;
alter function erp_private.save_hr_lookup(text,uuid,bigint,bigint,jsonb,text) owner to postgres;
revoke all on function erp_private.save_hr_lookup(text,uuid,bigint,bigint,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function erp_private.save_hr_lookup(text,uuid,bigint,bigint,jsonb,text) to authenticated;
create function public.save_hr_lookup(p_table text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb,p_action text default 'save')
returns jsonb language sql security invoker set search_path='' as $$ select erp_private.save_hr_lookup(p_table,p_operation,p_id,p_revision,p_data,p_action) $$;
revoke all on function public.save_hr_lookup(text,uuid,bigint,bigint,jsonb,text) from public,anon,service_role;
grant execute on function public.save_hr_lookup(text,uuid,bigint,bigint,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
