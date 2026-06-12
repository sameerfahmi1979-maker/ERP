# PROMPT_ERP_BASE_002E_1A — Repair Drawer Runtime Error and Stabilize Antigravity Drawer Implementation

## 0. Required Cursor Persona

Act as a senior Next.js App Router runtime tester, shadcn/Base UI component integration specialist, enterprise ERP UI/UX implementation lead, TypeScript reviewer, and SaaS frontend stabilization engineer.

You are repairing the Phase 002E.1 drawer implementation after Antigravity UI/UX polishing.

Do not revoke the whole implementation unless the drawer system cannot be repaired safely.

Do not start Phase 002E.2, export/email, draft workflow, app settings, master data, or Phase 003.

This is a targeted repair and stabilization task.

---

## 1. Current Runtime Error

The app currently crashes with this runtime error:

```text
Base UI: MenuGroupContext is missing. Menu group parts must be used within <MenuGroup> or <MenuRadioGroup>.
```

Stack trace shows:

```text
src/components/ui/dropdown-menu.tsx
DropdownMenuLabel

ERPDrawerHeader
src/components/erp/erp-drawer-form.tsx

ERPDrawerForm
OrganizationFormDialog
```

This means a dropdown menu sub-component such as:

```tsx
DropdownMenuLabel
DropdownMenuGroup
DropdownMenuItem
DropdownMenuSeparator
```

is being used outside the valid Base UI/shadcn menu structure, or the project’s Base UI dropdown implementation expects group components differently than standard Radix/shadcn.

---

## 2. Decision

Do not remove the drawer design.

Do not revert the full Antigravity implementation yet.

First repair the dropdown/actions menu in the drawer header.

If the drawer itself works after removing/fixing the actions dropdown, keep the implementation.

If the drawer design causes additional runtime problems after repair, isolate the drawer components and report before reverting.

---

## 3. Critical Safety Rules

Do not modify:

```text
supabase/migrations/**
supabase/config.toml
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
.env.local
.env.local.example
scripts/bootstrap-admin.mjs
src/server/actions/**
src/server/queries/**
```

Do not change:

- Supabase Auth
- RLS policies
- database schema
- service-role handling
- CRUD server actions
- audit logic

Do not run:

```bash
supabase db push
```

Do not implement export/email backend.

Do not implement draft workflow.

Do not start Phase 003.

---

## 4. Relevant Antigravity Design Files

Review these uploaded/planning documents if present in the project:

```text
ANTIGRAVITY_002E_DRAWER_COMPONENT_BLUEPRINT.md
ANTIGRAVITY_002E_DRAWER_FORM_DESIGN_PLAN.md
ANTIGRAVITY_002E_DRAWER_UIUX_POLISH_REPORT.md
ANTIGRAVITY_002E_LIGHT_THEME_DRAWER_SPEC.md
ANTIGRAVITY_002E_CURSOR_IMPLEMENTATION_NOTES.md
ANTIGRAVITY_002E_CURSOR_IMPLEMENTATION_PLAN.md
ANTIGRAVITY_002E_EXPORT_EMAIL_UX_PLAN.md
```

Important design facts to preserve:

- Drawer width around 78–82vw, min 960px, max 1450px.
- Sticky header and footer.
- Internal left section navigation.
- Theme-aware light mode by default.
- Export/email actions are planned, not yet implemented.
- Export/email should remain visual placeholders until later phase.

---

## 5. Required Repair 1 — Fix ERPDrawerHeader Actions Menu

Inspect:

```text
src/components/erp/erp-drawer-form.tsx
```

Especially:

```tsx
ERPDrawerHeader
```

Find the actions dropdown implementation.

### Allowed repair options

#### Option A — Simplest and safest

Temporarily remove `DropdownMenuLabel` / `DropdownMenuGroup` usage from drawer header actions.

Use only a safe button or disabled simple menu trigger:

```tsx
<Button type="button" variant="outline" size="sm" disabled>
  Actions
</Button>
```

or:

```tsx
<Button type="button" variant="outline" size="sm">
  Actions
</Button>
```

with no dropdown content.

This is acceptable because Print/PDF/Excel/CSV/Email are not implemented in 002E.1.

#### Option B — Correct Base UI dropdown structure

If using the current project dropdown-menu wrapper, ensure all group-related parts are wrapped correctly according to the project’s actual `src/components/ui/dropdown-menu.tsx` implementation.

Do not assume standard Radix syntax if the project is using Base UI render-prop patterns.

Avoid `DropdownMenuLabel` if it requires menu group context.

#### Option C — Use native simple popover-free action list placeholder

If dropdown remains unstable, replace with a simple visually disabled `More Actions` button and document export/email will come in Phase 002E.3.

### Required outcome

The drawer header must not crash.

Actions menu must not block the app.

Export/email options may be disabled placeholders.

---

## 6. Required Repair 2 — Search for Same Dropdown Misuse Globally

Search for unsafe usage:

```text
DropdownMenuLabel
DropdownMenuGroup
DropdownMenuRadioGroup
DropdownMenuItem
DropdownMenuSeparator
```

Check all modified files from 002E.1, especially:

```text
src/components/erp/erp-drawer-form.tsx
src/features/organizations/organization-form-dialog.tsx
src/features/branches/branch-form-dialog.tsx
src/features/users/add-user-dialog.tsx
src/features/users/user-edit-dialog.tsx
src/features/users/assign-role-dialog.tsx
src/features/roles/role-detail-drawer.tsx
```

Fix only the broken usages.

Do not modify unrelated working menus unless required.

---

## 7. Required Repair 3 — Keep Drawer Structure

Preserve the approved drawer design:

- right-side slide drawer
- about 80% desktop width
- theme-aware light mode
- internal section nav
- sticky header
- sticky footer
- field layout improvements

Do not revert to small centered modal unless the user explicitly approves rollback.

---

## 8. Required Repair 4 — Disable Not-Yet-Implemented Export/Print/Email Actions

In 002E.1, Print/PDF/Excel/CSV/Email are not implemented yet.

Therefore:

- Keep actions visible only as disabled placeholders OR simple labels.
- Do not call `window.print()` if not tested.
- Do not implement PDF.
- Do not implement Excel.
- Do not implement CSV.
- Do not implement Email.
- Do not add export packages.
- Do not add email backend.

Add small tooltip/help text if practical:

```text
Export and email actions will be enabled in Phase 002E.3.
```

---

## 9. Validation Required

Run from clean path:

```text
C:\dev\agt-erp
```

Run:

```bash
npm run lint
npm run typecheck
npm run build
npm run dev
```

Browser manual validation:

1. Open `/admin/organizations`.
2. Click Add Organization.
3. Confirm drawer opens without runtime error.
4. Confirm Actions menu/button does not crash.
5. Close drawer.
6. Open `/admin/branches`.
7. Click Add Branch and confirm drawer works.
8. Open `/admin/users`.
9. Test Add User drawer if it was migrated.
10. Open `/admin/roles`.
11. Test Role Detail drawer.
12. Confirm no runtime errors in browser console.

---

## 10. Required Reports

Create:

```text
ERP_BASE_002E_1A_DRAWER_RUNTIME_FIX_REPORT.md
ERP_BASE_002E_1A_VALIDATION_REPORT.md
ERP_BASE_002E_1A_NEXT_STEPS.md
```

Reports must include:

- exact cause of runtime error
- exact file/component fixed
- whether DropdownMenuLabel/Group was removed or corrected
- whether actions are disabled placeholders
- list of affected drawer forms tested
- lint/typecheck/build results
- confirmation backend/database/security untouched
- recommendation whether to continue with 002E.1 or revert

---

## 11. Acceptance Criteria

This repair is complete only if:

- Runtime error is gone.
- `/admin/organizations` loads.
- Add Organization drawer opens.
- Actions menu/button does not crash.
- Drawer design remains in place.
- Existing CRUD workflows are not broken.
- TypeScript passes.
- Build passes.
- No backend/database/RLS/Auth files changed.
- Reports generated.

---

## 12. Final Instruction

Repair the drawer runtime error only.

Do not rollback unless repair fails.

Do not implement export/email/draft/settings/master data.

Stop after reports and validation.
