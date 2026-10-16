begin;

-- F06: server-authoritative formatting and allocation. Existing UTC date semantics
-- are explicit; no historical rule, counter or issued number is rewritten.
create function erp_private.numbering_format(p_template text,p_prefix text,p_sequence bigint,p_width integer,p_padding text,p_at timestamptz)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare result text:=p_template; token text; digits text:=p_sequence::text; width integer;
begin
 if p_template is null or length(p_template) not between 1 and 100
  or regexp_replace(p_template,'\{(DOC|SEQ(3|4|5|6|12)?|YYYY|YY|MM|DD)\}','','g') ~ '[{}]'
  or position('{DOC}' in p_template)=0 or p_template !~ '\{SEQ(3|4|5|6|12)?\}'
  or p_prefix is null or p_prefix !~ '^[A-Z0-9_]{1,20}$'
  or p_sequence is null or p_sequence<1 or p_width is null or p_width not between 1 and 12
  or p_padding is null or p_padding !~ '^[A-Za-z0-9]$' or p_at is null then
  raise exception 'Invalid numbering format' using errcode='22023';
 end if;
 result:=replace(result,'{DOC}',p_prefix);
 foreach token in array array['SEQ','SEQ3','SEQ4','SEQ5','SEQ6','SEQ12'] loop
  width:=case when token='SEQ' then p_width else substring(token from 4)::integer end;
  result:=replace(result,'{'||token||'}',lpad(digits,greatest(width,length(digits)),p_padding));
 end loop;
 result:=replace(result,'{YYYY}',to_char(p_at at time zone 'UTC','YYYY'));
 result:=replace(result,'{YY}',to_char(p_at at time zone 'UTC','YY'));
 result:=replace(result,'{MM}',to_char(p_at at time zone 'UTC','MM'));
 return replace(result,'{DD}',to_char(p_at at time zone 'UTC','DD'));
end $$;
revoke all on function erp_private.numbering_format(text,text,bigint,integer,text,timestamptz) from public,anon,authenticated;

create function erp_private.numbering_period(p_policy text,p_template text,p_at timestamptz)
returns text language plpgsql immutable security invoker set search_path='' as $$
begin
 if p_policy not in ('never','yearly','monthly') or p_policy is null or p_at is null then
  raise exception 'Invalid numbering reset policy' using errcode='22023';
 end if;
 if p_policy<>'never' and position('{YYYY}' in p_template)=0 or p_policy='monthly' and position('{MM}' in p_template)=0 then
  raise exception 'Resetting rules require year and applicable month tokens' using errcode='22023';
 end if;
 return case p_policy when 'yearly' then to_char(p_at at time zone 'UTC','YYYY') when 'monthly' then to_char(p_at at time zone 'UTC','YYYY-MM') else 'GLOBAL' end;
end $$;
revoke all on function erp_private.numbering_period(text,text,timestamptz) from public,anon,authenticated;

create function erp_private.numbering_select(p_id bigint,p_code text,p_type text,p_at timestamptz)
returns public.global_numbering_rules language plpgsql stable security invoker set search_path='' as $$
declare r public.global_numbering_rules; matches integer;
begin
 if p_id is null and p_code is null and p_type is null then raise exception 'Choose a numbering rule' using errcode='22023';end if;
 select count(*) into matches from public.global_numbering_rules n where
  (p_id is null or n.id=p_id) and (p_code is null or n.rule_code=p_code) and (p_type is null or n.document_type_code=p_type)
  and n.is_active and (n.effective_from is null or n.effective_from<=p_at) and (n.effective_to is null or n.effective_to>=p_at);
 if matches=0 then raise exception 'No eligible numbering rule' using errcode='P0002';end if;
 if matches<>1 then raise exception 'Ambiguous numbering rule; select its code or ID' using errcode='22023';end if;
 select * into r from public.global_numbering_rules n where
  (p_id is null or n.id=p_id) and (p_code is null or n.rule_code=p_code) and (p_type is null or n.document_type_code=p_type)
  and n.is_active and (n.effective_from is null or n.effective_from<=p_at) and (n.effective_to is null or n.effective_to>=p_at);
 return r;
end $$;
revoke all on function erp_private.numbering_select(bigint,text,text,timestamptz) from public,anon,authenticated;

create table erp_private.numbering_requests (
 actor_id bigint not null, operation_id uuid not null, request_hash text not null,
 reference_id bigint not null references public.global_numbering_generated_references(id) on delete restrict,
 created_at timestamptz not null default now(), primary key(actor_id,operation_id)
);
alter table erp_private.numbering_requests enable row level security;
revoke all on erp_private.numbering_requests from public,anon,authenticated,service_role;

create function erp_private.numbering_result(g public.global_numbering_generated_references,p_replayed boolean)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('id',g.id,'generated_reference_number',g.generated_reference_number,
 'generated_sequence_number',g.generated_sequence_number,'numbering_rule_id',g.numbering_rule_id,
 'sequence_state_id',g.sequence_state_id,'generation_status',g.generation_status,'replayed',p_replayed);
$$;
revoke all on function erp_private.numbering_result(public.global_numbering_generated_references,boolean) from public,anon,authenticated;

-- Owner-only primitive. Public wrappers authenticate/authorize; callers cannot
-- supply a clock, impersonate another actor, or invoke this helper via the API.
create function erp_private.numbering_allocate(p_id bigint,p_code text,p_type text,p_operation uuid,p_actor bigint,
 p_status text,p_table text,p_record bigint,p_reason text,p_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.global_numbering_rules; s public.global_numbering_sequence_states; g public.global_numbering_generated_references;
 receipt erp_private.numbering_requests; h text; period text; next_seq bigint; ref text;
begin
 if p_status not in ('reserved','consumed') or p_status is null then raise exception 'Invalid allocation status' using errcode='22023';end if;
 if (p_record is not null and p_table is null) or p_record<1 or length(p_reason)>1000 or length(p_table)>100 then
  raise exception 'Invalid allocation context' using errcode='22023';end if;
 h:=md5(jsonb_build_array(p_id,p_code,p_type,p_status,p_table,p_record,p_reason)::text);
 if p_operation is not null then
  if p_actor is null then raise exception 'Missing allocation actor' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('f06-numbering:'||p_actor||':'||p_operation,0));
  select * into receipt from erp_private.numbering_requests where actor_id=p_actor and operation_id=p_operation;
  if found then
   if receipt.request_hash<>h then raise exception 'Operation was already used for different inputs' using errcode='22023';end if;
   select * into strict g from public.global_numbering_generated_references where id=receipt.reference_id;
   return erp_private.numbering_result(g,true);
  end if;
 end if;
 r:=erp_private.numbering_select(p_id,p_code,p_type,p_at);
 select * into r from public.global_numbering_rules where id=r.id for update;
 -- Recheck after waiting for a concurrent edit/retirement.
 if not r.is_active or r.effective_from>p_at or r.effective_to<p_at then raise exception 'No eligible numbering rule' using errcode='P0002';end if;
 period:=erp_private.numbering_period(r.reset_policy,r.format_template,p_at);
 select * into s from public.global_numbering_sequence_states where numbering_rule_id=r.id and reset_period_key=period for update;
 if not found then
  -- Preserve legacy GLOBAL state when a historical reset rule is first adopted.
  -- Never reset the current period below a sequence already issued in that period.
  select greatest(r.starting_sequence_number,coalesce(max(generated_sequence_number)+1,r.starting_sequence_number),
   case when period='GLOBAL' then r.next_sequence_number else r.starting_sequence_number end)
   into next_seq from public.global_numbering_generated_references where numbering_rule_id=r.id and
    (period='GLOBAL' or erp_private.numbering_period(r.reset_policy,r.format_template,generated_at)=period);
  insert into public.global_numbering_sequence_states(numbering_rule_id,module_code,document_type_code,document_prefix,reset_period_key,last_sequence_number,next_sequence_number,created_by,updated_by)
   values(r.id,r.module_code,r.document_type_code,r.document_prefix,period,0,next_seq,p_actor,p_actor) returning * into s;
 end if;
 next_seq:=s.next_sequence_number;
 if next_seq>9007199254740990 then raise exception 'Sequence exceeds supported exact integer range' using errcode='22003';end if;
 ref:=erp_private.numbering_format(r.format_template,r.document_prefix,next_seq,r.sequence_length,r.padding_character,p_at);
 -- Existing global unique reference constraint is the final collision guard.
 insert into public.global_numbering_generated_references(numbering_rule_id,sequence_state_id,generated_reference_number,generated_sequence_number,
  module_code,document_type_code,document_prefix,target_table_name,target_record_id,generation_status,generation_reason,reserved_at,consumed_at,generated_by,generated_at,created_by,updated_by)
 values(r.id,s.id,ref,next_seq,r.module_code,r.document_type_code,r.document_prefix,p_table,p_record,p_status,p_reason,
  case when p_status='reserved' then p_at end,case when p_status='consumed' then p_at end,p_actor,p_at,p_actor,p_actor) returning * into g;
 update public.global_numbering_sequence_states set last_sequence_number=next_seq,next_sequence_number=next_seq+1,last_generated_reference=ref,
  last_generated_at=p_at,updated_by=p_actor where id=s.id;
 update public.global_numbering_rules set current_sequence_number=next_seq,next_sequence_number=next_seq+1,updated_by=p_actor where id=r.id;
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(p_actor,'numbering','global_numbering_generated_references',g.id,ref,'generate',jsonb_build_object('status',p_status,'operation_id',p_operation));
 if p_operation is not null then insert into erp_private.numbering_requests values(p_actor,p_operation,h,g.id,now());end if;
 return erp_private.numbering_result(g,false);
end $$;
revoke all on function erp_private.numbering_allocate(bigint,text,text,uuid,bigint,text,text,bigint,text,timestamptz) from public,anon,authenticated,service_role;

create function public.allocate_numbering_reference(p_operation uuid,p_rule_id bigint default null,p_rule_code text default null,
 p_document_type_code text default null,p_status text default 'reserved',p_target_table_name text default null,
 p_target_record_id bigint default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate') then
  raise exception 'Numbering permission denied' using errcode='42501';end if;
 if p_operation is null then raise exception 'Operation ID is required' using errcode='22023';end if;
 return erp_private.numbering_allocate(p_rule_id,p_rule_code,p_document_type_code,p_operation,public.current_user_profile_id(),p_status,p_target_table_name,p_target_record_id,p_reason,now());
end $$;
revoke all on function public.allocate_numbering_reference(uuid,bigint,text,text,text,text,bigint,text) from public,anon,service_role;
grant execute on function public.allocate_numbering_reference(uuid,bigint,text,text,text,text,bigint,text) to authenticated;

create function erp_private.numbering_preview(p_id bigint,p_code text,p_type text,p_sequence bigint,p_at timestamptz)
returns table(preview_reference_number text,document_prefix text,sequence_number bigint,format_template text,rule_id bigint)
language plpgsql stable security invoker set search_path='' as $$
declare r public.global_numbering_rules; n bigint; period text;
begin
 r:=erp_private.numbering_select(p_id,p_code,p_type,p_at);
 period:=erp_private.numbering_period(r.reset_policy,r.format_template,p_at);
 select next_sequence_number into n from public.global_numbering_sequence_states where numbering_rule_id=r.id and reset_period_key=period;
 if n is null then
  select greatest(r.starting_sequence_number,coalesce(max(generated_sequence_number)+1,r.starting_sequence_number),
   case when period='GLOBAL' then r.next_sequence_number else r.starting_sequence_number end) into n
   from public.global_numbering_generated_references where numbering_rule_id=r.id and
    (period='GLOBAL' or erp_private.numbering_period(r.reset_policy,r.format_template,generated_at)=period);
 end if;
 n:=coalesce(p_sequence,n);
 if n>9007199254740990 then raise exception 'Sequence exceeds supported exact integer range' using errcode='22003';end if;
 return query select erp_private.numbering_format(r.format_template,r.document_prefix,n,r.sequence_length,r.padding_character,p_at),r.document_prefix,n,r.format_template,r.id;
end $$;
revoke all on function erp_private.numbering_preview(bigint,text,text,bigint,timestamptz) from public,anon,authenticated;

create or replace function public.preview_next_reference_number(p_rule_code text default null,p_document_type_code text default null,p_next_sequence_number bigint default null)
returns table(preview_reference_number text,document_prefix text,sequence_number bigint,format_template text,rule_id bigint)
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' and (not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.preview')) then
  raise exception 'Numbering permission denied' using errcode='42501';end if;
 return query select * from erp_private.numbering_preview(null,p_rule_code,p_document_type_code,p_next_sequence_number,now());
end $$;
revoke all on function public.preview_next_reference_number(text,text,bigint) from public,anon;
grant execute on function public.preview_next_reference_number(text,text,bigint) to authenticated,service_role;

create function public.preview_numbering_reference(p_rule_id bigint default null,p_rule_code text default null,p_document_type_code text default null,p_sequence bigint default null)
returns table(preview_reference_number text,document_prefix text,sequence_number bigint,format_template text,rule_id bigint)
language plpgsql security definer set search_path='' as $$
begin
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.preview') then
  raise exception 'Numbering permission denied' using errcode='42501';end if;
 return query select * from erp_private.numbering_preview(p_rule_id,p_rule_code,p_document_type_code,p_sequence,now());
end $$;
revoke all on function public.preview_numbering_reference(bigint,text,text,bigint) from public,anon,service_role;
grant execute on function public.preview_numbering_reference(bigint,text,text,bigint) to authenticated;

-- Compatibility for existing transactional consumers (F04 save RPCs). Standalone
-- consumers must adopt retained operation IDs before their acceptance is closed.
create or replace function public.generate_next_reference_number(p_rule_code text default null,p_document_type_code text default null,
 p_target_table_name text default null,p_target_record_id bigint default null,p_generation_reason text default null,p_generated_by bigint default null)
returns table(generated_reference_number text,generated_sequence_number bigint,numbering_rule_id bigint,sequence_state_id bigint,generation_status text)
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then
  if not erp_private.business_principal_is_active() or not (public.current_user_has_permission('numbering.rules.generate')
   or (p_rule_code='MASTER_DMS_DOCUMENT' and (public.current_user_has_permission('dms.documents.upload') or public.current_user_has_permission('dms.admin')))
   or (p_rule_code='HR_EMPLOYEE' and public.current_user_has_permission_any_scope('hr.employees.create'))
   or (p_rule_code in ('HR_CANDIDATE','HR_JOB_REQUISITION','HR_OFFER') and public.current_user_has_permission_any_scope('hr.recruitment.manage'))) then
   raise exception 'Numbering permission denied' using errcode='42501';end if;
  if p_generated_by is not null and p_generated_by is distinct from public.current_user_profile_id() then raise exception 'Actor mismatch' using errcode='42501';end if;
  p_generated_by:=public.current_user_profile_id();
 end if;
 result:=erp_private.numbering_allocate(null,p_rule_code,p_document_type_code,null,p_generated_by,'consumed',p_target_table_name,p_target_record_id,p_generation_reason,now());
 return query select result->>'generated_reference_number',(result->>'generated_sequence_number')::bigint,(result->>'numbering_rule_id')::bigint,(result->>'sequence_state_id')::bigint,result->>'generation_status';
end $$;
revoke all on function public.generate_next_reference_number(text,text,text,bigint,text,bigint) from public,anon;
grant execute on function public.generate_next_reference_number(text,text,text,bigint,text,bigint) to authenticated,service_role;

create function public.finish_numbering_reservation(p_operation uuid,p_status text,p_target_table_name text default null,p_target_record_id bigint default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare req erp_private.numbering_requests; g public.global_numbering_generated_references; actor bigint;
begin
 if not erp_private.business_principal_is_active() or not public.current_user_has_permission('numbering.rules.generate') then raise exception 'Numbering permission denied' using errcode='42501';end if;
 actor:=public.current_user_profile_id();
 if p_operation is null or p_status is null or p_status not in ('consumed','cancelled') or (p_target_table_name is null)<>(p_target_record_id is null)
  or p_target_record_id<1 or length(p_target_table_name)>100 or length(p_reason)>1000 or (p_status='cancelled' and nullif(btrim(p_reason),'') is null) then
  raise exception 'Invalid reservation completion' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-numbering:'||actor||':'||p_operation,0));
 select * into req from erp_private.numbering_requests where actor_id=actor and operation_id=p_operation;
 if not found then raise exception 'Reservation not found' using errcode='P0002';end if;
 select * into g from public.global_numbering_generated_references where id=req.reference_id for update;
 if g.generation_status=p_status and g.target_table_name is not distinct from p_target_table_name and g.target_record_id is not distinct from p_target_record_id
  and (p_status<>'cancelled' or g.cancelled_reason is not distinct from p_reason) then return erp_private.numbering_result(g,true);end if;
 if g.generation_status<>'reserved' then raise exception 'Reservation already completed differently' using errcode='PT409';end if;
 if (g.target_table_name is not null and g.target_table_name is distinct from p_target_table_name)
  or (g.target_record_id is not null and g.target_record_id is distinct from p_target_record_id) then
  raise exception 'Reservation target cannot be reassigned' using errcode='22023';end if;
 update public.global_numbering_generated_references set generation_status=p_status,target_table_name=p_target_table_name,target_record_id=p_target_record_id,
  consumed_at=case when p_status='consumed' then now() end,cancelled_at=case when p_status='cancelled' then now() end,
  cancelled_reason=case when p_status='cancelled' then p_reason end,updated_by=actor where id=g.id returning * into g;
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(actor,'numbering','global_numbering_generated_references',g.id,g.generated_reference_number,case when p_status='cancelled' then 'cancel' else 'update' end,jsonb_build_object('status',p_status,'operation_id',p_operation));
 return erp_private.numbering_result(g,false);
end $$;
revoke all on function public.finish_numbering_reservation(uuid,text,text,bigint,text) from public,anon,service_role;
grant execute on function public.finish_numbering_reservation(uuid,text,text,bigint,text) to authenticated;

-- Reject bad future rule writes without silently repairing historical rows.
create function erp_private.numbering_rule_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.rule_code is distinct from old.rule_code then raise exception 'Rule code is immutable' using errcode='22023';end if;
 if current_user not in ('postgres','supabase_admin') then
  if not erp_private.business_principal_is_active() then raise exception 'Inactive principal' using errcode='42501';end if;
  if (tg_op='INSERT' and new.is_locked) or (tg_op='UPDATE' and (old.is_locked or new.is_locked is distinct from old.is_locked)) then
   if not public.current_user_has_permission('numbering.rules.lock') then raise exception 'Lock permission required' using errcode='42501';end if;
  end if;
  if tg_op='UPDATE' and (new.current_sequence_number is distinct from old.current_sequence_number or new.next_sequence_number is distinct from old.next_sequence_number) then
   raise exception 'Counters can only change through allocation' using errcode='42501';end if;
  if tg_op='INSERT' and (new.current_sequence_number<>0 or new.next_sequence_number<>new.starting_sequence_number) then
   raise exception 'New counters must match the starting sequence' using errcode='22023';end if;
 end if;
 -- Allocation updates metadata only. Legacy malformed rule corrections must be
 -- explicit, but an already-issued history is not rewritten by migration.
 if tg_op='INSERT' or (to_jsonb(new)-array['current_sequence_number','next_sequence_number','workspace_revision','updated_at','updated_by']) is distinct from
   (to_jsonb(old)-array['current_sequence_number','next_sequence_number','workspace_revision','updated_at','updated_by']) then
  perform erp_private.numbering_format(new.format_template,new.document_prefix,new.starting_sequence_number,new.sequence_length,new.padding_character,now());
  perform erp_private.numbering_period(new.reset_policy,new.format_template,now());
  if btrim(new.rule_name)='' or btrim(new.module_name)='' or btrim(new.document_type_name)='' or new.rule_code !~ '^[A-Z0-9_]{1,100}$'
   or new.cancelled_number_policy<>'never_reuse' or new.starting_sequence_number>9007199254740990 then
   raise exception 'Invalid numbering rule values' using errcode='22023';end if;
  if tg_op='UPDATE' and exists(select 1 from public.global_numbering_generated_references where numbering_rule_id=old.id) and
   (new.document_type_code,new.module_code,new.document_prefix,new.format_template,new.sequence_length,new.padding_character,new.reset_policy,new.starting_sequence_number)
   is distinct from (old.document_type_code,old.module_code,old.document_prefix,old.format_template,old.sequence_length,old.padding_character,old.reset_policy,old.starting_sequence_number) then
   raise exception 'Issued numbering format is immutable; create a replacement rule' using errcode='22023';end if;
 end if;
 return new;
end $$;
-- Trigger uses caller privileges, so it may run the pure validators (no data reads).
grant execute on function erp_private.numbering_format(text,text,bigint,integer,text,timestamptz),erp_private.numbering_period(text,text,timestamptz) to authenticated;
revoke all on function erp_private.numbering_rule_guard() from public,anon,authenticated;
create trigger f06_numbering_rule_guard before insert or update on public.global_numbering_rules for each row execute function erp_private.numbering_rule_guard();

-- Stable owner for both existing wrappers and new owner-only helpers, including
-- local replay under supabase_admin. Never grant allocator access to API roles.
alter table erp_private.numbering_requests owner to postgres;
alter function erp_private.numbering_format(text,text,bigint,integer,text,timestamptz) owner to postgres;
alter function erp_private.numbering_period(text,text,timestamptz) owner to postgres;
alter function erp_private.numbering_select(bigint,text,text,timestamptz) owner to postgres;
alter function erp_private.numbering_result(public.global_numbering_generated_references,boolean) owner to postgres;
alter function erp_private.numbering_allocate(bigint,text,text,uuid,bigint,text,text,bigint,text,timestamptz) owner to postgres;
alter function erp_private.numbering_preview(bigint,text,text,bigint,timestamptz) owner to postgres;
alter function erp_private.numbering_rule_guard() owner to postgres;
alter function public.allocate_numbering_reference(uuid,bigint,text,text,text,text,bigint,text) owner to postgres;
alter function public.preview_numbering_reference(bigint,text,text,bigint) owner to postgres;
alter function public.finish_numbering_reservation(uuid,text,text,bigint,text) owner to postgres;

notify pgrst,'reload schema';
commit;
