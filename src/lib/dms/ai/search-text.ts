/**
 * DMS AI-search text handling. Keep the simple-language index: it protects
 * business codes and multilingual names. Expand only reviewed document words.
 */
export interface AiSearchLookup {
  id: number;
  name_en: string;
  type_code?: string;
}

const CERTIFICATE_WORDS = ["certificate", "certificates", "certification", "certifications"];

function words(value: string): string[] {
  return value.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Keep punctuation that PostgreSQL indexes inside codes, emails and numbers.
 * Quotes, backslashes and query operators are never part of a literal.
 * Lookup names still use words(): their configured code separators are labels.
 */
export function textLiterals(value: string): string[] {
  return value.normalize("NFKC").toLowerCase().match(
    /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:[@._:/-][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu,
  ) ?? [];
}

function canonicalWord(word: string): string {
  return CERTIFICATE_WORDS.includes(word) ? "certificate" : word;
}

/** Every hint word must occur in the same configured lookup; keep every match. */
export function matchAiSearchLookups<T extends AiSearchLookup>(hint: string, rows: T[]): T[] {
  const wanted = words(hint).map(canonicalWord);
  if (wanted.length === 0) return [];
  return rows.filter(row => {
    const available = new Set(words(row.name_en + " " + (row.type_code ?? "")).map(canonicalWord));
    return wanted.every(word => available.has(word));
  });
}

/**
 * A resolved type/category already enforces its words, even if a document's
 * title omits them. Never remove subject, party or outcome constraints.
 * Unresolved hints stay text constraints instead of disappearing.
 */
export function aiSearchTextTerms(input: {
  keywords: string[];
  document_type_hint: string | null;
  category_hint: string | null;
  person_name_hint: string | null;
  party_name_hint: string | null;
  outcome_hint: string | null;
}, resolvedType: boolean, resolvedCategory: boolean): string[] {
  const covered = new Set([
    ...(resolvedType ? textLiterals(input.document_type_hint ?? "") : []),
    ...(resolvedCategory ? textLiterals(input.category_hint ?? "") : []),
  ].map(canonicalWord));
  return [
    ...input.keywords.flatMap(textLiterals).filter(word => !covered.has(canonicalWord(word))),
    ...(!resolvedType ? textLiterals(input.document_type_hint ?? "") : []),
    ...(!resolvedCategory ? textLiterals(input.category_hint ?? "") : []),
    ...textLiterals(input.person_name_hint ?? ""),
    ...textLiterals(input.party_name_hint ?? ""),
    ...textLiterals(input.outcome_hint ?? ""),
  ];
}

/**
 * Generate to_tsquery syntax from tokenized literals only. Separate concepts
 * combine with AND; alternatives are confined to certificate word forms.
 * Do not pass this expression through plainto_tsquery, which ignores operators.
 */
export function buildAiSearchTextQuery(terms: string[]): string | null {
  const tokens = [...new Set(terms.flatMap(textLiterals).map(canonicalWord))];
  if (tokens.length === 0) return null;
  if (tokens.length > 80 || tokens.some(token => token.length > 120)) {
    throw new Error("Search has too many or overly long terms. Please shorten it.");
  }
  return tokens.map(token => token === "certificate"
    ? "(" + CERTIFICATE_WORDS.map(word => "'" + word + "'").join(" | ") + ")"
    : "'" + token + "'"
  ).join(" & ");
}
