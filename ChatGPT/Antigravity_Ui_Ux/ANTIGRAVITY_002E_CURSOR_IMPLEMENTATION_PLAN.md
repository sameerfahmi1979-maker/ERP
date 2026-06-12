# ANTIGRAVITY_002E_CURSOR_IMPLEMENTATION_PLAN — Blueprint for Future Phases

This document details the step-by-step technical implementation path for integrating these UI/UX specifications into the live Next.js App Router codebase.

---

## 1. Phase 1: Create Global UI Drawer Elements

### A. Develop Drawer Core Components
1. Create `src/components/erp/erp-drawer.tsx` using `@/components/ui/sheet` and `@/components/ui/scroll-area`.
2. Configure layout dimensions (`sm:max-w-[80vw] w-full max-w-[1450px] min-w-[960px]`).
3. Build the left vertical section-nav component that watches heading scroll coordinates.
4. Build the sticky footer panel containing unsaved-changes indicators and validation summaries.

### B. Map Drawer Views to Existing Routers
1. Refactor `src/features/organizations/organization-form-dialog.tsx` to use the new `ERPDrawer` template.
2. Refactor `src/features/branches/branch-form-dialog.tsx` to use the new drawer template.
3. Update table actions (`Add` and `Edit` triggers) to toggle drawer viewport slides.

---

## 2. Phase 2: Export & Sharing Integration

### A. Format Export Toolbar Component
1. Create a generic export dropdown menu in `src/components/erp/data-toolbar.tsx` exposing Excel, CSV, and PDF actions.
2. Integrate `xlsx` client-side Excel writers.
3. Hook Excel outputs to map directly to the visible column definitions.

### B. Integrate Direct PDF Builder
1. Install `@react-pdf/renderer` if needed, or implement a `@media print` layout stylesheet to generate clean PDFs from current window documents.
2. Standardize headers to load company profiles, TRNs, logos, and signatures from the App Settings store.

### C. Build System Email Composition Overlay
1. Code a reusable mail overlay dialog (`src/components/erp/send-email-dialog.tsx`) containing recipients text fields, templates selectors, and attachment cards.
2. Setup error states, loader overlays, and mock sending timers.

---

## 3. Phase 3: Configuration Store & Settings Views

### A. Setup App Settings Interfaces
1. Add settings routing structure at `src/app/admin/settings/page.tsx` and subdirectories.
2. Create settings forms for Organization branding templates, TRN entries, logo uploads, and digital stamps.
3. Bind settings save actions to a local Supabase settings profile table when database migrations are enabled.

### B. Configure Numbering Engine Views
1. Build settings views to customize entity naming rules (e.g. `EMP-` prefixes).
2. Wire preview fields to display mock inputs in real-time as users modify settings parameters.

---

## 4. Phase 4: Shared Master Data & Attachments

### A. Master Data Dashboards
1. Build lists and drawers for Currencies, Banks, Emirates, and Payment Terms under `/admin/master-data`.
2. Apply dense, low-padding table cell styles.

### B. Implement DMS-Ready Attachment Panel
1. Embed a dashed drag-and-drop file panel directly into the drawer sections.
2. Bind files listings to upload-progress statuses, size limits, and expiration date warnings.

---
*Refer to the design mockups in the [Review Document](file:///C:/Users/Sameer%20Fahmi/.gemini/antigravity-ide/brain/877f08ff-e7ab-491b-9981-49c418e4cfad/uiux_planning_and_mockups.md) to visualize the components and screen structures mapped in this plan.*
