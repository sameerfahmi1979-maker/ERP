# ANTIGRAVITY_002E_GLOBAL_MASTER_DATA_UX_PLAN — Master Data & Attachment Panel

This document outlines the layout grids, category definitions, and attachment upload configurations for the system's global master data and document management panels.

---

## 1. Master Data Category Catalog

The following shared datasets are accessed across all current and future modules. They require a simple, unified interface for CRUD operations:

```text
Geographic Master Data
 ├── Countries (ISO Code, Default Currency, dial code)
 ├── Emirates & States (Parent Country link, capital city reference)
 └── Cities & Districts (Parent Emirate link, ZIP/Makani coordinates)

Financial Master Data
 ├── Currencies (Code e.g., AED, symbol, conversion multiplier, active flag)
 ├── Banks (SWIFT code, routing numbers, local clearing codes)
 ├── Tax Types (VAT percentage, corporate tax exemptions, standard rates)
 └── Payment Terms (Code, net days, discount offsets e.g., Net 30, COD)

Operational Master Data
 ├── Departments (Code, name, parent department hierarchy)
 ├── Job Roles / Designations (Grade rank, licensing requirements)
 └── Document Types (License profiles, identity files, contracts)
```

---

## 2. Shared Master Data Dashboard Layout

Every master data category follows a standard page layout:
- **Search & Filter Panel**: Real-time searching with toggle filter tags (e.g. "Active Only", "Inactive").
- **Grid Density**: Clean lists with tight padding (`py-1.5` for table cells) to fit up to 25 rows on one screen without scrolling.
- **Drawer Integration**: Clicking "Add" or an edit button launches the standard drawer form, keeping the background list visible.

---

## 3. DMS-Ready Attachment Panel Layout

Until a standalone Document Management System (DMS) module is fully implemented, all transactional sheets and forms must include a reusable **Attachment Panel** to gather legal and supporting files.

### A. Core Attachment Input Grid
- **Document Type Dropdown**: Mapped from the Master Data list (e.g., Trade License, Emirates ID, Passport copy, VAT Certificate).
- **Document ID Field**: Text field to enter physical serials (e.g. ID card number).
- **Date Inputs**: Issue date and Expiration date fields.
- **Expiration Trigger Toggle**: Select if document has an expiration date. If enabled, the system displays alerts 30 days before expiration.
- **Status Indicator**:
  - **Valid**: Current date is prior to expiration.
  - **Expiring Soon**: Under 30 days remaining. (Amber badge)
  - **Expired**: Past expiration date. (Red badge)

### B. Drag-and-Drop Area & Files List
- **Upload Zone**: A clean, dashed-border drop-zone area styled with standard shadcn buttons (`Select File`). Displays drag-and-drop actions.
- **Files Table**:
  - Columns: File Name (with file type icon), Size (in KB/MB), Upload Date, Exponent User, Expiry Date, Status Badge, Download Action, Discard Action.
  - If a file is uploading, the cell shows a processing state and file progress bar.

---
*Refer to the design mockups in the [Review Document](file:///C:/Users/Sameer%20Fahmi/.gemini/antigravity-ide/brain/877f08ff-e7ab-491b-9981-49c418e4cfad/uiux_planning_and_mockups.md) to inspect the master data data-table and attachment layouts.*
