# ERP COMMON AI.7 — AI Assistant for Actions — Implementation Plan

**Planned by:** Cursor AI  
**Date:** 2026-06-17  
**Status:** PLAN ONLY — Awaiting Sameer/ChatGPT approval before implementation

---

## 1. Executive Summary

ERP COMMON AI.7 introduces a safe, read-first, draft-only AI assistant that helps users navigate, understand, and prepare actions across the ERP. It builds on AI.6 search for context retrieval, and surfaces AI.2–AI.5 findings in human-readable explanations with navigation links.

**Core guarantee:** The assistant never auto-executes mutations. All actions produce drafts or navigation links. The human must take the final step in the existing ERP UI.

**One-phase recommendation:** YES — AI.7 can be implemented in one phase, scoped to read/explain/navigation/draft-only actions.

**Key facts from live DB audit:**
- `ERP_AI_ASSISTANT` feature flag already exists and is **enabled=true** — use this flag directly.
- `ERP_AI_ACTIONS` feature flag exists but is **disabled** (requires_human_review=true) — do NOT enable in AI.7 v1.
- `ai.actions.prepare` and `ai.actions.execute_after_confirm` permissions already exist and are active.
- No `ai.assistant.*` permissions exist yet — need to add 4 new permissions.
- No `erp_ai_assistant_*` tables exist — need to create 3 tables.
- `callCommonAiStructuredCompletion()` in `src/lib/ai/common/provider-bridge.ts` is the correct provider bridge to reuse.
- `searchAcrossErp()` in `src/server/actions/ai/common/search.ts` is the correct retrieval layer to reuse.

---

## 2. Current Assistant/Action Capability Inventory

| Capability | File/Function | Current Behavior | Reusable | Safety Class |
|---|---|---|---|---|
| AI.6 global search | `src/server/actions/ai/common/search.ts` → `searchAcrossErp()` | Keyword/FTS/semantic/intent search | YES — main retrieval layer | read_only |
| AI.1 field suggestions | `src/server/actions/ai/common/field-suggestions.ts` → `getAiFieldSuggestions()` | Lists pending suggestions per entity | YES — read only | read_only |
| AI.1 field suggestion apply | `applyAiFieldSuggestion()` | Applies accepted suggestion to record | NO — mutates record | requires_confirmation |
| AI.3 duplicate review | `src/server/actions/ai/common/duplicate-detection.ts` → `reviewDuplicateCandidate()` | Sets review decision | NO — mutates status | requires_confirmation |
| AI.4 compliance finding | `src/server/actions/ai/common/compliance-checker.ts` | Read and review findings | Read YES / Review NO | read_only / requires_confirmation |
| AI.5 risk score | `src/server/actions/ai/common/risk-scoring.ts` → `getRiskScoreForEntity()` | Returns risk score detail | YES — read only | read_only |
| AI.5 risk review | `reviewRiskScore()` | Sets review decision | NO — mutates | requires_confirmation |
| DMS document QA | `src/server/actions/dms/document-qa.ts` → `askDmsDocumentQuestion()` | Answers questions about a document | YES — read only | read_only |
| DMS AI summary | `src/server/actions/dms/ai-summary.ts` | Returns document summary | YES — read only | read_only |
| AI.2 understanding | `src/server/actions/dms/document-understanding.ts` | Returns structured understanding view | YES — read only | read_only |
| Provider bridge | `src/lib/ai/common/provider-bridge.ts` → `callCommonAiStructuredCompletion()` | Calls AI provider via existing factory | YES — main AI call bridge | n/a |
| Audit logging | `src/server/actions/audit.ts` → `logAudit()` | Appends audit row | YES | n/a |

---

## 3. Current App and DB Audit Findings

### Feature Flags (live)
| Flag | is_enabled | requires_human_review | Decision |
|---|---|---|---|
| `ERP_AI_ASSISTANT` | **true** | false | USE THIS — already enabled |
| `ERP_AI_ACTIONS` | false | true | Keep disabled in v1 |
| `AI_SEARCH` | true | false | Used by search retrieval |
| `DMS_SEMANTIC_SEARCH` | true | false | Available for context |
| `DMS_DOCUMENT_QA` | true | false | Available for Ask DMS context |

### Permissions (live — AI module)
| Permission | Status | Decision for AI.7 |
|---|---|---|
| `ai.actions.prepare` | Active | YES — use for assistant draft preparation |
| `ai.actions.execute_after_confirm` | Active | YES — future v2; v1 does not need it |
| `ai.common.admin` | Active | YES — governs admin access |
| `ai.common.view` | Active | YES — governs view access |
| `ai.search.use` | Active | YES — used for context retrieval |
| `ai.risk.view` | Active | YES — used for risk context |
| `ai.compliance.view` | Active | YES — used for compliance context |
| `ai.duplicates.view` | Active | YES — used for duplicate context |
| `ai.assistant.use` | **MISSING** | ADD — main gate for assistant |
| `ai.assistant.view` | **MISSING** | ADD — view sessions/history |
| `ai.assistant.admin` | **MISSING** | ADD — admin view all sessions |

### Existing AI Tables (live schema check)
| Table | Exists | BIGINT PK | Status | Notes |
|---|---|---|---|---|
| `erp_ai_field_suggestions` | YES | YES | has deleted_at, entity_type, entity_id | AI.1 |
| `erp_ai_duplicate_candidates` | YES | YES | has deleted_at, status | AI.3 |
| `erp_ai_compliance_findings` | YES | YES | has deleted_at, entity_type, entity_id, status | AI.4 |
| `erp_ai_risk_scores` | YES | YES | has deleted_at, entity_type, entity_id, status | AI.5 |
| `erp_ai_recent_searches` | YES | YES | has deleted_at, user_id | AI.6 |
| `erp_ai_assistant_sessions` | **NO** | — | Create in AI.7 |
| `erp_ai_assistant_messages` | **NO** | — | Create in AI.7 |
| `erp_ai_assistant_action_drafts` | **NO** | — | Create in AI.7 |

---

## 4. Scope for AI.7 v1

### Included
- Global assistant route `/assistant`
- Session/message/draft persistence (3 new tables)
- AI intent/action selection (structured JSON + Zod)
- AI.6 search-backed context retrieval
- Actions: SEARCH_ERP, OPEN_RECORD, EXPLAIN_RISK, EXPLAIN_COMPLIANCE, EXPLAIN_DUPLICATE, EXPLAIN_DOCUMENT, PREPARE_FIELD_UPDATE_DRAFT, PREPARE_EMAIL_DRAFT_TEXT, PREPARE_RENEWAL_NOTE, SHOW_NEXT_ACTIONS
- Blocked dangerous action detection with safe redirect
- Sidebar navigation link
- RLS + safe audit logging
- No ERP record mutations in v1

### Excluded / Deferred to v2+
- Auto-execution of record updates
- Document approval from assistant
- Email sending (SMTP/Graph)
- Duplicate merge execution
- Compliance waiver execution
- Risk review execution (user must use /admin/ai/risk page)
- Floating always-on assistant panel
- Command palette
- Autonomous/background agents
- Scheduled assistant sessions
- Third-party tool connectors

---

## 5. Out of Scope / Deferred Capabilities

See Section 4 exclusions. Additionally deferred:
- Multi-turn tool use (v1 is single-turn: user message → AI response + drafts)
- Session sharing between users
- Export/print draft output
- Webhook triggers from assistant
- Voice input

---

## 6. Action Safety Taxonomy

| Safety Class | Description | Examples |
|---|---|---|
| `read_only` | Reads data, no state change | Search ERP, explain risk, summarize document |
| `navigation` | Returns a route URL to open | Open party record, open compliance finding |
| `draft_only` | Prepares safe draft text/payload — no DB write except saving draft | Email text draft, renewal note, field update draft |
| `requires_confirmation` | Existing ERP action the user must take manually in the existing UI | Accept AI.1 suggestion, review AI.5 risk, approve DMS document |
| `blocked_dangerous` | Refused — would auto-mutate critical data | Delete, approve, send email, merge duplicates, waive findings, apply all suggestions |

---

## 7. Assistant Intent Schema

```typescript
interface AssistantIntent {
  intent_type: AssistantIntentType;
  target_entity_type?: "organization" | "branch" | "party" | "site" | "dms_document" | null;
  target_entity_id?: number | null;
  requested_action: AssistantActionCode | null;
  context_query?: string | null;
  candidate_actions: AssistantActionCode[];
  confidence: "high" | "medium" | "low";
  requires_confirmation: boolean;
  blocked_reason: string | null;
  explanation?: string | null;
}

type AssistantIntentType =
  | "search"
  | "navigate"
  | "explain"
  | "draft"
  | "show_actions"
  | "blocked";

type AssistantActionCode =
  | "SEARCH_ERP"
  | "OPEN_RECORD"
  | "EXPLAIN_RISK"
  | "EXPLAIN_COMPLIANCE"
  | "EXPLAIN_DUPLICATE"
  | "EXPLAIN_DOCUMENT"
  | "PREPARE_FIELD_UPDATE_DRAFT"
  | "PREPARE_EMAIL_DRAFT_TEXT"
  | "PREPARE_RENEWAL_NOTE"
  | "SHOW_NEXT_ACTIONS";
```

---

## 8. Assistant Action Registry Design

```typescript
const ASSISTANT_ACTION_REGISTRY: AssistantActionDefinition[] = [
  {
    actionCode: "SEARCH_ERP",
    label: "Search ERP",
    safetyClass: "read_only",
    requiredPermission: "ai.search.use",
    allowedEntityTypes: null,
    serverHandler: "runSearchErpAction",
    outputType: "search_results",
    canMutateDb: false,
  },
  {
    actionCode: "OPEN_RECORD",
    label: "Open Record",
    safetyClass: "navigation",
    requiredPermission: "ai.assistant.use",
    allowedEntityTypes: ["organization", "branch", "party", "site", "dms_document"],
    serverHandler: "runOpenRecordAction",
    outputType: "navigation_url",
    canMutateDb: false,
  },
  {
    actionCode: "EXPLAIN_RISK",
    label: "Explain Risk Score",
    safetyClass: "read_only",
    requiredPermission: "ai.risk.view",
    allowedEntityTypes: ["organization", "branch", "party", "site"],
    serverHandler: "runExplainRiskAction",
    outputType: "assistant_answer",
    canMutateDb: false,
  },
  {
    actionCode: "EXPLAIN_COMPLIANCE",
    label: "Explain Compliance Findings",
    safetyClass: "read_only",
    requiredPermission: "ai.compliance.view",
    allowedEntityTypes: ["organization", "branch", "party", "site"],
    serverHandler: "runExplainComplianceAction",
    outputType: "assistant_answer",
    canMutateDb: false,
  },
  {
    actionCode: "EXPLAIN_DUPLICATE",
    label: "Explain Duplicate Candidates",
    safetyClass: "read_only",
    requiredPermission: "ai.duplicates.view",
    allowedEntityTypes: ["organization", "branch", "party"],
    serverHandler: "runExplainDuplicateAction",
    outputType: "assistant_answer",
    canMutateDb: false,
  },
  {
    actionCode: "EXPLAIN_DOCUMENT",
    label: "Explain Document",
    safetyClass: "read_only",
    requiredPermission: "dms.documents.view",
    allowedEntityTypes: ["dms_document"],
    serverHandler: "runExplainDocumentAction",
    outputType: "assistant_answer",
    canMutateDb: false,
  },
  {
    actionCode: "PREPARE_FIELD_UPDATE_DRAFT",
    label: "Prepare Field Update Draft",
    safetyClass: "draft_only",
    requiredPermission: "ai.actions.prepare",
    allowedEntityTypes: ["organization", "party"],
    serverHandler: "runPrepareFieldUpdateDraftAction",
    outputType: "field_update_draft",
    canMutateDb: true,  // saves to erp_ai_assistant_action_drafts only
  },
  {
    actionCode: "PREPARE_EMAIL_DRAFT_TEXT",
    label: "Prepare Email Draft Text",
    safetyClass: "draft_only",
    requiredPermission: "ai.actions.prepare",
    allowedEntityTypes: null,
    serverHandler: "runPrepareEmailDraftAction",
    outputType: "email_text_draft",
    canMutateDb: true,  // saves to erp_ai_assistant_action_drafts only
  },
  {
    actionCode: "PREPARE_RENEWAL_NOTE",
    label: "Prepare Renewal Note",
    safetyClass: "draft_only",
    requiredPermission: "ai.actions.prepare",
    allowedEntityTypes: ["organization", "party", "dms_document"],
    serverHandler: "runPrepareRenewalNoteAction",
    outputType: "renewal_note_draft",
    canMutateDb: true,  // saves to erp_ai_assistant_action_drafts only
  },
  {
    actionCode: "SHOW_NEXT_ACTIONS",
    label: "Show Recommended Next Actions",
    safetyClass: "read_only",
    requiredPermission: "ai.assistant.use",
    allowedEntityTypes: ["organization", "branch", "party", "site"],
    serverHandler: "runShowNextActionsAction",
    outputType: "action_list",
    canMutateDb: false,
  },
];
```

---

## 9. Draft Output Model

```typescript
type AssistantOutputType =
  | "assistant_answer"
  | "record_navigation"
  | "search_results"
  | "field_update_draft"
  | "email_text_draft"
  | "renewal_note_draft"
  | "compliance_review_recommendation"
  | "duplicate_review_recommendation"
  | "risk_review_recommendation"
  | "action_list"
  | "blocked";

interface AssistantMessage {
  id: number;
  sessionId: number;
  role: "user" | "assistant" | "system_notice";
  messageText: string;       // sanitized, human-readable, capped 4000 chars
  outputType?: AssistantOutputType;
  safeMetadataJson?: {
    actionCodes?: string[];
    entityType?: string;
    entityId?: number;
    navigationRoutes?: string[];
    draftPayloadRef?: number;  // FK to action_drafts.id
    resultCount?: number;
    blocked?: boolean;
    blockedReason?: string;
  };
  createdAt: string;
}

interface AssistantActionDraft {
  id: number;
  sessionId: number;
  actionCode: string;
  safetyClass: string;
  targetEntityType?: string;
  targetEntityId?: number;
  draftPayloadJson: {
    // For field_update_draft
    fieldUpdates?: Array<{ field: string; suggestedValue: string; reason: string }>;
    // For email_text_draft
    emailSubject?: string;
    emailBody?: string;
    // For renewal_note_draft
    noteText?: string;
    // For navigation
    route?: string;
    // For search_results
    resultCount?: number;
  };
  status: "draft" | "reviewed" | "accepted_for_manual_action" | "dismissed" | "superseded" | "failed";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: number;
}
```

**Draft Content Rules:**
- `draftPayloadJson` must never contain raw AI response, prompt text, OCR text, or content_text
- All draft text must be final human-readable output only
- `emailBody` capped at 2000 chars; `noteText` capped at 1000 chars
- Field suggestions reference field names + values only (no AI evidence snippets)

---

## 10. Database Impact Review

### New tables required

**`erp_ai_assistant_sessions`**
```sql
id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
session_code          TEXT UNIQUE NOT NULL
title                 TEXT
owner_user_profile_id BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE
context_entity_type   TEXT
context_entity_id     BIGINT
status                TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','completed','failed','archived'))
message_count         INT NOT NULL DEFAULT 0
created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at            TIMESTAMPTZ
```

**`erp_ai_assistant_messages`**
```sql
id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
session_id       BIGINT NOT NULL REFERENCES erp_ai_assistant_sessions(id) ON DELETE CASCADE
role             TEXT NOT NULL CHECK (role IN ('user','assistant','system_notice'))
message_text     TEXT NOT NULL  -- sanitized, capped 4000 chars
output_type      TEXT
safe_metadata_json JSONB DEFAULT '{}'::jsonb
created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
```

**`erp_ai_assistant_action_drafts`**
```sql
id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
session_id          BIGINT NOT NULL REFERENCES erp_ai_assistant_sessions(id) ON DELETE CASCADE
action_code         TEXT NOT NULL
safety_class        TEXT NOT NULL
target_entity_type  TEXT
target_entity_id    BIGINT
draft_payload_json  JSONB NOT NULL DEFAULT '{}'::jsonb
status              TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft','reviewed','accepted_for_manual_action','dismissed','superseded','failed'))
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
reviewed_at         TIMESTAMPTZ
reviewed_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
deleted_at          TIMESTAMPTZ
```

### Indexes recommended
```sql
idx_erp_ai_assistant_sessions_owner  ON erp_ai_assistant_sessions(owner_user_profile_id, created_at DESC) WHERE deleted_at IS NULL
idx_erp_ai_assistant_messages_session ON erp_ai_assistant_messages(session_id, created_at)
idx_erp_ai_assistant_drafts_session  ON erp_ai_assistant_action_drafts(session_id, status) WHERE deleted_at IS NULL
```

### Should messages be persisted?
**YES** — Storing user and assistant messages provides:
- Audit trail for AI interactions
- Session resume capability
- Admin oversight
- Safe metadata for usage analysis

Constraints: `message_text` capped at 4000 chars. No raw prompts, raw AI responses, or sensitive content stored.

### Should action drafts be stored?
**YES** — Required for:
- Human review workflow
- Navigation links to drafts
- Supersede/dismiss lifecycle
- Audit trail

---

## 11. SQL Review — Recommended / Optional

See `implementation_Review/sql_review/ERP_COMMON_AI_7_OPTIONAL_MIGRATION_REVIEW.sql`

Key migration items:
1. Add permissions: `ai.assistant.use`, `ai.assistant.view`, `ai.assistant.admin`
2. Map new permissions to system_admin, group_admin, company_admin
3. Create 3 assistant tables with constraints, indexes, RLS
4. `set_updated_at` trigger on sessions table
5. Feature flag: `ERP_AI_ASSISTANT` already exists — DO NOT recreate

---

## 12. RLS / Permission / Confidentiality Design

### RLS on all 3 assistant tables
```sql
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
ALTER TABLE ... FORCE ROW LEVEL SECURITY;
```

### Session policies
- SELECT: own sessions (owner_user_profile_id = current_user_profile_id() AND deleted_at IS NULL) OR ai.assistant.admin
- INSERT: ai.assistant.use OR system_admin
- UPDATE: own sessions only

### Message policies
- SELECT: session owner OR ai.assistant.admin
- INSERT: session owner + ai.assistant.use
- UPDATE: none (messages are append-only)
- DELETE: none

### Draft policies
- SELECT: session owner OR ai.assistant.admin
- INSERT: session owner + ai.actions.prepare
- UPDATE: session owner (for status changes)

### Confidentiality
- Assistant context queries must respect existing DMS confidentiality gates (hr/legal/executive require dms.admin)
- `EXPLAIN_DOCUMENT` must not return content_text or raw OCR — only ai_summary snippet via `getDmsDocumentUnderstanding()` which already applies gates
- Assistant never sees the AI prompt sent to the provider
- `draftPayloadJson` must not contain raw AI response, OCR text, or content_text

---

## 13. Feature Flag Design

| Flag | Current Status | Decision |
|---|---|---|
| `ERP_AI_ASSISTANT` | EXISTS, enabled=true | USE — do not recreate |
| `ERP_AI_ACTIONS` | EXISTS, disabled | Keep disabled in v1 |

The implementation must check `ERP_AI_ASSISTANT` as the gate for the assistant route and all `sendAssistantMessage` calls.

When `ERP_AI_ASSISTANT=false`:
- `/assistant` redirects to `/dashboard`
- Server actions return `FEATURE_DISABLED` code

---

## 14. Server Action Design

**File:** `src/server/actions/ai/common/assistant.ts`

```typescript
// Session management
startAssistantSession(input: { title?: string; contextEntityType?: string; contextEntityId?: number }): Promise<ActionResult<AssistantSessionRow>>
getAssistantSession(sessionId: number): Promise<ActionResult<AssistantSessionDetail>>
getAssistantSessions(input?: { limit?: number }): Promise<ActionResult<AssistantSessionRow[]>>
archiveAssistantSession(sessionId: number): Promise<ActionResult>

// Message / turn handling
sendAssistantMessage(input: { sessionId: number; message: string }): Promise<ActionResult<AssistantTurnResult>>

// Draft management
getAssistantActionDrafts(sessionId: number): Promise<ActionResult<AssistantActionDraftRow[]>>
dismissAssistantActionDraft(draftId: number): Promise<ActionResult>
markAssistantActionDraftReviewed(draftId: number): Promise<ActionResult>
markAssistantActionDraftAccepted(draftId: number): Promise<ActionResult>

// Feature flag
isAssistantEnabled(): Promise<ActionResult<{ enabled: boolean }>>
```

### `sendAssistantMessage` flow
```text
1. Validate input (query 1–1000 chars).
2. Check ai.assistant.use permission.
3. Check ERP_AI_ASSISTANT flag.
4. Load session + verify owner.
5. Save user message to erp_ai_assistant_messages.
6. Call assistant engine:
   a. Extract structured intent (1 AI call via callCommonAiStructuredCompletion).
   b. Execute safe actions by intent (read_only / navigation / draft_only).
   c. Build assistant response text.
   d. Save action drafts if any.
7. Save assistant message.
8. Update session message_count.
9. Audit log (safe metadata only).
10. Return AssistantTurnResult.
```

### Permission check per action
```text
SEARCH_ERP          → ai.search.use
OPEN_RECORD         → ai.assistant.use (entity view perm checked at target)
EXPLAIN_RISK        → ai.risk.view
EXPLAIN_COMPLIANCE  → ai.compliance.view
EXPLAIN_DUPLICATE   → ai.duplicates.view
EXPLAIN_DOCUMENT    → dms.documents.view
PREPARE_*           → ai.actions.prepare
SHOW_NEXT_ACTIONS   → ai.assistant.use
```

If user lacks a required permission for a proposed action, that action is omitted from candidate_actions and the assistant explains it is unavailable.

---

## 15. Assistant Engine Design

**File:** `src/lib/ai/common/assistant/assistant-engine.ts`

```text
Input: { sessionId, userMessage, ctx, flags }
Output: AssistantTurnResult { response, drafts, intent, failedActions }

Steps:
1. extractAssistantIntent(userMessage, flags) → AssistantIntent
   - 1 AI call via callCommonAiStructuredCompletion
   - Zod-validated JSON
   - Falls back to SEARCH_ERP if invalid/failed
2. for each candidate_action in intent.candidate_actions:
   a. Check safety class — skip blocked_dangerous
   b. Check permission for action
   c. Execute handler:
      - read_only: call read server action, build context
      - navigation: build route URL
      - draft_only: prepare draft, save to erp_ai_assistant_action_drafts
3. buildAssistantResponse(intent, contextResults, drafts) → messageText
   - Uses 1 additional AI call if action requires explanation synthesis
   - Total AI calls: max 2 per user message (1 intent + 1 synthesis)
4. Return response + drafts
```

### AI calls per message
- Max 2 AI calls: 1 for intent extraction, 1 for response synthesis
- If intent extraction fails → 1 call only (keyword fallback)
- Cost estimate: ~600–1200 tokens per message

### Library folder structure
```
src/lib/ai/common/assistant/
  types.ts
  action-registry.ts
  intent-extractor.ts
  action-handlers.ts
  response-builder.ts
  assistant-engine.ts
  index.ts
```

---

## 16. UI / UX Design

### Route
```
/assistant (protected global route)
src/app/(protected)/assistant/page.tsx
```

### Feature folder
```
src/features/ai/common/assistant/
  assistant-page-client.tsx   — main page: chat interface
  assistant-chat-input.tsx    — input bar with send button
  assistant-message-bubble.tsx — user/assistant/notice bubbles
  assistant-draft-card.tsx    — action draft display with review buttons
  assistant-action-chips.tsx  — suggested action chips
  assistant-loading.tsx       — thinking indicator
  assistant-empty-state.tsx   — initial state
  assistant-session-list.tsx  — left panel with session history
  index.ts
```

### UI behavior
```
- Chat-like interface (left: session list, right: current conversation)
- User types natural language query
- Assistant responds with text + optional draft cards + navigation links
- Draft cards show: AI draft label, action type, draft content, Review/Dismiss buttons
- Navigation links: "Open Record" buttons only — no action execution from UI
- Blocked action message: explains why blocked + offers alternative (Open review page)
- Feature-disabled banner if ERP_AI_ASSISTANT=false
- No action execution buttons — only Open/Review/Dismiss
```

### Sidebar placement
```
Administration → after AI Search (/search)
  AI Assistant → /assistant (icon: Bot or MessageSquareDashed)
```

### Links from AI.2/AI.5 pages
- AI Risk page: "Ask Assistant about this entity" link with context entity pre-filled
- AI Understanding tab: "Ask Assistant" link with documentId pre-filled

---

## 17. Integration with AI.6 Search

Assistant uses `searchAcrossErp()` as the retrieval layer for `SEARCH_ERP` and as entity context for explain/draft actions.

```text
When SEARCH_ERP intent:
  → Call searchAcrossErp({ query, mode: "quick_keyword", includeAiSignals: true })
  → Return top 5 results with badges as context

When EXPLAIN_* intent with entity found via search:
  → First search for entity if entityId not provided
  → Then load entity-specific AI signal data
```

The assistant does NOT independently query all ERP tables — it delegates to the AI.6 search engine for entity discovery.

---

## 18. Integration with AI.2 Document Understanding

For `EXPLAIN_DOCUMENT` action:
- Calls `getDmsDocumentUnderstanding(documentId)` which returns sanitized understanding view
- Assistant summarizes the health score, key issues, and recommended actions from the response
- Never returns raw OCR text, content_text, or embedding vectors
- Confidentiality gate: hr/legal/executive content already redacted by understanding action for non-admin

---

## 19. Integration with AI.3 Duplicate Detection

For `EXPLAIN_DUPLICATE` action:
- Calls `getDuplicateCandidates({ entityType, entityId })` read action
- Assistant explains the duplicate reason, similarity score, recommended human action
- Navigation link to `/admin/ai/duplicates` for human review
- Does NOT call `reviewDuplicateCandidate()` — human must act

---

## 20. Integration with AI.4 Compliance Checker

For `EXPLAIN_COMPLIANCE` action:
- Calls `getComplianceFindings({ entityType, entityId })` read action
- Assistant lists open findings count, critical findings, missing documents
- Navigation link to `/admin/ai/compliance` for human review
- Does NOT call any waive/resolve action

---

## 21. Integration with AI.5 Risk Scoring

For `EXPLAIN_RISK` action:
- Calls `getRiskScoreForEntity({ entityType, entityId })` read action
- Assistant explains risk level, score, top signal contributors, recommended actions
- Navigation link to `/admin/ai/risk` for human review
- Does NOT call `reviewRiskScore()` — human must act

For `SHOW_NEXT_ACTIONS`:
- Aggregates AI.3 + AI.4 + AI.5 signals for entity
- Returns list of recommended human actions with routes

---

## 22. Blocked Action Handling

### Blocked action list (v1)
```
DELETE_PARTY, DELETE_DOCUMENT, DELETE_BRANCH, DELETE_ORGANIZATION
APPROVE_DOCUMENT, APPROVE_DMS_INTAKE
SEND_EMAIL, SEND_NOTIFICATION
MERGE_DUPLICATES
WAIVE_COMPLIANCE_FINDING
APPLY_ALL_SUGGESTIONS
RESOLVE_RISK_REVIEW
CHANGE_COMPLIANCE_STATUS
BULK_UPDATE_RECORDS
```

### Response template for blocked actions
```
"I cannot execute [requested action] automatically. This requires explicit human review and approval.

To proceed, you can:
• Open the [entity] record: [link]
• Review in [AI Review page]: [link]

I can prepare a draft note or explain the current status if helpful."
```

---

## 23. Audit and Logging Design

### Safe to log
```
action: "assistant_session_started" / "assistant_message_sent" / "assistant_draft_created"
session_id
message_count
action_codes (list of strings)
result_type
blocked_actions (list of strings)
duration_ms
model name
prompt_tokens, completion_tokens
user_profile_id
entity_type, entity_id (when relevant)
```

### Never log
```
raw_prompt
raw_ai_response
user_message_text (character count only)
assistant_message_text
OCR text
content_text
draft_payload_json
API keys
```

### `erp_ai_usage_logs` entry
One entry per AI call with: feature_area="ERP_AI_ASSISTANT", operation_type="intent_extraction" | "response_synthesis", model, tokens, duration_ms. No text content.

---

## 24. AI Provider and Prompt Contract

**Provider:** `callCommonAiStructuredCompletion()` from `@/lib/ai/common/provider-bridge`

**Intent extraction prompt** must instruct:
```
Return ONLY a JSON object with the assistant intent.
Do NOT answer the question in the intent response.
Do NOT propose dangerous actions.
Do NOT execute actions.
Only classify the request and list safe candidate actions.
```

**Response synthesis prompt** must instruct:
```
You are a helpful ERP assistant. Explain the provided context clearly.
Do NOT make up data not present in the context.
Do NOT promise to execute actions.
Do NOT include raw data, OCR text, or technical identifiers.
Keep response under 800 words.
```

Both prompts: Zod-validated output. On failure: graceful fallback message.

---

## 25. Performance and Cost Control

| Control | Value |
|---|---|
| Max user message length | 1000 chars |
| Max assistant message length | 4000 chars (stored), 2000 (rendered) |
| Max AI calls per user message | 2 (intent + synthesis) |
| Max session messages | 50 (after limit: archive session) |
| Context results from AI.6 search | max 5 results per SEARCH_ERP call |
| Context from AI.5/AI.4/AI.3 | max 10 items per explain call |
| Provider timeout | inherited from existing provider adapter |
| No background loops | all calls synchronous within request |

---

## 26. Error Handling and Partial Results

| Scenario | Response |
|---|---|
| `ERP_AI_ASSISTANT=false` | Feature disabled message; redirect from route |
| No permission | "Permission denied" error — never partial data |
| Provider not configured | "AI provider not configured" message |
| Intent extraction failed | Fallback to SEARCH_ERP with keyword |
| Search failed | Partial result warning |
| Confidential context | Redacted; assistant explains restriction |
| Blocked action | Safe refusal message with navigation alternative |
| Max messages reached | "Session at capacity — start new session" |

---

## 27. Testing and UAT Plan

| Test | Expected Result |
|---|---|
| Open /assistant | Chat interface loads |
| Ask "Show me high risk parties" | Executes SEARCH_ERP + EXPLAIN_RISK — returns list |
| Ask "Open Alliance Group party" | Returns OPEN_RECORD with route link |
| Ask "Explain why this company is high risk" | Returns EXPLAIN_RISK with risk breakdown |
| Ask "Prepare renewal note for this trade license" | Returns PREPARE_RENEWAL_NOTE draft card |
| Ask "Prepare email draft for expired document" | Returns PREPARE_EMAIL_DRAFT_TEXT draft card |
| Ask "Delete this party" | Blocked — returns refusal with link to party record |
| Ask "Approve this document" | Blocked — returns refusal with link to DMS approval |
| Ask "Apply all suggestions" | Blocked — returns safe alternative |
| User without ai.assistant.use | Redirected to /dashboard |
| Confidential DMS document context | Assistant redacts content — shows "Confidential" |
| ERP_AI_ASSISTANT=false | /assistant shows disabled banner |
| DMS_SEMANTIC_SEARCH=true | Explain document uses AI summary snippet |
| Start new session with entity context | Session pre-filled with entity type/id |
| Dismiss draft | Draft status → dismissed |
| Mark draft accepted | Draft status → accepted_for_manual_action; user navigates manually |
| Session list shows previous sessions | Left panel displays history |

---

## 28. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| AI generates unsafe action proposals | Low | Blocked action registry; Zod validation |
| Draft payload leaks sensitive content | Low | `draftPayloadJson` content rules enforced at engine level |
| Provider unavailable | Medium | Graceful fallback to keyword search; clear error message |
| Token cost escalation | Medium | Max 2 AI calls/message; context capped at 5 items |
| Users mistake drafts for executed actions | Medium | All drafts clearly labeled "AI draft — requires human review" |
| Session messages grow unbounded | Low | Max 50 messages per session; archive prompt |
| RLS bypass on assistant tables | Very Low | FORCE RLS; standard patterns from AI.1–AI.6 |
| Intent misclassification | Medium | Fallback to SEARCH_ERP; confidence badge shown |

---

## 29. Implementation File Plan

### New files to create
```
supabase/migrations/<timestamp>_erp_common_ai_7_assistant.sql
src/lib/ai/common/assistant/types.ts
src/lib/ai/common/assistant/action-registry.ts
src/lib/ai/common/assistant/intent-extractor.ts
src/lib/ai/common/assistant/action-handlers.ts
src/lib/ai/common/assistant/response-builder.ts
src/lib/ai/common/assistant/assistant-engine.ts
src/lib/ai/common/assistant/index.ts
src/server/actions/ai/common/assistant.ts
src/features/ai/common/assistant/assistant-page-client.tsx
src/features/ai/common/assistant/assistant-chat-input.tsx
src/features/ai/common/assistant/assistant-message-bubble.tsx
src/features/ai/common/assistant/assistant-draft-card.tsx
src/features/ai/common/assistant/assistant-action-chips.tsx
src/features/ai/common/assistant/assistant-loading.tsx
src/features/ai/common/assistant/assistant-empty-state.tsx
src/features/ai/common/assistant/assistant-session-list.tsx
src/features/ai/common/assistant/index.ts
src/app/(protected)/assistant/page.tsx
```

### Files to modify
```
src/components/layout/app-sidebar.tsx        — add AI Assistant nav link
src/lib/query/query-keys.ts                  — add ai.assistant query keys
src/lib/query/invalidation.ts                — add invalidateAssistantSessions/Drafts
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md          — update after implementation
```

### Optional: links from existing pages (non-breaking additions)
```
src/features/ai/common/risk-scoring/risk-scores-page-client.tsx  — "Ask Assistant" button
src/features/dms/documents/sections/dms-document-understanding-section.tsx — "Ask Assistant" link
```

---

## 30. Exact Step-by-Step Cursor Implementation Sequence

```
Step 1: Read .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md and AI.7 plan files
Step 2: Verify live DB state (feature flags, permissions, tables)
Step 3: Apply DB migration (permissions + 3 tables + indexes + RLS)
Step 4: Create src/lib/ai/common/assistant/types.ts
Step 5: Create src/lib/ai/common/assistant/action-registry.ts
Step 6: Create src/lib/ai/common/assistant/intent-extractor.ts
Step 7: Create src/lib/ai/common/assistant/action-handlers.ts
Step 8: Create src/lib/ai/common/assistant/response-builder.ts
Step 9: Create src/lib/ai/common/assistant/assistant-engine.ts
Step 10: Create src/lib/ai/common/assistant/index.ts
Step 11: Create src/server/actions/ai/common/assistant.ts
Step 12: Create all src/features/ai/common/assistant/ UI components
Step 13: Create src/app/(protected)/assistant/page.tsx
Step 14: Update sidebar + query keys + invalidation
Step 15: Run npx tsc --noEmit
Step 16: Run npm run build
Step 17: Verify DB (tables exist, RLS enabled+forced, permissions mapped)
Step 18: Update SOT + create implementation report
```

---

## 31. Acceptance Criteria

```
1. Migration applied successfully.
2. erp_ai_assistant_sessions, _messages, _action_drafts exist with BIGINT PK and RLS ENABLED+FORCED.
3. ai.assistant.use, ai.assistant.view, ai.assistant.admin permissions exist and are mapped.
4. ERP_AI_ASSISTANT used (pre-existing) — not created, not changed.
5. /assistant route exists.
6. User can start a session and send a message.
7. SEARCH_ERP: returns ERP results via AI.6.
8. OPEN_RECORD: returns navigation route.
9. EXPLAIN_RISK: returns risk explanation from AI.5 data.
10. EXPLAIN_COMPLIANCE: returns compliance summary from AI.4 data.
11. EXPLAIN_DUPLICATE: returns duplicate summary from AI.3 data.
12. EXPLAIN_DOCUMENT: returns document understanding from AI.2/DMS.
13. PREPARE_EMAIL_DRAFT_TEXT: creates draft in erp_ai_assistant_action_drafts.
14. PREPARE_RENEWAL_NOTE: creates draft in erp_ai_assistant_action_drafts.
15. Blocked actions refused with safe message and navigation link.
16. Confidential DMS content redacted in assistant responses.
17. No raw OCR/content/prompt/AI response stored or returned.
18. No ERP record mutations executed.
19. Session messages capped at 50.
20. Sidebar link "AI Assistant" → /assistant present.
21. TypeScript/build pass.
22. SOT updated.
23. Implementation report created.
```

---

## 32. Rollback Plan

```
1. Disable ERP_AI_ASSISTANT flag in erp_ai_feature_flags (UPDATE ... SET is_enabled=false).
2. /assistant route will redirect to /dashboard.
3. Server actions will return FEATURE_DISABLED.
4. Remove sidebar link from app-sidebar.tsx.
5. If tables need removal: DROP TABLE erp_ai_assistant_action_drafts, erp_ai_assistant_messages, erp_ai_assistant_sessions CASCADE.
6. Remove permissions: DELETE FROM role_permissions WHERE permission_id IN (...).
7. No other ERP tables or data are affected (AI.7 only reads existing tables).
```

---

## 33. Handoff Summary

**For Sameer/ChatGPT review:**

Critical decisions confirmed in this plan:
1. `ERP_AI_ASSISTANT` flag already exists and is enabled — use it, do not create a new flag.
2. `ERP_AI_ACTIONS` flag exists but disabled — keep disabled in v1.
3. `ai.actions.prepare` + `ai.actions.execute_after_confirm` already exist — reuse.
4. Need to add: `ai.assistant.use`, `ai.assistant.view`, `ai.assistant.admin`.
5. 3 new tables required: `erp_ai_assistant_sessions`, `erp_ai_assistant_messages`, `erp_ai_assistant_action_drafts`.
6. v1 scope: read/explain/navigation/draft-only. No auto-mutation.
7. Max 2 AI calls per message. Context capped at 5 search results.
8. `/assistant` global route. No floating panel.
9. One implementation phase is recommended.
10. Messages should be persisted (sanitized, capped, no raw AI content).
