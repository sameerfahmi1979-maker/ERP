/** Safe categories only: never retain provider response bodies, keys or prompts in errors. */
export const structuredFailureCodes = [
  "provider_timeout", "provider_rate_limit", "provider_unavailable", "network_error",
  "provider_authentication", "provider_request_rejected", "provider_not_configured",
  "provider_refusal", "provider_output_incomplete", "provider_output_invalid",
] as const;
export type StructuredFailureCode = typeof structuredFailureCodes[number];

export class StructuredAiFailure extends Error {
  constructor(readonly code: StructuredFailureCode) { super(code); this.name = "StructuredAiFailure"; }
}

export function structuredHttpFailure(status: number): StructuredAiFailure {
  return new StructuredAiFailure(status === 429 ? "provider_rate_limit"
    : status === 401 || status === 403 ? "provider_authentication"
    : status >= 500 ? "provider_unavailable" : "provider_request_rejected");
}
