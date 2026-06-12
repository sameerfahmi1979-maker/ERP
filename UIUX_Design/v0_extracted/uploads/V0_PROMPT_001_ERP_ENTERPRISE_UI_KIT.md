# V0_PROMPT_001 — Prepare Enterprise ERP UI Kit for Existing Next.js Supabase ERP

I already created an ERP dashboard design in v0. Now I need you to convert/refine it into a clean, production-ready UI package that can be integrated into my existing application.

## Existing App Stack

The existing application is already built and must not be recreated.

Stack:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth
- Supabase PostgreSQL
- RLS/RBAC already implemented
- Existing protected routes and admin routes already exist

## Important Rule

Do not create a new full application.

Do not create a new auth system.

Do not create a new database.

Do not use Clerk, Firebase, Prisma, MongoDB, or any new backend.

Do not use fake authentication.

Do not change backend logic.

Only produce frontend UI components and page layouts that Cursor can integrate into the existing project.

## Objective

Create an enterprise-grade ERP UI kit and page layout package from the current design.

The UI should look like a serious enterprise ERP similar in quality to modern systems such as Oracle NetSuite, Microsoft Dynamics, SAP Fiori, Odoo Enterprise, and Zoho One, but using a clean shadcn/ui visual language.

## Required Design Style

Use:

- Professional enterprise spacing
- Modern sidebar
- Top command/header area
- Clear module navigation
- Compact but readable density
- Enterprise dashboard cards
- KPI/stat cards
- Data-heavy admin pages
- Clean forms
- Tables with filters/search/actions
- Dark/light mode compatibility
- Responsive desktop-first layout
- Serious business tone, not playful SaaS design

Preferred visual direction:

- White/light neutral background
- Subtle borders
- Soft cards
- Clean typography
- Consistent icon usage with lucide-react
- Professional hover states
- Good spacing between sections
- Dashboard suitable for operations, HR, fleet, finance, HSE, procurement, inventory, DMS, and audit modules

## Required Output

Generate code for the following UI pieces as separate reusable components:

1. Enterprise App Shell
   - Sidebar
   - Collapsible navigation
   - Top header
   - Breadcrumbs
   - User menu
   - Theme toggle
   - Notification icon
   - Search/command placeholder

2. ERP Dashboard Page
   - Executive summary cards
   - Module cards
   - Quick actions
   - Recent activity placeholder
   - Alerts/expiry placeholder
   - Operational KPI placeholders

3. Admin Users Page Layout
   - Page header
   - Search/filter bar
   - Data table layout
   - Status badges
   - Role badges
   - Action menu
   - Empty/loading states

4. Organizations Page Layout
   - Company cards/table view
   - Branch summary
   - Filters
   - Action buttons
   - Professional form/dialog placeholder

5. Branches Page Layout
   - Branch table
   - Company filter
   - Status filter
   - Actions
   - Empty/loading states

6. Roles & Permissions Page Layout
   - Role list
   - Permission matrix concept
   - Module permission grouping
   - Manage/view states

7. Audit Logs Page Layout
   - Timeline/table hybrid
   - Filters by module/action/user/date
   - Severity/status style indicators

8. Shared UI Components
   - ERPPageHeader
   - ERPStatCard
   - ERPModuleCard
   - ERPDataToolbar
   - ERPStatusBadge
   - ERPEmptyState
   - ERPSectionCard
   - ERPActionMenu
   - ERPFilterBar
   - ERPBreadcrumbHeader

## Data Handling Rule

Use typed placeholder props only.

Do not hardcode fake database records directly inside the component if avoidable.

Create sample arrays only for visual preview and clearly separate them as demo data.

Components should be easy for Cursor to connect later to real Supabase queries.

## Code Requirements

Use:

- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- lucide-react
- Recharts only if charts are included

Avoid:

- External UI libraries other than shadcn/ui and lucide-react
- Heavy animation libraries unless absolutely necessary
- Inline random colors
- Backend calls
- Auth logic
- Database code
- API routes

## Integration-Friendly Output

Please structure the output so Cursor can copy it into this existing folder structure:

src/
  components/
    erp/
      app-shell.tsx
      page-header.tsx
      stat-card.tsx
      module-card.tsx
      data-toolbar.tsx
      status-badge.tsx
      empty-state.tsx
      action-menu.tsx
  app/
    (protected)/
      dashboard/
      admin/
        users/
        organizations/
        branches/
        roles/
        permissions/
        audit/

If you need to suggest filenames, provide them clearly.

## Final Deliverable

Provide:

1. Complete component code.
2. Clear file names.
3. Any required shadcn/ui components to install.
4. Any required npm packages.
5. Notes for Cursor on how to integrate without touching Supabase Auth, RLS, or backend logic.

Remember: this is a UI/UX package for an existing ERP foundation, not a new application.
