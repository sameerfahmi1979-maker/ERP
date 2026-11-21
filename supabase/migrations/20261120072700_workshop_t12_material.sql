BEGIN;

CREATE INDEX t12_material_purchase_demand ON erp_private.t11_purchase_lines(demand_id,id)
 WHERE demand_id IS NOT NULL;
CREATE INDEX t12_material_correction_original ON erp_private.t11_reviews(original_id,id)
 WHERE original_id IS NOT NULL;

CREATE FUNCTION public.t12_material_workspace(p_job bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE target record; in_inventory boolean; in_procurement boolean; can_request boolean; stock_route boolean;
 purchasing_route boolean; result jsonb;
BEGIN
 SELECT j.id,j.cycle,j.revision,a.company_id,a.branch_id,
  j.state IN('planned','in-progress') AND NOT EXISTS(
   SELECT 1 FROM erp_private.t10_job_cycles later WHERE later.assessment_id=j.assessment_id AND later.cycle>j.cycle
  ) AS active
 INTO target
 FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments a ON a.id=j.assessment_id
 WHERE j.id=p_job;
 IF NOT FOUND OR NOT (
    erp_private.t05_scope('workshop.jobs.manage',target.company_id,target.branch_id)
    OR erp_private.t05_scope('workshop.jobs.release',target.company_id,target.branch_id)
    OR erp_private.t05_scope('workshop.assess',target.company_id,target.branch_id)
 ) THEN RETURN NULL; END IF;

 in_inventory:=erp_private.t11_visible('inventory',target.company_id,target.branch_id);
 in_procurement:=erp_private.t11_visible('procurement',target.company_id,target.branch_id);
 can_request:=target.active AND erp_private.t05_scope('supply.request',target.company_id,target.branch_id);

 SELECT coalesce(bool_or(p.decision='accepted' AND u.status='active' AND NOT u.must_change_password)
    FILTER(WHERE p.domain='stock'),false),
   coalesce(bool_or(p.decision='accepted' AND u.status='active' AND NOT u.must_change_password)
    FILTER(WHERE p.domain='purchasing'),false)
 INTO stock_route,purchasing_route
 FROM (
  SELECT DISTINCT ON (rule.domain) rule.domain,rule.decision,rule.owner_profile
  FROM erp_private.t11_policies rule WHERE rule.company_id=target.company_id AND rule.branch_id=target.branch_id
   AND rule.decided_at IS NOT NULL ORDER BY rule.domain,rule.id DESC
 ) p JOIN public.user_profiles u ON u.id=p.owner_profile;

 WITH items AS MATERIALIZED (
  SELECT i.id,i.code||' · '||i.name AS label,i.unit_id
  FROM erp_private.t11_items i
  WHERE can_request AND i.kind='part' AND (i.company_id=target.company_id OR EXISTS(
   SELECT 1 FROM erp_private.t11_layers l JOIN erp_private.t11_bins b ON b.id=l.bin_id
   WHERE l.item_id=i.id AND b.company_id=target.company_id AND b.branch_id=target.branch_id))
 ),
 demands AS (
  SELECT d.id,d.source_line,d.source_revision,i.code||' · '||i.name AS label,o.code AS owner,u.code AS uom,d.created_at,
   d.quantity AS requested,coalesce(r.reserved,0) AS reserved,
   coalesce(m.issued,0) AS issued,coalesce(m.returned,0) AS returned,coalesce(m.reversed,0) AS reversed,
   d.quantity-coalesce(m.issued,0)+coalesce(m.returned,0)+coalesce(m.reversed,0) AS remaining,
   coalesce(r.rows,'[]') AS reservations,coalesce(m.rows,'[]') AS movements,
   coalesce(c.rows,'[]') AS corrections,coalesce(p.rows,'[]') AS purchases
  FROM erp_private.t11_demands d
  JOIN erp_private.t11_items i ON i.id=d.item_id
  JOIN erp_private.t11_units u ON u.id=i.unit_id
  JOIN erp_private.t11_owners o ON o.id=d.owner_id
  CROSS JOIN LATERAL (
   SELECT sum(res.quantity) FILTER(WHERE res.state='reserved') AS reserved,
    jsonb_agg(jsonb_build_object('id',res.id,'reference',res.reference,'state',res.state,
     'quantity',res.quantity,'at',res.opened_at) ORDER BY res.id) AS rows
   FROM erp_private.t11_reservations res WHERE res.demand_id=d.id
  ) r
  CROSS JOIN LATERAL (
   SELECT sum(event.quantity) FILTER(WHERE event.kind='issue') AS issued,
    sum(event.quantity) FILTER(WHERE event.kind='unused-return') AS returned,
    sum(event.quantity) FILTER(WHERE event.kind='reverse') AS reversed,
    jsonb_agg(jsonb_build_object('id',event.id,'kind',event.kind,'quantity',event.quantity,
      'at',event.occurred_at,'reference',event.linked_movement,
      'valuation',CASE WHEN event.verified_amount IS NULL THEN 'pending-finance' ELSE 'verified' END,
      'amount',CASE WHEN in_inventory AND erp_private.t05_scope('supply.value',o.company_id,o.branch_id) THEN event.verified_amount END,
      'currency',CASE WHEN in_inventory AND erp_private.t05_scope('supply.value',o.company_id,o.branch_id) THEN event.valuation_currency END
    ) ORDER BY event.id) AS rows
   FROM erp_private.t11_reservations res
   JOIN erp_private.t11_movements issue ON issue.reservation_id=res.id AND issue.kind='issue'
   CROSS JOIN LATERAL (
    SELECT issue.*
    UNION ALL
    SELECT change.* FROM erp_private.t11_movements change WHERE change.linked_movement=issue.id
     AND change.kind IN('unused-return','reverse')
   ) event
   WHERE res.demand_id=d.id
  ) m
  CROSS JOIN LATERAL (
   SELECT jsonb_agg(jsonb_build_object('id',review.id,'kind',review.kind,'original',issue.id,
    'state',coalesce(review.outcome,'pending'),'quantity',review.quantity,'movement',review.movement_id,
    'at',coalesce(review.decided_at,review.proposed_at)) ORDER BY review.id) AS rows
   FROM erp_private.t11_reservations res
   JOIN erp_private.t11_movements issue ON issue.reservation_id=res.id AND issue.kind='issue'
   JOIN erp_private.t11_reviews review ON review.original_id=issue.id AND review.kind IN('unused-return','reverse')
   WHERE res.demand_id=d.id
  ) c
  CROSS JOIN LATERAL (
   SELECT jsonb_agg(jsonb_build_object('id',purchase.id,'quantity',purchase.quantity,'approved_at',purchase.approved_at,
    'reference',CASE WHEN in_procurement THEN purchase.reference||' / '||purchase.line_no END,
    'supplier',CASE WHEN in_procurement AND erp_private.t11_party(supplier.id,purchase.company_id,purchase.branch_id)
      THEN supplier.display_name END,'receipts',coalesce(rc.rows,'[]')) ORDER BY purchase.id) AS rows
   FROM erp_private.t11_purchase_lines purchase
   JOIN public.parties supplier ON supplier.id=purchase.supplier_id
   CROSS JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',receipt.id,'received_at',receipt.received_at,
     'label',CASE WHEN in_procurement THEN receipt.delivery_note END,
     'delivered',receipt.delivered,'accepted',receipt.accepted,'rejected',receipt.rejected,'quarantined',receipt.quarantined,
     'accepted_movement',receipt.accepted_movement,'quarantine_movement',receipt.quarantine_movement,
     'inspections',coalesce((SELECT jsonb_agg(jsonb_build_object('id',decision.id,'outcome',decision.outcome,
       'quantity',decision.quantity,'movement',decision.movement_id,'at',decision.decided_at) ORDER BY decision.id)
      FROM erp_private.t11_quarantine_decisions decision WHERE decision.receipt_id=receipt.id),'[]'),
     'returns',coalesce((SELECT jsonb_agg(jsonb_build_object('id',returned.id,'quantity',movement.quantity,
       'reference',CASE WHEN in_procurement THEN returned.reference END,'original',returned.original_id,
       'movement',movement.id,'at',returned.returned_at) ORDER BY returned.id)
      FROM erp_private.t11_supplier_returns returned JOIN erp_private.t11_movements movement ON movement.id=returned.movement_id
      WHERE returned.receipt_id=receipt.id),'[]')
    ) ORDER BY receipt.id) AS rows FROM erp_private.t11_goods_receipts receipt WHERE receipt.purchase_id=purchase.id
   ) rc
   WHERE purchase.demand_id=d.id AND (purchase.company_id,purchase.branch_id)=(d.company_id,d.branch_id)
  ) p
  WHERE d.job_id=target.id AND (d.company_id,d.branch_id)=(target.company_id,target.branch_id)
 )
 SELECT jsonb_build_object('job',target.id,'branch',target.branch_id,'cycle',target.cycle,'revision',target.revision,
  'active',target.active,'can_request',can_request,'inventory',in_inventory,'procurement',in_procurement,
  'stock_route',stock_route,'purchasing_route',purchasing_route,
  'items',(SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.label,item.id),'[]') FROM items item),
  'units',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'label',u.code) ORDER BY u.code,u.id),'[]')
   FROM erp_private.t11_units u WHERE EXISTS(SELECT 1 FROM items i WHERE i.unit_id=u.id)),
  'owners',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.code) ORDER BY o.code,o.id),'[]')
   FROM erp_private.t11_owners o WHERE can_request AND (
    (o.company_id,o.branch_id)=(target.company_id,target.branch_id) OR EXISTS(
     SELECT 1 FROM erp_private.t11_layers l JOIN erp_private.t11_bins b ON b.id=l.bin_id JOIN items i ON i.id=l.item_id
     WHERE l.owner_id=o.id AND (b.company_id,b.branch_id)=(target.company_id,target.branch_id)))),
  'demands',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]') FROM demands d)
 ) INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.t12_material_workspace(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t12_material_workspace(bigint) TO authenticated;
NOTIFY pgrst,'reload schema';

COMMIT;
