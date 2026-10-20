-- Append-only current employment facts. No historical records are backfilled.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
CREATE TABLE public.employee_employment_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 operation_id uuid, old_values jsonb, new_values jsonb NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 2000),
 effective_date date NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by bigint REFERENCES public.user_profiles(id), revision bigint NOT NULL
);
CREATE INDEX employee_employment_events_subject_order ON public.employee_employment_events(employee_id,id DESC);
ALTER TABLE public.employee_employment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employee_employment_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.employee_employment_events TO authenticated;
CREATE POLICY employee_employment_events_read ON public.employee_employment_events FOR SELECT TO authenticated
 USING(employee_id IN(SELECT erp_private.readable_employee_ids()));
CREATE FUNCTION erp_private.f11_capture_employment_event() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous jsonb; current_facts jsonb; context jsonb; why text; effective date;
 keys text[]:=ARRAY['owner_company_id','branch_id','department_id','designation_id','employee_category_id','employment_type_id','employee_status','joining_date','actual_joining_date','reporting_manager_id','supervisor_id','primary_work_site_id','sponsor_company_id','mohre_establishment_id','contract_type','contract_start_date','contract_end_date','probation_start_date','probation_end_date','notice_period_days','inactive_date','inactive_reason','deleted_at'];
BEGIN
 SELECT jsonb_object_agg(k,to_jsonb(NEW)->k) INTO current_facts FROM unnest(keys)k;
 IF TG_OP='UPDATE' THEN
  SELECT jsonb_object_agg(k,to_jsonb(OLD)->k) INTO previous FROM unnest(keys)k;
  IF previous=current_facts THEN RETURN NEW;END IF;
  context:=nullif(current_setting('erp.f11_employment_change',true),'')::jsonb;
  why:=nullif(btrim(context->>'reason'),'');effective:=(context->>'effective_date')::date;
  IF why IS NULL OR length(why)>2000 OR effective IS NULL THEN
   RAISE EXCEPTION 'Employment changes require a reason and effective date' USING ERRCODE='23514';END IF;
  IF effective>(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
   RAISE EXCEPTION 'Future changes cannot replace current employment facts; save them when effective' USING ERRCODE='23514';END IF;
 ELSE why:='Employee created';effective:=NEW.joining_date;END IF;
 INSERT INTO public.employee_employment_events(employee_id,operation_id,old_values,new_values,reason,effective_date,created_by,revision)
 VALUES(NEW.id,(nullif(current_setting('erp.workspace_save',true),'')::jsonb->>'operation_id')::uuid,previous,current_facts,why,effective,public.current_user_profile_id(),NEW.workspace_revision);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f11_capture_employment_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER zz_f11_employment_history AFTER INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION erp_private.f11_capture_employment_event();

-- Preserve the exact deployed F04/F06 invoker implementation and numbering.
-- Fail migration instead of adapting an unknown predecessor.
DO $$ DECLARE definition text;old_text text;new_text text;
BEGIN
 definition:=pg_get_functiondef('public.save_workspace_record(text,uuid,bigint,bigint,jsonb)'::regprocedure);
 old_text:='''emergency_contact_relationship_type_id'']; code_field:=''employee_code'';';
 new_text:='''emergency_contact_relationship_type_id'',''employment_change_reason'',''employment_effective_date'']; code_field:=''employee_code'';';
 IF position(old_text IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized employee field whitelist';END IF;
 definition:=replace(definition,old_text,new_text);
 old_text:='payload:=p_data||jsonb_build_object(''updated_by'',actor_id);';
 new_text:='payload:=(CASE WHEN p_entity=''employees'' THEN p_data-''employment_change_reason''-''employment_effective_date'' ELSE p_data END)||jsonb_build_object(''updated_by'',actor_id);
 if p_entity=''employees'' then
  perform set_config(''erp.f11_employment_change'',jsonb_build_object(''reason'',p_data->>''employment_change_reason'',''effective_date'',p_data->>''employment_effective_date'')::text,true);
 end if;';
 IF position(old_text IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized workspace payload';END IF;
 definition:=replace(definition,old_text,new_text);
 old_text:='case when p_id is null then ''Employee created'' else coalesce(new_row->>''inactive_reason'',''Status updated'') end,
   (case when p_id is null then new_row->>''joining_date'' else new_row->>''inactive_date'' end)::date,actor_id);';
 new_text:='case when p_id is null then ''Employee created'' else p_data->>''employment_change_reason'' end,
   (case when p_id is null then new_row->>''joining_date'' else p_data->>''employment_effective_date'' end)::date,actor_id);';
 IF position(old_text IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized workspace status history';END IF;
 definition:=replace(definition,old_text,new_text);
 old_text:='perform set_config(''erp.workspace_save'','''',true);';
 IF position(old_text IN definition)=0 THEN RAISE EXCEPTION 'Unrecognized workspace context cleanup';END IF;
 definition:=replace(definition,old_text,old_text||E'\n perform set_config(''erp.f11_employment_change'','''',true);');
 EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
