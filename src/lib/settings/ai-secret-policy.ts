/** Shared display/validation rules. No secret values live in this module. */
export const AI_SECRET_KEYS: Readonly<Record<string, string>> = {
  openai: "OPENAI_API_KEY",
  azure_openai: "AZURE_OPENAI_API_KEY",
  azure_document_intelligence: "AZURE_DOCUMENT_INTELLIGENCE_KEY",
  google_document_ai: "GOOGLE_DOCUMENT_AI_KEY",
  local_custom: "CUSTOM_AI_API_KEY",
};

export function isAllowedAiSecretReference(providerType: string, providerId: number, ref: string): boolean {
  const canonical = AI_SECRET_KEYS[providerType];
  return Number.isSafeInteger(providerId) && providerId > 0 && !!canonical &&
    (ref === canonical || ref === `ERP_AI_PROVIDER_${providerId}_KEY`);
}
