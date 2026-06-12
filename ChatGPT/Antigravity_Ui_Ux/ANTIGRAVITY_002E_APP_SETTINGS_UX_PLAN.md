# ANTIGRAVITY_002E_APP_SETTINGS_UX_PLAN — Enterprise Configurations & Profiles

This document designs the settings panels, branding profile structures, and document numbering engine settings for Phase 002E.

---

## 1. App Settings Layout & Section Navigation

All global settings will live under a unified path (`/admin/settings`). The layout features a left sidebar for page categories and a main dashboard on the right to present specific configuration panels:

```text
Settings Home
 ├── Organisation Profiles (Letterheads, Stamp uploads, Legal details)
 ├── Numbering Engine Rules (Prefixes, Reset rules per entity)
 ├── Outbound Email Settings (SMTP Host, Sender profiles, Templates)
 ├── UI & Formatting (Timezone, Currency symbols, Compact density toggle)
 └── Storage & DMS Policy (Max upload sizes, Allowed extensions)
```

---

## 2. Company & Letterhead Management

Each subsidiary or company division (e.g. *Alliance Gulf Transport*, *Alliance Scrap Trading*) requires independent branding profiles to format outbound correspondence and report PDFs.

### A. Core Fields
- **English Name**: Official corporate registration name in English.
- **Arabic Name**: Official corporate registration name in Arabic.
- **Company Code**: 3-letter alphanumeric prefix (e.g., `AGT`, `AST`).
- **Legal Form**: LLC, Partnership, Sole Proprietorship.
- **Trade License & Authority**: Licensing numbers and jurisdiction (e.g., Abu Dhabi DED).
- **Tax Registration (TRN)**: 15-digit tax number required for invoicing in UAE.
- **Contacts**: Email address, telephone numbers, branch location maps.

### B. Graphic Asset Uploads
The interface must include upload widgets for:
- **Logo (SVG/PNG)**: Primary brand logo.
- **Letterhead Header Graphic**: Wide banner for PDF headers.
- **Letterhead Footer Graphic**: Wide banner for PDF footers.
- **Corporate Seal/Stamp (Transparent PNG)**: Superimposed digitally onto generated documents.
- **Authorized Signatures**: Scanned signature images mapped to authorized user roles.

---

## 3. Numbering Engine Config UI

The numbering engine generates unique references automatically for new entities (e.g., Employees, Vehicles, Invoices, Contracts). This interface configures the generator settings.

### A. Numbering Configuration Parameters
For each system entity, administrators can set:
- **Prefix**: String prefix (e.g., `EMP-`, `VEH-`, `INV-`).
- **Suffix**: Optional trailing code (e.g., `-DXB` for Dubai branch).
- **Date Segment**: Toggle to include year or year/month placeholders (e.g., `[YYYY]-`).
- **Padding Length**: Number of digits for numerical serials (e.g., length `6` produces `000001`).
- **Reset Sequence**: Frequency at which serial sequence restarts:
  - **Never**: Continuous serial.
  - **Yearly**: Resets to 1 on January 1st (e.g., `INV-2026-000001` then `INV-2027-000001`).
  - **Monthly**: Resets to 1 on the 1st of each month.
- **Next Number Preview**: A live text generator previewing the final format (e.g., `EMP-2026-000452`).

### B. Security & Locking Parameters
- **Admin Lock**: Number sequences must be locked against changes once records exist. Changes must require dual-authorization or developer bypass flags to prevent record ID collisions.
- **Sequence Audit Log**: An audit trail tracks every time a sequence value is manual updated or reset by an administrator.

---
*Refer to the design mockups in the [Review Document](file:///C:/Users/Sameer%20Fahmi/.gemini/antigravity-ide/brain/877f08ff-e7ab-491b-9981-49c418e4cfad/uiux_planning_and_mockups.md) to inspect the Settings page mockups.*
