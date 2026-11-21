-- Prepend the guarded T07 and T08 synthetic fixture setup, before authenticated use.
DO $$ BEGIN
 IF to_regprocedure('public.t12_labour_command(uuid,bigint,text,jsonb)') IS NULL
 OR to_regprocedure('public.t12_labour_hr(uuid,bigint,text,text)') IS NULL
 OR to_regprocedure('erp_private.t12_claim_workshop(bigint,uuid,tstzmultirange)') IS NULL
 THEN RAISE EXCEPTION 'T12 Workshop labour and the shared payroll claim contract are missing'; END IF;
END $$;

INSERT INTO public.roles(role_code,role_name,is_system_role)
 SELECT 't12_labour_'||x,x,false FROM unnest(ARRAY['enter','approve','cost','hr','accounts']) x;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('enter',ARRAY['workshop.labour.record','fleet.inspections.report','workshop.jobs.manage','dms.documents.view','dms.documents.preview']),
 ('approve',ARRAY['workshop.labour.approve','workshop.assess','workshop.jobs.release','dms.documents.view','dms.documents.preview']),
 ('cost',ARRAY['workshop.labour.cost','workshop.labour.record']),
 ('hr',ARRAY['hr.workshop.labour.review']),
 ('accounts',ARRAY['hr.payroll.workshop.review'])
) g(role,caps) JOIN public.roles r ON r.role_code='t12_labour_'||g.role JOIN public.permissions p ON p.permission_code=ANY(g.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(g.actor),r.id,920001,g.branch,true FROM (VALUES
 (1,'enter',920011),(1,'cost',920011),(7,'approve',920011),(4,'cost',920011),(4,'approve',920011),(5,'hr',920011),
 (2,'accounts',920011),(6,'enter',920012)
) g(actor,role,branch) JOIN public.roles r ON r.role_code='t12_labour_'||g.role;

INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE
 VALUES(998100,'FLEET_WORKSHOP_LABOUR','Workshop labour original',990001),
 (998110,'FLEET_WORKSHOP_RETURN','Workshop technical handback',990001) ON CONFLICT(type_code) DO NOTHING;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status)
 OVERRIDING SYSTEM VALUE SELECT n,'T12-LABOUR-'||n,'Synthetic signed job card',t.id,990001,920001,920011,'internal','active'
 FROM generate_series(998101,998107) n CROSS JOIN public.dms_document_types t WHERE t.type_code=CASE WHEN n=998107 THEN 'FLEET_WORKSHOP_RETURN' ELSE 'FLEET_WORKSHOP_LABOUR' END;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
 OVERRIDING SYSTEM VALUE SELECT n,n,1,true FROM generate_series(998101,998107) n;
UPDATE public.dms_documents SET current_version_id=id WHERE id BETWEEN 998101 AND 998107;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE SELECT n,n,n,'original','dms-documents','test/t12-labour-'||n||'.pdf','synthetic.pdf','application/pdf',100,repeat('a',64),'verified'
 FROM generate_series(998101,998107) n;

CREATE FUNCTION pg_temp.t12_cmd(job bigint,step text,payload jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t12_labour_command(gen_random_uuid(),job,step,payload||'{"reason":"Synthetic Workshop labour"}');
$$;
CREATE FUNCTION pg_temp.t12_proof(id bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('document',id,'version',id,'file',id); $$;
CREATE FUNCTION pg_temp.t12_version(p_job bigint,p_version bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT row_data FROM jsonb_array_elements(public.t12_labour_workspace(p_job)->'versions') row_data WHERE (row_data->>'id')::bigint=p_version;
$$;
CREATE FUNCTION pg_temp.t12_hr_queue(p_version bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT row_data FROM jsonb_array_elements(public.t12_labour_hr_queue(920011)) row_data WHERE (row_data->>'id')::bigint=p_version;
$$;
CREATE FUNCTION pg_temp.t12_make_jobs(day date,first_asset bigint,ref text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE f bigint; j bigint; from_time timestamptz:=((day::timestamp+interval '14 hours') AT TIME ZONE 'Asia/Dubai');
BEGIN
 PERFORM pg_temp.t06_actor(1);
 f:=(public.t10_workshop_command(gen_random_uuid(),first_asset,'report',jsonb_build_object('kind','reported-failure','reference',ref,
  'occurred',from_time,'reason','Synthetic Workshop finding'))->>'assessment')::bigint;
 PERFORM pg_temp.t06_actor(7);
 j:=(public.t10_workshop_command(gen_random_uuid(),first_asset,'assess',jsonb_build_object('assessment',f,'outcome','repair',
  'reason','Synthetic independent assessment'))->>'job')::bigint;
 PERFORM pg_temp.t06_actor(1);
 PERFORM public.t10_workshop_command(gen_random_uuid(),first_asset,'plan',jsonb_build_object('assessment',f,'job',j,'revision',1,'worker',980001,
  'starts',from_time,'ends',from_time+interval '5 hours','estimate',150,'reason','Plan historical Workshop work'));
 PERFORM public.t10_workshop_command(gen_random_uuid(),first_asset,'start',jsonb_build_object('assessment',f,'job',j,'revision',2,
  'occurred',from_time,'reason','Record actual historical work start'));
 RETURN j;
END $$;
CREATE FUNCTION pg_temp.t12_set(p_key text,p_val text) RETURNS text LANGUAGE sql AS $$ SELECT set_config('erp.t12_'||p_key,p_val,true); $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
 VALUES(998101,'fleet_asset',980101),(998102,'fleet_asset',980102),(998103,'fleet_asset',980101),(998104,'fleet_asset',980101),(998105,'fleet_asset',980102),(998106,'fleet_asset',980101),(998107,'fleet_asset',980101);
SELECT pg_temp.t08_calendar('2026-10-03','overtime.standard',480);

DO $$
DECLARE j_a bigint; j_b bigint; j_zero bigint; a bigint; b bigint; a_zero bigint; rate_id bigint;
 profile bigint; case_a bigint; pending_correction bigint; v_a bigint; v_b bigint; v_zero bigint; v_new bigint; pending_b bigint; void_version bigint; att bigint; fleet bigint; actual_review bigint; att_link bigint;
 started timestamptz:='2026-10-03T15:30:00+04:00'; finished timestamptz:='2026-10-03T17:30:00+04:00';
 assigned jsonb; preview jsonb; missing jsonb; result jsonb; payload jsonb; summary jsonb; digest text;
 data jsonb; hr_before timestamptz; c_a bigint; c_b bigint; claim bigint; corrected bigint; ack bigint; retail bigint; fake_alias bigint; fake_candidate bigint;
 nonce uuid:=pg_temp.t06_op(1200); claim_nonce uuid:=pg_temp.t06_op(1201); adjust_nonce uuid:=pg_temp.t06_op(1202);
 exact_span tstzmultirange:=tstzmultirange(tstzrange('2026-10-03 16:00+04','2026-10-03 17:00+04','[)'));
 fleet_span tstzrange:=tstzrange('2026-10-03 17:45+04','2026-10-03 18:00+04','[)');
BEGIN
 RESET ROLE;
 profile:=pg_temp.t08_profile(7);
 SET LOCAL ROLE authenticated;
 j_a:=pg_temp.t12_make_jobs('2026-10-03',980101,'T12-CARD-A');
 j_b:=pg_temp.t12_make_jobs('2026-10-03',980102,'T12-CARD-B');
 j_zero:=pg_temp.t12_make_jobs('2026-10-17',980101,'T12-CARD-ZERO');
 assigned:=jsonb_build_object('employee',980001,'supervisor',profile,'site',980001,'bay','BAY-A','task','Oil service',
  'from','2026-10-03T15:00+04:00','until','2026-10-03T18:00:00+04:00');
 a:=(pg_temp.t12_cmd(j_a,'assign',assigned)->>'id')::bigint;
 BEGIN PERFORM pg_temp.t12_cmd(j_b,'assign',assigned);
  RAISE EXCEPTION 'Duplicate bay allocation accepted'; EXCEPTION WHEN exclusion_violation THEN NULL; END;
 b:=(pg_temp.t12_cmd(j_b,'assign',assigned||'{"bay":"BAY-B","task":"Brake service"}')->>'id')::bigint;
 a_zero:=(pg_temp.t12_cmd(j_zero,'assign',assigned||'{"from":"2026-10-17T15:00+04:00","until":"2026-10-17T18:00:00+04:00"}')->>'id')::bigint;
 BEGIN PERFORM public.t12_labour_preview(a,'2026-10-03 14:00+04',finished);
  RAISE EXCEPTION 'Time outside the technician allocation passed'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 missing:=public.t12_labour_preview(a,started,finished);
 IF missing->>'cost_status' IS DISTINCT FROM 'rate-required' OR missing->>'amount' IS NOT NULL THEN
  RAISE EXCEPTION 'Missing rate looked like zero'; END IF;
 rate_id:=(public.t12_labour_rate(gen_random_uuid(),920011,'prepare',
  '{"from":"2026-10-03","until":"2026-10-04","rate":60,"currency":"AED","approved_zero":false,"reason":"Documented cost basis"}')->>'id')::bigint;
 BEGIN PERFORM public.t12_labour_rate(gen_random_uuid(),920011,'approve',jsonb_build_object('id',rate_id,'reason','Synthetic self'));
  RAISE EXCEPTION 'Self cost approval accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 PERFORM public.t12_labour_rate(gen_random_uuid(),920011,'approve',jsonb_build_object('id',rate_id,'reason','Authorised independent cost'));
 rate_id:=(public.t12_labour_rate(gen_random_uuid(),920011,'prepare',
  '{"from":"2026-10-17","until":"2026-10-18","rate":0,"currency":"AED","approved_zero":true,"reason":"Approved no-charge warranty"}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(1);
 PERFORM public.t12_labour_rate(gen_random_uuid(),920011,'approve',jsonb_build_object('id',rate_id,'reason','Approved zero warranty'));
 preview:=public.t12_labour_preview(a,started,finished);
 IF (preview->>'amount')::numeric IS DISTINCT FROM 120 OR (preview->>'minutes')::numeric IS DISTINCT FROM 120 THEN
  RAISE EXCEPTION 'Cost preview returned a different factual duration or rate'; END IF;
 payload:=jsonb_build_object('assignment',a,'source_line','PAPER-A-1','from',started,'until',finished,
  'evidence',pg_temp.t12_proof(998101),'preview',missing->>'digest','reason','Synthetic exact signed entry');
 BEGIN PERFORM public.t12_labour_command(nonce,j_a,'record',payload);
  RAISE EXCEPTION 'A stale cost preview was accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 payload:=payload||jsonb_build_object('preview',preview->>'digest');
 result:=public.t12_labour_command(nonce,j_a,'record',payload);
 v_a:=(result->>'id')::bigint;
 IF public.t12_labour_command(nonce,j_a,'record',payload) IS DISTINCT FROM result||'{"replayed":true}'::jsonb
  OR (pg_temp.t12_version(j_a,v_a)->>'amount')::numeric IS DISTINCT FROM (preview->>'amount')::numeric THEN
  RAISE EXCEPTION 'Record retry or reload changed duration/cost'; END IF;
 preview:=public.t12_labour_preview(b,'2026-10-03 17:00+04','2026-10-03 18:00+04');
 v_b:=(pg_temp.t12_cmd(j_b,'record',jsonb_build_object('assignment',b,'source_line','PAPER-B-1','from','2026-10-03 17:00+04',
  'until','2026-10-03 18:00+04','evidence',pg_temp.t12_proof(998102),'preview',preview->>'digest'))->>'id')::bigint;
 preview:=public.t12_labour_preview(a_zero,'2026-10-17 17:00+04','2026-10-17 18:00+04');
 v_zero:=(pg_temp.t12_cmd(j_zero,'record',jsonb_build_object('assignment',a_zero,'source_line','PAPER-Z','from','2026-10-17 17:00+04',
  'until','2026-10-17 18:00+04','evidence',pg_temp.t12_proof(998104),'preview',preview->>'digest'))->>'id')::bigint;
 IF NOT (preview->>'cost_status'='valued' AND (preview->>'amount')::numeric=0 AND (pg_temp.t12_version(j_zero,v_zero)->>'amount')::numeric=0) THEN
  RAISE EXCEPTION 'Approved zero costing did not remain distinct from a missing rate'; END IF;
 PERFORM pg_temp.t06_actor(4);
 BEGIN PERFORM pg_temp.t12_cmd(j_a,'approve',jsonb_build_object('version',v_a));
  RAISE EXCEPTION 'A scoped supervisor other than the named supervisor approved'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id,linked_by)
 VALUES(pg_temp.t08_profile(7),980001,pg_temp.t08_profile(4));
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(7);
 BEGIN PERFORM pg_temp.t12_cmd(j_a,'approve',jsonb_build_object('version',v_a));
  RAISE EXCEPTION 'Linked technician approved their own time'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 DELETE FROM public.erp_user_employee_links WHERE employee_id=980001 AND user_profile_id=pg_temp.t08_profile(7);
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t12_cmd(j_a,'approve',jsonb_build_object('version',v_a));
 PERFORM pg_temp.t12_cmd(j_b,'approve',jsonb_build_object('version',v_b));
 PERFORM pg_temp.t12_cmd(j_zero,'approve',jsonb_build_object('version',v_zero));
 IF pg_temp.t12_version(j_a,v_a)->>'amount' IS NOT NULL OR public.t12_labour_payroll(920011,'2026-10-31',now()) IS NOT NULL THEN
  RAISE EXCEPTION 'Workshop supervisor received restricted cost or salary'; END IF;
 PERFORM pg_temp.t06_actor(1);
 case_a:=(public.t12_labour_workspace(j_a)->>'assessment')::bigint;
 payload:=jsonb_build_object('assessment',case_a,'job',j_a,'revision',3,'occurred','2026-10-03T17:15:00+04:00',
  'actual_work','Verified Workshop work','cost',120,'reason','Record completed work');
 BEGIN PERFORM public.t10_workshop_command(gen_random_uuid(),980101,'submit-qc',payload);
  RAISE EXCEPTION 'QC accepted a finish earlier than signed labour'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.t10_workshop_command(gen_random_uuid(),980101,'submit-qc',payload||'{"occurred":"2026-10-03T17:40:00+04:00"}');
 PERFORM pg_temp.t06_actor(7);
 PERFORM public.t10_workshop_command(gen_random_uuid(),980101,'release',jsonb_build_object('assessment',case_a,'job',j_a,'revision',4,
  'occurred','2026-10-03T17:45:00+04:00','evidence',pg_temp.t12_proof(998107),'return_reference','WO-'||case_a||'/1','reason','Independent QC and handback'));
 PERFORM pg_temp.t06_actor(1);
 IF public.t12_labour_workspace(j_a)->>'state' IS DISTINCT FROM 'closed'
  OR (pg_temp.t12_version(j_a,v_a)->>'amount')::numeric IS DISTINCT FROM 120 THEN
  RAISE EXCEPTION 'Completion changed the approved Workshop costing snapshot'; END IF;

 PERFORM pg_temp.t06_actor(4);
 summary:=public.f12_save_attendance(jsonb_build_object('operation',gen_random_uuid(),'employeeId',980001,'date','2026-10-03',
  'id',NULL,'revision',NULL,'fingerprint',erp_private.f12_attendance_context(980001,'2026-10-03')->>'fingerprint','reason','Known synthetic attendance',
  'values','{"attendance_type":"site","work_site_id":980001,"intervals":[{"start":"2026-10-03T08:00:00+04:00","end":"2026-10-03T18:00:00+04:00","breaks":[]}]}'::jsonb));
 att:=(summary->>'id')::bigint;
 PERFORM pg_temp.t06_actor(5);
 PERFORM public.f11_mutate_time_child('attendance-summary',980001,att,1,gen_random_uuid(),'approve','{}');
 RESET ROLE;
 INSERT INTO erp_private.t08_fleet_work(order_id,assignment_id,commitment_id,employee_id,employment_id,employer_company_id,employer_branch_id,
  host_company_id,host_branch_id,site_id,day,work_period,overnight,activity,entered_by,reason)
 SELECT a.order_id,a.id,a.actual_commitment_id,a.worker_id,a.employment_id,920001,920011,920001,920011,980001,'2026-10-03',
  fleet_span,false,'internal',pg_temp.t08_profile(1),'Synthetic additional Fleet actual'
 FROM erp_private.fleet_operation_assignments a WHERE a.id=991001 RETURNING id INTO fleet;
 INSERT INTO erp_private.t08_time_reviews(work_id,matched,sources,reviewed_by,reason)
 VALUES(fleet,tstzmultirange(fleet_span),'[]',pg_temp.t08_profile(7),'Retained independent Fleet approval') RETURNING id INTO actual_review;
 INSERT INTO erp_private.t08_attendance_links(work_id,decision_id,attendance_id,attendance_digest,reviewed_by,accepted,reason)
 SELECT fleet,gen_random_uuid(),att,erp_private.t08_attendance_digest(s),pg_temp.t08_profile(5),tstzmultirange(fleet_span),'Known actual attendance'
 FROM public.employee_attendance_daily_summary s WHERE s.id=att RETURNING id INTO att_link;
 IF erp_private.t08_source_basis(fleet)->>'status' IS DISTINCT FROM 'no-eligible-time' THEN
  RAISE EXCEPTION 'Fleet could consume a contested Workshop span'; END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(5);
 result:=pg_temp.t12_hr_queue(v_a);
 IF result->>'status' IS DISTINCT FROM 'ready' OR (result->>'minutes')::numeric IS DISTINCT FROM 120
  OR (result->>'eligible_minutes')::numeric IS DISTINCT FROM 60 OR (result->>'conflicted_minutes')::numeric IS DISTINCT FROM 30
  OR result?'wage' OR result?'rate' THEN RAISE EXCEPTION 'HR did not see the correct undisputed remainder or wage leaked: %',result; END IF;
 hr_before:=clock_timestamp()-interval '1 day';
 RESET ROLE;
 INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id,linked_by)
 VALUES(pg_temp.t08_profile(5),980001,pg_temp.t08_profile(4));
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(5);
 BEGIN PERFORM public.t12_labour_hr(gen_random_uuid(),v_a,result->>'digest','Synthetic self HR review');
  RAISE EXCEPTION 'HR approved their own technician time'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 DELETE FROM public.erp_user_employee_links WHERE employee_id=980001 AND user_profile_id=pg_temp.t08_profile(5);
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 preview:=public.t12_labour_preview(b,'2026-10-03 17:30+04','2026-10-03 18:00+04');
 data:=jsonb_build_object('assignment',b,'source_line','PAPER-B-1','from','2026-10-03 17:30+04',
  'until','2026-10-03 18:00+04','previous',v_b,'evidence',pg_temp.t12_proof(998102),'preview',preview->>'digest');
 BEGIN PERFORM pg_temp.t12_cmd(j_b,'record',data);
  RAISE EXCEPTION 'Changed signed hours reused the original evidence'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 pending_b:=(pg_temp.t12_cmd(j_b,'record',data||jsonb_build_object('evidence',pg_temp.t12_proof(998105)))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(5);
 IF (pg_temp.t12_hr_queue(v_a)->>'conflicted_minutes')::numeric IS DISTINCT FROM 30 THEN
  RAISE EXCEPTION 'Pending revision released original disputed overlap'; END IF;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t12_cmd(j_b,'reject',jsonb_build_object('version',pending_b));
 PERFORM pg_temp.t06_actor(5);
 IF (pg_temp.t12_hr_queue(v_a)->>'conflicted_minutes')::numeric IS DISTINCT FROM 30 THEN
  RAISE EXCEPTION 'Rejected revision released original disputed overlap'; END IF;
 c_a:=(public.t12_labour_hr(gen_random_uuid(),v_a,result->>'digest','HR accepted 60 undisputed minutes')->>'id')::bigint;
 result:=pg_temp.t12_hr_queue(v_b);
 IF (result->>'eligible_minutes')::numeric IS DISTINCT FROM 15 OR (result->>'conflicted_minutes')::numeric IS DISTINCT FROM 45
 THEN RAISE EXCEPTION 'Fleet and other Workshop overlap did not preserve the 15 minute remainder: %',result; END IF;
 c_b:=(public.t12_labour_hr(gen_random_uuid(),v_b,result->>'digest','HR accepted 15 undisputed minutes')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(6);
 IF public.t12_labour_workspace(j_a) IS NOT NULL OR public.t12_labour_hr_queue(920011) IS NOT NULL THEN
  RAISE EXCEPTION 'Sibling branch gained Workshop or HR scope'; END IF;
 PERFORM pg_temp.t06_actor(2);
 summary:=public.t12_labour_payroll(920011,'2026-10-31',clock_timestamp());
 IF jsonb_array_length(summary->'candidates')<>2 OR summary->'candidates'->1->>'day'<>'2026-10-03'
  OR (summary->'candidates'->1->>'amount')::numeric IS DISTINCT FROM 40
  OR (summary->'candidates'->0->>'amount')::numeric IS DISTINCT FROM 10
  OR jsonb_array_length(public.t12_labour_payroll(920011,'2026-10-31',hr_before)->'candidates')<>0 THEN
  RAISE EXCEPTION 'Late work or trusted payroll rates failed: %',summary; END IF;
 RESET ROLE;
 claim:=erp_private.t12_claim_workshop(c_a,claim_nonce,exact_span);
 IF erp_private.t12_claim_workshop(c_a,claim_nonce,exact_span) IS DISTINCT FROM claim THEN RAISE EXCEPTION 'Claim replay changed its identity'; END IF;
 BEGIN PERFORM erp_private.t12_claim_workshop(c_a,gen_random_uuid(),exact_span);
  RAISE EXCEPTION 'Workshop gave the same work a second earning'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN INSERT INTO erp_private.t08_payable_claims(workshop_candidate_id,employee_id,consumer_key,claimed,amount,currency)
  VALUES(c_b,980001,gen_random_uuid(),exact_span,1,'AED'); RAISE EXCEPTION 'Common cross-source exclusivity was removed';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 preview:=public.t12_labour_preview(a,started,'2026-10-03 16:45+04');
 v_new:=(pg_temp.t12_cmd(j_a,'record',jsonb_build_object('assignment',a,'source_line','PAPER-A-1','from',started,'until','2026-10-03 16:45+04',
  'evidence',pg_temp.t12_proof(998103),'previous',v_a,'preview',preview->>'digest'))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t12_cmd(j_a,'approve',jsonb_build_object('version',v_new));
 PERFORM pg_temp.t06_actor(5);
 pending_correction:=(public.t12_labour_correction(gen_random_uuid(),claim,'propose',jsonb_build_object('replacement',v_new,
  'from','2026-10-03 16:45+04','until','2026-10-03 17:00+04','reason','Independently review pending correction draft'))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t12_labour_correction(gen_random_uuid(),claim,'withdraw',jsonb_build_object('correction',pending_correction,'reason','Withdraw undecided duplicate draft'));
 PERFORM pg_temp.t06_actor(5);
 corrected:=(public.t12_labour_correction(gen_random_uuid(),claim,'propose',jsonb_build_object('replacement',v_new,'from','2026-10-03 16:45+04',
  'until','2026-10-03 17:00+04','reason','Signed correction to retained issued work'))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t12_labour_correction(gen_random_uuid(),claim,'approve',jsonb_build_object('correction',corrected,'reason','Accounts agrees exact correction'));
 summary:=public.t12_labour_payroll(920011,'2026-10-31',clock_timestamp());
 IF (summary->'corrections'->0->>'amount')::numeric IS DISTINCT FROM -10 THEN
  RAISE EXCEPTION 'The linked correction did not retain the original rate'; END IF;
 RESET ROLE;
 ack:=erp_private.t12_claim_workshop_correction(corrected,adjust_nonce);
 IF erp_private.t12_claim_workshop_correction(corrected,adjust_nonce)<>ack
  OR (SELECT amount FROM erp_private.t08_payable_claims WHERE id=claim) IS DISTINCT FROM 40.00 THEN
  RAISE EXCEPTION 'Correction replaced history or replay minted a second adjustment'; END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 preview:=public.t12_labour_preview(a,started,'2026-10-03 16:45+04');
 void_version:=(pg_temp.t12_cmd(j_a,'record',jsonb_build_object('assignment',a,'source_line','PAPER-A-1','from',started,
  'until','2026-10-03 16:45+04','evidence',pg_temp.t12_proof(998106),'previous',v_new,'void',true,'preview',preview->>'digest'))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t12_cmd(j_a,'approve',jsonb_build_object('version',void_version));
 PERFORM pg_temp.t06_actor(5);
 IF pg_temp.t12_hr_queue(void_version)->>'status' IS DISTINCT FROM 'voided' THEN
  RAISE EXCEPTION 'Signed void presented payable time'; END IF;
 corrected:=(public.t12_labour_correction(gen_random_uuid(),claim,'propose',jsonb_build_object('replacement',void_version,
  'from','2026-10-03 16:00+04','until','2026-10-03 16:45+04','reason','Signed full void after prior partial correction'))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(2);
 PERFORM public.t12_labour_correction(gen_random_uuid(),claim,'approve',jsonb_build_object('correction',corrected,'reason','Independently accepted void'));
 summary:=public.t12_labour_payroll(920011,'2026-10-31',clock_timestamp());
 IF (summary->'corrections'->0->>'amount')::numeric IS DISTINCT FROM -30 THEN
  RAISE EXCEPTION 'Signed void did not compensate retained previously issued minutes'; END IF;
END $$;

RESET ROLE;
SELECT 'PASS: T12 signed Workshop versions, bay allocation, F12/T08 overlaps, late pay, exact shared claims, rate masking and linked correction';
ROLLBACK;
