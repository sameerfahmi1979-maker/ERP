# PROMPT_ERP_BASE_001F_V2 — Atoms-Style Enterprise UI/UX Refinement

Act as a senior enterprise ERP UI/UX director, Next.js App Router frontend architect, shadcn/ui design-system engineer, SaaS product designer, accessibility reviewer, and production UI quality auditor.

## Purpose

Refine the current ERP Foundation UI using the attached Atoms screenshots as the visual quality benchmark.

This replaces the previous 001F prompt.

Do not implement the older 001F prompt separately.

This is a visual and usability enhancement phase only.

Do not start Phase 002 business functionality.

Do not change Supabase database schema.

Do not change Supabase Auth.

Do not change middleware.

Do not change RLS policies.

Do not change migrations.

Do not add fake database records.

Do not rebuild the app.

## Visual Benchmark

Use the Atoms screenshots provided by the user as the target style direction:

1. Atoms Dashboard
2. Atoms User Management
3. Atoms Organizations

The desired style is:

- Clean enterprise SaaS/ERP design
- Compact but readable layout
- Soft light-gray page background
- White content cards
- Subtle borders
- Strong active sidebar states
- Professional table density
- Clear page header hierarchy
- Better toolbar alignment
- Better card balance
- Modern but not playful
- Similar quality to Atoms, Microsoft Dynamics, Zoho One, and Odoo Enterprise

Important:

Use the Atoms screenshots as a **visual reference only**.

Do not copy proprietary assets if any.

Do not copy fake data into the database.

Do not create fake Supabase records.

You may use temporary UI-only sample arrays only where the page currently has no real data, but label them clearly as UI placeholders and keep them isolated from database writes.

## Current Problem

The current Cursor/v0 UI is functional but still not as good as Atoms.

Problems to fix:

1. Main content still feels too plain.
2. Dashboard cards are acceptable but not premium enough.
3. Sidebar looks basic compared with Atoms.
4. Header/search/user menu needs better alignment.
5. User Management table needs a more polished enterprise table design.
6. Organization page should look like the Atoms organization screen.
7. Typography and spacing need improvement.
8. Admin pages need consistent page shell, filters, buttons, and data table pattern.
9. Empty states should look professional, not unfinished.
10. Page width and spacing must use screen space better.

## Required Design Direction

### A. App Shell

Refine:

- Left sidebar
- Header/topbar
- Main content background
- Page container width
- Content padding
- Sidebar footer
- Collapse behavior

Target:

- Sidebar width around 240–260px expanded
- Collapsed width around 64–72px
- Left brand block with icon and company name
- Navigation groups with small uppercase labels
- Active item with soft blue background and stronger text
- Icons aligned consistently
- Settings/logout in footer
- Collapse action clean and subtle

### B. Header

Match Atoms style:

- Fixed/consistent topbar height
- Center or left/center global search field
- Search field with clean rounded border
- Right aligned icons: theme, notifications, user avatar/name
- User menu compact
- Header bottom border very subtle

Do not touch auth behavior.

### C. Dashboard

Improve dashboard to Atoms-like quality:

- Executive Dashboard page header
- Breadcrumbs
- Action buttons aligned right
- 4 KPI cards in a balanced row
- White cards on light gray background
- Recent Activity card
- Alerts & Expiries card
- ERP Modules section
- Module cards with icons, title, description, and count/status
- Consistent card height and padding
- Better spacing between sections
- Avoid huge unused blank areas
- Make layout look good at 1366px, 1440px, and 1920px widths

### D. User Management Page

Improve to match Atoms-like table screen:

- Professional page header
- Breadcrumbs
- Add User button top right
- Large card/table container
- Search input
- Filter button
- Export button
- Checkbox column
- User column with avatar initials + name + email
- Role badge
- Department
- Status badge
- Last login
- Actions menu
- Footer showing row count and pagination

Important:

If real users are available from existing queries, use real data.

If no records exist, show a polished empty state.

Do not insert mock users into Supabase.

If using UI-only sample data for preview, isolate it and clearly mark it as temporary UI placeholder. Prefer to keep real query behavior.

### E. Organizations Page

Improve to match Atoms organization screen:

- Page title and description
- Add Organization button top right
- Summary cards:
  - Total Organizations
  - Total Branches
  - Total Employees
- Main organization table/card
- Search/filter/export toolbar
- Organization icon/avatar
- Organization name
- Code
- Location
- Branches count
- Employee count
- Status badge
- Actions menu

Important:

Do not write fake organizations to Supabase.

If no real records exist, use a professional empty state or isolated UI placeholder clearly separated from database.

### F. Roles, Permissions, Branches, Audit Pages

Apply the same visual system:

- Page header
- Breadcrumbs
- Action button if applicable
- Summary stat cards where useful
- Toolbar
- Professional table/card container
- Empty/loading states
- Consistent status badges

Do not add business functionality in this phase.

## Files Allowed to Modify

You may modify UI-only files:

```text
src/components/layout/app-sidebar.tsx
src/components/layout/app-header.tsx
src/components/layout/erp-shell.tsx
src/components/erp/*
src/components/tables/data-table.tsx
src/app/(protected)/dashboard/page.tsx
src/app/(protected)/admin/users/page.tsx
src/app/(protected)/admin/roles/page.tsx
src/app/(protected)/admin/permissions/page.tsx
src/app/(protected)/admin/organizations/page.tsx
src/app/(protected)/admin/branches/page.tsx
src/app/(protected)/admin/audit/page.tsx
src/app/(protected)/profile/page.tsx
src/app/(protected)/settings/page.tsx
```

## Files Not Allowed to Modify

Do not touch:

```text
supabase/migrations/**
supabase/config.toml
src/middleware.ts
src/lib/supabase/**
src/lib/rbac/**
scripts/bootstrap-admin.mjs
.env.local
.env.local.example
src/app/(auth)/**
```

Do not modify backend/server query logic unless only a harmless type import or prop shape adjustment is required. If a server query change is needed, stop and report first.

## Required UI Refinements

### 1. Design Tokens / Consistency

Create or refine shared CSS utility patterns if needed:

- page background
- card border/shadow
- section spacing
- table density
- active navigation style
- muted text
- status badge variants

Prefer Tailwind and existing shadcn/ui.

Do not introduce a new design library.

### 2. Component Refinement

Improve these components:

```text
ERPStatCard
ERPModuleCard
ERPSectionCard
ERPPageHeader
ERPDataToolbar
ERPStatusBadge
ERPEmptyState
AppSidebar
AppHeader
DataTable
```

### 3. Table Pattern

The table pattern should look like a real enterprise table:

- 48–56px row height
- Subtle row separators
- Clear header background
- Compact toolbar
- Checkbox column
- Action menu column
- Pagination footer
- Status badges
- Horizontal overflow handled properly

### 4. Page Density

Use screen width better.

Target layout:

- Main content max width around 1280–1440px where appropriate
- Do not leave the main content too narrow
- Use full width for admin tables
- Keep dashboard balanced and centered
- Avoid large white gaps

### 5. Typography

Improve:

- page title weight
- section title weight
- table header letter spacing
- KPI number size
- muted text color
- menu text size

Do not make text too large.

ERP should look compact and serious.

## Strict Safety Rules

Do not add:

- Clerk
- Firebase
- Prisma
- MongoDB
- React Router
- Vite
- New auth provider
- New backend framework
- New database schema

Do not change:

- Supabase Auth flow
- RLS logic
- Database tables
- Service role handling
- Admin bootstrap logic

Do not run:

```bash
supabase db push
```

No database work in this phase.

## Dependency Rules

Avoid new dependencies.

Use existing:

- Tailwind
- shadcn/ui
- lucide-react
- TanStack Table
- next-themes

If a shadcn component is missing, add only the required component.

Do not add large animation/chart libraries.

## Validation Required

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

Open and visually inspect:

```text
http://localhost:3000/dashboard
http://localhost:3000/admin/users
http://localhost:3000/admin/roles
http://localhost:3000/admin/permissions
http://localhost:3000/admin/organizations
http://localhost:3000/admin/branches
http://localhost:3000/admin/audit
http://localhost:3000/profile
http://localhost:3000/settings
```

Check:

- no console errors
- no hydration errors
- dashboard looks closer to Atoms benchmark
- users page looks closer to Atoms benchmark
- organizations page looks closer to Atoms benchmark
- sidebar/header look polished
- auth still works
- protected routes still work
- no backend/security files changed

## Screenshots Required

Create screenshots:

```text
implementation_Review/screenshots/001F/
  001F_dashboard_light.png
  001F_admin_users.png
  001F_admin_organizations.png
  001F_admin_roles.png
  001F_sidebar_collapsed.png
```

If possible, also create:

```text
implementation_Review/screenshots/001F/
  001F_dashboard_dark.png
```

## Required Reports

Create:

```text
ERP_BASE_001F_UIUX_REFINEMENT_REPORT.md
ERP_BASE_001F_VISUAL_VALIDATION_REPORT.md
ERP_BASE_001F_SECURITY_UNCHANGED_REPORT.md
ERP_BASE_001F_NEXT_STEPS.md
```

Reports must include:

- files modified
- visual improvements made
- components refined
- pages refined
- comparison to Atoms benchmark
- screenshots path
- lint/typecheck/build result
- confirmation that auth/RLS/database were untouched
- known UI issues remaining
- next recommended phase

## Acceptance Criteria

This phase is approved only if:

- UI is visibly closer to the Atoms screenshots.
- Dashboard looks premium and balanced.
- User Management page resembles Atoms-level table quality.
- Organizations page resembles Atoms-level structure and polish.
- Sidebar/header look polished and professional.
- Empty states look professional.
- No auth/security/backend/database files changed.
- TypeScript passes.
- Lint passes.
- Build passes.
- Screenshots and reports are generated.

## Final Instruction

Proceed carefully.

Improve UI/UX only.

Use Atoms screenshots as visual benchmark.

Do not start Phase 002.

Stop after reports and screenshots.
