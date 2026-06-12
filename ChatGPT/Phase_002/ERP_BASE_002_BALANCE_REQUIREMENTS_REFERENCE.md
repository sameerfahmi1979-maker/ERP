# ERP BASE 002 — Remaining Foundation Requirements Reference

**Document Purpose:** Reference file for the remaining ERP BASE 002 foundation work before starting or expanding major business modules such as HR, Fleet, Workshop, Procurement, Inventory, Projects, HSE, Finance, and Operations.

**Important Decision:** ERP BASE 002E.3F — Microsoft Graph Live Email Test will be completed later because it is blocked by Microsoft Graph / Azure credentials. It should not stop the remaining foundation work.

---

## 1. Current Position

The last reviewed stage was **ERP BASE 002E.3F — Microsoft Graph Live Email Test**.

**Status:** Blocked / Awaiting Microsoft Graph Credentials.

The email/export implementation is technically ready, but live testing cannot continue until the following Microsoft 365 / Azure details are provided:

- Microsoft Tenant ID
- Microsoft Client ID
- Microsoft Client Secret
- Microsoft Mail Sender
- Azure App Registration with Microsoft Graph `Mail.Send` permission
- Admin consent granted
- Sender mailbox ready

This item can remain pending and be completed later.

---

## 2. ERP BASE 002 Balance Roadmap

Recommended remaining sequence:

1. **ERP BASE 002E.4 — Global Draft / Unsaved Changes / Incomplete Form Engine**
2. **ERP BASE 002E.5 — Global Record Status and Lifecycle Foundation**
3. **ERP BASE 002F.1 — App Settings / Company Settings / Letterhead Foundation**
4. **ERP BASE 002F.2 — Global Numbering / Prefix / Sequence Engine**
5. **ERP BASE 002F.3 — Global Lookup / Dropdown / Master Data Engine**
6. **ERP BASE 002F.4 — Core Global Master Data**
7. **ERP BASE 002F.5 — Global Attachment / Document Metadata Foundation**
8. **ERP BASE 002F.6 — Global Export / Print / PDF / Excel / CSV Engine Completion**
9. **ERP BASE 002F.7 — Send by Email Engine — Live Test Later**
10. **ERP BASE 002F.8 — Global Data Table Standardization**
11. **ERP BASE 002F.9 — Global Drawer Form Standardization**
12. **ERP BASE 002F.10 — Audit Log Foundation**
13. **ERP BASE 002F.11 — Permission / Role / Access Foundation Review**
14. **ERP BASE 002F.12 — Final Foundation Readiness Gate**

---

# 3. ERP BASE 002E.4 — Global Draft / Unsaved Changes / Incomplete Form Engine

## Objective
Create a global draft and unsaved-change framework that works across all current and future ERP modules.

## Requirements

1. Save any add/edit form as Draft.
2. Clearly mark incomplete records as Draft.
3. Prevent Draft records from being treated as final operational records.
4. Allow users to continue editing Draft records later.
5. Warn users before leaving unsaved forms.
6. Support Draft mode for current and future modules.
7. Integrate Draft status into global drawer forms.
8. Track `created_by`, `created_on`, `draft_saved_by`, `draft_saved_on`, `last_modified_by`, and `last_modified_on`.
9. Do not trigger approvals/workflows from Draft records.
10. Do not include Draft records in final operational reports unless explicitly filtered.
11. Add visual Draft badge.
12. Add Draft filter to all lists.
13. Add Draft count where useful.
14. Prevent final document numbering until record is submitted/finalized if required by numbering rules.
15. Add audit log for Draft-to-Final transition.

## Expected Deliverables

- Draft engine design
- Draft state handling
- Unsaved-change warning component
- Draft-save button support in forms/drawers
- Draft audit entries
- Implementation report

---

# 4. ERP BASE 002E.5 — Global Record Status and Lifecycle Foundation

## Objective
Standardize record lifecycle across modules.

## Requirements

1. Standard status model: Draft, Active, Inactive, Cancelled, Closed, Archived.
2. Standard cancellation reason.
3. Standard closed reason.
4. Standard closed date.
5. Standard closed by.
6. Prevent hard delete where not allowed.
7. Support soft archive.
8. Status color badges.
9. Status filtering in every list.
10. Status audit log.
11. Reason required when cancelling.
12. Reason required when archiving if configured.
13. Ability to restore archived records if allowed.
14. Support module-specific status extension without hardcoding.
15. Support workflow status vs operational status distinction.

## Expected Deliverables

- Global status model
- Reusable status badge component
- Lifecycle audit logic
- Standard cancel/archive/close pattern
- Implementation report

---

# 5. ERP BASE 002F.1 — App Settings / Company Settings / Letterhead Foundation

## Objective
Create a central app settings and company settings foundation for all output, print, email, branding, and multi-company behavior.

## Requirements

1. App settings page.
2. Multi-company settings support.
3. Company legal name.
4. Company short name.
5. Company logo.
6. Company address.
7. Trade license number.
8. TRN / tax number.
9. Phone.
10. Email.
11. Website.
12. Default currency.
13. Default timezone.
14. Default date format.
15. Default number format.
16. Default letterhead.
17. Multiple letterheads per company.
18. Letterhead selection during print/export/email.
19. Footer text.
20. Signature block.
21. Stamp/seal placeholder if needed.
22. Draft watermark.
23. Cancelled watermark.
24. Confidential watermark if needed.
25. Multi-company print header selection.
26. Default terms and conditions per company if needed.
27. Audit changes to settings.
28. Restrict settings to authorized roles only.

## Expected Deliverables

- App settings tables/pages
- Company settings extension
- Letterhead configuration
- Output settings
- Implementation report

---

# 6. ERP BASE 002F.2 — Global Numbering / Prefix / Sequence Engine

## Objective
Implement a global numbering engine before building further modules.

## Why This Is Critical
Without a central numbering engine, each future module may create inconsistent reference numbers. A global numbering engine ensures all modules follow the same enterprise standard.

## Requirements

1. Central numbering settings table.
2. Document type code.
3. Module code.
4. Company prefix.
5. Branch prefix.
6. Department prefix where required.
7. Year token.
8. Month token.
9. Date token.
10. Sequence length.
11. Reset rule: yearly, monthly, daily, never.
12. Preview next number.
13. Generate number on save, submit, approval, or manual trigger.
14. Reserve number support.
15. Prevent duplicate numbers.
16. Collision protection under concurrent saves.
17. Cancelled record behavior: keep number, void number, reuse prohibited.
18. Manual override only for authorized roles.
19. Audit every number generation.
20. Audit every manual override.
21. Support multiple document series per DocType.
22. Support company-specific series.
23. Support branch-specific series.
24. Support module-specific series.
25. Support prefix template builder.
26. Support inactive/active numbering rules.
27. Support fallback rule if no specific numbering rule exists.
28. Prevent deletion of used numbering rule.
29. Support sequence locking.
30. Support migration from temporary IDs to final references if needed.

## Example Template

```text
{COMPANY}-{BRANCH}-{DOC}-{YYYY}-{SEQ6}
```

## Example Outputs

```text
ALGT-AUH-EMP-2026-000001
ALS-AUH-PO-2026-000001
PGI-DXB-INV-2026-000001
AET-AUH-HSE-INC-2026-000001
```

## Suggested Tables / Entities

- numbering_series_settings
- numbering_series_counters
- numbering_series_audit_log
- document_type_codes
- module_codes
- branch_codes
- company_codes

## Expected Deliverables

- Numbering engine
- Prefix template support
- Counter management
- Number generation API/helper
- Audit log
- Tests for duplicate prevention
- Implementation report

---

# 7. ERP BASE 002F.3 — Global Lookup / Dropdown / Master Data Engine

## Objective
Remove hardcoded dropdowns and replace them with a central lookup/master-data system.

## Requirements

1. No hardcoded dropdowns.
2. Central lookup categories.
3. Lookup values.
4. Active/inactive values.
5. Sort order.
6. Company-specific values.
7. Global values.
8. Module-specific lookup support.
9. Parent-child lookup support.
10. Arabic label.
11. English label.
12. Short code.
13. System code.
14. Display order.
15. Color/badge support if applicable.
16. Prevent duplicate lookup values.
17. Prevent deletion if lookup value is used.
18. Allow deactivation instead of deletion.
19. Import/export lookup values.
20. Support migration from hardcoded values to lookup values.
21. Support role-restricted lookup maintenance.
22. Support future modules reusing same lookup engine.

## Example Lookup Categories

- employee_status
- document_status
- approval_status
- priority_level
- risk_level
- vehicle_type
- equipment_type
- fuel_type
- payment_term
- attachment_category
- expiry_category
- work_site_type

## Expected Deliverables

- Lookup category model
- Lookup value model
- Lookup management UI
- Integration pattern for dropdowns
- Implementation report

---

# 8. ERP BASE 002F.4 — Core Global Master Data

## Objective
Create the global master data required before building additional modules.

## Required Master Data

### Geography and Location
1. Countries
2. Emirates / states / regions
3. Cities
4. Areas
5. Zones
6. Work sites
7. Branch locations

### Company and Organization
8. Companies
9. Branches
10. Departments
11. Designations
12. Job categories
13. Cost centers
14. Projects
15. Work sites

### Finance and Commercial
16. Currencies
17. Tax categories
18. Banks
19. Payment terms
20. Payment methods
21. Account groups if required
22. Cost allocation categories

### Documents and Compliance
23. Document categories
24. Attachment categories
25. Expiry categories
26. Document types
27. Approval statuses
28. Verification statuses
29. Risk levels
30. Priority levels

### Assets / Fleet / Equipment
31. Asset categories
32. Vehicle categories
33. Equipment categories
34. Equipment classes
35. Fuel types
36. Maker / model categories
37. Ownership types

### CRM / Procurement
38. Customer categories
39. Vendor categories
40. Supplier categories
41. Service categories
42. Material categories
43. Item categories

### Operations
44. Shift types
45. Activity types
46. Job types
47. Site types
48. Service locations
49. Route categories

## Requirements

1. Each master table must support active/inactive.
2. Each master table must support sort order where useful.
3. Each master table must include audit fields.
4. Deactivation preferred over delete.
5. Prevent deleting used master data.
6. Support import/export if needed.
7. No company branding in technical names.
8. White-label / multi-company ready.

## Expected Deliverables

- Master data list
- Required fields per master
- Seed data where needed
- Implementation report

---

# 9. ERP BASE 002F.5 — Global Attachment / Document Metadata Foundation

## Objective
Create a reusable attachment/document metadata foundation for all records.

## Requirements

1. Attachment field available for every major record.
2. Link attachment to any module record.
3. Document name.
4. Document category.
5. Document type.
6. File attachment.
7. Private/public flag.
8. Default private file handling.
9. Issue date.
10. Expiry required Yes/No.
11. Expiry date.
12. Document number.
13. Uploaded by.
14. Uploaded on.
15. Version number.
16. Replace/renew document.
17. Archive old document.
18. Download permission check.
19. Preview permission check.
20. Expiry reminder-ready fields.
21. Attachment audit log.
22. Prevent public URLs for private documents.
23. Allow multiple documents per record.
24. Support document metadata without file if needed.
25. Support future DMS integration.

## Required Metadata Fields

- linked_doctype
- linked_record
- company
- document_name
- document_category
- document_type
- document_number
- issue_date
- expiry_required
- expiry_date
- file
- is_private
- version
- status
- uploaded_by
- uploaded_on
- remarks

## Expected Deliverables

- Attachment metadata model
- Reusable attachment section
- Permission rules
- Audit log
- Implementation report

---

# 10. ERP BASE 002F.6 — Global Export / Print / PDF / Excel / CSV Engine Completion

## Objective
Complete the global export/print engine and make sure it is ready for all modules.

## Requirements

1. Print from list.
2. Print from form.
3. PDF from list.
4. PDF from form.
5. Excel export.
6. CSV export.
7. Export selected rows.
8. Export filtered rows.
9. Respect hidden columns.
10. Respect column order.
11. Respect current sorting.
12. Respect current filters.
13. Respect user permissions.
14. Use company letterhead.
15. Use selected letterhead.
16. Draft watermark.
17. Cancelled watermark.
18. Confidential watermark if required.
19. Export audit log.
20. Print audit log.
21. Permission check before export.
22. No export of hidden restricted fields.
23. Support dense enterprise table format.
24. Support Arabic text.
25. Support UTF-8 CSV.
26. Support PDF filename rules.
27. Support Excel sheet title rules.
28. Standard export error handling.

## Expected Deliverables

- Export/print final foundation report
- Security validation
- Permission validation
- Audit validation

---

# 11. ERP BASE 002F.7 — Send by Email Engine

## Objective
Use the existing email foundation, but live test later when Microsoft Graph credentials are ready.

## Current Status
Implementation is ready, but live testing is blocked by Microsoft Graph credentials.

## Requirements

1. Send PDF by email.
2. Send Excel by email.
3. Send CSV by email.
4. Multiple recipients.
5. CC.
6. BCC.
7. Email subject template.
8. Email body template.
9. Attachment generation.
10. Permission check.
11. Audit log.
12. Microsoft Graph provider.
13. Config validation.
14. Graceful error if Microsoft Graph is not configured.
15. Live test after credentials are configured.
16. No secrets in client.
17. No email body or attachment content in audit logs.
18. Attachment size limits.
19. Recipient count limits.
20. International text support.

## Required Later Inputs

- MICROSOFT_TENANT_ID
- MICROSOFT_CLIENT_ID
- MICROSOFT_CLIENT_SECRET
- MICROSOFT_MAIL_SENDER
- Azure App Registration
- Mail.Send application permission
- Admin consent
- Sender mailbox

## Expected Deliverables Later

- Live test report
- Attachment delivery report
- Audit validation report
- Security validation report

---

# 12. ERP BASE 002F.8 — Global Data Table Standardization

## Objective
Create a reusable enterprise-grade data table component for all modules.

## Requirements

1. Reusable global data table component.
2. Sortable columns.
3. Resizable columns.
4. Expandable/reducible columns.
5. Column visibility.
6. Persistent user table preferences.
7. Search.
8. Advanced filters.
9. Filter chips.
10. Pagination.
11. Dense enterprise layout.
12. Row selection.
13. Bulk actions.
14. Export integration.
15. Print integration.
16. Send by email integration.
17. Status badges.
18. Action menu per row.
19. Sticky header.
20. Optional frozen columns.
21. Loading skeleton.
22. Empty state.
23. Error state.
24. Permission-aware actions.
25. Responsive handling.

## Expected Deliverables

- Global table component
- User preference storage
- Export/print integration
- Tests
- Implementation report

---

# 13. ERP BASE 002F.9 — Global Drawer Form Standardization

## Objective
Standardize add/edit/view forms through reusable right-side drawer forms.

## Requirements

1. Add form opens in right-side drawer.
2. Edit form opens in right-side drawer.
3. View form opens in right-side drawer.
4. Drawer width around 80%.
5. Save button.
6. Save Draft button.
7. Cancel button.
8. Unsaved changes warning.
9. Validation messages.
10. Section layout.
11. Attachment area.
12. Audit/history panel if needed.
13. Permission-aware actions.
14. Loading state.
15. Error state.
16. Reusable for all modules.
17. Keyboard shortcuts where useful.
18. Mobile/tablet behavior.
19. Prevent accidental data loss.
20. Works with global draft engine.

## Expected Deliverables

- Global drawer component
- Form state handling
- Draft integration
- Unsaved changes guard
- Implementation report

---

# 14. ERP BASE 002F.10 — Audit Log Foundation

## Objective
Create a global audit foundation for all sensitive and business-critical operations.

## Requirements

1. Create audit.
2. Update audit.
3. Delete/archive audit.
4. Status change audit.
5. Permission change audit.
6. Export audit.
7. Print audit.
8. Email audit.
9. Attachment audit.
10. Numbering audit.
11. Login/security event audit if needed.
12. User ID.
13. Timestamp.
14. Company.
15. Branch.
16. Record type.
17. Record ID.
18. Action type.
19. Old value/new value where safe.
20. No secrets in logs.
21. No sensitive attachments in logs.
22. Filter/report audit logs.
23. Permission restricted audit viewer.
24. Retention policy.
25. Tamper-resistant design where feasible.

## Expected Deliverables

- Global audit log model
- Audit helper functions
- Audit viewer/report
- Permission rules
- Implementation report

---

# 15. ERP BASE 002F.11 — Permission / Role / Access Foundation Review

## Objective
Review and standardize the permission foundation before building more modules.

## Requirements

1. Standard roles.
2. Module roles.
3. Admin roles.
4. Read permission.
5. Create permission.
6. Edit permission.
7. Delete/archive permission.
8. Export permission.
9. Print permission.
10. Email permission.
11. Attachment permission.
12. Audit log permission.
13. Numbering override permission.
14. Company access.
15. Branch access.
16. User-specific access.
17. Department-specific access if needed.
18. No public access to private data.
19. Test anon/authenticated access as per app setup.
20. Validate custom authentication behavior.
21. Prevent privilege escalation.
22. Permission audit log.
23. Role assignment review.
24. Separation of duties where needed.
25. Admin-only configuration access.

## Expected Deliverables

- Role matrix
- Permission test report
- Security review
- Implementation report

---

# 16. ERP BASE 002F.12 — Final Foundation Readiness Gate Before Modules

## Objective
Perform a final readiness review before starting/expanding business modules.

## Must Confirm

1. Numbering engine works.
2. Prefix engine works.
3. Master data exists.
4. Lookup engine works.
5. Attachment metadata foundation works.
6. Drawer forms work.
7. Draft workflow works.
8. Export/print works.
9. Send by email is ready, even if live test pending.
10. Global table rules work.
11. App settings work.
12. Letterhead settings work.
13. Audit log works.
14. Permissions are checked.
15. No hardcoded dropdowns.
16. No duplicate master data.
17. No core architecture gaps.
18. No security gaps.
19. No missing reusable foundation component.
20. Clear go/no-go decision before next modules.

## Final Decision Options

- Approved to start next module
- Approved with conditions
- Not approved; correction required

## Expected Deliverables

- ERP BASE 002 final foundation readiness report
- Open issue list
- Deferred item register
- Recommendation for next module

---

# 17. Recommended Immediate Next Step

The most important next foundation phase should be:

## ERP BASE 002F.2 — Global Numbering / Prefix / Sequence Engine

Reason:

Every future module will need clean document/reference numbering. This should be completed before building additional module records.

After numbering:

1. 002F.3 — Lookup / Dropdown Engine
2. 002F.4 — Core Global Master Data
3. 002F.5 — Global Attachment Metadata Foundation
4. 002F.12 — Final Readiness Review

---

# 18. Items Deferred

## ERP BASE 002E.3F — Microsoft Graph Live Email Test

Deferred because Microsoft Graph credentials are not yet configured.

Live email testing should resume only after:

- Azure App Registration created
- Mail.Send permission granted
- Admin consent granted
- Sender mailbox ready
- `.env.local` configured
- Dev server restarted

---

# 19. Reference Notes

The foundation must remain:

- Multi-company ready
- UAE-ready
- No hardcoded dropdowns
- No hardcoded company names
- No unnecessary module-specific duplication
- No premature HR/Fleet/Workshop module work before global reusable foundations
- Compatible with future HR, Fleet, Workshop, Inventory, Procurement, HSE, Projects, CRM, and Finance modules
