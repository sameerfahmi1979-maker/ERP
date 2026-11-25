BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- An operator enables specific destinations on the existing source policy.
-- A retained job keeps its source policy identity and its independently bound intake owner.
ALTER TABLE erp_private.agent_pdf_policy
  ADD COLUMN employer_company_ids bigint[] NOT NULL DEFAULT '{}'
  CHECK (array_position(employer_company_ids, NULL) IS NULL);
ALTER TABLE erp_private.agent_pdf_work
  ADD COLUMN employer_company_id bigint REFERENCES public.owner_companies(id),
  ADD CONSTRAINT agent_pdf_employer_hash_required CHECK (employer_company_id IS NULL OR sha256 IS NOT NULL);

CREATE FUNCTION erp_private.agent_employer_actor_can_use(
  p_actor bigint, p_company bigint, p_permissions text[], p_allow_global boolean
) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles u
    JOIN auth.users a ON a.id=u.auth_user_id AND a.deleted_at IS NULL
      AND (a.banned_until IS NULL OR a.banned_until <= statement_timestamp())
    WHERE u.id=p_actor AND u.status='active' AND NOT u.must_change_password
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_permissions) AS code(permission_code)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.roles r ON r.id=ur.role_id AND r.is_active
          LEFT JOIN public.role_permissions rp ON rp.role_id=r.id
          LEFT JOIN public.permissions p ON p.id=rp.permission_id AND p.is_active
          WHERE ur.user_profile_id=u.id AND ur.is_active AND ur.branch_id IS NULL
            AND ((ur.owner_company_id=p_company AND p.permission_code=code.permission_code)
              OR (p_allow_global AND ur.owner_company_id IS NULL
                AND (r.role_code IN ('system_admin','group_admin') OR p.permission_code=code.permission_code)))
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION erp_private.agent_employer_actor_can_use(bigint,bigint,text[],boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.agent_employer_destination_allowed(p_policy erp_private.agent_pdf_policy, p_company bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT p_company=ANY(p_policy.employer_company_ids)
    AND EXISTS (SELECT 1 FROM public.owner_companies c WHERE c.id=p_company AND c.status='active')
    AND erp_private.agent_employer_actor_can_use(p_policy.actor_id,p_company,
      ARRAY['dms.documents.upload','dms.documents.preview','dms.documents.review_ai'],false)
    AND erp_private.agent_employer_actor_can_use(p_policy.officer_id,p_company,
      ARRAY['dms.documents.preview','dms.documents.review_ai'],true);
$$;
REVOKE ALL ON FUNCTION erp_private.agent_employer_destination_allowed(erp_private.agent_pdf_policy,bigint)
  FROM PUBLIC, anon, authenticated, service_role;

-- The internal ERP endpoint supplies the printed name from the verified PDF
-- bytes. Neither callers nor workers can set a destination by company ID.
CREATE FUNCTION public.dms_route_sharepoint_employer(
  p_operation uuid, p_lease uuid, p_user uuid, p_hash text, p_bytes bigint, p_kind text, p_company_name text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  policy erp_private.agent_pdf_policy%ROWTYPE;
  work erp_private.agent_pdf_work%ROWTYPE;
  matches bigint[];
  target bigint;
  name_key text;
  hold_reason text;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 3145728
    OR p_kind IS NULL OR p_kind NOT IN ('inspect','employer','unresolved','not_applicable') THEN
    RAISE EXCEPTION 'Invalid routing evidence' USING ERRCODE='22023';
  END IF;

  SELECT p.* INTO policy FROM erp_private.agent_pdf_work w
    JOIN erp_private.agent_pdf_policy p ON p.connection_id=w.connection_id
    JOIN erp_private.agent_sync_checkpoints s ON s.connection_id=w.connection_id
    JOIN public.user_profiles u ON u.id=p.actor_id AND u.auth_user_id=p_user
    WHERE w.operation_id=p_operation AND p.enabled AND NOT s.paused
      AND cardinality(p.employer_company_ids)>0
    FOR SHARE OF p,s;
  IF NOT FOUND OR NOT erp_private.agent_employer_actor_can_use(policy.actor_id,policy.company_id,
    ARRAY['dms.documents.upload','dms.documents.preview','dms.documents.review_ai'],false) THEN
    RAISE EXCEPTION 'Routing unavailable for this intake account' USING ERRCODE='42501';
  END IF;

  SELECT * INTO work FROM erp_private.agent_pdf_work w
    WHERE w.connection_id=policy.connection_id AND w.operation_id=p_operation AND w.actor_id=policy.actor_id
      AND w.company_id=policy.company_id AND w.status='retry' AND w.lease_token=p_lease
      AND w.lease_until>clock_timestamp()
    FOR UPDATE;
  IF NOT FOUND OR (work.sha256 IS NOT NULL AND work.sha256<>p_hash) THEN
    RAISE EXCEPTION 'Stale routing operation' USING ERRCODE='PT409';
  END IF;

  PERFORM 1 FROM erp_private.agent_source_items i
    JOIN erp_private.agent_source_versions v USING(connection_id,item_id,version)
    WHERE (i.connection_id,i.item_id,i.version)=(work.connection_id,work.item_id,work.version)
      AND i.available AND v.mime='application/pdf' AND v.size_bytes=p_bytes
    FOR SHARE OF i;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source version changed' USING ERRCODE='PT409';
  END IF;

  -- Recover with the original company, including work admitted before routing.
  IF work.sha256 IS NOT NULL THEN
    IF work.employer_company_id IS NOT NULL AND
      NOT erp_private.agent_employer_destination_allowed(policy,work.employer_company_id) THEN
      RAISE EXCEPTION 'Routing destination authorization changed' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_build_object('status','bound','companyId',coalesce(work.employer_company_id,work.company_id));
  ELSIF p_kind='inspect' THEN
    RETURN jsonb_build_object('status','inspect');
  END IF;

  IF p_kind='employer' THEN
    name_key := regexp_replace(lower(normalize(coalesce(p_company_name,''),NFKC)), '[^[:alnum:]]', '', 'g');
    IF name_key='' OR length(p_company_name)>300 THEN
      hold_reason := 'employment_employer_unreadable';
    ELSE
      SELECT array_agg(c.id ORDER BY c.id) INTO matches
        FROM public.owner_companies c
        WHERE c.status='active' AND regexp_replace(lower(normalize(c.legal_name_en,NFKC)), '[^[:alnum:]]', '', 'g')=name_key;
      IF coalesce(cardinality(matches),0)<>1 THEN
        hold_reason := 'employment_employer_missing_or_ambiguous';
      ELSIF matches[1]<>work.company_id THEN
        IF erp_private.agent_employer_destination_allowed(policy,matches[1]) THEN
          target := matches[1];
        ELSE
          hold_reason := 'employment_employer_scope_unavailable';
        END IF;
      END IF;
    END IF;
  ELSIF p_kind='unresolved' THEN
    hold_reason := 'employment_employer_unreadable';
  END IF;

  IF hold_reason IS NOT NULL THEN
    UPDATE erp_private.agent_pdf_work SET status='held', reason=hold_reason, sha256=p_hash,
      lease_token=NULL, lease_until=NULL WHERE operation_id=p_operation;
    RETURN jsonb_build_object('status','held');
  END IF;

  UPDATE erp_private.agent_pdf_work SET employer_company_id=target, sha256=p_hash
    WHERE operation_id=p_operation;
  RETURN jsonb_build_object('status','bound','companyId',coalesce(target,work.company_id));
END $$;
REVOKE ALL ON FUNCTION public.dms_route_sharepoint_employer(uuid,uuid,uuid,text,bigint,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_route_sharepoint_employer(uuid,uuid,uuid,text,bigint,text,text) TO service_role;

-- This runtime exists independently of the app's general DMS approvals.
-- Patch only the verified production predecessor and retain the runtime ACL.
DO $migration$
DECLARE
  original record;
  ddl text;
BEGIN
  SELECT replace(pg_get_functiondef(p.oid),E'\r\n',E'\n') AS definition,
         md5(replace(p.prosrc,E'\r\n',E'\n')) AS checksum
    INTO STRICT original FROM pg_proc p
    WHERE p.oid='erp_private.advance_agent_pdf(uuid,uuid,uuid,text,text)'::regprocedure;
  IF original.checksum <> '76f5920175f84e8ee94d3f2785a81ee1' THEN
    RAISE EXCEPTION 'SharePoint intake runtime changed. Reconcile employer routing with the deployed predecessor.';
  END IF;
  ddl := replace(original.definition, '  new_review_id bigint;', E'  new_review_id bigint;\n  intake_company_id bigint;');
  ddl := replace(ddl, '  select exists (select 1 from erp_private.agent_source_items', $replace$  intake_company_id := coalesce(work.employer_company_id,work.company_id);
  IF work.employer_company_id IS NOT NULL AND
    NOT erp_private.agent_employer_destination_allowed(policy,work.employer_company_id) THEN
    RETURN 'paused';
  END IF;

  select exists (select 1 from erp_private.agent_source_items$replace$);
  ddl := replace(ddl, 'intake.owning_company_id is distinct from work.company_id', 'intake.owning_company_id is distinct from intake_company_id');
  ddl := replace(ddl, 'agent_find_matching_documents(work.company_id,', 'agent_find_matching_documents(intake_company_id,');
  ddl := replace(ddl, '.owning_company_id=work.company_id', '.owning_company_id=intake_company_id');
  EXECUTE ddl;
END $migration$;
COMMIT;
