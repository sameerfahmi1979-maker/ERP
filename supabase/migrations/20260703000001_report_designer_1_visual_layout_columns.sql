-- REPORT DESIGNER.1 — Visual Layout Tracking Columns
-- Migration: 20260703000001_report_designer_1_visual_layout_columns.sql
--
-- Adds visual-editor tracking columns to erp_report_templates.
-- The layout content columns (body_layout_json, header_layout_json,
-- footer_layout_json, style_json) already exist from BRANDING phase migrations.
--
-- New columns:
--   visual_editor_engine          — which editor produced this layout ('puck')
--   visual_layout_schema_version  — int version for migration guards
--   visual_layout_updated_at      — timestamp of last visual edit
--   visual_layout_updated_by      — FK to user_profiles (nullable)

ALTER TABLE erp_report_templates
  ADD COLUMN IF NOT EXISTS visual_editor_engine text DEFAULT 'puck',
  ADD COLUMN IF NOT EXISTS visual_layout_schema_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visual_layout_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS visual_layout_updated_by bigint NULL
    REFERENCES user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_erp_report_templates_visual_editor_engine
  ON erp_report_templates(visual_editor_engine)
  WHERE visual_editor_engine IS NOT NULL;

-- No new tables, no RLS changes — existing erp_report_templates RLS applies.
