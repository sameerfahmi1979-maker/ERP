-- Intended mapping configuration is separate from metadata history and ERP
-- write-back. Rules are preview-only; this enables no HR/Party writes.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE TABLE IF NOT EXISTS public.dms_metadata_erp_mappings (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 metadata_definition_id bigint NOT NULL REFERENCES public.dms_metadata_definitions(id),document_type_id bigint NOT NULL REFERENCES public.dms_document_types(id),
 target_module text NOT NULL,target_entity text NOT NULL,target_table text NOT NULL,target_field text NOT NULL,target_relation_field text NOT NULL,
 target_record_strategy text NOT NULL DEFAULT 'link_exact',mapping_direction text NOT NULL DEFAULT 'dms_to_erp',mapping_priority integer NOT NULL DEFAULT 10,
 is_active boolean NOT NULL DEFAULT true,allow_apply_to_existing boolean NOT NULL DEFAULT false,requires_confirmation boolean NOT NULL DEFAULT true,
 requires_target_permission text NOT NULL,notes text,created_by bigint REFERENCES public.user_profiles(id),created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz
);
ALTER TABLE public.dms_metadata_erp_mappings ENABLE ROW LEVEL SECURITY;ALTER TABLE public.dms_metadata_erp_mappings FORCE ROW LEVEL SECURITY;
DO $$ DECLARE p record;BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='dms_metadata_erp_mappings' LOOP EXECUTE format('DROP POLICY %I ON public.dms_metadata_erp_mappings',p.policyname);END LOOP;END $$;
REVOKE ALL ON public.dms_metadata_erp_mappings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.dms_metadata_erp_mappings TO authenticated;
GRANT SELECT ON public.dms_metadata_erp_mappings TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.dms_metadata_erp_mappings_id_seq TO authenticated;
CREATE POLICY f07_mapping_admin ON public.dms_metadata_erp_mappings FOR ALL TO authenticated
 USING(erp_private.business_principal_is_active() AND (public.current_user_has_permission('dms.documents.manage_types') OR public.current_user_has_permission('dms.admin') OR public.current_user_is_global_admin()))
 WITH CHECK(erp_private.business_principal_is_active() AND (public.current_user_has_permission('dms.documents.manage_types') OR public.current_user_has_permission('dms.admin') OR public.current_user_is_global_admin()));
CREATE INDEX IF NOT EXISTS f07_mapping_document_type ON public.dms_metadata_erp_mappings(document_type_id,mapping_priority,id) WHERE deleted_at IS NULL;
-- No historical duplicates are silently deleted. Reconcile before production if
-- the original table already exists with duplicate live rules.
CREATE UNIQUE INDEX IF NOT EXISTS f07_mapping_unique_live ON public.dms_metadata_erp_mappings(metadata_definition_id,target_table,target_field,target_record_strategy) WHERE deleted_at IS NULL;
CREATE FUNCTION erp_private.f07_mapping_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE module text; relation text; permission text; allowed text[];
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.dms_metadata_definitions d WHERE d.id=NEW.metadata_definition_id AND d.document_type_id=NEW.document_type_id AND d.is_active AND d.deleted_at IS NULL) THEN RAISE EXCEPTION 'Mapping definition does not belong to this active type' USING ERRCODE='22023'; END IF;
 CASE NEW.target_table
 WHEN 'employee_identity_documents' THEN module:='hr';relation:='employee_id';permission:='hr.compliance.manage';allowed:=ARRAY['document_number','issue_date','expiry_date','visa_file_number','uid_number','labour_card_number','work_permit_number','mohre_person_code','profession_on_document','place_of_issue','notes'];
 WHEN 'employee_medical_insurances' THEN module:='hr';relation:='employee_id';permission:='hr.compliance.manage';allowed:=ARRAY['policy_number','insurance_provider','tpa','insurance_card_number','network_class','effective_date','expiry_date'];
 WHEN 'party_licenses' THEN module:='party';relation:='party_id';permission:='master_data.parties.manage_licenses';allowed:=ARRAY['license_number','license_name','license_activity_text','issue_date','expiry_date','remarks'];
 WHEN 'party_tax_registrations' THEN module:='party';relation:='party_id';permission:='master_data.parties.manage_tax';allowed:=ARRAY['tax_registration_number','effective_from','effective_to','remarks'];
 ELSE RAISE EXCEPTION 'Mapping target not allowlisted' USING ERRCODE='22023';END CASE;
 IF NEW.target_module<>module OR NOT NEW.target_field=ANY(allowed) OR NEW.target_relation_field<>relation OR NEW.requires_target_permission<>permission OR
  NEW.mapping_direction<>'dms_to_erp' OR NEW.allow_apply_to_existing OR NOT NEW.requires_confirmation OR NEW.target_record_strategy NOT IN ('link_exact','link_parent') OR NEW.mapping_priority NOT BETWEEN 1 AND 999 OR length(coalesce(NEW.notes,''))>500 THEN RAISE EXCEPTION 'Invalid preview-only mapping contract' USING ERRCODE='22023'; END IF;
 IF TG_OP='UPDATE' AND (NEW.metadata_definition_id<>OLD.metadata_definition_id OR NEW.document_type_id<>OLD.document_type_id) THEN RAISE EXCEPTION 'Mapping source identity is immutable; retire and create the correct mapping' USING ERRCODE='22023'; END IF;
 NEW.updated_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER f07_mapping_guard BEFORE INSERT OR UPDATE ON public.dms_metadata_erp_mappings FOR EACH ROW EXECUTE FUNCTION erp_private.f07_mapping_guard();
CREATE FUNCTION erp_private.f07_mapping_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(public.current_user_profile_id(),'DMS','dms_metadata_erp_mappings',NEW.id,CASE WHEN TG_OP='INSERT' THEN 'create' WHEN NEW.deleted_at IS NOT NULL THEN 'delete' ELSE 'update' END,jsonb_build_object('definitionId',NEW.metadata_definition_id,'targetTable',NEW.target_table,'targetField',NEW.target_field));
 RETURN NEW;END $$;
CREATE TRIGGER f07_mapping_audit AFTER INSERT OR UPDATE ON public.dms_metadata_erp_mappings FOR EACH ROW EXECUTE FUNCTION erp_private.f07_mapping_audit();
REVOKE ALL ON FUNCTION erp_private.f07_mapping_guard(),erp_private.f07_mapping_audit() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
