export const EMPLOYMENT_CONTRACT_TYPE = "EMPLOYMENT_CONTRACT";

export function isMohreEmploymentContract(text: string): boolean {
  const header = text.slice(0, 1400);
  return /\bministry\s+of\s+human\s+resources\b/i.test(header) &&
    /^\s*employment[ \t]+contract(?:[ \t]+(?:full|part)[ \t]+(?:work|time))?\b/im.test(header) &&
    /\btransaction\s+number\b/i.test(header) &&
    /\bwork\s+style\b/i.test(header);
}

function normalizedCompanyName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function mohreEmploymentOwnershipWarning(text: string, owningCompany: string | null): string | null {
  if (!isMohreEmploymentContract(text)) return null;

  const label = text.match(/^[ \t]*(?:1[.)][ \t]*)?establishment[ \t]+name[ \t]*[:–-]?[ \t]*([^\r\n]*)/im);
  const followingLine = label && text.slice((label.index ?? 0) + label[0].length)
    .match(/^(?:\r\n?|\n)[ \t]*([^\r\n]+)/)?.[1];
  const candidate = (label?.[1].trim() || followingLine || "").split(/\p{Script=Arabic}/u, 1)[0].trim();
  const nextField = /^(?:establishment\s+(?:no\b|number\b)|represented\s+by\b|passport\b|nationality\b|title\b|emirate\b|telephone\b|e-?mail\b)/i;
  const name = /\p{Script=Latin}/u.test(candidate) && !nextField.test(candidate) ? candidate : "";
  const printed = normalizedCompanyName(name ?? "");
  const owner = normalizedCompanyName(owningCompany ?? "");

  if (!printed || !owner) {
    return "Employer ownership could not be verified from this employment contract. Confirm the employer and intake company before approval.";
  }
  if (printed === owner) return null;

  return "Employer mismatch: the printed establishment name differs from the intake’s owning company. Confirm ownership before approval.";
}
