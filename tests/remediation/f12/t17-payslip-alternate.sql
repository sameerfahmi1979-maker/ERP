
CREATE FUNCTION pg_temp.t17_alternate() RETURNS void LANGUAGE plpgsql AS $$
DECLARE
 package uuid:=current_setting('erp.t17_alt_batch')::uuid;
 payment uuid:=current_setting('erp.t17_alt_payment')::uuid;
 build_lines jsonb; workspace jsonb; staff_id bigint:=980002;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('line',l.id,'amount',l.amount::text) ORDER BY l.id)
 INTO build_lines FROM erp_private.t14_lines l JOIN erp_private.t16_batches b ON b.version_id=l.version_id
 WHERE b.id=package AND l.employee_id=staff_id AND l.amount>0;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(3);
 PERFORM public.t16_payroll_payment_command(gen_random_uuid(),920001,920011,'allocate',
   jsonb_build_object('batch',package,'payment',payment,'revision',0,'lines',build_lines,
      'reason','Verify exact cheque payment allocations')||pg_temp.t16_proof(998604));
 PERFORM pg_temp.t06_actor(2);
 workspace:=public.t17_issue_prepare(gen_random_uuid(),package,staff_id);
 RESET ROLE;
 IF workspace->>'id' IS NULL OR NOT erp_private.t17_eligible(package,staff_id)
    OR erp_private.t17_eligible(package,980001)
    OR (SELECT file_id FROM erp_private.t16_batch_results WHERE batch_id=package AND employee_id=staff_id) IS NOT NULL THEN
   RAISE EXCEPTION 'A verified non-WPS employee could not prepare a payslip alongside unsettled WPS';
 END IF;
 RAISE NOTICE 'PASS: reconciled non-WPS cheque yields an eligible payslip while its WPS sibling remains unpaid';
END $$;
