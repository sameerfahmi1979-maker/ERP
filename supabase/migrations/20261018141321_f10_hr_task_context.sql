BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- Add exact leaf identity only after the existing F03 source authorization has
-- succeeded. No client URL or metadata supplies the parent/leaf relationship.
DO $$DECLARE body text;needle text;replacement text;BEGIN
 SELECT pg_get_functiondef('public.f10_notification_target(text,bigint)'::regprocedure) INTO body;
 needle:=$old$RETURN '/admin/hr/employees/record/'||employee_id;$old$;
 replacement:=$new$RETURN '/admin/hr/employees/record/'||employee_id||CASE $1
 WHEN 'employee_leave_requests' THEN '?task=leave&task_id='||$2
 WHEN 'employee_attendance_corrections' THEN '?task=attendance&task_id='||$2
 WHEN 'employee_salary_revisions' THEN '?task=salary&task_id='||$2
 WHEN 'employee_payroll_holds' THEN '?task=payroll-hold&task_id='||$2
 WHEN 'employee_approval_requests' THEN '?task=employee-request&task_id='||$2
 WHEN 'employee_identity_documents' THEN '?task=identity&task_id='||$2
 WHEN 'employee_medical_insurances' THEN '?task=insurance&task_id='||$2
 WHEN 'hr_onboarding_tasks' THEN '?task=onboarding&task_id='||$2
 ELSE '' END;$new$;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Employee target contract changed';END IF;
 body:=replace(body,needle,replacement);
 needle:=$old$RETURN '/admin/hr/recruitment/candidates/record/'||candidate_id;$old$;
 replacement:=$new$RETURN '/admin/hr/recruitment/candidates/record/'||candidate_id||CASE $1
 WHEN 'hr_interviews' THEN '?task=interview&task_id='||$2
 WHEN 'hr_offers' THEN '?task=offer&task_id='||$2
 WHEN 'hr_onboarding_tasks' THEN '?task=onboarding&task_id='||$2
 ELSE '' END;$new$;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Candidate target contract changed';END IF;
 EXECUTE replace(body,needle,replacement);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
