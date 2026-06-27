/**
 * ERP COMMON AI.7 — Assistant Action Handlers
 *
 * Safe read/navigation/draft handlers. No ERP mutations.
 * All handlers receive pre-validated intent and return safe output only.
 */

import { searchAcrossErp } from "@/server/actions/ai/common/search";
import { getDmsDocumentUnderstanding } from "@/server/actions/dms/document-understanding";
import { getRiskScoreForEntity } from "@/server/actions/ai/common/risk-scoring";
import {
  getComplianceFindingsForHandler,
  getDuplicateCandidatesForHandler,
} from "./handler-queries";
import type { AssistantActionDraftPayload, AssistantTurnResult, AssistantIntent } from "./types";
import { buildEntityRoute } from "./route-builder";

// ── Max constants ──────────────────────────────────────────────────────────────

const MAX_SEARCH_RESULTS = 5;
const MAX_EXPLAIN_ITEMS = 10;

// ── SEARCH_ERP ─────────────────────────────────────────────────────────────────

export async function runSearchErpAction(intent: AssistantIntent): Promise<Partial<AssistantTurnResult>> {
  const query = intent.searchQuery ?? "";
  if (!query.trim()) {
    return {
      responseText: "Please provide a search term so I can find relevant records.",
      outputType: "text",
    };
  }

  const result = await searchAcrossErp({
    query: query.slice(0, 200),
    mode: "safe_fts",
    limit: MAX_SEARCH_RESULTS + 2,
    includeAiSignals: true,
  });

  if (!result.success || !result.data) {
    return {
      responseText: "I was unable to search the ERP at this time. Please try again.",
      outputType: "error",
    };
  }

  const topResults = result.data.results.slice(0, MAX_SEARCH_RESULTS);
  if (topResults.length === 0) {
    return {
      responseText: `No records found matching "${query}". Try different keywords or check the spelling.`,
      outputType: "text",
    };
  }

  const summaryLines = topResults.map(
    (r) => `• ${r.title}${r.subtitle ? ` (${r.subtitle})` : ""}`
  );

  return {
    responseText: `Found ${result.data.totalCount} result(s) for "${query}":\n\n${summaryLines.join("\n")}`,
    outputType: "search_results",
    searchResultSummary: topResults.map((r) => ({
      title: r.title,
      subtitle: r.subtitle ?? null,
      route: r.route,
      resultType: r.resultType,
    })),
  };
}

// ── OPEN_RECORD ────────────────────────────────────────────────────────────────

export async function runOpenRecordAction(intent: AssistantIntent): Promise<Partial<AssistantTurnResult>> {
  const entityType = intent.targetEntityType;
  const entityId = intent.targetEntityId;

  if (!entityType || !entityId) {
    return {
      responseText:
        "I need the entity type and ID to open a record. Could you specify which record you want to view?",
      outputType: "text",
    };
  }

  const route = buildEntityRoute(entityType, entityId);
  if (!route) {
    return {
      responseText: `I don't have a known route for entity type "${entityType}". Please navigate manually.`,
      outputType: "text",
    };
  }

  return {
    responseText: `Here is a link to open the ${entityType} record (ID: ${entityId}):`,
    outputType: "navigation_link",
    navigationLinks: [{ label: `Open ${entityType} #${entityId}`, route }],
  };
}

// ── EXPLAIN_RISK ───────────────────────────────────────────────────────────────

export async function runExplainRiskAction(intent: AssistantIntent): Promise<Partial<AssistantTurnResult>> {
  const entityType = intent.targetEntityType;
  const entityId = intent.targetEntityId;

  if (!entityType || !entityId) {
    return {
      responseText: "Please specify which entity's risk score you would like explained.",
      outputType: "text",
    };
  }

  const validEntityTypes = ["company", "party", "branch", "site", "dms_document"];
  if (!validEntityTypes.includes(entityType)) {
    return {
      responseText: `I cannot explain risk for entity type "${entityType}". Supported types: company, party, branch, site.`,
      outputType: "text",
    };
  }

  const result = await getRiskScoreForEntity({
    entityType: entityType as "company" | "party" | "branch" | "site" | "dms_document",
    entityId,
  });

  if (!result.success || !result.data) {
    return {
      responseText: "No risk score found for this entity. The risk engine may not have processed it yet.",
      outputType: "text",
    };
  }

  const score = result.data;
  const level = score.riskLevel ?? "none";
  const numeric = score.riskScore ?? 0;
  // riskReasons is only on RiskScoreDetail (not RiskScoreRow) — use entity label + level
  const reasonText = "";

  return {
    responseText:
      `Risk level: **${level.toUpperCase()}** (score: ${numeric}/100)${reasonText}\n\n` +
      `Review the full risk detail in the AI Risk page.`,
    outputType: "explanation",
    navigationLinks: [{ label: "View AI Risk Detail", route: "/admin/ai/risk" }],
  };
}

// ── EXPLAIN_COMPLIANCE ─────────────────────────────────────────────────────────

export async function runExplainComplianceAction(intent: AssistantIntent): Promise<Partial<AssistantTurnResult>> {
  const entityType = intent.targetEntityType;
  const entityId = intent.targetEntityId;

  if (!entityType || !entityId) {
    return {
      responseText: "Please specify which entity's compliance findings you want explained.",
      outputType: "text",
    };
  }

  const findings = await getComplianceFindingsForHandler(entityType, entityId, MAX_EXPLAIN_ITEMS);

  if (findings.length === 0) {
    return {
      responseText: `No open compliance findings for this ${entityType} (ID: ${entityId}). This is a good sign.`,
      outputType: "text",
    };
  }

  const critical = findings.filter((f) => f.severity === "critical");
  const high = findings.filter((f) => f.severity === "high");

  let summary = `Found **${findings.length}** open compliance finding(s)`;
  if (critical.length > 0) summary += ` including **${critical.length} critical**`;
  if (high.length > 0) summary += ` and **${high.length} high severity**`;
  summary += ".\n\n";

  const top = findings.slice(0, 5);
  summary += top.map((f) => `• [${f.severity?.toUpperCase()}] ${f.finding_text ?? "Finding"}`).join("\n");

  return {
    responseText: summary,
    outputType: "explanation",
    navigationLinks: [{ label: "View Compliance Findings", route: "/admin/ai/compliance" }],
  };
}

// ── EXPLAIN_DUPLICATE ──────────────────────────────────────────────────────────

export async function runExplainDuplicateAction(intent: AssistantIntent): Promise<Partial<AssistantTurnResult>> {
  const entityType = intent.targetEntityType;
  const entityId = intent.targetEntityId;

  if (!entityType || !entityId) {
    return {
      responseText: "Please specify which entity's duplicate conflicts you want explained.",
      outputType: "text",
    };
  }

  const candidates = await getDuplicateCandidatesForHandler(entityType, entityId, MAX_EXPLAIN_ITEMS);

  if (candidates.length === 0) {
    return {
      responseText: `No pending duplicate candidates found for this ${entityType} (ID: ${entityId}).`,
      outputType: "text",
    };
  }

  const pending = candidates.filter((c) => c.status === "pending");
  const summary =
    `Found **${pending.length}** pending duplicate candidate(s) for this ${entityType}.\n\n` +
    pending
      .slice(0, 5)
      .map(
        (c) =>
          `• Match score: ${Math.round((c.similarity_score ?? 0) * 100)}% — requires human review`
      )
      .join("\n");

  return {
    responseText: summary,
    outputType: "explanation",
    navigationLinks: [{ label: "View Duplicate Candidates", route: "/admin/ai/duplicates" }],
  };
}

// ── EXPLAIN_DOCUMENT ───────────────────────────────────────────────────────────

export async function runExplainDocumentAction(intent: AssistantIntent): Promise<Partial<AssistantTurnResult>> {
  const documentId = intent.targetEntityId;

  if (!documentId) {
    return {
      responseText: "Please specify which document you would like explained.",
      outputType: "text",
    };
  }

  const result = await getDmsDocumentUnderstanding(documentId);

  if (!result.success || !result.data) {
    const message =
      result.code === "FEATURE_DISABLED"
        ? "AI Document Understanding is not enabled. Open the document record Understanding tab for details."
        : result.code === "PERMISSION_DENIED"
          ? "You do not have permission to view this document's AI understanding."
          : "No AI understanding is available for this document yet. Run AI analysis or open the document record Understanding tab.";
    return { responseText: message, outputType: "text" };
  }

  const u = result.data;
  const title = u.identity.title ?? u.identity.documentNo ?? `Document #${documentId}`;
  const typeLabel = u.identity.typeName ?? u.identity.typeCode ?? "Unknown type";
  const lines: string[] = [
    `**${title}** (${typeLabel})`,
    `Health: ${u.health.label} (${u.health.score}/100)`,
  ];

  if (u.summaryStatus.isConfidentialRedacted) {
    lines.push("Summary: restricted for this confidentiality level.");
  } else if (u.summaryStatus.summaryText) {
    lines.push(`\nSummary:\n${u.summaryStatus.summaryText.slice(0, 600)}`);
  }

  if (u.extractionStatus.hasResult) {
    lines.push(
      `\nAI extraction: ${u.extractionStatus.extractedFieldCount} field(s)` +
        (u.extractionStatus.needsHumanReview ? " — needs human review" : "")
    );
  }

  if (u.completeness.missingFieldLabels.length > 0) {
    lines.push(
      `Missing metadata: ${u.completeness.missingFieldLabels.slice(0, 5).join(", ")}`
    );
  }

  if (u.risk.riskLevel) {
    lines.push(`Risk: ${u.risk.riskLevel}`);
  }

  lines.push("\nOpen the document record Understanding tab for full details.");

  return {
    responseText: lines.join("\n"),
    outputType: "explanation",
    navigationLinks: [
      { label: "Open Document Record", route: `/dms/documents/record/${documentId}` },
    ],
  };
}

// ── PREPARE_FIELD_UPDATE_DRAFT ─────────────────────────────────────────────────

export async function runPrepareFieldUpdateDraftAction(
  intent: AssistantIntent,
  userMessage: string
): Promise<Partial<AssistantTurnResult & { draftPayload: AssistantActionDraftPayload }>> {
  const entityType = intent.targetEntityType;
  const entityId = intent.targetEntityId;
  const hint = (intent.draftHint ?? userMessage).slice(0, 200);

  const payload: AssistantActionDraftPayload = {
    summary: `Field update draft for ${entityType ?? "record"}${entityId ? ` #${entityId}` : ""}: ${hint}`,
    draftFields: {
      "Requested change": hint,
      "Entity type": entityType ?? "unknown",
      "Entity ID": entityId?.toString() ?? "not specified",
    },
    navigationRoute: entityType && entityId ? buildEntityRoute(entityType, entityId) ?? undefined : undefined,
    reviewNotes:
      "AI draft — requires human review. Apply changes manually via the entity record form.",
  };

  return {
    responseText:
      `I've prepared a field update draft for your review.\n\n` +
      `**${payload.summary}**\n\n` +
      `This is an AI draft only. No changes have been made. Please review and apply manually.`,
    outputType: "draft_created",
    draftPayload: payload,
  };
}

// ── PREPARE_EMAIL_DRAFT_TEXT ───────────────────────────────────────────────────

export async function runPrepareEmailDraftAction(
  intent: AssistantIntent,
  userMessage: string
): Promise<Partial<AssistantTurnResult & { draftPayload: AssistantActionDraftPayload }>> {
  const hint = (intent.draftHint ?? userMessage).slice(0, 200);
  const entityType = intent.targetEntityType;
  const entityId = intent.targetEntityId;

  const payload: AssistantActionDraftPayload = {
    summary: `Email draft: ${hint}`,
    draftFields: {
      Subject: `Re: ${hint}`,
      Body: `Dear [Recipient],\n\nThis email is regarding ${entityType ?? "the matter"} ${entityId ? `#${entityId}` : ""}.\n\n${hint}\n\nKind regards,\n[Your Name]`,
    },
    reviewNotes:
      "AI email draft — requires human review. Do NOT send automatically. Copy and send via your email client after editing.",
  };

  return {
    responseText:
      `I've prepared an email draft for your review.\n\n` +
      `**Subject:** ${payload.draftFields!.Subject}\n\n` +
      `This is an AI draft only. No email has been sent.`,
    outputType: "draft_created",
    draftPayload: payload,
  };
}

// ── PREPARE_RENEWAL_NOTE ───────────────────────────────────────────────────────

export async function runPrepareRenewalNoteAction(
  intent: AssistantIntent,
  userMessage: string
): Promise<Partial<AssistantTurnResult & { draftPayload: AssistantActionDraftPayload }>> {
  const hint = (intent.draftHint ?? userMessage).slice(0, 200);
  const entityType = intent.targetEntityType;
  const entityId = intent.targetEntityId;

  const payload: AssistantActionDraftPayload = {
    summary: `Renewal note for ${entityType ?? "record"}${entityId ? ` #${entityId}` : ""}: ${hint}`,
    draftFields: {
      "Renewal context": hint,
      "Entity type": entityType ?? "unknown",
      "Entity ID": entityId?.toString() ?? "not specified",
      Note: `Renewal required for ${entityType ?? "this record"}. ${hint}. Please initiate via the relevant renewal workflow.`,
    },
    navigationRoute: entityType && entityId ? buildEntityRoute(entityType, entityId) ?? undefined : undefined,
    reviewNotes:
      "AI renewal note draft — requires human review. No renewal request has been created automatically.",
  };

  return {
    responseText:
      `I've prepared a renewal note for your review.\n\n` +
      `**${payload.summary}**\n\n` +
      `This is an AI draft only. Initiate the renewal manually via the entity record.`,
    outputType: "draft_created",
    draftPayload: payload,
  };
}

// ── SHOW_NEXT_ACTIONS ──────────────────────────────────────────────────────────

export async function runShowNextActionsAction(
  intent: AssistantIntent
): Promise<Partial<AssistantTurnResult>> {
  const entityType = intent.targetEntityType;
  const entityId = intent.targetEntityId;

  const recommendations: Array<{ label: string; route: string }> = [];
  const summaryLines: string[] = [];

  if (entityType && entityId) {
    // Check risk
    const riskResult = await getRiskScoreForEntity({
      entityType: entityType as "company" | "party" | "branch" | "site" | "dms_document",
      entityId,
    });
    if (riskResult.success && riskResult.data) {
      const level = riskResult.data.riskLevel ?? "none";
      if (level !== "none" && level !== "low") {
        summaryLines.push(`⚠ Risk level is **${level.toUpperCase()}** — review in AI Risk page.`);
        recommendations.push({ label: "Review Risk Score", route: "/admin/ai/risk" });
      }
    }

    // Check compliance
    const complianceCount = await getComplianceFindingsForHandler(entityType, entityId, 1);
    if (complianceCount.length > 0) {
      summaryLines.push(`⚠ Open compliance findings found — review in AI Compliance page.`);
      recommendations.push({ label: "Review Compliance Findings", route: "/admin/ai/compliance" });
    }

    // Check duplicates
    const dupeCount = await getDuplicateCandidatesForHandler(entityType, entityId, 1);
    if (dupeCount.length > 0) {
      summaryLines.push(`⚠ Pending duplicate candidates found — review in AI Duplicates page.`);
      recommendations.push({ label: "Review Duplicate Candidates", route: "/admin/ai/duplicates" });
    }
  }

  if (summaryLines.length === 0) {
    summaryLines.push("No urgent AI signals found. The entity appears to be in good standing.");
  }

  recommendations.push({ label: "AI Field Suggestions", route: "/admin/ai/field-suggestions" });

  return {
    responseText: summaryLines.join("\n"),
    outputType: "explanation",
    navigationLinks: recommendations,
  };
}
