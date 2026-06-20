/**
 * ERP COMMON AI.3 — Deterministic Duplicate Detection Rules
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DuplicateRuleResult } from "./types";
import { normalizeName } from "./candidate-builder";

type PairLimit = { limit: number };

function capResults(results: DuplicateRuleResult[], limit: number): DuplicateRuleResult[] {
  return results.slice(0, limit);
}

function orderedPair(idA: number, idB: number): [number, number] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

export async function detectDuplicatePartyTrn(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("party_tax_registrations")
    .select("party_id, trn")
    .is("deleted_at", null)
    .not("trn", "is", null)
    .neq("trn", "");

  if (error || !data) return [];

  const byTrn = new Map<string, number[]>();
  for (const row of data as { party_id: number; trn: string }[]) {
    const key = row.trn.trim().toUpperCase();
    if (!key) continue;
    const list = byTrn.get(key) ?? [];
    list.push(row.party_id);
    byTrn.set(key, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [trn, partyIds] of byTrn) {
    const unique = [...new Set(partyIds)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = orderedPair(unique[i], unique[j]);
        results.push({
          candidateType: "duplicate_party_trn",
          detectionMethod: "deterministic",
          entityTypeA: "party",
          entityIdA: a,
          entityTypeB: "party",
          entityIdB: b,
          conflictField: "trn",
          valueA: trn,
          valueB: trn,
          valueKind: "trn",
          confidenceScore: 1.0,
          evidenceJson: { matchField: "trn" },
        });
        if (results.length >= opts.limit) return results;
      }
    }
  }
  return results;
}

export async function detectDuplicatePartyIban(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("party_bank_details")
    .select("party_id, iban")
    .is("deleted_at", null)
    .not("iban", "is", null);

  if (error || !data) return [];

  const byIban = new Map<string, number[]>();
  for (const row of data as { party_id: number; iban: string }[]) {
    const key = row.iban.replace(/\s/g, "").toUpperCase();
    if (!key) continue;
    const list = byIban.get(key) ?? [];
    list.push(row.party_id);
    byIban.set(key, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [, partyIds] of byIban) {
    const unique = [...new Set(partyIds)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = orderedPair(unique[i], unique[j]);
        results.push({
          candidateType: "duplicate_party_iban",
          detectionMethod: "deterministic",
          entityTypeA: "party",
          entityIdA: a,
          entityTypeB: "party",
          entityIdB: b,
          conflictField: "iban",
          valueKind: "iban",
          confidenceScore: 1.0,
          evidenceJson: { matchField: "iban" },
        });
        if (results.length >= opts.limit) return results;
      }
    }
  }
  return results;
}

export async function detectDuplicatePartyLicense(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("party_licenses")
    .select("party_id, license_number")
    .is("deleted_at", null)
    .not("license_number", "is", null);

  if (error || !data) return [];

  const byLicense = new Map<string, number[]>();
  for (const row of data as { party_id: number; license_number: string }[]) {
    const key = normalizeName(row.license_number);
    if (!key) continue;
    const list = byLicense.get(key) ?? [];
    list.push(row.party_id);
    byLicense.set(key, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [license, partyIds] of byLicense) {
    const unique = [...new Set(partyIds)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = orderedPair(unique[i], unique[j]);
        results.push({
          candidateType: "duplicate_party_license",
          detectionMethod: "deterministic",
          entityTypeA: "party",
          entityIdA: a,
          entityTypeB: "party",
          entityIdB: b,
          conflictField: "license_number",
          valueA: license.slice(0, 50),
          valueB: license.slice(0, 50),
          valueKind: "license",
          confidenceScore: 1.0,
          evidenceJson: { matchField: "license_number" },
        });
        if (results.length >= opts.limit) return results;
      }
    }
  }
  return results;
}

export async function detectDuplicatePartyEmail(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("party_contacts")
    .select("party_id, email")
    .is("deleted_at", null)
    .not("email", "is", null);

  if (error || !data) return [];

  const byEmail = new Map<string, number[]>();
  for (const row of data as { party_id: number; email: string }[]) {
    const key = row.email.trim().toLowerCase();
    if (!key || !key.includes("@")) continue;
    const list = byEmail.get(key) ?? [];
    list.push(row.party_id);
    byEmail.set(key, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [email, partyIds] of byEmail) {
    const unique = [...new Set(partyIds)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = orderedPair(unique[i], unique[j]);
        results.push({
          candidateType: "duplicate_party_email",
          detectionMethod: "deterministic",
          entityTypeA: "party",
          entityIdA: a,
          entityTypeB: "party",
          entityIdB: b,
          conflictField: "email",
          valueA: email,
          valueB: email,
          valueKind: "email",
          confidenceScore: 0.9,
          evidenceJson: { matchField: "email" },
        });
        if (results.length >= opts.limit) return results;
      }
    }
  }
  return results;
}

export async function detectDuplicatePartyName(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("parties")
    .select("id, display_name")
    .is("deleted_at", null)
    .not("display_name", "is", null);

  if (error || !data) return [];

  const byName = new Map<string, number[]>();
  for (const row of data as { id: number; display_name: string }[]) {
    const key = normalizeName(row.display_name);
    if (!key || key.length < 3) continue;
    const list = byName.get(key) ?? [];
    list.push(row.id);
    byName.set(key, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [name, ids] of byName) {
    const unique = [...new Set(ids)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = orderedPair(unique[i], unique[j]);
        results.push({
          candidateType: "duplicate_party_name",
          detectionMethod: "deterministic",
          entityTypeA: "party",
          entityIdA: a,
          entityTypeB: "party",
          entityIdB: b,
          conflictField: "display_name",
          valueA: name,
          valueB: name,
          valueKind: "name",
          confidenceScore: 0.95,
          evidenceJson: { matchField: "display_name" },
        });
        if (results.length >= opts.limit) return results;
      }
    }
  }
  return results;
}

export async function detectDuplicateCompanyName(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("owner_companies")
    .select("id, trade_name")
    .is("deleted_at", null)
    .not("trade_name", "is", null);

  if (error || !data) return [];

  const byName = new Map<string, number[]>();
  for (const row of data as { id: number; trade_name: string }[]) {
    const key = normalizeName(row.trade_name);
    if (!key || key.length < 3) continue;
    const list = byName.get(key) ?? [];
    list.push(row.id);
    byName.set(key, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [name, ids] of byName) {
    const unique = [...new Set(ids)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = orderedPair(unique[i], unique[j]);
        results.push({
          candidateType: "duplicate_company_name",
          detectionMethod: "deterministic",
          entityTypeA: "company",
          entityIdA: a,
          entityTypeB: "company",
          entityIdB: b,
          conflictField: "trade_name",
          valueA: name,
          valueB: name,
          valueKind: "name",
          confidenceScore: 0.95,
          evidenceJson: { matchField: "trade_name" },
        });
        if (results.length >= opts.limit) return results;
      }
    }
  }
  return results;
}

export async function detectDuplicateBranchLicense(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, trade_license_branch_ref")
    .is("deleted_at", null)
    .not("trade_license_branch_ref", "is", null);

  if (error || !data) return [];

  const byRef = new Map<string, number[]>();
  for (const row of data as { id: number; trade_license_branch_ref: string }[]) {
    const key = normalizeName(row.trade_license_branch_ref);
    if (!key) continue;
    const list = byRef.get(key) ?? [];
    list.push(row.id);
    byRef.set(key, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [ref, ids] of byRef) {
    const unique = [...new Set(ids)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = orderedPair(unique[i], unique[j]);
        results.push({
          candidateType: "duplicate_branch_license",
          detectionMethod: "deterministic",
          entityTypeA: "branch",
          entityIdA: a,
          entityTypeB: "branch",
          entityIdB: b,
          conflictField: "trade_license_branch_ref",
          valueA: ref,
          valueB: ref,
          valueKind: "license",
          confidenceScore: 1.0,
          evidenceJson: { matchField: "trade_license_branch_ref" },
        });
        if (results.length >= opts.limit) return results;
      }
    }
  }
  return results;
}

export async function detectDuplicateSiteName(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("work_sites")
    .select("id, site_name, emirate_id, area_zone_id, address_line_1")
    .is("deleted_at", null)
    .not("site_name", "is", null);

  if (error || !data) return [];

  const byKey = new Map<string, number[]>();
  for (const row of data as {
    id: number;
    site_name: string;
    emirate_id: number | null;
    area_zone_id: number | null;
    address_line_1: string | null;
  }[]) {
    const nameKey = normalizeName(row.site_name);
    if (!nameKey || nameKey.length < 3) continue;
    const addrKey = normalizeName(row.address_line_1 ?? "");
    const composite = `${nameKey}|${row.emirate_id ?? 0}|${row.area_zone_id ?? 0}|${addrKey}`;
    const list = byKey.get(composite) ?? [];
    list.push(row.id);
    byKey.set(composite, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [, ids] of byKey) {
    const unique = [...new Set(ids)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = orderedPair(unique[i], unique[j]);
        results.push({
          candidateType: "duplicate_site_name",
          detectionMethod: "deterministic",
          entityTypeA: "site",
          entityIdA: a,
          entityTypeB: "site",
          entityIdB: b,
          conflictField: "site_name",
          confidenceScore: 0.85,
          evidenceJson: { matchField: "site_name+emirate+address" },
        });
        if (results.length >= opts.limit) return results;
      }
    }
  }
  return results;
}

export async function detectDuplicateDocumentHash(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("dms_upload_sessions")
    .select("document_id, sha256_hash")
    .not("sha256_hash", "is", null)
    .not("document_id", "is", null)
    .is("discarded_at", null);

  if (error || !data) return [];

  const byHash = new Map<string, number[]>();
  for (const row of data as { document_id: number; sha256_hash: string }[]) {
    const key = row.sha256_hash.trim().toLowerCase();
    if (!key) continue;
    const list = byHash.get(key) ?? [];
    list.push(row.document_id);
    byHash.set(key, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [hash, docIds] of byHash) {
    const unique = [...new Set(docIds)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = orderedPair(unique[i], unique[j]);
        results.push({
          candidateType: "duplicate_document_hash",
          detectionMethod: "deterministic",
          entityTypeA: "dms_document",
          entityIdA: a,
          entityTypeB: "dms_document",
          entityIdB: b,
          conflictField: "sha256_hash",
          valueKind: "hash",
          confidenceScore: 1.0,
          evidenceJson: { hashPrefix: hash.slice(0, 12) },
        });
        if (results.length >= opts.limit) return results;
      }
    }
  }
  return results;
}

const PRIMARY_ENTITY_TYPES = new Set(["party", "company", "branch"]);

export async function detectDuplicateDocumentLink(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data, error } = await supabase
    .from("dms_document_links")
    .select("document_id, entity_type, entity_id")
    .is("deleted_at", null);

  if (error || !data) return [];

  const byDoc = new Map<number, Array<{ entity_type: string; entity_id: number }>>();
  for (const row of data as { document_id: number; entity_type: string; entity_id: number }[]) {
    if (!PRIMARY_ENTITY_TYPES.has(row.entity_type)) continue;
    const list = byDoc.get(row.document_id) ?? [];
    list.push({ entity_type: row.entity_type, entity_id: row.entity_id });
    byDoc.set(row.document_id, list);
  }

  const results: DuplicateRuleResult[] = [];
  for (const [docId, links] of byDoc) {
    const uniqueKeys = new Set(links.map((l) => `${l.entity_type}:${l.entity_id}`));
    if (uniqueKeys.size < 2) continue;

    const first = links[0];
    const second = links.find(
      (l) => l.entity_type !== first.entity_type || l.entity_id !== first.entity_id
    );
    if (!second) continue;

    results.push({
      candidateType: "duplicate_document_link",
      detectionMethod: "deterministic",
      entityTypeA: first.entity_type,
      entityIdA: first.entity_id,
      entityTypeB: second.entity_type,
      entityIdB: second.entity_id,
      conflictField: "document_link",
      sourceDocumentId: docId,
      confidenceScore: 0.95,
      evidenceJson: { documentId: docId, linkCount: uniqueKeys.size },
    });
    if (results.length >= opts.limit) return results;
  }
  return results;
}

export async function detectLicenseExpiryConflict(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<DuplicateRuleResult[]> {
  const { data: licenses, error } = await supabase
    .from("party_licenses")
    .select("id, party_id, expiry_date, dms_license_document_id")
    .is("deleted_at", null)
    .not("expiry_date", "is", null)
    .not("dms_license_document_id", "is", null);

  if (error || !licenses) return [];

  const results: DuplicateRuleResult[] = [];
  for (const lic of licenses as {
    id: number;
    party_id: number;
    expiry_date: string;
    dms_license_document_id: number;
  }[]) {
    const { data: doc } = await supabase
      .from("dms_documents")
      .select("id, expiry_date, document_no")
      .eq("id", lic.dms_license_document_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) continue;
    const docRow = doc as { id: number; expiry_date: string | null; document_no: string | null };
    if (!docRow.expiry_date || docRow.expiry_date === lic.expiry_date) continue;

    results.push({
      candidateType: "conflict_license_expiry",
      detectionMethod: "deterministic",
      entityTypeA: "party",
      entityIdA: lic.party_id,
      entityTypeB: "dms_document",
      entityIdB: docRow.id,
      conflictField: "expiry_date",
      valueA: lic.expiry_date,
      valueB: docRow.expiry_date,
      valueKind: "date",
      confidenceScore: 0.95,
      sourceDocumentId: docRow.id,
      evidenceJson: { partyLicenseId: lic.id, documentNo: docRow.document_no },
    });
    if (results.length >= opts.limit) return results;
  }
  return results;
}

export async function runAllDeterministicRules(
  supabase: SupabaseClient,
  opts: PairLimit = { limit: 1000 }
): Promise<{ results: DuplicateRuleResult[]; failedRules: string[] }> {
  const perRuleLimit = Math.max(50, Math.floor(opts.limit / 11));
  const ruleLimit = { limit: perRuleLimit };
  const failedRules: string[] = [];
  const all: DuplicateRuleResult[] = [];

  const rules: Array<{ name: string; fn: () => Promise<DuplicateRuleResult[]> }> = [
    { name: "duplicate_party_trn", fn: () => detectDuplicatePartyTrn(supabase, ruleLimit) },
    { name: "duplicate_party_iban", fn: () => detectDuplicatePartyIban(supabase, ruleLimit) },
    { name: "duplicate_party_license", fn: () => detectDuplicatePartyLicense(supabase, ruleLimit) },
    { name: "duplicate_party_email", fn: () => detectDuplicatePartyEmail(supabase, ruleLimit) },
    { name: "duplicate_party_name", fn: () => detectDuplicatePartyName(supabase, ruleLimit) },
    { name: "duplicate_company_name", fn: () => detectDuplicateCompanyName(supabase, ruleLimit) },
    { name: "duplicate_branch_license", fn: () => detectDuplicateBranchLicense(supabase, ruleLimit) },
    { name: "duplicate_site_name", fn: () => detectDuplicateSiteName(supabase, ruleLimit) },
    { name: "duplicate_document_hash", fn: () => detectDuplicateDocumentHash(supabase, ruleLimit) },
    { name: "duplicate_document_link", fn: () => detectDuplicateDocumentLink(supabase, ruleLimit) },
    { name: "conflict_license_expiry", fn: () => detectLicenseExpiryConflict(supabase, ruleLimit) },
  ];

  for (const rule of rules) {
    try {
      all.push(...(await rule.fn()));
    } catch {
      failedRules.push(rule.name);
    }
  }

  return { results: capResults(all, opts.limit), failedRules };
}
