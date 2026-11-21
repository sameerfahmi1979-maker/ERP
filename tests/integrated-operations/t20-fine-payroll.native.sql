-- Append inside the guarded, transaction-wrapped T07 actor and asset fixture.
\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database() !~ '^t20_native_[0-9]+$'
    OR current_setting('cron.launch_active_jobs') IS DISTINCT FROM 'off'
    OR (SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname=current_database())
       IS DISTINCT FROM 'Isolated HR T00 20261119'
    OR (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 426
  THEN RAISE EXCEPTION 'Use a guarded T20 clone of the 426-version T00 database'; END IF;
END $$;

CREATE FUNCTION pg_temp.t08_profile(actor int) RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT id FROM public.user_profiles
  WHERE auth_user_id=('98000000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.fine_op(step int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('20261120-2004-4000-8000-'||lpad(step::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.fine_proof(id bigint) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('document',id,'version',id,'file',id);
$$;
CREATE FUNCTION pg_temp.fine_recovery(step int, target bigint, action text, input jsonb, accounts boolean)
RETURNS jsonb LANGUAGE sql VOLATILE AS $$
  SELECT public.t13_recovery_command(pg_temp.fine_op(step),target,action,input||jsonb_build_object('basis',
    public.t13_recovery_workspace(920011,'2026-10-01',target)->'case'->>
    CASE WHEN accounts THEN 'accounts_basis' ELSE 'hr_basis' END));
$$;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
VALUES ('dms.documents.view.hr','Synthetic HR evidence view','dms','test','held'),
       ('dms.documents.view.finance','Synthetic finance evidence view','dms','test','held')
ON CONFLICT (permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
  ('t20_b04_fleet','Synthetic fine recorder and verifier',false),
  ('t20_b04_hr','Synthetic independent HR recovery',false),
  ('t20_b04_accounts','Synthetic recovery Accounts',false),
  ('t20_b04_policy','Synthetic recovery policy reviewer',false),
  ('t20_b04_run','Synthetic month calculation and submission',false),
  ('t20_b04_gm','Synthetic exact payroll approver',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
  ('t20_b04_fleet',ARRAY['fleet.fines.record','fleet.fines.view','fleet.fines.match','fleet.fines.verify','dms.documents.view','dms.documents.preview']),
  ('t20_b04_hr',ARRAY['hr.recovery.review','dms.documents.view','dms.documents.preview','dms.documents.view.hr']),
  ('t20_b04_accounts',ARRAY['hr.recovery.accounts','hr.payroll.view','dms.documents.view','dms.documents.preview','dms.documents.view.finance']),
  ('t20_b04_policy',ARRAY['hr.recovery.policy']),
  ('t20_b04_run',ARRAY['hr.payroll.run.manage','hr.payroll.run.submit','hr.payroll.view']),
  ('t20_b04_gm',ARRAY['hr.payroll.run.approve','hr.payroll.view'])
) x(role_code,caps) JOIN public.roles r USING (role_code) JOIN public.permissions p ON p.permission_code=ANY(x.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(x.actor),r.id,x.company,x.branch,true FROM (VALUES
  (1,'t20_b04_fleet',920001,920011),(5,'t20_b04_fleet',920001,920011),
  (4,'t20_b04_hr',920001,920011),(5,'t20_b04_hr',920001,920011),(6,'t20_b04_hr',920001,920012),
  (3,'t20_b04_accounts',920001,920011),(6,'t20_b04_accounts',920001,920012),(9,'t20_b04_accounts',920002,920021),
  (2,'t20_b04_policy',920001,920011),(7,'t20_b04_policy',920001,920011),
  (2,'t20_b04_run',920001,920011),(3,'t20_b04_gm',920001,920011),(7,'t20_b04_gm',920001,920011)
) x(actor,role_code,company,branch) JOIN public.roles r USING (role_code);

-- Separate synthetic originals for each signed operational or financial act.
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
  confidentiality_level,status) OVERRIDING SYSTEM VALUE
SELECT x.id,'T20-B04-'||x.id,x.title,t.id,t.category_id,920001,920011,x.confidentiality,'active'
FROM (VALUES
  (999201,'FLEET_CUSTODY_ACK','Signed first checkout','internal'),
  (999202,'FLEET_CUSTODY_ACK','Signed first return','internal'),
  (999203,'FLEET_CUSTODY_ACK','Signed second checkout','internal'),
  (999204,'FLEET_CUSTODY_ACK','Signed second return','internal'),
  (999205,'T13_AUTHORITY_NOTICE','Synthetic authority original','internal'),
  (999206,'T13_DRIVER_EVIDENCE','Independently signed actual driver statement','internal'),
  (999207,'T13_RECOVERY_EMPLOYEE_NOTICE','Synthetic employee notification','hr'),
  (999208,'T13_RECOVERY_EMPLOYEE_RESPONSE','Synthetic employee dispute','hr'),
  (999209,'T13_RECOVERY_EMPLOYEE_RESPONSE','Synthetic independent dispute decision','hr'),
  (999210,'T13_RECOVERY_FINANCIAL_PROOF','Synthetic verified fine cost','finance'),
  (999213,'T16_BANK_EVIDENCE','Synthetic final partial deduction amount','finance')
) x(id,type_code,title,confidentiality) JOIN public.dms_document_types t USING (type_code);
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
SELECT id,id,1,true FROM public.dms_documents WHERE id BETWEEN 999201 AND 999213;
UPDATE public.dms_documents SET current_version_id=id WHERE id BETWEEN 999201 AND 999213;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,
  file_size_bytes,sha256_hash,integrity_status) OVERRIDING SYSTEM VALUE
SELECT id,id,id,'original','dms-documents','test/t20-b04/'||id||'.pdf','synthetic.pdf','application/pdf',100,
  lpad(id::text,64,'0'),'verified' FROM public.dms_documents WHERE id BETWEEN 999201 AND 999213;

INSERT INTO public.hr_payroll_groups(id,code,name_en,pay_frequency,created_at,updated_at) OVERRIDING SYSTEM VALUE
VALUES (999204,'T20-B04','Synthetic monthly group','monthly','2026-08-01','2026-08-01');
SET LOCAL session_replication_role=replica;
INSERT INTO public.hr_salary_component_types(id,code,name_en,component_kind,is_basic,is_active,created_at,updated_at) OVERRIDING SYSTEM VALUE
VALUES (999204,'T20_B04_BASIC','Synthetic basic wage','earning',true,true,'2026-08-01','2026-08-01');
INSERT INTO public.employee_payroll_profiles(employee_id,effective_date,currency,payroll_status,payroll_group_id,created_at,updated_at)
VALUES (980001,'2024-01-01','AED','active',999204,'2026-08-01','2026-08-01'),
       (980002,'2024-01-01','AED','active',999204,'2026-08-01','2026-08-01');
INSERT INTO public.employee_salary_components(employee_id,component_type_id,amount,effective_from,is_active,created_at,updated_at)
VALUES (980001,999204,4000,'2024-01-01',true,'2026-08-01','2026-08-01'),
       (980002,999204,4000,'2024-01-01',true,'2026-08-01','2026-08-01');
UPDATE erp_private.t03_employment_changes SET applied_at='2026-08-01' WHERE employee_id IN (980001,980002) AND kind='confirm';
SET LOCAL session_replication_role=origin;
INSERT INTO erp_private.t14_rules(company_id,branch_id,validity,facts,prepared_by,approved_by,approved_at,reason,decision_reason)
VALUES (920001,920011,'[2026-10-01,2026-12-01)',
  '{"proration":"calendar-days","fixed_days":null,"absence":"unpaid-only","leave_wage_basis":"basic",
    "daily_recovery_basis":"basic","rounding":"line-half-up","recovery_fraction":0.10,"net_floor":0}',
  pg_temp.t08_profile(4),pg_temp.t08_profile(7),'2026-09-15','Synthetic dated proposal','Synthetic dated approval');

-- T16 synthetic bank configuration is injected here.

INSERT INTO public.employee_wps_profiles(employee_id,wps_applicable,wps_status,bank_id,iban,mohre_person_code,
  mohre_establishment_id,salary_effective_date,salary_payment_method)
VALUES (980001,true,'active',998601,'AE070331234567890123456','00112233445566',998601,'2026-01-01','bank_transfer');
SELECT pg_temp.t16_configuration();
DO $$
DECLARE
  notice jsonb:='{"authority":"Synthetic Traffic Authority","reference":"T20-B04-FINE-01","offence":"Synthetic traffic fine",
    "location":"Dubai","occurred_at":"2026-10-29T10:15:00+04:00","notice_on":"2026-10-29",
    "plate_jurisdiction":"AEDU","plate_class":"C","plate_number":"T06PLATE","amount":300,"currency":"AED"}';
  policy jsonb:='{"kind":"fine","from":"2026-10-01","until":"2026-12-01","currency":"AED",
    "legal_basis":"Synthetic approved basis","case_limit":300,"period_limit":300,"wage_basis":"fixed-amount",
    "priority":1,"allow_deduct_correct":false,"reason":"Synthetic dated proposal"}';
  schedule_data jsonb:='{"mode":"instalments","instalments":[{"month":"2026-10-01","amount":100},{"month":"2026-11-01","amount":200}],"reason":"Propose exact synthetic instalments"}';
  custody bigint; next_custody bigint; fine bigint; eligibility bigint; dispute bigint; reconciliation bigint; schedule bigint;
  decision jsonb; state jsonb; driver jsonb; hr_input jsonb; confirmation jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(1);
  INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
  SELECT id,'fleet_asset',980101 FROM public.dms_documents WHERE id BETWEEN 999201 AND 999204;
  custody:=(public.t06_fleet_command(pg_temp.fine_op(1),980101,'checkout',
    pg_temp.t06_trip(980001,980001,'2026-10-29 09:00+04','2026-10-29 11:00+04')||jsonb_build_object('snapshot',
      pg_temp.t06_facts()||pg_temp.fine_proof(999201)))->>'id')::bigint;
  PERFORM public.t06_fleet_command(pg_temp.fine_op(2),980101,'return',jsonb_build_object('commitment',custody,'revision',1,
    'at','2026-10-29 11:00+04','reason','Signed first pool-car return','snapshot',
    pg_temp.t06_facts()||'{"meter":21}'||pg_temp.fine_proof(999202)));
  next_custody:=(public.t06_fleet_command(pg_temp.fine_op(3),980101,'checkout',
    pg_temp.t06_trip(980002,980001,'2026-10-29 11:30+04','2026-10-29 13:30+04')||jsonb_build_object('snapshot',
      pg_temp.t06_facts()||'{"meter":21}'||pg_temp.fine_proof(999203)))->>'id')::bigint;
  PERFORM public.t06_fleet_command(pg_temp.fine_op(4),980101,'return',jsonb_build_object('commitment',next_custody,'revision',1,
    'at','2026-10-29 13:30+04','reason','Signed second pool-car return','snapshot',
    pg_temp.t06_facts()||'{"meter":22}'||pg_temp.fine_proof(999204)));
  state:=public.t06_fleet_custody_at('2026-10-29 10:15+04',NULL,'AEDU','C','T06PLATE');
  IF state->>'custody_candidate' IS DISTINCT FROM '980001' OR state->>'verified_driver' IS NOT NULL
     OR public.t06_fleet_custody_at('2026-10-29 11:45+04',980101)->>'custody_candidate' IS DISTINCT FROM '980002'
  THEN RAISE EXCEPTION 'Signed pool-car handovers did not retain occurrence-time custody'; END IF;

  notice:=notice||jsonb_build_object('evidence',pg_temp.fine_proof(999205));
  decision:=public.t13_fleet_command(pg_temp.fine_op(5),920011,'record-fine',notice);
  fine:=(decision->>'id')::bigint;
  IF decision->>'subject_status' IS DISTINCT FROM 'unresolved'
     OR public.t13_fleet_command(pg_temp.fine_op(5),920011,'record-fine',notice) IS DISTINCT FROM decision||'{"replayed":true}'
  THEN RAISE EXCEPTION 'Original fine receipt or replay changed'; END IF;
  decision:=public.t13_fleet_command(pg_temp.fine_op(6),fine,'match-custody',jsonb_build_object('revision',decision->'source_revision'));
  SELECT value INTO STRICT state FROM jsonb_array_elements(public.t13_fleet_workspace(920011)->'cases') WHERE value->>'id'=fine::text;
  IF decision->>'subject_status' IS DISTINCT FROM 'custody-candidate' OR (state->>'commitment_id')::bigint IS DISTINCT FROM custody
     OR state->>'custody_candidate_id' IS DISTINCT FROM '980001' OR state->>'employee_id' IS NOT NULL
  THEN RAISE EXCEPTION 'Fine needs the exact signed custody candidate before independent driver verification'; END IF;
  driver:=jsonb_build_object('revision',decision->'source_revision','employee',980002,'evidence',pg_temp.fine_proof(999206),
    'reason','Independent signed statement confirmed actual driver');
  BEGIN
    PERFORM public.t13_fleet_command(pg_temp.fine_op(7),fine,'verify-driver',driver);
    RAISE EXCEPTION 'Reporter verified the actual driver';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.t06_actor(5);
  decision:=public.t13_fleet_command(pg_temp.fine_op(8),fine,'verify-driver',driver);
  IF decision->>'subject_status' IS DISTINCT FROM 'verified'
     OR public.t13_fleet_command(pg_temp.fine_op(8),fine,'verify-driver',driver) IS DISTINCT FROM decision||'{"replayed":true}'
  THEN RAISE EXCEPTION 'Independent driver receipt or replay changed'; END IF;

  PERFORM pg_temp.t06_actor(2);
  confirmation:=jsonb_build_object('policy',public.t13_recovery_command(pg_temp.fine_op(9),920011,'prepare-policy',policy)->'id',
    'reason','Independently approve synthetic dated policy');
  PERFORM pg_temp.t06_actor(7);
  PERFORM public.t13_recovery_command(pg_temp.fine_op(10),920011,'approve-policy',confirmation);

  hr_input:=jsonb_build_object('decision','employee','ceiling',300,'notified_on','2026-10-29','response','disputed',
    'response_note','Synthetic protected response','route','defer','disputed_amount',80,
    'notice',pg_temp.fine_proof(999207),'response_evidence',pg_temp.fine_proof(999208),'reason','Verify eligibility and hold the dispute');
  PERFORM pg_temp.t06_actor(6);
  BEGIN
    PERFORM public.t13_recovery_command(pg_temp.fine_op(11),fine,'review',hr_input);
    RAISE EXCEPTION 'Sibling branch HR reviewed the original employer case';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.t06_actor(4);
  hr_input:=hr_input||jsonb_build_object('basis',public.t13_recovery_workspace(920011,'2026-10-01',fine)->'case'->>'hr_basis');
  decision:=public.t13_recovery_command(pg_temp.fine_op(12),fine,'review',hr_input);
  eligibility:=(decision->>'id')::bigint;
  IF public.t13_recovery_command(pg_temp.fine_op(12),fine,'review',hr_input) IS DISTINCT FROM decision||'{"replayed":true}'
  THEN RAISE EXCEPTION 'HR eligibility was duplicated on retry'; END IF;
  state:=public.t13_recovery_workspace(920011,'2026-10-01',fine)->'case';
  dispute:=(state->'disputes'->0->>'id')::bigint;
  IF dispute IS NULL OR state ? 'totals' THEN RAISE EXCEPTION 'HR dispute or finance evidence masking changed'; END IF;
  confirmation:=jsonb_build_object('dispute',dispute,'upheld',80,'evidence',pg_temp.fine_proof(999209),
    'reason','Signed independent dispute decision confirmed supported responsibility');
  BEGIN
    PERFORM pg_temp.fine_recovery(13,fine,'resolve-dispute',confirmation,false);
    RAISE EXCEPTION 'HR actor decided their own dispute';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.t06_actor(3);
  reconciliation:=(pg_temp.fine_recovery(14,fine,'reconcile',jsonb_build_object('actual_cost',300,
    'evidence',pg_temp.fine_proof(999210),'reason','Verify exact cost'),true)->>'id')::bigint;
  state:=public.t13_recovery_workspace(920011,'2026-10-01',fine)->'case';
  IF (state->'totals'->>'disputed')::numeric IS DISTINCT FROM 80
     OR (state->'totals'->>'remaining')::numeric IS DISTINCT FROM 220
     OR state::text LIKE '%Synthetic protected response%'
  THEN RAISE EXCEPTION 'Deferred dispute amount or Accounts evidence masking changed'; END IF;
  PERFORM pg_temp.t06_actor(5);
  PERFORM pg_temp.fine_recovery(15,fine,'resolve-dispute',confirmation,false);
  PERFORM pg_temp.t06_actor(3);
  schedule:=(pg_temp.fine_recovery(16,fine,'propose-schedule',schedule_data,true)->>'id')::bigint;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}',true);
  IF (SELECT count(*) FROM erp_private.fleet_custody_events WHERE commitment_id IN (custody,next_custody)
        AND evidence_document_id=evidence_version_id AND evidence_version_id=evidence_file_id
        AND evidence_file_id BETWEEN 999201 AND 999204) <> 4
     OR NOT EXISTS(SELECT 1 FROM erp_private.t13_cases WHERE id=fine AND employee_id=980002
        AND custody_commitment_id=custody AND employer_company_id=920001 AND employer_branch_id=920011)
     OR (SELECT count(*) FROM erp_private.t13_intake_evidence WHERE case_id=fine AND document_id=version_id
          AND version_id=file_id AND sha256=lpad(file_id::text,64,'0') AND file_id IN (999205,999206))<>2
     OR (SELECT count(*) FROM erp_private.t13_case_versions WHERE case_id=fine)<>3
     OR (SELECT count(*) FROM erp_private.t13_recovery_proofs WHERE case_id=fine AND document_id=version_id
         AND version_id=file_id AND file_id BETWEEN 999207 AND 999210)<>4
     OR NOT EXISTS(SELECT 1 FROM erp_private.t13_schedules s JOIN erp_private.t13_hr_reviews h ON h.id=s.hr_review_id
       JOIN erp_private.t13_reconciliations a ON a.id=s.reconciliation_id
       WHERE s.id=schedule AND h.id=eligibility AND a.id=reconciliation AND h.source_digest=a.source_digest
       AND a.source_digest=erp_private.t13_source_digest(fine) AND s.principal=300)
  THEN RAISE EXCEPTION 'Custody, actual driver or recovery evidence identity did not persist'; END IF;
  PERFORM set_config('erp.t20_b04_case',fine::text,true);
  PERFORM set_config('erp.t20_b04_schedule',schedule::text,true);
  RAISE NOTICE 'B04 custody=% next custody=% fine=% driver=980002 eligibility=% dispute=% reconciliation=% schedule=%',
    custody,next_custody,fine,eligibility,dispute,reconciliation,schedule;
END $$;

DO $$
DECLARE
  fine bigint:=current_setting('erp.t20_b04_case')::bigint;
  schedule bigint:=current_setting('erp.t20_b04_schedule')::bigint;
  cutoff text:=to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
  request jsonb; draft jsonb; result jsonb; approved jsonb; batch uuid; original erp_private.t16_files;
  recovery erp_private.t14_lines; wage erp_private.t14_lines; handoff jsonb; member erp_private.t14_results;
  payment uuid; corrected uuid; payment_input jsonb; lines jsonb; allocation_input jsonb; closure_input jsonb; reversal_input jsonb;
  first_allocation bigint; pin bigint; reversal_id uuid; balances jsonb; proposal jsonb; gm_view jsonb; gm_line jsonb;
  schedule_snapshot jsonb; schedule_digest text; latest_request jsonb; legacy_review uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  request:=jsonb_build_object('month','2026-10-01','cutoff',cutoff,'expected_version',NULL,'reason','Calculate scoped synthetic October review');
  draft:=public.t14_payroll_command(pg_temp.fine_op(18),920001,920011,'calculate',request);
  IF public.t14_payroll_command(pg_temp.fine_op(18),920001,920011,'calculate',request) IS DISTINCT FROM draft||'{"replayed":true}'
  THEN RAISE EXCEPTION 'First payroll calculation did not replay the same result'; END IF;
  RESET ROLE;
  SELECT * INTO STRICT member FROM erp_private.t14_results WHERE version_id=(draft->>'version')::uuid AND employee_id=980002;
  SELECT * INTO STRICT recovery FROM erp_private.t14_lines WHERE version_id=member.version_id AND employee_id=980002 AND category='recovery';
  SELECT * INTO STRICT wage FROM erp_private.t14_lines WHERE version_id=member.version_id AND employee_id=980002 AND category='basic';
  proposal:=erp_private.t13_payroll_proposal(fine,'2026-10-01','deduction');
  IF recovery.amount<>100 OR recovery.source->>'case' IS DISTINCT FROM fine::text
    OR recovery.source->>'schedule' IS DISTINCT FROM schedule::text OR recovery.source->>'fingerprint' IS DISTINCT FROM proposal->>'digest'
    OR recovery.original_on IS DISTINCT FROM '2026-10-29'::date OR member.net<>3900
    OR EXISTS(SELECT 1 FROM erp_private.t14_lines WHERE version_id=member.version_id AND employee_id=980001 AND category='recovery')
  THEN RAISE EXCEPTION 'The first payroll deduction did not match the fine, schedule and actual driver'; END IF;

  IF to_regprocedure('erp_private.t15_retained_recovery_schedule(uuid)') IS NOT NULL THEN
  BEGIN
    PERFORM set_config('request.jwt.claims','{}',true);
    INSERT INTO erp_private.t15_reviews(run_id,version_id,digest,submitted_by,acknowledged_count)
    VALUES((draft->>'run')::uuid,member.version_id,draft->>'digest',pg_temp.t08_profile(2),0) RETURNING id INTO legacy_review;
    INSERT INTO erp_private.t15_review_events(review_id,kind,actor_id,reason)
    VALUES(legacy_review,'submitted',pg_temp.t08_profile(2),'Synthetic pre-migration review');
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.t06_actor(7);
    gm_view:=public.t15_payroll_review_workspace(920001,920011,'2026-10-01',legacy_review);
    IF (gm_view #>> '{review,recovery_schedule_required}')::boolean IS DISTINCT FROM true
       OR gm_view #> '{review,actions}' ? 'approve' THEN
      RAISE EXCEPTION 'An open pre-migration recovery submission still offers approval';
    END IF;
    latest_request:=jsonb_build_object('review',legacy_review,'version',member.version_id,'digest',draft->>'digest',
      'reason','Synthetic legacy transition');
    BEGIN
      PERFORM public.t15_payroll_review_command(pg_temp.fine_op(45),920001,920011,'approve',latest_request);
      RAISE EXCEPTION 'Approved a pre-migration submission without retained terms';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN IF SQLERRM NOT LIKE 'Withdraw and recalculate%' THEN RAISE; END IF; END;
    PERFORM pg_temp.t06_actor(2);
    IF public.t15_payroll_review_command(pg_temp.fine_op(46),920001,920011,'withdraw',latest_request)->>'state'
       IS DISTINCT FROM 'withdrawn' THEN RAISE EXCEPTION 'Accounts could not withdraw the legacy submission'; END IF;
    RAISE EXCEPTION USING ERRCODE='T2046',MESSAGE='Discard the synthetic legacy submission before continuing';
  EXCEPTION WHEN SQLSTATE 'T2046' THEN NULL;
  END;
  BEGIN
    PERFORM set_config('request.jwt.claims','{}',true);
    INSERT INTO erp_private.t15_reviews(run_id,version_id,digest,state,submitted_by,acknowledged_count,decided_by,decided_at)
    VALUES((draft->>'run')::uuid,member.version_id,draft->>'digest','approved',pg_temp.t08_profile(2),0,pg_temp.t08_profile(7),now())
    RETURNING id INTO legacy_review;
    INSERT INTO erp_private.t15_review_events(review_id,kind,actor_id,reason) VALUES
      (legacy_review,'submitted',pg_temp.t08_profile(2),'Synthetic previously submitted version'),
      (legacy_review,'approved',pg_temp.t08_profile(7),'Synthetic previously approved version');
    PERFORM erp_private.t15_reserve_approval(legacy_review,member.version_id);
    IF has_function_privilege('authenticated','erp_private.t15_retained_recovery_schedule(uuid)','EXECUTE') OR
       has_function_privilege('service_role','erp_private.t15_recovery_schedule_snapshot(uuid)','EXECUTE') THEN
      RAISE EXCEPTION 'Restricted repayment terms are directly executable outside the scoped review';
    END IF;
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.t06_actor(2);
    latest_request:=jsonb_build_object('review',legacy_review,'version',member.version_id,'digest',draft->>'digest');
    result:=public.t16_wps_issue_command(pg_temp.fine_op(47),920001,920011,'issue',latest_request);
    IF result->>'state' IS DISTINCT FROM 'prepared' OR
       public.t16_wps_issue_command(pg_temp.fine_op(47),920001,920011,'issue',latest_request) IS DISTINCT FROM result||'{"replayed":true}'
    THEN RAISE EXCEPTION 'A retained legacy approval lost payroll issue or exact retry'; END IF;
    RAISE EXCEPTION USING ERRCODE='T2047',MESSAGE='Discard the synthetic legacy approval before continuing';
  EXCEPTION WHEN SQLSTATE 'T2047' THEN NULL;
  END;
  RAISE NOTICE 'B04 verified legacy submission required a new version and retained legacy approval still issued and replayed';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  request:=jsonb_build_object('run',draft->'run','version',draft->'version','digest',draft->'digest',
    'acknowledge_exceptions',true,'reason','Accounts submitted exact synthetic October payroll');
  result:=public.t15_payroll_review_command(pg_temp.fine_op(19),920001,920011,'submit',request);
  request:=request||jsonb_build_object('review',result->'review','reason','GM approves the exact synthetic October payroll and recovery line');
  PERFORM pg_temp.t06_actor(3);
  BEGIN
    PERFORM public.t15_payroll_review_command(pg_temp.fine_op(20),920001,920011,'approve',request);
    RAISE EXCEPTION 'The schedule preparer approved the same recovery payroll';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.t06_actor(7);
  gm_view:=public.t15_payroll_review_workspace(920001,920011,'2026-10-01',(request->>'review')::uuid,980002);
  SELECT value INTO STRICT gm_line FROM jsonb_array_elements(gm_view->'detail'->'lines') WHERE value->>'id'=recovery.id::text;
  IF gm_line->'source'->>'schedule' IS DISTINCT FROM schedule::text OR (gm_line->>'amount')::numeric IS DISTINCT FROM 100
     OR NOT (gm_view->'review'->'actions' ? 'approve')
  THEN RAISE EXCEPTION 'GM did not receive the exact October recovery line'; END IF;
  schedule_snapshot:=gm_view->'review'->'recovery_schedule_snapshot';
  schedule_digest:=schedule_snapshot->>'digest';
  IF NOT coalesce(schedule_digest~'^[a-f0-9]{64}$',false)
     OR jsonb_array_length(schedule_snapshot->'schedules') IS DISTINCT FROM 1
     OR schedule_snapshot #>> '{schedules,0,schedule}' IS DISTINCT FROM schedule::text
     OR schedule_snapshot #>> '{schedules,0,line}' IS DISTINCT FROM recovery.id::text
     OR schedule_snapshot #>> '{schedules,0,period_deduction}' IS DISTINCT FROM '100.00'
     OR schedule_snapshot #> '{schedules,0,instalments}' IS DISTINCT FROM
       '[{"month":"2026-10-01","amount":"100.00"},{"month":"2026-11-01","amount":"200.00"}]'::jsonb
  THEN RAISE EXCEPTION 'B04 scoped GM must receive the complete retained instalment snapshot'; END IF;
  BEGIN
    PERFORM public.t15_payroll_review_command(pg_temp.fine_op(41),920001,920011,'approve',request);
    RAISE EXCEPTION 'GM approved a recovery without confirming the exact retained instalments';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN
    PERFORM public.t15_payroll_review_command(pg_temp.fine_op(42),920001,920011,'approve',
      request||jsonb_build_object('recovery_schedule_digest',repeat('f',64)));
    RAISE EXCEPTION 'GM approved a different schedule digest';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  request:=request||jsonb_build_object('recovery_schedule_digest',schedule_digest);
  BEGIN
    RESET ROLE;
    PERFORM set_config('request.jwt.claims','{}',true);
    -- Privileged fixture-only change leaves the reviewed October amount and schedule ID intact.
    UPDATE erp_private.t13_instalments SET due_month='2026-12-01' WHERE schedule_id=schedule AND due_month='2026-11-01';
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.t06_actor(7);
    IF public.t15_payroll_review_workspace(920001,920011,'2026-10-01',(request->>'review')::uuid)
       #> '{review,recovery_schedule_snapshot}' IS DISTINCT FROM schedule_snapshot
    THEN RAISE EXCEPTION 'Review history followed the changing terms instead of the retained snapshot'; END IF;
    PERFORM public.t15_payroll_review_command(pg_temp.fine_op(43),920001,920011,'approve',request);
    RAISE EXCEPTION 'GM approved after only a future instalment changed';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN
    IF SQLERRM NOT LIKE '%recovery schedule%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'B04 GM sees exact October schedule=% digest=% and both original instalments',schedule,schedule_digest;
  BEGIN
    PERFORM public.t15_payroll_review_command(pg_temp.fine_op(21),920001,920011,'approve',request||jsonb_build_object('digest',repeat('f',64)));
    RAISE EXCEPTION 'GM approved a mismatched October digest';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  approved:=public.t15_payroll_review_command(pg_temp.fine_op(22),920001,920011,'approve',request);
  IF approved->>'state' IS DISTINCT FROM 'approved'
     OR public.t15_payroll_review_command(pg_temp.fine_op(22),920001,920011,'approve',request) IS DISTINCT FROM approved||'{"replayed":true}'
  THEN RAISE EXCEPTION 'GM exact approval or replay changed'; END IF;
  BEGIN
    PERFORM public.t15_payroll_review_command(pg_temp.fine_op(22),920001,920011,'approve',
      request||jsonb_build_object('recovery_schedule_digest',repeat('e',64)));
    RAISE EXCEPTION 'Replayed an approval operation with different schedule terms';
  EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL; END;
  RESET ROLE;
  IF NOT EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines r WHERE r.review_id=(approved->>'review')::uuid
    AND r.version_id=member.version_id AND r.line_id=recovery.id AND r.recovery_case_id=fine)
  THEN RAISE EXCEPTION 'GM did not reserve the exact approved recovery line'; END IF;
  IF (SELECT count(*) FROM erp_private.t15_review_events e WHERE e.review_id=(approved->>'review')::uuid
      AND e.kind='approved' AND e.actor_id=pg_temp.t08_profile(7) AND e.facts->>'recovery_schedule_digest'=schedule_digest)<>1
  THEN RAISE EXCEPTION 'The independent GM decision did not retain one exact schedule digest'; END IF;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  request:=jsonb_build_object('review',approved->'review','version',approved->'version','digest',approved->'digest');
  result:=public.t16_wps_issue_command(pg_temp.fine_op(23),920001,920011,'issue',request);
  batch:=(result->>'batch')::uuid;
  IF public.t16_wps_issue_command(pg_temp.fine_op(23),920001,920011,'issue',request) IS DISTINCT FROM result||'{"replayed":true}'
  THEN RAISE EXCEPTION 'WPS issuance replay changed the file identity'; END IF;
  RESET ROLE;
  SELECT * INTO STRICT original FROM erp_private.t16_files f WHERE f.batch_id=batch;
  IF original.row_count<>2 OR original.net_total<>7900 OR original.sha256<>encode(extensions.digest(original.content,'sha256'),'hex')
  THEN RAISE EXCEPTION 'Synthetic WPS original did not match the sealed payroll'; END IF;
  handoff:=jsonb_build_object('batch',batch,'wps_file',original.id,'reference','T20-B04-SYNTHETIC-HANDOFF');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  PERFORM public.t16_wps_issue_command(pg_temp.fine_op(24),920001,920011,'start-handoff',handoff);
  PERFORM public.t16_wps_issue_command(pg_temp.fine_op(25),920001,920011,'record-submission',handoff||pg_temp.t16_proof(998602));
  PERFORM public.t16_wps_issue_command(pg_temp.fine_op(26),920001,920011,'acknowledge',handoff||pg_temp.t16_proof(998602));
  result:=public.t16_wps_issue_command(pg_temp.fine_op(27),920001,920011,'accept',handoff||pg_temp.t16_proof(998602));
  IF result->>'state' IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'Retained simulated bank acceptance was unavailable'; END IF;

  PERFORM pg_temp.t06_actor(3);
  latest_request:='{"mode":"instalments","instalments":[{"month":"2026-10-01","amount":100},{"month":"2026-12-01","amount":200}],"reason":"Change future instalment during bank handoff"}';
  BEGIN
    PERFORM pg_temp.fine_recovery(44,fine,'propose-schedule',latest_request,true);
    RAISE EXCEPTION 'An unclosed WPS recovery reservation allowed the original schedule to be replaced';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

  payment_input:=jsonb_build_object('batch',batch,'employee',980002,'channel','wps','reference','T20-B04-PARTIAL-01',
    'amount','100','currency','AED','paid_on','2026-11-19','outcome','partial')||pg_temp.t16_proof(998603);
  PERFORM pg_temp.t06_actor(6);
  BEGIN
    PERFORM public.t16_payroll_payment_command(pg_temp.fine_op(28),920001,920012,'receipt',payment_input);
    RAISE EXCEPTION 'Sibling Accounts recorded an original-scope payment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.t06_actor(9);
  BEGIN
    PERFORM public.t16_payroll_payment_command(pg_temp.fine_op(29),920002,920021,'receipt',payment_input);
    RAISE EXCEPTION 'Other company Accounts recorded an original-scope payment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.t06_actor(3);
  result:=public.t16_payroll_payment_command(pg_temp.fine_op(30),920001,920011,'receipt',payment_input);
  payment:=(result->>'payment')::uuid;
  IF public.t16_payroll_payment_command(pg_temp.fine_op(30),920001,920011,'receipt',payment_input) IS DISTINCT FROM result||'{"replayed":true}'
  THEN RAISE EXCEPTION 'Payment receipt retry did not retain one employee receipt'; END IF;
  RESET ROLE;
  balances:=erp_private.t13_financial_summary(fine);
  IF (balances->>'collected')::numeric IS DISTINCT FROM 0 OR (balances->>'outstanding')::numeric IS DISTINCT FROM 300
    OR NOT EXISTS(SELECT 1 FROM erp_private.t16_payment_events e WHERE e.payment_id=payment AND e.file_id=998603 AND e.amount=100)
    OR EXISTS(SELECT 1 FROM erp_private.t13_payroll_pins p WHERE p.case_id=fine)
  THEN RAISE EXCEPTION 'Net payment was treated as a recovery deduction'; END IF;
  RAISE NOTICE 'B04 October run=% version=% digest=% GM review=% line=% amount=100.00 WPS file=% SHA-256=% payment=% verified cash=100.00 collected=0.00 outstanding=300.00',
    draft->>'run',member.version_id,approved->>'digest',approved->>'review',recovery.id,original.id,original.sha256,payment;

  lines:=jsonb_build_array(jsonb_build_object('line',wage.id,'amount','160'),jsonb_build_object('line',recovery.id,'amount','60'));
  allocation_input:=jsonb_build_object('batch',batch,'payment',payment,'revision',0,'lines',lines,
    'reason','Verified allocation of partial cash and exact recovery deduction');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(3);
  BEGIN
    PERFORM public.t16_payroll_payment_command(pg_temp.fine_op(31),920001,920011,'allocate',allocation_input||pg_temp.t16_proof(998603));
    RAISE EXCEPTION 'Net-only payment proof settled a recovery line';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN
    IF SQLERRM NOT LIKE 'Confirm deductions%with separate verified evidence%' THEN RAISE; END IF;
    RAISE NOTICE 'B04 net-only allocation denied [% %]',SQLSTATE,SQLERRM;
  END;
  result:=public.t16_payroll_payment_command(pg_temp.fine_op(32),920001,920011,'allocate',allocation_input||pg_temp.t16_proof(998604));
  IF public.t16_payroll_payment_command(pg_temp.fine_op(32),920001,920011,'allocate',allocation_input||pg_temp.t16_proof(998604))
      IS DISTINCT FROM result||'{"replayed":true}' THEN RAISE EXCEPTION 'Exact partial deduction allocation was duplicated'; END IF;
  RESET ROLE;
  SELECT p.id,a.id INTO STRICT pin,first_allocation
  FROM erp_private.t13_payroll_pins p JOIN erp_private.t13_allocations a ON a.pin_id=p.id
  JOIN erp_private.t16_recovery_links l ON l.recovery_allocation_id=a.id
  JOIN erp_private.t16_payment_allocations w ON w.id=l.allocation_id
  JOIN erp_private.t16_allocation_decisions d ON d.id=w.decision_id
  WHERE p.case_id=fine AND p.schedule_id=schedule AND p.payroll_line_id=recovery.id AND p.payroll_run_id=member.version_id
     AND p.gm_approval_id=(approved->>'review')::uuid AND p.gm_approver_id=pg_temp.t08_profile(7)
     AND p.proposal_digest=recovery.source->>'fingerprint' AND a.amount=60 AND d.payment_id=payment AND d.file_id=998604;
  balances:=erp_private.t13_financial_summary(fine);
  proposal:=erp_private.t13_payroll_proposal(fine,'2026-11-01','deduction');
  IF (balances->>'collected')::numeric IS DISTINCT FROM 60 OR (balances->>'outstanding')::numeric IS DISTINCT FROM 240
     OR proposal->>'status' IS DISTINCT FROM 'held' OR erp_private.t15_recovery_closed(recovery.id)
  THEN RAISE EXCEPTION 'Partial collection did not leave the balance held pending explicit disposition'; END IF;
  closure_input:=jsonb_build_object('batch',batch,'payment',payment,'revision',1,'lines','[]'::jsonb,
    'close_recoveries',jsonb_build_array(jsonb_build_object('line',recovery.id,'amount','60')),
    'reason','Attest 60 actually deducted, release the unapplied 40 for the next run');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(3);
  PERFORM public.t16_payroll_payment_command(pg_temp.fine_op(33),920001,920011,'allocate',closure_input||pg_temp.fine_proof(999213));
  RESET ROLE;
  proposal:=erp_private.t13_payroll_proposal(fine,'2026-11-01','deduction');
  IF NOT erp_private.t15_recovery_closed(recovery.id) OR (proposal->>'amount')::numeric IS DISTINCT FROM 240
  THEN RAISE EXCEPTION 'Evidence did not release only the actual residual'; END IF;
  RAISE NOTICE 'B04 linked pin=% allocation=% evidence file=998604 closure evidence file=999213 collected=60.00 outstanding=240.00',pin,first_allocation;

  reversal_input:=jsonb_build_object('batch',batch,'payment',payment,'revision',2,
     'reason','Synthetic verified linked correction to partial payment')||pg_temp.t16_proof(998605);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(3);
  result:=public.t16_payroll_payment_command(pg_temp.fine_op(34),920001,920011,'reverse',reversal_input);
  IF result->>'state' IS DISTINCT FROM 'reversed' OR public.t16_payroll_payment_command(pg_temp.fine_op(34),920001,920011,'reverse',reversal_input)
      IS DISTINCT FROM result||'{"replayed":true}' THEN RAISE EXCEPTION 'Linked reversal or retry changed'; END IF;
  RESET ROLE;
  SELECT id INTO STRICT reversal_id FROM erp_private.t16_payment_reversals WHERE payment_id=payment AND file_id=998605;
  balances:=erp_private.t13_financial_summary(fine);
  IF (balances->>'collected')::numeric IS DISTINCT FROM 0 OR (balances->>'outstanding')::numeric IS DISTINCT FROM 300
     OR erp_private.t15_recovery_closed(recovery.id)
     OR (SELECT count(*) FROM erp_private.t13_allocations WHERE reverses_allocation_id=first_allocation AND amount=60)<>1
  THEN RAISE EXCEPTION 'Reversal failed to reopen the 60 and retain the linked proof'; END IF;
  RAISE NOTICE 'B04 reversal=% reverses allocation=% with evidence file=998605, collected=0.00 outstanding=300.00',reversal_id,first_allocation;

  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(3);
  corrected:=(public.t16_payroll_payment_command(pg_temp.fine_op(35),920001,920011,'receipt',
    payment_input||jsonb_build_object('reference','T20-B04-PARTIAL-CORRECTED')||pg_temp.t16_proof(998611))->>'payment')::uuid;
  PERFORM public.t16_payroll_payment_command(pg_temp.fine_op(36),920001,920011,'allocate',
    allocation_input||jsonb_build_object('payment',corrected)||pg_temp.t16_proof(998604));
  PERFORM public.t16_payroll_payment_command(pg_temp.fine_op(37),920001,920011,'allocate',
    closure_input||jsonb_build_object('payment',corrected)||pg_temp.fine_proof(999213));
  RESET ROLE;
  PERFORM set_config('request.jwt.claims','{}',true);
  balances:=erp_private.t13_financial_summary(fine);
  IF (balances->>'collected')::numeric IS DISTINCT FROM 60 OR (balances->>'outstanding')::numeric IS DISTINCT FROM 240
    OR (SELECT count(*) FROM erp_private.t13_payroll_pins WHERE case_id=fine)<>1
    OR NOT erp_private.t15_recovery_closed(recovery.id)
  THEN RAISE EXCEPTION 'Corrected cash did not restore only the original 60 on the same pin'; END IF;
  PERFORM set_config('erp.t20_b04_origin_line',recovery.id::text,true);
  RAISE NOTICE 'B04 corrected payment=% kept original pin=% and schedule=% with collected=60.00 outstanding=240.00',corrected,pin,schedule;
END $$;

DO $$
DECLARE
  fine bigint:=current_setting('erp.t20_b04_case')::bigint;
  schedule bigint:=current_setting('erp.t20_b04_schedule')::bigint;
  original_line uuid:=current_setting('erp.t20_b04_origin_line')::uuid;
  cutoff text:=to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z';
  draft jsonb; request jsonb; result jsonb; recovery erp_private.t14_lines; proposal jsonb; snapshot jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  request:=jsonb_build_object('month','2026-11-01','cutoff',cutoff,'expected_version',NULL,'reason','Calculate the next scoped synthetic monthly review');
  draft:=public.t14_payroll_command(pg_temp.fine_op(38),920001,920011,'calculate',request);
  RESET ROLE;
  SELECT * INTO STRICT recovery FROM erp_private.t14_lines WHERE version_id=(draft->>'version')::uuid AND category='recovery';
  proposal:=erp_private.t13_payroll_proposal(fine,'2026-11-01','deduction');
  IF recovery.amount<>240 OR recovery.employee_id<>980002 OR recovery.id=original_line
     OR recovery.source->>'case' IS DISTINCT FROM fine::text OR recovery.source->>'schedule' IS DISTINCT FROM schedule::text
     OR recovery.source->>'fingerprint' IS DISTINCT FROM proposal->>'digest'
     OR (proposal->>'applied_to_schedule')::numeric IS DISTINCT FROM 60
     OR (SELECT amount FROM erp_private.t14_lines WHERE id=original_line) IS DISTINCT FROM 100
  THEN RAISE EXCEPTION 'The next exact monthly payroll did not link just the 240 outstanding to the unchanged recovery case'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(2);
  request:=jsonb_build_object('run',draft->'run','version',draft->'version','digest',draft->'digest',
    'acknowledge_exceptions',true,'reason','Accounts submitted only the linked remaining 240');
  result:=public.t15_payroll_review_command(pg_temp.fine_op(39),920001,920011,'submit',request);
  PERFORM pg_temp.t06_actor(7);
  snapshot:=public.t15_payroll_review_workspace(920001,920011,'2026-11-01',(result->>'review')::uuid)
    #> '{review,recovery_schedule_snapshot}';
  IF snapshot #>> '{schedules,0,period_deduction}' IS DISTINCT FROM '240.00'
     OR snapshot #> '{schedules,0,instalments}' IS DISTINCT FROM
       '[{"month":"2026-10-01","amount":"100.00"},{"month":"2026-11-01","amount":"200.00"}]'::jsonb
  THEN RAISE EXCEPTION 'November approval must keep the original terms and show the exact residual separately'; END IF;
  result:=public.t15_payroll_review_command(pg_temp.fine_op(40),920001,920011,'approve',
    request||jsonb_build_object('review',result->'review','recovery_schedule_digest',snapshot->>'digest',
      'reason','GM agrees the exact next synthetic period and outstanding line'));
  RESET ROLE;
  IF result->>'state' IS DISTINCT FROM 'approved' OR NOT EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines r
    WHERE r.review_id=(result->>'review')::uuid AND r.line_id=recovery.id AND r.recovery_case_id=fine AND r.month='2026-11-01')
  THEN RAISE EXCEPTION 'The second approved review did not contain exactly the remaining case deduction'; END IF;
  RAISE NOTICE 'B04 November run=% version=% digest=% GM review=% line=% linked original line=% amount=240.00; October approval retained 100.00, actual deduction 60.00',
    draft->>'run',draft->>'version',draft->>'digest',result->>'review',recovery.id,original_line;
END $$;

SELECT 'PASS B04 signed custody and actual driver, independent disputed eligibility and Accounts proposal, exact GM monthly approvals, net-only denial, partial allocation and reversal, corrected payment and next-month residual';
ROLLBACK;
