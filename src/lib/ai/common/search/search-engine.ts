/**
 * ERP COMMON AI.6 — Search Engine
 *
 * Orchestrates the full ERP search flow by mode.
 * Delegates to entity collectors, DMS bridge, intent extractor, signal decorators.
 * Never executes actions, modifies records, or returns raw AI content.
 */

import type { AuthContext } from "@/lib/rbac/check";
import { hasPermission } from "@/lib/rbac/check";
import {
  queryOrganizations,
  queryBranches,
  queryParties,
  queryWorkSites,
  queryDmsDocumentsQuick,
  queryDmsDocumentsFts,
} from "./entity-collectors";
import { extractErpSearchIntent } from "./intent-extractor";
import { bridgeDmsSemanticSearch } from "./dms-bridge";
import { decorateResultsWithSignals } from "./signal-decorators";
import { mergeAndRankResults, groupResults } from "./result-merger";
import type {
  ErpSearchFilters,
  ErpSearchResponse,
  ErpSearchResult,
} from "./types";

function isAdmin(ctx: AuthContext): boolean {
  return (
    ctx.roleCodes.includes("system_admin") ||
    hasPermission(ctx, "erp.admin") ||
    hasPermission(ctx, "dms.admin")
  );
}

async function runEntityCollectors(
  input: ErpSearchFilters,
  admin: boolean,
  entityFilter?: string[]
): Promise<{ results: ErpSearchResult[]; failedSources: string[] }> {
  const all = entityFilter ?? [];
  const runOrg = all.length === 0 || all.includes("organization");
  const runBranch = all.length === 0 || all.includes("branch");
  const runParty = all.length === 0 || all.includes("party");
  const runSite = all.length === 0 || all.includes("site");
  const runDms = all.length === 0 || all.includes("dms_document");

  const [orgRes, branchRes, partyRes, siteRes, dmsRes] = await Promise.all([
    runOrg ? queryOrganizations(input) : Promise.resolve({ results: [], source: "organization", failed: false }),
    runBranch ? queryBranches(input) : Promise.resolve({ results: [], source: "branch", failed: false }),
    runParty ? queryParties(input) : Promise.resolve({ results: [], source: "party", failed: false }),
    runSite ? queryWorkSites(input) : Promise.resolve({ results: [], source: "site", failed: false }),
    runDms ? queryDmsDocumentsQuick(input, admin) : Promise.resolve({ results: [], source: "dms_document", failed: false }),
  ]);

  const failedSources: string[] = [];
  if (orgRes.failed) failedSources.push("organization");
  if (branchRes.failed) failedSources.push("branch");
  if (partyRes.failed) failedSources.push("party");
  if (siteRes.failed) failedSources.push("site");
  if (dmsRes.failed) failedSources.push("dms_document");

  const results = [
    ...orgRes.results,
    ...branchRes.results,
    ...partyRes.results,
    ...siteRes.results,
    ...dmsRes.results,
  ];

  return { results, failedSources };
}

// ── quick_keyword ──────────────────────────────────────────────────────────────

async function runQuickKeyword(
  input: ErpSearchFilters,
  ctx: AuthContext
): Promise<ErpSearchResponse> {
  const admin = isAdmin(ctx);
  const { results, failedSources } = await runEntityCollectors(input, admin, input.entityTypes);
  const decorated = input.includeAiSignals !== false
    ? await decorateResultsWithSignals(results, ctx)
    : results;
  const merged = mergeAndRankResults([decorated]);

  return {
    query: input.query,
    mode: "quick_keyword",
    results: merged,
    groups: groupResults(merged),
    partialResults: failedSources.length > 0,
    failedSources,
    totalCount: merged.length,
  };
}

// ── safe_fts ──────────────────────────────────────────────────────────────────

async function runSafeFts(
  input: ErpSearchFilters,
  ctx: AuthContext
): Promise<ErpSearchResponse> {
  const admin = isAdmin(ctx);
  const [entityRes, ftsRes] = await Promise.all([
    runEntityCollectors(input, admin, input.entityTypes),
    queryDmsDocumentsFts(input, admin),
  ]);

  const allResults = [...entityRes.results, ...ftsRes.results];
  const failedSources = [
    ...entityRes.failedSources,
    ...(ftsRes.failed ? [ftsRes.source] : []),
  ];

  const decorated = input.includeAiSignals !== false
    ? await decorateResultsWithSignals(allResults, ctx)
    : allResults;
  const merged = mergeAndRankResults([decorated]);

  return {
    query: input.query,
    mode: "safe_fts",
    results: merged,
    groups: groupResults(merged),
    partialResults: failedSources.length > 0,
    failedSources,
    totalCount: merged.length,
  };
}

// ── semantic_documents ────────────────────────────────────────────────────────

async function runSemanticDocuments(
  input: ErpSearchFilters,
  ctx: AuthContext,
  semanticEnabled: boolean
): Promise<ErpSearchResponse> {
  const admin = isAdmin(ctx);

  if (!semanticEnabled) {
    const fallback = await runQuickKeyword(input, ctx);
    return {
      ...fallback,
      mode: "semantic_documents",
      failedSources: [...fallback.failedSources, "semantic_disabled"],
      partialResults: true,
    };
  }

  const [entityRes, semanticRes] = await Promise.all([
    runEntityCollectors(input, admin, input.entityTypes?.filter((e) => e !== "dms_document")),
    bridgeDmsSemanticSearch(input, admin),
  ]);

  const allResults = [...entityRes.results, ...semanticRes.results];
  const failedSources = [
    ...entityRes.failedSources,
    ...(semanticRes.failed ? [semanticRes.source] : []),
  ];

  const decorated = input.includeAiSignals !== false
    ? await decorateResultsWithSignals(allResults, ctx)
    : allResults;
  const merged = mergeAndRankResults([decorated]);

  return {
    query: input.query,
    mode: "semantic_documents",
    results: merged,
    groups: groupResults(merged),
    partialResults: failedSources.length > 0,
    failedSources,
    totalCount: merged.length,
  };
}

// ── ai_intent ─────────────────────────────────────────────────────────────────

async function runAiIntent(
  input: ErpSearchFilters,
  ctx: AuthContext,
  aiSearchEnabled: boolean
): Promise<ErpSearchResponse> {
  if (!aiSearchEnabled) {
    const fallback = await runQuickKeyword(input, ctx);
    return {
      ...fallback,
      mode: "ai_intent",
      failedSources: [...fallback.failedSources, "ai_search_disabled"],
      partialResults: true,
    };
  }

  const { intent, usedAi } = await extractErpSearchIntent(input.query, aiSearchEnabled);

  const effectiveQuery = intent.keywords.length > 0 ? intent.keywords.join(" ") : input.query;
  const effectiveInput: ErpSearchFilters = {
    ...input,
    query: effectiveQuery,
    entityTypes:
      intent.entityTypes.length > 0 ? intent.entityTypes : input.entityTypes,
  };

  const admin = isAdmin(ctx);
  const { results, failedSources } = await runEntityCollectors(effectiveInput, admin, effectiveInput.entityTypes);

  const decorated = input.includeAiSignals !== false
    ? await decorateResultsWithSignals(results, ctx)
    : results;
  const merged = mergeAndRankResults([decorated]);

  void usedAi;

  return {
    query: input.query,
    mode: "ai_intent",
    intent,
    results: merged,
    groups: groupResults(merged),
    partialResults: failedSources.length > 0,
    failedSources,
    totalCount: merged.length,
  };
}

// ── hybrid ────────────────────────────────────────────────────────────────────

async function runHybrid(
  input: ErpSearchFilters,
  ctx: AuthContext,
  aiSearchEnabled: boolean,
  semanticEnabled: boolean
): Promise<ErpSearchResponse> {
  const admin = isAdmin(ctx);
  const { intent } = await extractErpSearchIntent(input.query, aiSearchEnabled);

  const effectiveQuery = intent.keywords.length > 0 ? intent.keywords.join(" ") : input.query;
  const entityFilter = intent.entityTypes.length > 0 ? intent.entityTypes : input.entityTypes;

  const effectiveInput: ErpSearchFilters = { ...input, query: effectiveQuery, entityTypes: entityFilter };

  const [entityRes, semanticRes] = await Promise.all([
    runEntityCollectors(effectiveInput, admin, entityFilter),
    semanticEnabled
      ? bridgeDmsSemanticSearch(effectiveInput, admin)
      : Promise.resolve({ results: [] as ErpSearchResult[], source: "semantic_skip", failed: false }),
  ]);

  const allResults = [...entityRes.results, ...semanticRes.results];
  const failedSources = [
    ...entityRes.failedSources,
    ...(semanticRes.failed ? [semanticRes.source] : []),
  ];

  const decorated = input.includeAiSignals !== false
    ? await decorateResultsWithSignals(allResults, ctx)
    : allResults;
  const merged = mergeAndRankResults([decorated]);

  return {
    query: input.query,
    mode: "hybrid",
    intent,
    results: merged,
    groups: groupResults(merged),
    partialResults: failedSources.length > 0,
    failedSources,
    totalCount: merged.length,
  };
}

// ── entity_filtered ───────────────────────────────────────────────────────────

async function runEntityFiltered(
  input: ErpSearchFilters,
  ctx: AuthContext
): Promise<ErpSearchResponse> {
  const admin = isAdmin(ctx);
  const { results, failedSources } = await runEntityCollectors(input, admin, input.entityTypes);
  const decorated = input.includeAiSignals !== false
    ? await decorateResultsWithSignals(results, ctx)
    : results;
  const merged = mergeAndRankResults([decorated]);

  return {
    query: input.query,
    mode: "entity_filtered",
    results: merged,
    groups: groupResults(merged),
    partialResults: failedSources.length > 0,
    failedSources,
    totalCount: merged.length,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runErpSearch(
  input: ErpSearchFilters,
  ctx: AuthContext,
  flags: { aiSearchEnabled: boolean; semanticEnabled: boolean }
): Promise<ErpSearchResponse> {
  const mode = input.mode ?? "quick_keyword";

  switch (mode) {
    case "quick_keyword":
      return runQuickKeyword(input, ctx);
    case "safe_fts":
      return runSafeFts(input, ctx);
    case "semantic_documents":
      return runSemanticDocuments(input, ctx, flags.semanticEnabled);
    case "ai_intent":
      return runAiIntent(input, ctx, flags.aiSearchEnabled);
    case "hybrid":
      return runHybrid(input, ctx, flags.aiSearchEnabled, flags.semanticEnabled);
    case "entity_filtered":
      return runEntityFiltered(input, ctx);
    default:
      return runQuickKeyword(input, ctx);
  }
}
