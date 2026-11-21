-- Append to the synthetic T04, managed-leave and balance fixtures, before ROLLBACK.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS mobile_actor \gset
DO $$
DECLARE annual_id bigint := (SELECT (data->>'id')::bigint FROM mobile_t04_test WHERE name='annual-mobile');
DECLARE row jsonb;
BEGIN
 SELECT r INTO row FROM jsonb_array_elements(public.mobile_hr_v5_calendar(
   pg_temp.t04_day(71),pg_temp.t04_day(71),1,920001,920011,920001,'T00-E01')) r
 WHERE (r->>'id')::bigint=annual_id;
 IF row IS NULL OR row->>'status' IS DISTINCT FROM 'approved' OR row->>'employeeId'<>'920001'
   OR (row-ARRAY['id','employeeId','employeeLabel','startDate','endDate','status','label'])<>'{}' THEN
  RAISE EXCEPTION 'Missing mapped managed calendar row or unsafe fields'; END IF;
 IF public.mobile_hr_v5_calendar(pg_temp.t04_day(71),pg_temp.t04_day(71),1,920001,920012,920001,'')<>'[]' THEN
  RAISE EXCEPTION 'Managed calendar ignored explicit branch'; END IF;
 PERFORM pg_temp.t04_actor(5);
 IF public.mobile_hr_v5_calendar(pg_temp.t04_day(71),pg_temp.t04_day(71),1,NULL,NULL,NULL,'T00-E01')<>'[]' THEN
  RAISE EXCEPTION 'Sibling branch saw managed calendar row'; END IF;
 RAISE NOTICE 'PASS: mapped managed calendar, overlap, branch/own scope and safe projection';
END $$;

-- Medical evidence keeps its classification when its original medical record link changes.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.employee_medical_records SET dms_document_id=NULL WHERE dms_document_id IN (960001,960010);
-- The balance fixture removed this role to exercise its self-only reader.
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
 SELECT u.id,r.id,920001,920011 FROM public.user_profiles u CROSS JOIN public.roles r
 WHERE u.auth_user_id='96000000-0000-4000-8000-000000000006' AND r.role_code='t04_roster';
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status)
 OVERRIDING SYSTEM VALUE SELECT n,'2I-'||n,'Synthetic paging original',960001,960001,920001,920011,'internal','active'
 FROM generate_series(960014,960040) n;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
 SELECT n,n,1,true FROM generate_series(960014,960040) n;
UPDATE public.dms_documents SET current_version_id=id WHERE id BETWEEN 960014 AND 960040;
INSERT INTO public.dms_document_files(document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 SELECT n,n,'original','dms-documents','test/mobile-2i-'||n||'.pdf','synthetic.pdf','application/pdf',100,repeat('c',64),'verified'
 FROM generate_series(960014,960040) n;
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
 SELECT n,'employee',920001 FROM generate_series(960014,960040) n;
SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS self_actor \gset
DO $$
DECLARE receipt jsonb;
BEGIN
 receipt:=public.mobile_hr_command_v1('leave.submit',pg_temp.mobile_sick_request(pg_temp.t04_day(78),930,960014,960014)
  ||jsonb_build_object('endDate',pg_temp.t04_day(80)));
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(public.mobile_hr_v5_calendar(pg_temp.t04_day(79),pg_temp.t04_day(79),1,NULL,NULL,920001,'')) r
   WHERE r->'id'=receipt->'id' AND r->>'status'='pending' AND r->>'startDate'=pg_temp.t04_day(78)::text AND r->>'endDate'=pg_temp.t04_day(80)::text)
 THEN RAISE EXCEPTION 'Window inside managed leave omitted its original span or mapped ID'; END IF;
 RAISE NOTICE 'PASS: calendar interval fully inside a pending managed request';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.employee_leave_requests(employee_id,leave_type_id,start_date,end_date,total_days,approval_status)
 SELECT 920004,960001,pg_temp.t04_day(77),pg_temp.t04_day(79),3,'cancelled' FROM generate_series(1,25);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(1) AS team_actor \gset
DO $$
DECLARE day date:=pg_temp.t04_day(79);
DECLARE first_page jsonb:=public.mobile_hr_v5_calendar(day,day,1,920001,920011,NULL,'');
DECLARE next_page jsonb:=public.mobile_hr_v5_calendar(day,day,2,920001,920011,NULL,'');
BEGIN
 IF jsonb_array_length(first_page)<>26 OR first_page->25 IS DISTINCT FROM next_page->0
   OR first_page->24->>'employeeId'<>'920004' OR NOT EXISTS(SELECT FROM jsonb_array_elements(next_page) r
    WHERE r->>'employeeId'='920001' AND r->>'startDate'=pg_temp.t04_day(78)::text AND r->>'status'='pending') THEN
  RAISE EXCEPTION 'Legacy and mapped managed rows did not share one ordered lookahead'; END IF;
 RAISE NOTICE 'PASS: one stable lookahead across overlapping legacy and managed calendar rows';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM public.role_permissions rp USING public.roles r,public.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.role_code='t04_roster' AND p.permission_code='hr.medical.view';
INSERT INTO public.hr_onboarding_tasks(employee_id,task_title,task_category,completion_criteria,dms_document_id)
 VALUES (920001,'Synthetic protected attachment','hr','Provide the original',960014);
SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS self_actor \gset
DO $$
DECLARE choices jsonb;
BEGIN
 choices:=public.mobile_hr_service_v5('{"op":"serviceEvidence","employeeId":920001,"kind":"overtime","source":null,"search":"Synthetic paging original","after":0}');
 IF jsonb_array_length(choices)<>26 OR choices->0->>'id'<>'960015' OR choices->25->>'id'<>'960040' THEN
  RAISE EXCEPTION 'Managed submission pin consumed a lookahead slot or appeared in choices'; END IF;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(public.mobile_hr_v5_tasks(920001,NULL,1)) t
   WHERE t->>'title'='Synthetic protected attachment' AND t->'evidence'='null'::jsonb) THEN
  RAISE EXCEPTION 'Managed pin was disclosed through the own onboarding task'; END IF;
 RAISE NOTICE 'PASS: pending medical pin suppressed before evidence lookahead and in own task';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
 VALUES ('hr.actions.view','Synthetic PRO access','hr','view','branch'),
 ('hr.actions.manage','Synthetic PRO update','hr','manage','branch') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM public.roles r JOIN public.permissions p ON p.permission_code IN
 ('hr.leave.view','hr.actions.view','hr.actions.manage','dms.documents.view','dms.documents.preview')
 WHERE r.role_code='t04_pro' ON CONFLICT DO NOTHING;
INSERT INTO public.employee_pro_processes(employee_id,process_title,related_document_id,related_document_version_id)
 VALUES (920001,'Synthetic managed certificate',960010,960010),(920001,'Synthetic assisted certificate',960001,960001);
CREATE TEMP TABLE integration_pro AS SELECT id,related_document_id doc FROM public.employee_pro_processes
 WHERE employee_id=920001 AND process_title IN ('Synthetic managed certificate','Synthetic assisted certificate');
GRANT SELECT ON integration_pro TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(1) AS mobile_actor \gset
DO $$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM integration_pro LOOP
  IF NOT public.current_user_can_view_dms_document(item.doc) OR NOT erp_private.document_permission(item.doc,'dms.documents.preview')
    OR erp_private.employee_permission(920001,'hr.medical.view') THEN RAISE EXCEPTION 'Invalid DMS/medical test grants'; END IF;
  IF public.mobile_hr_v5_detail(920001,'pro-process',item.id,NULL)->'evidence' IS DISTINCT FROM 'null'::jsonb THEN
   RAISE EXCEPTION 'T04 evidence disclosed in mobile PRO detail for %',item.doc; END IF;
 END LOOP;
 RAISE NOTICE 'PASS: nonmedical PRO officer has DMS preview but no managed/assisted sick evidence';
END $$;
DO $$
DECLARE rid bigint:=(SELECT id FROM integration_pro WHERE doc=960010);
DECLARE revision bigint:=(SELECT workspace_revision FROM public.employee_pro_processes WHERE id=rid);
DECLARE operation uuid:=gen_random_uuid();
BEGIN
 PERFORM public.f11_mutate_pro_process('pro-process',920001,rid,revision,operation,'update',
  jsonb_build_object('process_title','Synthetic managed certificate','request_date',current_date,'notes','Ordinary ERP follow-up'));
 RESET ROLE;
 IF NOT EXISTS(SELECT FROM public.employee_pro_processes WHERE id=rid AND workspace_revision=revision+1
   AND notes='Ordinary ERP follow-up' AND related_document_id=960010 AND related_document_version_id=960010)
   OR EXISTS(SELECT FROM erp_private.mobile_hr_service_attempts WHERE operation_id=operation) THEN
  RAISE EXCEPTION 'Ordinary F11 PRO update changed document evidence or created a mobile attempt'; END IF;
 RAISE NOTICE 'PASS: ordinary canonical PRO update preserves existing pinned document without a mobile attempt';
END $$;
RESET ROLE;
