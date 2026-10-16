begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Extend the audited HR transaction without changing read policies or granting
-- new business permissions. All five catalogues keep the existing global guard.
create function erp_private.hr_specialized_tables() returns text[]
language sql immutable set search_path='' as $$select array['hr_mohre_establishments','hr_readiness_rule_templates','hr_role_requirement_matrix','hr_site_requirement_matrix','hr_approval_workflows']::text[]$$;
alter function erp_private.hr_specialized_tables() owner to postgres;
revoke all on function erp_private.hr_specialized_tables() from public,anon,authenticated,service_role;

create or replace function erp_private.hr_lookup_fields(t text) returns text[]
language plpgsql immutable set search_path='' as $$
declare extra text[];
begin
 if t=any(erp_private.hr_specialized_tables()) then return case t
  when 'hr_mohre_establishments' then array['owner_company_id','establishment_number','establishment_name','emirate_id','status','notes']
  when 'hr_readiness_rule_templates' then array['rule_code','rule_name_en','rule_name_ar','readiness_dimension','requirement_type','required_document_type_id','required_training_type_id','required_access_card_type_id','required_medical_record_type_id','applies_to_category_id','applies_to_designation_id','applies_to_work_site_id','is_critical','expiry_buffer_days','is_active','sort_order']
  when 'hr_role_requirement_matrix' then array['employee_category_id','designation_id','readiness_rule_template_id','is_required','notes','is_active']
  when 'hr_site_requirement_matrix' then array['work_site_id','access_card_type_id','training_type_id','medical_record_type_id','readiness_rule_template_id','is_required','notes','is_active']
  when 'hr_approval_workflows' then array['workflow_code','workflow_name_en','workflow_name_ar','workflow_type','approval_step','approval_role_id','is_required','sla_hours','escalation_role_id','is_active'] end;
 end if;
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

create function erp_private.validate_hr_specialized() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 k text;dep record;parent jsonb;in_use boolean;
 active_new boolean:=n->>'deleted_at' is null and coalesce(n->>'is_active','true')<>'false' and coalesce(n->>'status','active')='active';
 active_old boolean:=TG_OP='UPDATE' and o->>'deleted_at' is null and coalesce(o->>'is_active','true')<>'false' and coalesce(o->>'status','active')='active';
begin
 if not TG_TABLE_NAME=any(erp_private.hr_specialized_tables()) then raise exception 'Unsupported HR configuration' using errcode='22023';end if;
 -- Do not remap historical ownership or renumber an existing workflow step.
 foreach k in array case TG_TABLE_NAME when 'hr_mohre_establishments' then array['owner_company_id','establishment_number']
  when 'hr_readiness_rule_templates' then array['rule_code'] when 'hr_approval_workflows' then array['workflow_code','approval_step'] else array[]::text[] end loop
  if TG_OP='UPDATE' and n->k is distinct from o->k then raise exception 'HR configuration identity is immutable' using errcode='22023';end if;
 end loop;
 foreach k in array array['establishment_number','rule_code','workflow_code'] loop
  if n?k and (n->>k is null or length(btrim(n->>k)) not between 1 and 100) then raise exception 'Invalid HR identity' using errcode='22023';end if;
 end loop;
 foreach k in array array['establishment_name','rule_name_en','workflow_name_en'] loop
  if n?k and (n->>k is null or length(btrim(n->>k)) not between 1 and 200) then raise exception 'Invalid HR name' using errcode='22023';end if;
 end loop;
 if coalesce(length(n->>'rule_name_ar'),0)>200 or coalesce(length(n->>'workflow_name_ar'),0)>200 or coalesce(length(n->>'notes'),0)>2000
  or (n?'expiry_buffer_days' and (n->>'expiry_buffer_days')::integer not between 1 and 365)
  or (n?'sort_order' and (n->>'sort_order')::integer not between 0 and 9999)
  or (n->>'sla_hours' is not null and (n->>'sla_hours')::integer<1)
  or (n?'approval_step' and (n->>'approval_step')::integer<1) then raise exception 'Invalid HR configuration value' using errcode='22023';end if;
 if n->>'deleted_at' is not null and (n->>'is_active'='true' or n->>'status'='active') then raise exception 'Archived HR setting must be inactive' using errcode='22023';end if;
 -- Current reference validation also covers owner writes and restoration.
 -- Unchanged historical references remain intact; activation rechecks all.
 if active_new then
  for dep in select cl.relname parent_table,a.attname field from pg_constraint c
   join pg_class cl on cl.oid=c.confrelid
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.conrelid=TG_RELID and array_length(c.conkey,1)=1
    and cl.relnamespace='public'::regnamespace and cl.relname<>'user_profiles' loop
   if n->>dep.field is not null and (TG_OP='INSERT' or not active_old or n->dep.field is distinct from o->dep.field) then
    execute format('select to_jsonb(t) from public.%I t where id=$1 for share',dep.parent_table) into parent using (n->>dep.field)::bigint;
    if parent is null or parent->>'deleted_at' is not null or parent->>'is_active'='false' or parent->>'status' in ('inactive','archived') then
     raise exception 'Choose an active reference for HR configuration' using errcode='23503';end if;
   end if;
  end loop;
 end if;
 if TG_OP='UPDATE' and ((active_old and not active_new) or (o->>'deleted_at' is null and n->>'deleted_at' is not null)) then
  for dep in select ns.nspname,cl.relname,a.attname from pg_constraint c
   join pg_class cl on cl.oid=c.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.confrelid=TG_RELID and array_length(c.conkey,1)=1 loop
   execute format('select exists(select 1 from %I.%I d where d.%I=$1 and to_jsonb(d)->>''deleted_at'' is null and coalesce(to_jsonb(d)->>''is_active'',''true'')<>''false'' and coalesce(to_jsonb(d)->>''status'',''active'') not in (''inactive'',''archived''))',dep.nspname,dep.relname,dep.attname) into in_use using new.id;
   if in_use then raise exception 'Current records use this HR configuration' using errcode='23503';end if;
  end loop;
 end if;
 return new;
end$$;
alter function erp_private.validate_hr_specialized() owner to postgres;
revoke all on function erp_private.validate_hr_specialized() from public,anon,authenticated,service_role;

-- Check incoming references, including employee/company ownership of MOHRE.
create function erp_private.validate_hr_specialized_reference() returns trigger
language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 parent_table text:=TG_ARGV[0];field text:=TG_ARGV[1];parent jsonb;company bigint;
begin
 if not parent_table=any(erp_private.hr_specialized_tables()) then raise exception 'Unsupported HR reference' using errcode='22023';end if;
 if n->>field is null or n->>'deleted_at' is not null or n->>'is_active'='false' then return new;end if;
 if TG_OP='UPDATE' and n->field is not distinct from o->field and n->'owner_company_id' is not distinct from o->'owner_company_id'
  and n->'employee_id' is not distinct from o->'employee_id' and o->>'deleted_at' is null and coalesce(o->>'is_active','true')<>'false' then return new;end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 for share',parent_table) into parent using (n->>field)::bigint;
 if parent is null or parent->>'deleted_at' is not null or parent->>'is_active'='false' or parent->>'status'='inactive' then raise exception 'Choose an active HR setting' using errcode='23503';end if;
 if parent_table='hr_mohre_establishments' then
  company:=(n->>'owner_company_id')::bigint;
  if TG_TABLE_NAME='employee_wps_profiles' then select owner_company_id into company from public.employees where id=(n->>'employee_id')::bigint for share;end if;
  if company is null or company<>(parent->>'owner_company_id')::bigint then raise exception 'MOHRE establishment belongs to another company' using errcode='23503';end if;
 end if;
 return new;
end$$;
alter function erp_private.validate_hr_specialized_reference() owner to postgres;
revoke all on function erp_private.validate_hr_specialized_reference() from public,anon,authenticated,service_role;

do $$declare t text;dep record;existing text;
begin
 foreach t in array erp_private.hr_specialized_tables() loop
  execute format('alter table public.%I add column workspace_revision bigint not null default 1',t);
  execute format('create trigger f06_hr_specialized_revision before insert or update on public.%I for each row execute function erp_private.workspace_revision()',t);
  execute format('create trigger f06_hr_specialized_integrity before insert or update on public.%I for each row execute function erp_private.validate_hr_specialized()',t);
  execute format('revoke insert,update,delete on public.%I from public,anon,authenticated',t);
  for dep in select ns.nspname,cl.relname,a.attname from pg_constraint c
   join pg_class cl on cl.oid=c.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.contype='f' and c.confrelid=format('public.%I',t)::regclass and array_length(c.conkey,1)=1 loop
   execute format('create trigger %I before insert or update on %I.%I for each row execute function erp_private.validate_hr_specialized_reference(%L,%L)',
    'f06_hr_special_ref_'||substr(md5(dep.nspname||'.'||dep.relname||'.'||dep.attname),1,24),dep.nspname,dep.relname,t,dep.attname);
  end loop;
 end loop;
 select pg_get_expr(conbin,conrelid) into existing from pg_constraint where conrelid='erp_private.master_lifecycle_receipts'::regclass and conname='master_lifecycle_receipts_entity_check';
 if existing is null then raise exception 'Expected receipt constraint unavailable';end if;
 alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
 execute format('alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check ((%s) or entity=any(%L::text[]))',existing,erp_private.hr_specialized_tables());
end$$;
notify pgrst,'reload schema';
commit;
