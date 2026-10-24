BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Holds already have an independent authoritative active/released ledger.
-- Do not overwrite the payroll profile and later guess its previous status.
-- In particular releasing the final hold must never reactivate an inactive profile.
DO $repair$
DECLARE
  original text;
  changed text;
  old_block text := $old$ IF p_kind='payroll-hold'THEN
  IF p_action='create'THEN UPDATE public.employee_payroll_profiles SET payroll_status='hold',updated_by=actor WHERE employee_id=p_employee AND deleted_at IS NULL AND payroll_status<>'hold';
  ELSIF p_action='release'AND NOT EXISTS(SELECT 1 FROM public.employee_payroll_holds WHERE employee_id=p_employee AND is_active AND deleted_at IS NULL)THEN UPDATE public.employee_payroll_profiles SET payroll_status='active',updated_by=actor WHERE employee_id=p_employee AND deleted_at IS NULL AND payroll_status='hold';END IF;
 END IF;$old$;
BEGIN
  SELECT pg_get_functiondef('public.f11_mutate_payroll_child(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure) INTO original;
  IF encode(sha256(convert_to(original,'UTF8')),'hex') <> '25344b86a30d081e1a61b1640649e0cb5c6261963243dd0eb22ec6de7012667a'
  THEN RAISE EXCEPTION 'Unreviewed payroll mutation contract; reconcile before repair'; END IF;
  changed := replace(original, old_block, ' -- F12-04: active holds are checked separately; never change profile eligibility here.');
  IF changed = original OR strpos(changed, old_block) > 0 THEN
    RAISE EXCEPTION 'Expected payroll hold block not found exactly';
  END IF;
  IF strpos(changed, '(current_timestamp AT TIME ZONE ''UTC'')::date') = 0 THEN
    RAISE EXCEPTION 'Expected payroll hold release date contract missing';
  END IF;
  changed := replace(changed, '(current_timestamp AT TIME ZONE ''UTC'')::date', '(current_timestamp AT TIME ZONE ''Asia/Dubai'')::date');
  EXECUTE changed;
END;
$repair$;
-- CREATE OR REPLACE preserves the existing signature, ACL, actor/session scope,
-- row locks, original operation receipts, revision checks and immutable history.
NOTIFY pgrst, 'reload schema';
COMMIT;
