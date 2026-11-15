BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog;

-- Reviewed ERP relations with an effective anonymous write grant. Keep the
-- explicitly inventoried legacy co-tenant relations outside this change.
DO $$
DECLARE relation_name text; column_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'approval_roles','audit_logs','authority_types','consultant_addresses','consultant_bank_details',
    'consultant_contacts','consultant_documents','consultant_specializations','consultant_types','consultants',
    'customer_categories','customer_statuses','designations','dms_ai_entity_match_candidates','dms_ai_erp_apply_correction_proposals',
    'dms_ai_erp_apply_items','dms_ai_erp_apply_runs','dms_ai_extraction_jobs','dms_ai_extraction_results','dms_ai_link_suggestions',
    'dms_ai_tag_suggestions','dms_ai_validation_findings','dms_approve_runs','dms_document_access_rules','dms_document_categories',
    'dms_document_comments','dms_document_content','dms_document_content_chunks','dms_document_events','dms_document_files',
    'dms_document_links','dms_document_metadata_values','dms_document_tags','dms_document_types','dms_document_versions',
    'dms_document_workflow_steps','dms_document_workflows','dms_documents','dms_expiry_reminders','dms_intake_review_values',
    'dms_metadata_definitions','dms_notification_queue','dms_notification_settings','dms_renewal_requests','dms_required_document_rules',
    'dms_retention_policies','dms_review_queue','dms_saved_searches','dms_tags','dms_upload_batches',
    'dms_upload_sessions','dms_workflow_document_types','employee_access_cards','employee_accommodation_records','employee_approval_requests',
    'employee_assets','employee_assignments','employee_attendance_daily_summary','employee_attendance_punches','employee_clearance_items',
    'employee_dependents','employee_disciplinary_records','employee_document_links','employee_eos_cases','employee_hr_actions',
    'employee_hr_notes','employee_identity_documents','employee_leave_balances','employee_leave_requests','employee_medical_insurances',
    'employee_medical_records','employee_operational_blocks','employee_overtime_records','employee_payroll_holds','employee_payroll_profiles',
    'employee_performance_records','employee_ppe_issues','employee_pro_processes','employee_recruitment_links','employee_role_requirements',
    'employee_salary_components','employee_salary_revisions','employee_shift_assignments','employee_site_readiness','employee_status_events',
    'employee_training_certificates','employee_wps_profiles','employees','erp_ai_assistant_action_drafts','erp_ai_assistant_messages',
    'erp_ai_assistant_sessions','erp_ai_audit_explanations','erp_ai_compliance_finding_events','erp_ai_compliance_findings','erp_ai_data_quality_finding_events',
    'erp_ai_data_quality_findings','erp_ai_duplicate_candidate_events','erp_ai_duplicate_candidates','erp_ai_field_suggestion_events','erp_ai_field_suggestions',
    'erp_ai_model_cost_rates','erp_ai_recent_searches','erp_ai_risk_score_events','erp_ai_risk_scores','erp_ai_usage_logs',
    'erp_dms_temp_cleanup_runs','erp_dms_temp_cleanup_settings','erp_email_send_logs','erp_notification_delivery_logs','erp_notification_templates',
    'erp_notifications','erp_output_class_policies','erp_output_public_links','erp_report_column_profiles','erp_report_delivery_logs',
    'erp_report_registry','erp_report_runs','erp_report_saved_filters','erp_report_schedule_runs','global_numbering_generated_references',
    'global_numbering_sequence_states','government_authorities','government_authority_addresses','government_authority_contacts','government_authority_documents',
    'hr_candidate_documents','hr_candidates','hr_interviews','hr_job_requisitions','hr_offers',
    'hr_onboarding_tasks','industry_sectors','invoice_methods','party_address_types','party_addresses',
    'party_approval_statuses','party_blacklist_statuses','party_compliance_profiles','party_compliance_statuses','party_consultant_profiles',
    'party_contact_departments','party_contact_roles','party_contacts','party_credit_ratings','party_customer_profiles',
    'party_document_statuses','party_document_types','party_documents','party_government_authority_profiles','party_license_statuses',
    'party_license_types','party_licenses','party_natures','party_note_types','party_notes',
    'party_recruitment_agency_profiles','party_relationships','party_risk_ratings','party_statuses','party_subcontractor_profiles',
    'party_tax_registrations','party_tax_statuses','party_vendor_profiles','payment_methods','permissions',
    'procurement_categories','recruitment_agencies','recruitment_agency_addresses','recruitment_agency_bank_details','recruitment_agency_contacts',
    'recruitment_agency_documents','recruitment_categories','role_permissions','roles','sales_regions',
    'subcontractor_addresses','subcontractor_bank_details','subcontractor_categories','subcontractor_contacts','subcontractor_documents',
    'subcontractors','user_profiles','user_roles','vendor_addresses','vendor_bank_details',
    'vendor_categories','vendor_contacts','vendor_documents','vendor_ratings','vendors',
    'work_calendars','work_categories','work_shifts','work_sites'
  ] LOOP
    IF to_regclass(format('public.%I',relation_name)) IS NULL THEN
      RAISE EXCEPTION 'Missing reviewed ERP relation %',relation_name;
    END IF;
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE public.%I FROM anon, PUBLIC',relation_name);
    FOR column_name IN SELECT a.attname FROM pg_attribute a
      WHERE a.attrelid=to_regclass(format('public.%I',relation_name)) AND a.attnum>0 AND NOT a.attisdropped
        AND has_column_privilege('anon',a.attrelid,a.attnum,'INSERT,UPDATE,REFERENCES')
    LOOP
      EXECUTE format('REVOKE INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON TABLE public.%2$I FROM anon, PUBLIC',column_name,relation_name);
    END LOOP;
    IF has_table_privilege('anon',format('public.%I',relation_name),'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
      OR has_any_column_privilege('anon',format('public.%I',relation_name),'INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'Unresolved inherited anonymous write privilege on %',relation_name;
    END IF;
  END LOOP;
END $$;

-- ERP migrations create public relations as postgres. Retain explicit SELECT
-- and function grants, including the public output verification RPC.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon;
COMMIT;
