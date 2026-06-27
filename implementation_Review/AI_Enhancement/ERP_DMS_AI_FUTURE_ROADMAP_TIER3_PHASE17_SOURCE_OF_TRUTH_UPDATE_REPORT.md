# ERP DMS AI Future Roadmap Update — Tier 3 and Phase 17

**Date:** 2026-06-26
**Type:** Documentation / Source-of-Truth Update Only
**Author:** Cursor (documentation-only pass)

---

## 1. Executive Summary

The ALGT ERP source of truth has been updated to formally record **Phase 16 Tier 3** (Party Contacts / Addresses Write-back) and **Phase 17** (Apply Reversal / Correction Proposal) as **FUTURE PLAN / NOT STARTED** roadmap entries.

No code, database schema, migrations, server actions, UI components, feature flags, or tests were created or modified. This was a documentation-only update.

Phase 16 Tier 2 (Party Licenses & Tax Registration Write-back) is the current active phase. Its implementation report records it as **CLOSED / PASS ✅**, but its Runtime UAT closure report has not yet been executed. Tier 3 and Phase 17 must not begin until Tier 2 UAT is formally closed and Sameer explicitly approves.

---

## 2. Files Reviewed

| File | Found | Notes |
|------|-------|-------|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | ✅ Yes | Primary source of truth — updated |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | ✅ Yes (root) | Legacy / reference copy — not updated (not the active live file) |
| `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_2_PARTY_LICENSES_TAX_WRITEBACK_IMPLEMENTATION_REPORT.md` | ✅ Yes | Status: CLOSED / PASS ✅ — used to determine Phase 16.2 status |
| `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_2_RUNTIME_UAT_AND_CLOSURE_REPORT.md` | ❌ Not found | Runtime UAT closure report does not yet exist — Phase 16 Tier 2 UAT pending execution |
| `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_1_RUNTIME_UAT_AND_CLOSURE_REPORT.md` | ✅ Yes | Phase 16 Tier 1 is CLOSED / LIVE PASS ✅ |
| `implementation_Review/ERP_DMS_AI_PHASE_16_HUMAN_REVIEWED_APPLY_TO_ERP_IMPLEMENTATION_REPORT.md` | ✅ Yes | Phase 16 Tier 1 implementation — CLOSED / PASS ✅ |

---

## 3. Files Updated

| File | Change |
|------|--------|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated "Last updated" line; added Phase 16 Tier 3 and Phase 17 rows to the DMS AI phase table; added future roadmap guardrails section with recommended order and HR write-back risk note |

---

## 4. Roadmap Entries Added

### Phase 16 Tier 3 — Party Contacts / Addresses Write-back

| Field | Value |
|-------|-------|
| Status | FUTURE PLAN / NOT STARTED |
| Blocking condition | Phase 16 Tier 2 Runtime UAT must be closed; explicit approval required |
| Sub-phases planned | Tier 3A (party_contacts), Tier 3B (party_addresses) |
| Potential target tables | `party_contacts`, `party_addresses` |
| Governance | No auto-create, no auto-select row, no direct parties/bank writes, full human-confirmed apply governance chain |

Potential fields (subject to live schema verification during planning phase):
- `party_contacts`: contact_name, designation, department, mobile, phone, email, remarks
- `party_addresses`: address_line_1, address_line_2, emirate_id, city_id, area_zone_id, po_box, location_notes, remarks

> These fields are for planning context only. They must be verified against the live schema before any implementation prompt is written.

---

### Phase 17 — Apply Reversal / Correction Proposal

| Field | Value |
|-------|-------|
| Status | FUTURE PLAN / NOT STARTED |
| Blocking condition | Party apply phases (16.1–16.3) must be stable and UAT-closed; explicit approval required |
| Purpose | Human-reviewed correction proposal for values previously applied via Apply-to-ERP |
| NOT | Automatic rollback, background reversal job, one-click undo |
| Governance | No correction without human review + target permission + conflict detection; no raw OCR/salary/IBAN storage in proposals |

---

## 5. Guardrails Added

The following guardrail was added to `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`:

- Cursor must not implement Phase 16 Tier 3 or Phase 17 without explicit planning prompt or implementation prompt approval from Sameer.
- If the user says "continue" or "next" after Phase 16 Tier 2, Cursor must present options: close Tier 2 UAT / create Tier 3A prompt / create Tier 3B prompt / create Phase 17 prompt / move to another module.
- HR Apply-to-ERP write-back must not begin until all Party apply phases and Phase 17 safety are stable.

---

## 6. Current Phase 16 Tier 2 Status Used

**Status applied to roadmap table:** `CLOSED / PASS ✅` (with note that Runtime UAT closure report not yet executed)

**Rationale:**
- Implementation report (`ERP_DMS_AI_PHASE_16_TIER_2_PARTY_LICENSES_TAX_WRITEBACK_IMPLEMENTATION_REPORT.md`) declares CLOSED / PASS ✅.
- SOT header at time of this update already shows Tier 2 as last closed gate (CLOSED / PASS ✅).
- No separate runtime UAT closure report exists yet (ChatGPT prompt exists: `ChatGPT/ERP_DMS_AI_PHASE_16_TIER_2_RUNTIME_UAT_AND_CLOSURE_PROMPT.md` — not yet executed).
- A clarifying note was added to the Tier 2 table row indicating UAT closure report is pending.

---

## 7. What Was Not Implemented

Per the strict documentation-only scope of this update, the following were not created or modified:

- No Phase 16 Tier 3 code
- No Phase 17 code
- No party_contacts or party_addresses write-back logic
- No apply reversal / correction engine
- No HR write-back
- No new feature flags
- No new database tables or migrations
- No new server actions
- No new UI components
- No new tests

---

## 8. Final Notes

The DMS AI Apply-to-ERP roadmap now has formal documentation for all planned future phases. This provides a stable reference for future Cursor sessions, agents, and implementation prompts.

The next recommended action is to execute the Phase 16 Tier 2 Runtime UAT closure prompt (`ChatGPT/ERP_DMS_AI_PHASE_16_TIER_2_RUNTIME_UAT_AND_CLOSURE_PROMPT.md`) before any further phase work begins.
