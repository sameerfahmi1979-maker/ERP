-- ─────────────────────────────────────────────────────────────────────────────
-- HR.12 — HR AI Integration
-- Migration: 20260619180000_hr12_hr_ai_integration.sql
-- Date: 2026-06-19
--
-- Seeds HR AI permissions and feature flags.
-- Reuses existing Common AI tables (erp_ai_usage_logs, erp_ai_feature_flags).
-- No new tables created — HR AI suggestions are ephemeral (review-and-copy).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. HR AI Permissions
-- ─────────────────────────────────────────────────────────────────────────────
-- HR.1 already seeded: hr.ai.review, hr.ai.apply_suggestion
-- This migration adds the full set.

INSERT INTO public.permissions (
  permission_code, permission_name, module_code, action_code,
  description, is_active, is_system_permission, is_visible, sort_order
)
VALUES
  ('hr.ai.view',    'View HR AI Panel',         'HR', 'ai_view',
   'View HR AI panel and AI-generated suggestions for employees', true, true, true, 1101),
  ('hr.ai.use',     'Use HR AI Features',       'HR', 'ai_use',
   'Trigger AI analysis, fill, correction, duplicate check, compliance/readiness explanations', true, true, true, 1102),
  ('hr.ai.fill',    'Apply HR AI Fill Suggestions', 'HR', 'ai_fill',
   'Copy AI-suggested field values into employee profile (manual user action only)', true, true, true, 1103),
  ('hr.ai.manage',  'Manage HR AI Settings',    'HR', 'ai_manage',
   'Enable/disable HR AI features and manage AI behaviour settings', true, true, true, 1104)
ON CONFLICT (permission_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Assign HR AI permissions to default roles
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_perm_id     BIGINT;
  v_role_id     BIGINT;
  v_hr_manager  TEXT := 'hr_manager';
  v_company_admin TEXT := 'company_admin';
  v_group_admin TEXT := 'group_admin';
  v_system_admin TEXT := 'system_admin';
BEGIN
  -- hr.ai.view → hr_manager, company_admin, group_admin, system_admin
  FOR v_perm_id IN
    SELECT id FROM public.permissions
    WHERE permission_code IN ('hr.ai.view', 'hr.ai.use', 'hr.ai.fill')
  LOOP
    FOR v_role_id IN
      SELECT id FROM public.roles WHERE role_code IN (v_hr_manager, v_company_admin, v_group_admin, v_system_admin)
    LOOP
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (v_role_id, v_perm_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- hr.ai.manage → group_admin, system_admin only
  SELECT id INTO v_perm_id FROM public.permissions WHERE permission_code = 'hr.ai.manage';
  IF FOUND THEN
    FOR v_role_id IN
      SELECT id FROM public.roles WHERE role_code IN (v_group_admin, v_system_admin)
    LOOP
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (v_role_id, v_perm_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. HR AI Feature Flags
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.erp_ai_feature_flags (
  feature_code, feature_name, description,
  is_enabled, requires_human_review, min_confidence_threshold
)
VALUES
  ('ERP_AI_HR_EMPLOYEE_ASSIST', 'HR AI Employee Profile Assistant',
   'Master switch for all HR AI features inside the Employee Profile AI Review tab.',
   false, true, 0.70),
  ('ERP_AI_HR_FILL', 'HR AI Fill from Documents',
   'Extract employee profile field suggestions from linked DMS documents (Emirates ID, passport, insurance, etc.)',
   false, true, 0.75),
  ('ERP_AI_HR_CORRECTIONS', 'HR AI Correction Suggestions',
   'AI review of employee profile data for missing fields, inconsistencies, and data quality issues.',
   false, true, 0.70),
  ('ERP_AI_HR_DUPLICATES', 'HR AI Duplicate / Conflict Detection',
   'Detect possible duplicate employees or candidate-employee conflicts using deterministic + AI checks.',
   false, true, 0.70),
  ('ERP_AI_HR_SEARCH_ASSIST', 'HR AI Search Assist',
   'Natural-language HR search: convert user query into structured HR search filters.',
   false, true, 0.70),
  ('ERP_AI_HR_COMPLIANCE_EXPLAIN', 'HR AI Compliance Explanation',
   'AI explanation of employee compliance gaps, expired documents, and recommended remediation steps.',
   false, true, 0.80),
  ('ERP_AI_HR_READINESS_EXPLAIN', 'HR AI Readiness Explanation',
   'AI explanation of why an employee is not site/role-ready and recommended next steps.',
   false, true, 0.80),
  ('ERP_AI_HR_LETTER_DRAFT', 'HR AI Letter Draft Assist',
   'AI drafts NOC / salary certificate / experience letter / warning letter wording for HR review.',
   false, true, 0.80),
  ('ERP_AI_HR_EMAIL_DRAFT', 'HR AI Email Draft Assist',
   'AI drafts HR emails to employee/candidate/manager for HR review before sending.',
   false, true, 0.80)
ON CONFLICT (feature_code) DO NOTHING;
