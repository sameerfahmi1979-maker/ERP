-- OUTPUT.4 (WP8) — HR first-adopter onboarding policy overrides.
--
-- v6.1 approvals: "Require approval by default for salary certificates containing
-- amounts and sensitive NOCs."
--   • HR_SALARY_CERT_WITH_AMOUNT is Class A → approval already required by class policy.
--   • HR_NOC is Class B (no approval by class default) → explicit registry override.
--     NOC purposes vary (travel, bank, government) and can be sensitive; the safe
--     default is approval-required. A future per-purpose policy may relax this.

UPDATE erp_report_registry
SET approval_required_override = true,
    updated_at = now()
WHERE report_code = 'HR_NOC'
  AND deleted_at IS NULL
  AND approval_required_override IS DISTINCT FROM true;

-- Verified separation: HR_EMPLOYMENT_LETTER and HR_EXPERIENCE_LETTER remain
-- distinct registry identities (no merge) — no change required.
