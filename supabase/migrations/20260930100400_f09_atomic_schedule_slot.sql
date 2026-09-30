-- F09 slot reservation, not worker activation. Stop legacy schedule workers at
-- cutover. Existing successful runs and delivery history are never rewritten.
begin;
create function public.f09_reserve_schedule_slot(p_schedule_id bigint,
  p_expected_due timestamptz, p_expected_updated_at timestamptz, p_next_due timestamptz)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare s public.erp_report_schedules; run_id bigint; slot_key text;
begin
  if p_expected_due is null or p_expected_updated_at is null or p_next_due is null
    or not isfinite(p_expected_due) or not isfinite(p_next_due)
    or p_next_due<=p_expected_due then raise exception 'invalid schedule slot'; end if;
  select * into s from public.erp_report_schedules e where e.id=p_schedule_id
    and e.next_run_at=p_expected_due and e.updated_at=p_expected_updated_at
    and e.is_active and e.deleted_at is null and e.next_run_at<=clock_timestamp()
    for update skip locked;
  if not found then return null; end if;
  slot_key := 'sched-'||s.id::text||'-'||floor(extract(epoch from p_expected_due)*1000)::bigint::text;
  insert into public.erp_report_schedule_runs(schedule_id,scheduled_for,run_key,status,next_attempt_at)
    values(s.id,p_expected_due,slot_key,'failed_retryable',clock_timestamp())
    on conflict(run_key) do nothing returning id into run_id;
  if run_id is null then
    -- Reconcile the legacy split-write failure: preserve the existing run and
    -- repair its original pointer, regardless of whether the run already sent.
    select id into run_id from public.erp_report_schedule_runs where run_key=slot_key
      and schedule_id=s.id and scheduled_for=p_expected_due;
    if run_id is null then raise exception 'schedule key conflict'; end if;
  end if;
  update public.erp_report_schedules set next_run_at=p_next_due,updated_at=clock_timestamp() where id=s.id;
  -- An UPDATE failure rolls back the reservation in this same transaction.
  return run_id;
end $$;
revoke all on function public.f09_reserve_schedule_slot(bigint,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.f09_reserve_schedule_slot(bigint,timestamptz,timestamptz,timestamptz) to service_role;
commit;
