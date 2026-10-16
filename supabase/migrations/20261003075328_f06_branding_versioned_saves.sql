begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $$begin
 if exists(select 1 from public.erp_report_branding_profiles where is_default_for_company and deleted_at is null
  group by owner_company_id having count(*)>1) then
  raise exception 'Branding preflight required: conflicting company defaults' using errcode='23505';
 end if;
end$$;
create unique index f06_branding_company_default on public.erp_report_branding_profiles(owner_company_id)
 where owner_company_id is not null and is_default_for_company and deleted_at is null;

alter table public.erp_report_branding_profiles add column workspace_revision bigint not null default 1;
alter table public.erp_app_branding_settings add column workspace_revision bigint not null default 1;
alter table public.erp_branding_assets add column workspace_revision bigint not null default 1;
create trigger f06_branding_revision before insert or update on public.erp_report_branding_profiles for each row execute function erp_private.workspace_revision();
create trigger f06_branding_revision before insert or update on public.erp_app_branding_settings for each row execute function erp_private.workspace_revision();
create trigger f06_branding_revision before insert or update on public.erp_branding_assets for each row execute function erp_private.workspace_revision();

create table erp_private.branding_version_history(
 entity text not null check(entity in ('erp_report_branding_profiles','erp_app_branding_settings','erp_branding_assets')),
 record_id bigint not null, revision bigint not null check(revision>0), snapshot jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(), baseline boolean not null default false,
 primary key(entity,record_id,revision)
);
alter table erp_private.branding_version_history owner to postgres;
alter table erp_private.branding_version_history enable row level security;
revoke all on erp_private.branding_version_history from public,anon,authenticated,service_role;
-- Baseline snapshots retain, rather than reinterpret, historical values. They
-- are not fictitious user edits and are not exposed in the public catalogue.
insert into erp_private.branding_version_history(entity,record_id,revision,snapshot,baseline)
 select 'erp_report_branding_profiles',id,workspace_revision,to_jsonb(p),true from public.erp_report_branding_profiles p
 union all select 'erp_app_branding_settings',id,workspace_revision,to_jsonb(s),true from public.erp_app_branding_settings s
 union all select 'erp_branding_assets',id,workspace_revision,to_jsonb(a),true from public.erp_branding_assets a;

create function erp_private.record_branding_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_schema<>'public' or tg_table_name not in ('erp_report_branding_profiles','erp_app_branding_settings','erp_branding_assets') then
  raise exception 'Invalid branding history source' using errcode='42501';end if;
 insert into erp_private.branding_version_history(entity,record_id,revision,snapshot)
 values(tg_table_name,new.id,new.workspace_revision,to_jsonb(new));
 return new;
end$$;
alter function erp_private.record_branding_version() owner to postgres;
revoke all on function erp_private.record_branding_version() from public,anon,authenticated,service_role;
create trigger f06_branding_history after insert or update on public.erp_report_branding_profiles for each row execute function erp_private.record_branding_version();
create trigger f06_branding_history after insert or update on public.erp_app_branding_settings for each row execute function erp_private.record_branding_version();
create trigger f06_branding_history after insert or update on public.erp_branding_assets for each row execute function erp_private.record_branding_version();

create function erp_private.validate_branding_configuration(kind text,v jsonb,previous jsonb default null)
returns void language plpgsql security invoker set search_path='' as $$
declare key text; limit_length integer; company bigint; identifier text;
begin
 identifier:=case kind when 'report' then 'profile_code' when 'app' then 'settings_code' else null end;
 if identifier is null or v->>identifier is null or v->>identifier !~ '^[A-Z0-9_]{2,100}$' then
  raise exception 'Invalid branding identity' using errcode='22023';end if;
 if previous is not null and (v->identifier is distinct from previous->identifier or
  kind='report' and v->'owner_company_id' is distinct from previous->'owner_company_id') then
  raise exception 'Branding identity and company cannot be changed' using errcode='22023';end if;
 if nullif(btrim(v->>case kind when 'report' then 'profile_name' else 'app_name' end),'') is null then
  raise exception 'Branding name is required' using errcode='22023';end if;
 foreach key in array case kind when 'report' then array['is_active','is_default_for_company','is_group_profile','is_neutral_profile'] else array['is_active'] end loop
  if jsonb_typeof(v->key) is distinct from 'boolean' then raise exception 'Use typed branding flags' using errcode='22023';end if;
 end loop;
 for key,limit_length in select * from (values
  ('profile_name',200),('app_name',200),('app_short_name',50),('tagline',300),('support_email',254),('support_phone',50),
  ('footer_text',1000),('login_title',200),('login_subtitle',300),('watermark_text',100),('legal_name_en',300),('legal_name_ar',300),
  ('trade_name_en',300),('trade_name_ar',300),('address_block_en',500),('address_block_ar',500),('phone',50),('email',254),
  ('website',200),('po_box',50),('trn',50),('trade_license_no',100),('footer_text_en',500),('footer_text_ar',500),
  ('signatory_name',200),('signatory_title_en',200),('signatory_title_ar',200)) as limits(k,n) loop
  if length(v->>key)>limit_length then raise exception 'Branding text exceeds its limit' using errcode='22023';end if;
 end loop;
 foreach key in array array['theme_primary_color','theme_secondary_color','theme_accent_color','theme_header_bg_color','theme_header_text_color'] loop
  if v->>key is not null and v->>key !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Invalid branding color' using errcode='22023';end if;
 end loop;
 foreach key in array array['email','support_email'] loop
  if v->>key is not null and v->>key !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid branding email' using errcode='22023';end if;
 end loop;
 if kind='report' then
  company:=(v->>'owner_company_id')::bigint;
  if v->>'profile_type' is null or v->>'profile_type' not in ('company','group','neutral','custom')
   or v->>'profile_type'='company' and company is null
   or v->>'profile_type' in ('group','neutral') and company is not null
   or (v->>'is_group_profile')::boolean is distinct from (v->>'profile_type'='group')
   or (v->>'is_neutral_profile')::boolean is distinct from (v->>'profile_type'='neutral') then
   raise exception 'Branding type and company do not agree' using errcode='22023';end if;
  if company is not null then
   perform 1 from public.owner_companies where id=company and
    (status='active' or not (v->>'is_active')::boolean and previous is not null and previous->'owner_company_id'=v->'owner_company_id') for share;
   if not found then raise exception 'Choose an active issuing company' using errcode='23503';end if;
  end if;
  if (v->>'is_default_for_company')::boolean and (company is null or not (v->>'is_active')::boolean or v->>'deleted_at' is not null) then
   raise exception 'The default must be an active company profile' using errcode='22023';end if;
  foreach key in array array['logo_url','small_logo_url','stamp_url','signature_url','watermark_url'] loop
   if v->>key is not null and (previous is null or v->key is distinct from previous->key) then
    raise exception 'Use governed asset upload instead of an external image URL' using errcode='22023';end if;
  end loop;
 end if;
end$$;
alter function erp_private.validate_branding_configuration(text,jsonb,jsonb) owner to postgres;
revoke all on function erp_private.validate_branding_configuration(text,jsonb,jsonb) from public,anon,authenticated,service_role;

create function erp_private.validate_branding_row() returns trigger language plpgsql security definer set search_path='' as $$
declare old_row jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else null end;
begin
 if tg_table_name in ('erp_report_branding_profiles','erp_app_branding_settings') then
  perform erp_private.validate_branding_configuration(case tg_table_name when 'erp_report_branding_profiles' then 'report' else 'app' end,to_jsonb(new),old_row);
 else
  if tg_op='UPDATE' and (to_jsonb(new)-array['is_active','replaced_by_asset_id','updated_at','updated_by','deleted_at','deleted_by','workspace_revision'])
   is distinct from (old_row-array['is_active','replaced_by_asset_id','updated_at','updated_by','deleted_at','deleted_by','workspace_revision']) then
   raise exception 'Branding asset content and ownership are immutable' using errcode='22023';end if;
  if tg_op='UPDATE' and not old.is_active and new.is_active then raise exception 'Restore content as a new asset version' using errcode='22023';end if;
  if tg_op='INSERT' and (not erp_private.branding_storage_identity(new) or new.file_size_bytes is null or new.file_size_bytes not between 1 and 10485760) then
   raise exception 'Invalid branding asset identity or size' using errcode='22023';end if;
  if new.asset_scope='report' and not exists(select 1 from public.erp_report_branding_profiles p where p.id=new.branding_profile_id and p.owner_company_id is not distinct from new.owner_company_id) then
   raise exception 'Branding asset company does not match its profile' using errcode='23503';end if;
  if new.asset_scope='app' and new.owner_company_id is not null then raise exception 'App branding has no company override' using errcode='22023';end if;
 end if;
 return new;
end$$;
alter function erp_private.validate_branding_row() owner to postgres;
revoke all on function erp_private.validate_branding_row() from public,anon,authenticated,service_role;
create trigger f06_branding_validate before insert or update on public.erp_report_branding_profiles for each row execute function erp_private.validate_branding_row();
create trigger f06_branding_validate before insert or update on public.erp_app_branding_settings for each row execute function erp_private.validate_branding_row();
create trigger f06_branding_validate before insert or update on public.erp_branding_assets for each row execute function erp_private.validate_branding_row();

alter table erp_private.master_lifecycle_receipts drop constraint master_lifecycle_receipts_entity_check;
alter table erp_private.master_lifecycle_receipts add constraint master_lifecycle_receipts_entity_check check(entity in
 ('departments','work_calendars','work_shifts','global_numbering_rules','erp_email_provider_configs','erp_ai_provider_configs',
  'erp_email_feature_flags','erp_ai_feature_flags','erp_report_branding_profiles','erp_app_branding_settings','erp_branding_assets'));

create function public.save_branding_configuration(p_kind text,p_operation uuid,p_id bigint,p_revision bigint,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare entity text; identifier text; company bigint; old_row jsonb; candidate jsonb; payload jsonb; saved jsonb;
 allowed text[]; booleans text[]; key text; receipt erp_private.master_lifecycle_receipts; h text; actor bigint;
 cols text; vals text; assigns text; changed boolean; result jsonb; demoted jsonb;
begin
 if not erp_private.business_principal_is_active() then raise exception 'Permission denied' using errcode='42501';end if;
 if p_kind is null or p_kind not in ('app','report') or p_operation is null or p_data is null or jsonb_typeof(p_data)<>'object'
  or pg_column_size(p_data)>32000 or (p_id is not null and (p_id<1 or p_revision is null or p_revision<1))
  or (p_id is null and (p_revision is not null or p_kind='app')) then raise exception 'Invalid branding save contract' using errcode='22023';end if;
 entity:=case p_kind when 'report' then 'erp_report_branding_profiles' else 'erp_app_branding_settings' end;
 identifier:=case p_kind when 'report' then 'profile_code' else 'settings_code' end;
 booleans:=case p_kind when 'report' then array['is_active','is_default_for_company','is_group_profile','is_neutral_profile'] else array['is_active'] end;
 allowed:=case p_kind when 'report' then array['profile_code','profile_name','profile_type','owner_company_id','watermark_text',
  'theme_primary_color','theme_secondary_color','theme_header_bg_color','theme_header_text_color','legal_name_en','legal_name_ar',
  'trade_name_en','trade_name_ar','address_block_en','address_block_ar','phone','email','website','po_box','trn','trade_license_no',
  'footer_text_en','footer_text_ar','signatory_name','signatory_title_en','signatory_title_ar','logo_url','small_logo_url','stamp_url','signature_url','watermark_url']
  else array['app_name','app_short_name','tagline','support_email','support_phone','footer_text','theme_primary_color','theme_secondary_color',
   'theme_accent_color','login_title','login_subtitle'] end||booleans;
 if exists(select 1 from jsonb_object_keys(p_data) k where not k=any(allowed)) then raise exception 'Protected branding fields' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_data) e where
  (e.key=any(booleans) and jsonb_typeof(e.value)<>'boolean') or
  (e.key='owner_company_id' and (jsonb_typeof(e.value) not in ('number','null') or e.value<>'null'::jsonb and e.value::text !~ '^[1-9][0-9]*$')) or
  (not e.key=any(booleans||array['owner_company_id']) and jsonb_typeof(e.value) not in ('string','null'))) then
  raise exception 'Use typed branding values' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_operation::text,0));
 -- Serialize these short admin changes, not storage transfer/render/provider work.
 perform pg_advisory_xact_lock(hashtextextended('f06-branding-config:'||p_kind,0));
 if p_id is not null then
  execute format('select to_jsonb(t) from public.%I t where id=$1 and deleted_at is null for update',entity) into old_row using p_id;
  if old_row is null then raise exception 'Branding profile unavailable' using errcode='42501';end if;
 end if;
 company:=case when p_id is not null then (old_row->>'owner_company_id')::bigint else (p_data->>'owner_company_id')::bigint end;
 if p_kind='app' and not erp_private.permission_in_scope('branding.app.manage',null,null)
  or p_kind='report' and not erp_private.report_branding_permission('manage',company) then
  raise exception 'Branding scope permission required' using errcode='42501';end if;
 if p_kind='report' and exists(select 1 from jsonb_each(p_data) e where e.key=any(array['signatory_name','signatory_title_en','signatory_title_ar','stamp_url','signature_url'])
  and (e.value<>'null'::jsonb and e.value<>'""'::jsonb or old_row->e.key is distinct from e.value))
  and not erp_private.report_branding_permission('sign',company) then raise exception 'Separate signing authority required' using errcode='42501';end if;
 h:=encode(sha256(convert_to(jsonb_build_array('branding',p_kind,p_id,p_revision,p_data)::text,'UTF8')),'hex');
 select r.* into receipt from erp_private.master_lifecycle_receipts r where r.actor=auth.uid() and r.operation_id=p_operation;
 if found then
  if receipt.request_hash<>h then raise exception 'Operation input changed' using errcode='22023';end if;
  return receipt.result||jsonb_build_object('replayed',true);
 end if;
 if old_row is not null and (old_row->>'workspace_revision')::bigint<>p_revision then raise exception 'Branding changed' using errcode='PT409';end if;
 payload:=case when old_row is null then jsonb_build_object('profile_type','company','owner_company_id',null,'is_active',true,'is_default_for_company',false,'is_group_profile',false,'is_neutral_profile',false,
  'theme_primary_color','#1e293b','theme_secondary_color','#475569','theme_header_bg_color','#1e293b','theme_header_text_color','#ffffff') else '{}'::jsonb end||p_data;
 for key in select jsonb_object_keys(payload) loop
  if jsonb_typeof(payload->key)='string' then payload:=jsonb_set(payload,array[key],coalesce(to_jsonb(nullif(btrim(payload->>key),'')),'null'::jsonb));end if;
 end loop;
 candidate:=coalesce(old_row,'{}'::jsonb)||payload;
 if p_kind='report' then
  if (p_data?'is_group_profile' and (p_data->>'is_group_profile')::boolean is distinct from (candidate->>'profile_type'='group')) or
   (p_data?'is_neutral_profile' and (p_data->>'is_neutral_profile')::boolean is distinct from (candidate->>'profile_type'='neutral')) then
   raise exception 'Branding flags do not match the profile type' using errcode='22023';end if;
  payload:=payload||jsonb_build_object('is_group_profile',candidate->>'profile_type'='group','is_neutral_profile',candidate->>'profile_type'='neutral');
  candidate:=candidate||payload;
  if old_row is not null and (old_row->>'is_default_for_company')::boolean and not (candidate->>'is_default_for_company')::boolean then
   raise exception 'Choose a replacement company default first' using errcode='22023';end if;
 end if;
 execute format('select to_jsonb(r) from jsonb_populate_record(null::public.%I,$1) r',entity) into candidate using candidate;
 changed:=old_row is null or exists(select 1 from jsonb_object_keys(payload) k where old_row->k is distinct from candidate->k);
 actor:=public.current_user_profile_id();
 if changed then
  perform erp_private.validate_branding_configuration(p_kind,candidate,old_row);
  if p_kind='report' and (candidate->>'is_default_for_company')::boolean then
   for demoted in update public.erp_report_branding_profiles p set is_default_for_company=false,updated_by=actor,updated_at=clock_timestamp()
    where owner_company_id=company and is_default_for_company and deleted_at is null and (p_id is null or id<>p_id) returning to_jsonb(p) loop
    insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
     values(actor,company,'BRANDING',entity,(demoted->>'id')::bigint,demoted->>identifier,'update',jsonb_build_object('operation_id',p_operation,'is_default_for_company',false,'revision',demoted->>'workspace_revision'));
   end loop;
  end if;
  payload:=payload||jsonb_build_object('updated_by',actor,'updated_at',clock_timestamp());
  if p_id is null then payload:=payload||jsonb_build_object('created_by',actor);end if;
  select string_agg(format('%I',k),',' order by k),string_agg(format('r.%I',k),',' order by k),string_agg(format('%I=r.%I',k,k),',' order by k)
   into cols,vals,assigns from jsonb_object_keys(payload) k;
  if p_id is null then
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I)',entity,cols,vals,entity,entity) into saved using payload;
  else
   execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where t.id=$2 returning to_jsonb(t)',entity,assigns,entity) into saved using payload,p_id;
  end if;
  insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
   values(actor,company,'BRANDING',entity,(saved->>'id')::bigint,saved->>identifier,case when p_id is null then 'create' else 'update' end,
    case when old_row is null then null else jsonb_build_object('revision',old_row->>'workspace_revision') end,
    jsonb_build_object('operation_id',p_operation,'revision',saved->>'workspace_revision','changed_fields',to_jsonb(array(select jsonb_object_keys(payload)))));
 else saved:=old_row;end if;
 result:=jsonb_build_object('id',saved->'id','revision',saved->>'workspace_revision','changed',changed,'replayed',false,'owner_company_id',company);
 insert into erp_private.master_lifecycle_receipts(actor,operation_id,request_hash,entity,record_id,result)
 values(auth.uid(),p_operation,h,entity,(saved->>'id')::bigint,result);
 return result;
end$$;
alter function public.save_branding_configuration(text,uuid,bigint,bigint,jsonb) owner to postgres;
revoke all on function public.save_branding_configuration(text,uuid,bigint,bigint,jsonb) from public,anon,service_role;
grant execute on function public.save_branding_configuration(text,uuid,bigint,bigint,jsonb) to authenticated;

-- Append revision to the existing fixed/redacted projection without reintroducing
-- raw table SELECT. No historical public data or business grants are rewritten.
create or replace view public.erp_report_branding_profiles_safe with(security_barrier=true) as
 select p.id,p.profile_code,p.profile_name,p.profile_type,p.owner_company_id,p.logo_url,p.small_logo_url,
 case when erp_private.report_branding_permission('sign',p.owner_company_id) then p.stamp_url else null::text end as stamp_url,
 case when erp_private.report_branding_permission('sign',p.owner_company_id) then p.signature_url else null::text end as signature_url,
 p.watermark_url,p.watermark_text,p.theme_primary_color,p.theme_secondary_color,p.theme_header_bg_color,p.theme_header_text_color,
 p.legal_name_en,p.legal_name_ar,p.trade_name_en,p.trade_name_ar,p.address_block_en,p.address_block_ar,
 p.phone,p.email,p.website,p.po_box,p.trn,p.trade_license_no,p.footer_text_en,p.footer_text_ar,
 p.signatory_name,p.signatory_title_en,p.signatory_title_ar,p.is_default_for_company,p.is_group_profile,p.is_neutral_profile,
 p.is_active,p.created_at,p.updated_at,p.created_by,p.updated_by,p.deleted_at,p.deleted_by,p.workspace_revision
 from public.erp_report_branding_profiles p
 where p.deleted_at is null and erp_private.can_read_report_branding(p.owner_company_id);
notify pgrst,'reload schema';
commit;
