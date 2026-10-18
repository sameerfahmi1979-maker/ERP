import { listOfficialDocumentDefinitions, validateOfficialDocumentDefinition } from "./registry";
import type { OfficialDocumentDefinition, OfficialDocumentLanguage } from "./types";

/** Technical provenance is not permission to claim business approval. */
export function officialWordingBlockers(def: OfficialDocumentDefinition, language: OfficialDocumentLanguage): string[] {
  const errors = validateOfficialDocumentDefinition(def);
  if (def.status !== "published") errors.push("Approved wording is not available.");
  if (!def.supportedLanguages.includes(language)) errors.push("The requested language is not supported.");
  const languages = language === "bilingual" ? ["en", "ar"] as const : [language];
  for (const variant of languages) {
    const evidence = def.wording[variant];
    if (evidence?.businessApprovalStatus !== "approved" || !evidence.approvedBy?.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(evidence.approvalDate ?? "")) {
      errors.push(`${variant.toUpperCase()} wording requires recorded business approval before official issuance.`);
    }
  }
  return errors;
}

/** Serializable catalogue: no executable builder, HTML or expression editor. */
export function officialTemplateCatalogue() {
  return listOfficialDocumentDefinitions().map(def => ({
    code: def.documentCode, version: def.version, module: def.moduleCode,
    subject: def.recordType, purpose: def.businessPurpose, titleEn: def.titleEn,
    titleAr: def.titleAr ?? null, status: def.status,
    outputClass: "official_document" as const, formats: ["pdf"] as const,
    page: { widthMm: 210, heightMm: 297, orientation: "portrait" as const },
    languages: def.supportedLanguages.map(language => ({ language, officialBlockers: officialWordingBlockers(def, language) })),
    wording: def.wording,
    requiredFields: def.requiredSourceFields.map(key => ({ key, source: "scoped_employee_fetcher", message: def.missingFieldMessages?.[key] ?? `Complete ${key.replaceAll("_", " ")}.` })),
    inputs: def.optionalInputs, sensitiveFields: def.sensitiveFields,
    issuerRule: "authorized_subject_company_or_governed_group_neutral_brand",
    permissionPolicy: "current_subject_scope_and_registry_class_policy_at_each_action",
    signaturePolicy: "reports.sign_and_governed_branding; image_is_not_digital_signature",
    verificationPolicy: "class_policy_and_authoritative_issued_original_only",
  }));
}
