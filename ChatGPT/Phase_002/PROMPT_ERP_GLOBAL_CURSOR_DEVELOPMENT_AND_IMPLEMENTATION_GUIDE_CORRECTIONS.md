# PROMPT_ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE_CORRECTIONS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, SaaS security tester, enterprise ERP solution architect, implementation governance reviewer, Cursor development workflow architect, database migration reviewer, and senior technical documentation editor.

## Phase

ERP Global Cursor Development and Implementation Guide — Minor Corrections

## Prompt Purpose

This is a small correction prompt for one existing guide file only.

The file:

```text
ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
```

was reviewed by Sameer/Dina and approved with minor corrections.

Your task is to update this guide only, applying the specific corrections below.

Do not implement code.

Do not modify database schema.

Do not create migrations.

Do not modify application source files.

Do not create UI screens.

Do not continue Customer module work.

Do not update the UI/UX guide.

---

# 1. Mandatory Supabase Connection First

Before updating the guide, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify only what is needed to keep the guide accurate:

```text
package.json exists if checking package versions
getAuthContext / RBAC helper path if checking auth shape
global_numbering_rules exists if checking numbering rule source-of-truth wording
current source/report folders if checking report structure
server action folder patterns if checking server action path wording
```

If Supabase connection fails, still update the guide based on source code and reviewed comments, but clearly add a note:

```text
WARNING — Live Supabase verification could not be completed during this correction. The guide still requires all future work to connect to Supabase first.
```

Do not block the correction unless the guide file cannot be updated.

---

# 2. File To Update

Update only:

```text
ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
```

Do not create any new files.

Do not update:

```text
ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
ERP_BASE_002F_3E_3B_CUSTOMER_CLOSURE_UX_PERFORMANCE_PLAN.md
ERP_BASE_002F_3E_3B_NEXT_IMPLEMENTATION_STEPS.md
```

---

# 3. Corrections To Apply

Apply all five corrections below.

---

## Correction 1 — Package Versions Must Be Informational Only

The guide currently lists specific package versions, such as:

```text
Next.js 16.2.6
React 19.2.4
Zod 4.4.3
```

This is acceptable only if verified from `package.json`, but the guide must warn Cursor not to rely on stale package versions.

Add this rule under the Project Stack and Architecture section:

```text
Package Version Verification Rule:
Package versions listed in this guide are informational snapshots only.
Before any dependency-sensitive implementation, Cursor must re-check the current package.json and lockfile/source configuration.
Do not assume package versions from this guide are still current.
If package versions differ, follow the live project files.
```

If possible, adjust wording around specific package versions to say:

```text
Verified at time of guide creation
```

or:

```text
Current snapshot, re-verify before dependency-sensitive work
```

---

## Correction 2 — Server Action Folder Pattern Must Follow Existing Project Structure

The guide currently suggests a general pattern similar to:

```text
src/features/[module]/[entity]/actions.ts
```

But the current project also uses server action files like:

```text
src/server/actions/master-data/customers.ts
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
```

Update the Server Action Pattern section to make it flexible.

Add this rule:

```text
Server Action Path Source-of-Truth Rule:
Use the existing project folder structure as the source of truth.
Do not force new server action paths if the module already follows an approved structure.
Before creating or modifying server actions, inspect current modules and follow the closest existing pattern.
For the current party master/customer implementation, server actions may be located under src/server/actions/master-data/.
If a future module uses another established pattern, document and follow that pattern consistently.
```

Replace any wording that implies only one fixed server-action path.

---

## Correction 3 — Report Location Must Be Flexible

The guide recommends:

```text
implementation_Review/Phase_[PHASE_ID]_Implementation/
```

This is good as a default, but Cursor should not fail if the project already uses another report structure.

Add this rule under the File and Report Rules / Report Location section:

```text
Report Location Flexibility Rule:
Use the existing project report structure if one is already established for the current phase/module.
If no structure exists, use the recommended implementation_Review/Phase_[PHASE_ID]_Implementation/ path.
Do not create duplicate report folders for the same phase.
If report location differs from the recommended path, document the actual location in the implementation report.
```

---

## Correction 4 — Auth Context Shape Must Be Verified Before Use

The guide gives an example auth context structure with fields such as:

```text
permissions
roles
```

But actual implementation may use names like:

```text
permissionCodes
roleCodes
profile
```

or another shape.

Add this rule under RLS and Permission Rules:

```text
Auth Context Shape Verification Rule:
Always inspect the actual getAuthContext() return shape before using role or permission fields.
Do not assume the property is named permissions, permissionCodes, roles, roleCodes, profile, or user.
Use the current source code and TypeScript types as source of truth.
If the auth context shape differs from examples in this guide, follow the live source code and document the difference in the report.
```

Also mark the existing auth context object in the guide as:

```text
Example only — verify actual source code before use.
```

---

## Correction 5 — Numbering Examples Must Follow Live Numbering Rules

The guide includes example formats such as:

```text
EMP-0001
BR-0001
ORG-0001
```

and party-master formats such as:

```text
CUST-000001
VEND-000001
SUBC-000001
```

The final rule must be that live `global_numbering_rules` is the source of truth.

Add this rule under Numbering Rules:

```text
Live Numbering Rule Source-of-Truth:
Use the live global_numbering_rules configuration as the source of truth for document type codes, prefixes, sequence length, format template, reset policy, and active status.
Do not change existing ORG, BR, EMP, party-master, or transaction numbering formats unless Sameer explicitly approves.
If this guide shows an example that differs from live global_numbering_rules, follow the live database and document the difference.
```

Also update examples wording:

```text
Examples only — actual format must be verified from live global_numbering_rules before implementation.
```

---

# 4. Additional Consistency Updates

After applying corrections, update:

```text
Document Version: REV1
Status: Approved with minor corrections applied
```

Add to the revision history:

```text
REV1 — Applied Sameer/Dina minor corrections: package-version verification, server-action path flexibility, report-location flexibility, auth-context shape verification, and live numbering-rule source-of-truth.
```

At the end of the guide, update final status to:

```text
READY FOR SAMEER REVIEW — ERP Global Cursor Development and Implementation Guide REV1 complete with minor corrections applied.
```

---

# 5. What Not To Change

Do not remove the main structure of the guide.

Do not remove:

```text
Mandatory Supabase verification
Source of truth rule
Phase-gated workflow
Database/migration rules
RLS/permission rules
Numbering rules
Combobox rules
Server action rules
UI/UX guide reference
DMS rule
Testing rules
Global search rule
AI-ready rule
Future module reuse rule
Pre-flight checklist
Completion checklist
Report template
```

Only improve the guide with the five corrections above.

---

# 6. Final Instruction

Update only:

```text
ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
```

Do not implement code.

Do not modify database.

Do not create migrations.

Do not create new files.

Stop after updating the guide.
