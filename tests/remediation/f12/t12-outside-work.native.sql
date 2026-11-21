-- Run inside the shared transaction-wrapped T07 synthetic fixture.
DO $$ BEGIN
 IF to_regprocedure('public.t12_outside_work(uuid,bigint,text,jsonb)') IS NULL
 OR to_regprocedure('public.t12_outside_workspace(bigint)') IS NULL THEN
  RAISE EXCEPTION 'T12 outside Workshop entry points are missing';
 END IF;
END $$;

INSERT INTO public.roles(role_code,role_name,is_system_role)
SELECT 't12_outside_'||kind,'Synthetic T12 outside '||kind,false
FROM unnest(ARRAY['report','operator','review','finance','sibling','company']) kind;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('report',ARRAY['fleet.inspections.report','supply.setup']),
 ('operator',ARRAY['workshop.assess','workshop.jobs.manage','workshop.outside.manage','supply.purchase','supply.purchase.approve',
  'master_data.parties.view','dms.documents.view','dms.documents.preview']),
 ('review',ARRAY['workshop.jobs.release','workshop.outside.manage','supply.approve','supply.purchase.approve','master_data.parties.view',
  'dms.documents.view','dms.documents.preview']),
 ('finance',ARRAY['workshop.finance.intake','fleet.assets.view','dms.documents.view','dms.documents.preview']),
 ('sibling',ARRAY['workshop.outside.manage','supply.purchase','supply.purchase.approve','workshop.finance.intake']),
 ('company',ARRAY['workshop.outside.manage','supply.purchase','supply.purchase.approve','workshop.finance.intake'])
) v(kind,caps) JOIN public.roles r ON r.role_code='t12_outside_'||v.kind
 JOIN public.permissions p ON p.permission_code=ANY(v.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,a.company,a.branch,true FROM (VALUES
 (1,'report',920001,920011),(4,'operator',920001,920011),(5,'review',920001,920011),
 (7,'finance',920001,920011),(6,'sibling',920001,920012),(9,'company',920002,920021)
) a(n,kind,company,branch) JOIN public.user_profiles u
 ON u.auth_user_id=('98000000-0000-4000-8000-'||lpad(a.n::text,12,'0'))::uuid
 JOIN public.roles r ON r.role_code='t12_outside_'||a.kind;
INSERT INTO public.party_approval_statuses(approval_status_code,name_en) VALUES ('APPROVED','Approved') ON CONFLICT(approval_status_code) DO NOTHING;
INSERT INTO public.party_vendor_profiles(party_id,vendor_approval_status_id,can_create_po,requires_comparison)
SELECT 990002,id,true,true FROM public.party_approval_statuses WHERE approval_status_code='APPROVED';

INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES
 (997201,'FLEET_WORKSHOP_OUTSIDE_HANDOVER','Outside Workshop handover',990001),
 (997202,'FLEET_WORKSHOP_OUTSIDE_SERVICE','Outside Workshop signed service and invoice',990001),
 (997203,'FLEET_WORKSHOP_OUTSIDE_RETURN','Outside Workshop physical return',990001),
 (997204,'FLEET_WORKSHOP_RETURN','Workshop QC release original',990001) ON CONFLICT(type_code) DO NOTHING;
CREATE TEMP TABLE t12_outside_docs AS SELECT * FROM (VALUES
 (997201,'FLEET_WORKSHOP_OUTSIDE_HANDOVER',980102),(997202,'FLEET_WORKSHOP_OUTSIDE_SERVICE',980102),
 (997203,'FLEET_WORKSHOP_OUTSIDE_RETURN',980102),(997204,'FLEET_WORKSHOP_RETURN',980102),
 (997205,'FLEET_WORKSHOP_OUTSIDE_HANDOVER',980101),(997206,'FLEET_WORKSHOP_OUTSIDE_HANDOVER',980102),
 (997207,'FLEET_WORKSHOP_OUTSIDE_SERVICE',980102)
) sample(id,code,asset);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status)
 OVERRIDING SYSTEM VALUE SELECT d.id,'T12-OUTSIDE-'||d.id,'Synthetic T12 outside proof',t.id,990001,920001,920011,'internal','active'
 FROM t12_outside_docs d JOIN public.dms_document_types t ON t.type_code=d.code;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
 OVERRIDING SYSTEM VALUE SELECT id,id,1,true FROM t12_outside_docs;
UPDATE public.dms_documents SET current_version_id=id WHERE id BETWEEN 997201 AND 997207;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE SELECT id,id,id,'original','dms-documents','920001/2026/Workshop/'||id||'/v1/original.pdf',
  'original.pdf','application/pdf',100,repeat('a',64),'verified'
 FROM t12_outside_docs;
GRANT SELECT ON t12_outside_docs TO authenticated;

CREATE FUNCTION pg_temp.t12_outside_call(p_job bigint,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t12_outside_work(gen_random_uuid(),p_job,p_action,p_data||'{"reason":"Synthetic outside Workshop action"}')
$$;
CREATE FUNCTION pg_temp.t12_outside_t10(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t10_workshop_command(gen_random_uuid(),980102,p_action,p_data||'{"reason":"Synthetic Workshop action"}')
$$;
CREATE FUNCTION pg_temp.t12_outside_proof(d bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('document',d,'version',d,'file',d)
$$;
CREATE FUNCTION pg_temp.t12_outside_row(job bigint,id bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT work FROM jsonb_array_elements(public.t12_outside_workspace(job)->'orders') work WHERE (work->>'id')::bigint=id
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
 SELECT id,'fleet_asset',asset FROM t12_outside_docs;

DO $$
DECLARE assessment bigint; job bigint; outside_id bigint; owner_profile bigint; policy bigint; next_job bigint; old_finance bigint;
 result jsonb; payload jsonb; instructions jsonb; order_row jsonb; base jsonb; qc jsonb; stage_operation uuid:=pg_temp.t06_op(12120);
BEGIN
 RESET ROLE;
 SELECT id INTO owner_profile FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000005';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 result:=pg_temp.t12_outside_t10('report',jsonb_build_object('kind','reported-failure','reference','T12-OUTSIDE-1',
  'occurred',pg_temp.t06_when(-65)));
 assessment:=(result->>'assessment')::bigint;
 PERFORM pg_temp.t06_actor(4);
 job:=(pg_temp.t12_outside_t10('assess',jsonb_build_object('assessment',assessment,'outcome','repair'))->>'job')::bigint;
 base:=jsonb_build_object('assessment',assessment,'job',job);
 PERFORM pg_temp.t12_outside_t10('plan',base||jsonb_build_object('revision',1,'worker',980002,
  'starts',pg_temp.t06_when(-60),'ends',pg_temp.t06_when(-10),'estimate',110));
 PERFORM pg_temp.t12_outside_t10('start',base||jsonb_build_object('revision',2,'occurred',pg_temp.t06_when(-59)));
 payload:=jsonb_build_object('supplier',990002,'reference','EXT-123','promised_return',pg_temp.t06_when(-30),'estimate',100,'comparison','CMP-12');
 BEGIN PERFORM pg_temp.t12_outside_call(job,'prepare',payload);
  RAISE EXCEPTION 'Supplier commitment bypassed the named procurement owner'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(1);
 policy:=(public.t11_supply_setup(gen_random_uuid(),920011,'propose',
  jsonb_build_object('domain','purchasing','owner',owner_profile,'reason','Named synthetic Procurement owner'))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(5);
 PERFORM public.t11_supply_setup(gen_random_uuid(),920011,'decide',
  jsonb_build_object('policy',policy,'decision','accepted','reason','Synthetic procurement route'));
 PERFORM pg_temp.t06_actor(4);
 BEGIN PERFORM pg_temp.t12_outside_call(job,'prepare',payload-'comparison');
  RAISE EXCEPTION 'Prepared a comparison-required supplier without a comparison'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN PERFORM pg_temp.t12_outside_call(job,'prepare',payload||'{"supplier":990001}');
  RAISE EXCEPTION 'Non-vendor passed vendor eligibility'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 outside_id:=(pg_temp.t12_outside_call(job,'prepare',payload)->>'id')::bigint;
 instructions:=jsonb_build_object('outside',outside_id,'revision',1);
 BEGIN PERFORM pg_temp.t12_outside_call(job,'approve',instructions);
  RAISE EXCEPTION 'Preparer independently approved their own outside commitment'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t12_outside_call(job,'approve',instructions);
 -- Place the accepted synthetic approval in its historical spot before recording the vendor events.
 RESET ROLE;
 UPDATE erp_private.t12_outside_events SET occurred_at=pg_temp.t06_when(-55),recorded_at=pg_temp.t06_when(-55)
 WHERE t12_outside_events.outside_id=(instructions->>'outside')::bigint AND action='approve';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(4);
 instructions:=jsonb_build_object('outside',outside_id,'revision',2);
 BEGIN
  PERFORM pg_temp.t12_outside_call(job,'dispatch',instructions||jsonb_build_object('occurred',pg_temp.t06_when(-58),
   'evidence',pg_temp.t12_outside_proof(997201)));
  RAISE EXCEPTION 'Handover before historical independent procurement approval was accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END;
 BEGIN PERFORM pg_temp.t12_outside_call(job,'dispatch',instructions||jsonb_build_object('occurred',pg_temp.t06_when(-50),
  'evidence',pg_temp.t12_outside_proof(997205)));
  RAISE EXCEPTION 'Wrong asset original accepted for outside handover'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t12_outside_call(job,'dispatch',instructions||jsonb_build_object('occurred',pg_temp.t06_when(-50),
  'evidence',pg_temp.t12_outside_proof(997201)));
 IF public.t12_outside_workspace(job)->>'custody_open' IS DISTINCT FROM 'true'
    OR pg_temp.t12_outside_row(job,outside_id)->>'late' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Overdue physical vendor custody missing from the workspace';
 END IF;
 qc:=base||jsonb_build_object('revision',3,'occurred',pg_temp.t06_when(-12),'actual_work','Hydraulic pump tested','cost',110);
 BEGIN PERFORM pg_temp.t12_outside_t10('submit-qc',qc);
  RAISE EXCEPTION 'Vendor custody allowed premature internal QC'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 instructions:=instructions||'{"revision":3}';
 PERFORM pg_temp.t12_outside_call(job,'milestone',instructions||jsonb_build_object('occurred',pg_temp.t06_when(-40),'milestone','Bench testing'));
 BEGIN PERFORM pg_temp.t12_outside_call(job,'milestone',instructions||jsonb_build_object('occurred',pg_temp.t06_when(-39),'milestone','Stale milestone'));
  RAISE EXCEPTION 'Stale outside-work revision accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 instructions:=instructions||'{"revision":4}';
 PERFORM pg_temp.t12_outside_call(job,'complete',instructions||jsonb_build_object('occurred',pg_temp.t06_when(-23),
  'outcome','completed','actual',110,'invoice','SUP-INV-1','evidence',pg_temp.t12_outside_proof(997202)));
 BEGIN PERFORM pg_temp.t12_outside_t10('submit-qc',qc);
  RAISE EXCEPTION 'Supplier completion was treated as physical return'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 instructions:=instructions||'{"revision":5}';
 -- A custody recorder with the QC grant still needs another reviewer.
 BEGIN
  PERFORM pg_temp.t06_actor(5);
  PERFORM pg_temp.t12_outside_call(job,'return',instructions||jsonb_build_object('occurred',pg_temp.t06_when(-15),
   'evidence',pg_temp.t12_outside_proof(997203)));
  PERFORM pg_temp.t06_actor(4);
  PERFORM pg_temp.t12_outside_t10('submit-qc',qc);
  PERFORM pg_temp.t06_actor(5);
  PERFORM pg_temp.t12_outside_t10('release',base||jsonb_build_object('revision',4,'occurred',pg_temp.t06_when(-10),
   'return_reference','WO-'||assessment||'/1','evidence',pg_temp.t12_outside_proof(997204)));
  RAISE EXCEPTION 'The outside return recorder released their own custody';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
  IF SQLERRM<>'An independent Workshop reviewer must release this outside repair' THEN RAISE; END IF;
 END;
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t12_outside_call(job,'return',instructions||jsonb_build_object('occurred',pg_temp.t06_when(-15),
  'evidence',pg_temp.t12_outside_proof(997203)));
 instructions:=instructions||'{"revision":6}';
 IF public.t12_outside_workspace(job)->>'custody_open' IS DISTINCT FROM 'false'
 OR pg_temp.t12_outside_row(job,outside_id)->>'late' IS DISTINCT FROM 'true'
 OR jsonb_array_length(pg_temp.t12_outside_row(job,outside_id)->'events')<>6 THEN
  RAISE EXCEPTION 'Exact handover, milestone, service completion and late return were not retained';
 END IF;
 PERFORM pg_temp.t06_actor(7);
 BEGIN PERFORM pg_temp.t12_outside_call(job,'stage-finance',instructions);
  RAISE EXCEPTION 'Finance staged a return before independent QC'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t12_outside_t10('submit-qc',qc);
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t12_outside_t10('release',base||jsonb_build_object('revision',4,'occurred',pg_temp.t06_when(-10),
  'return_reference','WO-'||assessment||'/1','evidence',pg_temp.t12_outside_proof(997204)));
 PERFORM pg_temp.t06_actor(7);
 BEGIN PERFORM pg_temp.t12_outside_call(job,'stage-finance',instructions);
  RAISE EXCEPTION 'Finance staged an unapproved cost variance'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t12_outside_call(job,'approve-variance',instructions);
 instructions:=instructions||'{"revision":7}';
 PERFORM pg_temp.t06_actor(7);
 instructions:=instructions||'{"reason":"Verified original and approved actual cost"}';
 result:=public.t12_outside_work(stage_operation,job,'stage-finance',instructions);
 old_finance:=(result->>'finance_receipt')::bigint;
 IF old_finance IS NULL OR public.t12_outside_work(stage_operation,job,'stage-finance',instructions)
   IS DISTINCT FROM result||'{"replayed":true}'::jsonb THEN
  RAISE EXCEPTION 'Exact Finance receipt replay failed';
 END IF;
 BEGIN PERFORM public.t12_outside_work(stage_operation,job,'stage-finance',instructions||'{"reason":"Changed retry"}');
  RAISE EXCEPTION 'Finance retry accepted altered facts'; EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL; END;
 IF pg_temp.t12_outside_row(job,outside_id)->'finance_receipt'->>'amount' IS DISTINCT FROM '110.00'
 OR pg_temp.t12_outside_row(job,outside_id)->'finance_receipt'->>'state' IS DISTINCT FROM 'staged' THEN
  RAISE EXCEPTION 'Finance stage did not derive the exact approved actual amount';
 END IF;
 PERFORM pg_temp.t06_actor(4);
 IF pg_temp.t12_outside_row(job,outside_id)->>'finance_receipt' IS NOT NULL THEN
  RAISE EXCEPTION 'Workshop read the restricted Finance receipt';
 END IF;
 PERFORM pg_temp.t06_actor(6);
 IF public.t12_outside_workspace(job) IS NOT NULL THEN RAISE EXCEPTION 'Sibling branch read outside custody'; END IF;
 PERFORM pg_temp.t06_actor(9);
 IF public.t12_outside_workspace(job) IS NOT NULL THEN RAISE EXCEPTION 'Another company read outside custody'; END IF;
 BEGIN PERFORM public.t12_outside_work(stage_operation,job,'stage-finance',instructions);
  RAISE EXCEPTION 'Another company could use the operation receipt'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(8);
 IF public.t12_outside_workspace(job) IS NOT NULL THEN RAISE EXCEPTION 'Global administrator inherited held outside authority'; END IF;
 PERFORM pg_temp.t06_actor(5);
 next_job:=(pg_temp.t12_outside_t10('reopen',base||'{"revision":5}')->>'job')::bigint;
 IF next_job IS NULL OR next_job=job OR public.t12_outside_workspace(next_job)->'orders'<>'[]'::jsonb THEN
  RAISE EXCEPTION 'A reopened repair inherited an outside commitment'; END IF;
 PERFORM pg_temp.t06_actor(7);
 IF public.t12_outside_work(stage_operation,job,'stage-finance',instructions)
  IS DISTINCT FROM result||'{"replayed":true}'::jsonb THEN RAISE EXCEPTION 'Reopen changed the original Finance receipt'; END IF;
 -- A retained invoice cannot be consumed again against a later repair cycle.
 BEGIN
  PERFORM pg_temp.t06_actor(4);
  base:=jsonb_build_object('assessment',assessment,'job',next_job);
  PERFORM pg_temp.t12_outside_t10('plan',base||jsonb_build_object('revision',1,'worker',980002,
   'starts',pg_temp.t06_when(-8),'ends',pg_temp.t06_when(-1),'estimate',110));
  PERFORM pg_temp.t12_outside_t10('start',base||jsonb_build_object('revision',2,'occurred',pg_temp.t06_when(-8)));
  outside_id:=(pg_temp.t12_outside_call(next_job,'prepare',payload||jsonb_build_object('reference','EXT-124',
   'promised_return',pg_temp.t06_when(-1)))->>'id')::bigint;
  PERFORM pg_temp.t06_actor(5);
  PERFORM pg_temp.t12_outside_call(next_job,'approve',jsonb_build_object('outside',outside_id,'revision',1));
  RESET ROLE;
  UPDATE erp_private.t12_outside_events e SET occurred_at=pg_temp.t06_when(-7),recorded_at=pg_temp.t06_when(-7)
  WHERE e.outside_id=(SELECT o.id FROM erp_private.t12_outside_orders o WHERE o.job_cycle_id=next_job) AND e.action='approve';
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.t06_actor(4);
  PERFORM pg_temp.t12_outside_call(next_job,'dispatch',jsonb_build_object('outside',outside_id,'revision',2,
   'occurred',pg_temp.t06_when(-6),'evidence',pg_temp.t12_outside_proof(997206)));
  PERFORM pg_temp.t12_outside_call(next_job,'complete',jsonb_build_object('outside',outside_id,'revision',3,
   'occurred',pg_temp.t06_when(-3),'outcome','completed','actual',110,'invoice','sup-inv-1','evidence',pg_temp.t12_outside_proof(997207)));
  RAISE EXCEPTION 'A reopened repair admitted a previously staged supplier invoice';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
  IF SQLERRM<>'The custody, supplier invoice or signed original has already been recorded' THEN RAISE; END IF;
 END;
 RESET ROLE;
 IF (SELECT count(*) FROM erp_private.t12_outside_finance f WHERE f.outside_id=(instructions->>'outside')::bigint)<>1 THEN
  RAISE EXCEPTION 'Finance receipt did not stay unique';
 END IF;
 BEGIN UPDATE public.dms_document_files SET integrity_status='pending' WHERE id=997202;
  RAISE EXCEPTION 'Supplier original was mutable after acceptance'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN UPDATE public.dms_document_versions SET unlinked_at=now() WHERE id=997201;
  RAISE EXCEPTION 'Signed handover version was mutable'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(1);
 BEGIN UPDATE public.dms_document_links SET deleted_at=now() WHERE document_id=997203 AND entity_type='fleet_asset';
  RAISE EXCEPTION 'Signed physical return association could be removed'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 SET LOCAL ROLE authenticated;
END $$;
RESET ROLE;
SELECT 'T12 native outside custody, late service, scoped independent QC and one exact Finance stage passed';
