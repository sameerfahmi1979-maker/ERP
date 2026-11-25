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

type EmployerEvidence =
  | { kind: "not_applicable" }
  | { kind: "unresolved" }
  | { kind: "employer"; name: string };

export function readMohreEmploymentEmployer(text: string): EmployerEvidence {
  if (!isMohreEmploymentContract(text)) return { kind: "not_applicable" };

  const label = /^[ \t]*(?:1[.)][ \t]*)?establishment[ \t]+name[ \t]*[:–-]?[ \t]*([^\r\n]*)/gim;
  const nextField = /^(?:establishment\s+(?:no\b|number\b)|represented\s+by\b|passport\b|nationality\b|title\b|emirate\b|telephone\b|e-?mail\b)/i;
  const names = new Map<string, string>();
  for (const match of text.matchAll(label)) {
    const followingLine = text.slice(match.index + match[0].length).match(/^(?:\r\n?|\n)[ \t]*([^\r\n]+)/)?.[1];
    const candidate = (match[1].trim() || followingLine || "").split(/\p{Script=Arabic}/u, 1)[0].trim();
    if (candidate.length > 300 || !/\p{Script=Latin}/u.test(candidate) || nextField.test(candidate)) {
      return { kind: "unresolved" };
    }
    names.set(normalizedCompanyName(candidate), candidate);
  }
  const [name] = names.values();
  return names.size === 1 ? { kind: "employer", name } : { kind: "unresolved" };
}

export function mohreEmploymentOwnershipWarning(text: string, owningCompany: string | null): string | null {
  const employer = readMohreEmploymentEmployer(text);
  if (employer.kind === "not_applicable") return null;

  const owner = normalizedCompanyName(owningCompany ?? "");
  if (employer.kind === "unresolved" || !owner) {
    return "Employer ownership could not be verified from this employment contract. Confirm the employer and intake company before approval.";
  }
  if (normalizedCompanyName(employer.name) === owner) return null;

  return "Employer mismatch: the printed establishment name differs from the intake’s owning company. Confirm ownership before approval.";
}
