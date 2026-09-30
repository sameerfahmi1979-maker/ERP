-- F09 integration: pause legacy consumers before applying. No worker is enabled here.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Full uniqueness permits PostgREST ignore-duplicate INSERT without a predicate.
drop index public.erp_email_queue_intent_key;
create unique index erp_email_queue_intent_key on public.erp_email_queue(intent_key);
-- Never let the rollout flag implicitly replay unresolved legacy mail. A release
-- operator must reconcile and explicitly approve any individual backlog release.
update public.erp_email_queue set paused_at=coalesce(paused_at,clock_timestamp())
 where status in ('pending','processing','failed') and deleted_at is null;
alter table public.erp_email_queue
  add column report_schedule_run_id bigint references public.erp_report_schedule_runs(id),
  add column source_revision text;
create unique index f09_queue_schedule_run on public.erp_email_queue(report_schedule_run_id)
  where report_schedule_run_id is not null;
alter table public.erp_report_schedule_runs add column delivery_engine text;
alter table public.erp_report_schedule_runs drop constraint chk_schedule_run_status;
alter table public.erp_report_schedule_runs add constraint chk_schedule_run_status check (
 status in ('queued','leased','running','succeeded','skipped','failed_retryable','failed_terminal'));
-- Explicitly distinguish new reservations from unresolved historical retry jobs.
alter table public.erp_report_schedule_runs alter column delivery_engine set default 'f09';
alter table public.erp_report_delivery_logs add column email_queue_id bigint references public.erp_email_queue(id);
create unique index f09_report_delivery_queue on public.erp_report_delivery_logs(email_queue_id);
alter table public.erp_report_delivery_logs drop constraint erp_report_delivery_logs_delivery_status_check;
alter table public.erp_report_delivery_logs add constraint erp_report_delivery_logs_delivery_status_check
 check(delivery_status in ('queued','sent','failed','cancelled','provider_accepted','delivery_unknown'));

create function public.f09_schedule_revision(s public.erp_report_schedules)
returns text language sql immutable security invoker set search_path='' as $$
 select md5(jsonb_build_array(s.report_id,s.created_by,s.owner_company_id,s.filters_json,
   s.selected_template_id,s.output_format,s.recipient_to,s.recipient_cc,
   s.email_subject_template,s.email_body_template,s.is_active,s.deleted_at)::text);
$$;
revoke all on function public.f09_schedule_revision(public.erp_report_schedules) from public,anon,authenticated;
grant execute on function public.f09_schedule_revision(public.erp_report_schedules) to service_role;

-- Browser clients must use permission-checked actions, never forge trusted producers,
-- worker state, principals or recipients via the Data API.
revoke insert,update,delete,truncate,references,trigger on public.erp_email_queue from public,anon,authenticated;
do $$ declare c record; begin
 for c in select column_name from information_schema.columns
   where table_schema='public' and table_name='erp_email_queue' loop
   execute format('revoke insert (%I), update (%I), references (%I) on public.erp_email_queue from public,anon,authenticated',
     c.column_name,c.column_name,c.column_name);
 end loop;
end $$;
create function public.f09_freeze_email_payload()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (to_jsonb(new)-array['status','processing_started_at','sent_at','cancelled_at','attempt_count',
 'next_retry_at','last_error','external_message_id','updated_at','deleted_at','lease_owner',
 'lease_token','lease_expires_at','dispatch_started_at','delivery_state','paused_at'])
 is distinct from
 (to_jsonb(old)-array['status','processing_started_at','sent_at','cancelled_at','attempt_count',
 'next_retry_at','last_error','external_message_id','updated_at','deleted_at','lease_owner',
 'lease_token','lease_expires_at','dispatch_started_at','delivery_state','paused_at']) then
   raise exception 'Email intent is immutable; cancel and create a new intent' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.f09_freeze_email_payload() from public,anon,authenticated;
create trigger f09_email_payload before update on public.erp_email_queue
 for each row execute function public.f09_freeze_email_payload();

-- Reserve manual requests idempotently without advancing the recurring pointer.
create function public.f09_manual_schedule_run(p_schedule_id bigint,p_request_id uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
declare s public.erp_report_schedules; rid bigint;
begin
 if p_request_id is null then raise exception 'Request key required'; end if;
 select * into s from public.erp_report_schedules where id=p_schedule_id and is_active and deleted_at is null for update;
 if not found then return null; end if;
 insert into public.erp_report_schedule_runs(schedule_id,scheduled_for,run_key,status,next_attempt_at,delivery_engine)
 values(s.id,clock_timestamp(),'manual-'||s.id||'-'||p_request_id,'failed_retryable',clock_timestamp(),'f09')
 on conflict(run_key) do nothing returning id into rid;
 if rid is null then select id into rid from public.erp_report_schedule_runs
   where run_key='manual-'||s.id||'-'||p_request_id and schedule_id=s.id; end if;
 return rid;
end $$;

-- One durable intent per new-engine run, including repair after response loss.
create function public.f09_enqueue_schedule_run(p_run_id bigint)
returns bigint language plpgsql security invoker set search_path='' as $$
declare r public.erp_report_schedule_runs; s public.erp_report_schedules; qid bigint;
begin
 select * into r from public.erp_report_schedule_runs where id=p_run_id for update;
 if not found or r.delivery_engine is distinct from 'f09' then return null; end if;
 select id into qid from public.erp_email_queue where report_schedule_run_id=r.id;
 if qid is not null then return qid; end if;
 if r.status<>'failed_retryable' or r.attempt_count<>0 then return null; end if;
 select * into s from public.erp_report_schedules where id=r.schedule_id and is_active and deleted_at is null for share;
 if not found then
   update public.erp_report_schedule_runs set status='skipped',failure_reason='F09:source_unavailable',
     finished_at=clock_timestamp() where id=r.id;
   return null;
 end if;
 insert into public.erp_email_queue(source_module,source_entity_type,source_entity_id,
   report_schedule_run_id,source_revision,intent_key,created_by,to_emails,cc_emails,subject,text_body,max_attempts)
 values('REPORTS','erp_report_schedules',s.id,r.id,public.f09_schedule_revision(s),'report-run-'||r.id,
   s.created_by,s.recipient_to,s.recipient_cc,'Scheduled report','Generated by the authorized report adapter',r.max_attempts)
 returning id into qid;
 update public.erp_report_schedule_runs set status='queued',next_attempt_at=null where id=r.id;
 return qid;
end $$;

-- This projection participates in the queue transaction. Projection/log errors roll
-- back finalization; a dispatched expired lease becomes unknown, never blind resend.
create function public.f09_project_report_delivery()
returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.erp_report_schedule_runs; log_id bigint;
begin
 if new.report_schedule_run_id is null then return new; end if;
 update public.erp_report_schedule_runs set
   status=case new.status when 'processing' then 'running' when 'sent' then 'succeeded'
     when 'pending' then 'failed_retryable' when 'cancelled' then 'skipped' else 'failed_terminal' end,
   attempt_count=new.attempt_count,next_attempt_at=new.next_retry_at,
   leased_by=new.lease_owner::text,leased_until=new.lease_expires_at,
   started_at=coalesce(started_at,new.processing_started_at),
   finished_at=case when new.status in ('sent','cancelled','failed','delivery_unknown') then clock_timestamp() else null end,
   failure_reason=case when new.status='sent' then 'F09:provider_accepted_not_delivery_confirmation'
     when new.status='delivery_unknown' then 'F09:delivery_unknown_manual_reconciliation' else new.last_error end
 where id=new.report_schedule_run_id returning * into r;
 if new.status is distinct from old.status and new.status<>'processing' then
   insert into public.erp_report_delivery_logs(email_queue_id,run_id,delivery_type,
     recipient_to,recipient_cc,attachment_filename,attachment_size_bytes,provider,
     delivery_status,provider_response_code,success,sent_at,error_message,created_by)
   values(new.id,r.report_run_id,'scheduled_email',new.to_emails,new.cc_emails,
     r.attachment_filename,r.attachment_size_bytes,'microsoft_graph',
     case new.status when 'sent' then 'provider_accepted' when 'delivery_unknown' then 'delivery_unknown'
       when 'pending' then 'queued' when 'cancelled' then 'cancelled' else 'failed' end,
     case when new.status='sent' then '202' end,new.status='sent',new.sent_at,r.failure_reason,new.created_by)
   on conflict(email_queue_id) do update set run_id=excluded.run_id,delivery_status=excluded.delivery_status,
     attachment_filename=excluded.attachment_filename,attachment_size_bytes=excluded.attachment_size_bytes,
     provider_response_code=excluded.provider_response_code,success=excluded.success,
     sent_at=excluded.sent_at,error_message=excluded.error_message
   returning id into log_id;
   update public.erp_report_schedule_runs set delivery_log_id=log_id where id=r.id;
   if new.status in ('sent','failed','cancelled','delivery_unknown') then
     update public.erp_report_schedules set last_run_at=clock_timestamp(),
       last_status=case new.status when 'sent' then 'success' when 'cancelled' then 'cancelled' else 'failed' end
       where id=r.schedule_id;
   end if;
 end if;
 return new;
end $$;
revoke all on function public.f09_project_report_delivery() from public,anon,authenticated;
create trigger f09_report_delivery after update on public.erp_email_queue
 for each row execute function public.f09_project_report_delivery();

-- Existing notification history remains populated. Canonical immutable attempt
-- events remain the authority; this compatibility log never stores message bodies.
create function public.f09_project_notification_delivery()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status is distinct from old.status and new.status<>'processing'
   and (old.status='processing' or new.status='cancelled') then
  insert into public.erp_notification_delivery_logs(notification_id,email_queue_id,provider_config_id,
   delivery_channel,status,message,attempt_number,metadata_json,created_by)
  values(new.notification_id,new.id,new.provider_config_id,'email',
   case new.status when 'sent' then 'provider_accepted' when 'pending' then 'retry_scheduled' else new.status end,
   case new.status when 'sent' then 'Provider accepted; inbox delivery is not confirmed.' else 'F09 queue outcome' end,
   new.attempt_count,jsonb_build_object('engine','f09','lease_token',old.lease_token),new.created_by);
 end if;
 return new;
end $$;
revoke all on function public.f09_project_notification_delivery() from public,anon,authenticated;
create trigger f09_notification_delivery after update on public.erp_email_queue
 for each row execute function public.f09_project_notification_delivery();

create function public.f09_cancel_email(p_id bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed bigint;
begin
 update public.erp_email_queue set status='cancelled',cancelled_at=clock_timestamp(),
   updated_at=clock_timestamp(),lease_owner=null,lease_token=null,lease_expires_at=null
 where id=p_id and deleted_at is null and dispatch_started_at is null
   and status in ('pending','processing') returning id into changed;
 return changed is not null;
end $$;

-- Retry button cannot bypass provider cooldown, claim budget, cancellation or
-- uncertain/permanent outcomes. It only confirms an already retryable intent.
create function public.f09_retry_email(p_id bigint)
returns boolean language sql security invoker set search_path='' as $$
 select exists(select 1 from public.erp_email_queue where id=p_id and status='pending'
   and last_error='F09:retry' and deleted_at is null and cancelled_at is null and paused_at is null
   and attempt_count<max_attempts);
$$;
revoke all on function public.f09_manual_schedule_run(bigint,uuid),
 public.f09_enqueue_schedule_run(bigint),public.f09_cancel_email(bigint),public.f09_retry_email(bigint)
 from public,anon,authenticated;
grant execute on function public.f09_manual_schedule_run(bigint,uuid),
 public.f09_enqueue_schedule_run(bigint),public.f09_cancel_email(bigint),public.f09_retry_email(bigint)
 to service_role;

-- Recheck the source snapshot atomically at the last pre-network transition.
create or replace function public.f09_begin_email_dispatch(p_id bigint,p_owner uuid,p_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.erp_email_queue;
begin
 update public.erp_email_queue e set dispatch_started_at=clock_timestamp(),updated_at=clock_timestamp()
 where e.id=p_id and e.status='processing' and e.lease_owner=p_owner and e.lease_token=p_token
   and e.lease_expires_at>clock_timestamp() and e.dispatch_started_at is null
   and e.deleted_at is null and e.cancelled_at is null and e.paused_at is null
   and (e.report_schedule_run_id is null or exists(
     select 1 from public.erp_report_schedules s where s.id=e.source_entity_id
       and s.is_active and s.deleted_at is null and public.f09_schedule_revision(s)=e.source_revision))
 returning * into q;
 if not found then return false; end if;
 insert into public.erp_email_attempt_events(queue_id,attempt_number,lease_token,event,correlation_id)
 values(q.id,q.attempt_count,q.lease_token,'dispatching',q.lease_token);
 return true;
end $$;
create function public.f09_schedule_is_current(p_id bigint,p_revision text)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.erp_report_schedules s where s.id=p_id and s.is_active
   and s.deleted_at is null and public.f09_schedule_revision(s)=p_revision);
$$;
revoke all on function public.f09_schedule_is_current(bigint,text) from public,anon,authenticated;
grant execute on function public.f09_schedule_is_current(bigint,text) to service_role;
create function public.f09_record_report_preparation(p_id bigint,p_owner uuid,p_token uuid,
 p_report_run_id bigint,p_filename text,p_size integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.erp_email_queue;
begin
 if p_size is null or p_size<0 or p_size>3000000 or p_report_run_id is null then
   raise exception 'Invalid prepared report metadata'; end if;
 select * into q from public.erp_email_queue where id=p_id and status='processing'
   and lease_owner=p_owner and lease_token=p_token and lease_expires_at>clock_timestamp()
   and dispatch_started_at is null and report_schedule_run_id is not null for update;
 if not found then return false; end if;
 update public.erp_report_schedule_runs set report_run_id=p_report_run_id,
   attachment_filename=p_filename,attachment_size_bytes=p_size,
   recipient_count=cardinality(q.to_emails)+coalesce(cardinality(q.cc_emails),0)
   where id=q.report_schedule_run_id;
 return true;
end $$;
revoke all on function public.f09_record_report_preparation(bigint,uuid,uuid,bigint,text,integer) from public,anon,authenticated;
grant execute on function public.f09_record_report_preparation(bigint,uuid,uuid,bigint,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
