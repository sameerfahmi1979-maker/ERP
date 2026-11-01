import type { DmsAiOutput } from "@/lib/dms/ai/types";
import { readablePreparationTitle } from "./candidates";
import type { PreparationSnapshot } from "./contracts";

/** Reuses the actual combined response. No second routine model call and no entity inference. */
export function prepareIntakeOutput(output: DmsAiOutput, options: {
  typeCode: string | null; typeName: string | null; originalName: string;
  verifiedSubject: PreparationSnapshot["subject"]; sourceHash: string;
}) {
  const portrait = ["EMPLOYEE_PHOTO", "DEPENDENT_PHOTO"].includes(options.typeCode ?? "");
  return {
    version: 1 as const, state: "review_required" as const, sourceHash: options.sourceHash, typeCode: options.typeCode,
    title: readablePreparationTitle(options.typeName, options.verifiedSubject, output.extraction.suggestedTitle, options.originalName, portrait),
    summary: portrait ? null : output.preparation?.summary ?? null,
    tagNames: output.preparation?.tagNames ?? [],
    metadata: portrait ? [] : output.extraction.fields,
    links: "verified_context_only" as const,
    reminders: portrait ? "not_applicable" as const : "pending_accepted_expiry" as const,
    semantic: portrait ? "not_applicable" as const : "pending_accepted_review" as const,
    bundle: output.preparation?.bundle ?? "unknown",
    split: output.preparation?.bundle === "single" ? "not_requested" as const : "held_unverified_boundaries" as const,
    completeness: "requires_registered_field_review" as const,
  };
}
