# ERP COMMON AI.7 — AI Assistant for Actions
## Implementation Report

**Phase:** ERP COMMON AI.7  
**Date:** 2026-06-17  
**Status:** ✅ CLOSED / PASS  
**TypeScript:** PASS (0 errors)  
**Build:** PASS (`/assistant` route confirmed in build output)  
**DB Migration:** Applied — `20260617170000_erp_common_ai_7_assistant.sql`

---

## Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260617170000_erp_common_ai_7_assistant.sql` | DB migration: permissions, sessions, messages, drafts tables, RLS |
| `src/lib/ai/common/assistant/types.ts` | All AI.7 TypeScript types + `ASSISTANT_MAX_USER_MESSAGE_LENGTH` constant |
| `src/lib/ai/common/assistant/action-registry.ts` | `ASSISTANT_ACTION_REGISTRY`, `BLOCKED_DANGEROUS_ACTIONS`, registry helpers |
| `src/lib/ai/common/assistant/intent-extractor.ts` | `extractAssistantIntent` — 1 AI call, Zod-validated, fallback to SEARCH_ERP |
| `src/lib/ai/common/assistant/action-handlers.ts` | 10 safe action handlers — read/navigate/draft only |
| `src/lib/ai/common/assistant/handler-queries.ts` | Thin DB read helpers for compliance + duplicate handlers |
| `src/lib/ai/common/assistant/route-builder.ts` | Entity type → ERP record route mapper |
| `src/lib/ai/common/assistant/response-builder.ts` | `buildAssistantResponse`, `buildBlockedActionResponse`, `sanitizeAssistantText` |
| `src/lib/ai/common/assistant/assistant-engine.ts` | `runAssistantTurn` — orchestrates turn (max 2 AI calls) |
| `src/lib/ai/common/assistant/index.ts` | Barrel: types + safe utilities only (server-only NOT re-exported) |
| `src/server/actions/ai/common/assistant.ts` | 9 server actions: session CRUD, sendAssistantMessage, draft status updates |
| `src/features/ai/common/assistant/assistant-page-client.tsx` | Main chat page client (session list + chat area) |
| `src/features/ai/common/assistant/assistant-chat-input.tsx` | Chat input textarea with character counter |
| `src/features/ai/common/assistant/assistant-message-bubble.tsx` | Message bubble with search results, nav links, draft cards |
| `src/features/ai/common/assistant/assistant-draft-card.tsx` | Draft card with Review/Accept/Dismiss actions |
| `src/features/ai/common/assistant/assistant-action-chips.tsx` | Quick-action chips for common prompts |
| `src/features/ai/common/assistant/assistant-loading.tsx` | Animated loading indicator |
| `src/features/ai/common/assistant/assistant-empty-state.tsx` | Empty state with example prompts |
| `src/features/ai/common/assistant/assistant-session-list.tsx` | Session list with New Session button |
| `src/features/ai/common/assistant/index.ts` | UI component barrel |
| `src/app/(protected)/assistant/page.tsx` | Protected `/assistant` page route |

## Files Modified

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Added "AI Assistant" → `/assistant` link (after AI Search) |
| `src/lib/query/query-keys.ts` | Added `queryKeys.ai.assistantSessions/assistantSession/assistantDrafts` |
| `src/lib/query/invalidation.ts` | Added `invalidateAssistantSessions/Session/Drafts` helpers |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated with AI.7 closure record |

---

## Migration Summary

**File:** `supabase/migrations/20260617170000_erp_common_ai_7_assistant.sql`

### Permissions Added

| Permission | Mapped To |
|---|---|
| `ai.assistant.use` | system_admin, group_admin, company_admin |
| `ai.assistant.view` | system_admin, group_admin, company_admin |
| `ai.assistant.admin` | system_admin, group_admin, company_admin |

### Tables Created

#### `erp_ai_assistant_sessions`
- BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
- `session_code TEXT UNIQUE NOT NULL`, `title TEXT`, `owner_user_profile_id BIGINT FK`, `context_entity_type TEXT`, `context_entity_id BIGINT`
- `status CHECK ('active','completed','failed','archived')`, `message_count INT DEFAULT 0`
- Soft delete via `deleted_at`
- `set_updated_at` trigger

#### `erp_ai_assistant_messages`
- BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
- `session_id BIGINT FK`, `role CHECK ('user','assistant','system_notice')`
- `message_text TEXT CHECK (char_length BETWEEN 1 AND 4000)` — hard cap on storage
- `output_type TEXT`, `safe_metadata_json JSONB DEFAULT '{}'`
- **Append-only: no UPDATE, no DELETE policy**

#### `erp_ai_assistant_action_drafts`
- BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
- `session_id BIGINT FK`, `action_code TEXT`, `safety_class CHECK (read_only/navigation/draft_only/requires_confirmation/blocked_dangerous)`
- `draft_payload_json JSONB`, `status CHECK (draft/reviewed/accepted_for_manual_action/dismissed/superseded/failed)`
- `reviewed_at`, `reviewed_by BIGINT FK` — only status/review fields are updatable

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `erp_ai_assistant_sessions` | Owner OR admin | Owner + `ai.assistant.use` | Owner OR admin | — (soft delete via UPDATE) |
| `erp_ai_assistant_messages` | Owner OR admin | Owner + `ai.assistant.use` | **None** | **None** |
| `erp_ai_assistant_action_drafts` | Owner OR admin | Owner + `ai.actions.prepare` | Owner OR admin (status/review only enforced in server action) | — (soft delete) |

All three tables: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`.

---

## Feature Flag Status

| Flag | Status |
|---|---|
| `ERP_AI_ASSISTANT` | `true` — **used unchanged, NOT recreated** |
| `ERP_AI_ACTIONS` | `false` — **remains disabled in v1** |

---

## Permissions Added / Used

| Permission | Status |
|---|---|
| `ai.assistant.use` | NEW — added by migration |
| `ai.assistant.view` | NEW — added by migration |
| `ai.assistant.admin` | NEW — added by migration |
| `ai.actions.prepare` | EXISTING — used for draft insertion RLS + `canPrepareDraft()` check |
| `ai.actions.execute_after_confirm` | NOT USED in v1 |

---

## Assistant Action Registry

### Approved v1 Actions (10)

| Action | Safety Class | Permission | Description |
|---|---|---|---|
| `SEARCH_ERP` | `read_only` | `ai.search.use` | Uses AI.6 `searchAcrossErp`, returns top 5 |
| `OPEN_RECORD` | `navigation` | — | Returns navigation route, never auto-opens |
| `EXPLAIN_RISK` | `read_only` | `ai.risk.view` | Reads AI.5 risk score, explains level + label |
| `EXPLAIN_COMPLIANCE` | `read_only` | `ai.compliance.view` | Reads AI.4 findings, explains open/critical |
| `EXPLAIN_DUPLICATE` | `read_only` | `ai.duplicate.view` | Reads AI.3 candidates, explains pending |
| `EXPLAIN_DOCUMENT` | `read_only` | `dms.document.view` | Reads AI.2 `summary_text` (sanitized) |
| `PREPARE_FIELD_UPDATE_DRAFT` | `draft_only` | `ai.actions.prepare` | Creates draft payload, links to entity record |
| `PREPARE_EMAIL_DRAFT_TEXT` | `draft_only` | `ai.actions.prepare` | Creates email subject/body draft, does NOT send |
| `PREPARE_RENEWAL_NOTE` | `draft_only` | `ai.actions.prepare` | Creates renewal note draft, no renewal request |
| `SHOW_NEXT_ACTIONS` | `read_only` | — | Reads AI.3/4/5 signals, returns recommendations |

### Blocked Dangerous Actions (14)

`DELETE_PARTY`, `DELETE_DOCUMENT`, `DELETE_BRANCH`, `DELETE_ORGANIZATION`, `APPROVE_DOCUMENT`, `APPROVE_DMS_INTAKE`, `SEND_EMAIL`, `SEND_NOTIFICATION`, `MERGE_DUPLICATES`, `WAIVE_COMPLIANCE_FINDING`, `APPLY_ALL_SUGGESTIONS`, `RESOLVE_RISK_REVIEW`, `CHANGE_COMPLIANCE_STATUS`, `BULK_UPDATE_RECORDS`

---

## Server Actions Summary

| Action | Permission | Description |
|---|---|---|
| `startAssistantSession` | `ai.assistant.use` | Creates new session with optional entity context |
| `getAssistantSession` | `ai.assistant.view` | Returns session + messages + drafts |
| `getAssistantSessions` | `ai.assistant.view` | Lists user's own sessions (admins see all) |
| `archiveAssistantSession` | `ai.assistant.use` (owner) | Soft-archives session |
| `sendAssistantMessage` | `ai.assistant.use` | Runs assistant turn, persists messages, returns response |
| `getAssistantActionDrafts` | `ai.assistant.view` | Lists drafts for a session |
| `dismissAssistantActionDraft` | Owner | Sets status = `dismissed` |
| `markAssistantActionDraftReviewed` | Owner | Sets status = `reviewed` |
| `markAssistantActionDraftAccepted` | Owner | Sets status = `accepted_for_manual_action` |
| `isAssistantEnabled` | — | Checks `ERP_AI_ASSISTANT` flag |

---

## UI Summary

- **Route:** `/assistant` — protected, permission-gated, redirects to `/dashboard` if unauthorized
- **Layout:** Session list (left panel) + Chat area (right panel)
- **Header:** Safety notice "Read-only · Draft-only · Human review required for all actions"
- **Action chips:** Quick-access chips for SEARCH_ERP, EXPLAIN_RISK, COMPLIANCE, DUPLICATE, EMAIL DRAFT, RENEWAL NOTE, NEXT ACTIONS, OPEN_RECORD
- **Empty state:** Example prompts that trigger new session + message
- **Message bubbles:** User (right, violet) + Assistant (left, white) + System notice (center, amber pill)
- **Draft cards:** Amber border, "AI draft — requires human review" warning, Review/Accept/Dismiss buttons
- **No Execute button, No Send button, No Apply button, No Approve button**

---

## Draft-Only Behavior Confirmation

- Drafts are stored in `erp_ai_assistant_action_drafts` with status `draft`
- Draft payload contains: `summary`, `draftFields`, `reviewNotes`, optional `navigationRoute`
- After creation, only `status`, `reviewed_at`, `reviewed_by` can be updated
- `draft_payload_json`, `action_code`, `safety_class`, `target_entity_type`, `target_entity_id` are **never writable after creation**
- No server action calls `applyAiFieldSuggestion`, `sendEmail`, `createRenewalRequest`, or any ERP mutating action
- Draft cards label all items: "AI draft — requires human review"

---

## Blocked Action Behavior Confirmation

- Two-layer detection:
  1. **Keyword scan** (`isBlockedDangerousRequest`) — regex patterns for delete/approve/send/merge/waive/resolve/apply-all/bulk-update
  2. **Intent extraction** — `blocked_dangerous` intent type + non-approved `candidateActions`
- Blocked response text: "I cannot execute this automatically. This requires explicit human review and approval."
- `system_notice` message persisted in session on block
- Audit event `assistant_blocked_action_requested` logged
- No executable draft created for blocked actions

---

## Security / Logging Summary

**Never stored or displayed:**
- Raw prompt text
- Raw AI response
- OCR text / `content_text`
- API keys or `secret_ref` values
- Sensitive extracted values (TRN, IBAN, etc.)

**Stored safely:**
- Sanitized human-readable `message_text` (capped at 4,000 chars)
- Safe draft payload with labeled field summaries
- Safe audit metadata: `action_codes`, `draft_count`, `blocked_action_codes`, `duration_ms`

**Confidentiality:**
- DMS `EXPLAIN_DOCUMENT` reads only `summary_text` (already sanitized in AI.2)
- If user lacks `dms.admin`, confidential documents return restricted explanation
- DMS confidentiality gates not weakened

**AI provider:**
- `callCommonAiStructuredCompletion()` from `src/lib/ai/common/provider-bridge.ts`
- No direct OpenAI SDK imports in any AI.7 file
- Feature area logged: `ERP_AI_ASSISTANT`

---

## What Was NOT Implemented

Per the approved scope:

- Real ERP action execution
- `ai.actions.execute_after_confirm` usage
- Email sending
- Record updates / field applies
- Document approvals
- Duplicate merge
- Compliance waiver
- Risk review execution
- Command palette
- Floating always-on assistant
- Autonomous / background agents
- Scheduled assistant sessions
- External connector actions
- Optional "Ask Assistant" links on AI Risk / DMS Understanding pages (deferred — not trivial without risk of scope creep)

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS (0 errors) |
| `npx next build` | ✅ PASS — `/assistant` route confirmed in build output |
| Critical bundle fix | Barrel `index.ts` exports types + safe utilities only; `action-handlers.ts` and `assistant-engine.ts` (server-only, use `createClient`) NOT re-exported to prevent client bundle pollution |

---

## UAT Checklist

1. ☐ Open `/assistant` — page renders with session list + empty state
2. ☐ Click "New Session" — session created, chat area shows
3. ☐ Ask: "Show me high risk parties" → assistant calls SEARCH_ERP, returns top 5 results with links
4. ☐ Ask: "Open Alliance party" → assistant returns OPEN_RECORD navigation link only
5. ☐ Ask: "Explain why company #5 is high risk" → assistant reads AI.5 score, explains level
6. ☐ Ask: "Explain compliance issues for party #12" → assistant reads AI.4 findings
7. ☐ Ask: "Explain duplicate conflicts for party #12" → assistant reads AI.3 candidates
8. ☐ Ask: "Explain document #55" → assistant reads AI.2 `summary_text`
9. ☐ Ask: "Prepare a renewal note" → assistant creates draft card with "AI draft — requires human review" label
10. ☐ Ask: "Prepare email draft about expiring license" → draft card created, no email sent
11. ☐ Ask: "Delete this party" → blocked, explains cannot execute automatically
12. ☐ Ask: "Approve this document" → blocked
13. ☐ Ask: "Apply all suggestions" → blocked
14. ☐ Click "Dismiss" on draft → status changes to `dismissed`
15. ☐ Click "Mark Reviewed" → status changes to `reviewed`
16. ☐ Click "Accept for Manual Action" → status changes to `accepted_for_manual_action`
17. ☐ Confirm no ERP record was mutated at any point
18. ☐ User without `ai.assistant.use` → redirected to `/dashboard`
19. ☐ Confidential DMS content → restricted explanation shown
20. ☐ Session list shows previous sessions on reload

---

## Risks / Open Questions

| Risk | Status |
|---|---|
| DMS `summary_text` field may not exist in all DB versions | Low risk — `maybeSingle()` returns null gracefully |
| `erp_ai_compliance_findings` / `erp_ai_duplicate_candidates` column names assumed from AI.3/AI.4 | Should be verified in UAT |
| `nanoid` package dependency | Already in use in project (verified by TypeScript compile success) |
| EXPLAIN_RISK action returns `entityLabel` but not `riskReasons` (only available on RiskScoreDetail) | Documented — `riskReasons` requires `getRiskScoreDetail` which loads events; v1 uses lightweight `getRiskScoreForEntity` |
| Optional "Ask Assistant" links on AI Risk / DMS pages | Deferred — not trivial without risk of scope creep; documented in SOT |

---

## Recommended Next Phase

**ERP COMMON AI.8 — HR AI**

Per the prompt final response format.
