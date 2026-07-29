# Implementation Review — File Index

**Last updated:** 2026-07-25  
**Structure:** one folder per module (parallel to `ChatGPT/`)

Phase subfolders may exist under a module (e.g. `DMS/Phases/`, `HR/Phases/`, `Foundation/Phase_*`). Use this index when an old path no longer resolves.

---

## Top-Level Structure

```
implementation_Review/
├── README.md
├── 00_Meta/                 ← Trackers, handoffs, generic UAT/meta reports
├── AI_Common/               ← Common AI / ERP AI roadmap & foundation reports
├── AI_DMS/                  ← DMS AI enhancement phases & META reports
├── Audits/                  ← Code / independent audits
├── Branding/                ← App & report branding system reports
├── DMS/                     ← Document Management System (incl. Phases/)
├── Foundation/              ← Base ERP Phase 001–002F (excl. Party Master)
├── Global_UI/               ← GLOBAL UI / navigation / list UI standard
├── HR/                      ← HR module (incl. Phases/)
├── Party_Master/            ← Party Master 002F.5A
├── PDF/                     ← PDF generation / Gotenberg
├── Platform/                ← Settings, Notifications engine, Bank Master, Admin, Common MD
├── Project_Summaries/       ← Migration summaries & indexes
├── Realtime/                ← Realtime pilot phases
├── Reports/                 ← Report Center & Report Designer
├── Users/                   ← Users / roles / permissions module
├── screenshots/             ← Manual & UAT screenshots
└── sql_review/              ← SQL review artifacts
```

---

## Module Notes

| Folder | Contents |
|---|---|
| `DMS/` | Core DMS reports + `Phases/` (DMS.1–DMS.15, OCR-AI FIX) |
| `AI_DMS/` | DMS AI phases, META-1/2, stabilization related to DMS AI |
| `AI_Common/` | COMMON_AI.0–15, AI roadmap, full AI module audits |
| `HR/` | HR plans/audits + `Phases/` (HR.0–HR.10) + HR.12–HR.14 |
| `Foundation/` | Phase_001…Phase_005 trees; includes `Phase_002F_3A_Master_Data_Inventory/` |
| `Party_Master/` | All 002F.5A Party Master phase folders |
| `Global_UI/` | GLOBAL UI.2–UI.5, cleanup, JetBrains fix, navigation |
| `Users/` | ERP_USERS.1–6A plans, implementation, UAT |
| `Platform/` | SETTINGS, NOTIFICATIONS.1, BANK MASTER, COMMON MD, ADMIN matrix |
| `00_Meta/` | Cross-cutting meta docs formerly under `Meta/` + root orphans |

---

## Path Migration (old → new)

| Old path | New path |
|---|---|
| `DMS_Module/` | `DMS/` |
| `DMS_Phases/` | `DMS/Phases/` |
| `HR_Module/` + `HR/` | `HR/` |
| `HR_Phases/` | `HR/Phases/` |
| `AI_Enhancement/` (COMMON_AI*) | `AI_Common/` |
| `AI_Enhancement/` (DMS_AI*) | `AI_DMS/` |
| `Common_AI/` | `AI_Common/` |
| `Foundation_Phases/` | `Foundation/` |
| `Global_Phases/` | `Global_UI/Phases/` |
| `Global_Navigation/` | `Global_UI/` |
| `Party_Master_Phases/` | `Party_Master/` |
| `Platform_Phases/` | `Platform/` |
| `PDF_Generation/` | `PDF/` |
| `Meta/` | `00_Meta/` |
| Repo-root `ERP_USERS_*.md` | `Users/` |
| Repo-root `ERP_DMS_AI_*.md` | `AI_DMS/` |
| `Phase_002F_3A_Master_Data_Inventory/*.md` | `Foundation/Phase_002F_3A_Master_Data_Inventory/` |

---

## Related: ChatGPT prompts

Cursor / ChatGPT phase prompts live in a **matching module taxonomy** under:

```
ChatGPT/
├── 00_General/
├── AI_Common/
├── AI_DMS/
├── Branding/
├── Data_Seeding/
├── DMS/
├── Foundation/
├── Global_UI/
├── HR/
├── Notifications/
├── Party_Master/
├── PDF/
├── Platform/
├── Realtime/
├── Reports/
└── Users/
```

See `ChatGPT/README.md`.
