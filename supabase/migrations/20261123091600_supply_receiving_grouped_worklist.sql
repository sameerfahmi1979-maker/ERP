BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $$
DECLARE
  predecessor oid:=to_regprocedure('public.fa03_supply_action_queue(bigint,text,text,integer,integer)');
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_language language ON language.oid=p.prolang
    WHERE p.oid=predecessor
      AND p.proowner='postgres'::regrole AND language.lanname='plpgsql'
      AND p.prokind='f' AND p.prorettype='jsonb'::regtype
      AND p.proargnames=ARRAY['p_branch','p_queue','p_search','p_page','p_page_size']
      AND p.pronargdefaults=0 AND NOT p.proretset AND NOT p.proisstrict AND NOT p.proleakproof
      AND p.provolatile='s' AND p.proparallel='u' AND p.prosecdef
      AND p.proconfig=ARRAY['search_path=""']
      AND p.proacl=ARRAY['postgres=X/postgres','authenticated=X/postgres']::aclitem[]
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
      AND encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')
        ='6ab41aeb21b88003e5196f1db1256dc786b26114f570a1b4d743ea578c4b4a50'
  ) THEN
    RAISE EXCEPTION 'Expected the reviewed FA03 Supply action queue predecessor' USING ERRCODE='55000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fa03_supply_action_queue(
 p_branch bigint,p_queue text,p_search text,p_page integer,p_page_size integer
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 company bigint;
 actor bigint:=public.current_user_profile_id();
 capability text;
 search_term text:=lower(btrim(coalesce(p_search,'')));
 skipped bigint;
 result jsonb;
BEGIN
 capability:=CASE p_queue WHEN 'receiving' THEN 'supply.purchase' WHEN 'stock-review' THEN 'supply.approve' END;
 IF p_branch IS NULL OR p_branch<1 OR capability IS NULL OR length(search_term)>120
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Choose a valid Supply queue, search or page' USING ERRCODE='22023';
 END IF;
 SELECT b.owner_company_id INTO company
 FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
 WHERE b.id=p_branch AND b.status='active' AND b.operating_status='active' AND c.status='active';
 IF company IS NULL OR actor IS NULL OR NOT erp_private.t02_has_scope(capability,company,p_branch) THEN RETURN NULL; END IF;

 -- The write commands still lock and validate the same routes and current
 -- state. The read checks both prerequisites without taking booking locks.
 IF EXISTS(
   SELECT 1 FROM unnest(CASE p_queue WHEN 'receiving' THEN ARRAY['stock','purchasing'] ELSE ARRAY['stock'] END) route(domain)
   LEFT JOIN LATERAL (
     SELECT p.decision,p.owner_profile FROM erp_private.t11_policies p
     WHERE p.company_id=company AND p.branch_id=p_branch AND p.domain=route.domain AND p.decided_at IS NOT NULL
     ORDER BY p.id DESC LIMIT 1
   ) policy ON true
   LEFT JOIN public.user_profiles owner ON owner.id=policy.owner_profile
   WHERE policy.decision IS DISTINCT FROM 'accepted' OR owner.status IS DISTINCT FROM 'active'
      OR owner.must_change_password IS DISTINCT FROM false
 ) THEN
   RETURN jsonb_build_object('queue',p_queue,'page',p_page,'pageSize',p_page_size,'totalCount',0,'rows','[]'::jsonb);
 END IF;

 skipped:=(p_page::bigint-1)*p_page_size;
 IF p_queue='receiving' THEN
   -- Restrict approved lines to the exact company and branch before looking up suppliers.
   WITH approved AS MATERIALIZED (
     SELECT line.id,line.reference||' / '||line.line_no AS label,
       item.code||' · '||item.name AS item,item.unit_id AS uom,line.quantity,line.supplier_id
     FROM erp_private.t11_purchase_lines line
     JOIN erp_private.t11_items item ON item.id=line.item_id AND item.company_id=company
     WHERE line.company_id=company AND line.branch_id=p_branch AND line.approved_at IS NOT NULL
   ), suppliers AS MATERIALIZED (
     SELECT vendor.id,
       CASE WHEN erp_private.t11_party(vendor.id,company,p_branch) THEN vendor.display_name END AS supplier
     FROM (SELECT DISTINCT supplier_id FROM approved) ids
     JOIN public.parties vendor ON vendor.id=ids.supplier_id
   ), search_matches AS MATERIALIZED (
     SELECT line.id,line.label,line.item,line.uom,line.quantity,vendor.supplier
     FROM approved line JOIN suppliers vendor ON vendor.id=line.supplier_id
     WHERE search_term='' OR strpos(lower(concat_ws(' ',line.id,line.label,line.item,vendor.supplier)),search_term)>0
   ), receipt_totals AS (
     SELECT receipt.purchase_id,sum(receipt.delivered) AS delivered
     FROM search_matches line
     JOIN erp_private.t11_goods_receipts receipt ON receipt.purchase_id=line.id
     GROUP BY receipt.purchase_id
   ), matched AS MATERIALIZED (
     SELECT line.id,line.label,line.item,line.uom,line.quantity,
       coalesce(receipt.delivered,0) AS delivered,
       line.quantity-coalesce(receipt.delivered,0) AS remaining,line.supplier
     FROM search_matches line LEFT JOIN receipt_totals receipt ON receipt.purchase_id=line.id
     WHERE line.quantity>coalesce(receipt.delivered,0)
   ), page_rows AS (
     SELECT * FROM matched ORDER BY id LIMIT p_page_size OFFSET skipped
   )
   SELECT jsonb_build_object('totalCount',(SELECT count(*) FROM matched),
     'rows',coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb)) INTO result FROM page_rows row;
 ELSE
   WITH matched AS MATERIALIZED (
     SELECT review.id,review.kind||' · '||review.reason AS label,review.kind,review.quantity,
       item.code||' · '||item.name AS item
     FROM erp_private.t11_reviews review
     JOIN erp_private.t11_layers layer ON layer.id=review.layer_id
     JOIN erp_private.t11_bins bin ON bin.id=layer.bin_id AND bin.company_id=company AND bin.branch_id=p_branch
     JOIN erp_private.t11_items item ON item.id=layer.item_id
     WHERE review.decided_at IS NULL AND review.proposed_by<>actor AND (
       search_term='' OR strpos(lower(concat_ws(' ',review.id,review.kind,review.reason,item.code,item.name)),search_term)>0
     )
   ), page_rows AS (
     SELECT * FROM matched ORDER BY id LIMIT p_page_size OFFSET skipped
   )
   SELECT jsonb_build_object('totalCount',(SELECT count(*) FROM matched),
     'rows',coalesce(jsonb_agg(to_jsonb(row) ORDER BY row.id),'[]'::jsonb)) INTO result FROM page_rows row;
 END IF;
 RETURN result||jsonb_build_object('queue',p_queue,'page',p_page,'pageSize',p_page_size);
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
