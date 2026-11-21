-- Run after the shared, transaction-wrapped T07 synthetic fixture.
DO $$ BEGIN
 IF to_regprocedure('public.t13_fleet_command(uuid,bigint,text,jsonb)') IS NULL
   OR to_regprocedure('public.t13_fleet_workspace(bigint)') IS NULL THEN
  RAISE EXCEPTION 'T13 restricted Fleet and PRO entry points are missing';
 END IF;
END $$;

INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES('t13_fleet_verifier','Synthetic T13 Fleet verifier',false);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,920001,920011,true FROM public.user_profiles u CROSS JOIN public.roles r
WHERE u.auth_user_id='98000000-0000-4000-8000-000000000007' AND r.role_code='t13_fleet_verifier';
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t06_custodian',ARRAY['fleet.fines.record','fleet.fines.view','fleet.fines.match','fleet.fines.verify','fleet.incidents.manage']),
 ('t13_fleet_verifier',ARRAY['fleet.fines.view','fleet.fines.match','fleet.fines.verify']),
 ('t06_workshop',ARRAY['workshop.recoveries.intake']),
 ('t06_hse',ARRAY['fleet.fines.view']),
 ('t06_keeper',ARRAY['fleet.fines.view','fleet.fines.record','fleet.fines.match','fleet.fines.verify'])
) g(role_code,codes) JOIN public.roles r ON r.role_code=g.role_code
JOIN public.permissions p ON p.permission_code=ANY(g.codes) ON CONFLICT DO NOTHING;

INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
 confidentiality_level,status,current_version_id)
 OVERRIDING SYSTEM VALUE
 SELECT d.id,'T13-INTAKE-'||d.id,'Synthetic original',t.id,t.category_id,920001,d.branch,'internal','active',NULL
 FROM (VALUES
 (997301,'T13_AUTHORITY_NOTICE',920011),(997302,'T13_AUTHORITY_REVISION',920011),(997303,'T13_AUTHORITY_REVISION',920011),
 (997304,'T13_DRIVER_EVIDENCE',920011),(997305,'T13_AUTHORITY_NOTICE',920011),(997306,'T13_AUTHORITY_NOTICE',920011),
 (997307,'T13_AUTHORITY_NOTICE',920012),(997308,'T13_INSURER_RECORD',920011),(997309,'DRIVING_LICENSE',920011))
 d(id,type,branch) JOIN public.dms_document_types t ON t.type_code=d.type;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
 SELECT id,id,1,true FROM public.dms_documents WHERE id BETWEEN 997301 AND 997309;
UPDATE public.dms_documents SET current_version_id=id WHERE id BETWEEN 997301 AND 997309;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,
 file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE
 SELECT id,id,id,'original','dms-documents','test/t13-'||id||'.pdf','original.pdf','application/pdf',100,repeat('c',64),'verified'
 FROM public.dms_documents WHERE id BETWEEN 997301 AND 997309;

INSERT INTO erp_private.fleet_commitments(asset_id,employee_id,employment_period_id,company_id,branch_id,site_id,kind,status,
 committed_during,planned_return,policy_id,created_by)
SELECT 980101,p.employee_id,p.id,920001,920011,980001,'custody','closed',tstzrange(s.start_at,s.end_at,'[)'),
 s.end_at,policy.id,(SELECT u.id FROM public.user_profiles u WHERE u.auth_user_id='98000000-0000-4000-8000-000000000001')
FROM (VALUES (980001,'2026-11-18 09:00+04'::timestamptz,'2026-11-18 11:00+04'::timestamptz),
 (980002,'2026-11-18 11:00+04','2026-11-18 14:00+04')) s(worker_id,start_at,end_at)
JOIN erp_private.t03_employment_periods p ON p.employee_id=s.worker_id
JOIN erp_private.fleet_availability_policies policy ON policy.company_id=920001 AND policy.category='light_vehicle';
INSERT INTO erp_private.fleet_custody_events(commitment_id,kind,occurred_at,actor_id,reason)
 SELECT c.id,ev.kind,ev.at,c.created_by,'Synthetic same-day actual custody'
 FROM erp_private.fleet_commitments c CROSS JOIN LATERAL
 (VALUES ('checkout',lower(c.committed_during)),('return',upper(c.committed_during))) ev(kind,at) WHERE c.asset_id=980101;

WITH holds AS (
 INSERT INTO erp_private.fleet_asset_holds(asset_id,kind,placed_at,placed_by,reason)
 SELECT id,'workshop','2026-11-18 10:25+04',created_by,'Synthetic damage assessment' FROM erp_private.fleet_assets WHERE id=980101
 RETURNING *
)
INSERT INTO erp_private.t10_assessments(id,asset_id,company_id,branch_id,source_kind,source_ref,occurred_at,reported_by,finding,
 first_hold_id,outcome,assessed_by,assessed_at,diagnosis) OVERRIDING SYSTEM VALUE
SELECT 997310,asset_id,920001,920011,'incident','T13-EXACT-ASSESSMENT','2026-11-18 10:15+04',placed_by,'Reported damage',
 id,'repair',placed_by,'2026-11-18 10:25+04','Third-party repair with no employee referral' FROM holds;

WITH holds AS (
 INSERT INTO erp_private.fleet_asset_holds(asset_id,kind,placed_at,placed_by,reason)
 SELECT id,'workshop','2026-11-17 10:25+04',created_by,'Synthetic referral assessment' FROM erp_private.fleet_assets WHERE id=980101
 RETURNING *
)
INSERT INTO erp_private.t10_assessments(id,asset_id,company_id,branch_id,source_kind,source_ref,document_id,version_id,file_id,
 occurred_at,reported_by,finding,first_hold_id,outcome,assessed_by,assessed_at,diagnosis) OVERRIDING SYSTEM VALUE
SELECT 997311,asset_id,920001,920011,'incident','T13-REFERRAL-ASSESSMENT',980101,980101,980101,
 '2026-11-17 10:15+04',placed_by,'Reported damage',id,'usable-as-is',placed_by,'2026-11-17 10:25+04','Synthetic diagnosis' FROM holds;
INSERT INTO erp_private.t10_hr_referrals(assessment_id,employee_id,employment_id,company_id,branch_id,referred_by,reason)
SELECT a.id,p.employee_id,p.id,p.company_id,p.branch_id,a.assessed_by,'Synthetic exact signed referral'
FROM erp_private.t10_assessments a CROSS JOIN erp_private.t03_employment_periods p WHERE a.id=997311 AND p.employee_id=980002;
INSERT INTO erp_private.t10_job_cycles(id,assessment_id,cycle,hold_id,state,opened_by,scope_of_work,estimate_aed,actual_cost_aed,closed_at)
 OVERRIDING SYSTEM VALUE
SELECT 997310,id,1,first_hold_id,'closed',assessed_by,'Synthetic nonemployee repair',1200,950,'2026-11-18 18:00+04'
FROM erp_private.t10_assessments WHERE id=997310;
INSERT INTO erp_private.fleet_asset_holds(id,asset_id,kind,placed_at,placed_by,reason) OVERRIDING SYSTEM VALUE
SELECT 997310,id,'hse','2026-11-18 10:15+04',created_by,'T13-SENSITIVE-HSE-DETAIL'
FROM erp_private.fleet_assets WHERE id=980101;
CREATE FUNCTION pg_temp.t13_proof(p_id bigint) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('document',p_id,'version',p_id,'file',p_id)
$$;
CREATE FUNCTION pg_temp.t13_call(p_target bigint,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t13_fleet_command(gen_random_uuid(),p_target,p_action,p_data)
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
 notice jsonb:='{"authority":"Dubai Police","reference":"F-TEST-2026","offence":"Traffic notice",
 "location":"Dubai","occurred_at":"2026-11-18T10:15:00+04:00","notice_on":"2026-11-18",
 "plate_jurisdiction":"AEDU","plate_class":"C","plate_number":"T06PLATE","amount":500,"currency":"AED"}';
 fine bigint; boundary bigint; unknown_case bigint; incident bigint; damage bigint; referral_case bigint;
 source_version bigint; result jsonb; row_state jsonb; correction jsonb; operation uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_temp.t06_actor(1);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t13_fleet_scopes()) WHERE value->>'id'='920011')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.t13_fleet_scopes()) WHERE value->>'id'='920012')
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t13_fleet_workspace(920011)->'evidence_choices')
       WHERE value->>'file'='997301' AND value->>'type_code'='T13_AUTHORITY_NOTICE')
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.t13_fleet_workspace(920011)->'evidence_choices')
       WHERE value->>'file' IN ('997307','997309')) THEN
  RAISE EXCEPTION 'T13 Fleet scope or original selection included invalid choices';
 END IF;
 BEGIN
  PERFORM pg_temp.t13_call(920011,'record-fine',notice||jsonb_build_object('evidence',pg_temp.t13_proof(997309)));
  RAISE EXCEPTION 'Unrelated licence original was accepted as a fine'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
  PERFORM pg_temp.t13_call(920011,'record-fine',notice||jsonb_build_object('evidence',pg_temp.t13_proof(997307)));
  RAISE EXCEPTION 'Sibling-branch original was accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 notice:=notice||jsonb_build_object('evidence',pg_temp.t13_proof(997301));
 result:=public.t13_fleet_command(operation,920011,'record-fine',notice);
 fine:=(result->>'id')::bigint;
 IF result->>'asset_id' IS DISTINCT FROM '980101' OR result->>'subject_status' IS DISTINCT FROM 'unresolved'
   OR fine IS NULL OR public.t13_fleet_command(operation,920011,'record-fine',notice)
      IS DISTINCT FROM result||'{"replayed":true}'::jsonb THEN
  RAISE EXCEPTION 'The historical plate or notice replay is wrong: %',result;
 END IF;
 BEGIN
  PERFORM pg_temp.t13_call(920011,'record-fine',notice||'{"authority":"DUBAI POLICE","reference":"f-test-2026"}');
  RAISE EXCEPTION 'Official duplicates were accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 source_version:=(result->>'source_revision')::bigint;
 result:=pg_temp.t13_call(fine,'match-custody',jsonb_build_object('revision',source_version));
 IF result->>'subject_status' IS DISTINCT FROM 'custody-candidate' THEN
  RAISE EXCEPTION '10:15 custody did not yield a candidate: %',result;
 END IF;
 SELECT value INTO row_state FROM jsonb_array_elements(public.t13_fleet_workspace(920011)->'cases') WHERE value->>'id'=fine::text;
 IF row_state->>'employee_id' IS NOT NULL OR row_state->>'custody_candidate_id' IS DISTINCT FROM '980001' THEN
  RAISE EXCEPTION 'Wrong same-day custodian or premature driver verification: %',row_state;
 END IF;
 source_version:=(result->>'source_revision')::bigint;
 BEGIN
  PERFORM pg_temp.t13_call(fine,'verify-driver',jsonb_build_object('revision',source_version,'employee',980002,
    'evidence',pg_temp.t13_proof(997304),'reason','Independent signed actual driver statement'));
  RAISE EXCEPTION 'Reporter was allowed to verify the driver'; EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(7);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t13_driver_choices(fine,'T06-A2')) WHERE value->>'id'='980002')
   OR public.t13_driver_choices(fine,'T06-B1')<>'[]'::jsonb THEN
  RAISE EXCEPTION 'Driver search omitted the eligible employee or crossed employing scope';
 END IF;
 result:=pg_temp.t13_call(fine,'verify-driver',jsonb_build_object('revision',source_version,'employee',980002,
    'evidence',pg_temp.t13_proof(997304),'reason','Independent signed actual driver statement'));
 IF result->>'subject_status' IS DISTINCT FROM 'verified' THEN
  RAISE EXCEPTION 'Distinct driver was not verified: %',result;
 END IF;
 SELECT value INTO row_state FROM jsonb_array_elements(public.t13_fleet_workspace(920011)->'cases') WHERE value->>'id'=fine::text;
 IF row_state->>'employee_id' IS DISTINCT FROM '980002' THEN RAISE EXCEPTION 'Driver was inferred from custody'; END IF;
 source_version:=(result->>'source_revision')::bigint;
 PERFORM pg_temp.t06_actor(5);
 SELECT value INTO row_state FROM jsonb_array_elements(public.t13_fleet_workspace(920011)->'cases') WHERE value->>'id'=fine::text;
 IF row_state->>'employee_id' IS NOT NULL OR row_state->>'evidence' IS NOT NULL OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(row_state->'history') WHERE value->>'evidence' IS NOT NULL
 ) THEN RAISE EXCEPTION 'Read-only Fleet actor received employee or source evidence beyond permission'; END IF;
 PERFORM pg_temp.t06_actor(1);
 correction:=jsonb_build_object('revision',source_version,'authority_revision','AUTH-REDUCE-1','amount',250,'notice_on',
   '2026-11-18','status','reduced','evidence',pg_temp.t13_proof(997302),'reason','Confirmed appeal reduction');
 result:=pg_temp.t13_call(fine,'revise-fine',correction);
 IF result->>'source_amount' IS DISTINCT FROM '250.0000' OR result->>'source_status' IS DISTINCT FROM 'reduced' THEN
  RAISE EXCEPTION 'Authority reduction failed: %',result;
 END IF;
 result:=pg_temp.t13_call(fine,'revise-fine',correction||jsonb_build_object('revision',result->'source_revision','authority_revision',
   'AUTH-CANCEL-1','amount',0,'status','cancelled','evidence',pg_temp.t13_proof(997303),'reason','Authority cancelled the balance'));
 IF result->>'source_status' IS DISTINCT FROM 'cancelled' THEN RAISE EXCEPTION 'Authority cancellation failed'; END IF;

 result:=pg_temp.t13_call(920011,'record-fine',notice||jsonb_build_object('reference','F-BOUNDARY','occurred_at',
   '2026-11-18T11:00:00+04:00','evidence',pg_temp.t13_proof(997305)));
 boundary:=(result->>'id')::bigint;
 result:=pg_temp.t13_call(boundary,'match-custody',jsonb_build_object('revision',result->'source_revision'));
 IF result->>'subject_status' IS DISTINCT FROM 'unresolved' OR result->>'match_state' IS DISTINCT FROM 'boundary' THEN
  RAISE EXCEPTION 'Handover boundary was attributed: %',result;
 END IF;
 result:=pg_temp.t13_call(920011,'record-fine',notice||jsonb_build_object('reference','F-UNKNOWN','plate_number','UNKNOWN',
   'evidence',pg_temp.t13_proof(997306)));
 unknown_case:=(result->>'id')::bigint;
 result:=pg_temp.t13_call(unknown_case,'match-custody',jsonb_build_object('revision',result->'source_revision'));
 IF result->>'asset_id' IS NOT NULL OR result->>'match_state' IS DISTINCT FROM 'plate-unresolved' THEN
  RAISE EXCEPTION 'Unknown plate was matched: %',result;
 END IF;
 result:=pg_temp.t13_call(920011,'open-incident','{"reference":"INC-T13","asset":980101,"occurred_at":"2026-11-18T10:15:00+04:00",
 "summary":"Shared source-safe incident"}');
 incident:=(result->>'id')::bigint;
 SELECT value INTO row_state FROM jsonb_array_elements(public.t13_fleet_workspace(920011)->'cases') WHERE value->>'id'=fine::text;
 PERFORM pg_temp.t13_call(fine,'link-incident',jsonb_build_object('revision',row_state->'source_revision','incident',incident));
 PERFORM pg_temp.t13_call(incident,'link-activity',jsonb_build_object('kind','insurer','reference','INS-T13','evidence',pg_temp.t13_proof(997308)));

 PERFORM pg_temp.t13_call(incident,'link-activity','{"kind":"repair","parent":997310}');
 PERFORM pg_temp.t13_call(incident,'link-activity','{"kind":"hse","parent":997310}');
 IF public.t13_fleet_workspace(920011)::text LIKE '%T13-SENSITIVE-HSE-DETAIL%' THEN
  RAISE EXCEPTION 'An HSE record disclosed protected content in the Fleet incident';
 END IF;
 PERFORM pg_temp.t06_actor(4);
 result:=pg_temp.t13_call(920011,'open-damage',jsonb_build_object('assessment',997310,'incident',incident));
 damage:=(result->>'id')::bigint;
 IF damage IS NULL OR result->>'subject_status' IS DISTINCT FROM 'no-referral' OR result->>'incident_id' IS DISTINCT FROM incident::text
  OR (result->>'source_amount')::numeric<>950
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(public.t13_fleet_workspace(920011)->'cases') WHERE value->>'source_kind'='fine') THEN
  RAISE EXCEPTION 'Independent Workshop damage or fine isolation failed: %',result;
 END IF;
 BEGIN
  PERFORM pg_temp.t13_call(920011,'open-damage',jsonb_build_object('assessment',997311,'incident',incident));
  RAISE EXCEPTION 'An unrelated prior-day assessment was linked to the incident'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 result:=pg_temp.t13_call(920011,'open-damage','{"assessment":997311}');
 referral_case:=(result->>'id')::bigint;
 IF result->>'subject_status' IS DISTINCT FROM 'verified' OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(public.t13_fleet_workspace(920011)->'cases') WHERE value->>'id'=referral_case::text
   AND value->>'employee_id' IS NULL) THEN RAISE EXCEPTION 'Exact referral or Workshop person masking failed'; END IF;
 PERFORM pg_temp.t06_actor(6);
 IF public.t13_fleet_workspace(920011) IS NOT NULL THEN RAISE EXCEPTION 'Sibling branch can read a case'; END IF;
 BEGIN
  PERFORM pg_temp.t13_call(fine,'match-custody','{"revision":1}');
  RAISE EXCEPTION 'Sibling branch can mutate a case'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(9);
 IF public.t13_fleet_workspace(920011) IS NOT NULL THEN RAISE EXCEPTION 'Other company can read a case'; END IF;
 PERFORM pg_temp.t06_actor(8);
 IF public.t13_fleet_workspace(920011) IS NOT NULL THEN RAISE EXCEPTION 'Administrative scope inherited a held business grant'; END IF;
END $$;
RESET ROLE;

DO $$ BEGIN
 IF (SELECT count(*) FROM erp_private.t13_case_versions v JOIN erp_private.t13_cases c ON c.id=v.case_id
   WHERE c.source_kind='fine' AND v.facts->>'source_status' IN ('reduced','cancelled'))<2 THEN
  RAISE EXCEPTION 'The original correction receipts were not retained';
 END IF;
 BEGIN
  UPDATE public.dms_document_files SET sha256_hash=repeat('d',64) WHERE id=997301;
  RAISE EXCEPTION 'Retained official original changed'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
END $$;

INSERT INTO erp_private.t13_cases(source_kind,company_id,branch_id,occurred_at,source_amount,currency,source_status,
 authority_key,reference_key,reported_by)
SELECT 'fine',920001,920011,'2026-11-18 10:15+04',5,'AED','reported','PAGINATION-FIXTURE',n::text,actor.id
FROM generate_series(1,101) n CROSS JOIN public.user_profiles actor WHERE actor.auth_user_id='98000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$
DECLARE first_page jsonb; second_page jsonb; cursor_id bigint;
BEGIN
 PERFORM pg_temp.t06_actor(1);
 first_page:=public.t13_fleet_workspace(920011);
 cursor_id:=(first_page->>'next_before')::bigint;
 second_page:=public.t13_fleet_workspace_page(920011,cursor_id);
 IF jsonb_array_length(first_page->'cases')<>100 OR cursor_id IS NULL
   OR jsonb_array_length(second_page->'cases')<>4 OR second_page->>'next_before' IS NOT NULL
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(second_page->'cases') older WHERE (older->>'id')::bigint>=cursor_id) THEN
  RAISE EXCEPTION 'Exact Fleet case pagination repeated or skipped a row';
 END IF;
END $$;
RESET ROLE;
SELECT 'T13 Fleet/PRO historical custody, driver verification, fine history and incident isolation passed';
ROLLBACK;
