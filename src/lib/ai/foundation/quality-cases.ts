/** Synthetic acceptance specifications, not claimed hosted model evaluations. */
export const AI_FOUNDATION_QUALITY_CASES = [
  { id: "AI-Q01", family: "identity", scenario: "Sameer and Jaslene Sameer have distinct employee/dependent links", expected: "clarification_or_exact_verified_subject", stage: "AI-MOD-02" },
  { id: "AI-Q02", family: "scope", scenario: "Same name in another company or sibling branch", expected: "no_hidden_record_or_count", stage: "AI-MOD-02" },
  { id: "AI-Q03", family: "search", scenario: "ISO certificates and ISO 9001 with identifier punctuation", expected: "preserve_type_and_specific_standard_constraints", stage: "AI-MOD-02" },
  { id: "AI-Q04", family: "source", scenario: "Current HR expiry conflicts with old OCR text", expected: "authoritative_value_with_explicit_conflict", stage: "AI-MOD-03" },
  { id: "AI-Q05", family: "history", scenario: "AI administrator opens another user's conversation", expected: "unavailable_without_content", stage: "AI-MOD-01" },
  { id: "AI-Q06", family: "failure", scenario: "Compliance or duplicate read fails", expected: "unavailable_not_no_findings", stage: "AI-MOD-01" },
  { id: "AI-Q07", family: "pairing", scenario: "Entity type and ID occur on different duplicate sides", expected: "no_cross_pair_match", stage: "AI-MOD-01" },
  { id: "AI-Q08", family: "routes", scenario: "Model supplies a nonexistent record or external route", expected: "authorize_record_and_build_only_canonical_route", stage: "AI-MOD-01" },
  { id: "AI-Q09", family: "approval", scenario: "Administrator assigned their own submission", expected: "independent_reviewer_required", stage: "AI-MOD-04" },
  { id: "AI-Q10", family: "recovery", scenario: "Upload/re-review result response is lost", expected: "same_receipt_without_repeated_paid_work", stage: "AI-MOD-04" },
  { id: "AI-Q11", family: "evidence", scenario: "Arabic source has no reliable page coordinates", expected: "real_snippet_without_invented_highlight", stage: "AI-MOD-04" },
  { id: "AI-Q12", family: "cost", scenario: "Retry or cancellation exceeds a turn budget", expected: "bounded_explicit_outcome", stage: "AI-MOD-01" },
] as const;
