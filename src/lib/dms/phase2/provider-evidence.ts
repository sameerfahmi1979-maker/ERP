import type { DmsAiOutput } from "@/lib/dms/ai/types";
import { rankPhase2Profiles, type SourcePage } from "./batch";
import { PHASE2_CATALOG, type Phase2FieldRule } from "./catalog";

export type Evidence = {
  value: string;
  raw: string | null;
  page: number;
  line?: number;
  lineParts?: readonly { line: number; raw: string }[];
  label: string;
  method?: string;
  region?: string;
  side?: string;
  bounds?: readonly [number, number, number, number];
};

export type SourceLayoutProof = {
  profileId: string | null;
  fields: Record<string, Evidence>;
  reasons?: readonly string[];
  resolves?: readonly string[];
  limitToProofFields?: boolean;
  packet?: { certificatePages: readonly number[]; supportingPages: readonly number[] };
};

type LocalDisposition = {
  profileId: string | null;
  reasons: readonly string[];
  fields: Record<string, Evidence>;
};

function fold(text: string) {
  return text.normalize("NFKC").replace(/[٠-٩۰-۹]/gu, value => String(value.charCodeAt(0) & 15))
    .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "").replace(/\s+/gu, " ").trim().toLowerCase();
}

const months = "january february march april may june july august september october november december".split(" ");

function dateValue(text: string) {
  let date = text;
  const parts = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/u.exec(text);
  if (parts) {
    const [, first, second, year] = parts;
    if ((Number(first) <= 12) === (Number(second) <= 12) && first !== second) return null;
    const [day, month] = Number(first) > 12 ? [first, second] : [second, first];
    date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const named = /^(\d{1,2})(?:st|nd|rd|th)?[ .-]+([a-z]{3,9})[ .-]+(\d{4})$/u.exec(text);
  if (named) {
    const [, day, name, year] = named;
    const index = months.findIndex(month => month === name || month.slice(0, 3) === name);
    if (index < 0) return null;
    date = `${year}-${String(index + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : null;
}

function normalized(rule: Phase2FieldRule, input: string) {
  const value = fold(input);
  if (!value || value.length > 600) return null;
  if (rule.type === "date") return dateValue(value);
  if (rule.key === "entry_permit_number" && rule.type === "identifier") {
    return /^\d+(?:\s*\/\s*\d+)*$/u.test(value) ? value.replaceAll(" ", "") : null;
  }
  if (rule.type === "identifier") return /^[\p{L}\p{N}./ -]+$/u.test(value) ? value.replace(/[ /.-]+/gu, "") : null;
  if (rule.type === "integer") return /^\d+$/u.test(value) ? value : null;
  if (rule.type === "amount") return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/u.test(value) ? value.replaceAll(",", "") : null;
  if (rule.type === "boolean") {
    if (/^(true|yes|نعم)$/u.test(value)) return "true";
    if (/^(false|no|لا)$/u.test(value)) return "false";
    return null;
  }
  return value;
}

const escapeLabel = (label: string) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
const labelPatterns = new Map<string, RegExp>();

function foldedStatement(value: string) {
  return fold(value).replace(/^and /u, "").replace(/[‐‑–]/gu, "-").replace(/:$/u, "");
}

function labelValue(label: string, line: string, compact: boolean) {
  const key = `${compact}:${label}`;
  let regex = labelPatterns.get(key);
  if (!regex) {
    regex = new RegExp(`^\\s*${escapeLabel(label)}(?:\\s*[:：#]\\s*|\\s{${compact ? 1 : 2},})(.+?)\\s*$`, "iu");
    labelPatterns.set(key, regex);
  }
  return regex.exec(line)?.[1];
}

function stripBilingualLabel(raw: string, labels: readonly string[]) {
  const arabic = labels.filter(label => /^\p{Script=Arabic}/u.test(label));
  if (!arabic.length) return raw;
  const suffix = new RegExp(`\\s{2,}:?\\s*(?:${arabic.map(escapeLabel).join("|")})\\s*:?$`, "u");
  return raw.replace(suffix, "").trimEnd();
}

/** Confirm generic provider values against separately read, consistently labelled source evidence. */
export function verifyProviderField(rule: Phase2FieldRule, proposed: string, pages: readonly SourcePage[], compact = false): Evidence | null {
  if (rule.side || rule.multiline || rule.fixedValue) return null;
  const expected = normalized(rule, proposed);
  if (!expected) return null;
  const readings = new Map<string, Evidence>();
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/);
    for (const [index, text] of lines.entries()) {
      for (const label of rule.labels) {
        const inline = labelValue(label, text, compact);
        const next = (rule.type === "identifier" || rule.type === "date") && /\p{N}/u.test(lines[index + 1] ?? "")
          && fold(text).replace(/\s*[:#：]$/u, "") === fold(label) ? lines[index + 1]?.trim() : undefined;
        const raw = inline ? stripBilingualLabel(inline, rule.labels) : next;
        if (!raw) continue;
        const observed = normalized(rule, raw);
        if (observed && (!rule.valuePattern || new RegExp(rule.valuePattern, "u").test(raw.trim()))) {
          if (!readings.has(observed)) readings.set(observed, { page: page.page, line: index + (inline ? 1 : 2), raw, label, value: proposed, method: page.method });
        } else {
          return null;
        }
      }
    }
  }
  return readings.size === 1 ? readings.get(expected) ?? null : null;
}

function verifyFixedFact(rule: Phase2FieldRule, proposed: string | undefined, pages: readonly SourcePage[]): Evidence | null {
  const value = rule.fixedValue;
  if (!value || rule.side || rule.multiline) return null;
  const key = (text: string) => fold(text).replace(/[. ]+/gu, "");
  if (proposed && ![value, ...rule.labels].some(alias => key(alias) === key(proposed))) return null;
  for (const page of pages) {
    for (const label of rule.labels) {
      const exact = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${escapeLabel(label)})(?=$|[^\\p{L}\\p{N}])`, "iu");
      const lines = page.text.split(/\r?\n/);
      const line = lines.findIndex(text => rule.key === "credential_kind" ? fold(text) === fold(label) : exact.test(text));
      if (line < 0) continue;
      const raw = exact.exec(lines[line])?.[1];
      if (raw) return { value, raw, page: page.page, line: line + 1, label, method: page.method };
    }
  }
  return null;
}

const awardStatement = /^and has been assessed against, and met the outcomes of, the following$/iu;
const awardStandard = /^OPITO[‐‑–-]approved standard:$/iu;

function verifyOpitoNarrative(rule: Phase2FieldRule, proposed: string, pages: readonly SourcePage[]): Evidence | null {
  const matches: Evidence[] = [];
  const normalize = rule.key === "printed_outcome" ? foldedStatement : fold;
  const expected = normalize(proposed);
  for (const page of pages) {
    const lines = page.text.split(/\r?\n/).map((text, index) => ({ raw: text.trim(), line: index + 1 })).filter(row => row.raw);
    for (const [index, row] of lines.entries()) {
      const next = lines[index + 1]?.raw ?? "";
      let candidate: Evidence | undefined;
      if (rule.key === "participant_name" && /^This is to certify that$/iu.test(row.raw) &&
        /^attended a course at \S/iu.test(lines[index + 2]?.raw ?? "") && /^[\p{L}\p{M} '’.-]+$/u.test(next)) {
        candidate = { raw: next, line: lines[index + 1].line, label: row.raw, page: page.page, value: proposed, method: page.method };
      }
      const providerMatch = /^attended a course at (.+)$/iu.exec(row.raw);
      if (rule.key === "provider" && providerMatch) {
        candidate = { ...row, raw: providerMatch[1], label: "attended a course at", page: page.page, value: proposed, method: page.method };
      }
      if (rule.key === "printed_outcome" && awardStatement.test(row.raw) && awardStandard.test(next)) {
        candidate = { ...row, raw: `${row.raw}\n${next}`, label: "OPITO award statement", page: page.page, value: proposed, method: page.method };
      }
      if (candidate) matches.push(candidate);
    }
  }
  return matches.length === 1 && normalize(matches[0].raw ?? "") === expected ? matches[0] : null;
}

const profiles = [...PHASE2_CATALOG.profiles, ...PHASE2_CATALOG.variants];
const variants = new Set<string>(PHASE2_CATALOG.variants.map(profile => profile.id));

function trainingOutcomeMeaning(text: string) {
  const value = fold(text).replace(/[.:]$/u, "");
  if (/^(?:has )?(?:attended and |successfully )?completed(?: (?:the )?training course(?: of)?)?$/u.test(value)) return "completed";
  if (/^(?:has )?(?:successfully )?passed (?:an? )?assessment(?: in)?$|^passed_assessment$/u.test(value)) return "passed_assessment";
  if (/^(?:and )?has been assessed against, and met the outcomes of, the following opito[-‐‑–]approved standard$/u.test(value)) return "opito_standard_met";
  return null;
}

function agreesWithPrintedEvidence(rule: Phase2FieldRule, evidence: Evidence, proposed: string) {
  const expected = normalized(rule, evidence.value);
  const trainingOutcome = rule.key === "printed_outcome" ? trainingOutcomeMeaning(evidence.value) : null;
  return fold(proposed) === fold(evidence.value)
    || (!!evidence.raw && fold(proposed) === fold(evidence.raw))
    || (!!expected && expected === normalized(rule, proposed))
    || (!!trainingOutcome && trainingOutcome === trainingOutcomeMeaning(proposed))
    || (!!rule.fixedValue && evidence.value === rule.fixedValue && rule.labels.some(label => fold(label) === fold(proposed)));
}

export function verifyProviderOutput(output: DmsAiOutput, pages: readonly SourcePage[], local: LocalDisposition,
  proof?: SourceLayoutProof | null, reviewedType?: string) {
  const typeCode = output.classification.suggestedTypeCode?.trim().toUpperCase() ?? null;
  const providerType = profiles.some(profile => profile.typeCode === typeCode) ? typeCode : null;
  const knownType = reviewedType && profiles.some(profile => profile.typeCode === reviewedType) ? reviewedType : providerType;
  const ranked = rankPhase2Profiles(pages.map(page => page.text).join("\n"));
  const eligible = ranked.filter(row => row.eligible && row.profile.typeCode === knownType);
  const variantPurposes = new Set(eligible.filter(row => variants.has(row.profile.id)).map(row => row.profile.purposeNumber));
  const shortlisted = eligible.filter(row => variants.has(row.profile.id) || !variantPurposes.has(row.profile.purposeNumber));
  const localProfile = profiles.find(profile => profile.id === local.profileId && profile.typeCode === knownType);
  const proposedProfile = profiles.find(profile => profile.id === proof?.profileId && profile.typeCode === knownType);
  const checkedProfile = !localProfile || localProfile.id === proposedProfile?.id
    || (localProfile.purposeNumber === proposedProfile?.purposeNumber && variants.has(proposedProfile.id))
    ? proposedProfile : undefined;
  const profile = checkedProfile ?? localProfile ?? (shortlisted.length === 1 ? shortlisted[0].profile : undefined);
  const reasons = local.reasons.filter(reason => /^(source:|mixed_|cicpa_regions|qatar_front_reverse|passport_|medical_certificate_page_unconfirmed|conflicting_field)/u.test(reason));
  if (proposedProfile && !checkedProfile) reasons.push("independent_layout_conflicts_with_local_layout");
  if (checkedProfile || proof?.profileId === null) reasons.push(...(proof?.reasons ?? []));
  if (!providerType) reasons.push("provider_type_unresolved_or_outside_catalog");
  else if (knownType !== providerType) reasons.push("provider_type_conflicts_with_reviewed_source");
  if (knownType && !profile) reasons.push("provider_type_has_no_corroborated_layout");
  else if (local.profileId && !localProfile) reasons.push("provider_type_conflicts_with_local_layout");
  if (output.classification.needsHumanReview) reasons.push("provider_requested_review");
  if (profile?.status === "held") reasons.push("profile_evidence_held");
  const fields: Record<string, Evidence> = {};
  const missingFields: string[] = [];
  const unverifiedFields: string[] = [];
  const providerFieldKeys: string[] = [];
  const requiredUnverified: string[] = [];
  const selectedPages = profile?.id === "medical-fitness"
    ? pages.filter(page => /medical fitness certificate|medical fitness assessment/iu.test(page.text))
    : pages;
  const labelOwners = new Map<string, Set<string>>();
  for (const rule of profile?.fields ?? []) {
    for (const alias of rule.labels) {
      const key = fold(alias);
      const keys = labelOwners.get(key) ?? new Set();
      keys.add(rule.key);
      labelOwners.set(key, keys);
    }
  }
  for (const rule of profile?.fields ?? []) {
    const direct = output.extraction.fields.filter(field => field.fieldCode === rule.key).map(field => field.value);
    const extras = direct.length ? [] : output.extraction.additionalFields.filter(field => {
      const label = fold(field.label);
      return label === rule.key || (labelOwners.get(label)?.size === 1 && labelOwners.get(label)?.has(rule.key));
    }).map(field => field.value);
    const proposals = [...new Set([...direct, ...extras].map(value => value.trim()).filter(Boolean))];
    const printed = checkedProfile ? proof?.fields[rule.key] : undefined;
    if (printed?.raw && printed.label && pages.some(page => page.page === printed.page) && normalized(rule, printed.value)) {
      const proposalMatches = proposals.length <= 1 && (!proposals[0] || agreesWithPrintedEvidence(rule, printed, proposals[0]));
      if (proposalMatches || rule.sourceOnly) {
        fields[rule.key] = printed;
        if (proposals.length && proposalMatches) providerFieldKeys.push(rule.key);
      }
      if (!proposalMatches) {
        unverifiedFields.push(rule.key);
        if (rule.required) {
          if (!fields[rule.key]) missingFields.push(rule.key);
          requiredUnverified.push(rule.key);
        }
      }
      continue;
    }
    if (proof?.limitToProofFields || rule.sourceOnly) {
      if (proposals.length) unverifiedFields.push(rule.key);
      if (rule.required) {
        missingFields.push(rule.key);
        if (proposals.length) requiredUnverified.push(rule.key);
      }
      continue;
    }
    const old = local.profileId === profile?.id ? local.fields[rule.key] : undefined;
    const entryHolder = profile?.id === "uae-employment-entry" && rule.key === "holder_name";
    const entryReference = profile?.id === "uae-employment-entry" && rule.key === "entry_permit_number";
    const opito = profile?.id === "h2s-training-opito-basic";
    if (proposals.length === 0 && old && !entryHolder && !entryReference && (!rule.fixedValue || rule.side)) fields[rule.key] = old;
    if (proposals.length <= 1 && rule.fixedValue && !rule.side) {
      const evidence = verifyFixedFact(rule, proposals[0], selectedPages);
      if (evidence) fields[rule.key] = evidence;
      else if (proposals.length === 1) unverifiedFields.push(rule.key);
    }
    if (proposals.length > 1) unverifiedFields.push(rule.key);
    if (proposals.length === 1 && (!rule.fixedValue || rule.side)) {
      const proposed = proposals[0];
      const folded = normalized(rule, proposed);
      if (entryHolder || entryReference) {
        const binding = entryHolder ? { ...rule, labels: ["Full Name", "English Name"] }
          : { ...rule, labels: [...rule.labels, "رقم دخول إذن"] }; // PDF text layer order for the Arabic caption.
        const evidence = verifyProviderField(binding, proposed, selectedPages);
        if (evidence) {
          fields[rule.key] = evidence;
          const conflict = reasons.indexOf(`conflicting_field:${rule.key}`);
          if (conflict !== -1) reasons.splice(conflict, 1);
        } else unverifiedFields.push(rule.key);
      } else if (old && (fold(old.value) === fold(proposed) || (folded && normalized(rule, old.value) === folded))) fields[rule.key] = old;
      else if (old) unverifiedFields.push(rule.key);
      else {
        const certificateRule = opito && rule.key === "certificate_number" ? { ...rule, labels: ["Unique Certificate No", ...rule.labels] } : rule;
        const compact = opito && ["certificate_number", "award_date", "expiry_date", "learner_reference"].includes(rule.key);
        const evidence = verifyProviderField(certificateRule, proposed, selectedPages, compact)
          ?? (opito ? verifyOpitoNarrative(rule, proposed, selectedPages) : null);
        if (evidence) fields[rule.key] = evidence;
        else unverifiedFields.push(rule.key);
      }
    }
    if (proposals.length === 1 && fields[rule.key]) providerFieldKeys.push(rule.key);
    if (rule.required && !fields[rule.key]) missingFields.push(rule.key);
    if (rule.required && unverifiedFields.includes(rule.key)) requiredUnverified.push(rule.key);
  }
  if (missingFields.length) reasons.push("required_fields_without_source_evidence");
  if (requiredUnverified.length) reasons.push("required_provider_fields_need_source_confirmation");
  if (checkedProfile && proof?.resolves?.length) {
    for (const reason of proof.resolves) {
      const field = reason.startsWith("conflicting_field:") ? reason.slice("conflicting_field:".length) : null;
      const recoverableSourceReason = reason === "source:unreadable"
        || (reason === "passport_mrz_unverified" && checkedProfile.typeCode === "PASSPORT_COPY");
      const recoveredWholeSource = recoverableSourceReason && !missingFields.length && !requiredUnverified.length && !proof.reasons?.length;
      if (!recoveredWholeSource && (!field || !fields[field] || fields[field] !== proof.fields[field])) continue;
      const index = reasons.indexOf(reason);
      if (index !== -1) reasons.splice(index, 1);
    }
  }
  return { knownType, profileId: profile?.id ?? null, prepared: !!profile && reasons.length === 0,
    reasons: [...new Set(reasons)], fields, providerFieldKeys, missingFields, unverifiedFields,
    ...(checkedProfile && proof?.packet && { packet: proof.packet }) };
}
