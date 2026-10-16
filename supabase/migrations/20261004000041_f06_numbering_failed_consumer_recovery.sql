begin;

-- A failed consumer may know its destination table before it creates a row.
-- Cancellation retains that original context; it cannot fabricate/rebind a
-- business record merely to satisfy the successful-consumption input contract.
-- Existing actor ownership, generation authority and transaction locks remain.
create or replace function public.finish_numbering_reservation(
 p_operation uuid,p_status text,p_target_table_name text default null,
 p_target_record_id bigint default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 req erp_private.numbering_requests;
 g public.global_numbering_generated_references;
 actor bigint;
 target_table text;
 target_record bigint;
begin
 if not erp_private.business_principal_is_active()
  or not public.current_user_has_permission('numbering.rules.generate') then
  raise exception 'Numbering permission denied' using errcode='42501';
 end if;
 actor:=public.current_user_profile_id();
 if p_operation is null or p_status is null or p_status not in ('consumed','cancelled')
  or p_target_record_id<1 or length(p_target_table_name)>100 or length(p_reason)>1000
  or (p_target_table_name is not null and btrim(p_target_table_name)='')
  or (p_status='consumed' and (p_target_table_name is null)<>(p_target_record_id is null))
  or (p_status='cancelled' and nullif(btrim(p_reason),'') is null) then
  raise exception 'Invalid reservation completion' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('f06-numbering:'||actor||':'||p_operation,0));
 select * into req from erp_private.numbering_requests where actor_id=actor and operation_id=p_operation;
 if not found then raise exception 'Reservation not found' using errcode='P0002';end if;
 select * into strict g from public.global_numbering_generated_references where id=req.reference_id for update;

 if p_status='cancelled' then
  if (p_target_table_name is not null and p_target_table_name is distinct from g.target_table_name)
   or (p_target_record_id is not null and p_target_record_id is distinct from g.target_record_id) then
   raise exception 'Cancellation must retain the original reservation target' using errcode='22023';
  end if;
  target_table:=g.target_table_name;
  target_record:=g.target_record_id;
 else
  target_table:=p_target_table_name;
  target_record:=p_target_record_id;
 end if;

 if g.generation_status=p_status and g.target_table_name is not distinct from target_table
  and g.target_record_id is not distinct from target_record
  and (p_status<>'cancelled' or g.cancelled_reason is not distinct from p_reason) then
  return erp_private.numbering_result(g,true);
 end if;
 if g.generation_status<>'reserved' then
  raise exception 'Reservation already completed differently' using errcode='PT409';
 end if;
 if (g.target_table_name is not null and g.target_table_name is distinct from target_table)
  or (g.target_record_id is not null and g.target_record_id is distinct from target_record) then
  raise exception 'Reservation target cannot be reassigned' using errcode='22023';
 end if;

 update public.global_numbering_generated_references
 set generation_status=p_status,target_table_name=target_table,target_record_id=target_record,
  consumed_at=case when p_status='consumed' then now() end,
  cancelled_at=case when p_status='cancelled' then now() end,
  cancelled_reason=case when p_status='cancelled' then p_reason end,updated_by=actor
 where id=g.id returning * into g;
 insert into public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 values(actor,'numbering','global_numbering_generated_references',g.id,g.generated_reference_number,
  case when p_status='cancelled' then 'cancel' else 'update' end,
  jsonb_build_object('status',p_status,'operation_id',p_operation,'target_table',target_table,'target_record',target_record));
 return erp_private.numbering_result(g,false);
end $$;
alter function public.finish_numbering_reservation(uuid,text,text,bigint,text) owner to postgres;
revoke all on function public.finish_numbering_reservation(uuid,text,text,bigint,text) from public,anon,service_role;
grant execute on function public.finish_numbering_reservation(uuid,text,text,bigint,text) to authenticated;

notify pgrst,'reload schema';
commit;
