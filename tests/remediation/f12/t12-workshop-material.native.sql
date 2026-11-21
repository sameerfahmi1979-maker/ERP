-- Run after the synthetic T07 fixture prefix, within its rollback transaction.
DO $$ BEGIN
 IF to_regprocedure('public.t12_material_workspace(bigint)') IS NULL THEN
  RAISE EXCEPTION 'T12 exact-job material workspace is missing';
 END IF;
 IF has_function_privilege('anon','public.t12_material_workspace(bigint)','EXECUTE')
   OR has_function_privilege('service_role','public.t12_material_workspace(bigint)','EXECUTE') THEN
  RAISE EXCEPTION 'T12 material projection has an unexpected execute grant';
 END IF;
END $$;

INSERT INTO public.roles(role_code,role_name,is_system_role)
 SELECT 't12_mat_'||code,'Synthetic T12 material '||code,false
 FROM unnest(ARRAY['setup','request','review','buyer','reader','finance','sibling']) code;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('setup',ARRAY['supply.setup']),
 ('request',ARRAY['workshop.jobs.manage','fleet.inspections.report','supply.request','supply.stock']),
 ('review',ARRAY['workshop.assess','workshop.jobs.release','supply.stock','supply.approve','supply.purchase.approve',
  'master_data.parties.view','dms.documents.view','dms.documents.preview']),
 ('buyer',ARRAY['supply.purchase','supply.stock','master_data.parties.view']),
 ('reader',ARRAY['workshop.jobs.manage']),
 ('finance',ARRAY['workshop.jobs.manage','supply.value']),
 ('sibling',ARRAY['workshop.jobs.manage','supply.request'])
) grants(role,caps) JOIN public.roles r ON r.role_code='t12_mat_'||grants.role
 JOIN public.permissions p ON p.permission_code=ANY(grants.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,g.company,g.branch,true FROM (VALUES
 (1,'setup',920001,NULL::bigint),(1,'request',920001,920011),(4,'review',920001,920011),
 (7,'buyer',920001,920011),(2,'reader',920001,920011),(5,'finance',920001,920011),
 (6,'sibling',920001,920012),(9,'sibling',920002,920021)
) g(n,role,company,branch) JOIN public.user_profiles u
 ON u.auth_user_id=('98000000-0000-4000-8000-'||lpad(g.n::text,12,'0'))::uuid
 JOIN public.roles r ON r.role_code='t12_mat_'||g.role;
INSERT INTO public.party_approval_statuses(approval_status_code,name_en) VALUES ('APPROVED','Approved') ON CONFLICT(approval_status_code) DO NOTHING;
INSERT INTO public.party_vendor_profiles(party_id,vendor_approval_status_id,can_create_po,requires_comparison)
 SELECT 990001,id,true,true FROM public.party_approval_statuses WHERE approval_status_code='APPROVED';

INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE
 VALUES (997201,'FLEET_WORKSHOP_RETURN','Workshop handback',990001) ON CONFLICT(type_code) DO NOTHING;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status)
 OVERRIDING SYSTEM VALUE SELECT 997201,'T12-MAT-RETURN','Synthetic signed handback',id,990001,920001,920011,'internal','active'
 FROM public.dms_document_types WHERE type_code='FLEET_WORKSHOP_RETURN';
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE VALUES(997201,997201,1,true);
UPDATE public.dms_documents SET current_version_id=997201 WHERE id=997201;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE VALUES(997201,997201,997201,'original','dms-documents','test/t12-material.pdf','original.pdf','application/pdf',100,repeat('a',64),'verified');
SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(997201,'fleet_asset',980102);
RESET ROLE;

CREATE FUNCTION pg_temp.t12_mat_setup(p_action text,p_data jsonb) RETURNS bigint LANGUAGE sql AS $$
 SELECT (public.t11_supply_setup(gen_random_uuid(),920011,p_action,p_data||'{"reason":"Synthetic material setup"}')->>'id')::bigint;
$$;
CREATE FUNCTION pg_temp.t12_mat_stock(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t11_stock_command(gen_random_uuid(),920011,p_action,p_data||'{"reason":"Synthetic stock action"}');
$$;
CREATE FUNCTION pg_temp.t12_mat_purchase(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t11_purchase_command(gen_random_uuid(),920011,p_action,p_data||'{"reason":"Synthetic purchase action"}');
$$;
CREATE FUNCTION pg_temp.t12_mat_job(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t10_workshop_command(gen_random_uuid(),980102,p_action,p_data||'{"reason":"Synthetic Workshop action"}');
$$;
CREATE FUNCTION pg_temp.t12_mat_id(p_data jsonb,p_field text DEFAULT 'id') RETURNS bigint LANGUAGE sql AS $$
 SELECT (p_data->>p_field)::bigint;
$$;

DO $$
DECLARE stock_rule bigint; purchasing_rule bigint; approver bigint; units bigint; part bigint; owner bigint; shelf bigint; quarantine bigint;
 assessment bigint; job bigint; new_job bigint; demand bigint; purchase bigint; hold_receipt bigint; available_layer bigint;
 reservation bigint; issue bigint; correction bigint; returned bigint; reversal bigint; view jsonb; projected jsonb;
 original_purchase jsonb; response jsonb; body jsonb; demand_body jsonb; demand_response jsonb; issue_response jsonb;
BEGIN
 SELECT id INTO approver FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000004';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 units:=pg_temp.t12_mat_setup('unit','{"code":"EA","decimals":0}');
 part:=pg_temp.t12_mat_setup('item',jsonb_build_object('code','T12-PART','name','Filter','unit',units,'kind','part','trace','none'));
 owner:=pg_temp.t12_mat_setup('owner','{"code":"T12-STOCK"}');
 shelf:=pg_temp.t12_mat_setup('bin','{"code":"MAIN","store":"T12","kind":"available","site":980001}');
 quarantine:=pg_temp.t12_mat_setup('bin','{"code":"HOLD","store":"T12","kind":"quarantine","site":980001}');
 assessment:=pg_temp.t12_mat_id(pg_temp.t12_mat_job('report',jsonb_build_object('kind','reported-failure',
  'reference','T12-MAT-01','occurred',pg_temp.t06_when(-40))),'assessment');
 PERFORM pg_temp.t06_actor(4);
 job:=pg_temp.t12_mat_id(pg_temp.t12_mat_job('assess',jsonb_build_object('assessment',assessment,'outcome','repair')),'job');
 IF public.t12_material_workspace(job)->>'can_request' IS DISTINCT FROM 'false' THEN
  RAISE EXCEPTION 'A triage cycle offered a material request'; END IF;
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t12_mat_job('plan',jsonb_build_object('assessment',assessment,'job',job,'revision',1,
  'worker',980002,'starts',pg_temp.t06_when(-33),'ends',pg_temp.t06_when(-8),'estimate',100));
 PERFORM pg_temp.t12_mat_job('start',jsonb_build_object('assessment',assessment,'job',job,'revision',2,'occurred',pg_temp.t06_when(-32)));
 view:=public.t12_material_workspace(job);
 IF view->>'can_request' IS DISTINCT FROM 'true' OR view->>'stock_route' IS DISTINCT FROM 'false'
   OR view->>'purchasing_route' IS DISTINCT FROM 'false'
   OR pg_temp.t12_mat_id(view->'items'->0) IS DISTINCT FROM part THEN
  RAISE EXCEPTION 'Material selector or pending route lost the exact Workshop scope'; END IF;
 demand_body:=jsonb_build_object('job',job,'source_line','FILTER','item',part,'owner',owner,'uom',units,'quantity',5,
  'reason','Approved estimate item');
 demand_response:=public.t11_stock_command(pg_temp.t06_op(1201),920011,'demand',demand_body);
 demand:=pg_temp.t12_mat_id(demand_response);
 BEGIN
  PERFORM public.t11_stock_command(pg_temp.t06_op(1201),920011,'demand',demand_body||'{"quantity":6}');
  RAISE EXCEPTION 'Changed retry replaced an existing demand';
 EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL; END;
 BEGIN
  PERFORM public.t11_stock_command(pg_temp.t06_op(1205),920011,'demand',demand_body);
  RAISE EXCEPTION 'A fresh operation duplicated the same job source line';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(2);
 IF public.t12_material_workspace(job)->>'can_request' IS DISTINCT FROM 'false'
   OR public.t12_material_workspace(job)->'items' IS DISTINCT FROM '[]'::jsonb THEN
  RAISE EXCEPTION 'Read-only Workshop actor received request controls'; END IF;
 BEGIN
  PERFORM public.t11_stock_command(pg_temp.t06_op(1206),920011,'demand',demand_body);
  RAISE EXCEPTION 'Read-only Workshop actor created a material demand';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(1);
 stock_rule:=pg_temp.t12_mat_setup('propose',jsonb_build_object('domain','stock','owner',approver));
 purchasing_rule:=pg_temp.t12_mat_setup('propose',jsonb_build_object('domain','purchasing','owner',approver));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t12_mat_setup('decide',jsonb_build_object('policy',stock_rule,'decision','accepted'));
 PERFORM pg_temp.t12_mat_setup('decide',jsonb_build_object('policy',purchasing_rule,'decision','accepted'));
 PERFORM pg_temp.t06_actor(7);
 purchase:=pg_temp.t12_mat_id(pg_temp.t12_mat_purchase('prepare',jsonb_build_object('supplier',990001,'item',part,'owner',owner,
  'demand',demand,'reference','T12-PO','line',1,'uom',units,'quantity',5,'comparison','T12-COMP')));
 IF public.t12_material_workspace(job) IS NOT NULL THEN
  RAISE EXCEPTION 'Purchasing-only actor can enumerate Workshop job details'; END IF;
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t12_mat_purchase('approve',jsonb_build_object('purchase',purchase));
 IF public.t12_material_workspace(job)#>>'{demands,0,purchases,0,reference}' IS DISTINCT FROM 'T12-PO / 1'
   OR public.t12_material_workspace(job)#>>'{demands,0,purchases,0,supplier}' IS NULL THEN
  RAISE EXCEPTION 'Permitted job Procurement reference or supplier was masked'; END IF;
 PERFORM pg_temp.t06_actor(7);
 body:=jsonb_build_object('purchase',purchase,'delivery_note','T12-MIXED','uom',units,'quantity',4,'accepted',2,'rejected',1,
  'quarantined',1,'bin',shelf,'quarantine_bin',quarantine,'reason','Synthetic mixed receipt');
 response:=public.t11_purchase_command(pg_temp.t06_op(1202),920011,'receive',body);
 hold_receipt:=pg_temp.t12_mat_id(response);
 IF public.t11_purchase_command(pg_temp.t06_op(1202),920011,'receive',body) IS DISTINCT FROM response||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Exact receipt retry returned a new reference'; END IF;
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t12_mat_purchase('quarantine',jsonb_build_object('receipt',hold_receipt,'outcome','rejected','uom',units,'quantity',1));
 SELECT pg_temp.t12_mat_id(l) INTO available_layer FROM jsonb_array_elements(public.t11_supply_workspace(920011,'inventory')->'layers') l
  WHERE l->>'kind'='available' AND (l->>'on_hand')::numeric=2;
 IF available_layer IS NULL OR (SELECT count(*) FROM jsonb_array_elements(public.t11_supply_workspace(920011,'inventory')->'layers') l
  WHERE l->>'kind'='available')<>1 THEN RAISE EXCEPTION 'Rejected or quarantined material contributed to available stock'; END IF;
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t12_mat_stock('value',jsonb_build_object('layer',available_layer,'currency','AED','unit_cost',10,'finance_ref','T12-FIN'));
 PERFORM pg_temp.t06_actor(1);
 reservation:=pg_temp.t12_mat_id(pg_temp.t12_mat_stock('reserve',jsonb_build_object('layer',available_layer,'demand',demand,
  'reference','T12-ISSUE','uom',units,'quantity',2)));
 projected:=public.t12_material_workspace(job)->'demands'->0;
 IF (projected->>'reserved')::numeric IS DISTINCT FROM 2 OR (projected->>'issued')::numeric IS DISTINCT FROM 0 THEN
  RAISE EXCEPTION 'Reservation was projected as a posted issue'; END IF;
 body:=jsonb_build_object('reservation',reservation,'reason','Synthetic issue exact retry');
 issue_response:=public.t11_stock_command(pg_temp.t06_op(1203),920011,'complete',body);
 issue:=pg_temp.t12_mat_id(issue_response,'movement');
 correction:=pg_temp.t12_mat_id(pg_temp.t12_mat_stock('correction',
  jsonb_build_object('movement',issue,'mode','unused-return','uom',units,'quantity',1)));
 projected:=public.t12_material_workspace(job)->'demands'->0;
 IF projected#>>'{corrections,0,state}' IS DISTINCT FROM 'pending' OR (projected->>'returned')::numeric IS DISTINCT FROM 0 THEN
  RAISE EXCEPTION 'Pending return was booked or hidden'; END IF;
 PERFORM pg_temp.t06_actor(4);
 returned:=pg_temp.t12_mat_id(pg_temp.t12_mat_stock('decide',jsonb_build_object('review',correction,'outcome','approved')),'movement');
 PERFORM pg_temp.t06_actor(2);
 projected:=public.t12_material_workspace(job)->'demands'->0;
 IF (projected->>'source_revision')::integer IS DISTINCT FROM 3 OR (projected->>'reserved')::numeric IS DISTINCT FROM 0
   OR (projected->>'issued')::numeric IS DISTINCT FROM 2 OR (projected->>'returned')::numeric IS DISTINCT FROM 1
   OR (projected->>'remaining')::numeric IS DISTINCT FROM 4
   OR projected#>>'{purchases,0,reference}' IS NOT NULL OR projected#>>'{purchases,0,supplier}' IS NOT NULL
   OR projected#>>'{purchases,0,receipts,0,label}' IS NOT NULL OR projected#>>'{movements,0,amount}' IS NOT NULL
   OR projected#>>'{purchases,0,receipts,0,inspections,0,outcome}' IS DISTINCT FROM 'rejected'
   OR (projected#>>'{purchases,0,receipts,0,rejected}')::numeric IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'Workshop projection lost exact quantities, inspection or masking'; END IF;
 original_purchase:=projected->'purchases'->0->'receipts'->0;
 PERFORM pg_temp.t06_actor(5);
 IF (public.t12_material_workspace(job)#>>'{demands,0,movements,0,amount}')::numeric IS DISTINCT FROM 20
   OR (public.t12_material_workspace(job)#>>'{demands,0,movements,1,amount}')::numeric IS DISTINCT FROM 10
   OR (public.t12_material_workspace(job)#>>'{demands,0,movements,1,reference}')::bigint IS DISTINCT FROM issue
   OR (public.t12_material_workspace(job)#>>'{demands,0,movements,1,id}')::bigint IS DISTINCT FROM returned THEN
  RAISE EXCEPTION 'Finance lost immutable valuations or linked original movement'; END IF;
 PERFORM pg_temp.t06_actor(6);
 IF public.t12_material_workspace(job) IS NOT NULL THEN RAISE EXCEPTION 'Sibling branch can read linked material'; END IF;
 PERFORM pg_temp.t06_actor(9);
 IF public.t12_material_workspace(job) IS NOT NULL THEN RAISE EXCEPTION 'Other company can read linked material'; END IF;
 PERFORM pg_temp.t06_actor(8);
 IF public.t12_material_workspace(job) IS NOT NULL THEN RAISE EXCEPTION 'Administrator inherited material read access'; END IF;
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t12_mat_job('submit-qc',jsonb_build_object('assessment',assessment,'job',job,'revision',3,
  'occurred',pg_temp.t06_when(-9),'actual_work','Changed filter','cost',20));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t12_mat_job('release',jsonb_build_object('assessment',assessment,'job',job,'revision',4,'occurred',pg_temp.t06_when(-8),
   'evidence','{"document":997201,"version":997201,"file":997201}'::jsonb,'return_reference','WO-'||assessment||'/1'));
 new_job:=pg_temp.t12_mat_id(pg_temp.t12_mat_job('reopen',jsonb_build_object('assessment',assessment,'job',job,'revision',5)),'job');
 PERFORM pg_temp.t06_actor(2);
 IF new_job IS NULL OR new_job=job OR public.t12_material_workspace(new_job)->'demands' IS DISTINCT FROM '[]'::jsonb
   OR public.t12_material_workspace(job)->>'active' IS DISTINCT FROM 'false'
   OR public.t12_material_workspace(job)#>'{demands,0,purchases,0,receipts,0}' IS DISTINCT FROM original_purchase THEN
  RAISE EXCEPTION 'Reopen moved or edited the original cycle material receipts'; END IF;
 PERFORM pg_temp.t06_actor(1);
 IF public.t11_stock_command(pg_temp.t06_op(1201),920011,'demand',demand_body) IS DISTINCT FROM demand_response||'{"replayed":true}'
   OR public.t11_stock_command(pg_temp.t06_op(1203),920011,'complete',body) IS DISTINCT FROM issue_response||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Closed cycle did not preserve exact demand and issue receipts'; END IF;
 BEGIN
  PERFORM public.t11_stock_command(pg_temp.t06_op(1204),920011,'complete',body);
  RAISE EXCEPTION 'Closed cycle posted a second issue with a fresh operation';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 correction:=pg_temp.t12_mat_id(pg_temp.t12_mat_stock('correction',
  jsonb_build_object('movement',issue,'mode','reverse','uom',units,'quantity',1)));
 PERFORM pg_temp.t06_actor(4);
 reversal:=pg_temp.t12_mat_id(pg_temp.t12_mat_stock('decide',jsonb_build_object('review',correction,'outcome','approved')),'movement');
 PERFORM pg_temp.t06_actor(1);
 projected:=public.t12_material_workspace(job)->'demands'->0;
 IF (projected->>'reversed')::numeric IS DISTINCT FROM 1 OR (projected->>'remaining')::numeric IS DISTINCT FROM 5
   OR (projected#>>'{movements,2,id}')::bigint IS DISTINCT FROM reversal
   OR (projected#>>'{movements,2,reference}')::bigint IS DISTINCT FROM issue THEN
  RAISE EXCEPTION 'Reversal was omitted or detached from the original issue after reopen'; END IF;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t12_mat_purchase('supplier-return',jsonb_build_object('receipt',hold_receipt,'movement',
  (original_purchase->>'quarantine_movement')::bigint,'reference','T12-REJECTED-RETURN','uom',units,'quantity',1));
 PERFORM pg_temp.t12_mat_purchase('receive',jsonb_build_object('purchase',purchase,'delivery_note','T12-LATE','uom',units,
  'quantity',1,'accepted',1,'rejected',0,'quarantined',0,'bin',shelf));
 PERFORM pg_temp.t06_actor(2);
 projected:=public.t12_material_workspace(job)#>'{demands,0,purchases,0,receipts}';
 IF jsonb_array_length(projected) IS DISTINCT FROM 2 OR (projected#>>'{1,accepted}')::numeric IS DISTINCT FROM 1
   OR (projected#>>'{0,returns,0,original}')::bigint IS DISTINCT FROM (original_purchase->>'quarantine_movement')::bigint
   OR projected#>>'{0,returns,0,reference}' IS NOT NULL
   OR public.t12_material_workspace(new_job)->'demands' IS DISTINCT FROM '[]'::jsonb THEN
  RAISE EXCEPTION 'Late receiving or rejected supplier return lost the original cycle or read masking'; END IF;
END $$;

ROLLBACK;
SELECT 'T12 Workshop material native assertions passed';
