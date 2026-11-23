BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- F07 writes the explicit replacement version and expiry in the renewal row.
-- Recheck that evidence at commit for this supervised predecessor only.
CREATE FUNCTION erp_private.dms_br1_labour_card_renewal_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  predecessor public.dms_documents;
  replacement public.dms_documents;
  completion public.dms_renewal_requests;
  evidence erp_private.mobile_dms_renewal_context;
  officer bigint;
  subject jsonb;
  subject_authority jsonb;
  has_exact_version boolean;
  has_exact_original boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'renewed' THEN RETURN NULL; END IF;

  -- Use F07's document lock order. The existing version, file, and link
  -- write guards serialize changes to evidence through these same parents.
  PERFORM d.id FROM public.dms_documents d
   WHERE d.id IN (NEW.document_id, NEW.replacement_document_id)
   ORDER BY d.id FOR UPDATE;

  SELECT * INTO predecessor FROM public.dms_documents WHERE id = NEW.document_id;
  IF NOT FOUND OR predecessor.deleted_at IS NOT NULL
    OR (predecessor.document_no, predecessor.owning_company_id, predecessor.owning_branch_id, predecessor.document_type_id)
      IS DISTINCT FROM ('DMS-2026-000127'::text, 1::bigint, 1::bigint, 16::bigint) THEN
    RAISE EXCEPTION 'Renewal predecessor changed' USING ERRCODE = 'PT409';
  END IF;

  -- Compare the final request to the completion that queued this check.
  SELECT * INTO completion FROM public.dms_renewal_requests r WHERE r.id = NEW.id AND r.document_id = predecessor.id
    AND r.status = 'renewed' AND r.deleted_at IS NULL
    AND r.replacement_document_id IS NOT DISTINCT FROM NEW.replacement_document_id
    AND r.replacement_version_id IS NOT DISTINCT FROM NEW.replacement_version_id
    AND r.new_expiry_date IS NOT DISTINCT FROM NEW.new_expiry_date;
  IF NOT FOUND THEN RAISE EXCEPTION 'Renewal changed before commit' USING ERRCODE = 'PT409'; END IF;

  SELECT * INTO replacement FROM public.dms_documents
   WHERE id = NEW.replacement_document_id AND id <> predecessor.id AND deleted_at IS NULL
     AND owning_company_id = 1 AND owning_branch_id = 1 AND document_type_id = 16;
  IF NOT FOUND OR NEW.replacement_version_id IS NULL
    OR NEW.replacement_version_id IS DISTINCT FROM replacement.current_version_id THEN
    RAISE EXCEPTION 'Explicit current replacement version required' USING ERRCODE = 'PT409';
  END IF;

  SELECT count(*) = 1 AND min(v.id) = NEW.replacement_version_id
    INTO has_exact_version FROM public.dms_document_versions v
   WHERE v.document_id = replacement.id AND v.is_current AND v.unlinked_at IS NULL;
  SELECT count(*) = 1 AND bool_and(f.file_size_bytes > 0 AND f.sha256_hash ~ '^[0-9A-Fa-f]{64}$')
    INTO has_exact_original FROM public.dms_document_files f
   WHERE f.document_id = replacement.id AND f.version_id = NEW.replacement_version_id
     AND f.file_role = 'original' AND f.deleted_at IS NULL;
  IF has_exact_version IS DISTINCT FROM true OR has_exact_original IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Current replacement original evidence is missing or ambiguous' USING ERRCODE = 'PT409';
  END IF;

  IF predecessor.expiry_date IS NULL OR replacement.expiry_date IS NULL
    OR NOT isfinite(predecessor.expiry_date) OR NOT isfinite(replacement.expiry_date)
    OR replacement.expiry_date <= predecessor.expiry_date THEN
    RAISE EXCEPTION 'Replacement expiry must be later than the predecessor expiry' USING ERRCODE = '22023';
  END IF;
  IF NEW.new_expiry_date IS DISTINCT FROM replacement.expiry_date THEN
    RAISE EXCEPTION 'Replacement expiry changed before commit' USING ERRCODE = 'PT409';
  END IF;

  IF predecessor.status IS DISTINCT FROM 'superseded' OR predecessor.is_archived IS DISTINCT FROM true
    OR predecessor.superseded_by_document_id IS DISTINCT FROM replacement.id
    OR replacement.status NOT IN ('active','approved') OR replacement.approval_status IS DISTINCT FROM 'approved'
    OR erp_private.mobile_dms_accepted(replacement) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Renewal or replacement approval changed before commit' USING ERRCODE = 'PT409';
  END IF;

  SELECT * INTO evidence FROM erp_private.mobile_dms_renewal_context c WHERE c.request_id = completion.id;
  IF NOT FOUND OR evidence.parent_type IS DISTINCT FROM 'employee'
    OR evidence.source_version IS DISTINCT FROM predecessor.current_version_id
    OR evidence.submitted_doc IS DISTINCT FROM replacement.id
    OR evidence.submitted_version IS DISTINCT FROM NEW.replacement_version_id
    OR evidence.evidence_submitter IS NULL OR evidence.submitted_hash IS NULL THEN
    RAISE EXCEPTION 'Reviewed replacement evidence is required' USING ERRCODE = 'PT409';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id = predecessor.id
                 AND l.entity_type = evidence.parent_type AND l.entity_id = evidence.parent_id AND l.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.dms_document_links l
      WHERE l.document_id IN (predecessor.id, replacement.id) AND l.deleted_at IS NULL
      GROUP BY l.entity_type, l.entity_id HAVING count(DISTINCT l.document_id) <> 2) THEN
    RAISE EXCEPTION 'Renewal subject changed before commit' USING ERRCODE = 'PT409';
  END IF;

  officer := erp_private.mobile_dms_actor();
  subject := jsonb_build_object('entityType', evidence.parent_type, 'entityId', evidence.parent_id);
  subject_authority := erp_private.mobile_dms_parent(subject);
  IF officer IS DISTINCT FROM completion.assigned_to OR officer IS DISTINCT FROM completion.updated_by
    OR completion.requested_by IS NULL OR officer = completion.requested_by OR officer = evidence.evidence_submitter
    OR subject_authority @> '{"company":1,"branch":1,"canManage":true}'::jsonb IS DISTINCT FROM true
    OR erp_private.mobile_dms_can(predecessor.id, 'dms.renewals.manage') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Independent renewal officer required' USING ERRCODE = '42501';
  END IF;

  -- A settled fulfilment and its F07 receipt are written in one transaction.
  -- A prior Mobile receipt cannot authorize a fresh F07-only completion.
  PERFORM 1 FROM erp_private.mobile_dms_receipts mr
    JOIN erp_private.f07_renewal_receipts fr
      ON fr.request_id = completion.id AND fr.actor_id = mr.actor AND fr.xmin = mr.xmin
   WHERE mr.actor = officer AND mr.command = 'request/act/renewal' AND mr.state = 'settled'
     AND mr.result->>'operationId' = mr.operation::text
     AND mr.result @> jsonb_build_object('request', jsonb_build_object(
       'id', completion.id, 'kind', 'renewal', 'parent', subject, 'assigneeId', officer,
       'sourceDocumentId', predecessor.id, 'sourceVersionId', evidence.source_version,
       'documentTypeId', 16, 'status', 'fulfilled', 'canonicalStatus', 'renewed',
       'revision', completion.workspace_revision, 'submittedDocumentId', replacement.id,
       'submittedVersionId', NEW.replacement_version_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'Settled officer fulfilment is required' USING ERRCODE = 'PT409'; END IF;

  -- Use the native source fingerprint to detect a same-version file change
  -- after officer review. The source helper also rechecks preview authority.
  PERFORM erp_private.mobile_dms_source(jsonb_build_object(
    'documentId', replacement.id, 'versionId', NEW.replacement_version_id, 'sourceHash', evidence.submitted_hash
  ), ARRAY['dms.documents.preview']);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.dms_br1_labour_card_renewal_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER dms_br1_labour_card_renewal_guard
  AFTER INSERT OR UPDATE OF status ON public.dms_renewal_requests
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.document_id = 127 AND NEW.status = 'renewed')
  EXECUTE FUNCTION erp_private.dms_br1_labour_card_renewal_guard();

COMMIT;
