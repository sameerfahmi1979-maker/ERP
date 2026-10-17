BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- Original subject is part of the F06 allocator's existing request hash. No
-- second allocator, post-create mutation, legacy backfill or new RLS exception.
CREATE FUNCTION erp_private.f07_manual_origin_scope(p_context jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE kind text:=p_context->>'entityType';subject bigint;scope record;employee bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Original subject unavailable' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_context) IS DISTINCT FROM 'object' OR NOT p_context?&ARRAY['entityType','entityId'] OR
  p_context-ARRAY['entityType','entityId']<>'{}'::jsonb OR kind IS NULL OR kind NOT IN ('employee','employee_dependent','company','branch','site','party') OR
  jsonb_typeof(p_context->'entityId') IS DISTINCT FROM 'number' OR p_context->>'entityId' !~ '^[1-9][0-9]*$' OR (p_context->>'entityId')::numeric>9007199254740991 THEN
  RAISE EXCEPTION 'Invalid original subject' USING ERRCODE='22023';END IF;
 subject:=(p_context->>'entityId')::bigint;
 IF kind='party' THEN
  IF NOT(public.current_user_is_global_admin() OR public.current_user_has_permission('master_data.parties.view') OR public.current_user_has_permission('master_data.party_master.view')) THEN
   RAISE EXCEPTION 'Party read authority required' USING ERRCODE='42501';END IF;
  PERFORM id FROM public.parties WHERE id=subject AND is_active AND NOT is_locked FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original Party unavailable' USING ERRCODE='42501';END IF;
  -- A global Party has no inferred company/branch. The explicitly chosen
  -- document scope is checked separately, never replaced by profile defaults.
  RETURN jsonb_build_object('company',NULL,'branch',NULL);
 END IF;
 SELECT * INTO scope FROM erp_private.f07_upload_origin_scope(kind,subject);
 IF kind IN ('employee','employee_dependent') THEN
  IF kind='employee' THEN employee:=subject;ELSE SELECT employee_id INTO employee FROM public.employee_dependents WHERE id=subject AND is_active AND deleted_at IS NULL;END IF;
  IF NOT public.current_user_is_global_admin() AND (NOT public.current_user_can_view_employee(employee) OR
   kind='employee_dependent' AND NOT erp_private.employee_permission(employee,'hr.compliance.view')) THEN
   RAISE EXCEPTION 'Original HR subject read authority required' USING ERRCODE='42501';END IF;
 END IF;
 RETURN jsonb_build_object('company',scope.company,'branch',scope.branch);
END $$;
CREATE FUNCTION public.f07_prepare_manual_origin(p_context jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_manual_origin_scope(p_context) $$;

CREATE FUNCTION erp_private.f07_assert_manual_origin(p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scope jsonb;company bigint:=(p_data->>'owning_company_id')::bigint;branch bigint:=(p_data->>'owning_branch_id')::bigint;
BEGIN
 IF NOT p_data?'originContext' THEN RETURN;END IF;
 scope:=erp_private.f07_manual_origin_scope(p_data->'originContext');
 IF p_data#>>'{originContext,entityType}'='party' THEN
  IF (p_data->>'party_id')::bigint IS DISTINCT FROM (p_data#>>'{originContext,entityId}')::bigint THEN
   RAISE EXCEPTION 'Party identity must match the original context' USING ERRCODE='PT409';END IF;
 ELSIF ROW(company,branch) IS DISTINCT FROM ROW((scope->>'company')::bigint,(scope->>'branch')::bigint) THEN
  RAISE EXCEPTION 'Document scope must match its original subject' USING ERRCODE='PT409';
 END IF;
 IF NOT erp_private.permission_in_scope('dms.documents.upload',company,branch) OR NOT erp_private.permission_in_scope('dms.documents.edit',company,branch) THEN
  RAISE EXCEPTION 'Original subject linking requires current scoped upload and edit authority' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_manual_origin_scope(jsonb),erp_private.f07_assert_manual_origin(jsonb),public.f07_prepare_manual_origin(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_manual_origin_scope(jsonb),erp_private.f07_assert_manual_origin(jsonb),public.f07_prepare_manual_origin(jsonb) TO authenticated;

DO $patch$
DECLARE original text;needle text;addition text;assertion text;
BEGIN
 SELECT pg_get_functiondef('public.create_numbered_dms_document(uuid,jsonb)'::regprocedure) INTO original;
 needle:='''reminder_policy_id'',''legacy_document_code''];';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Manual creation field contract drift';END IF;
 original:=replace(original,needle,'''reminder_policy_id'',''legacy_document_code'',''originContext''];');
 needle:='  elsif kind not in (''null'',''string'') then raise exception ''Invalid document field'' using errcode=''22023''; end if;';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Manual creation type contract drift';END IF;
 original:=replace(original,needle,'  elsif item.key=''originContext'' then perform erp_private.f07_assert_manual_origin(p_data);'||E'\n'||needle);
 needle:=' reference:=allocation->>''generated_reference_number'';';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Manual creation allocation boundary drift';END IF;
 original:=replace(original,needle,' perform erp_private.f07_assert_manual_origin(p_data);'||E'\n'||needle);
 needle:=' values(document_id,''document_created'',actor,''Document ''||reference||'' created'');';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Manual creation event boundary drift';END IF;
 addition:=$body$
 if p_data?'originContext' then
  perform erp_private.f07_assert_manual_origin(p_data);
  insert into public.dms_document_links(document_id,entity_type,entity_id,link_role,is_primary,linked_by)
  values(document_id,p_data#>>'{originContext,entityType}',(p_data#>>'{originContext,entityId}')::bigint,'subject',true,actor);
  insert into public.dms_document_events(document_id,event_type,performed_by,description,metadata_json)
  values(document_id,'original_subject_linked',actor,'Original document subject linked in the creation transaction',
   jsonb_build_object('operation_id',p_operation,'entity_type',p_data#>>'{originContext,entityType}','entity_id',(p_data#>>'{originContext,entityId}')::bigint));
 end if;
$body$;
 original:=replace(original,needle,needle||E'\n'||addition);
 assertion:=$body$
 perform erp_private.f07_assert_manual_origin(p_data);
 if p_data?'originContext' and not exists(select 1 from public.dms_document_links l where l.document_id=(select dd.id from public.dms_documents dd where dd.document_no=reference and dd.created_by=actor)
  and l.entity_type=p_data#>>'{originContext,entityType}' and l.entity_id=(p_data#>>'{originContext,entityId}')::bigint
  and l.link_role='subject' and l.is_primary and l.linked_by=actor and l.deleted_at is null) then
  raise exception 'Original creation subject link is unavailable; retain this request for reconciliation' using errcode='PT409';
 end if;
$body$;
 needle:='  return jsonb_build_object(''id'',document_id,''document_no'',reference,''reference_id'',(allocation->>''id'')::bigint,';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Manual creation replay boundary drift';END IF;
 original:=replace(original,needle,assertion||E'\n'||needle);
 needle:=' return jsonb_build_object(''id'',document_id,''document_no'',reference,''reference_id'',(allocation->>''id'')::bigint,';
 -- Both leading spaces match the one-space substring. Replace only the final
 -- occurrence so the replay assertion above is not duplicated accidentally.
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>2 THEN RAISE EXCEPTION 'Manual creation final boundary drift';END IF;
 original:=overlay(original placing assertion||E'\n'||needle from length(original)-strpos(reverse(original),reverse(needle))-length(needle)+2 for length(needle));
 EXECUTE original;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
