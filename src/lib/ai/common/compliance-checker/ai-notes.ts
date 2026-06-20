/**
 * ERP COMMON AI.4 — Optional AI Compliance Notes (max 20 calls per scan)
 */

import { z } from "zod";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import type { ComplianceRuleResult, LinkedDocumentForCompliance } from "./types";
import {
  COMPLIANCE_AI_MIN_CONFIDENCE,
  COMPLIANCE_MAX_AI_CALLS_PER_SCAN,
} from "./types";

const aiNoteSchema = z.object({
  notes: z.array(
    z.object({
      documentId: z.number().int().positive(),
      severity: z.enum(["info", "low", "medium", "high", "critical"]),
      reason: z.string().max(500),
      confidence: z.number().min(0).max(1),
    })
  ),
});

export async function generateComplianceAiNotes(input: {
  entityType: string;
  entityId: number;
  documents: LinkedDocumentForCompliance[];
  existingFindingTypes: string[];
  aiCallLimit: number;
  aiCallsMade: number;
}): Promise<{ results: ComplianceRuleResult[]; aiCallsMade: number }> {
  const results: ComplianceRuleResult[] = [];
  let aiCallsMade = input.aiCallsMade;
  const limit = Math.min(input.aiCallLimit, COMPLIANCE_MAX_AI_CALLS_PER_SCAN);

  if (aiCallsMade >= limit || input.existingFindingTypes.length === 0) {
    return { results, aiCallsMade };
  }

  const topDocs = input.documents
    .filter((d) => d.aiRiskLevel === "high" || d.aiRiskLevel === "critical")
    .slice(0, 5);

  if (topDocs.length === 0) return { results, aiCallsMade };

  for (const doc of topDocs) {
    if (aiCallsMade >= limit) break;

    const systemPrompt =
      "You are an ERP compliance assistant. Return JSON only: " +
      '{ "notes": [{ "documentId": number, "severity": "info"|"low"|"medium"|"high"|"critical", "reason": string, "confidence": number }] }. ' +
      "Provide brief compliance review notes. Never include OCR text, IBAN, TRN, or sensitive values.";

    const userPrompt = JSON.stringify({
      entityType: input.entityType,
      entityId: input.entityId,
      documentNo: doc.documentNo,
      typeCode: doc.typeCode,
      riskLevel: doc.aiRiskLevel,
      completenessScore: doc.completenessScore,
      existingFindings: input.existingFindingTypes.slice(0, 10),
    });

    try {
      const outcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
        maxTokens: 400,
        temperature: 0,
      });

      aiCallsMade++;

      if (!outcome.success) continue;

      let parsed: z.infer<typeof aiNoteSchema>;
      try {
        parsed = aiNoteSchema.parse(JSON.parse(outcome.rawJson));
      } catch {
        continue;
      }

      for (const note of parsed.notes) {
        if (note.documentId !== doc.id) continue;
        if (note.confidence < COMPLIANCE_AI_MIN_CONFIDENCE) continue;

        results.push({
          findingType: "ai_compliance_note",
          severity: note.severity,
          detectionMethod: "ai",
          entityType: input.entityType,
          entityId: input.entityId,
          documentId: doc.id,
          confidenceScore: note.confidence,
          aiReason: note.reason.slice(0, 500),
          recommendedAction: "Human review recommended",
        });
      }
    } catch {
      // Skip gracefully if provider not configured
    }
  }

  return { results, aiCallsMade };
}
