import "server-only";
import { resolveReportBranding } from "@/lib/report-center/branding-resolver";
import type { AuthContext } from "@/lib/rbac/check";
import type { ReportRegistryEntry } from "@/lib/report-center/types";

/** Compare with the actual subject-company default, never with a resolver result
 * that already incorporates the caller's selected override. Failures propagate;
 * an unavailable default is not an ordinary permission denial. */
export async function requirePermittedLetterhead(input: {
  selectedTemplateId?: number; ownerCompanyId: number; canOverride: boolean;
  registry: ReportRegistryEntry; principal: AuthContext;
}) {
  if (input.selectedTemplateId === undefined || input.canOverride) return;
  const resolved = await resolveReportBranding({ ownerCompanyIds: [input.ownerCompanyId],
    registryEntry: input.registry, isLetterType: input.registry.is_letter_type }, input.principal);
  if (resolved.requiresManualTemplateSelection || resolved.resolvedTemplate?.id !== input.selectedTemplateId) {
    throw Error("Selecting a different company letterhead requires the letterhead-selection permission.");
  }
}
