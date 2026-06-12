# PROMPT_ERP_BASE_002F_3E_3B_3F_FIX_CUSTOMER_FORM_SAVE_BUTTONS_AND_FINAL_QA

Act as a senior ERP QA lead, enterprise ERP UI/UX architect, reusable form-component architect, React form-state engineer, Next.js runtime tester, Playwright automation engineer, Supabase/PostgreSQL verification reviewer, SaaS security tester, and Cursor bug-fix engineer.

## Phase

ERP BASE 002F.3E.3B.3F — Fix Customer Form Save Buttons and Final QA

## Prompt Purpose

This is a controlled BUG FIX / FINAL QA prompt.

The previous fix report:

```text
ERP_BASE_002F_3E_3B_3F_SAVE_BUTTON_KEEP_FORM_OPEN_FIX_REPORT.md
```

confirmed that the root `ERPFormFooter` Save-button bug was fixed at component level.

However, the same report identified a remaining issue:

```text
Customer main drawer may not show Save / Save & Close buttons because customer-form-drawer.tsx passes onSaveAndClose={undefined}.
```

This must be verified and fixed before final closure of 3B.3F.

Correct approved footer standard:

```text
Add/Edit mode:
Cancel | Save | Save & Close

View mode:
Close only
```

Correct behavior:

```text
Save:
- save the customer
- keep the Customer drawer open

Save & Close:
- save the customer
- close the Customer drawer after successful save
```

Do not implement Safe Close.

Do not implement outside-click prevention.

Do not implement dirty-state tracking.

Do not implement confirmation dialogs.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not start 3B.4.

---

# 1. Mandatory Standards To Read First

Before fixing, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review these reports:

```text
ERP_BASE_002F_3E_3B_3_REQUIRED_FIELD_MARKERS_AND_FORM_FOOTER_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md

ERP_BASE_002F_3E_3B_3C_COMPLETION_FIX_NUMBERING_ASSIGN_ROLE_QA_REPORT.md

ERP_BASE_002F_3E_3B_3D_REPORT_CORRECTION_AND_QA_CLOSURE_REPORT.md

ERP_BASE_002F_3E_3B_3E_STANDALONE_AUTH_FORMS_REQUIREDLABEL_IMPLEMENTATION_REPORT.md

ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA_REPORT.md

ERP_BASE_002F_3E_3B_3F_SAVE_BUTTON_KEEP_FORM_OPEN_FIX_REPORT.md
```

The final fix report must confirm all reviewed files.

---

# 2. Mandatory Supabase Connection First

Before fixing, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live schema/status for:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
global_numbering_rules
global_lookup_values
countries
emirates
cities
areas_zones
banks
currencies
payment_terms
tax_types
```

No database change is required.

The report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for the Customer Save button final fix.
```

If Supabase connection fails, continue source-code inspection if possible but document the warning clearly.

---

# 3. Critical Issue To Verify

Inspect:

```text
src/features/master-data/customers/components/customer-form-drawer.tsx
```

Confirm whether the Customer main drawer currently has:

```text
Cancel
Save
Save & Close
```

in Add/Edit modes.

Also confirm whether the `ERPFormFooter` call currently has:

```tsx
onSave={...}
onSaveAndClose={...}
```

If either handler is missing or undefined, fix it.

---

# 4. Correct Customer Main Drawer Behavior

## Add Mode

```text
Cancel:
- closes the drawer without saving
- Safe Close confirmation is NOT part of this phase

Save:
- creates the customer
- keeps drawer open
- after successful create, avoid duplicate creation on another Save
- preferred behavior: transition to edit mode for the newly created customer if current architecture supports it
- at minimum, update the current customer state/id/reference so next save updates rather than creates duplicate
- show success toast if existing pattern supports it
- refresh customer list if existing pattern supports it

Save & Close:
- creates the customer
- closes drawer after successful save
- refreshes customer list
```

## Edit Mode

```text
Cancel:
- closes drawer without saving
- Safe Close confirmation is NOT part of this phase

Save:
- updates the customer
- keeps drawer open
- refreshes current customer data/state if needed
- show success toast if existing pattern supports it

Save & Close:
- updates the customer
- closes drawer after successful save
- refreshes customer list
```

## View Mode

```text
Footer must show Close only.
No Save.
No Save & Close.
```

---

# 5. Required Implementation Rules

Use the fixed `ERPFormFooter` behavior:

```text
Save button type="button" and calls onSave.
Save & Close button type="button" and calls onSaveAndClose.
```

Do not reintroduce `formId`-submit behavior.

Do not rely on form `onSubmit` to distinguish Save from Save & Close.

Implement clear action mode if needed:

```text
saveAction = "save" | "saveAndClose"
```

or separate handlers:

```tsx
handleSave()
handleSaveAndClose()
```

Preferred handler pattern:

```tsx
const handleSave = async () => {
  const success = await submitCustomer({ closeAfterSave: false });
  if (success) {
    // keep drawer open
    // if created, switch to edit/current record if architecture supports it
  }
};

const handleSaveAndClose = async () => {
  const success = await submitCustomer({ closeAfterSave: true });
  if (success) {
    onOpenChange(false);
  }
};
```

Do not duplicate customer creation on repeated Save.

This is critical.

---

# 6. Customer Child Dialogs

Inspect child dialogs only to confirm they are not wrongly affected:

```text
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
```

If they use only action-specific buttons like:

```text
Cancel | Save Contact
Cancel | Save Address
Cancel | Save Bank Detail
```

document whether they are child action dialogs or require separate standardization later.

Do not refactor child dialogs unless they are part of the same Customer main drawer footer issue or directly violate already approved standard.

---

# 7. Forms To Re-Verify After Fix

At minimum verify:

```text
src/components/erp/erp-form-footer.tsx
src/features/master-data/customers/components/customer-form-drawer.tsx
```

Also verify representative forms still behave correctly after the previous ERPFormFooter fix:

```text
src/features/roles/role-form-dialog.tsx
src/features/numbering/components/numbering-rule-form-dialog.tsx
src/features/master-data/geography/components/country-form-dialog.tsx
```

Do not modify these representative forms unless a direct regression is found.

---

# 8. Testing Requirements

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Rules:

```text
typecheck must pass
build must pass
lint must be run
if lint fails only due pre-existing unrelated issues, document clearly
if lint fails due this fix, fix before report
```

## Browser / Manual Test Requirement

If authenticated browser testing is available, test:

```text
Customer Add:
- click Save
- verify drawer stays open
- verify customer is saved
- click Save again
- verify it does not create duplicate customer
- click Save & Close
- verify drawer closes

Customer Edit:
- click Save
- verify drawer stays open
- verify customer updates
- click Save & Close
- verify drawer closes

Customer View:
- verify Close only

Representative Admin/System:
- Role or Numbering Rule Save keeps open
- Save & Close closes

Representative Core Master Data:
- Country Save keeps open
- Save & Close closes
```

If browser testing cannot be performed due authentication/session limitation, final status must be:

```text
PASS WITH NOTES
```

not full PASS.

---

# 9. Required Fix Report

Create:

```text
ERP_BASE_002F_3E_3B_3F_CUSTOMER_SAVE_BUTTONS_FINAL_QA_FIX_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards reviewed.
5. Reports reviewed.
6. Root cause of Customer missing Save/Save & Close buttons.
7. Files inspected.
8. Files modified.
9. Customer main drawer before/after behavior.
10. Add mode behavior.
11. Edit mode behavior.
12. View mode behavior.
13. Duplicate-create prevention explanation.
14. Child dialog status.
15. Representative regression checks.
16. Static test results: typecheck/lint/build.
17. Browser/manual test status.
18. Known limitations.
19. Whether 3B.3F can close.
20. Correct next phase reference.

Correct next phase after final 3B.3F closure:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Final status must be exactly one of:

```text
PASS — Customer Save / Save & Close behavior fixed and verified; 3B.3F can close.
PASS WITH NOTES — Customer Save / Save & Close behavior fixed by source/static QA; manual browser QA still pending.
FAIL — Customer Save / Save & Close behavior still has issues.
BLOCKED — Customer Save / Save & Close behavior fix could not be completed due to blocking issue.
```

---

# 10. Closure Criteria

3B.3F can close only if:

```text
Customer Add/Edit footer shows Cancel | Save | Save & Close.
Customer View footer shows Close only.
Customer Save keeps drawer open.
Customer Save & Close closes drawer.
Customer Save after Add does not create duplicate customer on repeated Save.
ERPFormFooter root Save behavior remains fixed.
Representative forms are not regressed.
Typecheck passes.
Build passes.
Lint is run and documented.
Safe Close remains deferred to 3B.4.
```

If browser testing remains pending, closure can only be:

```text
CLOSED WITH NOTES
```

not full clean PASS.

---

# 11. Stop Condition

After fixing Customer Save buttons, running tests, and creating the report, stop.

Do not start 3B.4.

Wait for Sameer/Dina review.

---

# Final Instruction

Read standards.

Connect to Supabase.

Inspect customer-form-drawer.tsx.

Fix Customer Add/Edit footer to show Cancel | Save | Save & Close.

Fix Save so it keeps the Customer drawer open.

Fix Save & Close so it closes after successful save.

Prevent duplicate customer creation on repeated Save after Add.

Do not implement Safe Close.

Run tests.

Create final fix report.

Stop.
