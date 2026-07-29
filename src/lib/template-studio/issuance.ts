/**
 * OUTPUT.3B — Generation-time gate for Studio-backed templates (pure).
 *
 * The issuance coordinator (OUTPUT.4 onboarding) calls this instead of trusting
 * the stored body: the schema is re-parsed and re-validated at generation time,
 * variables are substituted with REAL resolved values, and the final HTML must
 * contain ZERO unresolved tokens. Any failure refuses generation — templates
 * are never "best-effort" rendered.
 */

import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import { findUnresolvedTokens } from "@/lib/output/variable-allowlist";
import type { ExecutiveLedgerDocument } from "@/lib/executive-ledger/types";
import type { ExportBrandingContext } from "@/lib/export/export-types";
import { parseStudioBodySchema } from "./schema";
import { validateStudioBody } from "./validate";
import { buildStudioExecutiveLedgerDocument } from "./schema-to-el";
import { getStudioVariableAllowlist } from "./allowlists";

export interface BuildIssuableStudioHtmlInput {
  /** Raw body_schema_json from erp_report_templates. */
  bodySchemaJson: unknown;
  /** REAL resolved variable values (path → display string). */
  bindingValues: Record<string, string>;
  documentTitle: string;
  documentRef?: string;
  outputCode?: string | null;
  branding?: ExportBrandingContext;
  verification?: ExecutiveLedgerDocument["verification"];
  repeatData?: Record<string, string[][]>;
}

export type BuildIssuableStudioHtmlResult =
  | { ok: true; html: string; variables: string[] }
  | { ok: false; stage: "schema" | "validation" | "unresolved_tokens"; errors: string[] };

export function buildIssuableStudioHtml(
  input: BuildIssuableStudioHtmlInput
): BuildIssuableStudioHtmlResult {
  const parsed = parseStudioBodySchema(input.bodySchemaJson);
  if (!parsed.ok) {
    return { ok: false, stage: "schema", errors: parsed.errors };
  }

  const allowlist = input.outputCode ? getStudioVariableAllowlist(input.outputCode) : null;
  const validation = validateStudioBody(parsed.schema, { outputAllowlist: allowlist });
  if (!validation.ok) {
    return { ok: false, stage: "validation", errors: validation.errors };
  }

  const doc = buildStudioExecutiveLedgerDocument({
    schema: parsed.schema,
    bindingValues: input.bindingValues,
    documentTitle: input.documentTitle,
    documentRef: input.documentRef,
    branding: input.branding,
    verification: input.verification,
    repeatData: input.repeatData,
  });
  const html = renderExecutiveLedgerHtml(doc);

  const leftover = findUnresolvedTokens(html);
  if (leftover.length > 0) {
    return {
      ok: false,
      stage: "unresolved_tokens",
      errors: leftover.map((t) => `Variable '${t}' was not resolved with a real value.`),
    };
  }

  return { ok: true, html, variables: validation.variables };
}
