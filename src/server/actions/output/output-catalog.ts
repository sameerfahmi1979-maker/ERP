"use server";

/**
 * OUTPUT.4 — Registry-driven output catalog for the Employee "Letters & Forms"
 * experience.
 *
 * The catalog is derived entirely from erp_report_registry + class policies:
 * onboarding a new HR document type = adding registry/provider/template/policy
 * records — NO new engine or UI change is required.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/rbac/check";
import {
  resolveEffectivePolicy,
  type ClassPolicyRow,
  type DocumentClass,
  type QrPolicy,
  type RegistryPolicyOverrides,
} from "@/lib/output/class-policy";
import { groupForClass, type CatalogGroup } from "@/lib/output/issuance-status";
import {
  getOfficialDocumentDefinition,
  isGeneratable,
} from "@/lib/official-documents/registry";
import type {
  OfficialDocumentLanguage,
  OfficialDocumentStatus,
} from "@/lib/official-documents/types";

type ActionResult<T = unknown> = { success: boolean; data?: T; error?: string };

/** Serializable optional-input descriptor for the generation panel. */
export interface CatalogInputField {
  key: string;
  labelEn: string;
  required: boolean;
  maxLength: number;
  placeholder?: string;
  helpText?: string;
}

export interface EmployeeOutputCatalogItem {
  outputCode: string;
  name: string;
  description: string | null;
  category: string;
  documentClass: DocumentClass;
  /** Grouping bucket for the UI. */
  group: CatalogGroup;
  /** True when the current user holds every required permission. */
  canGenerate: boolean;
  /** Permissions the current user is missing (labels only, not raw codes shown by default). */
  missingPermissions: string[];
  /** Effective policy summary (class default + registry overrides). */
  approvalRequired: boolean;
  allowQuickPrint: boolean;
  qrPolicy: QrPolicy;
  qrValidityDays: number | null;
  official: boolean;
  /** Sensitivity indicator (payroll/restricted profiles). */
  sensitive: boolean;
  /**
   * Wording governance (OFFICIAL DOCS.1). `legacy` = no fixed code definition
   * yet (pre-catalog output); such outputs keep their existing behavior.
   */
  wordingStatus: OfficialDocumentStatus | "legacy";
  /** False when the fixed definition exists but is not publishable/generatable. */
  generatable: boolean;
  /** Language variants offered by the fixed definition (default English only). */
  languages: OfficialDocumentLanguage[];
  /** Optional user inputs declared by the fixed definition (e.g. NOC purpose). */
  optionalInputs: CatalogInputField[];
  /**
   * True when the current user holds `reports.branding.override`.
   * When true, a letterhead/template override dropdown is shown in the generation dialog.
   */
  canBrandingOverride: boolean;
  /**
   * True when the current user holds `reports.sign`.
   * When true, the stamp/signature is applied by the server; shown in the generation dialog.
   */
  userCanSign: boolean;
}

/**
 * List all onboarded HR outputs (classes A–D) for the employee workspace.
 * Class E analytical reports stay in the Report Center and are excluded here.
 */
export async function listEmployeeOutputCatalog(): Promise<
  ActionResult<EmployeeOutputCatalogItem[]>
> {
  const ctx = await getAuthContext();
  if (!ctx?.profile?.id) return { success: false, error: "Not authenticated." };

  const db = createAdminClient();

  const [{ data: registryRows, error: regError }, { data: classRows, error: classError }] =
    await Promise.all([
      db
        .from("erp_report_registry")
        .select(
          "report_code, report_name_en, description_en, report_category, document_class, required_permissions, sensitive_profile, qr_policy_override, qr_validity_days_override, approval_required_override, allow_quick_print_override, public_disclosure_override"
        )
        .eq("module_code", "HR")
        .eq("is_active", true)
        .is("deleted_at", null)
        .in("document_class", ["A", "B", "C", "D"])
        .order("document_class")
        .order("report_name_en"),
      db.from("erp_output_class_policies").select("*"),
    ]);

  if (regError) return { success: false, error: regError.message };
  if (classError) return { success: false, error: classError.message };

  const classByCode = new Map<string, ClassPolicyRow>(
    ((classRows ?? []) as ClassPolicyRow[]).map((c) => [c.document_class, c])
  );

  const items: EmployeeOutputCatalogItem[] = [];
  for (const row of registryRows ?? []) {
    const documentClass = row.document_class as DocumentClass | null;
    if (!documentClass) continue;
    const classDefault = classByCode.get(documentClass);
    if (!classDefault) continue;

    const policy = resolveEffectivePolicy(row as unknown as RegistryPolicyOverrides, classDefault);
    const required = (row.required_permissions ?? []) as string[];
    const missing = required.filter((p) => !ctx.permissionCodes.includes(p));

    const definition = getOfficialDocumentDefinition(row.report_code as string);
    const generatable = definition ? isGeneratable(definition) : true;

    items.push({
      outputCode: row.report_code as string,
      name: row.report_name_en as string,
      description: (row.description_en as string | null) ?? null,
      category: row.report_category as string,
      documentClass,
      group: groupForClass(documentClass, row.report_category as string),
      canGenerate: missing.length === 0,
      missingPermissions: missing,
      approvalRequired: policy.approvalRequired,
      allowQuickPrint: policy.allowQuickPrint,
      qrPolicy: policy.qrPolicy,
      qrValidityDays: policy.qrValidityDays,
      official: policy.official,
      sensitive: (row.sensitive_profile as string) !== "normal",
      wordingStatus: definition ? definition.status : "legacy",
      generatable,
      languages: definition ? [...definition.supportedLanguages] : ["en"],
      optionalInputs: (definition?.optionalInputs ?? []).map((f) => ({
        key: f.key,
        labelEn: f.labelEn,
        required: f.required,
        maxLength: f.maxLength,
        placeholder: f.placeholder,
        helpText: f.helpText,
      })),
      canBrandingOverride: ctx.permissionCodes.includes("reports.branding.override"),
      userCanSign: ctx.permissionCodes.includes("reports.sign"),
    });
  }

  return { success: true, data: items };
}