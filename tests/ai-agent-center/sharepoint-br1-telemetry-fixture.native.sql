-- Extend the disposable worker-telemetry fixture with one approved BR1 source.
do $fixture$
begin
  if current_database() <> 'agent_center_heartbeat_native'
     or inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'An isolated Agent Center telemetry fixture is required';
  end if;
end $fixture$;

alter table erp_private.agent_pdf_policy add column officer_id bigint;
alter table public.dms_upload_sessions add column ai_result_id bigint;
alter table public.dms_review_queue add column ai_result_id bigint, add column assigned_to bigint;
create table public.dms_ai_extraction_results (
  id bigint primary key, upload_session_id bigint, job_id bigint
);
create table erp_private.dms_sharepoint_br1_review_scope (
  connection_id uuid primary key, company_id bigint, branch_id bigint, actor_id bigint,
  officer_id bigint, item_id text, source_version text, sha256 text, expires_at timestamptz
);
create table erp_private.dms_sharepoint_br1_review_state (
  operation_id uuid primary key, upload_session_id bigint unique, officer_id bigint,
  result_id bigint, review_id bigint, notification_event_id bigint
);

update public.branches set branch_code = 'BR1' where id = 11;
insert into public.user_profiles values (103, 'active', 1), (104, 'active', 1);
update erp_private.agent_pdf_policy set actor_id = 103, officer_id = 104
where connection_id = '10000000-0000-0000-0000-000000000003';
insert into erp_private.agent_sync_checkpoints(connection_id, updated_at, paused, revision)
values ('10000000-0000-0000-0000-000000000003', now(), false, 0);
insert into erp_private.dms_agent_center_controls(company_id, branch_id, agent_key, worker_bound, enabled, mode)
values (1, 11, 'dms.intake', true, true, 'execute');
insert into erp_private.dms_sharepoint_br1_review_scope
values ('10000000-0000-0000-0000-000000000003', 1, 11, 103, 104, 'a', 'v1', repeat('a', 64), now() + interval '1 day');
insert into erp_private.agent_source_versions(connection_id,item_id,version)
values ('10000000-0000-0000-0000-000000000003','extra','v1');
insert into erp_private.agent_source_items(connection_id,item_id,version,filename,ancestor_ids)
values ('10000000-0000-0000-0000-000000000003','extra','v1','extra.pdf',array['FixtureSource']);
