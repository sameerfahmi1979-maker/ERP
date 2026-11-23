BEGIN;

CREATE OR REPLACE FUNCTION erp_private.t16_create_issue(
  p_company bigint, p_branch bigint, p_actor bigint, p_review uuid, p_version uuid, p_digest text
)
RETURNS erp_private.t16_batches LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
  batch erp_private.t16_batches;
  previous erp_private.t16_batches;
  review erp_private.t15_reviews;
  anchor erp_private.t14_runs;
  routes jsonb;
BEGIN
  SELECT r.* INTO anchor FROM erp_private.t15_reviews h JOIN erp_private.t14_runs r ON r.id=h.run_id
  WHERE h.id=p_review AND r.company_id=p_company AND r.branch_id=p_branch;
  IF NOT FOUND THEN RAISE EXCEPTION 'The exact payroll approval is unavailable in this scope' USING ERRCODE='42501'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||anchor.company_id,0));
  SELECT * INTO review FROM erp_private.t15_reviews WHERE id=p_review FOR UPDATE;
  IF review.version_id IS DISTINCT FROM p_version OR review.digest IS DISTINCT FROM p_digest OR review.state<>'approved' THEN
    RAISE EXCEPTION 'Issue requires the exact GM-approved payroll version' USING ERRCODE='PT409';
  END IF;

  SELECT * INTO batch FROM erp_private.t16_batches WHERE review_id=p_review;
  IF FOUND THEN RETURN batch; END IF;

  -- Keep the run and sources locked before WPS routing, preserving their lock order.
  -- The prepared bank event below performs the full source and reservation seal
  -- once, after rendering and before any result can commit.
  PERFORM 1 FROM erp_private.t14_runs WHERE id=anchor.id FOR UPDATE;
  IF review.replacement_requested_by IS NOT NULL
    OR erp_private.t15_bank_state(p_review) NOT IN('not-issued','prepared') THEN
    RAISE EXCEPTION 'The exact approval is unavailable for a regular issue' USING ERRCODE='PT409';
  END IF;
  PERFORM erp_private.t15_lock_sources(p_version);
  PERFORM erp_private.t15_claim_lock();

  SELECT b.* INTO previous FROM erp_private.t16_batches b JOIN erp_private.t15_reviews h ON h.id=b.review_id
  WHERE h.run_id=anchor.id AND h.state='superseded' ORDER BY b.issued_at DESC,b.id DESC LIMIT 1;
  IF previous.id IS NOT NULL AND erp_private.t16_batch_state(previous.id) NOT IN('prepared','rejected','cancelled') THEN
    RAISE EXCEPTION 'A bank handoff already exists for this payroll scope and month' USING ERRCODE='PT409';
  END IF;

  batch.version_id:=p_version;
  batch.company_id:=p_company;
  batch.branch_id:=p_branch;
  batch.month:=anchor.month;
  routes:=erp_private.t16_routes(batch);
  INSERT INTO erp_private.t16_batches(review_id,version_id,company_id,branch_id,month,digest,issued_by,replaces_batch_id)
  VALUES(p_review,p_version,p_company,p_branch,anchor.month,p_digest,p_actor,previous.id)
  RETURNING * INTO batch;
  PERFORM erp_private.t16_render_files(batch,routes);
  PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),p_review,p_version,p_digest,'prepared',batch.id,'Original payroll output retained');
  RETURN batch;
END $$;

COMMIT;
