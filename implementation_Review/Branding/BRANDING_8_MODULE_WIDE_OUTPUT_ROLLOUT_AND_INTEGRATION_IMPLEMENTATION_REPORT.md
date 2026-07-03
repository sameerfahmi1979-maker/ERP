# BRANDING.8 — Module-Wide Output Rollout and Integration
## Implementation Report

**Phase:** BRANDING.8  
**Gate:** Module-Wide Output Rollout and Integration  
**Date:** 2026-07-03  
**Status:** COMPLETED ✅  
**Build:** `npx tsc --noEmit` ✅ | `npm run build` ✅

---

## Executive Summary

BRANDING.8 closes the BRANDING.6/7 pilot gap by enforcing `template_id` for all official HR letter/certificate/form QR issuance, blocking in-place edits to approved/published templates, rolling out the Executive Ledger formal view and template-gated QR flow to all HR outputs, adding a governance dashboard with approver queue and security review list, and integrating approver notifications on template submission.

---

## Files Created

| File | Purpose |
|---|---|
| `src/app/(protected)/admin/reports/templates/governance/page.tsx` | Governance dashboard server page (new route) |
| `src/app/(protected)/admin/reports/templates/governance/governance-dashboard-client.tsx` | Governance dashboard client: status cards, approver queue, security review list |

---

## Files Modified

| File | Change |
|---|---|
| `src/server/actions/reports/templates.ts` | `updateReportTemplate`: BRANDING.8 guard blocks edits for `approved`/`published` status. `listReportTemplatesForSelection`: added `issuableOnly` param to filter to `approved`/`published` only. `ReportTemplateForSelection`: added `governance_status` field. |
| `src/server/actions/reports/public-verification.ts` | `createOutputPublicLink`: BRANDING.8 requires `template_id` for `output_type` in `["letter","certificate","form"]` |
| `src/server/actions/reports/template-governance.ts` | `submitTemplateForReview`: sends in-app notification to `system_admin` role on submission; added `getGovernanceSummary()` export for the governance dashboard. |
| `src/features/report-center/letter-preview-dialog.tsx` | Added `templateId` prop, template picker UI (inline panel), `handleOpenTemplatePicker()` with `issuableOnly:true`. QR issuance now requires template selection. |
| `src/features/report-center/template-governance-actions.tsx` | `GovernanceActionsDropdown`: added `onNewVersionCreated` callback; `createTemplateDraftVersion` now populates a full draft object and fires `onNewVersionCreated` instead of just toasting the ID. |
| `src/features/report-center/report-templates-page-client.tsx` | Added `handleNewVersionCreated` to prepend new draft to table; Governance Queue button in page header; Link import; ShieldCheck icon. |
| `src/lib/rbac/route-access-registry.ts` | Registered `/admin/reports/templates/governance` with `reports.view | reports.manage | reports.template.approve`. |
| `src/lib/workspace/workspace-route-registry.ts` | Registered `/admin/reports/templates/governance` as `moduleCode: REPORTS` singleton tab. |

---

## DB Migration Status

No new migration required for BRANDING.8. All governance schema changes were applied in BRANDING.7 (`20260704020000_branding_7_...sql`).

---

## Template Selection Enforcement (§1)

### Server-side
`createOutputPublicLink` now enforces:
1. If `template_id` is provided → template must be `approved` or `published` (BRANDING.7 guard retained).
2. If `output_type` is `letter`, `certificate`, or `form` → `template_id` is **required**.

Error returned: `"A template_id is required for official letter, certificate, or form issuance. Select an approved or published template before issuing a public verification link."`

### Client-side
`LetterPreviewDialog`:
- New `templateId?: number | null` prop.
- "Issue QR" button label changes to "Select Template & Issue QR" when no template selected.
- Clicking "Issue QR" without a template opens an inline template picker panel that loads approved/published templates via `listReportTemplatesForSelection({ issuableOnly: true })`.
- If no approved/published templates exist, a message directs admins to the Templates & Branding admin.
- Once a template is selected, "Issue QR" proceeds with the selected template.
- Internal preview (Formal View toggle) is still allowed for draft/in_review templates (no template required for preview).

---

## Approved/Published Edit Guard (§2)

`updateReportTemplate` (in `templates.ts`) now fetches the current template's `governance_status` before any mutation. If `approved` or `published`, it returns:

```
"Template '{code}' is {status} and cannot be edited directly. Use 'Create New Version' to make a new draft with your changes."
```

This guard fires regardless of UI. All content, design, and governance fields are blocked. No "minor field" exceptions were added (per the prompt default: block all).

---

## Create-New-Version UX (§3)

`createTemplateDraftVersion` callback in `GovernanceActionsDropdown` now:
- Builds a `Partial<ReportTemplate>` from the parent template's known fields (code, name, type, version_no+1, parent_template_id, governance_status="draft").
- Fires `onNewVersionCreated(draftTemplate)` → parent prepends the new draft to the table list for immediate visibility.
- Toast shows version number and says "Edit it in the templates list."

`handleNewVersionCreated` in `ReportTemplatesPageClient` prepends the new draft row to `templates` state so it appears immediately at the top of the table without a page refresh.

---

## Executive Ledger + QR HR Formal Outputs (§4)

The `LetterPreviewDialog` is the single preview host for all HR letter types via `HrLetterGenerator`. It already supported the Executive Ledger formal view from BRANDING.6. BRANDING.8 adds:

- Template selection for QR issuance (see §1 above) — applicable to all 8 HR letter types:
  - Experience Letter, Salary Certificate (General), Salary Certificate (with Amount)
  - NOC, Employee ID Card, PPE Issue Form, Joining Checklist, Clearance Form
- The `templateId` prop allows pre-wiring from `HrLetterGenerator` if a default template is available in the future.
- All HR letter sensitive data rules are unchanged: `HR_SALARY_CERT_WITH_AMOUNT` is blocked by `hr.payroll.view` check in the fetcher; salary, IBAN, passport raw data are not exposed in public verification payloads (verification_summary contains only `document_type`, `document_title`, `subject_name`).

---

## Governance Dashboard (§6)

New route: `/admin/reports/templates/governance`

**Server Page** (`page.tsx`):
- Auth check: requires `reports.view` OR `reports.manage` OR `reports.template.approve`; redirects to `/admin/reports/templates` otherwise.
- Fetches full governance summary via `getGovernanceSummary()`.
- Computes `canApprove`, `canPublish`, `canManage` flags from RBAC context.

**Client Component** (`governance-dashboard-client.tsx`):
- Status count cards: draft, in_review, approved, published, rejected, archived — with total count.
- Approver queue: all `in_review` templates with Approve / Reject quick actions (visible when `canApprove`).
- Failed security review list: templates with `security_review_status = "failed"` + "Re-run Review" action.
- Reject dialog uses `ERPChildDialogForm` (standard pattern).
- All actions call BRANDING.7 server actions directly.
- Optimistic state updates (no page reload needed).

**Navigation**: "Governance Queue" button added to Templates & Branding page header for all users with `reports.view`.

---

## Approver Notification (§5)

`submitTemplateForReview` now fires a `createNotification` call (fire-and-forget, non-blocking) after successful status update:

- `recipient_role_code: "system_admin"` — targets system admins.
- `source_entity_type: "erp_report_templates"` / `source_entity_id: templateId`.
- `action_url: "/admin/reports/templates/governance"` — deep link to governance queue.
- Notification payload contains only: template code, name, governance status, security review status.
- No raw template body/HTML in notification payload.
- `notification_code: "TEMPLATE_REVIEW_{id}"` — prevents duplicate notification spam with `ON CONFLICT` behavior in the notifications system.
- Notification failure does not block or rollback the submission.

---

## Public Verification Hardening (§7)

No internal IDs appear in public URLs (token-based as in BRANDING.6).  
Admin list remains permission-gated (`reports.verify.admin`).  
The existing `sanitizePublicPayload()` and `buildVerificationSummary()` guards are unchanged and still applied.  
BRANDING.6 permission correction remains: `group_admin` has `reports.publish` but NOT `reports.verify.admin`.

---

## Security Notes

- No new public SELECT policies added.
- No service-role key in any client code.
- `governance_status` column check (`approved`/`published`) is server-side only — client cannot bypass.
- `template_id` requirement in `createOutputPublicLink` is server-enforced regardless of client state.
- Approved/published template edit block is server-enforced in `updateReportTemplate`.
- Salary, IBAN, medical, passport raw, AI prompts, OCR text remain excluded from all public verification payloads.

---

## Validation Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ No errors |
| `npm run build` | ✅ Success — `/admin/reports/templates/governance` compiled |
| `createOutputPublicLink` blocks missing `template_id` for letter/certificate | ✅ Enforced server-side |
| `updateReportTemplate` blocks approved/published direct edits | ✅ Enforced server-side |
| `createTemplateDraftVersion` creates draft and adds to table state | ✅ Client + server |
| HR formal outputs use EL preview + template-gated QR | ✅ Via `LetterPreviewDialog` |
| Governance dashboard shows queue + security fails | ✅ New route |
| Approver notification on template submission | ✅ `erp_notifications` integration |
| BRANDING.6 correction retained: `group_admin` no `reports.verify.admin` | ✅ DB unchanged |

---

## Known Limitations

1. **`HrLetterGenerator` does not pre-select a template.** The template picker inside `LetterPreviewDialog` requires users to select a template interactively before issuing QR. Future improvement: pass a default per-report-code template from the company branding setup.
2. **Notification targets `system_admin` only.** The notification system does not currently support dynamic role resolution for `reports.template.approve` holders. A follow-up improvement could query user profiles with `reports.template.approve` and notify each one individually.
3. **No DB migration in BRANDING.8.** All governance schema was added in BRANDING.7. If new indexes are needed (e.g., on `governance_status`, `security_review_status`), they can be added in BRANDING.9.
4. **Governance dashboard is server-rendered.** Quick actions cause optimistic state updates but a page refresh restores the server-fetched state. Full realtime subscription (via Supabase Realtime) is deferred to BRANDING.9.

---

## Next Recommended Phase

**BRANDING.9 — Final QA, Runtime UAT, Hardening, and Closure**

Scope:
- Add DB indexes on `erp_report_templates.governance_status`, `security_review_status` for dashboard performance.
- Runtime UAT of full QR issuance flow with a real approved template.
- Validate public verification page shows no internal IDs.
- Test EL formal view print and PDF export for all HR letter types.
- Final review of all BRANDING.6–8 security guardrails.
- Close the BRANDING series.
