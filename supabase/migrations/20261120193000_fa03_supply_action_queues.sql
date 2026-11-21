BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE INDEX t11_open_receiving_branch ON erp_private.t11_purchase_lines(company_id,branch_id,id)
 WHERE approved_at IS NOT NULL;
CREATE INDEX t11_undecided_stock_review ON erp_private.t11_reviews(layer_id,id)
 WHERE decided_at IS NULL;

CREATE FUNCTION public.fa03_supply_action_queue(
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
   WITH eligible AS (
     SELECT line.id,line.reference||' / '||line.line_no AS label,item.code||' · '||item.name AS item,item.unit_id AS uom,
       line.quantity,placed.delivered,line.quantity-placed.delivered AS remaining,
       CASE WHEN erp_private.t11_party(vendor.id,company,p_branch) THEN vendor.display_name END AS supplier
     FROM erp_private.t11_purchase_lines line
     JOIN erp_private.t11_items item ON item.id=line.item_id AND item.company_id=company
     JOIN public.parties vendor ON vendor.id=line.supplier_id
     CROSS JOIN LATERAL (
       SELECT coalesce(sum(r.delivered),0) AS delivered FROM erp_private.t11_goods_receipts r WHERE r.purchase_id=line.id
     ) placed
     WHERE line.company_id=company AND line.branch_id=p_branch AND line.approved_at IS NOT NULL
       AND line.quantity>placed.delivered
   ), matched AS MATERIALIZED (
     SELECT * FROM eligible
     WHERE search_term='' OR strpos(lower(concat_ws(' ',id,label,item,supplier)),search_term)>0
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

REVOKE ALL ON FUNCTION public.fa03_supply_action_queue(bigint,text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fa03_supply_action_queue(bigint,text,text,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
