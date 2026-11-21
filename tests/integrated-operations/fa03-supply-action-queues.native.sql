-- Runs before rollback of the T07 and T11 isolated Supply fixtures.
RESET ROLE;
DO $$
DECLARE
 branch constant bigint:=920011;
 buyer bigint; reviewer bigint; seed erp_private.t11_purchase_lines; layer erp_private.t11_layers;
 old_purchase bigint; old_review bigint; receipt_count bigint;
 receiving jsonb; reviews jsonb; purchase_omitted boolean; review_omitted boolean;
 first_page jsonb; second_page jsonb; masked jsonb; receipt jsonb; payload jsonb;
 has_queues boolean:=to_regprocedure('public.fa03_supply_action_queue(bigint,text,text,integer,integer)') IS NOT NULL;
 nonce constant uuid:='fa030000-0000-4000-8000-000000000001';
BEGIN
 IF current_database()<>'fa03_supply_native'
   OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119'
 THEN RAISE EXCEPTION 'Guarded FA03 clone required'; END IF;
 SELECT * INTO STRICT seed FROM erp_private.t11_purchase_lines WHERE reference='PO-TRACE';
 SELECT id INTO STRICT buyer FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000001';
 SELECT id INTO STRICT reviewer FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000004';
 INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
 SELECT person.id,role.id,assignment.company,assignment.branch,true
 FROM (VALUES (6,920001,920012),(9,920002,920021)) assignment(actor,company,branch)
 JOIN public.user_profiles person
   ON person.auth_user_id=('98000000-0000-4000-8000-'||lpad(assignment.actor::text,12,'0'))::uuid
 JOIN public.roles role ON role.role_code IN('t11_review','t11_buyer');
 SELECT l.* INTO STRICT layer FROM erp_private.t11_layers l JOIN erp_private.t11_bins b ON b.id=l.bin_id
 WHERE b.branch_id=branch AND b.kind='available' AND l.count_root IS NULL ORDER BY l.id LIMIT 1;
 INSERT INTO erp_private.t11_purchase_lines
    (company_id,branch_id,supplier_id,item_id,owner_id,reference,line_no,quantity,comparison_ref,prepared_by,approved_by,approved_at,reason)
 VALUES (seed.company_id,branch,seed.supplier_id,seed.item_id,seed.owner_id,'FA03-OLDER-OPEN',1,1,seed.comparison_ref,
   buyer,reviewer,clock_timestamp(),'Older approved unreceived line') RETURNING id INTO old_purchase;
 INSERT INTO erp_private.t11_reviews(kind,layer_id,expected_revision,quantity,proposed_by,reason)
 VALUES ('count',layer.id,layer.revision,layer.on_hand,buyer,'FA03 older undecided stock count') RETURNING id INTO old_review;
 INSERT INTO erp_private.t11_reviews(kind,layer_id,expected_revision,quantity,proposed_by,reason)
 VALUES ('count',layer.id,layer.revision,layer.on_hand,reviewer,'FA03 own count cannot be decided');
 INSERT INTO erp_private.t11_reviews(kind,layer_id,expected_revision,quantity,proposed_by,reason)
 SELECT 'count',layer.id,layer.revision,layer.on_hand,buyer,'FA03 pending page probe '||n
 FROM generate_series(1,26) n;
 INSERT INTO erp_private.t11_purchase_lines
    (company_id,branch_id,supplier_id,item_id,owner_id,reference,line_no,quantity,comparison_ref,prepared_by,reason)
 SELECT seed.company_id,branch,seed.supplier_id,seed.item_id,seed.owner_id,'FA03-NEW-DRAFT-'||n,1,1,
   seed.comparison_ref,buyer,'Newer prepared purchase' FROM generate_series(1,100) n;
 INSERT INTO erp_private.t11_reviews(kind,layer_id,expected_revision,quantity,proposed_by,reason,outcome,decided_by,decided_at)
 SELECT 'count',layer.id,layer.revision,layer.on_hand,buyer,'FA03 newer decided count '||n,'rejected',reviewer,clock_timestamp()
 FROM generate_series(1,100) n;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 receiving:=public.t11_supply_workspace(branch,'procurement')->'purchases';
 purchase_omitted:=jsonb_array_length(receiving)=100 AND NOT receiving @> jsonb_build_array(jsonb_build_object('id',old_purchase));
 PERFORM pg_temp.t06_actor(4);
 reviews:=public.t11_supply_workspace(branch,'inventory')->'reviews';
 review_omitted:=jsonb_array_length(reviews)=100 AND NOT reviews @> jsonb_build_array(jsonb_build_object('id',old_review));
 IF NOT (purchase_omitted AND review_omitted) THEN
   RAISE EXCEPTION 'Expected history to remain independent of the older actionable rows';
 END IF;
 RAISE NOTICE 'FA03 legacy window omits both older rows: purchase %, stock review %',old_purchase,old_review;
 IF NOT has_queues THEN
   RAISE EXCEPTION 'FA03 action forms sourced from history cannot select either older actionable record';
 END IF;

 IF has_function_privilege('anon','public.fa03_supply_action_queue(bigint,text,text,integer,integer)','EXECUTE')
    OR has_function_privilege('service_role','public.fa03_supply_action_queue(bigint,text,text,integer,integer)','EXECUTE') THEN
   RAISE EXCEPTION 'Action queue execution escaped the authenticated actor boundary';
 END IF;
 reviews:=public.fa03_supply_action_queue(branch,'stock-review',' older UNDECIDED ',1,25);
 IF reviews->>'totalCount' IS DISTINCT FROM '1' OR NOT reviews->'rows' @> jsonb_build_array(jsonb_build_object('id',old_review))
    OR reviews::text~* '(verified_amount|valuation_currency|finance_ref|bank_account)' THEN
   RAISE EXCEPTION 'Scoped independent reviewer lost the older pending count or saw restricted fields: %',reviews;
 END IF;
 IF public.fa03_supply_action_queue(branch,'stock-review','own count',1,25)->>'totalCount' IS DISTINCT FROM '0' THEN
   RAISE EXCEPTION 'A reviewer could see their own submission as eligible';
 END IF;
 first_page:=public.fa03_supply_action_queue(branch,'stock-review','pending page probe',1,25);
 second_page:=public.fa03_supply_action_queue(branch,'stock-review','pending page probe',2,25);
 IF first_page->>'totalCount' IS DISTINCT FROM '26' OR second_page->>'totalCount' IS DISTINCT FROM '26'
    OR jsonb_array_length(first_page->'rows')<>25 OR jsonb_array_length(second_page->'rows')<>1
    OR (first_page#>>'{rows,24,id}')::bigint >= (second_page#>>'{rows,0,id}')::bigint THEN
   RAISE EXCEPTION 'Stock review paging or counts did not match eligible records';
 END IF;
 IF public.fa03_supply_action_queue(branch,'receiving','',1,25) IS NOT NULL THEN
   RAISE EXCEPTION 'Approval-only actor obtained receiving entries or counts';
 END IF;
 PERFORM pg_temp.t06_actor(1);
 IF public.fa03_supply_action_queue(branch,'stock-review','',1,25) IS NOT NULL THEN
   RAISE EXCEPTION 'Stock submitter obtained independent decision rows or counts';
 END IF;
 receiving:=public.fa03_supply_action_queue(branch,'receiving',' older-open ',1,25);
 IF receiving->>'totalCount' IS DISTINCT FROM '1' OR NOT receiving->'rows' @> jsonb_build_array(jsonb_build_object('id',old_purchase))
 THEN RAISE EXCEPTION 'Receiving did not recover the older approved unreceived line: %',receiving; END IF;
 first_page:=public.fa03_supply_action_queue(branch,'receiving','',1,1);
 second_page:=public.fa03_supply_action_queue(branch,'receiving','',2,1);
 IF first_page->>'totalCount' IS DISTINCT FROM '2' OR second_page->>'totalCount' IS DISTINCT FROM '2'
    OR jsonb_array_length(first_page->'rows')<>1 OR jsonb_array_length(second_page->'rows')<>1
    OR (first_page#>>'{rows,0,id}')::bigint >= (second_page#>>'{rows,0,id}')::bigint
    OR (second_page#>>'{rows,0,id}')::bigint IS DISTINCT FROM old_purchase
 THEN RAISE EXCEPTION 'Eligible counts or ordered paging failed: %, %',first_page,second_page; END IF;
 PERFORM pg_temp.t06_actor(7);
 masked:=public.fa03_supply_action_queue(branch,'receiving','FA03-OLDER-OPEN',1,25);
 IF masked->>'totalCount' IS DISTINCT FROM '1' OR masked#>>'{rows,0,supplier}' IS NOT NULL
    OR public.fa03_supply_action_queue(branch,'receiving','Synthetic Fleet customer',1,25)->>'totalCount' IS DISTINCT FROM '0'
    OR masked::text~* '(unit_cost|finance_ref|verification_amount|bank_account|supplier_id|comparison_ref)' THEN
   RAISE EXCEPTION 'Restricted vendor or financial data affected rows or search count: %',masked;
 END IF;
 PERFORM pg_temp.t06_actor(6);
 IF public.fa03_supply_action_queue(branch,'receiving','',1,25) IS NOT NULL
   OR public.fa03_supply_action_queue(branch,'stock-review','',1,25) IS NOT NULL
   OR public.fa03_supply_action_queue(920012,'receiving','',1,25) IS NULL
   OR public.fa03_supply_action_queue(920012,'stock-review','',1,25) IS NULL
 THEN RAISE EXCEPTION 'Sibling scope widened or lost its own read'; END IF;
 PERFORM pg_temp.t06_actor(9);
 IF public.fa03_supply_action_queue(branch,'receiving','',1,25) IS NOT NULL
   OR public.fa03_supply_action_queue(branch,'stock-review','',1,25) IS NOT NULL
   OR public.fa03_supply_action_queue(920021,'receiving','',1,25) IS NULL
   OR public.fa03_supply_action_queue(920021,'stock-review','',1,25) IS NULL
 THEN RAISE EXCEPTION 'Other company scope widened or lost its own read'; END IF;
 PERFORM pg_temp.t06_actor(8);
 IF public.fa03_supply_action_queue(branch,'receiving','',1,25) IS NOT NULL
   OR public.fa03_supply_action_queue(branch,'stock-review','',1,25) IS NOT NULL THEN RAISE EXCEPTION 'Global admin gained held actions'; END IF;
 PERFORM pg_temp.t06_actor(1);
 BEGIN
   PERFORM public.fa03_supply_action_queue(branch,'receiving','',0,25);
   RAISE EXCEPTION 'Invalid page accepted';
 EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
 END;
 payload:=jsonb_build_object('purchase',old_purchase,'delivery_note','FA03-RECEIPT','serial','FA03-SERIAL',
   'quantity',1,'accepted',0,'rejected',1,'quarantined',0,'uom',(receiving#>>'{rows,0,uom}')::bigint,'reason','Verify exact receipt retry');
 receipt:=public.t11_purchase_command(nonce,branch,'receive',payload);
 IF public.t11_purchase_command(nonce,branch,'receive',payload) IS DISTINCT FROM receipt||'{"replayed":true}'::jsonb THEN
   RAISE EXCEPTION 'Exact receive retry changed its original receipt'; END IF;
 RESET ROLE;
 SELECT count(*) INTO receipt_count FROM erp_private.t11_goods_receipts WHERE purchase_id=old_purchase;
 IF receipt_count<>1 THEN RAISE EXCEPTION 'Exact action registered % receipts',receipt_count; END IF;
 RAISE NOTICE 'FA03 older order %, old review %, filtered receiving total %, exact receipt % replayed once',
   old_purchase,old_review,second_page->>'totalCount',receipt->>'id';
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$
BEGIN
 IF public.fa03_supply_action_queue(920011,'receiving','FA03-OLDER-OPEN',1,25)->>'totalCount' IS DISTINCT FROM '0'
 THEN RAISE EXCEPTION 'A fully received order remained actionable in a fresh statement'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS: FA03 actionable Supply search, paging, counts, scope, masking, and one receive receipt';
