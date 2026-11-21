
BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('hr.payroll.wps.issue','Issue and retrieve the exact approved scoped WPS file','hr','payroll_wps_issue','held'),
 ('hr.payroll.payment.reconcile','Reconcile scoped employee payments and exact payroll lines','hr','payroll_payment_reconcile','held');

INSERT INTO public.dms_document_categories(category_code,name_en)
VALUES ('T16_PAYROLL_EVIDENCE','Payroll bank evidence');
INSERT INTO public.dms_document_types(type_code,name_en,category_id,default_confidentiality)
SELECT t.code,t.name,c.id,'finance'
FROM public.dms_document_categories c CROSS JOIN (VALUES
 ('T16_BANK_EVIDENCE','Private payroll bank evidence'),
 ('T16_BANK_FORMAT','Bank-approved payroll file specification'),
 ('T16_PAYMENT_POLICY','Approved alternate payroll channel'),
 ('T16_HISTORICAL_DESTINATION','Verified prior-employer payment destination')
) t(code,name) WHERE c.category_code='T16_PAYROLL_EVIDENCE';

-- Configuration is installed from an approved bank specification. An empty
-- configuration deliberately prevents operational issuance.
CREATE TABLE erp_private.t16_formats (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id bigint NOT NULL REFERENCES public.owner_companies,
 establishment_id bigint NOT NULL REFERENCES public.hr_mohre_establishments,
 effective_month date NOT NULL CHECK(isfinite(effective_month) AND extract(day FROM effective_month)=1),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 format_version text NOT NULL CHECK(format_version~'^[A-Za-z0-9_-]{1,32}$'),
 employer_code text NOT NULL CHECK(employer_code~'^[0-9]{1,24}$'),
 payer_routing text NOT NULL CHECK(payer_routing~'^[0-9]{1,12}$'),
 identifier_kind text NOT NULL CHECK(identifier_kind IN('person-code','labour-card')),
 identifier_width integer NOT NULL CHECK(identifier_width BETWEEN 1 AND 24),
 account_kind text NOT NULL CHECK(account_kind IN('iban','account')),
 account_width integer NOT NULL CHECK(account_width BETWEEN 1 AND 34 AND (account_kind<>'iban' OR account_width=23)),
 routing_width integer NOT NULL CHECK(routing_width BETWEEN 1 AND 12),
 currency text NOT NULL REFERENCES public.currencies(currency_code) CHECK(currency~'^[A-Z]{3}$'),
 detail_fields text[] NOT NULL CHECK(cardinality(detail_fields) BETWEEN 8 AND 16),
 control_fields text[] NOT NULL CHECK(cardinality(control_fields) BETWEEN 6 AND 14),
 date_style text NOT NULL CHECK(date_style IN('ISO','COMPACT')),
 line_end text NOT NULL CHECK(line_end IN('LF','CRLF')),
 suffix text NOT NULL CHECK(suffix IN('sif','csv')),
 specification_file_id bigint NOT NULL REFERENCES public.dms_document_files,
 specification_sha256 text NOT NULL CHECK(specification_sha256~'^[0-9a-f]{64}$'),
 UNIQUE(company_id,establishment_id,effective_month,revision),
 UNIQUE(company_id,establishment_id,format_version)
);
CREATE TABLE erp_private.t16_bank_routes (
 format_id uuid NOT NULL REFERENCES erp_private.t16_formats,
 bank_id bigint NOT NULL REFERENCES public.banks,
 routing_code text NOT NULL CHECK(routing_code~'^[0-9]{1,12}$'),
 PRIMARY KEY(format_id,bank_id)
);
CREATE TABLE erp_private.t16_alternate_channels (
 company_id bigint NOT NULL REFERENCES public.owner_companies,
 branch_id bigint NOT NULL REFERENCES public.branches,
 channel text NOT NULL CHECK(channel='cheque'),
 effective_month date NOT NULL CHECK(isfinite(effective_month) AND extract(day FROM effective_month)=1),
 policy_file_id bigint NOT NULL REFERENCES public.dms_document_files,
 policy_sha256 text NOT NULL CHECK(policy_sha256~'^[0-9a-f]{64}$'),
 PRIMARY KEY(company_id,branch_id,channel,effective_month)
);
-- Prior-payer output needs an approved, dated banking snapshot. The current
-- employee profile may already belong to the receiving employer.
CREATE TABLE erp_private.t16_historical_destinations (
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods,
 effective_month date NOT NULL CHECK(isfinite(effective_month) AND extract(day FROM effective_month)=1),
 channel text NOT NULL CHECK(channel IN('wps','cheque')),
 establishment_id bigint REFERENCES public.hr_mohre_establishments,
 bank_id bigint REFERENCES public.banks,
 iban text,
 account_number text,
 person_code text,
 labour_card text,
 policy_file_id bigint NOT NULL REFERENCES public.dms_document_files,
 policy_sha256 text NOT NULL CHECK(policy_sha256~'^[0-9a-f]{64}$'),
 PRIMARY KEY(employment_id,effective_month),
 CHECK((channel='wps')=(establishment_id IS NOT NULL AND bank_id IS NOT NULL))
);
CREATE TABLE erp_private.t16_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id uuid NOT NULL UNIQUE REFERENCES erp_private.t15_reviews,
 version_id uuid NOT NULL UNIQUE REFERENCES erp_private.t14_versions,
 company_id bigint NOT NULL REFERENCES public.owner_companies,
 branch_id bigint NOT NULL REFERENCES public.branches,
 month date NOT NULL CHECK(isfinite(month) AND extract(day FROM month)=1),
 digest text NOT NULL CHECK(digest~'^[0-9a-f]{64}$'),
 replaces_batch_id uuid UNIQUE REFERENCES erp_private.t16_batches,
 issued_by bigint NOT NULL REFERENCES public.user_profiles,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,version_id),
 UNIQUE(id,company_id)
);
CREATE TABLE erp_private.t16_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES erp_private.t16_batches,
 establishment_id bigint NOT NULL REFERENCES public.hr_mohre_establishments,
 format_id uuid NOT NULL REFERENCES erp_private.t16_formats,
 replaces_file_id uuid UNIQUE,
 correction_evidence_id bigint REFERENCES public.dms_document_files,
 correction_evidence_sha256 text CHECK(correction_evidence_sha256~'^[0-9a-f]{64}$'),
 corrected_by bigint REFERENCES public.user_profiles,
 routing_digest text NOT NULL CHECK(routing_digest~'^[0-9a-f]{64}$'),
 filename text NOT NULL CHECK(filename~'^[A-Za-z0-9_-]+\.(sif|csv)$' AND length(filename)<=100),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 4000000),
 sha256 text GENERATED ALWAYS AS (encode(extensions.digest(content,'sha256'),'hex')) STORED,
 row_count integer NOT NULL CHECK(row_count>0),
 net_total numeric(20,2) NOT NULL CHECK(net_total>0),
 currency text NOT NULL REFERENCES public.currencies(currency_code),
 UNIQUE(batch_id,id),
 FOREIGN KEY(batch_id,replaces_file_id) REFERENCES erp_private.t16_files(batch_id,id),
 CHECK((replaces_file_id IS NULL AND correction_evidence_id IS NULL AND correction_evidence_sha256 IS NULL AND corrected_by IS NULL)
  OR (replaces_file_id IS NOT NULL AND correction_evidence_id IS NOT NULL AND correction_evidence_sha256 IS NOT NULL AND corrected_by IS NOT NULL))
);
CREATE UNIQUE INDEX t16_original_wps_file ON erp_private.t16_files(batch_id,establishment_id) WHERE replaces_file_id IS NULL;
CREATE INDEX t16_wps_establishment ON erp_private.t16_files(batch_id,establishment_id);
CREATE TABLE erp_private.t16_batch_results (
 batch_id uuid NOT NULL,
 version_id uuid NOT NULL,
 employee_id bigint NOT NULL,
 channel text NOT NULL CHECK(channel IN('wps','cheque','zero')),
 file_id uuid,
 routing_digest text NOT NULL CHECK(routing_digest~'^[0-9a-f]{64}$'),
 PRIMARY KEY(batch_id,employee_id),
 FOREIGN KEY(batch_id,version_id) REFERENCES erp_private.t16_batches(id,version_id),
 FOREIGN KEY(version_id,employee_id) REFERENCES erp_private.t14_results(version_id,employee_id),
 FOREIGN KEY(batch_id,file_id) REFERENCES erp_private.t16_files(batch_id,id),
 CHECK((channel='wps')=(file_id IS NOT NULL))
);
CREATE INDEX t16_result_file ON erp_private.t16_batch_results(file_id) WHERE file_id IS NOT NULL;

CREATE TABLE erp_private.t16_batch_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 batch_id uuid NOT NULL,
 company_id bigint NOT NULL,
 lane text NOT NULL CHECK(lane IN('cheque','zero','wps')),
 wps_file_id uuid,
 lane_key text GENERATED ALWAYS AS (coalesce(wps_file_id::text,lane)) STORED,
 kind text NOT NULL CHECK(kind IN('handoff-pending','submitted','acknowledged','accepted','rejected','cancelled')),
 reference text NOT NULL CHECK(reference~'^[A-Z0-9][A-Z0-9 ./_-]{0,99}$'),
 actor_id bigint NOT NULL REFERENCES public.user_profiles,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 document_id bigint REFERENCES public.dms_documents,
 version_id bigint REFERENCES public.dms_document_versions,
 file_id bigint REFERENCES public.dms_document_files,
 proof_sha256 text CHECK(proof_sha256~'^[0-9a-f]{64}$'),
 FOREIGN KEY(batch_id,company_id) REFERENCES erp_private.t16_batches(id,company_id),
 FOREIGN KEY(batch_id,wps_file_id) REFERENCES erp_private.t16_files(batch_id,id),
 UNIQUE(batch_id,lane_key,kind),
 CHECK((lane='wps')=(wps_file_id IS NOT NULL)),
 CHECK(lane='wps' OR kind IN('accepted','cancelled')),
 CHECK((kind='handoff-pending' AND document_id IS NULL AND version_id IS NULL AND file_id IS NULL AND proof_sha256 IS NULL)
 OR (kind<>'handoff-pending' AND document_id IS NOT NULL AND version_id IS NOT NULL AND file_id IS NOT NULL AND proof_sha256 IS NOT NULL))
);
CREATE UNIQUE INDEX t16_unique_handoff_reference ON erp_private.t16_batch_events(company_id,reference) WHERE kind='handoff-pending' OR (lane<>'wps' AND kind='accepted');
CREATE INDEX t16_batch_event_order ON erp_private.t16_batch_events(batch_id,lane_key,sequence DESC);
CREATE TABLE erp_private.t16_downloads (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 file_id uuid NOT NULL REFERENCES erp_private.t16_files,
 actor_id bigint NOT NULL REFERENCES public.user_profiles,
 downloaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX t16_download_file ON erp_private.t16_downloads(file_id,id);

DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['t16_formats','t16_bank_routes','t16_alternate_channels','t16_historical_destinations','t16_batches','t16_files',
                            't16_batch_results','t16_batch_events','t16_downloads'] LOOP
    EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',name);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON erp_private.%I
      FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history()',name||'_retain',name);
 END LOOP;
END $$;

-- Serialize event transitions even when a caller's transaction snapshot
-- precedes its lock wait. The issuance and payment ledgers share this fence.
CREATE TABLE erp_private.t16_batch_write_fences (
 batch_id uuid PRIMARY KEY REFERENCES erp_private.t16_batches,
 revision bigint NOT NULL CHECK(revision>0)
);
ALTER TABLE erp_private.t16_batch_write_fences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t16_batch_write_fences FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.t16_touch_batch(p_batch uuid)
RETURNS void LANGUAGE sql VOLATILE SET search_path='' AS $$
 INSERT INTO erp_private.t16_batch_write_fences(batch_id,revision) VALUES(p_batch,1)
 ON CONFLICT(batch_id) DO UPDATE SET revision=erp_private.t16_batch_write_fences.revision+1;
$$;

CREATE FUNCTION erp_private.t16_can(p_company bigint,p_branch bigint,p_mode text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE cap text;
BEGIN
 cap:=CASE p_mode WHEN 'issue' THEN 'hr.payroll.wps.issue' WHEN 'reconcile' THEN 'hr.payroll.payment.reconcile' END;
 RETURN cap IS NOT NULL AND p_company IS NOT NULL AND p_branch IS NOT NULL
    AND erp_private.t02_has_scope(cap,p_company,p_branch)
    AND erp_private.t02_has_scope('hr.payroll.view',p_company,p_branch);
END $$;
CREATE FUNCTION erp_private.t16_actor(p_company bigint,p_branch bigint,p_mode text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 IF NOT erp_private.t16_can(p_company,p_branch,p_mode) THEN
   RAISE EXCEPTION 'Payment workspace authority is unavailable in this scope' USING ERRCODE='42501';
 END IF;
 RETURN public.current_user_profile_id();
END $$;
CREATE FUNCTION erp_private.t16_lane_state(p_batch uuid,p_lane text)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT e.kind FROM erp_private.t16_batch_events e
     WHERE e.batch_id=p_batch AND e.lane_key=p_lane ORDER BY e.sequence DESC LIMIT 1),'prepared');
$$;
CREATE FUNCTION erp_private.t16_batch_lanes(p_batch uuid)
RETURNS TABLE(lane text,wps_file uuid,lane_key text,current_state text)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT 'wps',f.id,f.id::text,erp_private.t16_lane_state(p_batch,f.id::text)
 FROM erp_private.t16_files f WHERE f.batch_id=p_batch
  AND NOT EXISTS(SELECT 1 FROM erp_private.t16_files child WHERE child.replaces_file_id=f.id)
 UNION ALL
 SELECT a.channel,NULL::uuid,a.channel,erp_private.t16_lane_state(p_batch,a.channel)
 FROM (SELECT DISTINCT r.channel FROM erp_private.t16_batch_results r WHERE r.batch_id=p_batch AND r.channel<>'wps') a;
$$;
CREATE FUNCTION erp_private.t16_batch_state(p_batch uuid)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN count(DISTINCT l.current_state)<=1 THEN coalesce(max(l.current_state),'prepared')
   WHEN bool_and(l.current_state IN('rejected','cancelled')) THEN 'rejected' ELSE 'mixed' END
 FROM erp_private.t16_batch_lanes(p_batch) l;
$$;
CREATE FUNCTION erp_private.t16_channel_ready(p_batch uuid,p_employee bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT l.current_state='accepted' FROM erp_private.t16_batch_results r
   LEFT JOIN erp_private.t16_files original ON original.id=r.file_id
   JOIN erp_private.t16_batch_lanes(p_batch) l ON l.lane=r.channel
   LEFT JOIN erp_private.t16_files latest ON latest.id=l.wps_file
   WHERE r.batch_id=p_batch AND r.employee_id=p_employee
      AND (r.channel<>'wps' OR latest.establishment_id=original.establishment_id)),false);
$$;
CREATE FUNCTION erp_private.t16_lock_batch(p_batch uuid,p_company bigint,p_branch bigint)
RETURNS erp_private.t16_batches LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE batch erp_private.t16_batches;
BEGIN
 SELECT * INTO batch FROM erp_private.t16_batches
 WHERE id=p_batch AND company_id=p_company AND branch_id=p_branch;
 IF NOT FOUND THEN RAISE EXCEPTION 'The exact payroll issue is unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||batch.company_id,0));
 PERFORM 1 FROM erp_private.t14_runs r JOIN erp_private.t15_reviews h ON h.run_id=r.id
 WHERE h.id=batch.review_id FOR UPDATE OF r;
 RETURN batch;
END $$;

-- Use actual document/version/file ownership and the ordinary-role DMS
-- checks. A personal or masked document ID cannot stand for a bank original.
CREATE FUNCTION erp_private.t16_evidence(p_company bigint,p_branch bigint,p_document bigint,p_version bigint,p_file bigint)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE content_hash text;
BEGIN
 IF NOT erp_private.t02_has_scope('dms.documents.preview',p_company,p_branch)
 OR NOT erp_private.t02_has_scope('dms.documents.view.finance',p_company,p_branch) THEN
   RAISE EXCEPTION 'Verified bank evidence is unavailable in this scope' USING ERRCODE='42501';
 END IF;
 SELECT f.sha256_hash INTO content_hash
 FROM public.dms_documents d
 JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.type_code='T16_BANK_EVIDENCE'
   AND t.is_active AND t.deleted_at IS NULL AND t.category_id=d.category_id
 JOIN public.dms_document_categories c ON c.id=d.category_id AND c.category_code='T16_PAYROLL_EVIDENCE'
   AND c.is_active AND c.deleted_at IS NULL
 JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id
   AND v.is_current AND v.unlinked_at IS NULL
 JOIN public.dms_document_files f ON f.version_id=v.id AND f.document_id=d.id AND f.file_role='original'
   AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
 WHERE d.id=p_document AND v.id=p_version AND f.id=p_file AND d.owning_company_id=p_company AND d.owning_branch_id=p_branch
   AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status='active' AND d.confidentiality_level='finance'
   AND erp_private.t13_evidence_is_operative(d.id) AND erp_private.document_permission(d.id,'dms.documents.preview')
 FOR SHARE OF d,t,c,v,f;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified bank evidence is unavailable in this scope' USING ERRCODE='42501'; END IF;
 RETURN content_hash;
END $$;

CREATE FUNCTION erp_private.t16_specification(p_company bigint,p_branch bigint,p_file bigint,p_hash text,p_type text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.dms_document_files f
 JOIN public.dms_document_versions v ON v.id=f.version_id AND v.document_id=f.document_id AND v.unlinked_at IS NULL
 JOIN public.dms_documents d ON d.id=f.document_id AND d.owning_company_id=p_company
  AND (d.owning_branch_id IS NULL OR d.owning_branch_id=p_branch) AND d.current_version_id=v.id
 JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.category_id=d.category_id AND t.type_code=p_type
  AND t.is_active AND t.deleted_at IS NULL
 WHERE f.id=p_file AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status='verified'
  AND f.file_size_bytes>0 AND f.sha256_hash=p_hash AND d.deleted_at IS NULL AND NOT d.is_archived
  AND v.is_current AND d.status='active' AND d.confidentiality_level='finance'
  AND erp_private.t13_evidence_is_operative(d.id)
 FOR SHARE OF f,v,d,t;
 RETURN FOUND;
END $$;

REVOKE ALL ON FUNCTION erp_private.t16_touch_batch(uuid),erp_private.t16_can(bigint,bigint,text),erp_private.t16_actor(bigint,bigint,text),
 erp_private.t16_batch_state(uuid),erp_private.t16_lane_state(uuid,text),erp_private.t16_batch_lanes(uuid),
 erp_private.t16_channel_ready(uuid,bigint),erp_private.t16_lock_batch(uuid,bigint,bigint),
 erp_private.t16_evidence(bigint,bigint,bigint,bigint,bigint),erp_private.t16_specification(bigint,bigint,bigint,text,text)
FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
