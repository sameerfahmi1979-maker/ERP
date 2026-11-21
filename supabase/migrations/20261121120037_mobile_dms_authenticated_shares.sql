BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE erp_private.mobile_dms_shares(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,issuer bigint NOT NULL REFERENCES public.user_profiles,recipient bigint NOT NULL REFERENCES public.user_profiles,
 document_id bigint NOT NULL REFERENCES public.dms_documents, version_id bigint NOT NULL REFERENCES public.dms_document_versions,file_id bigint NOT NULL REFERENCES public.dms_document_files,
 token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[0-9a-f]{64}$'),source_hash text NOT NULL CHECK(source_hash~'^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,revoked_at timestamptz, CHECK(expires_at>created_at AND expires_at<=created_at+interval '168 hours'));
CREATE INDEX mobile_dms_share_document ON erp_private.mobile_dms_shares(document_id,id DESC);
ALTER TABLE erp_private.mobile_dms_shares ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_dms_shares FROM PUBLIC,anon,authenticated,service_role;
-- Only the canonical in-process response can bind a real F07 receipt to one named link.
CREATE TABLE erp_private.mobile_dms_share_deliveries(event_id bigint PRIMARY KEY REFERENCES public.dms_document_events,share_id bigint NOT NULL REFERENCES erp_private.mobile_dms_shares,actor bigint NOT NULL REFERENCES public.user_profiles,consumed boolean NOT NULL DEFAULT false);
ALTER TABLE erp_private.mobile_dms_share_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_dms_share_deliveries FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_dms_bind_share_response(p_event bigint,p_share bigint,p_actor bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted response required' USING ERRCODE='42501'; END IF;
 INSERT INTO erp_private.mobile_dms_share_deliveries(event_id,share_id,actor) VALUES(p_event,p_share,p_actor);
END $$;
CREATE FUNCTION public.mobile_dms_bind_share_response(p_event bigint,p_share bigint,p_actor bigint) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.mobile_dms_bind_share_response(p_event,p_share,p_actor)$$;
REVOKE ALL ON FUNCTION public.mobile_dms_bind_share_response(bigint,bigint,bigint),erp_private.mobile_dms_bind_share_response(bigint,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_dms_bind_share_response(bigint,bigint,bigint),erp_private.mobile_dms_bind_share_response(bigint,bigint,bigint) TO service_role;
CREATE FUNCTION erp_private.mobile_dms_nominees(company bigint,branch bigint) RETURNS TABLE(id bigint,label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.id,coalesce(nullif(p.display_name,''),p.full_name) FROM public.user_profiles p
 WHERE p.status='active' AND NOT p.must_change_password AND p.auth_user_id IS NOT NULL AND p.id<>public.current_user_profile_id()
 AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_profile_id=p.id AND ur.is_active AND r.is_active AND ur.owner_company_id=company AND (ur.branch_id IS NULL OR ur.branch_id=branch));
$$;
CREATE FUNCTION erp_private.mobile_dms_share_source(s erp_private.mobile_dms_shares, caps text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE src jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.dms_documents d WHERE d.id=s.document_id AND (d.is_archived OR d.superseded_by_document_id IS NOT NULL)) THEN RAISE EXCEPTION 'Archived source' USING ERRCODE='PT409'; END IF;
 src:=erp_private.mobile_dms_source(jsonb_build_object('documentId',s.document_id,'versionId',s.version_id,'fileId',s.file_id,'sourceHash',s.source_hash),caps);
 RETURN src;
END $$;
CREATE FUNCTION erp_private.mobile_dms_share_state(s erp_private.mobile_dms_shares) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF s.revoked_at IS NOT NULL THEN RETURN 'revoked'; END IF;
 IF s.expires_at<=clock_timestamp() THEN RETURN 'expired'; END IF;
 PERFORM erp_private.mobile_dms_share_source(s,ARRAY['dms.documents.view']);
 RETURN 'active';
EXCEPTION WHEN SQLSTATE 'PT409' THEN RETURN 'stale_source'; END $$;
CREATE FUNCTION erp_private.mobile_dms_shares(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=erp_private.mobile_dms_actor(); doc bigint:=(p_data->>'documentId')::bigint; op uuid:=(p_data->>'operationId')::uuid;
 s erp_private.mobile_dms_shares; d public.dms_documents; src jsonb; rec jsonb; rows jsonb; count_rows bigint; pg integer:=(p_data->>'page')::integer;
 base_caps text[]:=ARRAY['dms.documents.preview','dms.documents.download']; issue_caps text[]:=base_caps||ARRAY['dms.documents.share_external'];
 now_at timestamptz; hrs int:=(p_data->>'lifetimeHours')::int; is_manager boolean; event_id bigint;
BEGIN
 IF p_action IN ('recipients','list','create') THEN
  IF p_action='create' THEN PERFORM erp_private.mobile_dms_lock(doc); END IF;
  SELECT * INTO d FROM public.dms_documents WHERE id=doc AND deleted_at IS NULL;
  IF d.id IS NULL OR NOT erp_private.mobile_dms_can(doc,'dms.documents.share_external') THEN RAISE EXCEPTION 'Share access unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action IN ('recipients','list') THEN
  IF pg IS NULL OR pg NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
  IF p_action='recipients' THEN
   PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','page','sourceHash','search']);
   IF length(p_data->>'search')>100 THEN RAISE EXCEPTION 'Invalid search' USING ERRCODE='22023'; END IF;
   -- Accept the retained current document or an explicitly listed current file fingerprint.
   src:=erp_private.mobile_dms_source(jsonb_build_object('documentId',doc),issue_caps);
   IF d.is_archived OR d.superseded_by_document_id IS NOT NULL OR (src->>'sourceHash' IS DISTINCT FROM p_data->>'sourceHash' AND NOT EXISTS(
    SELECT 1 FROM public.dms_document_files f WHERE f.document_id=doc AND f.version_id=d.current_version_id AND f.deleted_at IS NULL AND f.file_role IN ('attachment','original')
    AND erp_private.mobile_dms_source(jsonb_build_object('documentId',doc,'fileId',f.id),issue_caps)->>'sourceHash'=p_data->>'sourceHash')) THEN RAISE EXCEPTION 'Source changed' USING ERRCODE='PT409'; END IF;
   WITH all_rows AS MATERIALIZED (SELECT * FROM erp_private.mobile_dms_nominees(d.owning_company_id,d.owning_branch_id) n WHERE strpos(lower(n.label),lower(p_data->>'search'))>0),
   page_rows AS (SELECT * FROM all_rows ORDER BY label,id LIMIT 25 OFFSET (pg-1)*25)
   SELECT (SELECT count(*) FROM all_rows),coalesce(jsonb_agg(jsonb_build_object('profileId',id,'label',label) ORDER BY label,id),'[]') INTO count_rows,rows FROM page_rows;
  ELSE
   PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','page']);
   is_manager:=erp_private.mobile_dms_can(doc,'dms.admin');
   WITH all_rows AS MATERIALIZED (SELECT l.* FROM erp_private.mobile_dms_shares l WHERE l.document_id=doc AND (l.issuer=actor OR is_manager)),
   page_rows AS (SELECT l.*,coalesce(nullif(p.display_name,''),p.full_name) label FROM all_rows l JOIN public.user_profiles p ON p.id=l.recipient ORDER BY l.id DESC LIMIT 25 OFFSET (pg-1)*25)
   SELECT (SELECT count(*) FROM all_rows),coalesce(jsonb_agg(jsonb_build_object('id',x.id,'recipientLabel',x.label,'createdAt',x.created_at,'expiresAt',x.expires_at,'state',erp_private.mobile_dms_share_state(l),'canRevoke',x.revoked_at IS NULL,'versionId',x.version_id,'fileId',x.file_id) ORDER BY x.id DESC),'[]')
   INTO count_rows,rows FROM page_rows x JOIN erp_private.mobile_dms_shares l ON l.id=x.id;
  END IF;
  RETURN jsonb_build_object('rows',rows,'totalCount',count_rows);
 ELSIF p_action='create' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','versionId','fileId','sourceHash','recipientProfileId','tokenHash','lifetimeHours','operationId']);
  IF hrs IS NULL OR hrs NOT IN(1,24,168) OR NOT coalesce(p_data->>'tokenHash'~'^[0-9a-f]{64}$',false) THEN RAISE EXCEPTION 'Invalid link' USING ERRCODE='22023'; END IF;
  PERFORM erp_private.mobile_dms_source(p_data-ARRAY['recipientProfileId','tokenHash','lifetimeHours','operationId'],issue_caps);
  IF d.is_archived OR d.superseded_by_document_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM erp_private.mobile_dms_nominees(d.owning_company_id,d.owning_branch_id) n WHERE n.id=(p_data->>'recipientProfileId')::bigint) THEN RAISE EXCEPTION 'Nomination unavailable' USING ERRCODE='42501'; END IF;
  rec:=erp_private.mobile_dms_reserve('share/create',p_data); IF rec IS NOT NULL THEN RETURN rec; END IF;
  now_at:=clock_timestamp();
  INSERT INTO erp_private.mobile_dms_shares(issuer,recipient,document_id,version_id,file_id,token_hash,source_hash,created_at,expires_at)
  VALUES(actor,(p_data->>'recipientProfileId')::bigint,doc,(p_data->>'versionId')::bigint,(p_data->>'fileId')::bigint,p_data->>'tokenHash',p_data->>'sourceHash',now_at,now_at+make_interval(hours=>hrs)) RETURNING * INTO s;
  PERFORM erp_private.mobile_dms_audit(doc,'mobile_dms_shares',s.id,'create','share_created');
  RETURN erp_private.mobile_dms_settle(op,jsonb_build_object('id',s.id,'operationId',op,'replayed',false,'expiresAt',s.expires_at,'source',jsonb_build_object('documentId',doc,'versionId',s.version_id,'fileId',s.file_id)));
 ELSIF p_action='revoke' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['shareId','operationId']);
  SELECT * INTO s FROM erp_private.mobile_dms_shares WHERE id=(p_data->>'shareId')::bigint FOR UPDATE;
  IF s.id IS NULL OR NOT ((s.issuer=actor AND erp_private.mobile_dms_can(s.document_id,'dms.documents.share_external')) OR erp_private.mobile_dms_can(s.document_id,'dms.admin')) THEN RAISE EXCEPTION 'Share unavailable' USING ERRCODE='PT404'; END IF;
  rec:=erp_private.mobile_dms_reserve('share/revoke',p_data); IF rec IS NOT NULL THEN RETURN rec; END IF;
  UPDATE erp_private.mobile_dms_shares SET revoked_at=clock_timestamp() WHERE id=s.id AND revoked_at IS NULL;
  IF FOUND THEN PERFORM erp_private.mobile_dms_audit(s.document_id,'mobile_dms_shares',s.id,'update','share_revoked'); END IF;
  RETURN erp_private.mobile_dms_settle(op,jsonb_build_object('shareId',s.id,'operationId',op,'state','revoked','replayed',false));
 ELSIF p_action IN ('resolve','preflight','delivered') THEN
  PERFORM erp_private.mobile_dms_keys(p_data,CASE WHEN p_action='delivered' THEN ARRAY['tokenHash','eventId'] ELSE ARRAY['tokenHash'] END);
  SELECT * INTO s FROM erp_private.mobile_dms_shares WHERE token_hash=p_data->>'tokenHash' AND recipient=actor FOR SHARE;
  IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Share unavailable' USING ERRCODE='PT404'; END IF;
  src:=erp_private.mobile_dms_share_source(s,base_caps);
  SELECT * INTO STRICT d FROM public.dms_documents WHERE id=s.document_id;
  IF p_action='resolve' THEN PERFORM erp_private.mobile_dms_audit(d.id,'mobile_dms_shares',s.id,'view','share_resolved');
  ELSIF p_action='delivered' THEN
   event_id:=(p_data->>'eventId')::bigint;
   UPDATE erp_private.mobile_dms_share_deliveries x SET consumed=true WHERE x.event_id=(p_data->>'eventId')::bigint AND x.share_id=s.id AND x.actor=s.recipient AND NOT x.consumed;
   IF NOT FOUND THEN RAISE EXCEPTION 'Unbound delivery' USING ERRCODE='PT409'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.dms_document_events e WHERE e.id=event_id AND e.document_id=d.id AND e.performed_by=actor AND e.event_type IN ('file_preview_response_prepared','file_download_response_prepared') AND e.metadata_json->>'delivery'='response_prepared' AND (e.metadata_json->>'file_id')::bigint=s.file_id AND (e.metadata_json->>'version_id')::bigint=s.version_id) THEN RAISE EXCEPTION 'Delivery not confirmed' USING ERRCODE='PT409'; END IF;
   PERFORM erp_private.mobile_dms_audit(d.id,'mobile_dms_shares',s.id,'view','share_response_prepared');
  END IF;
  RETURN jsonb_build_object('shareId',s.id,'title',d.title,'number',d.document_no,'expiresAt',s.expires_at,'source',jsonb_build_object('documentId',d.id,'versionId',s.version_id,'fileId',s.file_id,'sourceHash',s.source_hash),'canPreview',true,'canDownload',true);
 END IF;
 RAISE EXCEPTION 'Invalid share action' USING ERRCODE='22023';
END $$;
CREATE FUNCTION public.mobile_dms_shares(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.mobile_dms_shares(p_action,p_data)$$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_nominees(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_share_source(erp_private.mobile_dms_shares,text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_share_state(erp_private.mobile_dms_shares) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_shares(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_shares(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_shares(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_shares(text,jsonb) TO authenticated;
COMMIT;
