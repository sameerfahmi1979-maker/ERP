# ERP Development Standards

This folder contains **official mandatory development standards** for ALGT ERP.

All future Cursor planning, implementation, database, UI, server-action, testing, reporting, and QA work **MUST** reference these standards.

---

## Official Standards

### 1. [ERP Global Cursor Development and Implementation Guide](./ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md)

**Version**: REV1  
**Status**: Approved with minor corrections applied

**Controls**:
- Cursor workflow and phase-gating
- Supabase verification (mandatory before every task)
- Database and migration safety rules
- RLS and permission enforcement
- Server action standards
- Testing requirements (typecheck, lint, build)
- Implementation report requirements
- Scope control and governance

**Key Rules**:
- Always connect to live Supabase first
- Never run destructive SQL without approval
- Use global numbering engine only
- Follow source of truth priority (Live DB → Current code → Latest guides)
- Generate reports for every phase
- No scope creep

---

### 2. [ERP Global UI/UX Form, Table, and Drawer Development Guide](./ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md)

**Version**: REV1  
**Status**: Enhanced with Sameer/Dina review comments (includes final global search action standard)

**Controls**:
- UI/UX standards and design system
- Drawer, form, and table patterns
- Tab navigation and child record dialogs
- Combobox everywhere (all selectable fields)
- Required field markers (red asterisk *)
- Modal sizing (720px standard for child forms)
- No horizontal scroll rule (strict)
- Safe close behavior with unsaved changes confirmation
- Save / Save & Close / Cancel button standard
- Documents placeholder (until DMS implementation)
- Global search behavior (search results must be actionable)
- Accessibility and localization readiness
- AI-ready design direction (prepare, don't implement yet)

**Key Rules**:
- Combobox everywhere (no traditional dropdowns)
- Required fields marked with red *
- 720px width for child forms
- No horizontal scrolling anywhere
- Outside click disabled in Add/Edit modes
- Documents tabs remain placeholder until centralized DMS

---

## How to Use These Standards

**Before every future ERP prompt or implementation**, Cursor **MUST**:

1. ✅ Read `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`
2. ✅ Read `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`
3. ✅ Connect to live Supabase (`https://mmiefuieduzdiiwnqpie.supabase.co`)
4. ✅ Verify live schema for target tables/entities
5. ✅ Confirm scope and out-of-scope items
6. ✅ Generate implementation report after completing work

---

## Pre-Flight Checklist

Before starting any ERP implementation:

```
[ ] Read Cursor Development Guide
[ ] Read UI/UX Development Guide
[ ] Connect to live Supabase
[ ] Verify live schema
[ ] Confirm scope and out-of-scope
[ ] Plan report file name and structure
[ ] Understand stop condition
```

---

## Standards Relationship

These two guides work together:

- **Cursor Development Guide** = How to plan, implement, test, report, and govern
- **UI/UX Development Guide** = What UI/UX patterns to implement

Both are **mandatory**. All future ERP work must comply with both guides.

---

## Document Updates

Both standards are living documents and may be updated as the project evolves.

Current versions:
- **Cursor Development Guide**: REV1 (June 8, 2026)
- **UI/UX Development Guide**: REV1 (June 8, 2026)

---

## Questions or Exceptions

If a standard seems unclear or if an exception is needed:
1. Do NOT proceed with the implementation
2. Document the issue in a report
3. Request clarification from Sameer/Dina
4. Wait for approval before continuing

**Never assume or work around the standards without approval.**

---

Last Updated: June 8, 2026
