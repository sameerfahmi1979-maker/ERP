-- Finite pilot upload stages only. No grant, allocation, worker, feature or row
-- is enrolled/rewritten. Legacy upload defaults and existing retained data stay.
begin;
create function erp_comm_cost.pilot_upload_stage_expiry(p_permit uuid,p_actor bigint,p_args jsonb)
returns timestamptz language plpgsql volatile set search_path='' as $$
declare r erp_comm_cost.reservation%rowtype;p erp_comm_cost.proof%rowtype;
 b erp_comm_cost.baseline_allocation%rowtype;w erp_comm_cost.host_window%rowtype;n timestamptz:=clock_timestamp();
begin
 select * into r from erp_comm_cost.reservation where permit_id=p_permit;
 select * into p from erp_comm_cost.proof where operation_id=r.operation_id;
 -- Only the explicit existing-plan + prepaid-host pilot opts in. Independent
 -- legacy retention/operating plans keep their original 24-hour stage policy.
 if p.operation_id is null or lower(ltrim(p.retained_at_zero_cost_evidence))not like'existing-plan:%'
   or not exists(select from erp_comm_cost.host_proof_link l where l.operation_id=r.operation_id)then
   return n+interval'24 hours';
 end if;
 if p.retained_at_zero_cost_evidence!~'^existing-plan:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'then
   raise sqlstate'PT503'using message='pilot_upload_window_unavailable';end if;
 select * into b from erp_comm_cost.baseline_allocation where id=substring(p.retained_at_zero_cost_evidence from 15)::uuid;
 select hw.* into w from erp_comm_cost.host_proof_link l join erp_comm_cost.host_window hw on hw.funding_permit=l.funding_permit
   where l.operation_id=r.operation_id;
 if r.permit_id is null or r.scope<>'communications'or r.feature<>'media_upload'or p.feature<>'media_upload'
   or r.actor_id is distinct from p_actor::text or r.actor_session is null
   or r.actor_session is distinct from(auth.jwt()->>'session_id')::uuid
   or r.consumed_xid is distinct from pg_current_xact_id()or r.consumed_at is null or r.settled_at is not null
   or r.expires_at<=n or erp_private.provider_actor_session_valid(p_actor,r.actor_session)is not true
   or r.command_hash is distinct from sha256(convert_to(jsonb_build_object('op','chat.uploadBegin','args',p_args)::text,'UTF8'))
   or b.id is null or r.approval_id is distinct from b.approval_id or p.approval_id is distinct from b.approval_id
   or w.funding_permit is null or w.approval_id is distinct from b.approval_id or w.deployment_id is distinct from r.host_deployment_id
   or w.admission_ends_at<=n or w.ends_at is distinct from w.admission_ends_at+interval'1 hour'
   or w.ends_at>b.valid_until or not erp_comm_cost.retention_covered(p)
   or not erp_comm_cost.host_operation_covered(r.operation_id,r.approval_id,r.host_deployment_id,true)then
   raise sqlstate'PT503'using message='pilot_upload_window_unavailable';end if;
 -- Existing stage_open requires expiry+1h cleanup coverage. Its unchanged worker,
 -- immutable stage holds, storage fence and late-write lease therefore fit the
 -- exact original prepaid tail. The operation cannot mint or extend a window.
 return least(n+interval'24 hours',w.admission_ends_at);
end $$;
revoke all on function erp_comm_cost.pilot_upload_stage_expiry(uuid,bigint,jsonb)from public,anon,authenticated,service_role;

do $patch_upload_begin$
declare source text;needle text;
begin
 source:=pg_get_functiondef('erp_private.chat_mutate(text,jsonb,bigint,uuid)'::regprocedure);
 needle:='INSERT INTO erp_private.chat_uploads(actor,reserving_session,conversation,filename,mime,size_bytes,voice) VALUES(p,(auth.jwt()->>''session_id'')::uuid,c.id,basename,mime,(a->>''byteLength'')::bigint,coalesce(kind=''voice'',false)) RETURNING * INTO up;';
 if(length(source)-length(replace(source,needle,'')))/length(needle)<>1 then
   raise exception'Unexpected chat uploadBegin source; pilot lifetime amendment not installed';end if;
 execute replace(source,needle,'INSERT INTO erp_private.chat_uploads(actor,reserving_session,conversation,filename,mime,size_bytes,voice,stage_expires_at) VALUES(p,(auth.jwt()->>''session_id'')::uuid,c.id,basename,mime,(a->>''byteLength'')::bigint,coalesce(kind=''voice'',false),erp_comm_cost.pilot_upload_stage_expiry(ticket,p,a)) RETURNING * INTO up;');
end $patch_upload_begin$;
commit;
