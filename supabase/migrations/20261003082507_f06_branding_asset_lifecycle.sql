begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Never infer or merge ambiguous historical versions. Deployment inventories
-- must resolve these under separate business approval before this index applies.
do $$begin
 if exists(select 1 from public.erp_branding_assets group by asset_scope,app_settings_id,branding_profile_id,asset_type,version_no having count(*)>1) then
  raise exception 'Branding version history requires reconciliation' using errcode='23505';end if;
end$$;
create unique index f06_branding_version_identity on public.erp_branding_assets
 (asset_scope,app_settings_id,branding_profile_id,asset_type,version_no) nulls not distinct;
alter table public.erp_branding_assets add column content_sha256 text check(content_sha256 ~ '^[0-9a-f]{64}$');

create table erp_private.branding_asset_operations(
 actor_id bigint not null references public.user_profiles(id), operation_id uuid not null,
 request_hash text not null, scope text not null check(scope in ('app','report')), parent_id bigint not null,
 asset_type text not null, company_id bigint, expected_asset bigint, expected_revision bigint, parent_revision bigint not null,
 mode text not null check(mode in ('upload','deactivate','retire')),
 version_no integer, storage_path text, metadata jsonb not null,
 result jsonb, created_at timestamptz not null default clock_timestamp(),
 primary key(actor_id,operation_id)
);
alter table erp_private.branding_asset_operations owner to postgres;
alter table erp_private.branding_asset_operations enable row level security;
revoke all on erp_private.branding_asset_operations from public,anon,authenticated,service_role;
create unique index f06_branding_reserved_path on erp_private.branding_asset_operations(storage_path) where storage_path is not null;

-- Service-only upload transactions derive the actor/session from the authenticated
-- server request, never from form metadata. Every prepare/finalize/replay rechecks
-- the live session and each permission against the SAME company's assignment.
create function erp_private.branding_actor_permission(p_actor bigint,p_session uuid,p_permission text,p_company bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select erp_private.provider_actor_session_valid(p_actor,p_session) and exists(
  select 1 from public.user_profiles u join public.user_roles a on a.user_profile_id=u.id
  join public.roles r on r.id=a.role_id where u.id=p_actor and u.status='active' and not u.must_change_password
  and a.is_active and r.is_active and a.branch_id is null
  and (a.owner_company_id is null or p_company is not null and a.owner_company_id=p_company)
  and ((r.role_code in ('system_admin','group_admin') and a.owner_company_id is null)
   or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
    where rp.role_id=r.id and p.is_active and p.permission_code=p_permission)));
$$;
alter function erp_private.branding_actor_permission(bigint,uuid,text,bigint) owner to postgres;
revoke all on function erp_private.branding_actor_permission(bigint,uuid,text,bigint) from public,anon,authenticated,service_role;

create function erp_private.lock_branding_asset_parent(p_actor bigint,p_session uuid,p_scope text,p_parent bigint,p_type text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare parent jsonb; company bigint;
begin
 if p_scope not in ('app','report') or p_scope is null or p_parent is null or p_parent<1 or p_type is null
  or p_scope='app' and p_type not in ('app_logo','app_logo_small','favicon','login_background','pwa_icon_192','pwa_icon_512')
  or p_scope='report' and p_type not in ('report_logo','report_logo_small','stamp','signature','watermark','letterhead_background') then
  raise exception 'Invalid branding asset identity' using errcode='22023';end if;
 -- Serializes only short configuration transactions, never remote storage IO.
 if p_scope='app' then select to_jsonb(p) into parent from public.erp_app_branding_settings p where id=p_parent and deleted_at is null for update;
 else select to_jsonb(p) into parent from public.erp_report_branding_profiles p where id=p_parent and deleted_at is null for update;end if;
 if parent is null then raise exception 'Branding parent unavailable' using errcode='42501';end if;
 company:=(parent->>'owner_company_id')::bigint;
 if not erp_private.branding_actor_permission(p_actor,p_session,case p_scope when 'app' then 'branding.app.manage' else 'reports.manage' end,company)
  or not erp_private.branding_actor_permission(p_actor,p_session,'branding.assets.upload',company)
  or p_type in ('stamp','signature') and not erp_private.branding_actor_permission(p_actor,p_session,'reports.sign',company) then
  raise exception 'Branding asset authority required' using errcode='42501';end if;
 return parent;
end$$;
alter function erp_private.lock_branding_asset_parent(bigint,uuid,text,bigint,text) owner to postgres;
revoke all on function erp_private.lock_branding_asset_parent(bigint,uuid,text,bigint,text) from public,anon,authenticated,service_role;

create function public.prepare_branding_asset_change(p_actor bigint,p_session uuid,p_scope text,p_parent bigint,p_type text,
 p_operation uuid,p_expected_asset bigint,p_revision bigint,p_parent_revision bigint,p_mode text,p_metadata jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare parent jsonb; company bigint; prior erp_private.branding_asset_operations; target public.erp_branding_assets;
 request_hash text; version integer; storage_path text; ext text; result jsonb; changed boolean; parent_revision bigint;
begin
 if p_actor is null or p_session is null or p_operation is null or p_parent_revision is null or p_parent_revision<1 or p_mode is null or p_mode not in ('upload','deactivate','retire')
  or p_metadata is null or jsonb_typeof(p_metadata)<>'object' or pg_column_size(p_metadata)>3000
  or (p_expected_asset is null and (p_revision is not null or p_mode<>'upload'))
  or (p_expected_asset is not null and (p_expected_asset<1 or p_revision is null or p_revision<1)) then
  raise exception 'Invalid asset save contract' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-branding-asset:'||p_actor||':'||p_operation,0));
 parent:=erp_private.lock_branding_asset_parent(p_actor,p_session,p_scope,p_parent,p_type);
 company:=(parent->>'owner_company_id')::bigint;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_scope,p_parent,p_type,p_expected_asset,p_revision,p_parent_revision,p_mode,p_metadata)::text,'UTF8')),'hex');
 select o.* into prior from erp_private.branding_asset_operations o where o.actor_id=p_actor and o.operation_id=p_operation;
 if found then
  if prior.request_hash<>request_hash then raise exception 'Asset save identity reused with changed input' using errcode='PT409';end if;
  if prior.result is not null then return jsonb_build_object('status','complete','receipt',prior.result||jsonb_build_object('replayed',true));end if;
  if prior.created_at<clock_timestamp()-interval '24 hours' then raise exception 'Staged upload requires reconciliation' using errcode='PT409';end if;
  if not (parent->>'is_active')::boolean or (parent->>'workspace_revision')::bigint<>prior.parent_revision then
   raise exception 'Branding profile changed during upload' using errcode='PT409';end if;
  return jsonb_build_object('status','prepared','path',prior.storage_path,'version',prior.version_no);
 end if;
 if not (parent->>'is_active')::boolean then raise exception 'Inactive branding cannot be changed' using errcode='22023';end if;
 if (parent->>'workspace_revision')::bigint<>p_parent_revision then raise exception 'Branding profile changed' using errcode='PT409';end if;
 if p_mode='upload' then
  if exists(select 1 from jsonb_object_keys(p_metadata) k where k not in ('sha256','filename','mime','size','width','height'))
   or (select count(*) from jsonb_object_keys(p_metadata))<>6
   or p_metadata->>'mime' not in ('image/png','image/jpeg','image/webp')
   or jsonb_typeof(p_metadata->'mime') is distinct from 'string'
   or jsonb_typeof(p_metadata->'sha256') is distinct from 'string' or p_metadata->>'sha256' !~ '^[0-9a-f]{64}$'
   or jsonb_typeof(p_metadata->'filename') is distinct from 'string' or length(p_metadata->>'filename') not between 1 and 200
   or p_metadata->>'filename' ~ '[[:cntrl:]/\\]'
   or exists(select 1 from jsonb_each(p_metadata) e where e.key in ('size','width','height') and (jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[1-9][0-9]*$')) then
   raise exception 'Invalid verified image metadata' using errcode='22023';end if;
  if (p_metadata->>'size')::bigint>10485760 or (p_metadata->>'width')::bigint*(p_metadata->>'height')::bigint>32000000 then
   raise exception 'Image exceeds permitted limits' using errcode='22023';end if;
  select a.* into target from public.erp_branding_assets a where a.asset_scope=p_scope and a.asset_type=p_type
   and coalesce(a.app_settings_id,a.branding_profile_id)=p_parent and a.is_active and a.deleted_at is null for update;
  if target.id is distinct from p_expected_asset or target.workspace_revision is distinct from p_revision then
   raise exception 'Active branding asset changed' using errcode='PT409';end if;
  if target.id is not null and target.content_sha256=p_metadata->>'sha256' and target.mime_type=p_metadata->>'mime' then
   result:=jsonb_build_object('id',target.id,'revision',target.workspace_revision::text,'parent_revision',parent->>'workspace_revision','changed',false,'replayed',false,'owner_company_id',company);
  else
   select coalesce(max(v),0)+1 into version from (
    select a.version_no as v from public.erp_branding_assets a where a.asset_scope=p_scope and a.asset_type=p_type and coalesce(a.app_settings_id,a.branding_profile_id)=p_parent
    union all select o.version_no from erp_private.branding_asset_operations o where o.scope=p_scope and o.asset_type=p_type and o.parent_id=p_parent) versions;
   ext:=case p_metadata->>'mime' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' else 'webp' end;
   storage_path:=case p_scope when 'app' then 'app/settings-'||p_parent else 'report/company-'||coalesce(company,0)||'/profile-'||p_parent end||'/'||p_type||'/v'||version||'.'||ext;
  end if;
 else
  if p_metadata<>'{}'::jsonb then raise exception 'Unexpected retirement metadata' using errcode='22023';end if;
  select a.* into target from public.erp_branding_assets a where a.id=p_expected_asset and a.asset_scope=p_scope and a.asset_type=p_type
   and coalesce(a.app_settings_id,a.branding_profile_id)=p_parent for update;
  if target.id is null then raise exception 'Asset unavailable' using errcode='42501';end if;
  if target.workspace_revision<>p_revision then raise exception 'Branding asset changed' using errcode='PT409';end if;
  changed:=target.is_active or (p_mode='retire' and target.deleted_at is null);
  parent_revision:=(parent->>'workspace_revision')::bigint;
  if changed then
   update public.erp_branding_assets set is_active=false,deleted_at=case when p_mode='retire' then clock_timestamp() else deleted_at end,
    deleted_by=case when p_mode='retire' then p_actor else deleted_by end,updated_by=p_actor,updated_at=clock_timestamp()
    where id=target.id returning * into target;
   if p_scope='app' then update public.erp_app_branding_settings set updated_by=p_actor,updated_at=clock_timestamp() where id=p_parent returning workspace_revision into parent_revision;
   else update public.erp_report_branding_profiles set updated_by=p_actor,updated_at=clock_timestamp() where id=p_parent returning workspace_revision into parent_revision;end if;
   insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
    values(p_actor,company,'BRANDING','erp_branding_assets',target.id,p_scope||':'||p_type,case p_mode when 'retire' then 'soft_delete' else 'deactivate' end,
     jsonb_build_object('operation_id',p_operation,'version',target.version_no,'revision',target.workspace_revision,'parent_revision',parent_revision));
  end if;
  result:=jsonb_build_object('id',target.id,'revision',target.workspace_revision::text,'parent_revision',parent_revision::text,'changed',changed,'replayed',false,'owner_company_id',company);
 end if;
 insert into erp_private.branding_asset_operations(actor_id,operation_id,request_hash,scope,parent_id,asset_type,company_id,expected_asset,expected_revision,parent_revision,mode,version_no,storage_path,metadata,result)
 values(p_actor,p_operation,request_hash,p_scope,p_parent,p_type,company,p_expected_asset,p_revision,p_parent_revision,p_mode,version,storage_path,p_metadata,result);
 if result is not null then return jsonb_build_object('status','complete','receipt',result);end if;
 return jsonb_build_object('status','prepared','path',storage_path,'version',version);
end$$;
alter function public.prepare_branding_asset_change(bigint,uuid,text,bigint,text,uuid,bigint,bigint,bigint,text,jsonb) owner to postgres;
revoke all on function public.prepare_branding_asset_change(bigint,uuid,text,bigint,text,uuid,bigint,bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_branding_asset_change(bigint,uuid,text,bigint,text,uuid,bigint,bigint,bigint,text,jsonb) to service_role;

create function public.finalize_branding_asset_change(p_actor bigint,p_session uuid,p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
<<finalize>>
declare op erp_private.branding_asset_operations; parent jsonb; target public.erp_branding_assets; created public.erp_branding_assets;
 result jsonb; parent_revision bigint;
begin
 if p_actor is null or p_session is null or p_operation is null then raise exception 'Invalid upload identity' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-branding-asset:'||p_actor||':'||p_operation,0));
 select o.* into op from erp_private.branding_asset_operations o where o.actor_id=p_actor and o.operation_id=p_operation for update;
 if not found then raise exception 'Upload unavailable' using errcode='42501';end if;
 parent:=erp_private.lock_branding_asset_parent(p_actor,p_session,op.scope,op.parent_id,op.asset_type);
 if op.result is not null then return op.result||jsonb_build_object('replayed',true);end if;
 if op.mode<>'upload' or op.created_at<clock_timestamp()-interval '24 hours' or not (parent->>'is_active')::boolean then
  raise exception 'Staged upload requires reconciliation' using errcode='PT409';end if;
 if (parent->>'workspace_revision')::bigint<>op.parent_revision then raise exception 'Branding profile changed during upload' using errcode='PT409';end if;
 select a.* into target from public.erp_branding_assets a where a.asset_scope=op.scope and a.asset_type=op.asset_type
  and coalesce(a.app_settings_id,a.branding_profile_id)=op.parent_id and a.is_active and a.deleted_at is null for update;
 if target.id is distinct from op.expected_asset or target.workspace_revision is distinct from op.expected_revision then
  raise exception 'Active branding asset changed during upload' using errcode='PT409';end if;
 -- Storage content was decoded and its digest checked by the server. Existence
 -- and immutable identity are checked again in the database commit boundary.
 if not exists(select 1 from storage.objects where bucket_id='erp-branding-assets' and name=op.storage_path
  and (metadata->>'size')::bigint=(op.metadata->>'size')::bigint and metadata->>'mimetype'=op.metadata->>'mime') then
  raise exception 'Verified storage object unavailable' using errcode='22023';end if;
 if target.id is not null then update public.erp_branding_assets set is_active=false,updated_by=p_actor,updated_at=clock_timestamp() where id=target.id;end if;
 insert into public.erp_branding_assets(asset_scope,app_settings_id,branding_profile_id,owner_company_id,asset_type,storage_bucket,storage_path,
  original_filename,mime_type,file_size_bytes,width_px,height_px,version_no,content_sha256,created_by,updated_by)
 values(op.scope,case when op.scope='app' then op.parent_id end,case when op.scope='report' then op.parent_id end,op.company_id,op.asset_type,
  'erp-branding-assets',op.storage_path,op.metadata->>'filename',op.metadata->>'mime',(op.metadata->>'size')::bigint,
  (op.metadata->>'width')::integer,(op.metadata->>'height')::integer,op.version_no,op.metadata->>'sha256',p_actor,p_actor) returning * into created;
 if target.id is not null then update public.erp_branding_assets set replaced_by_asset_id=created.id,updated_by=p_actor,updated_at=clock_timestamp() where id=target.id;end if;
 if op.scope='app' then update public.erp_app_branding_settings set updated_by=p_actor,updated_at=clock_timestamp() where id=op.parent_id returning workspace_revision into parent_revision;
 else update public.erp_report_branding_profiles set updated_by=p_actor,updated_at=clock_timestamp() where id=op.parent_id returning workspace_revision into parent_revision;end if;
 insert into public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(p_actor,op.company_id,'BRANDING','erp_branding_assets',created.id,op.scope||':'||op.asset_type||':v'||op.version_no,'upload',
  jsonb_build_object('operation_id',p_operation,'version',op.version_no,'replaced_asset',target.id,'parent_revision',parent_revision));
 result:=jsonb_build_object('id',created.id,'revision',created.workspace_revision::text,'parent_revision',parent_revision::text,'changed',true,'replayed',false,'owner_company_id',op.company_id);
 update erp_private.branding_asset_operations o set result=finalize.result where o.actor_id=p_actor and o.operation_id=p_operation;
 return result;
end$$;
alter function public.finalize_branding_asset_change(bigint,uuid,uuid) owner to postgres;
revoke all on function public.finalize_branding_asset_change(bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.finalize_branding_asset_change(bigint,uuid,uuid) to service_role;

-- Retirement must remain replayable when the successful transaction hides the
-- asset from ordinary read policies. This narrow service-only entry point
-- derives ownership inside the database, then uses the same live-session,
-- company/signing, revision, request-hash and audit checks as every asset change.
-- It never returns the hidden asset row or its storage location.
create function public.retire_branding_asset_change(p_actor bigint,p_session uuid,p_asset bigint,p_revision bigint,
 p_parent_revision bigint,p_operation uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.erp_branding_assets;
begin
 if p_asset is null or p_asset<1 or p_mode is null or p_mode not in ('deactivate','retire') then
  raise exception 'Invalid asset retirement' using errcode='22023';end if;
 if not erp_private.provider_actor_session_valid(p_actor,p_session) then
  raise exception 'Asset unavailable' using errcode='42501';end if;
 select a.* into target from public.erp_branding_assets a where a.id=p_asset;
 if target.id is null then raise exception 'Asset unavailable' using errcode='42501';end if;
 return public.prepare_branding_asset_change(p_actor,p_session,target.asset_scope,
  coalesce(target.app_settings_id,target.branding_profile_id),target.asset_type,p_operation,p_asset,p_revision,p_parent_revision,p_mode,'{}'::jsonb);
end$$;
alter function public.retire_branding_asset_change(bigint,uuid,bigint,bigint,bigint,uuid,text) owner to postgres;
revoke all on function public.retire_branding_asset_change(bigint,uuid,bigint,bigint,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.retire_branding_asset_change(bigint,uuid,bigint,bigint,bigint,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
