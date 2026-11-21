BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Share the existing balance-row ID sequence so v1 can continue paging by
-- its last positive numeric ID without changing legacy IDs or adding fake balances.
ALTER TABLE erp_private.t04_periods ADD COLUMN mobile_balance_id bigint
 NOT NULL DEFAULT nextval('public.employee_leave_balances_id_seq'::regclass);
ALTER TABLE erp_private.t04_periods ADD CONSTRAINT t04_mobile_balance_id_unique UNIQUE(mobile_balance_id);

-- Preserve the existing F12 verification and arithmetic for a scoped legacy row.
-- This helper runs only for rows already selected by the Mobile leave reader.
CREATE FUNCTION erp_private.mobile_hr_legacy_balance_fact(p_balance public.employee_leave_balances)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
  'entitled_days',p_balance.entitled_days,'used_days',p_balance.used_days,
  'reserved_days',CASE WHEN p_balance.period_start IS NOT NULL THEN (
    SELECT coalesce(sum(greatest(0,least(r.end_date,p_balance.period_end)-greatest(r.start_date,p_balance.period_start)+1)),0)
    FROM public.employee_leave_requests r WHERE r.employee_id=p_balance.employee_id AND r.leave_type_id=p_balance.leave_type_id
      AND r.deleted_at IS NULL AND r.approval_status='pending'
      AND r.start_date<=p_balance.period_end AND r.end_date>=p_balance.period_start
  ) END,
  'known',coalesce(p_balance.period_start IS NOT NULL AND p_balance.period_end IS NOT NULL
    AND p_balance.carry_forward=0 AND p_balance.entitled_days>=p_balance.used_days
    AND t.reset_basis=p_balance.period_basis
    AND erp_private.f12_leave_period(p_balance.period_start,e.joining_date,t.reset_basis)=daterange(p_balance.period_start,p_balance.period_end,'[]')
    AND p_balance.used_days=(SELECT coalesce(sum(m.days),0) FROM erp_private.f12_leave_movements m WHERE m.balance_id=p_balance.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.employee_leave_requests r WHERE r.employee_id=p_balance.employee_id AND r.leave_type_id=p_balance.leave_type_id
       AND r.deleted_at IS NULL AND r.start_date<=p_balance.period_end AND r.end_date>=p_balance.period_start
       AND ((r.approval_status='approved' AND (r.f12_ledger_version IS DISTINCT FROM 1 OR r.f12_policy IS NULL OR (
         SELECT coalesce(sum(m.days),0) FROM erp_private.f12_leave_movements m
         WHERE m.balance_id=p_balance.id AND m.request_id=r.id AND m.effect='consume'
       )<>least(r.end_date,p_balance.period_end)-greatest(r.start_date,p_balance.period_start)+1))
       OR (r.approval_status='pending' AND (r.f12_policy IS NULL OR r.f12_policy->>'reset_basis' IS DISTINCT FROM t.reset_basis
         OR (r.f12_policy->>'joining_date')::date IS DISTINCT FROM e.joining_date)))
    ),false))
 FROM public.hr_leave_types t JOIN public.employees e ON e.id=p_balance.employee_id WHERE t.id=p_balance.leave_type_id;
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_legacy_balance_fact(public.employee_leave_balances) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.mobile_hr_balance_page(p_employee bigint,p_after bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH today AS (SELECT erp_private.t04_today() AS day),
 subject AS MATERIALIZED (
  SELECT e.id,e.owner_company_id,e.branch_id FROM public.employees e
  WHERE e.id=p_employee AND e.deleted_at IS NULL
 ), managed AS MATERIALIZED (
  SELECT p.id AS period_id,p.mobile_balance_id AS id,p.coverage,
   CASE WHEN f.values->>'status'='ready' AND (f.values->>'id')::bigint=p.id AND NOT EXISTS (
    SELECT 1 FROM erp_private.t04_periods other WHERE other.employee_id=p.employee_id AND other.company_id=p.company_id
     AND other.id<>p.id AND other.coverage && p.coverage
   ) THEN f.values END AS verified
  FROM subject e JOIN erp_private.t04_periods p ON p.employee_id=e.id AND p.company_id=e.owner_company_id
  CROSS JOIN today
  CROSS JOIN LATERAL (SELECT least(upper(p.coverage)-1,greatest(today.day,lower(p.coverage),p.cutoff)) AS day) anchor
  JOIN erp_private.t03_employment_periods h ON h.employee_id=e.id AND h.company_id=e.owner_company_id
   AND h.branch_id IS NOT DISTINCT FROM e.branch_id AND h.work_period @> anchor.day
  CROSS JOIN LATERAL (SELECT erp_private.t19_verified_leave_balance(e.id,e.owner_company_id,e.branch_id,anchor.day) AS values) f
 ), legacy AS (
  SELECT b.id,t.name_en AS label,
   (b.period_start IS NOT NULL AND b.period_end IS NOT NULL
    AND (NOT isfinite(b.period_start) OR NOT isfinite(b.period_end) OR b.period_end<b.period_start)) AS invalid_range,
   CASE WHEN t.code IN ('ANNUAL','SICK') THEN b.period_start END AS dated_start,
   CASE WHEN t.code IN ('ANNUAL','SICK') THEN b.period_end END AS dated_end,
   t.code,b.leave_year
  FROM subject e JOIN public.employee_leave_balances b ON b.employee_id=e.id
  JOIN public.hr_leave_types t ON t.id=b.leave_type_id
  WHERE b.id>p_after
 ), legacy_spans AS (
  SELECT l.*,CASE WHEN l.code IN ('ANNUAL','SICK') AND NOT l.invalid_range THEN
   CASE WHEN l.dated_start IS NOT NULL AND l.dated_end IS NOT NULL THEN daterange(l.dated_start,l.dated_end,'[]')
    WHEN l.leave_year BETWEEN 1 AND 9999 THEN daterange(make_date(l.leave_year,1,1),make_date(l.leave_year+1,1,1),'[)') END END AS span
  FROM legacy l
 ), legacy_rows AS (
  SELECT b.id,b.label,
   CASE WHEN b.invalid_range THEN 'HR needs to verify the dates for this balance.'
    WHEN b.span IS NOT NULL AND EXISTS (
      SELECT 1 FROM erp_private.t04_periods p WHERE p.employee_id=p_employee AND p.coverage && b.span
    ) THEN 'Ask HR to reconcile this legacy period with the managed leave balance.' END AS review_reason
  FROM legacy_spans b
  -- A fully covered annual row with verified T04 opening is replaced by one
  -- managed card. Partial overlaps keep a warning and show no legacy amounts.
  WHERE NOT (b.code='ANNUAL' AND b.dated_start IS NOT NULL AND b.dated_end IS NOT NULL
   AND EXISTS(SELECT 1 FROM managed m WHERE m.verified IS NOT NULL AND m.coverage @> b.span))
 ), page AS MATERIALIZED (
  SELECT id,NULL::bigint AS legacy_id,period_id,'Annual leave'::text AS label,coverage,verified,
   CASE WHEN verified IS NULL THEN 'Ask HR to verify the opening balance for this period.' END AS review_reason
  FROM managed WHERE id>p_after
  UNION ALL
  SELECT id,id,NULL,label,NULL,NULL,review_reason FROM legacy_rows
  ORDER BY id LIMIT 26
 ), cards AS (
  SELECT p.id,
   jsonb_build_object('id',p.id,'label',p.label,'source',CASE WHEN p.legacy_id IS NULL THEN 't04' ELSE 'legacy' END,
    'leave_type_id',b.leave_type_id,'period_basis',b.period_basis,
    'leave_year',coalesce(b.leave_year,extract(year FROM lower(p.coverage))::integer),
    'period_start',coalesce(b.period_start,lower(p.coverage)),'period_end',coalesce(b.period_end,upper(p.coverage)-1))
   || CASE
    WHEN p.review_reason IS NOT NULL THEN jsonb_build_object('known',false,'review_reason',p.review_reason,
     'entitled_days',NULL,'used_days',NULL,'reserved_days',NULL)
    WHEN p.legacy_id IS NOT NULL THEN erp_private.mobile_hr_legacy_balance_fact(b)
    ELSE jsonb_build_object('known',true,'entitled_days',p.verified->'full_entitlement','earned_days',p.verified->'earned',
     'used_days',p.verified->'approved_usage','reserved_days',p.verified->'reserved',
     'carry_forward_days',p.verified->'carry_available','available_days',p.verified->'available') END AS value
  FROM page p LEFT JOIN public.employee_leave_balances b ON b.id=p.legacy_id
 )
 SELECT coalesce(jsonb_agg(value ORDER BY id),'[]'::jsonb) FROM cards;
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_balance_page(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

-- Retain the v1 identity and leave access checks, options, and request history.
DO $patch$
DECLARE definition text;
DECLARE revised text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p
 WHERE p.oid='erp_private.mobile_hr_leave_read(bigint,text,bigint)'::regprocedure
  AND md5(p.prosrc)='accc8312d5f07cee98dd9bd0681789fd';
 revised:=replace(definition,$old$    RETURN (SELECT coalesce(jsonb_agg(b || jsonb_build_object('label',t.name_en) ORDER BY (b->>'id')::bigint),'[]')
      FROM jsonb_array_elements(CASE WHEN public.current_user_can_view_employee(p_employee) THEN public.f12_leave_period_balances(p_employee,p_cursor) ELSE erp_private.mobile_hr_own_balance_facts(p_employee,p_cursor) END) b
      LEFT JOIN public.hr_leave_types t ON t.id=(b->>'leave_type_id')::bigint);$old$,
  $new$    RETURN erp_private.mobile_hr_balance_page(p_employee,p_cursor);$new$);
 IF revised=definition THEN RAISE EXCEPTION 'Unexpected Mobile HR balance predecessor'; END IF;
 EXECUTE revised;
END;
$patch$;
DROP FUNCTION erp_private.mobile_hr_own_balance_facts(bigint,bigint);

NOTIFY pgrst,'reload schema';
COMMIT;
