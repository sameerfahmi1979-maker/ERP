BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Derived role_permissions retain stable IDs and existing transaction witnesses.
-- Classification is authority, never role_level, module-name wildcards or UI labels.
ALTER TABLE public.permissions ADD COLUMN administrator_scope text NOT NULL DEFAULT 'held'
 CHECK(administrator_scope IN('global','company','branch','held'));
COMMENT ON COLUMN public.permissions.administrator_scope IS 'Administrator policy 2026-10-25.v1: explicit inheritance boundary; held means no scoped administrator inheritance. Existing ordinary grants remain separate.';

CREATE FUNCTION erp_private.administrator_assignment_shape(code text,company bigint,branch bigint)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT (company IS NULL OR company>0) AND (branch IS NULL OR branch>0)
  AND (branch IS NULL OR company IS NOT NULL)
  AND CASE code WHEN 'system_admin' THEN company IS NULL AND branch IS NULL
    WHEN 'group_admin' THEN company IS NULL AND branch IS NULL
    WHEN 'company_admin' THEN company IS NOT NULL AND branch IS NULL
    WHEN 'branch_admin' THEN company IS NOT NULL AND branch IS NOT NULL ELSE true END;
$$;
REVOKE ALL ON FUNCTION erp_private.administrator_assignment_shape(text,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.guard_administrator_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE code text; system_role boolean; role_active boolean; role_assignable boolean;
BEGIN
 SELECT role_code,is_system_role,is_active,is_assignable INTO code,system_role,role_active,role_assignable FROM public.roles WHERE id=NEW.role_id FOR SHARE;
 IF NEW.is_active AND (TG_OP='INSERT' OR NEW.role_id IS DISTINCT FROM OLD.role_id OR NEW.user_profile_id IS DISTINCT FROM OLD.user_profile_id OR NEW.owner_company_id IS DISTINCT FROM OLD.owner_company_id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NOT OLD.is_active) AND (NOT role_active OR role_assignable IS FALSE) THEN
  RAISE EXCEPTION 'Inactive or unavailable role cannot be assigned' USING ERRCODE='23514';END IF;
 IF NEW.is_active AND code IN('system_admin','group_admin','company_admin','branch_admin') THEN
  IF NOT system_role OR NOT erp_private.administrator_assignment_shape(code,NEW.owner_company_id,NEW.branch_id) THEN
   RAISE EXCEPTION 'Administrator role requires its exact company/branch scope' USING ERRCODE='23514';END IF;
  IF NEW.owner_company_id IS NOT NULL THEN
   PERFORM 1 FROM public.owner_companies WHERE id=NEW.owner_company_id AND status='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Administrator company is unavailable' USING ERRCODE='23514';END IF;
  END IF;
  IF NEW.branch_id IS NOT NULL THEN
   PERFORM 1 FROM public.branches WHERE id=NEW.branch_id AND owner_company_id=NEW.owner_company_id AND status='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Administrator branch is unavailable or belongs to another company' USING ERRCODE='23514';END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.guard_administrator_assignment() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER administrator_assignment_shape BEFORE INSERT OR UPDATE ON public.user_roles
 FOR EACH ROW EXECUTE FUNCTION erp_private.guard_administrator_assignment();

CREATE FUNCTION erp_private.guard_administrator_scope_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.status IS DISTINCT FROM 'active'
   OR (TG_TABLE_NAME='branches' AND to_jsonb(NEW)->'owner_company_id' IS DISTINCT FROM to_jsonb(OLD)->'owner_company_id') THEN
  IF EXISTS(SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id WHERE a.is_active
   AND r.role_code IN('company_admin','branch_admin')
   AND CASE WHEN TG_TABLE_NAME='branches' THEN a.branch_id=OLD.id ELSE a.owner_company_id=OLD.id END) THEN
   RAISE EXCEPTION 'Review and revoke administrator assignments before closing or transferring this scope' USING ERRCODE='23514';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.guard_administrator_scope_record() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER administrator_company_validity BEFORE UPDATE OR DELETE ON public.owner_companies FOR EACH ROW EXECUTE FUNCTION erp_private.guard_administrator_scope_record();
CREATE TRIGGER administrator_branch_validity BEFORE UPDATE OR DELETE ON public.branches FOR EACH ROW EXECUTE FUNCTION erp_private.guard_administrator_scope_record();

CREATE FUNCTION erp_private.sync_administrator_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM id FROM public.roles WHERE role_code IN('company_admin','branch_admin') ORDER BY id FOR UPDATE;
 DELETE FROM public.role_permissions rp USING public.roles r,public.permissions p
  WHERE r.id=rp.role_id AND p.id=rp.permission_id AND r.role_code IN('company_admin','branch_admin')
  AND NOT (r.is_system_role AND p.is_active AND (p.administrator_scope='branch' OR (r.role_code='company_admin' AND p.administrator_scope='company')));
 INSERT INTO public.role_permissions(role_id,permission_id)
  SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
   WHERE r.is_system_role AND r.role_code IN('company_admin','branch_admin') AND p.is_active
   AND (p.administrator_scope='branch' OR (r.role_code='company_admin' AND p.administrator_scope='company'))
   AND NOT EXISTS(SELECT 1 FROM public.role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)
  ORDER BY r.id,p.id;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.sync_administrator_permissions() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER administrator_permission_projection AFTER INSERT OR UPDATE OR DELETE ON public.permissions
 FOR EACH STATEMENT EXECUTE FUNCTION erp_private.sync_administrator_permissions();

-- Deliberately SECURITY INVOKER: only the trusted projection's database owner may
-- edit reserved derived grants. A caller-set GUC must never bypass this guard.
CREATE FUNCTION erp_private.guard_derived_administrator_grant()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_user NOT IN('postgres','supabase_admin') AND EXISTS(SELECT 1 FROM public.roles r
  WHERE r.id IN(CASE WHEN TG_OP<>'INSERT' THEN OLD.role_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.role_id END)
  AND r.role_code IN('company_admin','branch_admin')) THEN
  RAISE EXCEPTION 'Administrator capabilities are inherited from the reviewed scope policy' USING ERRCODE='42501';END IF;
 IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM public.roles r JOIN public.permissions p ON p.id=OLD.permission_id
  WHERE r.id=OLD.role_id AND r.is_system_role AND r.role_code IN('company_admin','branch_admin') AND p.is_active
  AND (p.administrator_scope='branch' OR r.role_code='company_admin' AND p.administrator_scope='company'))
  AND (TG_OP='DELETE' OR NEW.role_id IS DISTINCT FROM OLD.role_id OR NEW.permission_id IS DISTINCT FROM OLD.permission_id) THEN
  RAISE EXCEPTION 'Valid administrator capability is controlled by its scope classification' USING ERRCODE='42501';END IF;
 IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM public.roles r WHERE r.id=NEW.role_id AND r.role_code IN('company_admin','branch_admin'))
  AND NOT EXISTS(SELECT 1 FROM public.roles r JOIN public.permissions p ON p.id=NEW.permission_id
   WHERE r.id=NEW.role_id AND r.is_system_role AND p.is_active AND (p.administrator_scope='branch' OR r.role_code='company_admin' AND p.administrator_scope='company')) THEN
  RAISE EXCEPTION 'Capability is outside this administrator policy' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.guard_derived_administrator_grant() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER administrator_derived_grant BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
 FOR EACH ROW EXECUTE FUNCTION erp_private.guard_derived_administrator_grant();

CREATE FUNCTION erp_private.guard_administrator_role_definition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.role_code IN('system_admin','group_admin','company_admin','branch_admin') THEN
  IF TG_OP='DELETE' OR NEW.role_code IS DISTINCT FROM OLD.role_code OR NOT NEW.is_system_role THEN
   RAISE EXCEPTION 'Reserved administrator role identity cannot be changed' USING ERRCODE='23514';END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.role_code IS DISTINCT FROM OLD.role_code AND NEW.role_code IN('system_admin','group_admin','company_admin','branch_admin') THEN
  RAISE EXCEPTION 'A custom role cannot become a reserved administrator identity' USING ERRCODE='23514';END IF;
 IF TG_OP<>'DELETE' AND NEW.role_code IN('system_admin','group_admin','company_admin','branch_admin') AND NOT NEW.is_system_role THEN
  RAISE EXCEPTION 'Reserved administrator code requires its protected system role' USING ERRCODE='23514';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.guard_administrator_role_definition() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER administrator_role_identity BEFORE INSERT OR UPDATE OR DELETE ON public.roles
 FOR EACH ROW EXECUTE FUNCTION erp_private.guard_administrator_role_definition();

CREATE FUNCTION erp_private.guard_administrator_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.administrator_scope<>'held' OR TG_OP='UPDATE' AND NEW.administrator_scope IS DISTINCT FROM OLD.administrator_scope)
 AND auth.role()='authenticated' AND NOT public.current_user_is_global_admin() THEN
  RAISE EXCEPTION 'Global System Administrator required to classify permissions' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.guard_administrator_classification() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER administrator_classification_authority BEFORE INSERT OR UPDATE ON public.permissions
 FOR EACH ROW EXECUTE FUNCTION erp_private.guard_administrator_classification();

UPDATE public.permissions p SET administrator_scope=v.scope FROM (VALUES
 ('ai.actions.execute_after_confirm','global'),
 ('ai.actions.prepare','global'),
 ('ai.assistant.admin','global'),
 ('ai.assistant.use','global'),
 ('ai.assistant.view','global'),
 ('ai.audit_explainer.admin','global'),
 ('ai.audit_explainer.use','global'),
 ('ai.audit_explainer.view','global'),
 ('ai.common.admin','global'),
 ('ai.common.apply','global'),
 ('ai.common.generate','global'),
 ('ai.common.view','global'),
 ('ai.compliance.generate','global'),
 ('ai.compliance.review','global'),
 ('ai.compliance.view','global'),
 ('ai.dashboard.admin','global'),
 ('ai.dashboard.view','global'),
 ('ai.data_quality.admin','global'),
 ('ai.data_quality.manage','global'),
 ('ai.data_quality.review','global'),
 ('ai.data_quality.scan','global'),
 ('ai.data_quality.view','global'),
 ('ai.duplicates.review','global'),
 ('ai.duplicates.view','global'),
 ('ai.field_suggestions.apply','global'),
 ('ai.field_suggestions.generate','global'),
 ('ai.field_suggestions.manage','global'),
 ('ai.field_suggestions.view','global'),
 ('ai.risk.generate','global'),
 ('ai.risk.review','global'),
 ('ai.risk.view','global'),
 ('ai.search.use','global'),
 ('ai.search.view','global'),
 ('audit.view','global'),
 ('branches.manage','branch'),
 ('branches.view','branch'),
 ('branding.app.manage','global'),
 ('branding.app.view','global'),
 ('branding.assets.approve','company'),
 ('branding.assets.upload','company'),
 ('common_md.approval_roles.manage','global'),
 ('common_md.approval_roles.view','global'),
 ('common_md.branches.manage','branch'),
 ('common_md.branches.view','branch'),
 ('common_md.departments.manage','branch'),
 ('common_md.departments.view','branch'),
 ('common_md.designations.manage','global'),
 ('common_md.designations.view','global'),
 ('common_md.dms_required_documents.manage','global'),
 ('common_md.dms_required_documents.view','global'),
 ('common_md.manage','global'),
 ('common_md.organizations.manage','company'),
 ('common_md.organizations.view','company'),
 ('common_md.view','global'),
 ('common_md.work_calendars.manage','company'),
 ('common_md.work_calendars.view','company'),
 ('common_md.work_sites.manage','branch'),
 ('common_md.work_sites.view','branch'),
 ('dashboard.view','branch'),
 ('dms.admin','global'),
 ('dms.ai_observability.admin','global'),
 ('dms.ai_observability.view','global'),
 ('dms.apply_correction.admin','branch'),
 ('dms.apply_correction.create','branch'),
 ('dms.apply_correction.run','branch'),
 ('dms.apply_correction.view','branch'),
 ('dms.apply_to_erp.admin','branch'),
 ('dms.apply_to_erp.preview','branch'),
 ('dms.apply_to_erp.run','branch'),
 ('dms.apply_to_erp.view','branch'),
 ('dms.approvals.act','branch'),
 ('dms.approvals.admin','branch'),
 ('dms.approvals.history.view','branch'),
 ('dms.approvals.submit','branch'),
 ('dms.approvals.view','branch'),
 ('dms.approvals.withdraw','branch'),
 ('dms.documents.ai.retry','branch'),
 ('dms.documents.ai.run','branch'),
 ('dms.documents.ai.supersede','branch'),
 ('dms.documents.ai.view','branch'),
 ('dms.documents.approve','branch'),
 ('dms.documents.archive','branch'),
 ('dms.documents.delete','branch'),
 ('dms.documents.download','branch'),
 ('dms.documents.edit','branch'),
 ('dms.documents.manage_security','branch'),
 ('dms.documents.manage_tags','global'),
 ('dms.documents.manage_types','global'),
 ('dms.documents.ocr.retry','branch'),
 ('dms.documents.ocr.skip','branch'),
 ('dms.documents.ocr.trigger','branch'),
 ('dms.documents.ocr.view','branch'),
 ('dms.documents.preview','branch'),
 ('dms.documents.review_ai','branch'),
 ('dms.documents.share_external','branch'),
 ('dms.documents.upload','branch'),
 ('dms.documents.view','branch'),
 ('dms.documents.view.company','branch'),
 ('dms.documents.view.executive','branch'),
 ('dms.documents.view.finance','branch'),
 ('dms.documents.view.hr','branch'),
 ('dms.documents.view.internal','branch'),
 ('dms.documents.view.legal','branch'),
 ('dms.entity_matching.admin','global'),
 ('dms.entity_matching.review','branch'),
 ('dms.entity_matching.run','global'),
 ('dms.entity_matching.view','branch'),
 ('dms.expiry.dismiss','branch'),
 ('dms.expiry.manage','branch'),
 ('dms.expiry.view','branch'),
 ('dms.metadata.ai_suggestions.approve','branch'),
 ('dms.notifications.admin','branch'),
 ('dms.notifications.manage','branch'),
 ('dms.notifications.settings.manage','global'),
 ('dms.notifications.view','branch'),
 ('dms.notifications.view_own','branch'),
 ('dms.ocr.admin','global'),
 ('dms.renewals.manage','branch'),
 ('dms.renewals.view','branch'),
 ('dms.review_queue.admin','branch'),
 ('dms.review_queue.bulk','branch'),
 ('dms.review_queue.manage','branch'),
 ('dms.review_queue.view','branch'),
 ('dms.validation.admin','global'),
 ('dms.validation.review','branch'),
 ('dms.validation.run','global'),
 ('dms.validation.view','branch'),
 ('dms.view','branch'),
 ('erp.admin','global'),
 ('finance.view','branch'),
 ('fleet.view','branch'),
 ('hr.actions.manage','branch'),
 ('hr.actions.view','branch'),
 ('hr.actions.view.self','branch'),
 ('hr.actions.view.team','branch'),
 ('hr.admin','branch'),
 ('hr.ai.apply_suggestion','branch'),
 ('hr.ai.fill','branch'),
 ('hr.ai.manage','branch'),
 ('hr.ai.review','branch'),
 ('hr.ai.use','branch'),
 ('hr.ai.view','branch'),
 ('hr.assignments.manage','branch'),
 ('hr.assignments.view','branch'),
 ('hr.assignments.view.self','branch'),
 ('hr.assignments.view.team','branch'),
 ('hr.attendance.manage','branch'),
 ('hr.attendance.view','branch'),
 ('hr.attendance.view.self','branch'),
 ('hr.attendance.view.team','branch'),
 ('hr.banking.manage','branch'),
 ('hr.banking.view','branch'),
 ('hr.banking.view.self','branch'),
 ('hr.banking.view.team','branch'),
 ('hr.compliance.manage','branch'),
 ('hr.compliance.view','branch'),
 ('hr.compliance.view.self','branch'),
 ('hr.compliance.view.team','branch'),
 ('hr.confidential.manage','branch'),
 ('hr.confidential.view','branch'),
 ('hr.confidential.view.self','branch'),
 ('hr.confidential.view.team','branch'),
 ('hr.dashboard.view','branch'),
 ('hr.employee_profile.manage','branch'),
 ('hr.employee_profile.view','branch'),
 ('hr.employees.archive','branch'),
 ('hr.employees.create','branch'),
 ('hr.employees.update','branch'),
 ('hr.employees.view','branch'),
 ('hr.employees.view.self','branch'),
 ('hr.employees.view.team','branch'),
 ('hr.eos.manage','branch'),
 ('hr.eos.view','branch'),
 ('hr.leave.manage','branch'),
 ('hr.leave.view','branch'),
 ('hr.leave.view.self','branch'),
 ('hr.leave.view.team','branch'),
 ('hr.medical.manage','branch'),
 ('hr.medical.view','branch'),
 ('hr.medical.view.self','branch'),
 ('hr.medical.view.team','branch'),
 ('hr.payroll.manage','branch'),
 ('hr.payroll.view','branch'),
 ('hr.payroll.view.self','branch'),
 ('hr.payroll.view.team','branch'),
 ('hr.recruitment.manage','branch'),
 ('hr.recruitment.view','branch'),
 ('hr.search.use','branch'),
 ('hr.settings.manage','global'),
 ('hr.settings.view','global'),
 ('hr.view','branch'),
 ('hse.view','branch'),
 ('inventory.view','branch'),
 ('master_data.dashboard.view','global'),
 ('master_data.finance_basics.audit_view','global'),
 ('master_data.finance_basics.export','global'),
 ('master_data.finance_basics.manage','global'),
 ('master_data.finance_basics.view','global'),
 ('master_data.geography.audit_view','global'),
 ('master_data.geography.export','global'),
 ('master_data.geography.manage','global'),
 ('master_data.geography.view','global'),
 ('master_data.lookups.audit_view','global'),
 ('master_data.lookups.export','global'),
 ('master_data.lookups.import','global'),
 ('master_data.lookups.lock','global'),
 ('master_data.lookups.manage','global'),
 ('master_data.lookups.view','global'),
 ('master_data.parties.approve','global'),
 ('master_data.parties.blacklist','global'),
 ('master_data.parties.create','global'),
 ('master_data.parties.deactivate','global'),
 ('master_data.parties.delete','global'),
 ('master_data.parties.edit','global'),
 ('master_data.parties.export','global'),
 ('master_data.parties.lock','global'),
 ('master_data.parties.manage_addresses','global'),
 ('master_data.parties.manage_bank_details','global'),
 ('master_data.parties.manage_compliance','global'),
 ('master_data.parties.manage_contacts','global'),
 ('master_data.parties.manage_documents','global'),
 ('master_data.parties.manage_licenses','global'),
 ('master_data.parties.manage_relationships','global'),
 ('master_data.parties.manage_services','global'),
 ('master_data.parties.manage_tax','global'),
 ('master_data.parties.manage_types','global'),
 ('master_data.parties.override_duplicate','global'),
 ('master_data.parties.print','global'),
 ('master_data.parties.verify_bank_details','global'),
 ('master_data.parties.view','global'),
 ('master_data.parties.view_audit','global'),
 ('master_data.parties.view_bank_details','global'),
 ('master_data.party_master.audit_view','global'),
 ('master_data.party_master.export','global'),
 ('master_data.party_master.manage','global'),
 ('master_data.party_master.view','global'),
 ('master_data.uom.audit_view','global'),
 ('master_data.uom.export','global'),
 ('master_data.uom.manage','global'),
 ('master_data.uom.view','global'),
 ('notifications.admin','global'),
 ('notifications.dismiss','branch'),
 ('notifications.email_queue.manage','global'),
 ('notifications.email_queue.process','global'),
 ('notifications.email_queue.view','global'),
 ('notifications.logs.view','global'),
 ('notifications.manage','global'),
 ('notifications.templates.manage','global'),
 ('notifications.templates.view','global'),
 ('notifications.view','branch'),
 ('numbering.rules.generate','global'),
 ('numbering.rules.lock','global'),
 ('numbering.rules.manage','global'),
 ('numbering.rules.preview','global'),
 ('numbering.rules.view','global'),
 ('operations.view','branch'),
 ('organizations.manage','company'),
 ('organizations.view','company'),
 ('outputs.ops.retry','branch'),
 ('outputs.ops.revoke','branch'),
 ('outputs.ops.view','branch'),
 ('permissions.manage','global'),
 ('permissions.view','global'),
 ('procurement.view','branch'),
 ('rental.view','branch'),
 ('reports.branding.override','global'),
 ('reports.column_profiles.manage','global'),
 ('reports.email','branch'),
 ('reports.export','branch'),
 ('reports.history.view','branch'),
 ('reports.manage','company'),
 ('reports.pdf.approve','branch'),
 ('reports.pdf.generate','branch'),
 ('reports.pdf.view_history','branch'),
 ('reports.publish','global'),
 ('reports.run','branch'),
 ('reports.saved_filters.manage','global'),
 ('reports.schedule.manage','branch'),
 ('reports.schedule.view','branch'),
 ('reports.sensitive_fields.approve','branch'),
 ('reports.sensitive_fields.use','branch'),
 ('reports.sign','branch'),
 ('reports.template.approve','global'),
 ('reports.verify.admin','global'),
 ('reports.view','branch'),
 ('roles.manage','global'),
 ('roles.view','branch'),
 ('settings.ai.manage','global'),
 ('settings.ai.secrets.manage','global'),
 ('settings.ai.test','global'),
 ('settings.ai.usage.view','global'),
 ('settings.ai.view','global'),
 ('settings.email.feature_flags.manage','global'),
 ('settings.email.logs.view','global'),
 ('settings.email.manage','global'),
 ('settings.email.secrets.manage','global'),
 ('settings.email.test','global'),
 ('settings.email.view','global'),
 ('settings.manage','global'),
 ('settings.view','global'),
 ('users.create','branch'),
 ('users.delete','branch'),
 ('users.employee_link.manage','branch'),
 ('users.roles.assign','branch'),
 ('users.security.manage','branch'),
 ('users.update','branch'),
 ('users.view','branch'),
 ('workshop.view','branch')
) v(code,scope) WHERE p.permission_code=v.code;

-- No guessed legacy repair: the release procedure must reconcile exact assignments.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id WHERE a.is_active
  AND r.role_code IN('system_admin','group_admin','company_admin','branch_admin')
  AND (NOT r.is_system_role OR NOT erp_private.administrator_assignment_shape(r.role_code,a.owner_company_id,a.branch_id)
   OR (a.owner_company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.owner_companies c WHERE c.id=a.owner_company_id AND c.status='active'))
   OR (a.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=a.branch_id AND b.owner_company_id=a.owner_company_id AND b.status='active'))))
 THEN RAISE EXCEPTION 'Administrator scope preflight failed; owner-reviewed assignment correction required';END IF;
END $$;

UPDATE public.roles SET role_name='Global System Administrator',display_name='Global System Administrator' WHERE role_code='system_admin' AND is_system_role;
NOTIFY pgrst,'reload schema';
COMMIT;
