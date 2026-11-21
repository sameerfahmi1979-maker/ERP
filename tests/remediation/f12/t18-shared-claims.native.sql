DO $$
BEGIN
 IF to_regprocedure('erp_private.t18_monthly_payroll_status(bigint,bigint,date)') IS NULL
   OR to_regprocedure('erp_private.t18_reserve(uuid)') IS NULL
   OR to_regprocedure('erp_private.t18_assert_claims(uuid)') IS NULL
   OR to_regprocedure('erp_private.t18_assert_monthly_coverage(uuid)') IS NULL
   OR to_regprocedure('erp_private.t18_release(uuid,text)') IS NULL THEN
   RAISE EXCEPTION 'The T18 common payroll-claim boundary is unavailable';
 END IF;
 IF has_function_privilege('authenticated','erp_private.t18_reserve(uuid)','EXECUTE')
    OR has_function_privilege('service_role','erp_private.t18_reserve(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','erp_private.t18_monthly_payroll_status(bigint,bigint,date)','EXECUTE')
    OR has_table_privilege('authenticated','erp_private.t18_reserved_sources','SELECT') THEN
   RAISE EXCEPTION 'A raw T18 payroll reservation or salary result is exposed';
 END IF;
END $$;
