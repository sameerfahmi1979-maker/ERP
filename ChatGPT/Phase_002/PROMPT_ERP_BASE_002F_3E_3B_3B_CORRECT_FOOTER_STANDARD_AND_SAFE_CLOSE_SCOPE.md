# PROMPT_ERP_BASE_002F_3E_3B_3B_CORRECT_FOOTER_STANDARD_AND_SAFE_CLOSE_SCOPE

Act as a senior ERP QA lead, enterprise ERP UI/UX architect, reusable form-component architect, accessibility reviewer, SaaS security tester, Next.js runtime tester, Supabase/PostgreSQL schema auditor, and Cursor implementation planner.

## Phase

ERP BASE 002F.3E.3B.3B — Correct Global Required Fields and Footer Audit Files

## Prompt Purpose

This is a CORRECTION / PLANNING-ONLY prompt.

Do not implement code.

Do not modify UI components.

Do not modify forms.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not continue to implementation.

Your task is to correct the existing **3B.3B audit/planning files** so the global footer standard is accurate and consistent across the ERP.

The current audit files incorrectly state or imply that the Add/Edit footer may be:

```text
Cancel | Save & Close
```

This must be corrected.

The approved global ERP standard is:

```text
Add/Edit mode:
Cancel | Save | Save & Close

View mode:
Close only
```

Also clarify that **Safe Close / Unsaved Changes / outside-click behavior** is not part of 3B.3 implementation. It belongs to the next phase:

```text
ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

---

# 1. Mandatory Standards To Read First

Before correcting the files, read:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Confirm that the UI/UX guide standard is:

```text
Add/Edit/Draft modes:
Cancel | Save | Save & Close

View mode:
Close only
```

Also confirm that Safe Close is a separate standard/phase:

```text
Add/Edit:
- outside-click close must be prevented
- dirty form close must ask confirmation

View:
- outside-click close can be allowed
- Esc / X / Close can close directly
```

But Safe Close implementation is NOT part of 3B.3.

---

# 2. Mandatory Supabase Connection First

Connect to the live Supabase project for workflow consistency:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

No schema change is required.

The correction report or corrected audit file must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for this correction.
```

If Supabase connection fails, still correct the planning files and document:

```text
WARNING — Live Supabase verification could not be completed during this planning correction. No database changes were performed.
```

---

# 3. Files To Correct

Update only these existing audit/planning files:

```text
ERP_BASE_002F_3E_3B_3B_GLOBAL_REQUIRED_FIELDS_AND_FOOTER_AUDIT_PLAN.md
ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md
ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

Review this file for consistency, but update only if it contains footer-scope wording that conflicts with the standard:

```text
ERP_BASE_002F_3E_3B_3B_REQUIRED_FIELDS_MODULE_MATRIX.md
```

Do not create new implementation files.

Do not create source code.

Do not modify app code.

---

# 4. Correction 1 — Footer Standard Must Include Save Button

Find and replace all incorrect footer standard wording.

Correct standard:

```text
Add/Edit mode:
Cancel | Save | Save & Close

View mode:
Close only
```

This applies to:

```text
all drawer forms
all modal/dialog forms where editing data
all future ERP Add/Edit forms
Customer module
Admin/System forms
Master Data forms
Party Master future modules
```

Do not say Save is optional in the standard.

If any current form cannot practically support **Save** immediately, document this as:

```text
Implementation limitation:
This form may initially support Save & Close only if current architecture cannot safely keep the form open after save. Such cases must be reported as PASS WITH NOTES, and a follow-up task must be created to complete full Save support.
```

But the target standard remains:

```text
Cancel | Save | Save & Close
```

---

# 5. Correction 2 — Footer Rollout Matrix Must Be Updated

In:

```text
ERP_BASE_002F_3E_3B_3B_FOOTER_STANDARD_ROLLOUT_MATRIX.md
```

Update all sections that currently say:

```text
Cancel | Save & Close
```

to:

```text
Cancel | Save | Save & Close
```

Update implementation pattern examples.

Before:

```tsx
<ERPFormFooter
  mode={isViewing ? "view" : isEditing ? "edit" : "add"}
  onCancel={() => onOpenChange(false)}
  onSaveAndClose={undefined}
  formId="my-form-id"
  isSubmitting={isSubmitting}
/>
```

Correct target pattern:

```tsx
<ERPFormFooter
  mode={isViewing ? "view" : isEditing ? "edit" : "add"}
  onCancel={() => onOpenChange(false)}
  onSave={handleSave}
  onSaveAndClose={handleSaveAndClose}
  formId="my-form-id"
  isSubmitting={isSubmitting}
/>
```

If the existing form submit architecture uses `formId`, explain that Cursor must implement or preserve a safe way to distinguish:

```text
Save:
save record and keep drawer/dialog open

Save & Close:
save record and close drawer/dialog after success
```

The matrix must not recommend removing Save from the standard.

---

# 6. Correction 3 — Next Implementation Prompt Plan Must Be Updated

In:

```text
ERP_BASE_002F_3E_3B_3B_NEXT_IMPLEMENTATION_PROMPT_PLAN.md
```

Update every proposed implementation phase so each phase scope includes:

```text
Add/Edit footer:
Cancel | Save | Save & Close

View footer:
Close only
```

Update all proposed prompts:

```text
3B.3C — Admin/System Forms
3B.3D — Core Master Data Forms
3B.3E — Standalone Auth Forms
3B.3F — Final Required/Footer QA
```

For standalone auth forms:

```text
Auth forms are not drawer/modal ERP forms, so ERPFormFooter may not apply.
However, RequiredLabel still applies.
Auth button patterns should remain appropriate to authentication UX.
```

For admin/master data forms, the prompt plan must clearly require the full footer standard.

---

# 7. Correction 4 — Clearly Separate Safe Close Into 3B.4

Add a clear note to the audit plan and prompt plan:

```text
Safe Close / Unsaved Changes / Outside Click Behavior is NOT part of 3B.3.

It is planned for:

ERP BASE 002F.3E.3B.4 — Safe Close, Unsaved Changes, and Modal Layout Standard
```

Add this scope distinction:

```text
3B.3 covers:
- required red asterisk markers
- footer button standard
- Add/Edit footer = Cancel | Save | Save & Close
- View footer = Close only

3B.4 covers:
- Add/Edit outside-click must not close form
- Add/Edit Escape / X / Cancel asks confirmation if dirty
- View mode can close by outside click / Escape / X / Close
- dirty state tracking
- confirmation dialog
- modal/drawer safe-close behavior
```

---

# 8. Correction 5 — Acceptance Criteria Must Be Updated

Update acceptance criteria in all affected files.

Correct acceptance criteria:

```text
Required Marker Criteria:
- Required marker appears only on actual required user-input fields.
- Optional fields have no red star.
- Auto-generated code fields remain read-only / Auto-generated on save.
- System fields are hidden or read-only and not marked as normal user-required fields.

Footer Criteria:
- Add mode shows Cancel | Save | Save & Close.
- Edit mode shows Cancel | Save | Save & Close.
- View mode shows Close only.
- Save keeps the drawer/dialog open after successful save.
- Save & Close saves and closes after successful save.
- Cancel closes without saving, subject to Safe Close rules in 3B.4.
- Buttons are disabled during submit.
- Loading state is clear.

Safe Close Criteria:
- Not part of 3B.3 implementation.
- Must be verified in 3B.4.
```

---

# 9. Correction 6 — Risk Notes

Add/update risks:

```text
Risk:
Save and Save & Close require separate post-save behavior.

Mitigation:
Each form must define save action mode:
- "save" keeps open and refreshes current record/state.
- "saveAndClose" closes after success.
If the form cannot safely support Save yet, implementation must document limitation and remain PASS WITH NOTES.
```

Also add:

```text
Risk:
Mixing footer rollout and safe-close behavior may create scope creep.

Mitigation:
3B.3 must not implement safe-close behavior. Safe-close is 3B.4.
```

---

# 10. Required Final Status In Corrected Files

Each corrected file must end with:

```text
READY FOR SAMEER REVIEW — Corrected footer standard and safe-close phase separation complete.
```

The correction must clearly state:

```text
PLANNING / AUDIT CORRECTION ONLY
NO CODE CHANGES
NO DATABASE CHANGES
```

---

# 11. Stop Condition

After updating the planning/audit files, stop.

Do not implement.

Do not modify source code.

Do not apply SQL.

Do not start 3B.3C.

Wait for Sameer/Dina review.

---

# Final Instruction

Read the standards.

Connect to Supabase.

Correct the 3B.3B audit/planning files so the footer standard is:

```text
Cancel | Save | Save & Close
```

and Safe Close is clearly deferred to:

```text
ERP BASE 002F.3E.3B.4
```

Stop after updating the planning files.
