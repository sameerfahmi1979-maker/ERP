begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Existing indexes exclude retired assignments, but historical dependencies
-- intentionally include them. These indexes support the integrity checks only.
create index f06_shift_assignment_calendar_history on public.employee_shift_assignments(work_calendar_id) where work_calendar_id is not null;
create index f06_shift_assignment_shift_history on public.employee_shift_assignments(work_shift_id) where work_shift_id is not null;

-- Employee assignments retain references rather than snapshots. Once used,
-- freeze schedule-defining values (including retired assignment history).
-- Administrators create a new calendar/shift for a new schedule; no historical
-- assignment, attendance row, payroll value or inferred season date is rewritten.
-- Definer visibility is required for dependencies outside the writer's HR scope.
-- These private trigger-only functions return no employee data, expose no RPC,
-- and do not replace the existing scoped mutation authorization.
create function erp_private.protect_calendar_schedule_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_SCHEMA<>'public' or TG_TABLE_NAME<>'work_calendars' or TG_OP<>'UPDATE' then
  raise exception 'Unsupported history boundary' using errcode='22023';
 end if;
 if row(new.calendar_type,new.working_days,new.weekend_days,new.has_ramadan_timing,new.has_summer_timing,new.effective_from,new.effective_to)
  is distinct from row(old.calendar_type,old.working_days,old.weekend_days,old.has_ramadan_timing,old.has_summer_timing,old.effective_from,old.effective_to)
  and (exists(select 1 from public.employee_shift_assignments a where a.work_calendar_id=old.id)
   or exists(select 1 from public.employee_shift_assignments a join public.work_shifts s on s.id=a.work_shift_id where s.calendar_id=old.id)) then
  raise exception 'Create a new calendar to preserve assigned schedule history' using errcode='P0601';
 end if;
 return new;
end $$;

create function erp_private.protect_shift_schedule_history() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_SCHEMA<>'public' or TG_TABLE_NAME<>'work_shifts' or TG_OP<>'UPDATE' then
  raise exception 'Unsupported history boundary' using errcode='22023';
 end if;
 if row(new.shift_start_time,new.shift_end_time,new.break_start_time,new.break_end_time,new.total_hours,new.is_overnight,new.ramadan_start_time,new.ramadan_end_time,new.summer_start_time,new.summer_end_time)
  is distinct from row(old.shift_start_time,old.shift_end_time,old.break_start_time,old.break_end_time,old.total_hours,old.is_overnight,old.ramadan_start_time,old.ramadan_end_time,old.summer_start_time,old.summer_end_time)
  and exists(select 1 from public.employee_shift_assignments a where a.work_shift_id=old.id) then
  raise exception 'Create a new shift to preserve assigned schedule history' using errcode='P0601';
 end if;
 return new;
end $$;

-- Existing reference validation locks an explicitly supplied calendar and shift.
-- Also lock the shift's calendar when work_calendar_id is absent. This closes
-- the indirect-reference race with a simultaneous calendar-definition update.
create function erp_private.lock_assignment_schedule_history() returns trigger
language plpgsql security definer set search_path='' as $$
declare calendar_id bigint;
begin
 if TG_TABLE_SCHEMA<>'public' or TG_TABLE_NAME<>'employee_shift_assignments' or TG_OP not in ('INSERT','UPDATE') then
  raise exception 'Unsupported history boundary' using errcode='22023';
 end if;
 if TG_OP='UPDATE' and new.work_shift_id is not distinct from old.work_shift_id
  and new.work_calendar_id is not distinct from old.work_calendar_id
  and not (new.deleted_at is null and old.deleted_at is not null) then return new;end if;
 if new.work_shift_id is not null then
  select s.calendar_id into calendar_id from public.work_shifts s where s.id=new.work_shift_id for share;
  if calendar_id is not null then perform 1 from public.work_calendars c where c.id=calendar_id for share;end if;
 end if;
 return new;
end $$;

alter function erp_private.protect_calendar_schedule_history() owner to postgres;
alter function erp_private.protect_shift_schedule_history() owner to postgres;
alter function erp_private.lock_assignment_schedule_history() owner to postgres;
revoke all on function erp_private.protect_calendar_schedule_history(),erp_private.protect_shift_schedule_history(),erp_private.lock_assignment_schedule_history() from public,anon,authenticated,service_role;
create trigger f06_history_calendar before update on public.work_calendars for each row execute function erp_private.protect_calendar_schedule_history();
create trigger f06_history_shift before update on public.work_shifts for each row execute function erp_private.protect_shift_schedule_history();
create trigger f06_history_assignment before insert or update on public.employee_shift_assignments for each row execute function erp_private.lock_assignment_schedule_history();
commit;
