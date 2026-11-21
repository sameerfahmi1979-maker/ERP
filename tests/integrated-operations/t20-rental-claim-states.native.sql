-- Run after the complete rental, settlement and refile journey, before ROLLBACK.
RESET ROLE;
DO $allocation$
DECLARE
 batch uuid:=current_setting('erp.t20_rental_oct_batch')::uuid;
 work_id bigint:=current_setting('erp.t20_rental_work')::bigint;
 revised_candidate bigint:=current_setting('erp.t20_rental_revised_candidate')::bigint;
 previous_payment uuid;
 old_line uuid;
 replacement uuid;
 exact_span tstzmultirange:='{["2026-09-17 16:00+04","2026-09-17 18:00+04")}';
 operation uuid:=pg_temp.t06_op(2211);
 body jsonb;
 receipt jsonb;
 facts jsonb;
BEGIN
 SELECT p.id INTO STRICT previous_payment FROM erp_private.t16_payments p
 WHERE p.batch_id=batch AND p.employee_id=980002;
 SELECT l.id INTO STRICT old_line FROM erp_private.t15_reserved_lines r
 JOIN erp_private.t14_lines l ON l.id=r.line_id
 WHERE r.employee_id=980002 AND r.category='fleet-overtime' AND r.released_at IS NULL AND r.span=exact_span
   AND (l.source->>'work')::bigint=work_id;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 body:=jsonb_build_object('batch',batch,'payment',previous_payment,'revision',1,
   'reason','Synthetic linked reversal for the original approved cheque')||pg_temp.t16_proof(998605);
 receipt:=public.t16_payroll_payment_command(operation,920001,920011,'reverse',body);
 IF receipt->>'state' IS DISTINCT FROM 'reversed'
   OR public.t16_payroll_payment_command(operation,920001,920011,'reverse',body) IS DISTINCT FROM receipt||'{"replayed":true}'
 THEN RAISE EXCEPTION 'Exact reversal identity was not retained'; END IF;
 PERFORM pg_temp.t06_actor(2);
 IF pg_temp.t08_queue('2026-09-17',work_id)->>'status' IS DISTINCT FROM 'held-by-approval'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.t08_fleet_payroll_candidates(920001,statement_timestamp())) r WHERE (r->>'id')::bigint=revised_candidate) THEN
   RAISE EXCEPTION 'Cash reversal improperly reopened the approved shift'; END IF;

 PERFORM pg_temp.t06_actor(3);
 body:=jsonb_build_object('batch',batch,'employee',980002,'channel','cheque','reference','P4-T20-PARTIAL-RENTAL',
   'amount','20.00','currency','AED','paid_on','2026-11-20','outcome','partial')||pg_temp.t16_proof(998611);
 receipt:=public.t16_payroll_payment_command(pg_temp.t06_op(2212),920001,920011,'receipt',body);
 replacement:=(receipt->>'payment')::uuid;
 body:=jsonb_build_object('batch',batch,'payment',replacement,'revision',0,'lines',jsonb_build_array(
   jsonb_build_object('line',old_line,'amount','20.00')),'reason','Synthetic partial exact overtime allocation')||pg_temp.t16_proof(998604);
 receipt:=public.t16_payroll_payment_command(pg_temp.t06_op(2213),920001,920011,'allocate',body);
 IF public.t16_payroll_payment_command(pg_temp.t06_op(2213),920001,920011,'allocate',body) IS DISTINCT FROM receipt||'{"replayed":true}' THEN
   RAISE EXCEPTION 'Exact partial allocation receipt did not replay'; END IF;

 PERFORM pg_temp.t06_actor(2);
 IF pg_temp.t08_queue('2026-09-17',work_id)->>'status' IS DISTINCT FROM 'held-by-approval'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.t08_fleet_payroll_candidates(920001,statement_timestamp())) r WHERE (r->>'id')::bigint=revised_candidate) THEN
   RAISE EXCEPTION 'Partial cash was confused with an open portion of the approved shift'; END IF;
 RESET ROLE;
 facts:=erp_private.t16_result_status(batch,980002);
 IF facts->>'status' IS DISTINCT FROM 'partial' OR (facts->>'applied_wages')::numeric IS DISTINCT FROM 20.00
    OR (facts->>'remaining')::numeric IS DISTINCT FROM 4525.00
    OR NOT EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines r WHERE r.line_id=old_line AND r.released_at IS NULL AND r.span=exact_span) THEN
   RAISE EXCEPTION 'Exact approval or partial cash residual was lost: %',facts; END IF;
 RAISE NOTICE 'PASS: B02 linked reversal and AED 20 partial allocation leave the original whole overtime approval held';
END $allocation$;

