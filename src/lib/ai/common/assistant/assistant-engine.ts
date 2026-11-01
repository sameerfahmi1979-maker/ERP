/**
 * ERP COMMON AI.7 — Assistant Engine
 *
 * Orchestrates a single assistant turn:
 *  1. Validate/cap user message
 *  2. Detect blocked dangerous requests
 *  3. Extract intent (1 AI call)
 *  4. Execute safe action handlers
 *  5. Optionally synthesize response (max 1 extra AI call)
 *  6. Return AssistantTurnResult
 *
 * Max 2 AI calls per turn. No auto-execution of ERP mutations.
 */

import {
  isBlockedDangerousRequest,
  getAssistantActionDefinition,
  isApprovedAction,
} from "./action-registry";
import { extractAssistantIntent } from "./intent-extractor";
import {
  runSearchErpAction,
  runOpenRecordAction,
  runExplainRiskAction,
  runExplainComplianceAction,
  runExplainDuplicateAction,
  runExplainDocumentAction,
  runPrepareFieldUpdateDraftAction,
  runPrepareEmailDraftAction,
  runPrepareRenewalNoteAction,
  runShowNextActionsAction,
} from "./action-handlers";
import {
  buildBlockedActionResponse,
  buildDraftCreatedResponse,
  sanitizeForStorage,
} from "./response-builder";
import type {
  AssistantTurnResult,
  AssistantActionCode,
  AssistantBlockedAction,
  AssistantActionDraftPayload,
  AssistantIntent,
} from "./types";
import { AI_TURN_LIMITS } from "@/lib/ai/foundation/budget";
import { answerAssistantQuestion } from "@/server/ai/assistant/questions";
import { normalizeAssistantReference } from "./entity-access";

// ── Limits ─────────────────────────────────────────────────────────────────────

export const MAX_USER_MESSAGE_LENGTH = 1000; // also defined as ASSISTANT_MAX_USER_MESSAGE_LENGTH in types.ts
const MAX_AI_CALLS = AI_TURN_LIMITS.modelCalls;

// ── Engine input ───────────────────────────────────────────────────────────────

export interface AssistantEngineInput {
  userMessage: string;
  sessionId: number;
  contextEntityType?: string | null;
  contextEntityId?: number | null;
  userPermissions: string[];
  /** Callback to persist a draft row and return its ID */
  persistDraft: (
    sessionId: number,
    actionCode: AssistantActionCode,
    payload: AssistantActionDraftPayload,
    sources?: readonly import("@/lib/ai/foundation/contracts").AiEntityReference[],
  ) => Promise<number | null>;
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export async function runAssistantTurn(
  input: AssistantEngineInput
): Promise<AssistantTurnResult> {
  const start = Date.now();
  let aiCallCount = 0;
  const executedActions: AssistantActionCode[] = [];
  const blockedActionCodes: string[] = [];
  const draftIds: number[] = [];

  // Step 1: Validate + cap message
  const rawMsg = input.userMessage.trim();
  if (!rawMsg) {
    return makeErrorResult("Please enter a message.", start, aiCallCount, []);
  }
  const safeMsg = rawMsg.slice(0, MAX_USER_MESSAGE_LENGTH);

  // Step 2: Quick keyword block check
  if (isBlockedDangerousRequest(safeMsg)) {
    const blocked: AssistantBlockedAction[] = [
      {
        requestedCode: "UNKNOWN_DANGEROUS",
        reason: "Detected potentially dangerous action keywords",
        alternativeActions: ["EXPLAIN_RISK", "EXPLAIN_COMPLIANCE", "SEARCH_ERP"],
      },
    ];
    blockedActionCodes.push("UNKNOWN_DANGEROUS");
    const partial = buildBlockedActionResponse(blocked);
    return finalResult(partial, start, aiCallCount, executedActions, blockedActionCodes, draftIds);
  }

  // Step 3: Extract intent (AI call 1)
  // Existing specialised explain/draft actions keep their owning workflows.
  // General factual questions use the shared current-source adapter, not model prose.
  if (!/\b(?:risk|compliance|duplicate|summari[sz]e|explain document|prepare.*(?:draft|email|note)|draft.*(?:email|update|note)|(?:open|find|search)\b.*\b(?:party|parties|company|companies|branch|site|record))\b/i.test(safeMsg)) {
    const context = input.contextEntityType && input.contextEntityId ? normalizeAssistantReference(input.contextEntityType, input.contextEntityId) : null;
    const read = await answerAssistantQuestion({ question: safeMsg, ...(context ? { context } : {}) });
    if (!read.success) return makeErrorResult(read.error, start, read.modelCalls ?? 0, []);
    const data = read.data;
    return finalResult({ responseText: data.answer, outputType: data.outcome === "unavailable" ? "error" : "explanation",
      navigationLinks: data.links, guidance: data, sourceReferences: data.evidence.slice(0, 8).map(e => e.reference), historyReplayAllowed: data.replayable,
    }, start, data.modelCalls, ["SEARCH_ERP"], [], []);
  }
  aiCallCount++;
  let intent: AssistantIntent;
  try {
    intent = await extractAssistantIntent(safeMsg, input.contextEntityType, input.contextEntityId);
  } catch {
    return makeErrorResult("Language interpretation is unavailable. Please retry or open the permitted record.", start, aiCallCount, []);
  }

  // Step 4: Handle blocked dangerous intent
  if (intent.intentType === "blocked_dangerous") {
    const blocked: AssistantBlockedAction[] = intent.candidateActions
      .filter((code) => !isApprovedAction(code))
      .map((code) => ({
        requestedCode: code,
        reason: "Action is blocked — requires explicit human review and approval",
        alternativeActions: ["SEARCH_ERP", "EXPLAIN_RISK", "OPEN_RECORD"],
      }));

    if (blocked.length === 0) {
      blocked.push({
        requestedCode: "DANGEROUS_INTENT",
        reason: "Detected dangerous intent",
        alternativeActions: ["SEARCH_ERP", "EXPLAIN_RISK", "OPEN_RECORD"],
      });
    }
    blocked.forEach((b) => blockedActionCodes.push(b.requestedCode));

    const partial = buildBlockedActionResponse(blocked);
    return finalResult(partial, start, aiCallCount, executedActions, blockedActionCodes, draftIds);
  }

  // Step 5: Get primary approved action
  const primaryActionCode =
    intent.candidateActions.find((c) => isApprovedAction(c)) ?? "SEARCH_ERP";

  const actionDef = getAssistantActionDefinition(primaryActionCode as AssistantActionCode);
  if (!actionDef || actionDef.isBlocked) {
    blockedActionCodes.push(primaryActionCode);
    const blocked: AssistantBlockedAction[] = [
      {
        requestedCode: primaryActionCode,
        reason: "Action is blocked in v1",
        alternativeActions: ["SEARCH_ERP"],
      },
    ];
    const partial = buildBlockedActionResponse(blocked);
    return finalResult(partial, start, aiCallCount, executedActions, blockedActionCodes, draftIds);
  }

  // Step 6: Check permission for action
  if (
    actionDef.requiredPermission &&
    !input.userPermissions.includes(actionDef.requiredPermission)
  ) {
    return makeErrorResult(
      `You don't have permission to perform "${actionDef.label}". Contact your administrator.`,
      start,
      aiCallCount,
      executedActions
    );
  }

  executedActions.push(primaryActionCode as AssistantActionCode);

  // Step 7: Execute handler
  let partial: Partial<AssistantTurnResult & { draftPayload?: AssistantActionDraftPayload }> = {};

  const code = primaryActionCode as AssistantActionCode;

  try { switch (code) {
    case "SEARCH_ERP":
      partial = await runSearchErpAction(intent);
      break;
    case "OPEN_RECORD":
      partial = await runOpenRecordAction(intent);
      break;
    case "EXPLAIN_RISK":
      partial = await runExplainRiskAction(intent);
      break;
    case "EXPLAIN_COMPLIANCE":
      partial = await runExplainComplianceAction(intent);
      break;
    case "EXPLAIN_DUPLICATE":
      partial = await runExplainDuplicateAction(intent);
      break;
    case "EXPLAIN_DOCUMENT":
      partial = await runExplainDocumentAction(intent);
      break;
    case "PREPARE_FIELD_UPDATE_DRAFT":
      partial = await runPrepareFieldUpdateDraftAction(intent, safeMsg);
      break;
    case "PREPARE_EMAIL_DRAFT_TEXT":
      partial = await runPrepareEmailDraftAction(intent, safeMsg);
      break;
    case "PREPARE_RENEWAL_NOTE":
      partial = await runPrepareRenewalNoteAction(intent, safeMsg);
      break;
    case "SHOW_NEXT_ACTIONS":
      partial = await runShowNextActionsAction(intent);
      break;
    default:
      partial = {
        responseText: "I'm not sure how to help with that. Try asking me to search for a record.",
        outputType: "text",
      };
  } } catch {
    return makeErrorResult("The source information could not be verified. Please retry or open the permitted record; a failed check is not evidence of no findings.", start, aiCallCount, executedActions);
  }

  // Step 8: Persist draft if applicable
  if (
    partial.draftPayload &&
    input.sessionId &&
    aiCallCount < MAX_AI_CALLS
  ) {
    let draftId: number | null;
    try {
      draftId = await input.persistDraft(input.sessionId, code, partial.draftPayload, partial.sourceReferences);
    } catch {
      return makeErrorResult("Draft creation was not confirmed. Reconcile this session before retrying.", start, aiCallCount, executedActions);
    }
    if (draftId) {
      draftIds.push(draftId);
      const draftPartial = buildDraftCreatedResponse(
        draftId,
        partial.draftPayload,
        partial.responseText ?? ""
      );
      return finalResult(
        { ...partial, ...draftPartial, draftIds },
        start,
        aiCallCount,
        executedActions,
        blockedActionCodes,
        draftIds
      );
    }
    return makeErrorResult("Draft creation was not confirmed. Reconcile this session before retrying.", start, aiCallCount, executedActions);
  }

  return finalResult(partial, start, aiCallCount, executedActions, blockedActionCodes, draftIds);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function finalResult(
  partial: Partial<AssistantTurnResult>,
  start: number,
  aiCallCount: number,
  actionCodes: AssistantActionCode[],
  blockedActionCodes: string[],
  draftIds: number[]
): AssistantTurnResult {
  return {
    responseText: sanitizeForStorage(partial.responseText ?? "I was unable to process your request."),
    outputType: partial.outputType ?? "text",
    draftIds: draftIds.length > 0 ? draftIds : partial.draftIds,
    navigationLinks: partial.navigationLinks,
    searchResultSummary: partial.searchResultSummary,
    wasBlocked: partial.wasBlocked ?? false,
    blockedActions: partial.blockedActions,
    sourceReferences: partial.sourceReferences,
    historyReplayAllowed: partial.historyReplayAllowed,
    guidance: partial.guidance,
    safeAuditMeta: {
      actionCodes,
      draftCount: draftIds.length,
      blockedActionCodes,
      durationMs: Date.now() - start,
      aiCallCount,
    },
  };
}

function makeErrorResult(
  text: string,
  start: number,
  aiCallCount: number,
  actionCodes: AssistantActionCode[]
): AssistantTurnResult {
  return {
    responseText: text,
    outputType: "error",
    safeAuditMeta: {
      actionCodes,
      draftCount: 0,
      blockedActionCodes: [],
      durationMs: Date.now() - start,
      aiCallCount,
    },
  };
}
