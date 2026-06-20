-- ─────────────────────────────────────────────────────────────────────────────
-- HR.11 / REPORT FINAL FIX — Seed reports.history.view + reports.manage permissions
-- Migration: 20260619170000_hr11_report_final_fix_report_history_rls.sql
-- Date: 2026-06-19
--
-- The REPORT.2 migration already created the correct RLS policy:
--   rpt_runs_select_own: run_by = current user  OR  reports.history.view
-- These permissions were referenced but NOT seeded. This migration seeds them.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (
  permission_code, permission_name, module_code, action_code,
  description, is_active, is_system_permission, is_visible, sort_order
)
VALUES
  ('reports.history.view', 'View All Report History', 'REPORTS', 'history_view',
   'View report run history for all users (admin/manager use)', true, true, true, 912),
  ('reports.manage',       'Manage Report Configuration', 'REPORTS', 'manage',
   'Manage report registry, branding, and templates', true, true, true, 913)
ON CONFLICT (permission_code) DO NOTHING;
