/**
 * ERP DMS AI Phase 13 — Entity Matcher
 *
 * Runs entity/owner matching for a document or intake session and returns
 * DmsEntityMatchCandidateInput[] for upsert.
 *
 * Security rules:
 *   - Uses createAdminClient() for data loading only.
 *   - Caller must enforce permission + feature flag BEFORE calling.
 *   - sourceTextSummary is always truncated to 200 chars.
 *   - No raw OCR/content/AI text stored.
 *   - No writes to dms_documents owner fields (owning_company_id, party_id, etc.).
 *   - No auto-linking. Human-review-only.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { bestScore, truncateSafeSummary } from "./match-signals";
import { upsertDmsEntityMatchCandidate, createReviewQueueItemForEntityMatchCandidate } from "./entity-match-upsert";
import {
  MATCH_SCORE_THRESHOLDS,
  type DmsEntityMatchCandidateInput,
  type DmsEntityMatchRunResult,
  type DmsEntityMatchOptions,
  type DmsEntityMatchTargetType,
} from "./entity-match-types";

// ── Data loaders ──────────────────────────────────────────────────────────────

interface DocumentMatchContext {
  id:                number;
  document_type_id:  number | null;
  title:             string | null;
  owning_company_id: number | null;
  owning_branch_id:  number | null;
  party_id:          number | null;
}

interface AiSuggestedLinks {
  owner_company_id?: number | null;
  branch_id?:        number | null;
  party_id?:         number | null;
  employee_id?:      number | null;
}

interface OwnerCompanyRow {
  id:            number;
  company_code:  string | null;
  legal_name_en: string | null;
  legal_name_ar: string | null;
  trn?:          string | null;
}

interface BranchRow {
  id:          number;
  branch_code: string | null;
  branch_name: string | null;
}

interface PartyRow {
  id:             number;
  party_code:     string | null;
  legal_name_en:  string | null;
  legal_name_ar:  string | null;
  trn?:           string | null;
}

interface EmployeeRow {
  id:             number;
  employee_code:  string | null;
  full_name:      string | null;
}

async function loadDocumentContext(documentId: number): Promise<DocumentMatchContext | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("dms_documents")
    .select("id, document_type_id, title, owning_company_id, owning_branch_id, party_id")
    .eq("id", documentId)
    .is("deleted_at", null)
    .single();
  if (error || !data) return null;
  return data as unknown as DocumentMatchContext;
}

async function loadLatestAiResultIdForDocument(documentId: number): Promise<number | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("dms_ai_extraction_results")
    .select("id")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return (data as Record<string, unknown>).id as number;
}

async function loadAiSuggestedLinks(aiResultId: number): Promise<AiSuggestedLinks> {
  const db = createAdminClient();
  const { data } = await db
    .from("dms_ai_extraction_results")
    .select("suggested_links_json")
    .eq("id", aiResultId)
    .single();
  if (!data) return {};
  const links = (data as Record<string, unknown>).suggested_links_json;
  if (!links || typeof links !== "object" || Array.isArray(links)) return {};
  return links as AiSuggestedLinks;
}

async function loadOwnerCompanies(): Promise<OwnerCompanyRow[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("owner_companies")
    .select("id, company_code, legal_name_en, legal_name_ar")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(200);
  return (data ?? []) as unknown as OwnerCompanyRow[];
}

async function loadBranches(): Promise<BranchRow[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("branches")
    .select("id, branch_code, branch_name")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(200);
  return (data ?? []) as unknown as BranchRow[];
}

async function loadParties(limitRows = 500): Promise<PartyRow[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("parties")
    .select("id, party_code, legal_name_en, legal_name_ar")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(limitRows);
  return (data ?? []) as unknown as PartyRow[];
}

async function loadEmployees(): Promise<EmployeeRow[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("employees")
    .select("id, employee_code, full_name")
    .eq("is_active", true)
    .is("deleted_at", null)
    .limit(500);
  return (data ?? []) as unknown as EmployeeRow[];
}

// ── Entity matching helpers ───────────────────────────────────────────────────

function matchOwnerCompanies(
  doc: DocumentMatchContext,
  companies: OwnerCompanyRow[],
  aiLinks: AiSuggestedLinks,
  documentId: number,
  aiResultId: number | null
): DmsEntityMatchCandidateInput[] {
  const results: DmsEntityMatchCandidateInput[] = [];

  // If doc already has owner, skip
  if (doc.owning_company_id) return results;

  // Priority 1: direct AI link
  if (aiLinks.owner_company_id) {
    const company = companies.find(c => c.id === aiLinks.owner_company_id);
    if (company) {
      results.push({
        candidateKey:       `match:${documentId}:owner_company:${company.id}:ai_candidate`,
        documentId,
        aiResultId,
        sourceTextSummary:  truncateSafeSummary(`AI suggested owner company ID ${company.id}`),
        matchSignal:        truncateSafeSummary(company.company_code ?? company.legal_name_en),
        targetEntityType:   "owner_company",
        targetEntityId:     company.id,
        targetDisplayName:  truncateSafeSummary(company.legal_name_en),
        matchScore:         MATCH_SCORE_THRESHOLDS.AI_CANDIDATE,
        matchMethod:        "ai_candidate",
        matchReason:        truncateSafeSummary("AI extraction suggested this owner company"),
        aiGenerated:        true,
      });
    }
  }

  // Priority 2: match by document title tokens vs company names
  if (doc.title) {
    for (const company of companies) {
      const scored = bestScore(doc.title, company.legal_name_en ?? undefined, company.legal_name_en ?? undefined);
      if (scored && scored.score >= MATCH_SCORE_THRESHOLDS.FUZZY) {
        results.push({
          candidateKey:      `match:${documentId}:owner_company:${company.id}:${scored.method}`,
          documentId,
          aiResultId,
          sourceTextSummary: truncateSafeSummary(`Title match: ${scored.method}`),
          matchSignal:       truncateSafeSummary(company.company_code ?? company.legal_name_en),
          targetEntityType:  "owner_company",
          targetEntityId:    company.id,
          targetDisplayName: truncateSafeSummary(company.legal_name_en),
          matchScore:        scored.score,
          matchMethod:       scored.method,
          matchReason:       truncateSafeSummary(`Document title matches company name via ${scored.method}`),
          aiGenerated:       false,
        });
      }
    }
  }

  // Deduplicate by target entity ID, keep highest score
  return deduplicateByTargetId(results);
}

function matchBranches(
  doc: DocumentMatchContext,
  branches: BranchRow[],
  aiLinks: AiSuggestedLinks,
  documentId: number,
  aiResultId: number | null
): DmsEntityMatchCandidateInput[] {
  const results: DmsEntityMatchCandidateInput[] = [];
  if (doc.owning_branch_id) return results;

  if (aiLinks.branch_id) {
    const branch = branches.find(b => b.id === aiLinks.branch_id);
    if (branch) {
      results.push({
        candidateKey:      `match:${documentId}:branch:${branch.id}:ai_candidate`,
        documentId,
        aiResultId,
        sourceTextSummary: truncateSafeSummary(`AI suggested branch ID ${branch.id}`),
        matchSignal:       truncateSafeSummary(branch.branch_code ?? branch.branch_name),
        targetEntityType:  "branch",
        targetEntityId:    branch.id,
        targetDisplayName: truncateSafeSummary(branch.branch_name),
        matchScore:        MATCH_SCORE_THRESHOLDS.AI_CANDIDATE,
        matchMethod:       "ai_candidate",
        matchReason:       truncateSafeSummary("AI extraction suggested this branch"),
        aiGenerated:       true,
      });
    }
  }

  return results;
}

function matchParties(
  doc: DocumentMatchContext,
  parties: PartyRow[],
  aiLinks: AiSuggestedLinks,
  documentId: number,
  aiResultId: number | null
): DmsEntityMatchCandidateInput[] {
  const results: DmsEntityMatchCandidateInput[] = [];
  if (doc.party_id) return results;

  if (aiLinks.party_id) {
    const party = parties.find(p => p.id === aiLinks.party_id);
    if (party) {
      results.push({
        candidateKey:      `match:${documentId}:party:${party.id}:ai_candidate`,
        documentId,
        aiResultId,
        sourceTextSummary: truncateSafeSummary(`AI suggested party ID ${party.id}`),
        matchSignal:       truncateSafeSummary(party.party_code ?? party.legal_name_en),
        targetEntityType:  "party",
        targetEntityId:    party.id,
        targetDisplayName: truncateSafeSummary(party.legal_name_en),
        matchScore:        MATCH_SCORE_THRESHOLDS.AI_CANDIDATE,
        matchMethod:       "ai_candidate",
        matchReason:       truncateSafeSummary("AI extraction suggested this party"),
        aiGenerated:       true,
      });
    }
  }

  return results;
}

function matchEmployees(
  doc: DocumentMatchContext,
  employees: EmployeeRow[],
  aiLinks: AiSuggestedLinks,
  documentId: number,
  aiResultId: number | null
): DmsEntityMatchCandidateInput[] {
  const results: DmsEntityMatchCandidateInput[] = [];

  if (aiLinks.employee_id) {
    const employee = employees.find(e => e.id === aiLinks.employee_id);
    if (employee) {
      results.push({
        candidateKey:      `match:${documentId}:employee:${employee.id}:ai_candidate`,
        documentId,
        aiResultId,
        sourceTextSummary: truncateSafeSummary(`AI suggested employee ID ${employee.id}`),
        matchSignal:       truncateSafeSummary(employee.employee_code ?? employee.full_name),
        targetEntityType:  "employee",
        targetEntityId:    employee.id,
        targetDisplayName: truncateSafeSummary(employee.full_name),
        matchScore:        MATCH_SCORE_THRESHOLDS.AI_CANDIDATE,
        matchMethod:       "ai_candidate",
        matchReason:       truncateSafeSummary("AI extraction suggested this employee"),
        aiGenerated:       true,
      });
    }
  }

  return results;
}

function deduplicateByTargetId(candidates: DmsEntityMatchCandidateInput[]): DmsEntityMatchCandidateInput[] {
  const best = new Map<number, DmsEntityMatchCandidateInput>();
  for (const c of candidates) {
    const existing = best.get(c.targetEntityId);
    if (!existing || c.matchScore > existing.matchScore) {
      best.set(c.targetEntityId, c);
    }
  }
  return Array.from(best.values());
}

// ── runDmsEntityMatchingForDocumentSystem ─────────────────────────────────────

export async function runDmsEntityMatchingForDocumentSystem(
  documentId: number,
  createdBy: number | null,
  options: DmsEntityMatchOptions = {}
): Promise<DmsEntityMatchRunResult> {
  const result: DmsEntityMatchRunResult = {
    documentId,
    candidatesCreated: 0,
    candidatesSkipped: 0,
    candidateIds:      [],
    queueItemIds:      [],
    errors:            [],
    targetsMatched:    [],
  };

  const minScore    = options.minScore ?? MATCH_SCORE_THRESHOLDS.DISCARD_BELOW;
  const createQueue = options.createQueueItems !== false;
  const targetTypes = options.targetTypes ?? ["owner_company", "branch", "party", "employee"];

  try {
    const doc = await loadDocumentContext(documentId);
    if (!doc) {
      result.errors.push(`Document ${documentId} not found`);
      return result;
    }

    const aiResultId = await loadLatestAiResultIdForDocument(documentId);
    const aiLinks = aiResultId ? await loadAiSuggestedLinks(aiResultId) : {};

    // Load entity data in parallel
    const [companies, branches, parties, employees] = await Promise.all([
      targetTypes.includes("owner_company") ? loadOwnerCompanies() : Promise.resolve([]),
      targetTypes.includes("branch")        ? loadBranches()       : Promise.resolve([]),
      targetTypes.includes("party")         ? loadParties()        : Promise.resolve([]),
      targetTypes.includes("employee")      ? loadEmployees()      : Promise.resolve([]),
    ]);

    // Collect candidates
    const allCandidates: DmsEntityMatchCandidateInput[] = [
      ...matchOwnerCompanies(doc, companies, aiLinks, documentId, aiResultId),
      ...matchBranches(doc, branches, aiLinks, documentId, aiResultId),
      ...matchParties(doc, parties, aiLinks, documentId, aiResultId),
      ...matchEmployees(doc, employees, aiLinks, documentId, aiResultId),
    ].filter(c => c.matchScore >= minScore);

    // Upsert candidates
    for (const candidate of allCandidates) {
      candidate.createdBy = createdBy;

      if (options.dryRun) {
        result.targetsMatched.push(candidate.targetEntityType);
        continue;
      }

      try {
        const upsertResult = await upsertDmsEntityMatchCandidate(candidate);
        if (!upsertResult.inserted) {
          result.candidatesSkipped++;
          continue;
        }

        result.candidatesCreated++;
        if (!result.targetsMatched.includes(candidate.targetEntityType)) {
          result.targetsMatched.push(candidate.targetEntityType);
        }

        if (upsertResult.candidateId) {
          result.candidateIds.push(upsertResult.candidateId);

          if (createQueue) {
            try {
              const queueResult = await createReviewQueueItemForEntityMatchCandidate({
                candidateId: upsertResult.candidateId,
                candidate,
                documentId,
              });
              if (queueResult.itemId) result.queueItemIds.push(queueResult.itemId);
            } catch (qErr) {
              result.errors.push(`Queue item failed for candidate ${upsertResult.candidateId}: ${String(qErr).slice(0, 100)}`);
            }
          }
        }
      } catch (cErr) {
        result.errors.push(`Candidate upsert failed: ${String(cErr).slice(0, 100)}`);
      }
    }

    logger.info("[entity-matcher] run complete", {
      documentId,
      candidatesCreated: result.candidatesCreated,
      candidatesSkipped: result.candidatesSkipped,
    });
  } catch (err) {
    result.errors.push(`Matcher error: ${String(err).slice(0, 200)}`);
    logger.warn("[entity-matcher] engine error", { documentId, error: String(err).slice(0, 200) });
  }

  return result;
}

// ── runDmsEntityMatchingForIntakeSessionSystem ────────────────────────────────

export async function runDmsEntityMatchingForIntakeSessionSystem(
  uploadSessionId: number,
  createdBy: number | null,
  options: DmsEntityMatchOptions = {}
): Promise<DmsEntityMatchRunResult> {
  const result: DmsEntityMatchRunResult = {
    uploadSessionId,
    candidatesCreated: 0,
    candidatesSkipped: 0,
    candidateIds:      [],
    queueItemIds:      [],
    errors:            [],
    targetsMatched:    [],
  };

  try {
    const db = createAdminClient();
    const { data: session, error } = await db
      .from("dms_upload_sessions")
      .select("id, document_id")
      .eq("id", uploadSessionId)
      .single();

    if (error || !session || !(session as Record<string, unknown>).document_id) {
      result.errors.push(`Upload session ${uploadSessionId} not found or has no document`);
      return result;
    }

    const docId = (session as Record<string, unknown>).document_id as number;
    const docResult = await runDmsEntityMatchingForDocumentSystem(docId, createdBy, options);
    return { ...docResult, uploadSessionId };
  } catch (err) {
    result.errors.push(`Matcher error: ${String(err).slice(0, 200)}`);
    return result;
  }
}
