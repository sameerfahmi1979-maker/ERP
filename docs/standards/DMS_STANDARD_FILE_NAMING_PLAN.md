# DMS Standard File Naming Plan

**Phase:** DMS.NAMING.1  
**Status:** `IMPLEMENTED` (2026-06-20)  
**Format:** `{Document_type}_{Owner}_{DOC_NO}_{Expiry}.{ext}`

## Approved decisions (Sameer)

| # | Decision | Value |
| :---: | :--- | :--- |
| 1 | No-expiry token | **`NoExpiry`** (keep 4-part format) |
| 2 | Medical insurance DOC_NO | **Card number** (not policy number) |
| 3 | Retroactive rename | **Yes** — admin bulk tool at `/admin/dms` |

## Implementation map

| Phase | Deliverable | File(s) |
| :--- | :--- | :--- |
| A | Naming utility | `src/lib/dms/standard-file-name.ts`, `src/lib/dms/resolve-standard-file-name.ts` |
| B | Apply on approve/create | `ai-intake.ts`, `batch-intake.ts`, `document-upload-attach.ts` |
| C | Review UI field | `dms-standard-file-name-field.tsx`, `dms-ai-intake-review-form.tsx` |
| E | Bulk retroactive rename | `standard-file-name.ts` action + `dms-standard-file-name-bulk-rename-panel.tsx` |

---

## 1. Purpose

Standardize the **user-visible file name** saved in `dms_document_files.file_name` (and aligned `dms_documents.title`) so downloads, HR compliance links, and inbox finalization produce consistent names such as:

```
Emirates_ID_Sameer_Fahmi_784-1990-1234567-1_2028-05-01.pdf
```

**Not in scope for renaming:** internal Supabase storage path (`{company}/{year}/{typeCode}/{docId}/v1/original.pdf`) — already structured and should stay internal.

**Preserved always:** `dms_upload_sessions.original_filename` + audit log entry for the camera/WhatsApp upload name.

---

## 2. Format Specification

### 2.1 Template

```
{Document_type}_{Owner}_{DOC_NO}_{Expiry}.{ext}
```

| Token | Description | Example |
| :--- | :--- | :--- |
| **Document_type** | DMS document type, normalized for filenames | `Emirates_ID`, `Medical_Insurance`, `Trade_License` |
| **Owner** | Subject the document belongs to (person or organization) | `Sameer_Fahmi`, `Alliance_Gulf_Transport` |
| **DOC_NO** | Primary external identifier on the document | `784-1990-1234567-1`, `14293073`, `A12345678` |
| **Expiry** | Expiry date from document or DMS record | `2028-05-01` |
| **ext** | Original file extension (lowercase) | `pdf`, `jpg`, `png` |

### 2.2 Normalization rules

| Rule | Detail |
| :--- | :--- |
| Separator | Underscore `_` between tokens |
| Spaces | Replace with `_` |
| Case | **PascalCase segments** for Document_type; **Title_Case words** for Owner (`Sameer_Fahmi`) |
| Special chars in DOC_NO | Keep `-` and `/` where part of official numbers; strip `:` `#` `?` `*` |
| Max length | **200 characters** total (match existing `sanitizeFilename` cap) |
| Charset | ASCII `[A-Za-z0-9._-]` after sanitization |
| Arabic names | Transliterate or use linked entity English name from ERP (prefer `employees.full_name_en` / `parties.display_name`) |

### 2.3 Document_type mapping

Source: `dms_document_types.type_code` → filename segment

| type_code | Document_type segment |
| :--- | :--- |
| `EMIRATES_ID` | `Emirates_ID` |
| `PASSPORT_COPY` | `Passport` |
| `VISA` | `Residence_Visa` |
| `LABOUR_CARD` | `Labour_Card` |
| `DRIVING_LICENSE` | `Driving_License` |
| `MEDICAL_INSURANCE` | `Medical_Insurance` |
| `TRADE_LICENSE` | `Trade_License` |
| `VEHICLE_REGISTRATION` | `Vehicle_Registration` |
| `INSURANCE_CERTIFICATE` | `Insurance_Certificate` |
| `CICPA_PASS` | `CICPA_Pass` |
| *(fallback)* | PascalCase of `type_code` (`PROJECT_CONTRACT` → `Project_Contract`) |

Human-readable `name_en` is **not** used in the filename (spaces, ambiguity). `type_code` is the stable key.

### 2.4 Owner resolution (priority order)

| Priority | Source | When |
| :---: | :--- | :--- |
| 1 | Inbox **entity context** (`?entity_type=employee&entity_id=`) | Upload from employee/party/vehicle screen |
| 2 | **Linked entity** at finalize (employee / party / vehicle) | AI intake linked to entity |
| 3 | **AI extraction** (`full_name`, `legal_name`, `insured_name`, `holder_name`) | No entity link |
| 4 | **DMS document title** parse (last resort) | Weak fallback |
| 5 | `Unknown_Owner` | Nothing resolved — forces human edit on review screen |

**Owner format:** First name + last name (or company short name), underscores, max ~40 chars per owner segment.

Examples:
- Employee: `Sameer_Fahmi` (from `employees` profile)
- Party: `Alliance_Gulf_Transport` (from `parties.display_name` or `short_name`)
- Vehicle: `Plate_AD-12345` when owner is fleet asset

### 2.5 DOC_NO resolution (priority order)

**Primary rule:** use the **business document number** printed on the document — NOT the internal DMS number (`DMS-2026-000028`).

| Document type | Preferred DOC_NO field |
| :--- | :--- |
| Emirates ID | `784-1990-1234567-1` |
| Passport | Passport number |
| Residence Visa | Visa file / UID / visa number |
| Labour Card | Labour card / work permit number |
| Driving License | License number |
| Medical Insurance | **Card / member ID** (policy as fallback only) |
| Trade License | License number |
| Vehicle Registration | Plate or registration number |
| Insurance Certificate | Policy number |
| Contracts / PO / Invoice | Contract / PO / invoice number |
| No number on doc | Last 6 of `document_no` → `DMS-000028` style suffix |

**Never use** raw internal `DMS-YYYY-NNNNNN` as DOC_NO unless no external number exists (rename to `DMS-000028` short form for readability).

### 2.6 Expiry rules

| Case | Expiry token |
| :--- | :--- |
| Date on document / DMS `expiry_date` | `YYYY-MM-DD` (ISO) |
| Type does not expire (`MOA`, `CONTRACT` without end date) | `NoExpiry` |
| Expiry required but unknown at finalize | `Unknown` — **blocks auto-save** until user fills expiry on review screen |
| Month/year only on card | Normalize to last day of month or `YYYY-MM-01` per Sameer choice at implementation |

---

## 3. Sample File Names (reference set)

See interactive canvas: `canvases/dms-standard-file-naming-plan.canvas.tsx`

| # | Scenario | Resulting file name |
| :---: | :--- | :--- |
| 1 | Sameer — Emirates ID | `Emirates_ID_Sameer_Fahmi_784-1990-1234567-1_2028-05-01.pdf` |
| 2 | Sameer — medical insurance (your live test doc) | `Medical_Insurance_Sameer_Fahmi_14293073_2027-04-01.pdf` |
| 3 | Sameer — UAE driving licence | `Driving_License_Sameer_Fahmi_294298_2027-12-15.pdf` |
| 4 | Sameer — passport | `Passport_Sameer_Fahmi_A12345678_2029-03-20.pdf` |
| 5 | Sameer — residence visa | `Residence_Visa_Sameer_Fahmi_201-2024-1234567-1_2026-08-30.pdf` |
| 6 | AGT — trade licence | `Trade_License_Alliance_Gulf_Transport_CN-1234567_2026-12-31.pdf` |
| 7 | Fleet — vehicle registration | `Vehicle_Registration_Plate_AD-12345_12345678_2026-06-30.pdf` |
| 8 | MOA (no expiry) | `MOA_Alliance_Gulf_Transport_REG-998877_NoExpiry.pdf` |
| 9 | Scan with no doc number yet | `Emirates_ID_Sameer_Fahmi_DMS-000028_Unknown.pdf` *(review required)* |

---

## 4. When naming is applied (workflow)

```
Upload (keep original) → AI Intake → Review screen shows suggested name → User confirms → Save file_name + title
```

| Stage | `original_filename` | `file_name` | `title` |
| :--- | :--- | :--- | :--- |
| Inbox session | `IMG_4521.jpg` | — | — |
| AI draft ready | unchanged | suggested preview | suggested preview |
| Approved / created | preserved in session | **standard format** | same or human-readable variant |
| Download | — | standard format | — |

**Touch points (implementation later):**
- `approveAiIntakeAndCreateDocument` — `ai-intake.ts`
- `finalizeDraftIntake` — `batch-intake.ts`
- `createDmsDocument` / attach-from-upload — manual create path
- New version upload — append `_v2` before extension OR keep doc-level versioning only (recommend: **no version in filename**, version is in DB)

---

## 5. UI / screen design

### 5.1 Upload Inbox — session table
- **Keep showing** `original_filename` until processed (user must recognize their upload).

### 5.2 AI Intake Review screen (new field)
- **Standard file name** — read-only preview + editable input, live validation.
- Subtext: `Original upload: IMG_4521.jpg`
- Badge when format incomplete: `Missing: Expiry`

### 5.3 Document record — Files tab
- Primary column: standard `file_name`
- Tooltip: original upload name + generated timestamp

### 5.4 HR Compliance — link from DMS
- Compliance prefill already reads DMS metadata; consistent names help search in attach dialogs.

---

## 6. Shared utility (implementation sketch — not built yet)

```
src/lib/dms/standard-file-name.ts
  buildDmsStandardFileName(input: {
    typeCode: string
    ownerName: string
    docNo: string | null
    expiryDate: string | null
    extension: string
    options?: { allowUnknownExpiry?: boolean }
  }): string
```

Also store optional `original_upload_filename` on `dms_document_files` if not already auditable via upload session link.

---

## 7. Edge cases & decisions needed from Sameer

| # | Question | Recommendation |
| :---: | :--- | :--- |
| 1 | Use `NoExpiry` vs omit 4th segment? | **`NoExpiry`** — keeps 4-part format consistent |
| 2 | DOC_NO: policy vs card number for insurance? | **Card number** primary (approved) |
| 3 | Vehicle owner token: plate vs employee? | **Plate** for fleet docs; employee for CICPA/site passes |
| 4 | Duplicate file names in same folder? | Append `_2`, `_3` before extension on collision |
| 5 | Retroactive rename of existing documents? | **Yes** — Phase E bulk tool on DMS Admin |
| 6 | Arabic-only names on card | Use ERP English profile name, not OCR Arabic |

---

## 8. Phased implementation (after approval)

| Phase | Deliverable | Effort |
| :--- | :--- | :--- |
| **A** | `buildDmsStandardFileName()` + unit tests | Small |
| **B** | Apply on AI approve + manual create-from-upload | Medium |
| **C** | Review UI field on intake screen | Medium |
| **D** | Admin template overrides per `type_code` (optional) | Large |
| **E** | Bulk rename existing files (optional) | Large |

---

## 9. Out of scope (this plan)

- Renaming at dropzone upload time
- Changing internal storage path layout
- Renaming email attachments outside DMS
- Automatic rename without user review on first rollout

---

## 10. Approval checklist

- [x] Confirm 4-part format with `NoExpiry` / `Unknown` tokens
- [x] Confirm DOC_NO = external document number (not DMS internal)
- [x] Confirm Owner = employee/party English name pattern
- [x] Approve Phase A+B+C for implementation prompt
- [x] Decide retroactive rename (Phase E yes)

---

*Plan authored: 2026-06-20. No code changes until Sameer instructs implementation.*
