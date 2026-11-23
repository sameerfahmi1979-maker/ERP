begin;
set local lock_timeout='5s';
create table erp_private.notification_devices (
 id uuid primary key default gen_random_uuid(), installation uuid not null, profile_id bigint not null references public.user_profiles on delete cascade,
 registered_at timestamptz not null default clock_timestamp(), session_id uuid not null, token text not null unique check(length(token) between 32 and 4096), unique(profile_id,installation)
);
create table erp_private.notification_inbox (
 id uuid primary key default gen_random_uuid(), n bigint generated always as identity unique,
 kind text not null check(kind in ('chat','erp','budget','ptt','sos','intake','leaveStart','timesheet','moderation','employeeExpiry','leaveChange')),
 source uuid not null, profile_id bigint not null references public.user_profiles on delete cascade,
 created_at timestamptz not null default clock_timestamp(), read_at timestamptz, unique(kind,source,profile_id)
);
create index notification_inbox_person on erp_private.notification_inbox(profile_id,n desc);
create table erp_private.notification_sources (
 id uuid primary key default gen_random_uuid(), kind text not null, record_id bigint not null,
 revision text not null, generation bigint generated always as identity unique, unique(kind,record_id,revision)
);
create table erp_private.notification_push_jobs (
 id uuid primary key default gen_random_uuid(), event uuid not null references erp_private.notification_inbox on delete cascade,
 device uuid not null references erp_private.notification_devices on delete cascade, unique(event,device),
 state text not null default 'pending' check(state in ('pending','working','accepted','suppressed','failed')),
 attempts integer not null default 0, prepared_permit uuid, next_try timestamptz not null default now(), lease uuid
);
create index notification_jobs_due on erp_private.notification_push_jobs(next_try,id) where state in('pending','working');
create table erp_private.notification_setting_receipts(
 profile_id bigint not null references public.user_profiles on delete cascade, session_id uuid not null, mutation uuid not null,
 request_hash bytea not null, primary key(profile_id,session_id,mutation)
);
create table erp_private.notification_preferences (
 profile_id bigint primary key references public.user_profiles on delete cascade, settings jsonb not null default '{}'
);
-- No conversation is classified as eligible for text previews on installation. Only
-- explicitly policy-approved ordinary chat channels may expose this bounded projection.
create table erp_private.notification_preview_channels (
 conversation uuid primary key references erp_private.chat_conversations, policy_version text not null references erp_private.comms_policy_versions(version)
);
create function erp_private.notification_enqueue(p_kind text,p_source uuid,p_recipient bigint,p_devices uuid[]) returns uuid
language plpgsql set search_path='' as $$
declare event uuid;
begin
 if not erp_private.chat_active(p_recipient) then return null; end if;
 insert into erp_private.notification_inbox(kind,source,profile_id) values(p_kind,p_source,p_recipient)
 on conflict(kind,source,profile_id) do nothing returning id into event;
 if event is null then select id into event from erp_private.notification_inbox where kind=p_kind and source=p_source and profile_id=p_recipient;return event;end if;
 -- Legacy ERP/budget fan-out is materialized in bounded pages inside a paid scheduler tick.
 if p_kind in ('chat','erp','intake','timesheet','leaveStart','employeeExpiry','leaveChange','budget') then return event;end if;
 insert into erp_private.notification_push_jobs(event,device) select event,d.id from erp_private.notification_devices d where d.profile_id=p_recipient and (p_devices is null or d.id=any(p_devices))
  and (p_kind not in ('ptt','sos') or exists(select from erp_private.ptt_phones ph where ph.profile_id=d.profile_id and ph.device_id=d.installation
   and ph.auth_session=d.session_id and ph.availability<>'offDuty' and not ph.stopped));
 return event;
end $$;
create function erp_private.notification_enqueue(p_kind text,p_source uuid,p_recipient bigint) returns uuid
language sql set search_path='' as $$select erp_private.notification_enqueue(p_kind,p_source,p_recipient,null)$$;
create function erp_private.notification_source(k text,i bigint,r text) returns uuid language plpgsql set search_path='' as $$
declare sid uuid;
begin
 insert into erp_private.notification_sources(kind,record_id,revision) values(k,i,r) on conflict do nothing returning id into sid;
 if sid is null then select id into strict sid from erp_private.notification_sources where kind=k and record_id=i and revision=r;end if;
 return sid;
end $$;
create table erp_private.notification_capture_gate(
 id boolean primary key check(id), enabled boolean not null default false, controls boolean not null default false,
 enabled_since timestamptz, control_since timestamptz
);
insert into erp_private.notification_capture_gate(id) values(true);
create function erp_private.notification_gate_changed() returns trigger language plpgsql set search_path='' as $$
begin
 if new.enabled and not old.enabled then new.enabled_since:=clock_timestamp();end if;
 if new.controls and not old.controls then new.control_since:=clock_timestamp();end if;
 return new;
end $$;
create trigger notification_gate_transition before update on erp_private.notification_capture_gate for each row execute function erp_private.notification_gate_changed();
create table erp_private.notification_recovery_cursor(source text primary key,last_id bigint not null default 0);
create function erp_private.notification_ingest(source_name text,source_id bigint,recovery boolean) returns void language plpgsql set search_path='' as $$
declare sid uuid; p bigint; rowdata record; prior text;
begin
 case source_name
 when 'notification_events' then select * into rowdata from erp_private.notification_events where id=source_id;
 when 'erp_notifications' then select * into rowdata from public.erp_notifications where id=source_id;
 when 'alert' then select * into rowdata from erp_comm_cost.alert where event_id=source_id;
 when 'dms_upload_sessions' then select * into rowdata from public.dms_upload_sessions where id=source_id;
 when 'employee_attendance_daily_summary' then select * into rowdata from public.employee_attendance_daily_summary where id=source_id;
 else raise invalid_parameter_value;end case;
 if not found then return;end if;
 if source_name='notification_events' then
  if rowdata.source_table='employee_leave_requests' or (rowdata.source_table in('employee_identity_documents','employee_medical_insurances') and rowdata.source_snapshot ? 't19_policy_id') then
   for p in select l.user_profile_id from public.erp_user_employee_links l where l.employee_id=(rowdata.source_snapshot->>'employee_id')::bigint
    and erp_private.chat_active(l.user_profile_id)
    and not exists(select from erp_private.notification_event_recipients nr where nr.event_id=rowdata.id and nr.profile_id=l.user_profile_id and nr.state='created')
    and not exists(select from erp_private.notification_inbox i join erp_private.notification_sources s on i.source=s.id
      where i.profile_id=l.user_profile_id and s.kind in ('leaveChange','employeeExpiry') and s.record_id=rowdata.id)
    order by l.user_profile_id limit 4 loop
    if rowdata.source_table='employee_leave_requests' then
     perform erp_private.notification_enqueue('leaveChange',erp_private.notification_source('leaveChange',rowdata.id,'event'),p);
    elsif not (rowdata.source_snapshot->'recipient_ids' @> jsonb_build_array(p)) then
     perform erp_private.notification_enqueue('employeeExpiry',erp_private.notification_source('employeeExpiry',rowdata.id,'event'),p);
    end if;
   end loop;
  end if;
 elsif source_name='erp_notifications' then
  if rowdata.recipient_user_id is not null and rowdata.channel_in_app and rowdata.metadata_json ? 'f10_event_id' then
   if exists(select from erp_private.notification_inbox i join erp_private.notification_sources s on s.id=i.source
    where i.profile_id=rowdata.recipient_user_id and i.kind in('leaveChange','employeeExpiry') and s.record_id::text=rowdata.metadata_json->>'f10_event_id') then return;end if;
   perform erp_private.notification_enqueue('erp',erp_private.notification_source('erp',rowdata.id,'f10'),rowdata.recipient_user_id);
  end if;
 elsif source_name='alert' then
  select id into p from public.user_profiles where auth_user_id=rowdata.recipient_auth_id;
  begin
   perform erp_private.notification_enqueue('budget',rowdata.source_uuid,p);
  exception when others then
   -- The cost alert itself is durable. A notification failure cannot undo a pause or owner decision.
   return;
  end;
 elsif source_name='dms_upload_sessions' then
  if rowdata.intake_status in ('review_pending','approved') and rowdata.uploaded_by is not null then
   if recovery then
    select x.id,x.revision into sid,prior from erp_private.notification_sources x where x.kind='intake' and x.record_id=rowdata.id order by x.generation desc limit 1;
    if split_part(prior,':',1) is distinct from rowdata.intake_status then sid:=null;end if;
   end if;
   if sid is null then sid:=erp_private.notification_source('intake',rowdata.id,rowdata.intake_status||':'||coalesce(rowdata.updated_at,clock_timestamp())::text);end if;
   perform erp_private.notification_enqueue('intake',sid,rowdata.uploaded_by);
   for p in select distinct q.assigned_to from public.dms_review_queue q where q.upload_session_id=rowdata.id
    and q.status in('pending','in_review') and q.deleted_at is null and q.assigned_to is not null and q.assigned_to<>rowdata.uploaded_by
    and erp_private.chat_active(q.assigned_to) and not exists(select from erp_private.notification_inbox i where i.kind='intake' and i.source=sid and i.profile_id=q.assigned_to)
    order by q.assigned_to limit 4
   loop perform erp_private.notification_enqueue('intake',sid,p);end loop;
  end if;
 elsif source_name='employee_attendance_daily_summary' then
  if rowdata.approval_status not in('pending','queried') then return;end if;
  sid:=erp_private.notification_source('timesheet',rowdata.id,rowdata.workspace_revision::text||':'||rowdata.approval_status);
  if rowdata.approval_status='pending' then
   for p in select l.user_profile_id from public.employees e join public.erp_user_employee_links l on e.reporting_manager_id=l.employee_id where e.id=rowdata.employee_id
     and erp_private.chat_active(l.user_profile_id) and not exists(select from erp_private.notification_inbox i where i.kind='timesheet' and i.source=sid and i.profile_id=l.user_profile_id)
     order by l.user_profile_id limit 4 loop perform erp_private.notification_enqueue('timesheet',sid,p);end loop;
  else perform erp_private.notification_enqueue('timesheet',sid,rowdata.created_by);end if;
 end if;
end $$;
-- Authoritative ERP, DMS, chat and cost writes acquire no optional trigger or wake.
-- A funded projection recovers from committed rows, including messages during a held interval.
create function erp_private.notification_project_chat() returns void language sql set search_path='' as $$
 insert into erp_private.notification_inbox(kind,source,profile_id)
 select 'chat',m.id,member.profile_id from erp_private.chat_messages m join erp_private.chat_memberships member
  on member.conversation=m.conversation and member.left_at is null and member.joined_at<=m.sent_at and member.profile_id<>m.sender
 join erp_private.chat_conversations c on c.id=m.conversation
 where m.deleted_at is null and erp_private.chat_active(member.profile_id)
  and exists(select from erp_private.comms_chat_gate where singleton and enabled)
  and (c.kind='group' or not erp_private.comms_pair_blocked(c.direct_low,c.direct_high))
  and not exists(select from erp_private.notification_inbox i where i.kind='chat' and i.source=m.id and i.profile_id=member.profile_id)
 order by m.sent_at,m.id,member.profile_id limit 100 on conflict(kind,source,profile_id) do nothing
$$;

create function erp_private.notification_erp_target(nid bigint,p bigint) returns jsonb language plpgsql stable set search_path='' as $$
declare n public.erp_notifications;e erp_private.notification_events; path text;matches boolean:=false;who bigint;current_row jsonb;
begin
 if p is distinct from public.current_user_profile_id() or public.current_user_has_permission('notifications.view') is not true then return null;end if;
 select * into n from public.erp_notifications where id=nid and recipient_user_id=p and deleted_at is null and channel_in_app and status in('read','unread') and scheduled_for<=now();
 if not found then return null;end if;
 select ev.* into e from erp_private.notification_events ev join erp_private.notification_event_recipients rr on rr.event_id=ev.id
 where rr.profile_id=p and rr.notification_id=nid and rr.state='created' and ev.id::text=n.metadata_json->>'f10_event_id';
 if not found then return null;end if;
 path:=public.f10_notification_target(n.source_entity_type,n.source_entity_id);
 if path is null then return null;end if;
 if e.source_snapshot ? 't19_policy_id' then matches:=erp_private.t19_current_expiry_recipient(e,p);
  if (e.source_snapshot->>'days_remaining')::int>=0 and (e.source_snapshot->>'expiry_date')::date-(now() at time zone 'Asia/Dubai')::date<>(e.source_snapshot->>'days_remaining')::int then return null;end if;
 elsif e.source_table='dms_document_events' then
  if e.event_type='dms_numbered_filing_committed' then matches:=public.f10_numbered_filing_notification_recipient(e.id,p);
  elsif e.event_type in('approval_submitted','approval_approved') and e.source_snapshot->'metadata_json'->>'approval_status'='pending_approval' or e.event_type='approval_submitted' then
   select exists(select from erp_private.ai_mod04_approval_assignments x join public.dms_document_approvals a on a.id=x.approval_id
    where a.id=(e.source_snapshot->'metadata_json'->>'approval_id')::bigint and a.document_id=n.source_entity_id and a.is_current and a.action='submitted'
    and p=any(x.profile_ids) and p<>x.original_submitter and x.source_fingerprint=erp_private.f07_review_fingerprint(a.document_id)
    and x.workflow_fingerprint=erp_private.f07_workflow_fingerprint(a.workflow_id,a.document_id)
    and erp_private.ai_mod04_step_reviewer(p,a.document_id,a.step_id) and not exists(select from public.dms_document_approvals v where v.responds_to_approval_id=a.id and v.actioned_by=p and v.action='approved')) into matches;
  elsif e.event_type in('approval_approved','approval_rejected','approval_withdrawn') then
   select exists(select from public.dms_documents d where d.id=n.source_entity_id and p in(d.submitted_by,d.owner_user_id,d.created_by)
    and d.approval_status=e.source_snapshot->'metadata_json'->>'approval_status') into matches;
  end if;
 elsif e.source_table='dms_review_queue' then
  select exists(select from public.dms_review_queue q where q.id=e.source_id and q.assigned_to=p and q.status in('pending','in_review') and q.deleted_at is null) into matches;
 elsif e.source_table='dms_notification_queue' then matches:=public.f10_dms_notification_delivery_eligible(n.id) and exists(
  select from public.dms_notification_queue q join public.dms_expiry_reminders r on r.id=q.reminder_id join public.dms_documents d on d.id=q.document_id
  where q.id=e.source_id and q.recipient_user_id=p and r.status='pending' and r.document_id=d.id and d.expiry_date=r.reminder_date+r.reminder_days_before and coalesce(d.expiry_tracking_override,'')<>'ignored');
 elsif e.source_table in('employee_leave_requests','employee_approval_requests','employee_attendance_corrections','employee_identity_documents','employee_medical_insurances') then
  execute format('select to_jsonb(t) from public.%I t where t.id=$1',e.source_table) into current_row using e.source_id;
  if current_row is null or current_row->>'deleted_at' is not null then return null;end if;
  who:=(current_row->>'employee_id')::bigint;
  matches:=exists(select from public.employees emp join public.erp_user_employee_links l on l.employee_id in(emp.id,emp.reporting_manager_id)
    where emp.id=who and emp.deleted_at is null and l.user_profile_id=p)
    and not exists(select from jsonb_each(e.source_snapshot) s where s.key in('employee_id','approval_status','request_status','expiry_date') and s.value is distinct from current_row->s.key);
 end if;
 if matches is not true then return null;end if;
 return jsonb_build_object('kind','erp','id',n.id::text,'path',path,'read',n.status='read');
end $$;

create function erp_private.notification_target(i erp_private.notification_inbox) returns jsonb language plpgsql stable set search_path='' as $$
declare t jsonb;s erp_private.notification_sources;can_push boolean;
begin
 if i.profile_id is distinct from erp_private.comms_actor_id() then return null;end if;
 if i.kind='chat' then
  if not exists(select from erp_private.comms_chat_gate where singleton and enabled) then return null;end if;
  select jsonb_build_object('kind','chat','id',m.id,'conversationId',c.id,'seq',m.seq::text,'label',case when c.kind='group' then c.name else u.full_name end,
    'category',case when mention.profile_id is not null then 'mentions' when c.kind='direct' then 'direct' else 'groups' end,
    'pushEligible',not coalesce(pref.muted,false) or mention.profile_id is not null,'read',r.profile_id is not null)
  into t from erp_private.chat_messages m join erp_private.chat_conversations c on c.id=m.conversation
   join public.user_profiles u on u.id=m.sender
   join erp_private.chat_memberships member on member.conversation=c.id and member.profile_id=i.profile_id and member.left_at is null and member.joined_at<=m.sent_at
   left join erp_private.chat_reads r on r.message=m.id and r.profile_id=i.profile_id
   left join erp_private.chat_mentions mention on mention.message=m.id and mention.profile_id=i.profile_id and not erp_private.comms_pair_blocked(m.sender,i.profile_id)
   left join erp_private.chat_personal pref on pref.conversation=c.id and pref.profile_id=i.profile_id
   where m.id=i.source and m.deleted_at is null and m.sender<>i.profile_id and (c.kind='group' or not erp_private.comms_pair_blocked(c.direct_low,c.direct_high));
 elsif i.kind in ('erp','intake','leaveStart','timesheet','leaveChange','employeeExpiry') then
  select * into s from erp_private.notification_sources where id=i.source and kind=i.kind;
  if i.kind='erp' then t:=erp_private.notification_erp_target(s.record_id,i.profile_id);
  elsif i.kind in('leaveChange','employeeExpiry') then t:=erp_private.notification_employee_target(s,i.profile_id);
  elsif i.kind='intake' then
   select jsonb_build_object('kind','intake','id',u.id::text,'sessionCode',u.session_code,'stage',u.intake_status,'documentId',case when u.document_id is not null and public.current_user_can_view_dms_document(u.document_id) then u.document_id::text end) into t from public.dms_upload_sessions u
   where u.id=s.record_id and u.intake_status=split_part(s.revision,':',1) and u.status not in('cancelled','expired') and (u.intake_status='approved' or u.expires_at is null or u.expires_at>now())
    and not exists(select from erp_private.notification_sources newer where newer.kind='intake' and newer.record_id=s.record_id and newer.generation>s.generation)
    and (u.uploaded_by=i.profile_id or exists(select from public.dms_review_queue q where q.upload_session_id=u.id and q.assigned_to=i.profile_id and q.status in('pending','in_review') and q.deleted_at is null and erp_private.f10_review_notification_target(q.id) is not null))
    and erp_private.upload_session_allowed(u.id) and erp_private.f07_upload_subject_allowed(u.id);
  else t:=erp_private.notification_time_target(s,i.profile_id);end if;
 elsif i.kind='moderation' then t:=erp_private.notification_moderation_target(i.source,i.profile_id);
 elsif i.kind='budget' then
  t:=erp_private.notification_budget_target(i.source,i.profile_id);
  if t is not null then select t||jsonb_build_object('reason',a.reason,'feature',a.feature,'scope',a.scope) into t from erp_comm_cost.alert a where a.source_uuid=i.source;end if;
 elsif i.kind='ptt' then t:=erp_private.notification_ptt_target(i.source,i.profile_id);
 elsif i.kind='sos' then t:=erp_private.notification_sos_target(i.source,i.profile_id);
 end if;
 if t is null then return null;end if;
 return t || jsonb_build_object('category',coalesce(t->>'category',i.kind),'eventId',i.id,'createdAt',i.created_at,
  'read',(coalesce((t->>'read')::boolean,false) or i.read_at is not null));
end $$;
create function erp_private.notification_employee_target(s erp_private.notification_sources,p bigint) returns jsonb language plpgsql stable set search_path='' as $$
declare e erp_private.notification_events;emp bigint; n public.erp_notifications; r jsonb;
begin
 select * into e from erp_private.notification_events where id=s.record_id;
 emp:=(e.source_snapshot->>'employee_id')::bigint;
 if p<>erp_private.comms_actor_id() or erp_private.mobile_hr_self(emp) is not true then return null;end if;
 if s.kind='leaveChange' and e.source_table='employee_leave_requests' and erp_private.employee_permission(emp,'hr.leave.view') then
  select jsonb_build_object('kind','leaveChange','id',l.id::text,'date',l.start_date,'endDate',l.end_date,'status',l.approval_status,'employeeId',emp::text)
  into r from public.employee_leave_requests l where l.id=e.source_id and l.employee_id=emp and l.deleted_at is null and l.approval_status=e.source_snapshot->>'approval_status';
 elsif s.kind='employeeExpiry' and e.source_table in('employee_identity_documents','employee_medical_insurances') then
  select jsonb_build_object('kind','employeeExpiry','id',src.source_id::text,'date',src.expiry_date,'employeeId',emp::text,
   'documentId',case when src.evidence_id is not null and public.current_user_can_view_dms_document(src.evidence_id) then src.evidence_id::text end)
   into r from erp_private.t19_expiry_sources((now() at time zone 'Asia/Dubai')::date,e.source_table,e.source_id) src
   join erp_private.t19_expiry_policies pol on pol.id=(e.source_snapshot->>'t19_policy_id')::bigint and pol.active and pol.domain='hr' and pol.company_id=src.company_id and pol.branch_id is not distinct from src.branch_id
   where src.subject_id=emp and src.domain='hr' and src.expiry_date=(e.source_snapshot->>'expiry_date')::date and src.evidence_id is not distinct from (e.source_snapshot->>'evidence_id')::bigint
   and erp_private.t19_expiry_offset_allowed((e.source_snapshot->>'days_remaining')::int,pol.expiry_day,pol.escalation_days)
   and ((e.source_snapshot->>'days_remaining')::int<0 or src.expiry_date-(now() at time zone 'Asia/Dubai')::date=(e.source_snapshot->>'days_remaining')::int)
   and erp_private.employee_permission(emp,case e.source_table when 'employee_medical_insurances' then 'hr.medical.view' else 'hr.compliance.view' end);
 end if;
 if r is null then return null;end if;
 select notice.* into n from public.erp_notifications notice join erp_private.notification_event_recipients rr on rr.notification_id=notice.id and rr.profile_id=p and rr.event_id=e.id
 where notice.recipient_user_id=p and notice.deleted_at is null and notice.channel_in_app and notice.scheduled_for<=now();
 if found then
  if n.status not in('read','unread') then return null;end if;
  r:=r||jsonb_build_object('erpNotificationId',n.id::text,'read',n.status='read');
 end if;
 return r||jsonb_build_object('category','erp');
end $$;

-- Exact employee/date deadlines are supplied by an authoritative scheduling policy. An absent
-- deadline does not imply that every employee was required to submit on a holiday.
create table erp_private.notification_timesheet_deadlines(
 id bigint generated always as identity primary key, employee_id bigint not null references public.employees on delete cascade,
 work_date date not null, due_at timestamptz not null, cancelled boolean not null default false, unique(employee_id,work_date)
);
create table erp_private.notification_timesheet_policy(
 company_id bigint not null references public.owner_companies on delete cascade, branch_id bigint not null references public.branches on delete cascade,
 zone text not null, grace_minutes int not null check(grace_minutes between 0 and 1440), enabled boolean not null default false,
 primary key(company_id,branch_id)
);
-- A scheduled day requires one unambiguous current shift/calendar. Seasonal calendars
-- with unknown effective timing are held until the exact employee/date has a business deadline.
create function erp_private.notification_scheduled_day(p_employee bigint,p_day date) returns timestamptz language sql stable set search_path='' as $$
 select case when count(*)=1 then min(((p_day + case when shift.is_overnight then 1 else 0 end + shift.shift_end_time)
   at time zone pol.zone)+make_interval(mins=>pol.grace_minutes)) end
 from public.employees e join erp_private.notification_timesheet_policy pol on pol.company_id=e.owner_company_id and pol.branch_id=e.branch_id and pol.enabled
 join pg_catalog.pg_timezone_names zones on zones.name=pol.zone
 join public.employee_shift_assignments a on a.employee_id=e.id and a.deleted_at is null and a.attendance_required and a.effective_from<=p_day and (a.effective_to is null or a.effective_to>=p_day)
 join public.work_shifts shift on shift.id=a.work_shift_id and shift.deleted_at is null and shift.is_active
 join public.work_calendars cal on cal.id=shift.calendar_id and cal.id=a.work_calendar_id and cal.is_active and cal.deleted_at is null and (cal.owner_company_id is null or cal.owner_company_id=e.owner_company_id)
 where e.id=p_employee and e.deleted_at is null and e.employee_status in ('active','probation') and e.joining_date<=p_day and (e.inactive_date is null or e.inactive_date>p_day)
  and (cal.effective_from is null or cal.effective_from<=p_day) and (cal.effective_to is null or cal.effective_to>=p_day)
  and not cal.has_ramadan_timing and not cal.has_summer_timing
  and lower(to_char(p_day,'Dy'))=any(cal.working_days) and not(lower(to_char(p_day,'Dy'))=any(cal.weekend_days))
  and left(lower(coalesce(a.weekly_off_day,'')),3)<>lower(to_char(p_day,'Dy'))
  and not exists(select from public.employee_leave_requests l where l.employee_id=e.id and l.deleted_at is null and l.approval_status='approved' and p_day between l.start_date and l.end_date)
$$;
alter table erp_private.notification_timesheet_deadlines add column generated_from_shift boolean not null default false;
create function erp_private.notification_time_target(s erp_private.notification_sources,p bigint) returns jsonb language plpgsql stable set search_path='' as $$
declare emp bigint;dt date;state text;rid bigint; path text; submitter bigint; role_kind text;
begin
 if s.kind='leaveStart' then
  select employee_id,start_date,approval_status into emp,dt,state from public.employee_leave_requests
  where id=s.record_id and deleted_at is null and approval_status='approved' and start_date::text=s.revision and start_date>=(now() at time zone 'Asia/Dubai')::date;
  path:=public.f10_notification_target('employee_leave_requests',s.record_id);
  if path is null and (erp_private.mobile_hr_self(emp) is not true or erp_private.employee_permission(emp,'hr.leave.view') is not true) then return null;end if;
 elsif split_part(s.revision,':',1)='due' then
  select d.employee_id,d.work_date,'due' into emp,dt,state from erp_private.notification_timesheet_deadlines d where d.id=s.record_id and not d.cancelled
   and d.work_date::text=split_part(s.revision,':',2) and d.due_at<=now() and (not d.generated_from_shift or d.due_at=erp_private.notification_scheduled_day(d.employee_id,d.work_date)) and not exists(select from public.employee_attendance_daily_summary a where a.employee_id=d.employee_id and a.attendance_date=d.work_date);
  role_kind:='employee';
 else
  select employee_id,attendance_date,approval_status,created_by,id into emp,dt,state,submitter,rid from public.employee_attendance_daily_summary
   where id=s.record_id and approval_status in('pending','queried') and workspace_revision::text||':'||approval_status=s.revision;
  role_kind:=case when state='pending' then 'supervisor' else 'submitter' end;
 end if;
 if emp is null or not exists(select from public.employees e left join public.erp_user_employee_links l on l.user_profile_id=p where e.id=emp and e.deleted_at is null and (
   (role_kind is null and l.employee_id in(e.id,e.reporting_manager_id)) or (role_kind='supervisor' and l.employee_id=e.reporting_manager_id)
    or (role_kind='employee' and l.employee_id=e.id) or (role_kind='submitter' and p=submitter))) then return null;end if;
 if s.kind='timesheet' and (public.current_user_can_view_employee(emp) is not true or erp_private.employee_permission(emp,'hr.attendance.view') is not true) then return null;end if;
 return jsonb_strip_nulls(jsonb_build_object('kind',s.kind,'id',s.record_id::text,'employeeId',emp::text,'date',dt,'status',state,'path',path));
end $$;
create function erp_private.notification_collect_due() returns void language plpgsql set search_path='' as $$
declare r record;
begin
 insert into erp_private.notification_timesheet_deadlines(employee_id,work_date,due_at,generated_from_shift)
 select e.id,day.dt,deadline.due,true from erp_private.notification_timesheet_policy pol
 join public.employees e on e.owner_company_id=pol.company_id and e.branch_id=pol.branch_id and e.deleted_at is null
 join pg_catalog.pg_timezone_names zones on zones.name=pol.zone
 cross join lateral (values((now() at time zone pol.zone)::date-1),((now() at time zone pol.zone)::date)) day(dt)
 cross join lateral (select erp_private.notification_scheduled_day(e.id,day.dt) due) deadline
 where pol.enabled and deadline.due<=now() and not exists(select from public.employee_attendance_daily_summary summary where summary.employee_id=e.id and summary.attendance_date=day.dt)
 and not exists(select from erp_private.notification_timesheet_deadlines old where old.employee_id=e.id and old.work_date=day.dt
  and (not old.generated_from_shift or old.due_at is not distinct from deadline.due))
 order by day.dt,e.id limit 100
 on conflict(employee_id,work_date) do update set due_at=excluded.due_at where notification_timesheet_deadlines.generated_from_shift and notification_timesheet_deadlines.due_at is distinct from excluded.due_at;
 for r in select candidates.* from (select 'leaveStart' k,l.id,l.start_date::text rev,el.user_profile_id p from public.employee_leave_requests l join public.employees e on e.id=l.employee_id
  join public.erp_user_employee_links el on el.employee_id in(e.id,e.reporting_manager_id)
  where l.deleted_at is null and e.deleted_at is null and l.approval_status='approved' and l.start_date=(now() at time zone 'Asia/Dubai')::date+1
  union all select 'timesheet',d.id,'due:'||d.work_date,el.user_profile_id from erp_private.notification_timesheet_deadlines d join public.erp_user_employee_links el on el.employee_id=d.employee_id
  where d.due_at<=now() and not d.cancelled and not exists(select from public.employee_attendance_daily_summary a where a.employee_id=d.employee_id and a.attendance_date=d.work_date)
 ) candidates where erp_private.chat_active(candidates.p) and not exists(
   select from erp_private.notification_sources src join erp_private.notification_inbox inbox on inbox.source=src.id and inbox.kind=src.kind
   where src.kind=candidates.k and src.record_id=candidates.id and src.revision=candidates.rev and inbox.profile_id=candidates.p
 ) order by candidates.k,candidates.id,candidates.p limit 100
 loop perform erp_private.notification_enqueue(r.k,erp_private.notification_source(r.k,r.id,r.rev),r.p);end loop;
end $$;

create function public.erp_notification_center(p_request jsonb,p_permit uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor bigint:=erp_private.comms_actor_id();sid uuid:=(auth.jwt()->>'session_id')::uuid;op text:=p_request->>'op';a jsonb:=p_request->'args'; pref jsonb;i erp_private.notification_inbox;t jsonb; r jsonb;device erp_private.notification_devices;
 item_limit int:=40; last_n bigint; rows jsonb:='[]';cut bigint;more boolean:=false; opts jsonb;msg_count int;u uuid;
begin
 if jsonb_typeof(a) is distinct from 'object' or sid is null then raise invalid_parameter_value;end if;
 perform erp_comm_cost.take_permit(p_permit,case when op='notifications.registerDevice' then 'push' else 'chat' end,'communications',actor::text,p_request);
 select settings into pref from erp_private.notification_preferences where profile_id=actor;
 pref:=coalesce(pref,'{}');
 if op in('notifications.setPreferences','notifications.registerDevice','notifications.unregisterDevice') then
  u:=(a->>'clientMutationId')::uuid;
  if u is null then raise invalid_parameter_value;end if;
  insert into erp_private.notification_setting_receipts values(actor,sid,u,sha256(convert_to(p_request::text,'UTF8'))) on conflict do nothing;
  if not found then
   if not exists(select from erp_private.notification_setting_receipts nr where nr.profile_id=actor and nr.session_id=sid and nr.mutation=u and nr.request_hash=sha256(convert_to(p_request::text,'UTF8'))) then raise sqlstate 'PT409' using message='Operation changed';end if;
   if op='notifications.setPreferences' then return pref;end if;
   return jsonb_build_object('registered',exists(select from erp_private.notification_devices d where d.installation=(a->>'installation')::uuid and d.profile_id=actor and d.session_id=sid and (op='notifications.unregisterDevice' or d.token=a->>'token')));
  end if;
 end if;
 if op='notifications.preferences' then return pref;
 elsif op='notifications.setPreferences' then
  opts:=a->'settings';
  if jsonb_typeof(opts) is distinct from 'object' or exists(select from jsonb_each(opts) e where e.key not in('groups','direct','mentions','erp','intake','leaveStart','timesheet','budget','ptt','sos','moderation','textPreview','label','vibrate','sound','offline') or jsonb_typeof(e.value)<>'boolean') then raise invalid_parameter_value; end if;
  insert into erp_private.notification_preferences values(actor,opts) on conflict(profile_id) do update set settings=notification_preferences.settings||excluded.settings returning settings into pref;
  return pref;
 elsif op='notifications.registerDevice' then
  if length(a->>'token') not between 32 and 4096 or a->>'token' !~ '^[A-Za-z0-9_:.%-]+$' then raise invalid_parameter_value;end if;
  -- Token proves possession of this FCM installation. Deleting the old binding drops its queued jobs.
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||(a->>'installation'),2));
  perform pg_advisory_xact_lock(hashtextextended(a->>'token',1));
  delete from erp_private.notification_devices where token=a->>'token' and (profile_id,installation,session_id) is distinct from (actor,(a->>'installation')::uuid,sid);
  delete from erp_private.notification_devices where profile_id=actor and installation=(a->>'installation')::uuid and (session_id,token) is distinct from (sid,a->>'token');
  insert into erp_private.notification_devices(installation,profile_id,session_id,token) values((a->>'installation')::uuid,actor,sid,a->>'token') on conflict do nothing;
  if not exists(select from erp_private.notification_devices where installation=(a->>'installation')::uuid and session_id=sid and profile_id=actor and token=a->>'token') then raise sqlstate 'PT409' using message='Registration changed';end if;
  return jsonb_build_object('registered',true);
 elsif op='notifications.unregisterDevice' then
  delete from erp_private.notification_devices where profile_id=actor and session_id=sid and installation=(a->>'installation')::uuid;
  return jsonb_build_object('registered',false);
 elsif op in('notifications.list','notifications.webList') then
  cut:=coalesce((a->>'cursor')::bigint,9223372036854775807);
  item_limit:=coalesce((a->>'limit')::int,40);
  if item_limit not between 1 and 80 or coalesce(a->>'filter','all') not in('all','messages','erp') then raise invalid_parameter_value;end if;
  for i in select * from erp_private.notification_inbox where profile_id=actor and n<cut and (op<>'notifications.webList' or kind not in('sos','ptt')) and case a->>'filter' when 'messages' then kind='chat' when 'erp' then kind<>'chat' else true end order by n desc loop
   t:=erp_private.notification_target(i);
   if t is null then continue;end if;
   if jsonb_array_length(rows)=item_limit then more:=true;exit;end if;
   rows:=rows||jsonb_build_array(t - 'path' - 'sessionCode');last_n:=i.n;
  end loop;
  select count(*) into msg_count from erp_private.notification_inbox e where e.profile_id=actor and e.kind='chat' and (erp_private.notification_target(e)->>'read')::boolean=false;
  return jsonb_build_object('items',rows,'nextCursor',case when more then last_n::text end,'unreadMessages',msg_count);
 end if;
 select * into i from erp_private.notification_inbox where id=(a->>'eventId')::uuid and profile_id=actor and (op not in('notifications.webResolve','notifications.webMarkRead') or kind not in('sos','ptt')) for update;
 if not found then raise no_data_found;end if;
 t:=erp_private.notification_target(i);
 if t is null then raise no_data_found;end if;
 if op='notifications.preview' then
  if i.kind<>'chat' or coalesce((pref->>'textPreview')::boolean,false) is not true or coalesce((t->>'read')::boolean,true)
     or (t->>'pushEligible')::boolean is not true or coalesce((pref->>(t->>'category'))::boolean,true) is not true
     or not exists(select from erp_private.notification_devices d where d.profile_id=actor and d.session_id=sid and d.installation=(a->>'installation')::uuid)
     then return '{}';end if;
  select jsonb_build_object('text',left(regexp_replace(m.body,'[[:cntrl:]]',' ','g'),120))
    into r from erp_private.chat_messages m join erp_private.notification_preview_channels c on c.conversation=m.conversation
    join erp_private.comms_policy_versions v on v.version=c.policy_version and v.is_current
    join erp_private.comms_policy_acceptances accept on accept.profile_id=actor and accept.version=v.version
    where m.id=i.source and m.kind='message' and m.body is not null and m.deleted_at is null and m.dms_ref is null
      and not m.forwarded and m.reply_to is null and not exists(select from erp_private.chat_attachments att where att.message=m.id);
  return coalesce(r,'{}');
 elsif op in('notifications.resolve','notifications.webResolve') then return t;
 elsif op in ('notifications.reply','notifications.markRead','notifications.webMarkRead') then
  if i.kind='chat' then
   u:=(a->>'clientMutationId')::uuid;
   if op='notifications.reply' then
    if coalesce(length(btrim(a->>'body')),0) not between 1 and 4096 then raise invalid_parameter_value;end if;
    return erp_private.chat_mutate('chat.send',jsonb_build_object('clientMutationId',u,'conversationId',t->>'conversationId','replyToMessageId',t->>'id','body',a->>'body'),actor);
   end if;
   perform erp_private.chat_mutate('chat.read',jsonb_build_object('clientMutationId',u,'conversationId',t->>'conversationId','upToSeq',t->>'seq'),actor);
  elsif op='notifications.reply' then raise invalid_parameter_value;
  elsif i.kind='erp' or t?'erpNotificationId' then perform public.f10_transition_my_notification(coalesce(t->>'erpNotificationId',t->>'id')::bigint,'read');
  end if;
  update erp_private.notification_inbox set read_at=coalesce(read_at,clock_timestamp()) where id=i.id;
  return jsonb_build_object('read',true);
 end if;raise invalid_parameter_value;
end $$;
revoke all on function public.erp_notification_center(jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.erp_notification_center(jsonb,uuid) to authenticated;

create function public.erp_notification_control_read(p_kind text,p_event uuid,p_cursor bigint,p_profile bigint,p_session uuid,p_request uuid,p_native boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i erp_private.notification_inbox;actor uuid;claims text:=current_setting('request.jwt.claims',true); t jsonb;rows jsonb:='[]';last_n bigint;answer jsonb;
begin
 if p_kind not in('list','resolve','markRead') or p_request is null or erp_private.provider_actor_session_valid(p_profile,p_session) is not true then raise insufficient_privilege;end if;
 select auth_user_id into strict actor from public.user_profiles where id=p_profile and status='active' and must_change_password is false;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',p_session,'role','authenticated')::text,true);
 if erp_private.comms_actor_id() is distinct from p_profile then raise insufficient_privilege;end if;
 if p_kind='list' then
  if p_event is not null then raise invalid_parameter_value;end if;
  if erp_comm_cost.take_control_read(case when p_native then 'control' else 'budget' end,null,p_profile,p_session,p_request) is not true then raise sqlstate 'PT503' using message='Control read unavailable';end if;
  for i in select * from erp_private.notification_inbox where profile_id=p_profile and (kind='budget' or (p_native and kind='sos')) and n<coalesce(p_cursor,9223372036854775807) order by n desc limit 16 loop
   last_n:=i.n;t:=erp_private.notification_target(i);
   if t is not null then rows:=rows||jsonb_build_array(t);end if;
  end loop;
  answer:=jsonb_build_object('items',rows,'nextCursor',case when exists(select from erp_private.notification_inbox x where x.profile_id=p_profile and (x.kind='budget' or (p_native and x.kind='sos')) and x.n<last_n) then last_n::text end);
 else
  select * into i from erp_private.notification_inbox where id=p_event and profile_id=p_profile and (kind='budget' or (p_native and kind='sos'));
  if not found then raise no_data_found;end if;
  if erp_comm_cost.take_control_read(i.kind,i.source,p_profile,p_session,p_request) is not true then raise sqlstate 'PT503' using message='Control read unavailable';end if;
  answer:=erp_private.notification_target(i);
  if answer is null then raise no_data_found;end if;
  if p_kind='markRead' then update erp_private.notification_inbox set read_at=coalesce(read_at,clock_timestamp()) where id=i.id;answer:=jsonb_build_object('read',true);end if;
 end if;
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 return answer;
end $$;
revoke all on function public.erp_notification_control_read(text,uuid,bigint,bigint,uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.erp_notification_control_read(text,uuid,bigint,bigint,uuid,uuid,boolean) to service_role;

create function public.erp_notification_worker(p_op text,p_args jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j erp_private.notification_push_jobs;d erp_private.notification_devices;i erp_private.notification_inbox;
 t jsonb;pref jsonb;bind jsonb;claims text:=current_setting('request.jwt.claims',true);actor uuid;sid uuid;outcome text:=p_args->>'outcome';result jsonb;
begin
 if p_op='claim' then
  select jobs.* into j from erp_private.notification_push_jobs jobs join erp_private.notification_inbox e on e.id=jobs.event
    where jobs.state in('pending','working') and jobs.next_try<=clock_timestamp()
      and case when e.kind in('sos','budget') then coalesce((p_args->>'control')::boolean,false) else coalesce((p_args->>'ordinary')::boolean,false) end
    order by case e.kind when 'sos' then 0 when 'budget' then 1 else 2 end,jobs.next_try,jobs.id limit 1 for update of jobs skip locked;
  if not found then return null;end if;
  update erp_private.notification_push_jobs set state='working',lease=gen_random_uuid(),prepared_permit=null,next_try=clock_timestamp()+interval '110 seconds' where id=j.id returning * into j;
  select * into strict d from erp_private.notification_devices where id=j.device;
  return jsonb_build_object('jobId',j.id,'lease',j.lease,'profileId',d.profile_id::text,'sessionId',d.session_id,'control',exists(select from erp_private.notification_inbox e where e.id=j.event and e.kind in('sos','budget')));
 end if;
 select * into j from erp_private.notification_push_jobs where id=(p_args->>'jobId')::uuid and state='working' and lease=(p_args->>'lease')::uuid and next_try>clock_timestamp() for update;
 if not found then return null;end if;
 if p_op='finish' then
  if outcome not in('accepted','retry','held','suppressed','failed','invalidToken') or outcome is null then raise invalid_parameter_value;end if;
  if outcome='invalidToken' then delete from erp_private.notification_devices where id=j.device;return 'true';end if;
  update erp_private.notification_push_jobs set
   state=case when outcome='held' then 'pending' when outcome='retry' and attempts<8 then 'pending' when outcome='retry' then 'failed' else outcome end,
   attempts=attempts+case when outcome='held' then 0 else 1 end,lease=null,
   next_try=clock_timestamp()+case when outcome='held' then interval '15 minutes' else make_interval(secs=>least(3600,30*(2^least(attempts,7))::int)) end where id=j.id;
  return 'true';
 elsif p_op not in('prepare','confirm') then raise invalid_parameter_value;end if;
 select * into strict d from erp_private.notification_devices where id=j.device;
 select * into strict i from erp_private.notification_inbox where id=j.event and profile_id=d.profile_id;
 select auth_user_id into actor from public.user_profiles where id=d.profile_id and status='active' and must_change_password is false;
 if i.kind in('ptt','sos') and not exists(select from erp_private.ptt_phones ph where ph.profile_id=d.profile_id and ph.device_id=d.installation and ph.auth_session=d.session_id and ph.availability<>'offDuty' and not ph.stopped) then return null;end if;
 if actor is null or erp_private.provider_actor_session_valid(d.profile_id,d.session_id) is not true then return null;end if;
 -- Trusted dispatch uses only the registration's actual current ERP session. No client supplies a subject.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',d.session_id,'role','authenticated')::text,true);
 t:=erp_private.notification_target(i);
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 select settings into pref from erp_private.notification_preferences where profile_id=d.profile_id;
 if t is null or coalesce((t->>'read')::boolean,false) or not coalesce((t->>'pushEligible')::boolean,true)
    or not coalesce((pref->>(t->>'category'))::boolean,true) then return null;end if;
 bind:=jsonb_build_object('op','notifications.deliver','args',jsonb_build_object('jobId',j.id,'lease',j.lease));
 if i.kind in ('sos','budget') then
  if p_args ? 'permitId' then raise invalid_parameter_value;end if;
  if p_op='prepare' then
   if erp_comm_cost.take_notice_attempt(i.kind,i.source,d.profile_id,d.id,j.id,j.lease) is not true then raise sqlstate 'PT503' using message='Control notice funding unavailable';end if;
   update erp_private.notification_push_jobs set prepared_permit=j.lease where id=j.id;
  else
   if j.prepared_permit is distinct from j.lease or erp_comm_cost.notice_attempt_valid(i.kind,i.source,d.profile_id,d.id,j.id,j.lease) is not true then raise sqlstate 'PT503' using message='Control notice admission expired';end if;
   update erp_private.notification_push_jobs set prepared_permit=null where id=j.id;
  end if;
 elsif p_op='prepare' then
  perform erp_comm_cost.take_service_permit((p_args->>'permitId')::uuid,'push','communications',d.profile_id::text,d.session_id,bind);
  update erp_private.notification_push_jobs set prepared_permit=(p_args->>'permitId')::uuid where id=j.id;
 elsif j.prepared_permit is null or j.prepared_permit is distinct from (p_args->>'permitId')::uuid then return null;
 else
  if not exists(select from erp_comm_cost.reservation r where r.permit_id=j.prepared_permit and r.expires_at>clock_timestamp()
     and not exists(select from erp_comm_cost.pause q where q.scope=r.scope and q.feature=r.feature)
     and not exists(select from erp_comm_cost.unit_hold h join erp_comm_cost.capacity c on c.id=h.capacity_id where h.permit_id=r.permit_id and (not c.enabled or c.valid_until<=clock_timestamp()))
     and (r.approval_id is null or exists(select from erp_comm_cost.approval appr where appr.id=r.approval_id and appr.revoked_at is null and appr.ends_at>clock_timestamp()))) then return null;end if;
  update erp_private.notification_push_jobs set prepared_permit=null where id=j.id;
 end if;
 return jsonb_strip_nulls(jsonb_build_object('token',d.token,'eventId',i.id,'accountId',actor,'category',t->>'category',
  'label',case when i.kind='chat' and coalesce((pref->>'label')::boolean,true) then left(regexp_replace(t->>'label','[[:cntrl:]]','','g'),100) end,
  'vibrate',coalesce((pref->>'vibrate')::boolean,true),'sound',coalesce((pref->>'sound')::boolean,true)));
end $$;
revoke all on function public.erp_notification_worker(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.erp_notification_worker(text,jsonb) to service_role;

-- Nothing registers a pg_cron job, starts a process timer or sends a wake on installation.
-- A single finite, explicitly funded run may hand off one committed pg_net request at a time.
create table erp_private.notification_mobile_scheduler(
 id boolean primary key check(id), run_id uuid, ticket uuid, pool uuid references erp_comm_cost.control_pool(permit_id),
 phase text not null default 'stopped' check(phase in('queued','running','stopped')),
 deadline timestamptz, ready_at timestamptz, remaining int not null default 0 check(remaining>=0),
 calendar_enabled boolean not null default false, push_enabled boolean not null default false
);
insert into erp_private.notification_mobile_scheduler(id) values(true);
create function erp_private.notification_recover() returns void language plpgsql set search_path='' as $$
declare src record;item record;cut bigint;last_seen bigint;query text;
begin
 for src in select v.*,case when v.source='alert' then g.control_since else g.enabled_since end as since
  from erp_private.notification_capture_gate g cross join (values
   ('notification_events','erp_private','id','created_at'),('erp_notifications','public','id','created_at'),
   ('dms_upload_sessions','public','id','updated_at'),('employee_attendance_daily_summary','public','id','updated_at'),
   ('alert','erp_comm_cost','event_id','created_at')) v(source,ns,key,col)
  where g.id and case when v.source='alert' then g.controls else g.enabled end
 loop
  select last_id into cut from erp_private.notification_recovery_cursor where source=src.source;
  last_seen:=0;
  query:=format('select %I id from %I.%I where %I>$1 and %I>=$2 order by %I limit 32',src.key,src.ns,src.source,src.key,src.col,src.key);
  for item in execute query using coalesce(cut,0),src.since loop
   begin perform erp_private.notification_ingest(src.source,item.id,true);
   exception when others then null;
   end;
   -- Keep moving past a bad record. Returning to zero next cycle retries it.
   last_seen:=item.id;
  end loop;
  insert into erp_private.notification_recovery_cursor values(src.source,last_seen)
   on conflict(source) do update set last_id=excluded.last_id;
 end loop;
end $$;
create function erp_private.notification_project_devices() returns void language sql set search_path='' as $$
 insert into erp_private.notification_push_jobs(event,device)
 select i.id,d.id from erp_private.notification_inbox i join erp_private.notification_devices d on d.profile_id=i.profile_id and d.registered_at<=i.created_at
 where i.kind in ('chat','erp','intake','timesheet','leaveStart','employeeExpiry','leaveChange','budget')
 and i.read_at is null and not exists(select from erp_private.notification_push_jobs j where j.event=i.id and j.device=d.id)
 order by i.n,d.id limit 64 on conflict(event,device) do nothing
$$;
create function erp_private.notification_stop_scheduler(p_run uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update erp_private.notification_mobile_scheduler set phase='stopped',ticket=null,remaining=0,calendar_enabled=false,push_enabled=false
  where id and run_id=p_run;
 return found;
end $$;

create function erp_private.notification_queue_tick(p_run uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare cfg erp_private.notification_mobile_scheduler;cp erp_comm_cost.control_pool; next_ticket uuid:=gen_random_uuid();cutoff timestamptz;
 ready timestamptz; secret text; request_id bigint; funded_pool uuid;
begin
 select * into cfg from erp_private.notification_mobile_scheduler where id and run_id=p_run and phase='running' for update;
 if not found then return false;end if;
 select * into cp from erp_comm_cost.control_pool where permit_id=cfg.pool and enabled and kind='notification_tick' and subject='mobile-notifications';
 if cp.permit_id is null or cp.poll_seconds not between 1 and 20 or cfg.remaining<1
  or least(cfg.deadline,cp.valid_until)<=clock_timestamp()+make_interval(secs=>cp.poll_seconds+45)
 then perform erp_private.notification_stop_scheduler(p_run);return false;end if;
 -- Never roll into another pool/approval after exhausting the exact initial grant.
 begin
  cutoff:=erp_comm_cost.debit_control('notification_tick','mobile-notifications',next_ticket);
  select d.pool into funded_pool from erp_comm_cost.control_debit d where d.command_id=next_ticket;
  if funded_pool is not null and funded_pool<>cfg.pool then raise sqlstate 'PT409';end if;
 exception when sqlstate 'PT409' then cutoff:=null; -- Undo a wrong-pool debit atomically.
 end;
 if cutoff is null or cutoff<=clock_timestamp() or funded_pool is distinct from cfg.pool then
  perform erp_private.notification_stop_scheduler(p_run);return false;end if;
 ready:=clock_timestamp()+make_interval(secs=>cp.poll_seconds);
 -- The debit covers this one queue submission, idle wait, DB probe, bounded tick work,
 -- max eight claims and final confirmation. Attempts remain charged on transport/vault failure.
 begin
  select min(decrypted_secret) into secret from vault.decrypted_secrets where name='algt_internal_api_secret' having count(*)=1;
  if secret is not null and length(secret) between 32 and 256 then
   request_id:=net.http_post(url:='https://erp.algt.net/api/internal/process-communication-push',
     headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),
     body:=jsonb_build_object('runId',p_run,'ticket',next_ticket,'readyAtMs',ceil(extract(epoch from ready)*1000)::bigint),
     timeout_milliseconds:=45000);
  end if;
 exception when others then request_id:=null;
 end;
 if request_id is null then perform erp_private.notification_stop_scheduler(p_run);return false;end if;
 update erp_private.notification_mobile_scheduler set phase='queued',ticket=next_ticket,ready_at=ready,remaining=remaining-1 where id;
 return true;
end $$;

-- A designated database operator binds a single pre-enrolled A17 pool and an explicit deadline.
-- A missing/crashed ERP receiver leaves no autonomous repeating job; restarting needs a fresh paid launch.
create function erp_private.notification_start_scheduler(p_pool uuid,p_until timestamptz,p_ticks int,p_calendar boolean,p_push boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare cfg erp_private.notification_mobile_scheduler;cp erp_comm_cost.control_pool;new_run uuid:=gen_random_uuid();
begin
 select * into strict cfg from erp_private.notification_mobile_scheduler where id for update;
 if cfg.phase<>'stopped' and cfg.deadline>clock_timestamp() then raise sqlstate 'PT409' using message='Existing notification run';end if;
 if p_until is null or not isfinite(p_until) or p_until<=clock_timestamp() or p_until>clock_timestamp()+interval '24 hours'
  or p_ticks is null or p_ticks not between 1 and 4096 or p_calendar is null or p_push is null then raise invalid_parameter_value;end if;
 select * into cp from erp_comm_cost.control_pool where permit_id=p_pool and kind='notification_tick' and subject='mobile-notifications' and enabled;
 if cp.permit_id is null or p_until>cp.valid_until or p_ticks>cp.max_actions-cp.used-1 then raise sqlstate 'PT503' using message='Finite notification run unavailable';end if;
 update erp_private.notification_mobile_scheduler set run_id=new_run,pool=p_pool,phase='running',remaining=p_ticks,deadline=p_until,
  ticket=null,ready_at=null,calendar_enabled=p_calendar,push_enabled=p_push where id;
 if not erp_private.notification_queue_tick(new_run) then return null;end if;
 return new_run;
end $$;

create function public.erp_notification_tick(p_op text,p_run uuid,p_ticket uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg erp_private.notification_mobile_scheduler; cp erp_comm_cost.control_pool;
begin
 select * into cfg from erp_private.notification_mobile_scheduler where id and run_id=p_run and ticket=p_ticket for update;
 if not found then return null;end if;
 select * into cp from erp_comm_cost.control_pool where permit_id=cfg.pool and enabled;
 if cp.permit_id is null or least(cfg.deadline,cp.valid_until)<=clock_timestamp() or cfg.ready_at-make_interval(secs=>cp.poll_seconds)+interval '45 seconds'<=clock_timestamp() then
  perform erp_private.notification_stop_scheduler(p_run);return null;end if;
 if p_op='admit' then
  if cfg.phase<>'queued' or clock_timestamp()<cfg.ready_at
    or not exists(select from erp_comm_cost.control_debit where pool=cfg.pool and command_id=p_ticket)
   then return null;end if;
  if least(cfg.deadline,cp.valid_until,cfg.ready_at-make_interval(secs=>cp.poll_seconds)+interval '45 seconds')<=clock_timestamp()+interval '20 seconds' then
   perform erp_private.notification_stop_scheduler(p_run);return null;end if;
  update erp_private.notification_mobile_scheduler set phase='running' where id;
  if exists(select from erp_private.notification_capture_gate where enabled or controls) then perform erp_private.notification_recover();end if;
  if cfg.calendar_enabled and exists(select from erp_private.notification_capture_gate where enabled) then perform erp_private.notification_collect_due();end if;
  perform erp_private.notification_project_chat();
  if cfg.push_enabled then perform erp_private.notification_project_devices();end if;
  return jsonb_build_object('pushEnabled',cfg.push_enabled,'workUntilMs',floor(extract(epoch from least(cfg.deadline,cp.valid_until,cfg.ready_at-make_interval(secs=>cp.poll_seconds)+interval '45 seconds'))*1000)::bigint);
 elsif p_op='finish' and cfg.phase='running' then
  return to_jsonb(erp_private.notification_queue_tick(p_run));
 elsif p_op='stop' then
  return to_jsonb(erp_private.notification_stop_scheduler(p_run));
 end if;
 return null;
end $$;
revoke all on function public.erp_notification_tick(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.erp_notification_tick(text,uuid,uuid) to service_role;
do $$ declare t text; f regprocedure;
begin
 foreach t in array array['notification_recovery_cursor','notification_capture_gate','notification_setting_receipts','notification_preview_channels','notification_devices','notification_inbox','notification_push_jobs','notification_sources','notification_preferences','notification_timesheet_deadlines','notification_timesheet_policy','notification_mobile_scheduler'] loop
  execute format('alter table erp_private.%I enable row level security',t);
  execute format('revoke all on table erp_private.%I from public,anon,authenticated,service_role',t);
 end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='erp_private'
  and p.proname=any(array['notification_enqueue','notification_source','notification_capture','notification_target','notification_erp_target','notification_time_target','notification_scheduled_day','notification_employee_target','notification_collect_due','notification_recover','notification_gate_changed','notification_ingest','notification_project_chat','notification_project_devices','notification_start_scheduler','notification_stop_scheduler','notification_queue_tick']) loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
