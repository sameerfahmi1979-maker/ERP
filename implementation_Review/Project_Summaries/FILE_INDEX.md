# Implementation Review — File Index

**Last updated:** 2026-06-16

Phase folders are grouped under **category parent folders**. Use this index when an old path no longer resolves.

---

## Top-Level Structure

```
implementation_Review/
├── README.md
├── FILE_INDEX.md
├── screenshots/
├── DMS_Phases/              ← All DMS phase folders (27)
├── Party_Master_Phases/     ← Party Master 002F.5A (8)
├── Foundation_Phases/       ← Base ERP Phase 001–002F (67)
├── Global_Phases/           ← GLOBAL UI + CLEANUP (14)
├── Platform_Phases/         ← Settings, Notifications, COMMON MD, Admin, Bank (7)
├── AI_Phases/               ← AI roadmap planning (1)
└── Meta/                    ← Trackers, guides, reorganization reports (1)
```

---

## DMS_Phases/

All Document Management System implementation and planning reports.

| Folder | Phase |
|---|---|
| `Phase_DMS_1_Planning/` | DMS.1 architecture planning |
| `Phase_DMS_2_Implementation/` | DMS.2 DB foundation |
| `Phase_DMS_3_Implementation/` | DMS.3 admin masters |
| `Phase_DMS_4_Implementation/` | DMS.4 document repository |
| `Phase_DMS_5_Implementation/` | DMS.5 upload inbox |
| `Phase_DMS_6_Implementation/` | DMS.6 party integration |
| `Phase_DMS_7_Implementation/` | DMS.7 versioning/cleanup |
| `Phase_DMS_8_Implementation/` | DMS.8 expiry/renewals |
| `Phase_DMS_8A_Implementation/` | DMS.8A email bridge |
| `Phase_DMS_9_Implementation/` | DMS.9 OCR pipeline |
| `Phase_DMS_10_Implementation/` | DMS.10 AI classification |
| `Phase_DMS_10A_Investigation/` | DMS.10A upload-to-fill investigation |
| `Phase_DMS_11_Implementation/` | DMS.11 AI intake |
| `Phase_DMS_12_Planning/` | DMS.12 content intelligence plan |
| `Phase_DMS_12_0_Implementation/` | DMS.12.0 bug fix |
| `Phase_DMS_12_1_Implementation/` | DMS.12.1 content text / FTS |
| `Phase_DMS_12_2_Implementation/` | DMS.12.2 AI summary |
| `Phase_DMS_12_3_Implementation/` | DMS.12.3 completeness/risk |
| `Phase_DMS_12_4_Implementation/` | DMS.12.4 AI search/tags/links |
| `Phase_DMS_12_4A_Implementation/` | DMS.12.4A admin tools |
| `Phase_DMS_12_5_Implementation/` | DMS.12.5 semantic search |
| `Phase_DMS_13_Planning/` | DMS.13 batch intake plan |
| `Phase_DMS_13_Implementation/` | DMS.13 batch intake |
| `Phase_DMS_14_Implementation/` | DMS.14 security/RLS QA |
| `Phase_DMS_15_Implementation/` | DMS.15 integration readiness |
| `Phase_DMS_OCR_AI_FIX_1_Planning/` | OCR-AI FIX.1 plan |
| `Phase_DMS_OCR_AI_FIX_1_Implementation/` | OCR-AI FIX.1 fix |

**Example path:** `implementation_Review/DMS_Phases/Phase_DMS_15_Implementation/ERP_DMS_15_INTEGRATION_READINESS_IMPLEMENTATION_REPORT.md`

---

## Party_Master_Phases/

Party Master (002F.5A) database, UI, filtered views, and hotfixes.

| Folder |
|---|
| `ERP_BASE_002F_5A_0_Supabase_Integrity_Review/` |
| `ERP_BASE_002F_5A_1_Party_Master_Database_Foundation/` |
| `ERP_BASE_002F_5A_2_Party_Master_Core_UI/` |
| `ERP_BASE_002F_5A_3_Party_Master_Filtered_Views/` |
| `ERP_BASE_002F_5A_3X_Child_Dialog_Block_Fix/` |
| `ERP_BASE_002F_5A_3X_COMBOBOX_LABEL_FIX/` |
| `ERP_BASE_002F_5A_Party_Master_V3/` |
| `Phase_002F_5A_Party_Master_Planning/` |

---

## Foundation_Phases/

Early ERP foundation: Phase 001–002, email/export, master data, customers/combobox, future Phase 003–005.

Includes: `Phase_001/`, `Phase_002/`, `Phase_002D/`, all `Phase_002E_*`, all `Phase_002F_*` (except 5A → Party Master), `Phase_003/`, `Phase_004/`, `Phase_005/`.

**Example path:** `implementation_Review/Foundation_Phases/Phase_002F_3E_3_Implementation/ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_IMPLEMENTATION_REPORT.md`

---

## Global_Phases/

ERP GLOBAL UI workspace architecture and cleanup phases.

| Folder | Phase |
|---|---|
| `Phase_GLOBAL_UI_2_Planning/` | GLOBAL UI.2 plan |
| `Phase_GLOBAL_UI_2_Implementation/` | GLOBAL UI.2 child dialogs |
| `Phase_GLOBAL_UI_4_Planning/` | GLOBAL UI.4 plan |
| `Phase_GLOBAL_UI_4A_Implementation/` … `Phase_GLOBAL_UI_4G_Implementation/` | GLOBAL UI.4A–4G |
| `Phase_GLOBAL_CLEANUP_1_Implementation/` | CLEANUP.1 legacy customer |
| `Phase_GLOBAL_CLEANUP_2_Implementation/` | CLEANUP.2 dead dialogs |

---

## Platform_Phases/

Cross-cutting platform services and shared master data.

| Folder | Phase |
|---|---|
| `Phase_SETTINGS_1_Implementation/` | AI Settings (SETTINGS.1) |
| `Phase_SETTINGS_2_Implementation/` | Email Settings (SETTINGS.2) |
| `Phase_NOTIFICATIONS_1_Implementation/` | Notifications (NOTIFICATIONS.1) |
| `Phase_ADMIN_1_Permission_Matrix_Implementation/` | Admin permission matrix |
| `Phase_COMMON_MD_1_Planning/` | COMMON MD.1 plan |
| `Phase_COMMON_MD_1_Implementation/` | COMMON MD.1 implementation |
| `Phase_BANK_MASTER_1_Implementation/` | BANK MASTER STANDARD.1 |

---

## AI_Phases/

| Folder | Content |
|---|---|
| `Phase_AI_Roadmap_Planning/` | AI roadmap plan + correction report |

**Example path:** `implementation_Review/AI_Phases/Phase_AI_Roadmap_Planning/ERP_AI_ROADMAP_AND_COMMON_AI_FOUNDATION_PLAN.md`

---

## Meta/

Trackers, guides, and reorganization reports.

| Folder / File |
|---|
| `Phase_Meta_Documentation/` — trackers, guides, reorganization reports |

---

## Path Migration Quick Reference

| Old path (root) | New path |
|---|---|
| `implementation_Review/ERP_DMS_15_*.md` | `implementation_Review/DMS_Phases/Phase_DMS_15_Implementation/` |
| `implementation_Review/ERP_COMMON_MD_1_*.md` | `implementation_Review/Platform_Phases/Phase_COMMON_MD_1_*/` |
| `implementation_Review/ERP_AI_ROADMAP_*.md` | `implementation_Review/AI_Phases/Phase_AI_Roadmap_Planning/` |
| `implementation_Review/Phase_DMS_*/` | `implementation_Review/DMS_Phases/Phase_DMS_*/` |
| `implementation_Review/Phase_GLOBAL_*/` | `implementation_Review/Global_Phases/Phase_GLOBAL_*/` |
