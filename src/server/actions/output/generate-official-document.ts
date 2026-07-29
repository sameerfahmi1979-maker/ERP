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

import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAudit } from "@/server/actions/audit";
import { runReport } from "@/lib/report-center/report-runner";
import { resolveTemplateForExport } from "@/server/actions/reports/templates";
import { renderExecutiveLedgerHtml } from "@/lib/executive-ledger/html-renderer";
import type { ExportBrandingContext } from "@/lib/export/export-types";
import { buildPdfStoragePath, uploadGeneratedPdf, createPdfSignedUrl } from "@/lib/pdf/storage";
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
  renderOfficialDocumentHtml,
  OFFICIAL_DOCUMENT_PAGE_MARGINS_MM,
} from "@/lib/official-documents/layout/render";
import type {
  OfficialDocumentDefinition,
  OfficialDocumentLanguage,
} from "@/lib/official-documents/types";
import { findUnresolvedTokens } from "@/lib/output/variable-allowlist";
import { buildRequestKey, buildContentFingerprint } from "@/lib/output/idempotency";
import {
  resolveEffectivePolicy,
  type ClassPolicyRow,
  type EffectiveOutputPolicy,
  type RegistryPolicyOverrides,
} from "@/lib/output/class-policy";
import { runIssuance, type IssuancePorts } from "@/lib/output/issuance-engine";
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
    if (!hasPermission(ctx, "reports.pdf.generate") && !hasPermission(ctx, "reports.run")) {
      return {
        success: false,
        blocked: "permission_denied",
        error: "You do not have permission to generate official documents.",
      };
    }
    const actorId = ctx.profile.id;

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

    const missingPerms = registry.required_permissions.filter((p) => !ctx.permissionCodes.includes(p));
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
    }

    // ── 3. Approval policy ─────────────────────────────────────────────────
    if (policy.approvalRequired && !hasPermission(ctx, "reports.pdf.approve")) {
      return {
        success: false,
        blocked: "approval_required",
        error:
          `'${registry.report_name_en}' is a Class ${policy.documentClass} document that requires an approver ` +
          "(reports.pdf.approve) to issue.",
      };
    }

    // ── 4. Data provider (report engine: permissions, redaction, branding) ──
    const runResult = await runReport(
      {
        reportCode: outputCode,
        outputFormat: "pdf",
        filters: { employee_id: String(recordId), ...(options.filters ?? {}) },
        templateId: options.templateId,
        requestedByUserId: actorId,
      },
      ctx.permissionCodes
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
    const isGlobalAdmin =
      ctx.roleCodes.includes("system_admin") || ctx.roleCodes.includes("group_admin");
    if (!isGlobalAdmin) {
      const { data: userRoles } = await db
        .from("user_roles")
        .select("owner_company_id")
        .eq("user_id", actorId)
        .not("owner_company_id", "is", null);
      const companyIds = (userRoles ?? [])
        .map((r: { owner_company_id: number | null }) => r.owner_company_id)
        .filter((id): id is number => id !== null);
      if (!companyIds.includes(ownerCompanyId)) {
        return {
          success: false,
          blocked: "company_isolation_violation",
          error: "You do not have access to this record's company.",
        };
      }
    }

    // ── 6. Branding (versioned signed assets; stamp/signature need reports.sign)
    // Overriding the record's default template/letterhead requires the
    // dedicated audited permission (Section 10.2, seeded in OFFICIAL DOCS.1).
    if (
      definition &&
      options.templateId &&
      runResult.resolvedTemplateId &&
      options.templateId !== runResult.resolvedTemplateId &&
      !hasPermission(ctx, "reports.branding.override")
    ) {
      return {
        success: false,
        blocked: "permission_denied",
        error:
          "Selecting a non-default letterhead/branding profile requires the " +
          "'reports.branding.override' permission.",
      };
    }
    const resolvedTemplateId = options.templateId ?? runResult.resolvedTemplateId ?? null;
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
          permissionCodes: ctx.permissionCodes,
        })) ?? undefined;
    }

    // ── 7. Fingerprint + request key ───────────────────────────────────────
    // Language and validated inputs are part of the content identity: the
    // same record in a different language (or with a different NOC purpose)
    // is a different document, not a duplicate.
    const dataSnapshot: Record<string, unknown> = definition
      ? {
          columns: runResult.data.columns,
          row,
          language,
          inputs: parsedInputs,
          definition_version: definition.version,
        }
      : { columns: runResult.data.columns, row };
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
      templateVersion: definition ? definition.version : null,
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
          "Re-run with authorizeReissue to issue a superseding copy.",
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

    let downloadUrl: string | null = null;
    try {
      downloadUrl = await createPdfSignedUrl(storagePath, 3600);
    } catch {
      downloadUrl = null; // non-fatal — document is issued; ops console can re-sign
    }

    return {
      success: true,
      issuanceId: outcome.issuanceId,
      lifecycleState: "issued",
      storagePath,
      fileName,
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
      blocked: "validation_failed",
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

  async function transition(
    issuanceId: number,
    from: LifecycleState,
    to: LifecycleState,
    extra?: Record<string, unknown>
  ): Promise<void> {
    const update: Record<string, unknown> = { lifecycle_state: to, ...(extra ?? {}) };
    const tsCol = stageTimestampColumn(to);
    if (tsCol) update[tsCol] = new Date().toISOString();
    const serialStatus = serialStatusOnTransition(to, hasSerial);
    if (serialStatus) update.serial_status = serialStatus;
    if (serialStatus === "voided") {
      update.serial_void_reason = (extra?.failure_reason as string) ?? `Lifecycle moved to ${to}`;
    }
    const { error } = await db
      .from("erp_generated_pdf_documents")
      .update(update)
      .eq("id", issuanceId)
      .eq("lifecycle_state", from); // optimistic guard against concurrent movers
    if (error) throw new Error(`Lifecycle transition ${from}→${to} failed: ${error.message}`);
  }

  return {
    async findByRequestKey(requestKey) {
      const { data } = await db
        .from("erp_generated_pdf_documents")
        .select("id, lifecycle_state, storage_path, file_name, checksum, file_size_bytes")
        .eq("request_key", requestKey)
        .maybeSingle();
      return (data as never) ?? null;
    },

    async findIssuedWithFingerprint(contentFingerprint) {
      const { data } = await db
        .from("erp_generated_pdf_documents")
        .select("id")
        .eq("content_fingerprint", contentFingerprint)
        .eq("lifecycle_state", "issued")
        .is("revoked_at", null)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
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
          template_version: deps.definition ? deps.definition.version : null,
          generated_by: deps.actorId,
          document_class: rowInput.documentClass,
          output_code: rowInput.outputCode,
          lifecycle_state: "pending",
          request_key: rowInput.requestKey,
          content_fingerprint: rowInput.contentFingerprint,
          supersedes_issuance_id: rowInput.supersedesIssuanceId,
          data_snapshot_json: deps.dataSnapshot,
          policy_snapshot_json: deps.policy as unknown as Record<string, unknown>,
          branding_snapshot_json: deps.branding
            ? { templateId: deps.resolvedTemplateId, companyNameEn: deps.branding.companyNameEn ?? null }
            : null,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Issuance insert failed: ${error?.message ?? "no data"}`);
      return { id: data.id as number };
    },

    transition,

    async reserveSerial({ issuanceId }) {
      // Deterministic, unique, never-recycled serial:
      //   {OUTPUT_CODE}-{COMPANY}-{YEAR}-{issuance id, zero-padded}
      // Gaps are expected and honest — voided serials are never reused.
      const year = new Date().getUTCFullYear();
      const serialNo = `${deps.registry.report_code}-C${deps.ownerCompanyId}-${year}-${String(issuanceId).padStart(6, "0")}`;
      const { error } = await db
        .from("erp_generated_pdf_documents")
        .update({ serial_no: serialNo, serial_status: "reserved" })
        .eq("id", issuanceId)
        .is("serial_no", null);
      if (error) throw new Error(`Serial reservation failed: ${error.message}`);
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
            document: deps.registry.report_name_en,
            reference: deps.fileName,
            company_id: deps.ownerCompanyId,
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
      if (deps.definition) {
        // Fixed code-based template (OFFICIAL DOCS.1) — the ONLY body source
        // for catalog documents. Deterministic build from server data only.
        const now = new Date();
        html = renderOfficialDocumentHtml(deps.definition, {
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
        marginsMm: deps.definition ? OFFICIAL_DOCUMENT_PAGE_MARGINS_MM : undefined,
      });
      return { buffer: rendered.buffer, rendererVersion: rendered.rendererVersion };
    },

    async upload(storagePath, buffer) {
      await uploadGeneratedPdf(buffer, storagePath);
    },

    async downloadStored(storagePath) {
      const { data, error } = await db.storage.from("erp-generated-pdfs").download(storagePath);
      if (error || !data) throw new Error(`Stored-object download failed: ${error?.message ?? "no data"}`);
      return Buffer.from(await data.arrayBuffer());
    },

    async activatePublicLink({ linkId }) {
      const { error } = await db
        .from("erp_output_public_links")
        .update({ status: "valid", updated_at: new Date().toISOString(), updated_by: deps.actorId })
        .eq("id", linkId)
        .eq("status", "pending_activation");
      if (error) throw new Error(`Public link activation failed: ${error.message}`);
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
