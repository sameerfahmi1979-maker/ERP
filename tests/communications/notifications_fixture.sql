-- Minimal ERP rows for the isolated PG cluster; live F10/HR behavior has its own native suite.
create or replace function auth.uid() returns uuid language sql stable as $$
select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',lpad(nullif(current_setting('test.actor',true),''),32,'0'))::uuid $$;
create or replace function public.f03_current_session_valid() returns boolean language sql stable as $$
select auth.uid() is not null and exists(select from public.user_profiles where auth_user_id=auth.uid() and id<>7) $$;
create function public.current_user_profile_id() returns bigint language sql stable as $$select id from public.user_profiles where auth_user_id=auth.uid()$$;
create function public.current_user_has_permission(text) returns boolean language sql stable as $$select public.f03_current_session_valid()$$;
alter table public.employees add column reporting_manager_id bigint,add column employee_status text,add column joining_date date, add column inactive_date date;
create table public.employee_shift_assignments(employee_id bigint,deleted_at timestamptz,attendance_required boolean,effective_from date,effective_to date,work_shift_id bigint,work_calendar_id bigint,weekly_off_day text);
create table public.work_shifts(id bigint,calendar_id bigint,deleted_at timestamptz,is_active boolean,is_overnight boolean,shift_end_time time);
create table public.work_calendars(id bigint,is_active boolean,deleted_at timestamptz,owner_company_id bigint,effective_from date,effective_to date,has_ramadan_timing boolean,has_summer_timing boolean,working_days text[],weekend_days text[]);
create table public.erp_notifications(id bigint primary key,recipient_user_id bigint,channel_in_app boolean,created_at timestamptz default clock_timestamp(),metadata_json jsonb,status text,source_entity_type text,source_entity_id bigint,deleted_at timestamptz,scheduled_for timestamptz default now());
create table erp_private.notification_events(id bigint primary key,source_table text,event_type text,source_id bigint,source_snapshot jsonb,created_at timestamptz default clock_timestamp());
create table erp_private.notification_event_recipients(event_id bigint,profile_id bigint,notification_id bigint,state text);
create table public.dms_upload_sessions(id bigint primary key,status text,intake_status text,expires_at timestamptz,document_id bigint,uploaded_by bigint,session_code text,updated_at timestamptz default now());
create table public.employee_attendance_daily_summary(id bigint primary key,workspace_revision bigint,approval_status text,employee_id bigint,attendance_date date,created_by bigint,updated_at timestamptz default clock_timestamp());
create table public.employee_leave_requests(id bigint primary key,employee_id bigint,approval_status text,start_date date,deleted_at timestamptz,end_date date);
create function erp_private.mobile_hr_self(bigint) returns boolean language sql stable as $$select false$$;
create function public.f10_notification_target(text,bigint) returns text language sql stable as $$select case when public.current_user_profile_id()=2 then '/admin/hr/employees/record/101?task=leave&task_id='||$2 end$$;
create function public.f10_transition_my_notification(bigint,text) returns jsonb language plpgsql as $$begin update public.erp_notifications set status=$2 where id=$1 and recipient_user_id=public.current_user_profile_id();return '{}';end$$;


create table erp_private.ptt_phones(profile_id bigint,device_id uuid,auth_session uuid,availability text,stopped boolean);
create table public.dms_review_queue(id bigint primary key,upload_session_id bigint,assigned_to bigint,status text,deleted_at timestamptz);
create function erp_private.upload_session_allowed(bigint) returns boolean language sql stable as $$select public.current_user_profile_id() in(2,3)$$;
create function erp_private.f07_upload_subject_allowed(bigint) returns boolean language sql stable as $$select public.current_user_profile_id() in(2,3)$$;
create function erp_private.f10_review_notification_target(bigint) returns text language sql stable as $$select '/dms/review-queue?item_id='||id from public.dms_review_queue where id=$1 and assigned_to=public.current_user_profile_id() and deleted_at is null$$;
create function public.current_user_can_view_employee(bigint) returns boolean language sql stable as $$select public.current_user_profile_id() in(2,3)$$;
create or replace function erp_private.employee_permission(bigint,text) returns boolean language sql stable as $$select public.current_user_profile_id() in(2,3)$$;

-- Local catalog doubles capture scheduler requests without any network or cron daemon.
create schema cron;
create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
create table cron.job_run_details(jobid bigint);
create function cron.schedule(text,text,text) returns bigint language sql as $$
 insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid
$$;
select cron.schedule('existing-erp-fixture','0 0 * * *','select 1');
create schema vault;
create table vault.decrypted_secrets(name text,decrypted_secret text);
insert into vault.decrypted_secrets values('algt_internal_api_secret','synthetic-local-fixture-no-live-credential');
create schema net;
create table net.queued(id bigint generated always as identity primary key,body jsonb);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
declare job bigint;
begin
 if current_setting('test.net_fail',true)='yes' then raise exception 'fixture transport unavailable';end if;
 if url<>'https://erp.algt.net/api/internal/process-communication-push' or timeout_milliseconds<>45000
   or headers->>'Authorization' is distinct from 'Bearer synthetic-local-fixture-no-live-credential' then raise exception 'fixture transport contract';end if;
 insert into net.queued(body) values(body) returning id into job;
 return job;
end$$;
