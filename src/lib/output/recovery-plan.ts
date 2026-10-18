import "server-only";
import { z } from "zod";
import { getAuthContext } from "@/lib/rbac/check";
import { resolveTemplateForExport } from "@/lib/report-center/template-export";
import { issuedBrandingSnapshot } from "@/lib/branding/issuance-provenance";
import { getOfficialDocumentDefinition, isGeneratable } from "@/lib/official-documents/registry";
import { officialWordingBlockers } from "@/lib/official-documents/catalogue";
import { renderOfficialDocumentPrintPackage, OFFICIAL_DOCUMENT_LAYOUT_VERSION } from "@/lib/official-documents/layout/render";
import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import { buildLetterExecutiveLedgerDocument } from "./letter-document-builder";
import { isOfficialIssuanceEnabled } from "./feature-flags";
import type { EffectiveOutputPolicy } from "./class-policy";
export const renderPlanSchema = z.object({ html: z.string().min(1).max(16777216), headerHtml: z.string().max(1000000).optional(), footerHtml: z.string().max(1000000).optional(), marginsMm: z.object({ top: z.number().min(0).max(50), bottom: z.number().min(0).max(50), left: z.number().min(0).max(50), right: z.number().min(0).max(50) }).optional(), layoutVersion: z.number().int().nonnegative() }).strict();
export type RecoveryRenderPlan = z.infer<typeof renderPlanSchema>;
export interface RecoveryDocument {
  id: number; lifecycle_state: string; storage_path: string; file_name: string; checksum: string; file_size_bytes: number | null;
  serial_no: string | null; output_code: string; source_record_id: number; template_id: number | null; generated_at: string;
  supersedes_issuance_id: number | null;
  data_snapshot_json: Record<string, unknown>; branding_snapshot_json: unknown; policy_snapshot_json: EffectiveOutputPolicy;
}
/** Recheck readiness even when resuming cached bytes. No current business data
 * is fetched and no pending wording/feature gate is bypassed by recovery. */
export function assertRecoveryReady(doc: RecoveryDocument) {
  const definition = getOfficialDocumentDefinition(doc.output_code);
  if (doc.policy_snapshot_json.official && !isOfficialIssuanceEnabled()) throw Error("Official issuance is not enabled.");
  if (definition) {
    const language = z.enum(["en", "ar", "bilingual"]).parse(doc.data_snapshot_json.language);
    if (!isGeneratable(definition) || !definition.supportedLanguages.includes(language) || officialWordingBlockers(definition, language).length ||
        doc.data_snapshot_json.definition_version !== definition.version || doc.data_snapshot_json.layout_version !== OFFICIAL_DOCUMENT_LAYOUT_VERSION) {
      throw Error("The original definition requires approved wording/version reconciliation before recovery.");
    }
  }
}
export async function buildRetainedRenderPlan(doc: RecoveryDocument, verification?: { publicUrl: string; qrDataUrl: string }) : Promise<RecoveryRenderPlan> {
  assertRecoveryReady(doc);
  const snapshot = doc.data_snapshot_json;
  const row = z.record(z.string(), z.unknown()).parse(snapshot.row);
  const rows = z.array(z.record(z.string(), z.unknown())).parse(snapshot.rows);
  const columns = z.array(z.string()).parse(snapshot.columns);
  const language = z.enum(["en", "ar", "bilingual"]).parse(snapshot.language);
  const inputs = z.record(z.string(), z.string()).parse(snapshot.inputs);
  const operation = z.object({ title: z.string() }).passthrough().parse(snapshot.operation);
  let branding;
  if (doc.branding_snapshot_json) {
    if (!doc.template_id) throw Error("Original branding identity is incomplete.");
    const ctx = await getAuthContext();
    branding = await resolveTemplateForExport({ templateId: doc.template_id, reportCode: doc.output_code, principalId: ctx.profile!.id, forIssuance: true }) ?? undefined;
    if (!branding || JSON.stringify(issuedBrandingSnapshot(branding)) !== JSON.stringify(doc.branding_snapshot_json)) throw Error("Original branding revision is unavailable. No newer brand was substituted.");
  }
  const definition = getOfficialDocumentDefinition(doc.output_code);
  const date = new Date(doc.generated_at);
  const plan = definition ? { ...renderOfficialDocumentPrintPackage(definition, { row, rows, inputs, language, branding, verification,
    serialNo: doc.serial_no, issuedDateEn: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(date),
    issuedDateAr: new Intl.DateTimeFormat("ar-AE-u-nu-arab", { day: "numeric", month: "long", year: "numeric" }).format(date) }), layoutVersion: OFFICIAL_DOCUMENT_LAYOUT_VERSION }
    : { html: renderExecutiveLedgerHtml(buildLetterExecutiveLedgerDocument({ columns: columns.filter(c => c !== "owner_company_id"), row,
      documentTitle: operation.title, branding, verification, documentRef: doc.serial_no ?? doc.file_name })), layoutVersion: 0 };
  const accepted = renderPlanSchema.parse(plan);
  if ([accepted.html,accepted.headerHtml,accepted.footerHtml].some(part => /(?:src\s*=\s*["']https?:|url\(\s*["']?https?:|@import|<script\b)/i.test(part ?? ""))) throw Error("Durable render input must embed its verified resources; external fetches are not retained.");
  return accepted;
}
