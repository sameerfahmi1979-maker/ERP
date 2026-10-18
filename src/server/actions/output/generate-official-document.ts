"use server";

/**
 * OUTPUT.2 — Official Document Issuance Coordinator.
 *
 * THE single entry point for generating Class A–D official documents:
 *
 *   generateOfficialDocument(outputCode, recordId, options)
 *
 * Pipeline: registry + class policy → permission/company enforcement →
 * data provider (report fetcher + redaction) → branding (versioned signed
 * assets, stamp/signature gated by reports.sign) → Executive Ledger canonical
 * HTML → Gotenberg raw-HTML render → immutable storage + exact-byte SHA-256
 * verification → issued → QR activation LAST.
 *
 * The lifecycle/orchestration rules live in src/lib/output/issuance-engine.ts
 * (unit-tested); this file wires the real ports.
 */

import { getAuthContext } from "@/lib/rbac/check";
import { getEmployeeAccess } from "@/lib/rbac/employee-access";
import { canAccessIssuedFile, issuedFileUrl } from "@/lib/output/issued-file-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAudit } from "@/server/actions/audit";
import { runReport } from "@/lib/report-center/report-runner";
import { resolveTemplateForExport } from "@/lib/report-center/template-export";
import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import type { ExportBrandingContext } from "@/lib/export/export-types";
import { issuedBrandingSnapshot } from "@/lib/branding/issuance-provenance";
import { buildPdfStoragePath, uploadGeneratedPdf } from "@/lib/pdf/storage";
import { generateVerificationToken, buildVerificationUrl, buildVerificationPath } from "@/lib/public-verification/token";
import { generateQrDataUrl } from "@/lib/public-verification/qr";
import { buildLetterExecutiveLedgerDocument } from "@/lib/output/letter-document-builder";
import { renderOfficialHtmlToPdf } from "@/lib/output/html-adapter";
import {
  getOfficialDocumentDefinition,
  isGeneratable,
  supportsLanguage,
  buildInputsSchema,
  findMissingDataError,
} from "@/lib/official-documents/registry";
import {
  renderOfficialDocumentPrintPackage,
  OFFICIAL_DOCUMENT_LAYOUT_VERSION,
} from "@/lib/official-documents/layout/render";
import type {
  OfficialDocumentDefinition,
  OfficialDocumentLanguage,
} from "@/lib/official-documents/types";
import { findUnresolvedTokens } from "@/lib/output/variable-allowlist";
import { officialWordingBlockers } from "@/lib/official-documents/catalogue";
import { attestStoredOutput, finalizeVerifiedOutput, activateVerifiedOutput } from "@/lib/output/verified-original";
import { hashFinalPdfBytes, buildRequestKey, buildContentFingerprint } from "@/lib/output/idempotency";
import {
  resolveEffectivePolicy,
  type ClassPolicyRow,
  type EffectiveOutputPolicy,
  type RegistryPolicyOverrides,
} from "@/lib/output/class-policy";
import { runIssuance, type IssuancePorts } from "@/lib/output/issuance-engine";
import { recoverDurableOutput, issuanceCommandHash } from "@/lib/output/durable-operation";
import { requirePermittedLetterhead } from "@/lib/output/letterhead-selection";
import type { ReportRegistryEntry } from "@/lib/report-center/types";
import { serialStatusOnTransition, stageTimestampColumn, type LifecycleState } from "@/lib/output/lifecycle";
import { isOutputCoordinatorEnabled, isOfficialIssuanceEnabled } from "@/lib/output/feature-flags";
import type {
  GenerateOfficialDocumentOptions,
  GenerateOfficialDocumentOutcome,
} from "@/lib/output/types";

/** "28 July 2026" — official English issue-date format. */
function formatIssueDateEn(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** "٢٨ يوليو ٢٠٢٦" — official Arabic issue-date format (Arabic-Indic digits). */
function formatIssueDateAr(d: Date): string {
  return new Intl.DateTimeFormat("ar-AE-u-nu-arab", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

type RegistryRow = RegistryPolicyOverrides & {
  id: number;
  report_code: string;
  report_name_en: string;
  module_code: string;
  report_category: string;
  required_permissions: string[];
  sensitive_profile: string;
  is_active: boolean;
};

export async function generateOfficialDocument(
  outputCode: string,
  recordId: number,
  options: GenerateOfficialDocumentOptions = {}
): Promise<GenerateOfficialDocumentOutcome> {
  try {
    if (options.supersedesIssuanceId !== undefined && (!options.authorizeReissue || !Number.isSafeInteger(options.supersedesIssuanceId) ||
        options.supersedesIssuanceId <= 0 || typeof options.reissueReason !== "string" || options.reissueReason.trim().length < 5 || options.reissueReason.trim().length > 1000)) {
      return { success: false, blocked: "validation_failed", error: "A valid predecessor and meaningful reissue reason are required." };
    }
    if (!Number.isSafeInteger(recordId) || recordId <= 0 || !/^[A-Z0-9_]{1,100}$/.test(outputCode) ||
        (options.templateId !== undefined && (!Number.isSafeInteger(options.templateId) || options.templateId <= 0)) ||
        (options.filters && Object.keys(options.filters).some(key => key !== "employee_id")) ||
        (options.filters?.employee_id !== undefined && String(options.filters.employee_id) !== String(recordId))) {
      return { success: false, blocked: "validation_failed", error: "Invalid document, employee, template or subject filters. Select the intended record again." };
    }
    if (!isOutputCoordinatorEnabled()) {
      return {
        success: false,
        blocked: "validation_failed",
        error: "The output coordinator is disabled (OUTPUT_COORDINATOR_ENABLED=false).",
      };
    }

    // ── 1. Auth ────────────────────────────────────────────────────────────
    const ctx = await getAuthContext();
    if (!ctx?.profile?.id) {
      return { success: false, blocked: "permission_denied", error: "Not authenticated." };
    }
    const employeeAccess = await getEmployeeAccess(ctx, recordId);
    if (!employeeAccess.allows("reports.pdf.generate") || !employeeAccess.allows("reports.run")) {
      return {
        success: false,
        blocked: "permission_denied",
        error: "You do not have permission to generate official documents.",
      };
    }
    const actorId = ctx.profile.id;
    if (options.clientRequestToken !== undefined && !/^[A-Za-z0-9_-]{8,200}$/.test(options.clientRequestToken)) {
      return { success: false, blocked: "validation_failed", error: "Invalid original request token." };
    }
    const commandHash = issuanceCommandHash(options);
    if (options.clientRequestToken) {
      const original = await createAdminClient().from("erp_generated_pdf_documents").select("id,source_record_id,output_code,data_snapshot_json")
        .eq("request_key", buildRequestKey({ outputCode, recordId, actorProfileId: actorId, clientToken: options.clientRequestToken })).maybeSingle();
      if (original.error) return { success: false, blocked: "reconciliation_required", error: "Original request lookup is unavailable; no new issuance was created." };
      if (original.data) {
        if (original.data.source_record_id !== recordId || original.data.output_code !== outputCode || original.data.data_snapshot_json?.operation?.commandHash !== commandHash) {
          return { success: false, blocked: "reconciliation_required", error: "This request token belongs to a different or legacy command. Reconcile its original history." };
        }
        const retained = await recoverDurableOutput(original.data.id);
        if (retained.kind !== "issued") return { success: false, blocked: "reconciliation_required", issuanceId: original.data.id, error: "error" in retained ? retained.error : "Original request requires recovery." };
        return { success: true, issuanceId: retained.issuanceId, requestKey: buildRequestKey({ outputCode, recordId, actorProfileId: actorId, clientToken: options.clientRequestToken }), lifecycleState: "issued", storagePath: retained.storagePath, fileName: retained.fileName,
          finalSha256: retained.finalSha256, fileSizeBytes: retained.fileSizeBytes, downloadUrl: employeeAccess.allows("reports.export") ? issuedFileUrl(retained.issuanceId) : null,
          qr: retained.qr, idempotentReplay: true, reissued: retained.reissued, serialNo: retained.serialNo,
          policy: original.data.data_snapshot_json.operation.policy };
      }
    }
    if (options.supersedesIssuanceId) {
      if (!(await canAccessIssuedFile(options.supersedesIssuanceId, "reports.pdf.approve")) && !(await canAccessIssuedFile(options.supersedesIssuanceId, "outputs.ops.retry"))) {
        return { success: false, blocked: "permission_denied", error: "The superseded document is unavailable or outside your approval scope." };
      }
      const prior = await createAdminClient().from("erp_generated_pdf_documents").select("source_record_type,source_record_id,output_code").eq("id",options.supersedesIssuanceId).single();
      if (prior.error || prior.data.source_record_type !== "employee" || prior.data.source_record_id !== recordId || prior.data.output_code !== outputCode) {
        return { success: false, blocked: "validation_failed", error: "A reissue must refer to the same employee and output type." };
      }
    }

    // ── 2. Registry + class policy ─────────────────────────────────────────
    const db = createAdminClient();
    const { data: registry } = await db
      .from("erp_report_registry")
      .select("*")
      .eq("report_code", outputCode)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle<RegistryRow>();
    if (!registry) {
      return {
        success: false,
        blocked: "not_registered",
        error: `Output '${outputCode}' is not registered in the global output registry.`,
      };
    }
    if (!registry.document_class) {
      return {
        success: false,
        blocked: "not_registered",
        error: `Output '${outputCode}' has no document class assigned — onboard it before official issuance.`,
      };
    }

    const missingPerms = registry.required_permissions.filter((p) => !employeeAccess.allows(p));
    if (missingPerms.length > 0) {
      return {
        success: false,
        blocked: "permission_denied",
        error: `Missing permissions: ${missingPerms.join(", ")}`,
      };
    }

    const { data: classRow } = await db
      .from("erp_output_class_policies")
      .select("*")
      .eq("document_class", registry.document_class)
      .single<ClassPolicyRow>();
    if (!classRow) {
      return {
        success: false,
        blocked: "validation_failed",
        error: `No class policy found for document class '${registry.document_class}'.`,
      };
    }
    const policy: EffectiveOutputPolicy = resolveEffectivePolicy(registry, classRow);

    if (policy.official && !isOfficialIssuanceEnabled()) {
      return {
        success: false,
        blocked: "validation_failed",
        error:
          "Official issuance is not yet activated (OUTPUT_OFFICIAL_ISSUANCE_ENABLED=false). It unlocks after OUTPUT.5 UAT.",
      };
    }

    // ── 2b. Fixed code-based definition (OFFICIAL DOCS.1) ──────────────────
    // When a catalog definition exists for this output, it is the ONLY
    // allowed body source: wording governance, language support, and optional
    // inputs are all enforced here — before any data is fetched.
    const definition = getOfficialDocumentDefinition(outputCode);
    const language: OfficialDocumentLanguage = options.language ?? "en";
    let parsedInputs: Record<string, string> = {};

    if (!definition && policy.official) {
      return { success: false, blocked: "validation_failed", error: "This official output has no approved fixed definition. It remains unavailable pending catalogue review." };
    }

    if (definition) {
      if (!isGeneratable(definition)) {
        return {
          success: false,
          blocked: "validation_failed",
          error:
            `'${registry.report_name_en}' — Pending Business Wording Approval. ` +
            `Official wording for this document has not been reviewed and approved yet ` +
            `(definition status: ${definition.status}). ` +
            `Generation remains blocked until explicit approved wording is provided by the business owner.`,
        };
      }
      if (!supportsLanguage(definition, language)) {
        return {
          success: false,
          blocked: "validation_failed",
          error:
            `'${registry.report_name_en}' supports: ${definition.supportedLanguages.join(", ")} — ` +
            `'${language}' was requested.`,
        };
      }
      const parsed = buildInputsSchema(definition).safeParse(options.inputs ?? {});
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        return {
          success: false,
          blocked: "validation_failed",
          error: `Invalid input${first?.path?.length ? ` '${first.path.join(".")}'` : ""}: ${first?.message ?? "validation failed"}`,
        };
      }
      parsedInputs = parsed.data as Record<string, string>;
      if (policy.official) {
        const blockers = officialWordingBlockers(definition, language);
        if (blockers.length) return { success: false, blocked: "validation_failed", error: blockers.join("\n") };
      }
    }

    // ── 3. Approval policy ─────────────────────────────────────────────────
    if (policy.approvalRequired && !employeeAccess.allows("reports.pdf.approve")) {
      return {
        success: false,
        blocked: "approval_required",
        error:
          `'${registry.report_name_en}' is a Class ${policy.documentClass} document that requires an approver ` +
          "(reports.pdf.approve) to issue.",
      };
    }

    await requirePermittedLetterhead({ selectedTemplateId: options.templateId,
      ownerCompanyId: employeeAccess.subject.owner_company_id,
      canOverride: employeeAccess.allows("reports.branding.override"),
      registry: registry as unknown as ReportRegistryEntry, principal: ctx });

    // ── 4. Data provider (report engine: permissions, redaction, branding) ──
    const runResult = await runReport(
      {
        reportCode: outputCode,
        outputFormat: "pdf",
        filters: { ...(options.filters ?? {}), employee_id: String(recordId) },
        templateId: options.templateId,
        ownerCompanyIds: [employeeAccess.subject.owner_company_id],
        requestedByUserId: actorId,
      },
      ctx
    );
    if (!runResult.success || !runResult.data) {
      return {
        success: false,
        blocked: "validation_failed",
        error: runResult.error ?? "Data provider failed.",
      };
    }
    const row = runResult.data.rows[0];
    if (!row) {
      return { success: false, blocked: "validation_failed", error: "No data returned for this record." };
    }
    // Every returned row must bind to the selected subject, including multi-row
    // forms. A matching company alone cannot prove employee identity.
    if (Number(runResult.data.meta?.sourceRecordId) !== recordId ||
        runResult.data.rows.some((item) => Number(item.owner_company_id) !== employeeAccess.subject.owner_company_id)) {
      return { success: false, blocked: "validation_failed", error: "Report data does not match the selected employee. No document was issued." };
    }

    // Precise, user-facing missing-data errors (definition-driven).
    if (definition) {
      const missingDataError = findMissingDataError(definition, row);
      if (missingDataError) {
        return { success: false, blocked: "validation_failed", error: missingDataError };
      }
    }

    // ── 5. Company isolation ───────────────────────────────────────────────
    const ownerCompanyId = Number(row.owner_company_id ?? 0);
    if (!ownerCompanyId) {
      return {
        success: false,
        blocked: "company_isolation_violation",
        error: "Record has no owning company — cannot resolve branding safely.",
      };
    }
    if (ownerCompanyId !== employeeAccess.subject.owner_company_id) {
      return { success: false, blocked: "company_isolation_violation", error: "Report data does not match the authorized employee's company." };
    }

    // ── 6. Branding (versioned signed assets; stamp/signature need reports.sign)
    // Overriding the record's default template/letterhead requires the
    // dedicated audited permission (Section 10.2, seeded in OFFICIAL DOCS.1).
    const resolvedTemplateId = options.templateId ?? runResult.resolvedTemplateId ?? null;
    if (policy.official && !resolvedTemplateId) {
      return { success: false, blocked: "validation_failed", error: "Choose an available governed company letterhead before issuing this document." };
    }
    let branding: ExportBrandingContext | undefined;
    if (resolvedTemplateId) {
      // Cross-company template substitution guard: template branding must
      // belong to the record's company (or be group/neutral).
      const { data: tpl } = await db
        .from("erp_report_templates")
        .select("id, branding_profile:erp_report_branding_profiles(owner_company_id, is_group_profile, is_neutral_profile)")
        .eq("id", resolvedTemplateId)
        .is("deleted_at", null)
        .maybeSingle();
      const bp = (tpl as { branding_profile?: { owner_company_id: number | null; is_group_profile: boolean; is_neutral_profile: boolean } } | null)?.branding_profile;
      if (bp && bp.owner_company_id !== null && !bp.is_group_profile && !bp.is_neutral_profile && bp.owner_company_id !== ownerCompanyId) {
        return {
          success: false,
          blocked: "company_isolation_violation",
          error: "Selected template belongs to a different company's branding.",
        };
      }
      branding =
        (await resolveTemplateForExport({
          templateId: resolvedTemplateId,
          reportCode: outputCode,
          principalId: ctx.profile.id,
          forIssuance: true,
        })) ?? undefined;
      if (!branding?.provenance) {
        return { success: false, blocked: "validation_failed", error: "The selected branding is unavailable, changed, or requires version reconciliation. Refresh its selection before issuing." };
      }
    }

    // ── 7. Fingerprint + request key ───────────────────────────────────────
    // Language and validated inputs are part of the content identity: the
    // same record in a different language (or with a different NOC purpose)
    // is a different document, not a duplicate.
    // Multi-row forms must retain every row, not only their first employee row.
    // Language/inputs also remain explicit for governed non-catalogue outputs.
    const dataSnapshot: Record<string, unknown> = {
      columns: runResult.data.columns, row, rows: runResult.data.rows,
      language, inputs: parsedInputs,
      ...(definition ? { definition_version: definition.version, layout_version: OFFICIAL_DOCUMENT_LAYOUT_VERSION } : {}),
      operation: { commandHash, issueQr: options.issueQr ?? false, title: registry.report_name_en, policy },
    };
    // A governed branding change is a new content identity. Replaying an old
    // request still returns its stored issuance; this never rewrites history.
    if (branding) dataSnapshot.branding = issuedBrandingSnapshot(branding);
    if (options.supersedesIssuanceId) dataSnapshot.reissue_reason = options.reissueReason!.trim();
    const requestKey = buildRequestKey({
      outputCode,
      recordId,
      actorProfileId: actorId,
      clientToken: options.clientRequestToken,
    });
    const contentFingerprint = buildContentFingerprint({
      outputCode,
      recordId,
      templateId: resolvedTemplateId ?? null,
      templateVersion: definition?.version ?? branding?.provenance?.templateVersion ?? 1,
      dataSnapshot,
    });

    // ── 8. Storage identity ────────────────────────────────────────────────
    const outputLabel = `${registry.report_name_en.replace(/[^A-Za-z0-9]+/g, "_")}_${row.employee_code ?? recordId}`;
    const storagePath = buildPdfStoragePath({
      module: registry.module_code.toLowerCase(),
      sourceRecordType: "employee",
      ownerCompanyId,
      sourceRecordId: recordId,
      templateKey: outputCode.toLowerCase(),
      outputLabel,
    });
    const fileName = `${outputLabel}.pdf`;

    // ── 9. Wire real ports and run the engine ──────────────────────────────
    const ports = buildRealPorts({
      db,
      actorId,
      registry,
      policy,
      ownerCompanyId,
      recordId,
      row,
      rows: runResult.data.rows,
      columns: runResult.data.columns,
      branding,
      resolvedTemplateId: resolvedTemplateId ?? null,
      dataSnapshot,
      storagePath,
      fileName,
      definition,
      language,
      inputs: parsedInputs,
    });

    const outcome = await runIssuance(
      {
        requestKey,
        contentFingerprint,
        outputCode,
        policy,
        storagePath,
        fileName,
        issueQr: options.issueQr ?? false,
        authorizeReissue: options.authorizeReissue ?? false,
        supersedesIssuanceId: options.supersedesIssuanceId,
      },
      ports
    );

    // ── 10. Map outcome ────────────────────────────────────────────────────
    if (outcome.kind === "duplicate_content_warning") {
      return {
        success: false,
        blocked: "duplicate_content_warning",
        error:
          "An identical document has already been issued for this record. " +
          "Authorize a separate copy, or use the explicit reissue action to replace the original.",
        existingIssuanceId: outcome.existingIssuanceId,
      };
    }
    if (outcome.kind === "failed_retryable") {
      return { success: false, blocked: "render_failed_retryable", error: outcome.error, issuanceId: outcome.issuanceId };
    }
    if (outcome.kind === "failed_terminal") {
      return { success: false, blocked: "render_failed_terminal", error: outcome.error, issuanceId: outcome.issuanceId };
    }
    if (outcome.kind === "reconciliation_required") {
      return { success: false, blocked: "reconciliation_required", error: outcome.error, issuanceId: outcome.issuanceId };
    }

    const downloadUrl = employeeAccess.allows("reports.export") ? issuedFileUrl(outcome.issuanceId) : null;

    return {
      success: true,
      issuanceId: outcome.issuanceId,
      requestKey,
      lifecycleState: "issued",
      storagePath: outcome.storagePath,
      fileName: outcome.fileName,
      finalSha256: outcome.finalSha256,
      fileSizeBytes: outcome.fileSizeBytes,
      downloadUrl,
      qr: outcome.qr,
      idempotentReplay: outcome.idempotentReplay,
      reissued: outcome.reissued,
      serialNo: outcome.serialNo,
      policy,
    };
  } catch (err) {
    logger.error("[output-coordinator] generateOfficialDocument error", err);
    return {
      success: false,
      blocked: "reconciliation_required",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Real ports
// ─────────────────────────────────────────────────────────────────────────────

function buildRealPorts(deps: {
  db: ReturnType<typeof createAdminClient>;
  actorId: number;
  registry: RegistryRow;
  policy: EffectiveOutputPolicy;
  ownerCompanyId: number;
  recordId: number;
  row: Record<string, unknown>;
  rows: Record<string, unknown>[];
  columns: string[];
  branding: ExportBrandingContext | undefined;
  resolvedTemplateId: number | null;
  dataSnapshot: Record<string, unknown>;
  storagePath: string;
  fileName: string;
  /** Fixed code-based definition (OFFICIAL DOCS.1) — null for legacy outputs. */
  definition: OfficialDocumentDefinition | null;
  language: OfficialDocumentLanguage;
  inputs: Record<string, string>;
}): IssuancePorts {
  const { db } = deps;

  // OUTPUT.4 — once a serial is reserved, every lifecycle transition must
  // finalize or void it (never recycle). Tracked per issuance run.
  let hasSerial = false;
  let reservedSerialNo: string | null = null;
  let currentIssuanceId: number | null = null;
  let renderedOriginal: { sha256: string; rendererVersion: string } | null = null;

  async function transition(
    issuanceId: number,
    from: LifecycleState,
    to: LifecycleState,
    extra?: Record<string, unknown>
  ): Promise<void> {
    if (to === "issued") {
      if (typeof extra?.checksum !== "string") throw new Error("Verified final checksum is required.");
      await finalizeVerifiedOutput(issuanceId, extra.checksum);
      return;
    }
    const update: Record<string, unknown> = { lifecycle_state: to, ...(extra ?? {}) };
    const tsCol = stageTimestampColumn(to);
    if (tsCol) update[tsCol] = new Date().toISOString();
    const serialStatus = serialStatusOnTransition(to, hasSerial);
    if (serialStatus) update.serial_status = serialStatus;
    if (serialStatus === "voided") {
      update.serial_void_reason = (extra?.failure_reason as string) ?? `Lifecycle moved to ${to}`;
    }
    const { data, error } = await db
      .from("erp_generated_pdf_documents")
      .update(update)
      .eq("id", issuanceId)
      .eq("lifecycle_state", from).select("id");
    if (error || data?.length !== 1) throw new Error(`Lifecycle transition ${from}→${to} was not confirmed. Refresh/reconcile the original request.`);
  }

  return {
    runManaged: recoverDurableOutput,
    async findByRequestKey(requestKey) {
      const { data, error } = await db
        .from("erp_generated_pdf_documents")
        .select("id, lifecycle_state, storage_path, file_name, checksum, file_size_bytes, serial_no, revoked_at, archived_at, superseded_by_id, expires_at")
        .eq("request_key", requestKey)
        .maybeSingle();
      if (error) throw new Error("Prior issuance could not be verified. Retry the original request after recovery.");
      if (!data) return null;
      const link = await db.from("erp_output_public_links").select("id,public_token,status")
        .eq("generated_pdf_document_id", data.id).is("deleted_at", null).order("id", { ascending: false }).limit(1).maybeSingle();
      if (link.error) throw new Error("Retained verification state could not be confirmed. Retry the original request after recovery.");
      const qr: import("@/lib/output/types").QrOutcome = link.data?.status === "valid"
        ? { status: "activated", publicUrl: buildVerificationUrl(link.data.public_token), linkId: link.data.id }
        : link.data ? { status: "activation_failed_retryable", error: "Retained verification is not active. Review its status before retrying activation." }
          : { status: "not_requested" };
      return { ...data, qr };
    },

    async findIssuedWithFingerprint(contentFingerprint) {
      const { data, error } = await db
        .from("erp_generated_pdf_documents")
        .select("id")
        .eq("content_fingerprint", contentFingerprint)
        .eq("lifecycle_state", "issued")
        .is("revoked_at", null)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("Existing document identity could not be verified.");
      return (data as { id: number } | null) ?? null;
    },

    async insertIssuance(rowInput) {
      const { data, error } = await db
        .from("erp_generated_pdf_documents")
        .insert({
          template_key: rowInput.outputCode.toLowerCase(),
          template_id: deps.resolvedTemplateId,
          source_record_type: "employee",
          source_record_id: deps.recordId,
          owner_company_id: deps.ownerCompanyId,
          storage_path: rowInput.storagePath,
          file_name: rowInput.fileName,
          mime_type: "application/pdf",
          checksum: "pending",
          renderer: "gotenberg_html",
          output_profile: "standard",
          locale: deps.language === "bilingual" ? "en-ar" : deps.language,
          direction: deps.language === "ar" ? "rtl" : deps.language === "bilingual" ? "auto" : "ltr",
          // Fixed documents retain their code definition version. Legacy
          // governed outputs retain the selected template's actual version;
          // untemplated legacy output uses the existing database default v1.
          template_version: deps.definition?.version ?? deps.branding?.provenance?.templateVersion ?? 1,
          generated_by: deps.actorId,
          document_class: rowInput.documentClass,
          output_code: rowInput.outputCode,
          lifecycle_state: "pending",
          request_key: rowInput.requestKey,
          content_fingerprint: rowInput.contentFingerprint,
          supersedes_issuance_id: rowInput.supersedesIssuanceId,
          data_snapshot_json: deps.dataSnapshot,
          policy_snapshot_json: deps.policy as unknown as Record<string, unknown>,
          branding_snapshot_json: issuedBrandingSnapshot(deps.branding),
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Issuance insert failed: ${error?.message ?? "no data"}`);
      currentIssuanceId = data.id as number;
      return { id: data.id as number };
    },

    transition,

    async reserveSerial({ issuanceId }) {
      // Deterministic, unique, never-recycled serial:
      //   {OUTPUT_CODE}-{COMPANY}-{YEAR}-{issuance id, zero-padded}
      // Gaps are expected and honest — voided serials are never reused.
      const year = new Date().getUTCFullYear();
      const serialNo = `${deps.registry.report_code}-C${deps.ownerCompanyId}-${year}-${String(issuanceId).padStart(6, "0")}`;
      const { data, error } = await db
        .from("erp_generated_pdf_documents")
        .update({ serial_no: serialNo, serial_status: "reserved" })
        .eq("id", issuanceId)
        .is("serial_no", null).eq("lifecycle_state", "pending").select("id");
      if (error || data?.length !== 1) throw new Error("Serial reservation was not confirmed. Reconcile the original request.");
      hasSerial = true;
      reservedSerialNo = serialNo;
      return { serialNo };
    },

    async createPendingPublicLink({ issuanceId, expiresAt }) {
      const token = generateVerificationToken();
      const publicUrl = buildVerificationUrl(token);
      const { data, error } = await db
        .from("erp_output_public_links")
        .insert({
          public_token: token,
          public_url_path: buildVerificationPath(token),
          output_type: deps.registry.report_category === "certificate" ? "certificate" : "letter",
          source_module: deps.registry.module_code,
          source_entity_type: "employee",
          source_entity_id: deps.recordId,
          source_record_ref: String(deps.row.employee_code ?? deps.recordId),
          document_title: deps.registry.report_name_en,
          document_ref: deps.fileName,
          document_date: new Date().toISOString().slice(0, 10),
          owner_company_id: deps.ownerCompanyId,
          template_id: deps.resolvedTemplateId,
          issued_by_user_profile_id: deps.actorId,
          issued_at: new Date().toISOString(),
          expires_at: expiresAt ? expiresAt.toISOString() : null,
          status: "pending_activation",
          access_level: deps.policy.publicDisclosure === "download" ? "full_view_download_ready" : "summary",
          verification_summary_json: {
            document_title: deps.registry.report_name_en,
            document_ref: reservedSerialNo ?? deps.fileName,
            issuing_company: deps.branding?.companyNameEn ?? String(deps.row.company_name ?? ""),
          },
          public_payload_json: {},
          download_enabled: deps.policy.publicDisclosure === "download",
          generated_pdf_document_id: issuanceId,
          created_by: deps.actorId,
          updated_by: deps.actorId,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Public link creation failed: ${error?.message ?? "no data"}`);
      const qrDataUrl = await generateQrDataUrl(publicUrl);
      return { linkId: data.id as number, publicUrl, qrDataUrl };
    },

    async render(qrCtx) {
      let html: string;
      let printFrame: ReturnType<typeof renderOfficialDocumentPrintPackage> | undefined;
      if (deps.definition) {
        // Fixed code-based template (OFFICIAL DOCS.1) — the ONLY body source
        // for catalog documents. Deterministic build from server data only.
        const now = new Date();
        printFrame = renderOfficialDocumentPrintPackage(deps.definition, {
          row: deps.row,
          rows: deps.rows,
          inputs: deps.inputs,
          language: deps.language,
          branding: deps.branding,
          verification:
            qrCtx.qr && qrCtx.qr.qrDataUrl
              ? { publicUrl: qrCtx.qr.publicUrl, qrDataUrl: qrCtx.qr.qrDataUrl }
              : undefined,
          serialNo: reservedSerialNo,
          issuedDateEn: formatIssueDateEn(now),
          issuedDateAr: formatIssueDateAr(now),
          // watermarkText intentionally never set on official issuance
        });
        html = printFrame.html;
      } else {
        const document = buildLetterExecutiveLedgerDocument({
          columns: deps.columns.filter((c) => c !== "owner_company_id"),
          row: deps.row,
          documentTitle: deps.registry.report_name_en,
          branding: deps.branding,
          verification: qrCtx.qr
            ? { publicUrl: qrCtx.qr.publicUrl, qrDataUrl: qrCtx.qr.qrDataUrl, label: "Scan to verify" }
            : undefined,
          documentRef: reservedSerialNo ?? deps.fileName,
        });
        html = renderExecutiveLedgerHtml(document);
      }

      // Official gate: zero unresolved template tokens allowed in final HTML.
      const leftover = findUnresolvedTokens(html);
      if (leftover.length > 0) {
        const err = new Error(`Unresolved template variables in final HTML: ${leftover.join(", ")}`);
        (err as Error & { retryable: boolean }).retryable = false;
        throw err;
      }

      const rendered = await renderOfficialHtmlToPdf({
        html,
        // Official-documents HTML is margin-free; engine margins repeat on
        // every page. Executive Ledger HTML keeps zero engine margins.
        marginsMm: printFrame?.marginsMm,
        headerHtml: printFrame?.headerHtml,
        footerHtml: printFrame?.footerHtml,
      });
      const rendererVersion = printFrame ? `official-layout@${OFFICIAL_DOCUMENT_LAYOUT_VERSION}/${rendered.rendererVersion}` : rendered.rendererVersion;
      renderedOriginal = { sha256: hashFinalPdfBytes(rendered.buffer), rendererVersion };
      return { buffer: rendered.buffer, rendererVersion };
    },

    async upload(storagePath, buffer) {
      await uploadGeneratedPdf(buffer, storagePath);
    },

    async downloadStored(storagePath) {
      if (!currentIssuanceId || !renderedOriginal || storagePath !== deps.storagePath) throw new Error("Retained rendering identity is unavailable.");
      return attestStoredOutput({ issuanceId: currentIssuanceId, expectedSha256: renderedOriginal.sha256, rendererVersion: renderedOriginal.rendererVersion });
    },

    async activatePublicLink({ linkId }) {
      await activateVerifiedOutput(linkId);
    },

    async audit(event, payload) {
      await logAudit({
        module_code: deps.registry.module_code,
        entity_name: "erp_generated_pdf_documents",
        entity_id: (payload.issuance_id as number) ?? 0,
        entity_reference: `${deps.registry.report_code}/${deps.recordId}`,
        action: event === "output_issued" ? "create" : "update",
        new_values: { event, ...payload },
      }).catch(() => {/* audit failures are non-fatal */});
    },
  };
}
