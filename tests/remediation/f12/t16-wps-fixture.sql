
-- Append to the existing guarded T07/T08/T14/T15 synthetic transaction.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
VALUES('dms.documents.view.finance','Synthetic finance view','dms','test','held') ON CONFLICT DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t16_issue','Synthetic WPS issue',false),('t16_reconcile','Synthetic payroll reconciliation',false),
 ('t16_issue_without_evidence','Synthetic WPS issue without finance',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t16_issue',ARRAY['hr.payroll.wps.issue','hr.payroll.view','dms.documents.view','dms.documents.preview','dms.documents.view.finance']),
 ('t16_reconcile',ARRAY['hr.payroll.payment.reconcile','hr.recovery.accounts','hr.payroll.view',
   'dms.documents.view','dms.documents.preview','dms.documents.view.finance']),
 ('t16_issue_without_evidence',ARRAY['hr.payroll.wps.issue','hr.payroll.view'])
) g(role,caps) JOIN public.roles r ON r.role_code=g.role JOIN public.permissions p ON p.permission_code=ANY(g.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(a.actor),r.id,a.company,a.branch,true
FROM (VALUES (2,'t16_issue',920001,920011),(3,'t16_reconcile',920001,920011),
 (4,'t16_issue_without_evidence',920001,920011),(5,'t16_reconcile',920001,920011),
 (6,'t16_issue',920001,920012),(6,'t16_reconcile',920001,920012),
 (9,'t16_issue',920002,920021),(9,'t16_reconcile',920002,920021)
) a(actor,role,company,branch) JOIN public.roles r ON r.role_code=a.role;

INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
 confidentiality_level,status,current_version_id)
 OVERRIDING SYSTEM VALUE
 SELECT e.id,'T16-BANK-'||e.id,e.title,t.id,t.category_id,920001,e.branch,e.confidentiality,'active',NULL
 FROM (VALUES
 (998601,'T16_BANK_FORMAT','Synthetic bank file mapping',920011,'finance'),
 (998602,'T16_BANK_EVIDENCE','Synthetic bank acknowledgment',920011,'finance'),
 (998603,'T16_BANK_EVIDENCE','Synthetic shared payment slip',920011,'finance'),
 (998604,'T16_BANK_EVIDENCE','Synthetic deduction proof',920011,'finance'),
 (998605,'T16_BANK_EVIDENCE','Synthetic employee reversal proof',920011,'finance'),
 (998606,'T16_BANK_EVIDENCE','Synthetic sibling branch slip',920012,'finance'),
 (998607,'T16_BANK_EVIDENCE','Synthetic unverified slip',920011,'finance'),
 (998608,'T16_BANK_EVIDENCE','Synthetic wrong sensitivity',920011,'internal'),
 (998609,'T16_BANK_EVIDENCE','Synthetic second payment',920011,'finance'),
 (998610,'T16_BANK_EVIDENCE','Synthetic bank rejection',920011,'finance'),
 (998611,'T16_BANK_EVIDENCE','Synthetic corrected payment',920011,'finance'),
 (998612,'T16_BANK_EVIDENCE','Synthetic unrelated slip',920011,'finance'),
 (998613,'T16_HISTORICAL_DESTINATION','Synthetic retained prior payer',920011,'finance'),
 (998614,'T16_PAYMENT_POLICY','Synthetic approved cheque policy',920011,'finance')
 ) e(id,type,title,branch,confidentiality) JOIN public.dms_document_types t ON t.type_code=e.type;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
 SELECT id,id,1,true FROM public.dms_documents WHERE id BETWEEN 998601 AND 998614;
UPDATE public.dms_documents SET current_version_id=id WHERE id BETWEEN 998601 AND 998614;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,
 file_size_bytes,sha256_hash,integrity_status) OVERRIDING SYSTEM VALUE
 SELECT id,id,id,'original','dms-documents','test/t16-hr-'||id||'.pdf','original.pdf','application/pdf',100,
   lpad(id::text,64,'0'),'verified'
 FROM public.dms_documents WHERE id BETWEEN 998601 AND 998614 AND id<>998607;

INSERT INTO public.hr_mohre_establishments(id,owner_company_id,establishment_number,establishment_name,status) OVERRIDING SYSTEM VALUE
VALUES(998601,920001,'0000000998601','Synthetic WPS establishment','active');
INSERT INTO public.banks(id,bank_code,bank_name_en) VALUES(998601,'T16SYNTH','Synthetic WPS bank');
INSERT INTO public.employee_wps_profiles(employee_id,wps_applicable,wps_status,bank_id,iban,mohre_person_code,
 mohre_establishment_id,salary_effective_date) VALUES
 (980002,true,'active',998601,'AE070331234567890123456','00112233445577',998601,'2026-01-01');
INSERT INTO erp_private.t16_historical_destinations(employment_id,effective_month,channel,establishment_id,bank_id,
 iban,person_code,policy_file_id,policy_sha256)
SELECT e.id,'2026-01-01','wps',998601,998601,'AE070331234567890123456','00112233445566',998613,lpad('998613',64,'0')
FROM erp_private.t03_employment_periods e WHERE e.employee_id=980001 AND e.company_id=920001 AND e.branch_id=920011;


CREATE FUNCTION pg_temp.t16_configuration() RETURNS void LANGUAGE plpgsql AS $$
DECLARE layout uuid;
BEGIN
 INSERT INTO erp_private.t16_formats(company_id,establishment_id,effective_month,format_version,employer_code,payer_routing,
 identifier_kind,identifier_width,account_kind,account_width,routing_width,currency,detail_fields,control_fields,date_style,line_end,
 suffix,specification_file_id,specification_sha256)
 VALUES(920001,998601,'2026-01-01','synthetic-v1','0000000998601','111000222','person-code',14,'iban',23,9,'AED',
 ARRAY['type','identifier','routing','account','period_start','period_end','days','net'],
 ARRAY['type','employer','payer_routing','pay_month','row_count','total','currency','file_kind'],
 'ISO','CRLF','sif',998601,lpad('998601',64,'0')) RETURNING id INTO layout;
 INSERT INTO erp_private.t16_bank_routes(format_id,bank_id,routing_code) VALUES(layout,998601,'333000444');
END $$;
CREATE FUNCTION pg_temp.t16_proof(p_id bigint) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('document',p_id,'version',p_id,'file',p_id)
$$;

DO $$
DECLARE
 anchor erp_private.t14_runs; reviewed erp_private.t14_versions; proposed jsonb; receipt jsonb;
BEGIN
 SELECT * INTO STRICT anchor FROM erp_private.t14_runs WHERE month='2026-11-01' AND company_id=920001 AND branch_id=920011;
 SELECT * INTO STRICT reviewed FROM erp_private.t14_versions WHERE run_id=anchor.id AND number=2;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 proposed:=jsonb_build_object('run',anchor.id,'version',reviewed.id,'digest',reviewed.digest,
  'acknowledge_exceptions',true,'reason','Synthetic exact WPS payroll review');
 receipt:=public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'submit',proposed);
 PERFORM set_config('erp.t16_review',receipt->>'review',true);
 PERFORM set_config('erp.t16_version',reviewed.id::text,true);
 PERFORM set_config('erp.t16_digest',reviewed.digest,true);
 PERFORM pg_temp.t06_actor(7);
 proposed:=proposed||jsonb_build_object('recovery_schedule_digest',
   public.t15_payroll_review_workspace(920001,920011,anchor.month,(receipt->>'review')::uuid)
     #>> '{review,recovery_schedule_snapshot,digest}');
 PERFORM public.t15_payroll_review_command(gen_random_uuid(),920001,920011,'approve',
   proposed||jsonb_build_object('review',receipt->>'review'));
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
END $$;
