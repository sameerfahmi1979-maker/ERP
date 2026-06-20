# ERP Cursor Source-of-Truth Guide — Creation Report

**Phase:** Documentation / handoff (Cursor system rules)  
**Date/Time:** 2026-06-12  
**Task:** Create permanent `.cursor` source-of-truth guide and always-apply rule

---

## Files Read

### Merged source documents
| File | Status |
|---|---|
| `ERP_FULL_IMPLEMENTATION_GUIDE_FOR_NEXT_CHAT.md` | ✅ Read (1143 lines, incl. §5.2a module map) |
| `implementation_Review/ERP_BASE_FULL_PHASE_STATUS_TRACKER.md` | ✅ Read (noted stale) |
| `implementation_Review/ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md` | ✅ Read (noted stale 3E rows) |
| `implementation_Review/Phase_002F_3E_Planning/ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md` | ✅ Referenced (party master rules §6.11) |

### Standards
| File | Status |
|---|---|
| `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md` | ✅ Referenced |
| `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md` | ✅ Referenced |
| `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` | ✅ Referenced |

### Latest closure reports (prioritized)
| File | Status |
|---|---|
| `Phase_002F_3E_4_Closure/ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE_REPORT.md` | ✅ |
| `Phase_002F_3E_3B7_Closure/ERP_BASE_002F_3E_3B_7_CUSTOMER_MODULE_FINAL_QA_AND_CLOSURE_REPORT.md` | ✅ |

### Live source audit
| Check | Result |
|---|---|
| Protected `page.tsx` routes | 29 |
| `comingSoon` in sidebar | 11 references (8 modules) |
| ERPDrawerForm / ERPFormFooter / useFormDirty usage | ~27–28 form-related files |
| Dev harness routes | 3 (`/dev/performance-qa`, `customer-prefetch-qa`, `customer-child-qa`) |

---

## Files Created

| File | Purpose |
|---|---|
| **`.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`** | Single merged source-of-truth (sections 6.1–6.15) |
| **`.cursor/rules/algt-erp-source-of-truth.mdc`** | Always-apply Cursor project rule |
| **`.cursor/README.md`** | Folder readme + update protocol summary |
| **`implementation_Review/Phase_002F_3E_4_Handoff/ERP_CURSOR_SOURCE_OF_TRUTH_GUIDE_CREATION_REPORT.md`** | This report |

**No application code was modified.**

---

## Supabase Verification

| MCP | URL | Correct? |
|---|---|---|
| **user-supabase** | `https://mmiefuieduzdiiwnqpie.supabase.co` | ✅ **Correct ERP project** |
| plugin-supabase-supabase | `https://owcfljxxfznifftoezpf.supabase.co` | ❌ Wrong project |

Live check: **56 public tables**, all with RLS. No database changes made.

---

## Source Audit Summary

- **32 live working ERP screens** (29 protected routes + customer child sections in drawer)
- **8 sidebar placeholders** (Operations + Finance & Supply groups, `comingSoon: true`)
- **8 dashboard demo module cards** (fake data, not linked)
- **5 party-master entities DB-ready** without UI (Vendors → Recruitment Agencies)
- **Customer module CLOSED** — reference implementation
- **Last gate:** 002F.3E.4 PASS WITH NOTES

---

## Where Files Were Saved

| Artifact | Path |
|---|---|
| Main guide | `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` |
| Cursor rule | `.cursor/rules/algt-erp-source-of-truth.mdc` |
| Folder readme | `.cursor/README.md` |
| Creation report | `implementation_Review/Phase_002F_3E_4_Handoff/ERP_CURSOR_SOURCE_OF_TRUTH_GUIDE_CREATION_REPORT.md` |

---

## How Future Prompts Must Update the Guide

At **every phase completion**, the agent must:

1. Add/update a row in **§6.8 Phase Status Tracker**
2. Append to **§6.15 Phase completion log**
3. Update **§6.4 Implemented modules** if new routes shipped
4. Move modules from **§6.6 DB-READY** → **§6.4** when UI built
5. Remove placeholders from **§6.5** when modules go live
6. Record new debt or resolved items in **§6.13**
7. Adjust **§6.14 Next recommended phases** if Sameer changes priority

The `.mdc` rule enforces read-before / update-after automatically (`alwaysApply: true`).

---

## Known Stale Documents Found

| Document | Issue |
|---|---|
| `ERP_BASE_FULL_PHASE_STATUS_TRACKER.md` | Dated 2026-06-07; predates 3B.6G–3E.4 closures |
| `ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md` | 3E.3–3E.4 still marked PLANNED; actually CLOSED |
| `Phase_002F_3A_R_REVISED_MASTER_DATA_ARCHITECTURE_AND_MENU_PLAN.md` | Planning only; some menu items not built |

**Override rule:** Live source + latest closure reports + `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` win over older trackers.

---

## Validation

| Check | Result |
|---|---|
| `.cursor/` folder created | ✅ |
| `.cursor/rules/` rule file created | ✅ |
| `npm run typecheck` | ✅ PASS (no app code changed) |

---

## Next Recommended Phase

**ERP BASE 002F.4 — Attachment / Documents Placeholder Readiness**

Then **002F.5 → Vendors** (copy Customer reference implementation).

---

**Stop condition honored:** No ERP features implemented. Awaiting Sameer/Dina review.
