import type { ExportBrandingContext } from "@/lib/export/export-types";

export function requireBrandingRevision(value: unknown): string {
  if ((typeof value !== "string" && typeof value !== "number") ||
      (typeof value === "number" && !Number.isSafeInteger(value)) ||
      !/^[1-9]\d{0,18}$/.test(String(value)) || BigInt(value) > BigInt("9223372036854775807")) {
    throw new Error("Branding version identity is unavailable.");
  }
  return String(value);
}

/** Historical downloads use stored bytes, never these values to regenerate a file. */
export function issuedBrandingSnapshot(branding: ExportBrandingContext | undefined) {
  if (!branding) return null;
  if (!branding.provenance) throw new Error("Branding version identity is unavailable.");
  const p = branding.provenance;
  // Explicit projection prevents future display fields or signed URLs being
  // accidentally persisted through a spread of the complete branding context.
  return {
    schemaVersion: p.schemaVersion,
    templateId: p.templateId,
    templateRevision: p.templateRevision,
    templateVersion: p.templateVersion,
    brandingProfileId: p.brandingProfileId,
    brandingRevision: p.brandingRevision,
    ownerCompanyId: p.ownerCompanyId,
    companyNameEn: branding.companyNameEn ?? null,
    companyNameAr: branding.companyNameAr ?? null,
    assets: p.assets.map(a => ({ id: a.id, type: a.type, version: a.version, revision: a.revision })),
  };
}
