BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Pending edits are private, not new catalogue rows. Output resolution and
-- issuance continue to read the unchanged public published configuration.
CREATE TABLE erp_private.report_template_amendments (
 template_id bigint PRIMARY KEY REFERENCES public.erp_report_templates(id),
 revision bigint NOT NULL CHECK(revision>0),base_revision bigint NOT NULL CHECK(base_revision>0),
 data jsonb NOT NULL,status text NOT NULL CHECK(status IN('draft','in_review','approved','rejected','published','discarded')),
 author_id bigint NOT NULL REFERENCES public.user_profiles(id),submitted_by bigint REFERENCES public.user_profiles(id),
 approved_by bigint REFERENCES public.user_profiles(id),approval_note text,review jsonb,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE erp_private.report_template_amendment_history (
 template_id bigint NOT NULL REFERENCES public.erp_report_templates(id),revision bigint NOT NULL,
 snapshot jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(template_id,revision)
);
CREATE TABLE erp_private.report_template_amendment_operations (
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),operation_id uuid NOT NULL,
 request_hash text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(actor_id,operation_id)
);
ALTER TABLE erp_private.report_template_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.report_template_amendment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.report_template_amendment_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.report_template_amendments OWNER TO postgres;
ALTER TABLE erp_private.report_template_amendment_history OWNER TO postgres;
ALTER TABLE erp_private.report_template_amendment_operations OWNER TO postgres;
REVOKE ALL ON erp_private.report_template_amendments,erp_private.report_template_amendment_history,
 erp_private.report_template_amendment_operations FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.erp_report_template_events DROP CONSTRAINT chk_template_event_type;
ALTER TABLE public.erp_report_template_events ADD CONSTRAINT chk_template_event_type CHECK(event_type IN(
 'template_created','template_updated','template_submitted_for_review','template_approved','template_rejected','template_published',
 'template_archived','template_new_version_created','template_security_review_failed','template_security_review_passed',
 'template_amendment_save','template_amendment_submit','template_amendment_approve','template_amendment_reject',
 'template_amendment_publish','template_amendment_withdraw','template_amendment_discard'));

-- Service-only, like the existing governance transaction: actor and session
-- originate on the server; review is produced by the deterministic scanner.
CREATE FUNCTION public.edit_report_template(p_actor bigint,p_session uuid,p_id bigint,p_action text,
 p_operation uuid DEFAULT NULL,p_revision bigint DEFAULT NULL,p_data jsonb DEFAULT NULL,p_note text DEFAULT NULL,p_review jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 live public.erp_report_templates;candidate public.erp_report_templates;profile public.erp_report_branding_profiles;
 draft erp_private.report_template_amendments;receipt erp_private.report_template_amendment_operations;
 company bigint;destination bigint;is_system boolean;permitted boolean;active_edit boolean;
 payload jsonb;result jsonb;projection jsonb;hash text;token bigint;key text;
 allowed text[]=ARRAY['template_name','template_type','branding_profile_id','default_orientation','page_size','font_family',
  'language_mode','show_logo','show_small_logo','show_address','show_trn','show_license','show_signatory','show_stamp','show_watermark',
  'watermark_text','body_html_en','body_html_ar','custom_css','is_default','is_active'];
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_id IS NULL OR p_id<1 OR p_action IS NULL
  OR p_action NOT IN('read','save','submit','approve','reject','publish','withdraw','discard')
  OR (p_action<>'read' AND (p_operation IS NULL OR p_revision IS NULL OR p_revision<1))
  OR coalesce(length(p_note),0)>2000 OR (p_action IN('reject','discard') AND length(btrim(coalesce(p_note,'')))<5) THEN
  RAISE EXCEPTION 'Invalid amendment contract' USING ERRCODE='22023';END IF;
 IF NOT erp_private.provider_actor_session_valid(p_actor,p_session) THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501';END IF;
 -- Same template lock serializes saves, review and publish with legacy writes.
 SELECT * INTO live FROM public.erp_report_templates WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Template unavailable' USING ERRCODE='PT404';END IF;
 IF live.branding_profile_id IS NOT NULL THEN
  SELECT * INTO profile FROM public.erp_report_branding_profiles WHERE id=live.branding_profile_id AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branding unavailable' USING ERRCODE='42501';END IF;
  company:=profile.owner_company_id;
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.user_profiles u JOIN public.user_roles a ON a.user_profile_id=u.id
  JOIN public.roles r ON r.id=a.role_id WHERE u.id=p_actor AND u.status='active' AND NOT u.must_change_password
  AND a.is_active AND a.owner_company_id IS NULL AND a.branch_id IS NULL AND r.is_active AND r.is_system_role AND r.role_code='system_admin') INTO is_system;
 permitted:=CASE p_action WHEN 'read' THEN
   erp_private.branding_actor_permission(p_actor,p_session,'reports.manage',company)
   OR erp_private.branding_actor_permission(p_actor,p_session,'reports.template.approve',company)
   OR erp_private.branding_actor_permission(p_actor,p_session,'reports.publish',company)
  WHEN 'approve' THEN erp_private.branding_actor_permission(p_actor,p_session,'reports.template.approve',company)
  WHEN 'reject' THEN erp_private.branding_actor_permission(p_actor,p_session,'reports.template.approve',company)
  WHEN 'publish' THEN erp_private.branding_actor_permission(p_actor,p_session,'reports.publish',company)
   OR erp_private.branding_actor_permission(p_actor,p_session,'reports.template.approve',company)
  ELSE is_system END;
 IF NOT permitted THEN RAISE EXCEPTION 'Current template authority required' USING ERRCODE='42501';END IF;
 IF p_action<>'read' THEN
  hash:=encode(sha256(convert_to(jsonb_build_array(p_id,p_revision,p_action,p_data,p_note)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('template-amendment:'||p_actor||':'||p_operation,0));
  SELECT * INTO receipt FROM erp_private.report_template_amendment_operations WHERE actor_id=p_actor AND operation_id=p_operation;
  IF FOUND THEN
   IF receipt.request_hash<>hash THEN RAISE EXCEPTION 'Operation input changed' USING ERRCODE='22023';END IF;
   RETURN receipt.result||jsonb_build_object('replayed',true);
  END IF;
 END IF;
 SELECT * INTO draft FROM erp_private.report_template_amendments WHERE template_id=p_id FOR UPDATE;
 active_edit:=draft.template_id IS NOT NULL AND draft.status NOT IN('published','discarded');
 token:=CASE WHEN active_edit THEN draft.revision ELSE live.workspace_revision END;
 IF p_action<>'read' THEN
  IF profile.id IS NOT NULL AND NOT profile.is_active OR company IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.owner_companies WHERE id=company AND status='active') THEN
   RAISE EXCEPTION 'Issuing company unavailable' USING ERRCODE='42501';END IF;
  IF token<>p_revision OR (active_edit AND draft.base_revision<>live.workspace_revision AND p_action<>'discard') THEN
   RAISE EXCEPTION 'Template changed; compare current publication' USING ERRCODE='PT409';END IF;
  IF live.governance_status NOT IN('approved','published') OR NOT live.is_active THEN
   RAISE EXCEPTION 'Only active approved or published templates support amendments' USING ERRCODE='22023';END IF;
 END IF;
 IF p_action='save' THEN
  IF active_edit AND draft.status NOT IN('draft','rejected') THEN RAISE EXCEPTION 'Withdraw review before editing' USING ERRCODE='22023';END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR p_data='{}'::jsonb OR octet_length(p_data::text)>2100000
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT k=ANY(allowed)) THEN
   RAISE EXCEPTION 'Invalid configuration fields' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(p_data) e WHERE
   (e.key=ANY(ARRAY['show_logo','show_small_logo','show_address','show_trn','show_license','show_signatory','show_stamp','show_watermark','is_default','is_active']) AND jsonb_typeof(e.value)<>'boolean') OR
   (e.key='branding_profile_id' AND jsonb_typeof(e.value)<>'null' AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[1-9][0-9]*$')) OR
   (e.key=ANY(ARRAY['template_name','template_type','default_orientation','page_size','font_family','language_mode']) AND jsonb_typeof(e.value)<>'string') OR
   (e.key=ANY(ARRAY['watermark_text','body_html_en','body_html_ar','custom_css']) AND jsonb_typeof(e.value) NOT IN('string','null'))) THEN
   RAISE EXCEPTION 'Use typed configuration fields' USING ERRCODE='22023';END IF;
  payload:=CASE WHEN active_edit THEN draft.data ELSE '{}'::jsonb END||p_data;
  FOREACH key IN ARRAY ARRAY['template_name','font_family','watermark_text'] LOOP
   IF jsonb_typeof(payload->key)='string' THEN payload:=jsonb_set(payload,ARRAY[key],to_jsonb(btrim(payload->>key)));END IF;
  END LOOP;
  candidate:=jsonb_populate_record(live,payload);
  IF candidate.branding_profile_id IS NOT NULL THEN
   SELECT owner_company_id INTO destination FROM public.erp_report_branding_profiles
    WHERE id=candidate.branding_profile_id AND deleted_at IS NULL AND is_active FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Branding unavailable' USING ERRCODE='42501';END IF;
  END IF;
  IF destination IS DISTINCT FROM company THEN RAISE EXCEPTION 'Template company is immutable' USING ERRCODE='22023';END IF;
  IF candidate.template_name IS NULL OR length(candidate.template_name) NOT BETWEEN 2 AND 200
   OR candidate.template_type IS NULL OR candidate.template_type NOT IN('report','letter','certificate','form','checklist','badge','external_submission','group_summary')
   OR candidate.default_orientation NOT IN('portrait','landscape') OR candidate.page_size NOT IN('a4','letter','legal')
   OR candidate.language_mode NOT IN('en','ar','bilingual') OR length(candidate.font_family) NOT BETWEEN 1 AND 100
   OR coalesce(length(candidate.watermark_text),0)>100 OR coalesce(length(candidate.body_html_en),0)>1000000
   OR coalesce(length(candidate.body_html_ar),0)>1000000 OR coalesce(length(candidate.custom_css),0)>50000 THEN
   RAISE EXCEPTION 'Invalid template values' USING ERRCODE='22023';END IF;
  IF (candidate.show_stamp OR candidate.show_signatory) AND NOT erp_private.branding_actor_permission(p_actor,p_session,'reports.sign',company) THEN
   RAISE EXCEPTION 'Signing authority required' USING ERRCODE='42501';END IF;
  -- Monotone internal revisions also cover later editing cycles; no token reuse.
  token:=greatest(coalesce(draft.revision,0),live.workspace_revision)+1;
  INSERT INTO erp_private.report_template_amendments(template_id,revision,base_revision,data,status,author_id)
   VALUES(p_id,token,live.workspace_revision,payload,'draft',p_actor)
   ON CONFLICT(template_id) DO UPDATE SET revision=excluded.revision,base_revision=excluded.base_revision,data=excluded.data,
    status='draft',author_id=p_actor,submitted_by=NULL,approved_by=NULL,approval_note=NULL,review=NULL,updated_at=clock_timestamp()
   RETURNING * INTO draft;
 ELSIF p_action NOT IN('read','save') THEN
  IF NOT active_edit THEN RAISE EXCEPTION 'No pending edit' USING ERRCODE='22023';END IF;
  IF p_action='submit' THEN
   IF draft.status NOT IN('draft','rejected') OR jsonb_typeof(p_review) IS DISTINCT FROM 'object'
    OR p_review->'passed' IS DISTINCT FROM 'true'::jsonb OR p_review->>'severity' IS NULL OR p_review->>'severity' NOT IN('none','warning')
    OR jsonb_typeof(p_review->'findings') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'A passed server security review is required' USING ERRCODE='22023';END IF;
   draft.status:='in_review';draft.submitted_by:=p_actor;draft.approved_by:=NULL;draft.approval_note:=NULL;draft.review:=p_review;
  ELSIF p_action IN('approve','reject') THEN
   IF draft.status<>'in_review' OR p_actor IN(draft.author_id,draft.submitted_by) THEN
    RAISE EXCEPTION 'A different authorized reviewer is required' USING ERRCODE='22023';END IF;
   IF p_action='approve' THEN draft.status:='approved';draft.approved_by:=p_actor;draft.approval_note:=p_note;
   ELSE draft.status:='rejected';draft.approved_by:=NULL;draft.approval_note:=NULL;END IF;
  ELSIF p_action='withdraw' THEN
   IF draft.status NOT IN('in_review','approved') THEN RAISE EXCEPTION 'No review to withdraw' USING ERRCODE='22023';END IF;
   draft.status:='draft';draft.submitted_by:=NULL;draft.approved_by:=NULL;draft.approval_note:=NULL;draft.review:=NULL;
  ELSIF p_action='discard' THEN
   draft.status:='discarded';
  ELSIF p_action='publish' THEN
   IF draft.status<>'approved' OR draft.approved_by IS NULL OR draft.approved_by=draft.author_id OR draft.review->'passed' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'Independent approval is required' USING ERRCODE='22023';END IF;
   -- An approver whose grant/session/account was revoked cannot lend authority
   -- to a later publish. A fresh review is required instead.
   IF NOT EXISTS(SELECT 1 FROM auth.sessions s JOIN public.user_profiles u ON u.auth_user_id=s.user_id
    WHERE u.id=draft.approved_by AND erp_private.branding_actor_permission(u.id,s.id,'reports.template.approve',company)) THEN
    RAISE EXCEPTION 'Reviewer authority no longer available' USING ERRCODE='42501';END IF;
   candidate:=jsonb_populate_record(live,draft.data);
   IF candidate.branding_profile_id IS NOT NULL THEN
    SELECT owner_company_id INTO destination FROM public.erp_report_branding_profiles
     WHERE id=candidate.branding_profile_id AND deleted_at IS NULL AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Branding unavailable' USING ERRCODE='42501';END IF;
   END IF;
   IF destination IS DISTINCT FROM company THEN RAISE EXCEPTION 'Template company changed' USING ERRCODE='PT409';END IF;
   IF (candidate.show_stamp OR candidate.show_signatory) AND NOT erp_private.branding_actor_permission(p_actor,p_session,'reports.sign',company) THEN
    RAISE EXCEPTION 'Signing authority required' USING ERRCODE='42501';END IF;
   IF EXISTS(SELECT 1 FROM public.erp_report_templates WHERE parent_template_id=p_id AND deleted_at IS NULL AND is_active AND governance_status<>'archived') THEN
    RAISE EXCEPTION 'Reconcile the existing revision first' USING ERRCODE='PT409';END IF;
   -- Same public identity; normal revision/history trigger snapshots old/new.
   UPDATE public.erp_report_templates SET template_name=candidate.template_name,template_type=candidate.template_type,
    branding_profile_id=candidate.branding_profile_id,default_orientation=candidate.default_orientation,page_size=candidate.page_size,
    font_family=candidate.font_family,language_mode=candidate.language_mode,show_logo=candidate.show_logo,show_small_logo=candidate.show_small_logo,
    show_address=candidate.show_address,show_trn=candidate.show_trn,show_license=candidate.show_license,show_signatory=candidate.show_signatory,
    show_stamp=candidate.show_stamp,show_watermark=candidate.show_watermark,watermark_text=candidate.watermark_text,
    body_html_en=candidate.body_html_en,body_html_ar=candidate.body_html_ar,custom_css=candidate.custom_css,
    is_default=candidate.is_default,is_active=candidate.is_active,version_no=live.version_no+1,governance_status='published',
    submitted_by=draft.submitted_by,submitted_at=clock_timestamp(),approved_by=draft.approved_by,approved_at=clock_timestamp(),approval_notes=draft.approval_note,
    published_by=p_actor,published_at=clock_timestamp(),security_review_status='passed',security_review_notes=draft.review::text,
    security_review_by=draft.submitted_by,security_review_at=clock_timestamp(),updated_by=p_actor,
    rejected_by=NULL,rejected_at=NULL,rejection_reason=NULL
    WHERE id=p_id RETURNING * INTO live;
   draft.status:='published';
  END IF;
  draft.revision:=draft.revision+1;draft.updated_at:=clock_timestamp();
  UPDATE erp_private.report_template_amendments SET revision=draft.revision,status=draft.status,submitted_by=draft.submitted_by,
   approved_by=draft.approved_by,approval_note=draft.approval_note,review=draft.review,updated_at=draft.updated_at WHERE template_id=p_id;
 END IF;
 IF p_action IN('approve','publish') AND EXISTS(SELECT 1 FROM jsonb_array_elements(draft.review->'findings') f
  WHERE f->>'rule' IN('restricted_field_elevated_approval_required','sensitive_fields_require_elevated_approval'))
  AND NOT erp_private.branding_actor_permission(p_actor,p_session,'reports.sensitive_fields.approve',company) THEN
  RAISE EXCEPTION 'Sensitive-field approval required' USING ERRCODE='42501';END IF;
 IF p_action<>'read' THEN
  INSERT INTO erp_private.report_template_amendment_history(template_id,revision,snapshot) VALUES(p_id,draft.revision,to_jsonb(draft));
  PERFORM erp_private.record_template_transition(live,p_actor,company,p_operation,'template_amendment_'||p_action,p_note,
   jsonb_build_object('amendment_revision',draft.revision,'base_revision',draft.base_revision));
 END IF;
 active_edit:=draft.template_id IS NOT NULL AND draft.status NOT IN('published','discarded');
 projection:=to_jsonb(live)||CASE WHEN active_edit THEN draft.data||jsonb_build_object('workspace_revision',draft.revision::text,
  'governance_status',draft.status,'security_review_status',CASE WHEN draft.review IS NULL THEN 'pending' ELSE 'passed' END) ELSE '{}'::jsonb END;
 result:=jsonb_build_object('id',p_id,'revision',CASE WHEN active_edit THEN draft.revision ELSE live.workspace_revision END::text,
  'changed',p_action<>'read','replayed',false,'owner_company_id',company,'template',projection,'published_template',to_jsonb(live),
  'amendment',CASE WHEN draft.template_id IS NULL THEN NULL ELSE jsonb_build_object('status',draft.status,'base_revision',draft.base_revision::text,
   'author_id',draft.author_id,'approved_by',draft.approved_by,'review',draft.review) END);
 IF p_action<>'read' THEN INSERT INTO erp_private.report_template_amendment_operations(actor_id,operation_id,request_hash,result)
  VALUES(p_actor,p_operation,hash,result);END IF;
 RETURN result;
END $$;
ALTER FUNCTION public.edit_report_template(bigint,uuid,bigint,text,uuid,bigint,jsonb,text,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.edit_report_template(bigint,uuid,bigint,text,uuid,bigint,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edit_report_template(bigint,uuid,bigint,text,uuid,bigint,jsonb,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.edit_report_template(bigint,uuid,bigint,text,uuid,bigint,jsonb,text,jsonb) IS
 'Same-identity template amendments; explicit global system editor, private staged config, independent review, atomic publish, immutable snapshots and replay.';
NOTIFY pgrst,'reload schema';
COMMIT;
