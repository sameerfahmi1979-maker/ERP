
BEGIN;

CREATE FUNCTION erp_private.t16_row(p_order text[],p_values jsonb,p_required text[])
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE csv text;
BEGIN
 IF NOT (p_order @> p_required) OR cardinality(p_order)<>(SELECT count(DISTINCT k) FROM unnest(p_order) k)
    OR EXISTS(SELECT 1 FROM unnest(p_order) k WHERE coalesce(p_values->>k,'') !~ '^[A-Za-z0-9_.-]{1,100}$') THEN
   RAISE EXCEPTION 'The approved WPS field mapping is incomplete or unsupported' USING ERRCODE='PT409';
 END IF;
 SELECT string_agg(p_values->>k,',' ORDER BY n) INTO csv FROM unnest(p_order) WITH ORDINALITY v(k,n);
 RETURN csv;
END $$;

CREATE FUNCTION erp_private.t16_route_result(
 p_company bigint,p_branch bigint,p_month date,p_employee bigint,p_currency text,p_net numeric,p_employments bigint[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 profile public.employee_wps_profiles; layout erp_private.t16_formats; alt erp_private.t16_alternate_channels;
 historical erp_private.t16_historical_destinations; payer_is_current boolean; routing_source text;
 bank_code text; employee_code text; bank_account text; month_end date:=(p_month+interval '1 month'-interval '1 day')::date;
BEGIN
 IF p_net=0 THEN RETURN jsonb_build_object('employee',p_employee,'channel','zero'); END IF;
 SELECT ROW(e.owner_company_id,e.branch_id)=ROW(p_company,p_branch) INTO payer_is_current
 FROM public.employees e WHERE e.id=p_employee FOR SHARE;
 IF payer_is_current IS TRUE THEN
   SELECT * INTO profile FROM public.employee_wps_profiles
   WHERE employee_id=p_employee AND deleted_at IS NULL FOR SHARE;
   IF profile.id IS NULL OR coalesce(profile.salary_effective_date>month_end,false) THEN
     RAISE EXCEPTION 'Review WPS readiness for every payable employee in the approved payroll' USING ERRCODE='PT409';
   END IF;
   routing_source:=profile.id::text||':'||profile.workspace_revision;
 ELSE
   SELECT dst.* INTO historical FROM erp_private.t16_historical_destinations dst
   JOIN erp_private.t03_employment_periods h ON h.id=dst.employment_id
   WHERE h.id=ANY(p_employments) AND h.employee_id=p_employee AND h.company_id=p_company AND h.branch_id=p_branch
     AND dst.effective_month<=p_month
   ORDER BY dst.effective_month DESC,lower(h.work_period) DESC,h.id DESC LIMIT 1 FOR SHARE OF dst,h;
   IF historical.employment_id IS NULL OR NOT erp_private.t16_specification(
       p_company,p_branch,historical.policy_file_id,historical.policy_sha256,'T16_HISTORICAL_DESTINATION') THEN
     RAISE EXCEPTION 'An approved historical payment destination is required for a transferred employee' USING ERRCODE='PT409';
   END IF;
   profile.wps_applicable:=historical.channel='wps';
   profile.wps_status:=CASE historical.channel WHEN 'wps' THEN 'active' ELSE 'exempt' END;
   profile.salary_payment_method:=CASE historical.channel WHEN 'wps' THEN 'bank_transfer' ELSE 'cheque' END;
   profile.bank_id:=historical.bank_id;
   profile.mohre_establishment_id:=historical.establishment_id;
   profile.iban:=historical.iban;
   profile.account_number:=historical.account_number;
   profile.mohre_person_code:=historical.person_code;
   profile.labour_card_number:=historical.labour_card;
   routing_source:='historical:'||historical.employment_id||':'||historical.effective_month||':'||historical.policy_sha256;
 END IF;
 IF NOT profile.wps_applicable AND profile.wps_status='exempt' AND profile.salary_payment_method='cheque' THEN
   SELECT * INTO alt FROM erp_private.t16_alternate_channels
   WHERE company_id=p_company AND branch_id=p_branch AND channel='cheque' AND effective_month<=p_month
   ORDER BY effective_month DESC LIMIT 1 FOR SHARE;
   IF alt.policy_file_id IS NULL OR NOT erp_private.t16_specification(p_company,p_branch,alt.policy_file_id,alt.policy_sha256,'T16_PAYMENT_POLICY') THEN
     RAISE EXCEPTION 'An approved payment channel is required for each exempt employee' USING ERRCODE='PT409';
   END IF;
   RETURN jsonb_build_object('employee',p_employee,'channel','cheque','policy_file',alt.policy_file_id,'source',routing_source);
 END IF;
 IF NOT profile.wps_applicable OR profile.wps_status<>'active'
  OR profile.salary_payment_method NOT IN('bank_transfer','exchange_house') THEN
   RAISE EXCEPTION 'Review WPS readiness for every payable employee in the approved payroll' USING ERRCODE='PT409';
 END IF;
 SELECT f.* INTO layout FROM erp_private.t16_formats f JOIN public.hr_mohre_establishments e ON e.id=f.establishment_id
 WHERE f.company_id=p_company AND e.owner_company_id=p_company AND f.establishment_id=profile.mohre_establishment_id
   AND e.status='active' AND e.deleted_at IS NULL AND f.effective_month<=p_month
 ORDER BY f.effective_month DESC,f.revision DESC LIMIT 1 FOR SHARE OF f,e;
 IF layout.id IS NULL OR layout.currency IS DISTINCT FROM p_currency
   OR NOT erp_private.t16_specification(p_company,p_branch,layout.specification_file_id,layout.specification_sha256,'T16_BANK_FORMAT') THEN
   RAISE EXCEPTION 'A verified bank file layout is required for each establishment and payroll currency' USING ERRCODE='PT409';
 END IF;
 SELECT route.routing_code INTO bank_code FROM erp_private.t16_bank_routes route JOIN public.banks bank ON bank.id=route.bank_id
 WHERE route.format_id=layout.id AND route.bank_id=profile.bank_id AND bank.is_active FOR SHARE OF route,bank;
 employee_code:=btrim(CASE layout.identifier_kind WHEN 'person-code' THEN profile.mohre_person_code ELSE profile.labour_card_number END);
 bank_account:=CASE layout.account_kind WHEN 'iban' THEN upper(regexp_replace(profile.iban,'[[:space:]]','','g'))
   ELSE upper(btrim(profile.account_number)) END;
 IF NOT coalesce(employee_code~'^[0-9]+$' AND length(employee_code)=layout.identifier_width
    AND bank_code~'^[0-9]+$' AND length(bank_code)=layout.routing_width
    AND length(layout.payer_routing)=layout.routing_width
    AND bank_account~'^[A-Z0-9]+$' AND length(bank_account)=layout.account_width
    AND CASE layout.account_kind WHEN 'iban' THEN erp_private.valid_uae_iban(bank_account) ELSE true END,false) THEN
   RAISE EXCEPTION 'An approved payroll recipient is missing a valid WPS identifier, routing code or account' USING ERRCODE='PT409';
 END IF;
 RETURN jsonb_build_object('employee',p_employee,'channel','wps','establishment',layout.establishment_id,
     'format',layout.id,'identifier',employee_code,'routing',bank_code,'account',bank_account,'source',routing_source);
END $$;

CREATE FUNCTION erp_private.t16_routes(p_batch erp_private.t16_batches)
RETURNS jsonb LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(erp_private.t16_route_result(p_batch.company_id,p_batch.branch_id,p_batch.month,
     r.employee_id,r.currency,r.net,r.employment_ids) ORDER BY r.employee_id),'[]'::jsonb)
 FROM erp_private.t14_results r WHERE r.version_id=p_batch.version_id AND r.state='ready';
$$;

CREATE FUNCTION erp_private.t16_render_file(p_batch erp_private.t16_batches,p_layout erp_private.t16_formats,
 p_routes jsonb,p_previous uuid DEFAULT NULL,p_proof_file bigint DEFAULT NULL,p_proof_hash text DEFAULT NULL,p_actor bigint DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 item record; file_id_out uuid; period_end date:=(p_batch.month+interval '1 month'-interval '1 day')::date;
 separator text; date_mask text; controls text; title text; bytes bytea;
BEGIN
 IF jsonb_array_length(p_routes) NOT BETWEEN 1 AND 10000
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_routes) x GROUP BY x->>'identifier' HAVING count(*)>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_routes) x WHERE x->>'channel'<>'wps' OR x->>'format'<>p_layout.id::text) THEN
   RAISE EXCEPTION 'Review the approved payroll size and unique WPS recipient identifiers' USING ERRCODE='PT409';
 END IF;
   separator:=CASE p_layout.line_end WHEN 'CRLF' THEN chr(13)||chr(10) ELSE chr(10) END;
   date_mask:=CASE p_layout.date_style WHEN 'COMPACT' THEN 'YYYYMMDD' ELSE 'YYYY-MM-DD' END;
   SELECT count(*) AS rows, sum(r.net)::numeric(20,2) AS net,
     string_agg(erp_private.t16_row(p_layout.detail_fields,
       x||jsonb_build_object('type','EDR','period_start',to_char(p_batch.month,date_mask),
        'period_end',to_char(period_end,date_mask),'days',extract(day FROM period_end)::integer,
        'net',r.net,'gross',r.gross,'deductions',r.deductions,'currency',r.currency,
        'fixed_net',least(r.net,coalesce(basic.amount,0))::numeric(20,2),
        'variable_net',(r.net-least(r.net,coalesce(basic.amount,0)))::numeric(20,2))
          - ARRAY['employee','channel','establishment','format','source'],
       ARRAY['type','identifier','routing','account','period_start','period_end','days']||
          CASE WHEN p_layout.detail_fields @> ARRAY['net'] THEN ARRAY['net'] ELSE ARRAY['fixed_net','variable_net'] END),
          separator ORDER BY x->>'identifier',r.employee_id) AS body
     INTO item
   FROM jsonb_array_elements(p_routes) x
   JOIN erp_private.t14_results r ON r.version_id=p_batch.version_id AND r.employee_id=(x->>'employee')::bigint
   LEFT JOIN LATERAL (SELECT sum(l.amount) AS amount FROM erp_private.t14_lines l
     WHERE l.version_id=r.version_id AND l.employee_id=r.employee_id AND l.kind='earning' AND l.category='basic') basic ON true
   WHERE x->>'format'=p_layout.id::text;
   file_id_out:=gen_random_uuid();
   controls:=erp_private.t16_row(p_layout.control_fields,jsonb_build_object('type','SCR','employer',p_layout.employer_code,
     'payer_routing',p_layout.payer_routing,'pay_month',to_char(p_batch.month,'MMYYYY'),
     'issue_date',to_char(p_batch.issued_at AT TIME ZONE 'Asia/Dubai',date_mask),
     'issue_time',to_char(p_batch.issued_at AT TIME ZONE 'Asia/Dubai','HH24MISS'),
     'row_count',item.rows,'total',item.net,'currency',p_layout.currency,
     'reference',replace(file_id_out::text,'-',''),
     'file_kind',CASE WHEN p_batch.replaces_batch_id IS NULL AND p_previous IS NULL THEN 'original' ELSE 'correction' END),
     ARRAY['type','employer','payer_routing','pay_month','row_count','total','currency']);
   title:='WPS_'||to_char(p_batch.month,'YYYYMM')||'_'||p_layout.establishment_id||'_'||file_id_out||'.'||p_layout.suffix;
   bytes:=convert_to(item.body||separator||controls||separator,'UTF8');
   IF p_previous IS NOT NULL AND EXISTS(SELECT 1 FROM erp_private.t16_files earlier
       WHERE earlier.batch_id=p_batch.id AND earlier.establishment_id=p_layout.establishment_id
        AND earlier.sha256=encode(extensions.digest(bytes,'sha256'),'hex')) THEN
     RAISE EXCEPTION 'A correction must change the previously rejected file bytes' USING ERRCODE='PT409';
   END IF;
   INSERT INTO erp_private.t16_files(id,batch_id,establishment_id,format_id,filename,content,row_count,net_total,currency,
       routing_digest,replaces_file_id,correction_evidence_id,correction_evidence_sha256,corrected_by)
   VALUES(file_id_out,p_batch.id,p_layout.establishment_id,p_layout.id,title,bytes,
     item.rows,item.net,p_layout.currency,erp_private.t02_digest(p_routes),p_previous,p_proof_file,p_proof_hash,p_actor);
 RETURN file_id_out;
END $$;

CREATE FUNCTION erp_private.t16_render_files(p_batch erp_private.t16_batches,p_routes jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE layout erp_private.t16_formats; file_routes jsonb; rendered uuid;
BEGIN
 IF jsonb_array_length(p_routes) NOT BETWEEN 1 AND 10000 THEN
   RAISE EXCEPTION 'Review the approved payroll size' USING ERRCODE='PT409';
 END IF;
 FOR layout IN SELECT f.* FROM erp_private.t16_formats f WHERE f.id IN
    (SELECT (x->>'format')::uuid FROM jsonb_array_elements(p_routes) x WHERE x->>'channel'='wps')
    ORDER BY f.establishment_id
 LOOP
   SELECT jsonb_agg(x ORDER BY (x->>'employee')::bigint) INTO file_routes
   FROM jsonb_array_elements(p_routes) x WHERE x->>'format'=layout.id::text;
   rendered:=erp_private.t16_render_file(p_batch,layout,file_routes);
   INSERT INTO erp_private.t16_batch_results(batch_id,version_id,employee_id,channel,file_id,routing_digest)
   SELECT p_batch.id,p_batch.version_id,(x->>'employee')::bigint,'wps',rendered,erp_private.t02_digest(x)
   FROM jsonb_array_elements(file_routes) x;
 END LOOP;
 INSERT INTO erp_private.t16_batch_results(batch_id,version_id,employee_id,channel,routing_digest)
 SELECT p_batch.id,p_batch.version_id,(x->>'employee')::bigint,x->>'channel',erp_private.t02_digest(x)
 FROM jsonb_array_elements(p_routes) x WHERE x->>'channel' IN('cheque','zero');
 IF (SELECT count(*) FROM erp_private.t16_batch_results b WHERE b.batch_id=p_batch.id)
       <> (SELECT count(*) FROM erp_private.t14_results r WHERE r.version_id=p_batch.version_id) THEN
   RAISE EXCEPTION 'Every employee in the exact approved payroll must be accounted for' USING ERRCODE='PT409';
 END IF;
END $$;

CREATE FUNCTION erp_private.t16_lane_routes(p_batch erp_private.t16_batches,p_channel text,p_establishment bigint)
RETURNS jsonb LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(erp_private.t16_route_result(p_batch.company_id,p_batch.branch_id,p_batch.month,
     r.employee_id,r.currency,r.net,r.employment_ids) ORDER BY r.employee_id),'[]'::jsonb)
 FROM erp_private.t16_batch_results m JOIN erp_private.t14_results r
   ON r.version_id=m.version_id AND r.employee_id=m.employee_id
 LEFT JOIN erp_private.t16_files original ON original.id=m.file_id
 WHERE m.batch_id=p_batch.id AND m.channel=p_channel
   AND (p_channel<>'wps' OR original.establishment_id=p_establishment);
$$;

CREATE FUNCTION erp_private.t16_create_issue(p_company bigint,p_branch bigint,p_actor bigint,p_review uuid,p_version uuid,p_digest text)
RETURNS erp_private.t16_batches LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 batch erp_private.t16_batches; previous erp_private.t16_batches; review erp_private.t15_reviews; anchor erp_private.t14_runs;
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
 PERFORM erp_private.t15_sealed_version(p_review,p_version,p_digest);
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

CREATE FUNCTION public.t16_wps_issue_command(p_operation uuid,p_company bigint,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor bigint; batch erp_private.t16_batches; prior erp_private.t16_batch_events; event_id uuid;
 review erp_private.t15_reviews; old_state text; next_state text; bank_state text;
 lane_name text; lane_id text; wps_file uuid; bank_reference text; proof text;
 artifact erp_private.t16_files; layout erp_private.t16_formats; route_facts jsonb; corrected uuid;
 evidence_document bigint; evidence_version bigint; evidence_file bigint;
 request_hash text; result jsonb;
BEGIN
 actor:=erp_private.t16_actor(p_company,p_branch,'issue');
 IF p_operation IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object'
    OR p_action IS NULL OR p_action NOT IN('issue','start-handoff','record-submission','acknowledge','accept','reject','cancel',
      'authorize-cheque','authorize-zero','cancel-cheque','cancel-zero','correct-file') THEN
   RAISE EXCEPTION 'Choose a valid payroll issue action' USING ERRCODE='22023';
 END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(p_company,p_branch,p_action,p_data));
 IF p_action='issue' THEN
   IF NOT erp_private.t05_fields(p_data,ARRAY['review','version','digest']) THEN
     RAISE EXCEPTION 'Provide the exact approved review, version and digest' USING ERRCODE='22023';
   END IF;
   -- Acquire the company payroll lock in the same order for new and replayed calls.
   PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||p_company,0));
   PERFORM erp_private.t16_actor(p_company,p_branch,'issue');
   result:=erp_private.t02_replay('t16-issue',p_operation,request_hash);
   IF result IS NOT NULL THEN RETURN result; END IF;
   batch:=erp_private.t16_create_issue(p_company,p_branch,actor,(p_data->>'review')::uuid,(p_data->>'version')::uuid,p_data->>'digest');
 ELSE
   IF NOT erp_private.t05_fields(p_data,CASE WHEN p_action='start-handoff' THEN ARRAY['batch','reference','wps_file']
     WHEN p_action IN('authorize-cheque','authorize-zero','cancel-cheque','cancel-zero')
     THEN ARRAY['batch','reference','document','version','file']
     ELSE ARRAY['batch','reference','document','version','file','wps_file'] END) THEN
     RAISE EXCEPTION 'Provide the exact payroll issue and required bank evidence' USING ERRCODE='22023';
   END IF;
   batch:=erp_private.t16_lock_batch((p_data->>'batch')::uuid,p_company,p_branch);
   PERFORM erp_private.t16_touch_batch(batch.id);
   PERFORM erp_private.t16_actor(p_company,p_branch,'issue');
   result:=erp_private.t02_replay('t16-issue',p_operation,request_hash);
   IF result IS NOT NULL THEN RETURN result; END IF;
   SELECT * INTO review FROM erp_private.t15_reviews WHERE id=batch.review_id FOR UPDATE;
   IF review.state<>'approved' THEN RAISE EXCEPTION 'The exact payroll issue is no longer current' USING ERRCODE='PT409'; END IF;
   lane_name:=CASE WHEN p_action IN('authorize-cheque','cancel-cheque') THEN 'cheque'
     WHEN p_action IN('authorize-zero','cancel-zero') THEN 'zero' ELSE 'wps' END;
   wps_file:=(p_data->>'wps_file')::uuid;
   lane_id:=coalesce(wps_file::text,lane_name);
   SELECT l.current_state INTO old_state FROM erp_private.t16_batch_lanes(batch.id) l
     WHERE l.lane=lane_name AND l.lane_key=lane_id;
   IF lane_name='wps' THEN
     SELECT * INTO artifact FROM erp_private.t16_files f WHERE f.id=wps_file AND f.batch_id=batch.id;
   END IF;
   IF old_state IS NULL AND NOT(p_action='correct-file' AND artifact.id IS NOT NULL) THEN
     RAISE EXCEPTION 'The selected payroll file or channel is unavailable' USING ERRCODE='42501';
   END IF;
   next_state:=CASE p_action WHEN 'start-handoff' THEN 'handoff-pending' WHEN 'record-submission' THEN 'submitted'
      WHEN 'acknowledge' THEN 'acknowledged' WHEN 'reject' THEN 'rejected'
      WHEN 'cancel' THEN 'cancelled' WHEN 'cancel-cheque' THEN 'cancelled' WHEN 'cancel-zero' THEN 'cancelled'
      ELSE 'accepted' END;
   bank_reference:=upper(btrim(p_data->>'reference'));
   IF NOT coalesce(bank_reference~'^[A-Z0-9][A-Z0-9 ./_-]{0,99}$',false) THEN
     RAISE EXCEPTION 'Enter a valid bank handoff or retained payroll reference' USING ERRCODE='22023';
   END IF;
   IF p_action<>'start-handoff' THEN
     evidence_document:=(p_data->>'document')::bigint;
     evidence_version:=(p_data->>'version')::bigint;
     evidence_file:=(p_data->>'file')::bigint;
     proof:=erp_private.t16_evidence(p_company,p_branch,evidence_document,evidence_version,evidence_file);
   END IF;
   IF p_action='correct-file' THEN
     IF NOT EXISTS(SELECT 1 FROM erp_private.t16_batch_events e WHERE e.batch_id=batch.id AND e.lane_key=lane_id
           AND e.kind='rejected' AND e.reference=bank_reference) THEN
       RAISE EXCEPTION 'A correction requires the original rejected file and its retained reference' USING ERRCODE='PT409';
     END IF;
     SELECT f.id INTO corrected FROM erp_private.t16_files f
      WHERE f.replaces_file_id=wps_file AND f.correction_evidence_id=evidence_file AND f.correction_evidence_sha256=proof;
     IF corrected IS NULL THEN
       IF old_state IS DISTINCT FROM 'rejected' OR erp_private.t16_batch_state(batch.id)<>'mixed'
         OR review.replacement_requested_by IS NOT NULL THEN
         RAISE EXCEPTION 'A correction needs the rejected file in a mixed issue and its original reference' USING ERRCODE='PT409';
       END IF;
       PERFORM erp_private.t15_assert_current(review.run_id,batch.version_id);
       PERFORM erp_private.t15_assert_reservations(review.id,batch.version_id);
       route_facts:=erp_private.t16_lane_routes(batch,'wps',artifact.establishment_id);
       SELECT * INTO layout FROM erp_private.t16_formats WHERE id=(route_facts->0->>'format')::uuid
         AND establishment_id=artifact.establishment_id AND currency=artifact.currency;
       IF layout.id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(route_facts) x
          WHERE x->>'format' IS DISTINCT FROM layout.id::text) THEN
         RAISE EXCEPTION 'A linked correction must keep the original establishment and employee amounts' USING ERRCODE='PT409';
       END IF;
       corrected:=erp_private.t16_render_file(batch,layout,route_facts,wps_file,evidence_file,proof,actor);
     END IF;
     PERFORM erp_private.t16_actor(p_company,p_branch,'issue');
     RETURN erp_private.t02_save_receipt('t16-issue',p_operation,request_hash,
       jsonb_build_object('batch',batch.id,'state',erp_private.t16_batch_state(batch.id),'file',corrected));
   END IF;
   SELECT * INTO prior FROM erp_private.t16_batch_events WHERE batch_id=batch.id AND lane_key=lane_id AND kind=next_state;
   IF FOUND THEN
     IF ROW(prior.reference,prior.document_id,prior.version_id,prior.file_id,prior.proof_sha256)
          IS DISTINCT FROM ROW(bank_reference,evidence_document,evidence_version,evidence_file,proof) THEN
       RAISE EXCEPTION 'This payroll issue already has a different retained bank event' USING ERRCODE='PT409';
     END IF;
   ELSE
     IF NOT (CASE next_state WHEN 'handoff-pending' THEN old_state='prepared'
          WHEN 'submitted' THEN old_state='handoff-pending'
          WHEN 'acknowledged' THEN old_state='submitted'
          WHEN 'accepted' THEN (lane_name='wps' AND old_state IN('submitted','acknowledged'))
            OR (lane_name<>'wps' AND old_state='prepared')
          WHEN 'rejected' THEN old_state IN('handoff-pending','submitted','acknowledged')
          WHEN 'cancelled' THEN old_state IN('prepared','handoff-pending','submitted','acknowledged') END) THEN
       RAISE EXCEPTION 'The bank event does not follow the retained payroll issue' USING ERRCODE='PT409';
     END IF;
     bank_state:=erp_private.t15_bank_state(batch.review_id);
     IF next_state='handoff-pending' OR (lane_name<>'wps' AND next_state='accepted') THEN
       IF review.replacement_requested_by IS NOT NULL THEN
         RAISE EXCEPTION 'Resolve the payroll replacement request before handoff' USING ERRCODE='PT409';
       END IF;
       PERFORM erp_private.t15_assert_current(review.run_id,batch.version_id);
       PERFORM erp_private.t15_assert_reservations(review.id,batch.version_id);
       route_facts:=erp_private.t16_lane_routes(batch,lane_name,artifact.establishment_id);
       IF (lane_name='wps' AND artifact.routing_digest<>erp_private.t02_digest(route_facts))
          OR (lane_name<>'wps' AND EXISTS(SELECT 1 FROM jsonb_array_elements(route_facts) x
            JOIN erp_private.t16_batch_results member ON member.batch_id=batch.id AND member.employee_id=(x->>'employee')::bigint
            WHERE member.routing_digest<>erp_private.t02_digest(x))) THEN
         RAISE EXCEPTION 'Bank setup changed after file preparation. Review the retained issue before replacing it.' USING ERRCODE='PT409';
       END IF;
       IF EXISTS(SELECT 1 FROM erp_private.t16_batch_events e WHERE e.company_id=p_company
           AND (e.kind='handoff-pending' OR (e.lane<>'wps' AND e.kind='accepted')) AND e.reference=bank_reference) THEN
         RAISE EXCEPTION 'That employer handoff reference is already retained' USING ERRCODE='PT409';
       END IF;
     ELSIF old_state<>'prepared' AND NOT EXISTS(SELECT 1 FROM erp_private.t16_batch_events e
       WHERE e.batch_id=batch.id AND e.lane_key=lane_id AND e.kind='handoff-pending' AND e.reference=bank_reference) THEN
       RAISE EXCEPTION 'Verify evidence against the original payroll handoff reference' USING ERRCODE='PT409';
     END IF;
     INSERT INTO erp_private.t16_batch_events(batch_id,company_id,lane,wps_file_id,kind,reference,actor_id,
       document_id,version_id,file_id,proof_sha256)
     VALUES(batch.id,p_company,lane_name,wps_file,next_state,bank_reference,actor,evidence_document,evidence_version,evidence_file,proof)
     RETURNING id INTO event_id;
     IF bank_state='prepared' AND (next_state='handoff-pending' OR (lane_name<>'wps' AND next_state='accepted')) THEN
       -- A T15 replacement transaction with an older snapshot must conflict
       -- with this handoff before evaluating its replacement eligibility.
       UPDATE erp_private.t15_reviews SET claim_count=claim_count WHERE id=review.id;
       PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),batch.review_id,batch.version_id,batch.digest,
         'unknown',event_id,'Payroll handoff reserved before access to original bytes or use of an alternate channel');
       bank_state:='unknown';
     END IF;
     IF bank_state='unknown' AND (next_state='submitted' OR (lane_name<>'wps' AND next_state='accepted')) THEN
       PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),batch.review_id,batch.version_id,batch.digest,
         'submitted',event_id,'Exact payroll handoff or alternative channel authorization verified');
       bank_state:='submitted';
     END IF;
     IF next_state IN('rejected','cancelled') AND erp_private.t16_batch_state(batch.id) IN('rejected','cancelled') THEN
       PERFORM erp_private.t15_record_bank_event(gen_random_uuid(),batch.review_id,batch.version_id,batch.digest,
         CASE WHEN bank_state='prepared' THEN 'cancelled' ELSE erp_private.t16_batch_state(batch.id) END,
         event_id,'Every file and channel was rejected or cancelled with retained evidence');
     END IF;
   END IF;
 END IF;
 PERFORM erp_private.t16_actor(p_company,p_branch,'issue');
 RETURN erp_private.t02_save_receipt('t16-issue',p_operation,request_hash,
    jsonb_build_object('batch',batch.id,'state',erp_private.t16_batch_state(batch.id),'lane_state',next_state));
END $$;

CREATE FUNCTION public.t16_wps_download(p_file uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE batch erp_private.t16_batches; artifact erp_private.t16_files; actor bigint;
BEGIN
 SELECT b.* INTO batch FROM erp_private.t16_batches b JOIN erp_private.t16_files f ON f.batch_id=b.id WHERE f.id=p_file;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payroll file unavailable' USING ERRCODE='42501'; END IF;
 actor:=erp_private.t16_actor(batch.company_id,batch.branch_id,'issue');
 batch:=erp_private.t16_lock_batch(batch.id,batch.company_id,batch.branch_id);
 PERFORM erp_private.t16_touch_batch(batch.id);
 IF erp_private.t16_lane_state(batch.id,p_file::text) NOT IN('handoff-pending','submitted','acknowledged','accepted')
 OR NOT EXISTS(SELECT 1 FROM erp_private.t15_reviews WHERE id=batch.review_id AND state='approved') THEN
   RAISE EXCEPTION 'The exact payroll file is unavailable for handoff' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO STRICT artifact FROM erp_private.t16_files WHERE id=p_file AND batch_id=batch.id;
 PERFORM erp_private.t16_actor(batch.company_id,batch.branch_id,'issue');
 INSERT INTO erp_private.t16_downloads(file_id,actor_id) VALUES(p_file,actor);
 RETURN jsonb_build_object('filename',artifact.filename,'sha256',artifact.sha256,
   'base64',replace(encode(artifact.content,'base64'),chr(10),''));
END $$;

-- Both initial settlement and a later verified correction remain
-- non-replaceable. Only trusted T16 events can reach this private helper.
DO $$
DECLARE definition text; patched text;
BEGIN
 SELECT pg_get_functiondef('erp_private.t15_record_bank_event(uuid,uuid,uuid,text,text,uuid,text)'::regprocedure) INTO definition;
 patched:=replace(definition,$old$   WHEN 'settled' THEN p_kind='reversed'$old$,
 $new$   WHEN 'settled' THEN p_kind='reversed'
   WHEN 'reversed' THEN p_kind IN('partially-settled','settled')$new$);
 IF definition=patched THEN RAISE EXCEPTION 'T15 bank lifecycle correction hook did not match'; END IF;
 EXECUTE patched;
END $$;

REVOKE ALL ON FUNCTION erp_private.t16_row(text[],jsonb,text[]),erp_private.t16_route_result(bigint,bigint,date,bigint,text,numeric,bigint[]),
 erp_private.t16_routes(erp_private.t16_batches),erp_private.t16_render_files(erp_private.t16_batches,jsonb),
 erp_private.t16_render_file(erp_private.t16_batches,erp_private.t16_formats,jsonb,uuid,bigint,text,bigint),
 erp_private.t16_lane_routes(erp_private.t16_batches,text,bigint),
 erp_private.t16_create_issue(bigint,bigint,bigint,uuid,uuid,text),public.t16_wps_issue_command(uuid,bigint,bigint,text,jsonb),
 public.t16_wps_download(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t16_wps_issue_command(uuid,bigint,bigint,text,jsonb),public.t16_wps_download(uuid) TO authenticated;
COMMIT;
