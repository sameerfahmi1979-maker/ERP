-- Run after the shared transaction-wrapped T07 fixture.
DO $$ BEGIN
 IF to_regprocedure('public.t11_stock_command(uuid,bigint,text,jsonb)') IS NULL
 OR to_regprocedure('public.t11_purchase_command(uuid,bigint,text,jsonb)') IS NULL
 OR to_regprocedure('public.t11_fuel_command(uuid,bigint,text,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'T11 shared stock, physical receipt and manual fuel boundaries are missing'; END IF;
END $$;

INSERT INTO public.roles(role_code,role_name,is_system_role)
 SELECT 't11_'||code,'Synthetic T11 '||code,false FROM unnest(ARRAY['company','operator','review','finance','buyer','branch']) code;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t11_company',ARRAY['supply.setup']),
 ('t11_operator',ARRAY['supply.stock','supply.request','supply.purchase','supply.purchase.approve','supply.fuel','workshop.jobs.manage','fleet.inspections.report']),
 ('t11_review',ARRAY['supply.approve','supply.stock','supply.purchase.approve','dms.documents.view','dms.documents.preview',
  'master_data.parties.view','workshop.assess','workshop.jobs.release']),
 ('t11_finance',ARRAY['supply.value']),
 ('t11_buyer',ARRAY['supply.purchase']),
 ('t11_branch',ARRAY['supply.stock','supply.setup'])
) v(role,caps) JOIN public.roles r ON r.role_code=v.role JOIN public.permissions p ON p.permission_code=ANY(v.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,a.company,a.branch,true FROM (VALUES
 (1,'t11_company',920001,NULL::bigint),(1,'t11_company',920002,NULL),
 (1,'t11_operator',920001,920011),(1,'t11_operator',920002,920021),
 (4,'t11_review',920001,920011),(4,'t11_review',920002,920021),
 (5,'t11_finance',920001,920011),(6,'t11_branch',920001,920012),
 (7,'t11_buyer',920001,920011),(9,'t11_branch',920002,920021),(9,'t11_finance',920002,920021)
) a(n,role_code,company,branch) JOIN public.user_profiles u
 ON u.auth_user_id=('98000000-0000-4000-8000-'||lpad(a.n::text,12,'0'))::uuid JOIN public.roles r ON r.role_code=a.role_code;
INSERT INTO public.party_approval_statuses(approval_status_code,name_en) VALUES ('APPROVED','Approved') ON CONFLICT(approval_status_code) DO NOTHING;
INSERT INTO public.party_vendor_profiles(party_id,vendor_approval_status_id,can_create_po,requires_comparison)
SELECT 990001,id,true,true FROM public.party_approval_statuses WHERE approval_status_code='APPROVED';

INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES
 (997101,'FLEET_FUEL_VOUCHER','Fuel voucher',990001),(997102,'FLEET_WORKSHOP_RETURN','Workshop handback',990001) ON CONFLICT(type_code) DO NOTHING;
CREATE TEMP TABLE t11_docs AS SELECT * FROM (VALUES (997101,'FLEET_FUEL_VOUCHER'),(997102,'FLEET_FUEL_VOUCHER'),
 (997103,'FLEET_WORKSHOP_RETURN')) d(id,code);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status)
 OVERRIDING SYSTEM VALUE SELECT d.id,'T11-FIXTURE-'||d.id,'Synthetic T11 evidence',t.id,990001,920001,920011,'internal','active'
 FROM t11_docs d JOIN public.dms_document_types t ON t.type_code=d.code;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
 OVERRIDING SYSTEM VALUE SELECT id,id,1,true FROM t11_docs;
UPDATE public.dms_documents SET current_version_id=id WHERE id BETWEEN 997101 AND 997103;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE SELECT id,id,id,'original','dms-documents','test/t11-'||id||'.pdf','original.pdf','application/pdf',100,repeat('a',64),'verified'
 FROM t11_docs;

CREATE FUNCTION pg_temp.t11_setup(p_branch bigint,p_action text,p_data jsonb) RETURNS bigint LANGUAGE sql AS $$
 SELECT (public.t11_supply_setup(gen_random_uuid(),p_branch,p_action,p_data||'{"reason":"Synthetic setup"}')->>'id')::bigint;
$$;
CREATE FUNCTION pg_temp.t11_stock(p_branch bigint,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t11_stock_command(gen_random_uuid(),p_branch,p_action,p_data||'{"reason":"Synthetic stock action"}');
$$;
CREATE FUNCTION pg_temp.t11_buy(p_branch bigint,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t11_purchase_command(gen_random_uuid(),p_branch,p_action,p_data||'{"reason":"Synthetic purchasing action"}');
$$;
CREATE FUNCTION pg_temp.t11_id(p jsonb,p_field text DEFAULT 'id') RETURNS bigint LANGUAGE sql AS $$ SELECT (p->>p_field)::bigint $$;
CREATE FUNCTION pg_temp.t11_evidence(d bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('document',d,'version',d,'file',d) $$;
CREATE FUNCTION pg_temp.t11_layer(p_branch bigint,p_id bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT x FROM jsonb_array_elements(public.t11_supply_workspace(p_branch,'inventory')->'layers') x WHERE (x->>'id')::bigint=p_id
$$;
CREATE FUNCTION pg_temp.t11_workshop(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t10_workshop_command(gen_random_uuid(),980102,p_action,p_data||'{"reason":"Synthetic Workshop action"}')
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
 VALUES(997101,'fleet_asset',980102),(997102,'fleet_asset',980102),(997103,'fleet_asset',980102);

DO $$
DECLARE branch bigint:=920011; branch_b bigint:=920021; profile bigint;
 each bigint; lit bigint; item bigint; fuelitem bigint; serialitem bigint; owner bigint; client_owner bigint;
 shelf bigint; tank bigint; quarantine bigint; yard bigint; policy_a bigint; policy_b bigint; policy_buy bigint;
 approval bigint; layer bigint; fuel_layer bigint; ref bigint; req_a bigint; req_b bigint; amount numeric; now_revision bigint;
 round_total numeric:=0; step integer; job bigint; case_id bigint; demand bigint; reserve_a bigint; reserve_b bigint; first_move bigint; later_move bigint;
 undo bigint; correction bigint; transfer_move bigint; transfer_layer bigint; review bigint;
 buy bigint; rec bigint; piece bigint; fuel bigint; external_fuel bigint; fuel_demand bigint;
 serial_buy bigint; serial_rec bigint; stale bigint; stats jsonb; data jsonb; response jsonb; payload jsonb;
 nonce uuid:=pg_temp.t06_op(1100); receive_nonce uuid:=pg_temp.t06_op(1101);
BEGIN
 RESET ROLE;
 SELECT id INTO profile FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000004';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 IF public.t11_supply_workspace(branch,'inventory')->>'company_setup' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Company setup not visible to company grant'; END IF;
 PERFORM pg_temp.t06_actor(6);
 IF public.t11_supply_workspace(920012,'inventory')->>'company_setup' IS DISTINCT FROM 'false'
  OR public.t11_supply_workspace(branch,'inventory') IS NOT NULL THEN RAISE EXCEPTION 'Company/sibling setup scope leaked'; END IF;
 PERFORM pg_temp.t06_actor(8);
 IF public.t11_supply_workspace(branch,'inventory') IS NOT NULL THEN RAISE EXCEPTION 'Global administrator inherited a held business role'; END IF;
 PERFORM pg_temp.t06_actor(1);
 each:=pg_temp.t11_setup(branch,'unit','{"code":"EA","decimals":0}');
 lit:=pg_temp.t11_setup(branch,'unit','{"code":"L","decimals":3}');
 item:=pg_temp.t11_setup(branch,'item',jsonb_build_object('code','P-001','name','Oil filter','unit',each,'kind','part','trace','lot'));
 serialitem:=pg_temp.t11_setup(branch,'item',jsonb_build_object('code','P-002','name','Serialised sensor','unit',each,'kind','part','trace','serial'));
 fuelitem:=pg_temp.t11_setup(branch,'item',jsonb_build_object('code','DIESEL','name','Diesel','unit',lit,'kind','fuel','trace','none'));
 owner:=pg_temp.t11_setup(branch,'owner','{"code":"OWN"}');
 client_owner:=pg_temp.t11_setup(branch,'owner','{"code":"CLIENT","party":990001}');
 shelf:=pg_temp.t11_setup(branch,'bin','{"code":"MAIN","store":"PARTS","kind":"available","site":980001}');
 tank:=pg_temp.t11_setup(branch,'bin','{"code":"TANK-01","store":"FUEL","kind":"available","site":980001}');
 quarantine:=pg_temp.t11_setup(branch,'bin','{"code":"HOLD","store":"PARTS","kind":"quarantine","site":980001}');
 yard:=pg_temp.t11_setup(branch_b,'bin','{"code":"YARD","store":"BMP","kind":"available","site":980002}');
 payload:=jsonb_build_object('item',item,'owner',owner,'bin',shelf,'uom',each,'quantity',5,'lot','LOT-A');
 BEGIN PERFORM pg_temp.t11_stock(branch,'opening',payload);
  RAISE EXCEPTION 'Stock booked without an accepted owner'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 policy_a:=pg_temp.t11_setup(branch,'propose',jsonb_build_object('domain','stock','owner',profile));
 policy_b:=pg_temp.t11_setup(branch_b,'propose',jsonb_build_object('domain','stock','owner',profile));
 policy_buy:=pg_temp.t11_setup(branch,'propose',jsonb_build_object('domain','purchasing','owner',profile));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_setup(branch,'decide',jsonb_build_object('policy',policy_a,'decision','accepted'));
 PERFORM pg_temp.t11_setup(branch_b,'decide',jsonb_build_object('policy',policy_b,'decision','accepted'));
 PERFORM pg_temp.t11_setup(branch,'decide',jsonb_build_object('policy',policy_buy,'decision','accepted'));
 PERFORM pg_temp.t06_actor(1);
 BEGIN PERFORM pg_temp.t11_stock(branch,'opening',payload||jsonb_build_object('uom',lit));
  RAISE EXCEPTION 'Opening accepted a mismatched unit'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 response:=pg_temp.t11_stock(branch,'opening',payload);
 approval:=pg_temp.t11_id(response); layer:=pg_temp.t11_id(response,'layer');
 IF pg_temp.t11_layer(branch,layer)->>'on_hand' IS DISTINCT FROM '0.000' THEN RAISE EXCEPTION 'Opening booked before approval'; END IF;
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',approval,'outcome','rejected'));
 PERFORM pg_temp.t06_actor(1);
 response:=pg_temp.t11_stock(branch,'opening',payload);
 IF pg_temp.t11_id(response,'layer')<>layer THEN RAISE EXCEPTION 'Rejected opening lost retained physical identity'; END IF;
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',pg_temp.t11_id(response),'outcome','approved'));
 PERFORM pg_temp.t06_actor(1);
 now_revision:=(pg_temp.t11_layer(branch,layer)->>'revision')::bigint;
 data:=jsonb_build_object('layer',layer,'revision',now_revision,'quantity',8,'uom',each);
 req_a:=pg_temp.t11_id(pg_temp.t11_stock(branch,'count',data));
 req_b:=pg_temp.t11_id(pg_temp.t11_stock(branch,'count',data));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',req_a,'outcome','approved'));
 BEGIN PERFORM pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',req_b,'outcome','approved'));
  RAISE EXCEPTION 'Stale count duplicated found stock'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 IF (pg_temp.t11_layer(branch,layer)->>'count_total')::numeric<>8 THEN RAISE EXCEPTION 'Found stock missing from count group'; END IF;
 PERFORM pg_temp.t06_actor(1);
 req_b:=pg_temp.t11_id(pg_temp.t11_stock(branch,'count',data||jsonb_build_object('revision',(pg_temp.t11_layer(branch,layer)->>'revision')::bigint)));
 PERFORM pg_temp.t06_actor(4);
 IF pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',req_b,'outcome','approved'))->>'movement' IS NOT NULL
 THEN RAISE EXCEPTION 'Repeating a correct count inflated stock'; END IF;

 PERFORM pg_temp.t06_actor(1);
 case_id:=pg_temp.t11_id(pg_temp.t11_workshop('report',jsonb_build_object('kind','reported-failure','reference','T11-JOB-001',
  'occurred',pg_temp.t06_when(-40))),'assessment');
 PERFORM pg_temp.t06_actor(4);
 job:=pg_temp.t11_id(pg_temp.t11_workshop('assess',jsonb_build_object('assessment',case_id,'outcome','repair')),'job');
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t11_workshop('plan',jsonb_build_object('assessment',case_id,'job',job,'revision',1,'worker',980002,
  'starts',pg_temp.t06_when(-33),'ends',pg_temp.t06_when(-8),'estimate',100));
 PERFORM pg_temp.t11_workshop('start',jsonb_build_object('assessment',case_id,'job',job,'revision',2,'occurred',pg_temp.t06_when(-32)));
 demand:=pg_temp.t11_id(pg_temp.t11_stock(branch,'demand',jsonb_build_object('job',job,'source_line','FILTER','item',item,'owner',owner,'uom',each,'quantity',6)));
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t11_stock(branch,'value',jsonb_build_object('layer',layer,'currency','AED','unit_cost',12.50,'finance_ref','T11-FIN-17'));
 PERFORM pg_temp.t06_actor(1);
 data:=jsonb_build_object('layer',layer,'demand',demand,'reference','ISSUE-01','uom',each,'quantity',4);
 reserve_a:=pg_temp.t11_id(pg_temp.t11_stock(branch,'reserve',data));
 BEGIN PERFORM pg_temp.t11_stock(branch,'reserve',data||'{"reference":"ISSUE-02","quantity":2}');
  RAISE EXCEPTION 'Reservation oversold the actual layer'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 payload:=jsonb_build_object('reservation',reserve_a,'reason','Synthetic issue exact retry');
 response:=public.t11_stock_command(nonce,branch,'complete',payload);
 first_move:=pg_temp.t11_id(response,'movement');
 IF public.t11_stock_command(nonce,branch,'complete',payload) IS DISTINCT FROM response||'{"replayed":true}'::jsonb
  OR public.t11_movement_receipt(first_move)->>'amount' IS NOT NULL THEN RAISE EXCEPTION 'Issue retry or amount masking failed'; END IF;
 PERFORM pg_temp.t06_actor(7);
 IF public.t11_movement_receipt(first_move) IS NOT NULL THEN RAISE EXCEPTION 'Procurement-only user saw internal stock issue'; END IF;
 PERFORM pg_temp.t06_actor(5);
 IF (public.t11_movement_receipt(first_move)->>'amount')::numeric<>50 OR public.t11_movement_receipt(first_move)->>'currency'<>'AED' THEN
  RAISE EXCEPTION 'Finance did not see exact verified issue valuation'; END IF;
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t11_workshop('submit-qc',jsonb_build_object('assessment',case_id,'job',job,'revision',3,'occurred',pg_temp.t06_when(-9),
  'actual_work','Changed filter','cost',50));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_workshop('release',jsonb_build_object('assessment',case_id,'job',job,'revision',4,'occurred',pg_temp.t06_when(-8),
  'evidence',pg_temp.t11_evidence(997103),'return_reference','WO-'||case_id||'/1'));
 PERFORM pg_temp.t11_workshop('reopen',jsonb_build_object('assessment',case_id,'job',job,'revision',5));
 PERFORM pg_temp.t06_actor(1);
 review:=pg_temp.t11_id(pg_temp.t11_stock(branch,'correction',jsonb_build_object('movement',first_move,'mode','unused-return','uom',each,'quantity',1)));
 PERFORM pg_temp.t06_actor(4);
 undo:=pg_temp.t11_id(pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',review,'outcome','approved')),'movement');
 PERFORM pg_temp.t06_actor(5);
 IF (public.t11_movement_receipt(first_move)->>'amount')::numeric<>50 OR
  (public.t11_movement_receipt(undo)->>'amount')::numeric<>12.5 OR (public.t11_movement_receipt(undo)->>'reference')::bigint<>first_move THEN
  RAISE EXCEPTION 'Reopen or linked unused return changed the historical cost or source'; END IF;
 PERFORM pg_temp.t06_actor(1);
 review:=pg_temp.t11_id(pg_temp.t11_stock(branch,'correction',jsonb_build_object('movement',first_move,'mode','reverse','uom',each,'quantity',4)));
 PERFORM pg_temp.t06_actor(4);
 BEGIN PERFORM pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',review,'outcome','approved'));
  RAISE EXCEPTION 'Reversal exceeded unreversed issue'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

 PERFORM pg_temp.t06_actor(1);
 reserve_a:=pg_temp.t11_id(pg_temp.t11_stock(branch,'reserve',jsonb_build_object('layer',layer,'destination',yard,'reference','TRANSFER-CANCEL','uom',each,'quantity',1)));
 reserve_b:=pg_temp.t11_id(pg_temp.t11_stock(branch,'reserve',jsonb_build_object('layer',layer,'destination',yard,'reference','TRANSFER-KEEP','uom',each,'quantity',1)));
 PERFORM pg_temp.t11_stock(branch,'send',jsonb_build_object('reservation',reserve_a));
 policy_b:=pg_temp.t11_setup(branch_b,'propose',jsonb_build_object('domain','stock','owner',profile));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_setup(branch_b,'decide',jsonb_build_object('policy',policy_b,'decision','suspended'));
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t11_stock(branch,'cancel',jsonb_build_object('reservation',reserve_a));
 policy_b:=pg_temp.t11_setup(branch_b,'propose',jsonb_build_object('domain','stock','owner',profile));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_setup(branch_b,'decide',jsonb_build_object('policy',policy_b,'decision','accepted'));
 PERFORM pg_temp.t06_actor(1);
 IF (pg_temp.t11_layer(branch,layer)->>'reserved')::numeric<>1 OR (pg_temp.t11_layer(branch,layer)->>'on_hand')::numeric<>2 THEN
  RAISE EXCEPTION 'Cancelled in-transit reservation changed stock or another reserve'; END IF;
 PERFORM pg_temp.t11_stock(branch,'send',jsonb_build_object('reservation',reserve_b));
 BEGIN PERFORM pg_temp.t11_stock(branch,'complete',jsonb_build_object('reservation',reserve_b));
  RAISE EXCEPTION 'Transfer sender completed as receiver'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(9);
 BEGIN PERFORM pg_temp.t11_stock(branch,'complete',jsonb_build_object('reservation',reserve_b));
  RAISE EXCEPTION 'Destination-only actor bypassed source authority'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 transfer_move:=pg_temp.t11_id(pg_temp.t11_stock(branch,'complete',jsonb_build_object('reservation',reserve_b)),'movement');
 transfer_layer:=pg_temp.t11_id(public.t11_movement_receipt(transfer_move),'to_layer');
 IF pg_temp.t11_layer(branch_b,transfer_layer)->>'owner'<>'OWN' THEN RAISE EXCEPTION 'Cross-company custody changed legal owner'; END IF;
 PERFORM pg_temp.t06_actor(1);
 review:=pg_temp.t11_id(pg_temp.t11_stock(branch_b,'count',jsonb_build_object('layer',transfer_layer,
  'revision',pg_temp.t11_id(pg_temp.t11_layer(branch_b,transfer_layer),'revision'),'quantity',2,'uom',each)));
 PERFORM pg_temp.t06_actor(4);
 piece:=pg_temp.t11_id(pg_temp.t11_stock(branch_b,'decide',jsonb_build_object('review',review,'outcome','approved')),'movement');
 later_move:=pg_temp.t11_id(public.t11_movement_receipt(piece),'to_layer');
 PERFORM pg_temp.t06_actor(9);
 BEGIN PERFORM pg_temp.t11_stock(branch_b,'value',jsonb_build_object('layer',later_move,'currency','AED','unit_cost',10,'finance_ref','WRONG-OWNER'));
  RAISE EXCEPTION 'Custodian Finance valued third-party scoped stock'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(1);
 BEGIN PERFORM pg_temp.t11_stock(branch,'correction',jsonb_build_object('movement',transfer_move,'mode','reverse','uom',lit,'quantity',1));
  RAISE EXCEPTION 'Transfer correction accepted wrong UOM'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 review:=pg_temp.t11_id(pg_temp.t11_stock(branch,'correction',jsonb_build_object('movement',transfer_move,'mode','reverse','uom',each,'quantity',1)));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',review,'outcome','approved'));
 IF (pg_temp.t11_layer(branch_b,transfer_layer)->>'on_hand')::numeric<>0
  OR (pg_temp.t11_layer(branch_b,later_move)->>'on_hand')::numeric<>1 THEN
  RAISE EXCEPTION 'Transfer correction changed independently counted destination stock'; END IF;

 PERFORM pg_temp.t06_actor(1);
 payload:=jsonb_build_object('supplier',990001,'reference','PO-1001','line',1,'comparison','CMP-01','item',item,'owner',client_owner,'uom',each,'quantity',10);
 BEGIN PERFORM pg_temp.t11_buy(branch,'prepare',payload-'comparison');
  RAISE EXCEPTION 'Vendor comparison routing was bypassed'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 buy:=pg_temp.t11_id(pg_temp.t11_buy(branch,'prepare',payload));
 BEGIN PERFORM pg_temp.t11_buy(branch,'approve',jsonb_build_object('purchase',buy));
  RAISE EXCEPTION 'Buyer approved own commitment'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_buy(branch,'approve',jsonb_build_object('purchase',buy));
 PERFORM pg_temp.t06_actor(1);
 data:=jsonb_build_object('purchase',buy,'delivery_note','DN-01','lot','SUPPLIER-LOT','quantity',7,'accepted',4,'rejected',1,
  'quarantined',2,'bin',shelf,'quarantine_bin',quarantine,'uom',each,'reason','Synthetic partial delivery');
 response:=public.t11_purchase_command(receive_nonce,branch,'receive',data);
 rec:=pg_temp.t11_id(response); piece:=pg_temp.t11_id(response,'accepted_movement'); later_move:=pg_temp.t11_id(response,'quarantine_movement');
 IF public.t11_purchase_command(receive_nonce,branch,'receive',data) IS DISTINCT FROM response||'{"replayed":true}'::jsonb THEN
  RAISE EXCEPTION 'Partial goods receipt replay booked twice'; END IF;
 RESET ROLE;
 DELETE FROM public.role_permissions WHERE role_id=(SELECT id FROM public.roles WHERE role_code='t11_operator')
  AND permission_id=(SELECT id FROM public.permissions WHERE permission_code='supply.stock');
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 BEGIN PERFORM public.t11_purchase_command(receive_nonce,branch,'receive',data);
  RAISE EXCEPTION 'Receipt replay bypassed revoked quantity authority'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RESET ROLE;
 INSERT INTO public.role_permissions(role_id,permission_id) SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
 WHERE r.role_code='t11_operator' AND p.permission_code='supply.stock';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t11_buy(branch,'supplier-return',jsonb_build_object('receipt',rec,'movement',piece,'uom',each,'quantity',2,'reference','RTS-01'));
 BEGIN PERFORM pg_temp.t11_buy(branch,'receive',data||'{"delivery_note":"DN-OVER","quantity":4,"accepted":4,"rejected":0,"quarantined":0}');
  RAISE EXCEPTION 'Supplier return erased received order history and permitted overdelivery'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_buy(branch,'quarantine',jsonb_build_object('receipt',rec,'outcome','accepted','quantity',1,'uom',each,'bin',shelf));
 PERFORM pg_temp.t11_buy(branch,'quarantine',jsonb_build_object('receipt',rec,'outcome','rejected','quantity',1,'uom',each));
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t11_buy(branch,'supplier-return',jsonb_build_object('receipt',rec,'movement',later_move,'uom',each,'quantity',1,'reference','RTS-Q'));
 stats:=public.t11_supply_workspace(branch,'procurement');
 IF stats->'purchases'->0->>'delivered'<>'7.000' OR jsonb_array_length(stats->'receipts'->0->'returns')<>2 THEN
  RAISE EXCEPTION 'Purchasing partial receipt and physical return reconciliation failed: %',stats; END IF;
 IF public.t11_movement_receipt(piece)->>'owner'<>'CLIENT' OR public.t11_movement_receipt(piece)->>'valuation'<>'pending-finance' THEN
  RAISE EXCEPTION 'Goods owner or unknown cost boundary failed'; END IF;
 serial_buy:=pg_temp.t11_id(pg_temp.t11_buy(branch,'prepare',payload||jsonb_build_object('reference','PO-TRACE','item',serialitem,'quantity',1)));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_buy(branch,'approve',jsonb_build_object('purchase',serial_buy));
 PERFORM pg_temp.t06_actor(1);
 serial_rec:=pg_temp.t11_id(pg_temp.t11_buy(branch,'receive',jsonb_build_object('purchase',serial_buy,'delivery_note','DN-REJECTED',
  'serial','SERIAL-REJECTED','quantity',1,'accepted',0,'rejected',1,'quarantined',0,'uom',each)));
 IF public.t11_supply_workspace(branch,'procurement')->'receipts'->0->>'serial'<>'SERIAL-REJECTED'
  OR public.t11_supply_workspace(branch,'procurement')->'receipts'->0->>'accepted_movement' IS NOT NULL THEN
  RAISE EXCEPTION 'Rejected serial lost trace or booked stock'; END IF;

 response:=pg_temp.t11_stock(branch,'opening',jsonb_build_object('item',fuelitem,'owner',owner,'bin',tank,'uom',lit,'quantity',15));
 fuel_layer:=pg_temp.t11_id(response,'layer');
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',pg_temp.t11_id(response),'outcome','approved'));
 PERFORM pg_temp.t06_actor(1);
 data:=jsonb_build_object('reference','V-01','source','tank','source_ref','YARD-TANK-01','source_bin',tank,'source_item',fuelitem,
  'source_owner',owner,'occurred',pg_temp.t06_when(-8),'litres',3.750,'meter_unit','km','meter_value',512.125,'reason','Synthetic pump voucher',
  'evidence',pg_temp.t11_evidence(997101));
 response:=public.t11_fuel_command(pg_temp.t06_op(1110),980102,'record',data);
 fuel:=pg_temp.t11_id(response);
 external_fuel:=pg_temp.t11_id(public.t11_fuel_command(pg_temp.t06_op(1111),980102,'record',
  (data-ARRAY['source_bin','source_item','source_owner'])||jsonb_build_object('reference','V-EXT','source','station','source_ref','EXT-STATION',
  'supplier',990001,'evidence',pg_temp.t11_evidence(997102))));
 IF response->>'stock_movement' IS NOT NULL OR response->>'posted_cost' IS NOT NULL
  OR (pg_temp.t11_layer(branch,fuel_layer)->>'on_hand')::numeric<>15 THEN RAISE EXCEPTION 'Recording voucher changed stock or produced cost'; END IF;
 PERFORM pg_temp.t06_actor(4);
 PERFORM public.t11_fuel_command(pg_temp.t06_op(1112),980102,'verify',jsonb_build_object('voucher',fuel,'reason','Independent fuel check'));
 PERFORM public.t11_fuel_command(pg_temp.t06_op(1113),980102,'verify',jsonb_build_object('voucher',external_fuel,'reason','Independent station check'));
 PERFORM pg_temp.t06_actor(1);
 payload:=jsonb_build_object('fuel',fuel,'source_line','METER','item',fuelitem,'owner',owner,'uom',lit,'quantity',3.750);
 BEGIN PERFORM pg_temp.t11_stock(branch,'demand',payload||jsonb_build_object('fuel',external_fuel));
  RAISE EXCEPTION 'External station fuel created an own-stock demand'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 fuel_demand:=pg_temp.t11_id(pg_temp.t11_stock(branch,'demand',payload));
 response:=pg_temp.t11_stock(branch,'opening',jsonb_build_object('item',fuelitem,'owner',owner,'bin',shelf,'uom',lit,'quantity',15));
 stale:=pg_temp.t11_id(response,'layer');
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',pg_temp.t11_id(response),'outcome','approved'));
 PERFORM pg_temp.t06_actor(1);
 payload:=jsonb_build_object('layer',fuel_layer,'demand',fuel_demand,'reference','FUEL-ISSUE','uom',lit,'quantity',3.750);
 BEGIN PERFORM pg_temp.t11_stock(branch,'reserve',payload||jsonb_build_object('layer',stale));
  RAISE EXCEPTION 'Fuel voucher used wrong physical bin'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t11_stock(branch,'value',jsonb_build_object('layer',fuel_layer,'currency','AED','unit_cost',0.0001,'finance_ref','T11-FUEL-FIN'));
 PERFORM pg_temp.t06_actor(1);
 reserve_a:=pg_temp.t11_id(pg_temp.t11_stock(branch,'reserve',payload));
 first_move:=pg_temp.t11_id(pg_temp.t11_stock(branch,'complete',jsonb_build_object('reservation',reserve_a)),'movement');
 SELECT x INTO stats FROM jsonb_array_elements(public.t11_fuel_workspace(980102)->'vouchers') x WHERE (x->>'id')::bigint=fuel;
 IF (stats->>'booked_litres')::numeric<>3.750 OR stats->>'source_ref'<>'YARD-TANK-01'
  OR (pg_temp.t11_layer(branch,fuel_layer)->>'on_hand')::numeric<>11.250 THEN
  RAISE EXCEPTION 'Separate fuel issue did not book the exact physical source and quantity'; END IF;
 FOR step IN 1..3 LOOP
  PERFORM pg_temp.t06_actor(1);
  review:=pg_temp.t11_id(pg_temp.t11_stock(branch,'correction',jsonb_build_object('movement',first_move,'mode','reverse','uom',lit,'quantity',1.25)));
  PERFORM pg_temp.t06_actor(4);
  undo:=pg_temp.t11_id(pg_temp.t11_stock(branch,'decide',jsonb_build_object('review',review,'outcome','approved')),'movement');
  PERFORM pg_temp.t06_actor(5);
  round_total:=round_total+(public.t11_movement_receipt(undo)->>'amount')::numeric;
 END LOOP;
 IF round_total IS DISTINCT FROM (public.t11_movement_receipt(first_move)->>'amount')::numeric THEN
  RAISE EXCEPTION 'Partial reversals did not match the exact rounded original cost'; END IF;
 PERFORM pg_temp.t06_actor(1);
 SELECT x INTO stats FROM jsonb_array_elements(public.t11_fuel_workspace(980102)->'vouchers') x WHERE (x->>'id')::bigint=fuel;
 IF (stats->>'booked_litres')::numeric<>0 OR jsonb_array_length(stats->'issues')<>1 THEN
  RAISE EXCEPTION 'Fuel full reversal hid history or left net litres booked'; END IF;
END $$;

RESET ROLE;
SELECT 'PASS: T11 named owners, retained stock/count and repair costs, transfers/reversals, partial purchasing and manual fuel evidence boundaries';
ROLLBACK;
