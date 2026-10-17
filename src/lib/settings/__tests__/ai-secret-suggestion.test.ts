import { expect, it } from "vitest";
import { getAiSecretReferenceSuggestion } from "../ai-secret-policy";
it("repairs a persisted Azure reference on a provider already changed to OpenAI", () => {
  expect(getAiSecretReferenceSuggestion("openai", 8, "AZURE_DOCUMENT_INTELLIGENCE_KEY")).toBe("OPENAI_API_KEY");
});
it("preserves a valid provider-specific reference", () => {
  expect(getAiSecretReferenceSuggestion("openai", 8, "ERP_AI_PROVIDER_8_KEY")).toBe("ERP_AI_PROVIDER_8_KEY");
});
it("does not preserve another provider's reference", () => {
  expect(getAiSecretReferenceSuggestion("openai", 8, "ERP_AI_PROVIDER_9_KEY")).toBe("OPENAI_API_KEY");
});
it("suggests the canonical deployment key for a new OpenAI provider", () => {
  expect(getAiSecretReferenceSuggestion("openai", 0, null)).toBe("OPENAI_API_KEY");
});
