BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE erp_private.mobile_dms_favourites(
 actor bigint NOT NULL REFERENCES public.user_profiles, document_id bigint NOT NULL REFERENCES public.dms_documents, saved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,document_id));
ALTER TABLE erp_private.mobile_dms_favourites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_dms_favourites FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.mobile_dms_valid_criteria(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text;
BEGIN
 PERFORM erp_private.mobile_dms_keys(v,ARRAY['version','search','personal','validity'],ARRAY['entityType','entityId','typeId']);
 IF v->'version'<>'1'::jsonb OR jsonb_typeof(v->'search')<>'string' OR length(v->>'search')>200 OR jsonb_typeof(v->'personal')<>'boolean'
 OR coalesce(v->>'validity','') NOT IN ('all','valid','expired','expiring') OR (v?'entityId')<>(v?'entityType') OR (v?'entityType' AND (coalesce(v->>'entityType','') NOT IN ('site','employee') OR (v->>'personal')::boolean)) THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['entityId','typeId'] LOOP IF v?k AND (jsonb_typeof(v->k)<>'number' OR v->>k !~ '^[1-9][0-9]{0,15}$' OR (v->>k)::numeric>9007199254740991) THEN RETURN false; END IF; END LOOP;
 RETURN true;
EXCEPTION WHEN SQLSTATE '22023' THEN RETURN false;
END $$;
CREATE FUNCTION erp_private.mobile_dms_filter_revision(s public.dms_saved_searches) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT erp_private.mobile_dms_hash(jsonb_build_array(s.id,s.user_id,s.search_name,s.filter_json,s.updated_at,s.deleted_at,s.is_shared));
$$;
CREATE FUNCTION erp_private.mobile_dms_collections(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor(); doc bigint:=(p_data->>'documentId')::bigint; target bigint:=(p_data->>'id')::bigint; pg int:=(p_data->>'page')::int;
 op uuid:=(p_data->>'operationId')::uuid; s public.dms_saved_searches; r jsonb; n bigint; rows jsonb; name text:=btrim(p_data->>'name');
BEGIN
 IF p_action='favourite_set' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','value']);
  IF doc IS NULL OR doc<1 OR jsonb_typeof(p_data->'value')<>'boolean' THEN RAISE EXCEPTION 'Invalid favourite' USING ERRCODE='22023'; END IF;
  IF (p_data->>'value')::boolean THEN
   PERFORM erp_private.mobile_dms_lock(doc);
   IF NOT erp_private.mobile_dms_can(doc,'dms.documents.view') THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='PT404'; END IF;
   INSERT INTO erp_private.mobile_dms_favourites(actor,document_id) VALUES(who,doc) ON CONFLICT DO NOTHING;
  ELSE DELETE FROM erp_private.mobile_dms_favourites WHERE actor=who AND document_id=doc; END IF;
  RETURN p_data;
 ELSIF p_action IN ('favourites','filters') THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['page']);
  IF pg IS NULL OR pg NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
  IF p_action='favourites' THEN
   WITH filtered AS MATERIALIZED (SELECT d.id,d.title,d.document_no,d.expiry_date,d.status,t.name_en,f.saved_at FROM erp_private.mobile_dms_favourites f JOIN public.dms_documents d ON d.id=f.document_id LEFT JOIN public.dms_document_types t ON t.id=d.document_type_id WHERE f.actor=who AND erp_private.mobile_dms_can(d.id,'dms.documents.view')),
   selected AS (SELECT * FROM filtered ORDER BY saved_at DESC,id DESC LIMIT 25 OFFSET (pg-1)*25)
   SELECT (SELECT count(*) FROM filtered),coalesce(jsonb_agg(jsonb_build_object('id',id,'documentId',id,'number',document_no,'title',title,'expiry',expiry_date,'status',status,'type',name_en,'savedAt',saved_at) ORDER BY saved_at DESC,id DESC),'[]') INTO n,rows FROM selected;
  ELSE
   WITH filtered AS MATERIALIZED(SELECT f.* FROM public.dms_saved_searches f WHERE f.user_id=who AND NOT f.is_shared AND f.deleted_at IS NULL AND length(f.search_name) BETWEEN 1 AND 80 AND erp_private.mobile_dms_valid_criteria(f.filter_json)),
   selected AS(SELECT * FROM filtered ORDER BY updated_at DESC,id DESC LIMIT 25 OFFSET (pg-1)*25)
   SELECT (SELECT count(*) FROM filtered),coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.search_name,'criteria',f.filter_json,'revision',erp_private.mobile_dms_filter_revision(f::public.dms_saved_searches),'updatedAt',f.updated_at) ORDER BY f.updated_at DESC,f.id DESC),'[]') INTO n,rows FROM selected f;
  END IF;
  RETURN jsonb_build_object('rows',rows,'totalCount',n);
 ELSIF p_action IN ('save_filter','delete_filter') THEN
  PERFORM erp_private.mobile_dms_keys(p_data,CASE WHEN p_action='save_filter' THEN ARRAY['name','criteria','operationId'] ELSE ARRAY['id','revision','operationId'] END,CASE WHEN p_action='save_filter' THEN ARRAY['id','revision'] ELSE '{}'::text[] END);
  IF (p_data?'id')<>(p_data?'revision') OR (p_action='save_filter' AND (name IS NULL OR length(name) NOT BETWEEN 1 AND 80 OR NOT erp_private.mobile_dms_valid_criteria(p_data->'criteria'))) THEN RAISE EXCEPTION 'Invalid filter' USING ERRCODE='22023'; END IF;
  r:=erp_private.mobile_dms_reserve('filter/'||p_action,p_data); IF r IS NOT NULL THEN RETURN r; END IF;
  IF target IS NOT NULL THEN
   SELECT * INTO s FROM public.dms_saved_searches WHERE id=target AND user_id=who AND NOT is_shared AND deleted_at IS NULL FOR UPDATE;
   IF s.id IS NULL THEN RAISE EXCEPTION 'Unavailable saved filter' USING ERRCODE='PT404'; END IF;
   IF erp_private.mobile_dms_filter_revision(s) IS DISTINCT FROM p_data->>'revision' THEN RAISE EXCEPTION 'Filter changed' USING ERRCODE='PT409'; END IF;
  END IF;
  IF p_action='delete_filter' THEN
   UPDATE public.dms_saved_searches SET deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=target;
   r:=jsonb_build_object('id',target,'operationId',op,'deleted',true,'replayed',false);
  ELSE
   IF target IS NULL THEN INSERT INTO public.dms_saved_searches(user_id,search_name,filter_json,is_shared) VALUES(who,name,p_data->'criteria',false) RETURNING * INTO s;
   ELSE UPDATE public.dms_saved_searches SET search_name=name,filter_json=p_data->'criteria',updated_at=clock_timestamp() WHERE id=target RETURNING * INTO s; END IF;
   r:=jsonb_build_object('id',s.id,'operationId',op,'revision',erp_private.mobile_dms_filter_revision(s),'replayed',false);
  END IF;
  RETURN erp_private.mobile_dms_settle(op,r);
 END IF;
 RAISE EXCEPTION 'Invalid collection action' USING ERRCODE='22023';
END $$;
CREATE FUNCTION public.mobile_dms_collections(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_dms_collections(p_action,p_data) $$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_valid_criteria(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_filter_revision(public.dms_saved_searches) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_collections(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_collections(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_collections(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_collections(text,jsonb) TO authenticated;
-- Receipt recovery never invokes reserve, settlement, a provider, a mutation or a locking read.
CREATE FUNCTION erp_private.mobile_dms_receipt(p_command text,p_data jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor(); result jsonb; doc bigint:=(p_data->>'documentId')::bigint;
 target bigint; f public.dms_saved_searches; s erp_private.mobile_dms_shares; criteria jsonb;
BEGIN
 SELECT r.result INTO result FROM erp_private.mobile_dms_receipts r WHERE r.actor=who AND r.operation=(p_data->>'operationId')::uuid
   AND r.command=p_command AND r.payload_hash=erp_private.mobile_dms_hash(p_data) AND r.state='settled';
 IF result IS NULL THEN RETURN false; END IF;
 IF doc IS NOT NULL AND NOT erp_private.mobile_dms_can(doc,'dms.documents.view') THEN RETURN false; END IF;
 CASE
 WHEN p_command IN ('comment/add','comment/edit','comment/delete') THEN
  RETURN EXISTS(SELECT FROM public.dms_document_comments c WHERE c.id=(result->>'commentId')::bigint AND c.document_id=doc AND c.created_by=who);
 WHEN p_command='metadata/save' THEN RETURN erp_private.mobile_dms_can(doc,'dms.documents.edit') OR erp_private.mobile_dms_can(doc,'dms.admin');
 WHEN p_command='tags/change' THEN RETURN erp_private.mobile_dms_can(doc,'dms.documents.manage_tags') OR erp_private.mobile_dms_can(doc,'dms.documents.edit');
 WHEN p_command IN ('filter/save_filter','filter/delete_filter') THEN
  IF NOT EXISTS(SELECT FROM (
    SELECT c.id AS company,NULL::bigint AS branch FROM public.owner_companies c WHERE c.status='active'
    UNION ALL SELECT b.owner_company_id,b.id FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id AND c.status='active' WHERE b.status='active'
  ) scope WHERE erp_private.permission_in_scope('dms.documents.view',scope.company,scope.branch) OR erp_private.permission_in_scope('dms.admin',scope.company,scope.branch)) THEN RETURN false; END IF;
  SELECT * INTO f FROM public.dms_saved_searches WHERE id=(result->>'id')::bigint AND user_id=who AND NOT is_shared;
  IF f.id IS NULL THEN RETURN false; END IF;
  FOR criteria IN SELECT f.filter_json UNION SELECT p_data->'criteria' LOOP
   IF criteria?'entityId' THEN PERFORM erp_private.mobile_dms_parent(jsonb_build_object('entityType',criteria->'entityType','entityId',criteria->'entityId')); END IF;
   IF criteria->'personal'='true'::jsonb THEN PERFORM erp_private.mobile_dms_parent(jsonb_build_object('entityType','employee','entityId',erp_private.mobile_hr_linked_id())); END IF;
  END LOOP;
  RETURN true;
 WHEN p_command IN ('request/create/missing','request/act/missing','request/create/renewal','request/act/renewal') THEN
  target:=(result->'request'->>'id')::bigint;
  RETURN erp_private.mobile_dms_request_row(p_data->>'kind',target,p_data->'parent') IS NOT NULL;
 WHEN p_command IN ('share/create','share/revoke') THEN
  SELECT * INTO s FROM erp_private.mobile_dms_shares WHERE id=coalesce((result->>'id')::bigint,(result->>'shareId')::bigint);
  RETURN s.id IS NOT NULL AND erp_private.mobile_dms_can(s.document_id,'dms.documents.view') AND
    ((s.issuer=who AND erp_private.mobile_dms_can(s.document_id,'dms.documents.share_external')) OR erp_private.mobile_dms_can(s.document_id,'dms.admin'));
 ELSE RETURN false;
 END CASE;
EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE 'PT404' OR SQLSTATE 'PT409' THEN RETURN false;
END $$;
CREATE FUNCTION public.mobile_dms_receipt(p_command text,p_data jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.mobile_dms_receipt(p_command,p_data)$$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_receipt(text,jsonb),public.mobile_dms_receipt(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_receipt(text,jsonb),public.mobile_dms_receipt(text,jsonb) TO authenticated;
COMMIT;
