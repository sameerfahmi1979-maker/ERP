# Next Chat Handoff — ERP BASE 002 Foundation Continuation

**Purpose:** Use this file to start a new fast ChatGPT conversation and continue the ERP BASE 002 foundation planning without losing context.

**Current decision:** Do **not** jump to new business modules yet. Complete the remaining ERP BASE 002 foundation first, especially numbering/prefix/sequence and global master data.

---

## 1. Project Context

The user is developing an ERP system and is using a strict phase-gated implementation approach. Every phase should be planned, implemented, reviewed, corrected if required, and approved before moving to the next phase.

The current ERP foundation is a separate workstream from the ERPNext HRMS customization work. The user wants to return to the ERP BASE 002 foundation because key foundational engines are still missing.

The most important missing foundation items are:

1. Global autonumbering / prefix / sequence / reference number engine.
2. Remaining global master data foundation.
3. Global lookup/dropdown system.
4. App settings, company settings, letterheads.
5. Attachment metadata foundation.
6. Draft and unsaved changes workflow.
7. Final foundation readiness gate before building more modules.

The Microsoft Graph email live test phase, **ERP BASE 002E.3F**, is currently blocked due to missing Microsoft Graph/Azure credentials. It should be handled later and should **not** block the numbering/master-data foundation.

---

## 2. User Preferences for Future Prompts

The user prefers:

- Long, detailed, intensive prompts.
- Prompts should be saved as downloadable `.md` files when long, not pasted on screen, unless specifically requested.
- Prompts should include a traceable prompt number/title.
- Phase-gated process: planning → implementation → report → review → correction if required → next phase.
- Do not jump ahead.
- For ERP work, every phase should generate a review/report file.
- Keep instructions strict: no broad unrelated implementation, no hidden side effects.
- When reviewing files/reports, give a short summary and either a correction prompt or confirm the next step.

The user also prefers that the assistant avoid long explanations unless necessary and provide actionable next steps.

---

## 3. Current ERP BASE 002 Status

### 3.1 ERP BASE 002E.3F — Microsoft Graph Live Test

Status: **Blocked / Deferred**

Reason: Microsoft Graph credentials are not configured.

The uploaded file `ERP_BASE_002E_3F_INITIAL_LIVE_TEST_REVIEW.md` confirms:

- Microsoft Graph provider code is ready.
- Attachment generation is ready.
- Email dialog UI is ready.
- Server action is ready.
- Export menu integration is ready.
- Audit logging design is ready.
- Live testing cannot proceed because these environment variables are missing or placeholders:
  - `MICROSOFT_TENANT_ID`
  - `MICROSOFT_CLIENT_ID`
  - `MICROSOFT_CLIENT_SECRET`
  - `MICROSOFT_MAIL_SENDER`

Decision: Leave 002E.3F for later. Continue with ERP BASE 002 balance foundation work.

---

## 4. ERP BASE 002 Balance Requirements

A reference file has already been created:

`ERP_BASE_002_BALANCE_REQUIREMENTS_REFERENCE.md`

It contains the planned remaining ERP BASE 002 requirements. The next chat should use it as the main reference.

Recommended balance sequence:

1. **002E.4 — Global Draft / Unsaved Changes / Incomplete Form Engine**
2. **002E.5 — Global Record Status and Lifecycle Foundation**
3. **002F.1 — App Settings / Company Settings / Letterhead Foundation**
4. **002F.2 — Global Numbering / Prefix / Sequence Engine**
5. **002F.3 — Global Lookup / Dropdown / Master Data Engine**
6. **002F.4 — Core Global Master Data**
7. **002F.5 — Global Attachment / Document Metadata Foundation**
8. **002F.6 — Global Export / Print / PDF / Excel / CSV Engine Completion**
9. **002F.7 — Send by Email Engine Live Test Later**
10. **002F.8 — Global Data Table Standardization**
11. **002F.9 — Global Drawer Form Standardization**
12. **002F.10 — Audit Log Foundation**
13. **002F.11 — Permission / Role / Access Foundation Review**
14. **002F.12 — Foundation Readiness Review Before New Modules**

---

## 5. Important Recommendation for Next Step

The user is especially concerned that autonumbering and prefixes were not done early enough.

Recommended next phase:

# ERP BASE 002F.2 — Global Numbering / Prefix / Sequence Engine

Reason: Every future module will need proper reference numbers. If not done now, future modules will produce inconsistent references and require rework.

The numbering engine should support:

- Company prefix.
- Branch prefix.
- Module prefix.
- Document type prefix.
- Date/year/month tokens.
- Sequence length.
- Reset rules: yearly, monthly, never.
- Preview next number.
- Reserve number on draft/save/submit policy.
- Duplicate prevention.
- Collision-safe generation.
- Cancelled number handling.
- Manual override by authorized role only.
- Audit log of generated numbers.
- Reusable function/service for all modules.
- Clear report after implementation.

Example template:

```text
{COMPANY}-{BRANCH}-{DOC}-{YYYY}-{SEQ6}
```

Example outputs:

```text
ALGT-AUH-EMP-2026-000001
ALS-AUH-PO-2026-000001
PGI-DXB-INV-2026-000001
```

---

## 6. Suggested Next Chat First Request

The user may start the new chat with:

```text
I am continuing ERP BASE 002 foundation work. Please read the attached handoff file and ERP_BASE_002_BALANCE_REQUIREMENTS_REFERENCE.md. 002E.3F Microsoft Graph live test is deferred. I want to start with ERP BASE 002F.2 — Global Numbering / Prefix / Sequence Engine. Generate a very detailed Cursor prompt as an .md file only.
```

---

## 7. Files to Upload to the Next Chat

Upload these files to the new chat:

### Required

1. `NEXT_CHAT_HANDOFF_ERP_BASE_002_FOUNDATION.md`
   - This file.

2. `ERP_BASE_002_BALANCE_REQUIREMENTS_REFERENCE.md`
   - Main requirements reference for remaining ERP BASE 002 foundation.

3. `ERP_BASE_002E_3F_INITIAL_LIVE_TEST_REVIEW.md`
   - Shows 002E.3F email live test is blocked by Microsoft credentials and can be deferred.

### Recommended if available from Cursor/project

4. Latest implementation/report files for ERP BASE 002E.2 / 002E.3, especially:
   - global export/print/email reports
   - global data table reports
   - drawer form reports
   - Microsoft Graph email implementation reports

5. Current database/schema overview if available.

6. Current app folder structure or README if available.

7. Any latest `.md` phase reports from Cursor related to:
   - App Settings
   - Letterheads
   - Export Engine
   - Send by Email Engine
   - Global Data Table
   - Drawer Forms
   - Draft Workflow

### Optional

8. Screenshots of current ERP screens if UI/table/drawer design matters.

9. Any existing numbering or reference fields already created, if any.

10. Existing master data files or lookup tables if already started.

---

## 8. Guardrails for Next Chat

The assistant in the next chat should follow these rules:

- Do not assume the numbering engine already exists.
- Do not jump to HR/Fleet/Workshop modules before ERP BASE 002 foundation is complete.
- Keep 002E.3F deferred until Microsoft credentials are available.
- Start with planning prompt for Cursor, not implementation directly.
- The prompt must be deep and detailed.
- The prompt should be saved to `.md` file only if long.
- The prompt should instruct Cursor to generate an implementation report.
- It should enforce no unrelated modules, no hidden implementation, no broad scope creep.
- It should include tests, rollback, audit, permissions, and readiness gate.

---

## 9. Desired Immediate Output in Next Chat

The immediate output should be a downloadable file:

```text
PROMPT_ERP_BASE_002F_2_GLOBAL_NUMBERING_ENGINE.md
```

The prompt should instruct Cursor to implement or plan the Global Numbering / Prefix / Sequence Engine depending on user direction.

Recommended first phase should be **planning + design + implementation readiness** if the user wants strict planning first:

```text
ERP BASE 002F.2A — Global Numbering Engine Planning and Technical Design
```

Then:

```text
ERP BASE 002F.2B — Global Numbering Engine Implementation
ERP BASE 002F.2C — Global Numbering Engine QA / Security / Integration Review
```

If the user wants to implement directly, the prompt must still include full safeguards and report generation.

---

## 10. Summary for the Next Assistant

The user is ready to continue ERP BASE 002 foundation. The next logical step is not HRMS UI, not another business module, and not Microsoft Graph testing. It is the missing global foundation:

```text
Start with ERP BASE 002F.2 — Global Numbering / Prefix / Sequence Engine.
Then continue with Global Master Data and Lookup Engine.
```

The goal is to make the ERP foundation enterprise-ready before building more modules.

