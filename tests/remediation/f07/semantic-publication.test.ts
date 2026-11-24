import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentJobClaim, jobScopedFetch, runWithJobClaim } from "@/lib/dms/ai-jobs/claim-scope";

const testState = vi.hoisted(() => ({ transport: vi.fn<typeof fetch>(), embed: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/supabase/admin", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const { jobScopedFetch } = await import("@/lib/dms/ai-jobs/claim-scope");
  return {
    createAdminClient: () => createClient("https://semantic.test", "synthetic-service", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: jobScopedFetch(testState.transport) },
    }),
  };
});
vi.mock("@/lib/dms/ai/factory", () => ({ getDmsEmbeddingProvider: testState.provider }));
vi.mock("@/lib/ai/observability/log-dms-ai-usage", () => ({ logDmsAiUsage: async () => null }));
vi.mock("@/lib/dms/ai-jobs/job-registry", async () => {
  const { semanticDocumentIndexHandler } = await import("@/lib/dms/ai-jobs/handlers/semantic-document-index.handler");
  return { getDmsAiJobHandler: () => semanticDocumentIndexHandler };
});

import { runDmsAiJob } from "@/lib/dms/ai-jobs/job-runner";
import { indexDmsDocumentSemantically } from "@/lib/dms/semantic/semantic-indexer";

const claim = { jobId: 7, token: "c7000000-0000-4000-8000-000000000001", workerId: "test", attemptNumber: 1 };
const documentId = 17;
const input = { documentId, source: "manual_rebuild" as const, forceRebuild: true };
const job = { id: 7, job_type: "semantic_document_index", payload_json: input, attempt_count: 1, max_attempts: 3, locked_by: "test" };
const claimData = { jobId: claim.jobId, token: claim.token, documentId };
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const paragraph = "Synthetic text for the existing semantic publication test. ".repeat(41).trim();
const text = `${paragraph}\n\n${paragraph}`;
const proof = { versionId: 71, contentId: 70, sourceHash: hash(text), sourceProof: "a".repeat(64) };
const expectation = { ...claimData, ...proof, isTruncated: false, embeddingsEnabled: true };
const embedding = Array(1536).fill(0.01);
let requests: { action: string; body: Record<string, unknown>; inScope: boolean; method?: string; url: URL }[];
let ready: Record<string, unknown>;
let content: Record<string, unknown>;
let committed: Record<string, unknown> | undefined;
let acknowledge: boolean;
let recordPublication: boolean;
let receiptOverride: Record<string, unknown> | undefined;
let currentReceiptUnavailable: boolean;
let providerAssertionsBeforeExpiry: number;
let providerAssertionFailureStatus: number;
let legacyFixture: boolean;

function requestedActions() { return requests.filter(r => r.action !== "assert_provider").map(r => r.action); }

beforeEach(() => {
  vi.resetAllMocks();
  requests = [];
  ready = { success: true, status: "ready", ...proof, isTruncated: false, embeddingsEnabled: true };
  content = { id: proof.contentId, content_text: text, content_text_sha256: proof.sourceHash, is_truncated: false };
  committed = undefined;
  acknowledge = true;
  recordPublication = true;
  receiptOverride = undefined;
  currentReceiptUnavailable = false;
  providerAssertionsBeforeExpiry = Infinity;
  providerAssertionFailureStatus = 409;
  legacyFixture = false;
  testState.embed.mockResolvedValue({ embedding, model: "synthetic-embedding", inputTokenCount: 5 });
  testState.provider.mockResolvedValue({
    provider: { isConfigured: () => true, embedText: testState.embed },
    configCode: "DEFAULT_EMBEDDING", configId: 1, modelId: "synthetic-embedding",
  });
  testState.transport.mockImplementation(async (request, init) => {
    const url = new URL(String(request));
    const path = url.pathname.split("/").at(-1);
    const packet = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    let action = packet?.p_action ?? path;
    if (action === "assert" && currentJobClaim()) action = "assert_provider";
    const body = packet?.p_data ?? {};
    requests.push({ action, body, inScope: currentJobClaim() !== undefined, method: init?.method, url });
    if (action === "assert") return Response.json({ success: true });
    if (action === "assert_provider") return providerAssertionsBeforeExpiry-- > 0 ? Response.json({ success: true })
      : Response.json({ code: "SYN_ASSERT", message: "Synthetic source assertion failure" }, { status: providerAssertionFailureStatus });
    if (action === "inspect") return Response.json(ready);
    if (action === "settle") return Response.json({ success: true, jobId: 7, attemptNumber: 1,
      status: body.success ? "completed" : body.retryable ? "retry_scheduled" : "failed" });
    if (action === "erp_ai_feature_flags") {
      if (legacyFixture && url.searchParams.get("select") === "is_enabled") return Response.json({ is_enabled: true });
      return Response.json([{ feature_code: "DMS_SEMANTIC_CHUNKING", is_enabled: legacyFixture },
        { feature_code: "DMS_SEMANTIC_EMBEDDINGS", is_enabled: legacyFixture }]);
    }
    if (action === "dms_document_content") return Response.json([content]);
    if (legacyFixture && action === "dms_question_publish") return Response.json(false);
    if (legacyFixture && action === "dms_document_content_chunks") {
      if (init?.method === "GET") return Response.json(url.searchParams.get("select") === "id,content_hash"
        ? [{ id: 88, content_hash: "previous" }] : [{ id: 89, chunk_text: paragraph }]);
      return new Response(null, { status: 204 });
    }
    if (action === "publish") {
      if (recordPublication) committed = { ...ready, success: true, status: "published",
        isTruncated: body.isTruncated, embeddingsEnabled: body.embeddingsEnabled,
        chunksCreated: body.chunks.length, chunksEmbedded: body.chunks.filter((c: { embedding?: number[] }) => c.embedding).length,
        pendingRemaining: body.chunks.filter((c: { embedding?: number[] }) => !c.embedding).length };
      if (!acknowledge) throw new Error("Synthetic lost write acknowledgement");
      return Response.json(committed);
    }
    if (action === "receipt") {
      if (currentReceiptUnavailable) throw new Error("Synthetic receipt timeout");
      return Response.json(receiptOverride ?? committed ?? { success: true, status: "missing" });
    }
    return Response.json({ message: "Unexpected request" }, { status: 400 });
  });
});

describe("unscoped semantic index", () => {
  it("leaves version-bound rows outside legacy rebuild and embedding mutations", async () => {
    legacyFixture = true;
    expect(await indexDmsDocumentSemantically(input)).toMatchObject({ success: true, chunksCreated: 2, chunksEmbedded: 1 });
    const accesses = requests.filter(r => r.action === "dms_document_content_chunks" && r.method !== "POST");
    expect(accesses.map(r => r.method)).toEqual(["GET", "PATCH", "GET", "PATCH"]);
    expect(accesses.every(r => r.url.searchParams.get("f07_source_version_id") === "is.null")).toBe(true);
  });
});

describe("claimed semantic index", () => {
  it("publishes one fully embedded generation tied to the exact verified source", async () => {
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({
      success: true, status: "indexed", chunksCreated: 2, chunksEmbedded: 2, pendingRemaining: 0,
    });
    expect(requestedActions()).toEqual(["inspect", "dms_document_content", "publish"]);
    expect(requests.find(r => r.action === "publish")?.body).toMatchObject({ ...expectation, forceRebuild: true, isTruncated: false, embeddingsEnabled: true,
      chunks: [
        { chunkIndex: 0, chunkText: paragraph, chunkHash: hash(paragraph), embedding, embeddingProvider: "DEFAULT_EMBEDDING", embeddingModel: "synthetic-embedding" },
        { chunkIndex: 1, embedding },
      ],
    });
  });

  it("holds older content without a source proof before reading or calling the provider", async () => {
    ready = { success: false, status: "held", reason: "source_unproven" };
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({ success: false, retryable: false });
    expect(requests.map(r => r.action)).toEqual(["inspect"]);
    expect(testState.provider).not.toHaveBeenCalled();
  });

  it("rejects changed content bytes even when their stored hash matches the verified source", async () => {
    content.content_text = "A different document arrived after inspection.";
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({ success: false });
    expect(requests.map(r => r.action)).toEqual(["inspect", "dms_document_content"]);
    expect(testState.provider).not.toHaveBeenCalled();
  });

  it("bases verification on the exact content bytes when retained hash metadata is stale", async () => {
    content.content_text_sha256 = "c".repeat(64);
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({ success: true, status: "indexed" });
    expect(requestedActions()).toEqual(["inspect", "dms_document_content", "publish"]);
  });

  it("keeps earlier search results when the second provider call fails", async () => {
    testState.embed.mockResolvedValueOnce({ embedding, model: "synthetic-embedding" }).mockRejectedValueOnce(new Error("provider timeout"));
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({ success: false, errorCode: "provider_timeout" });
    expect(requestedActions()).toEqual(["inspect", "dms_document_content"]);
  });

  it("stops paid work as soon as the current claim expires between calls", async () => {
    providerAssertionsBeforeExpiry = 1;
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({ success: false });
    expect(testState.embed).toHaveBeenCalledOnce();
    expect(requests.map(r => r.action)).toEqual(["inspect", "dms_document_content", "assert_provider", "assert_provider"]);
  });

  it("allows ordinary retry after a transient pre-embedding assertion failure", async () => {
    providerAssertionsBeforeExpiry = 1;
    providerAssertionFailureStatus = 503;
    expect(await runDmsAiJob(job, claim)).toBe("retry_scheduled");
    expect(testState.embed).toHaveBeenCalledOnce();
    expect(requestedActions()).toEqual(["assert", "inspect", "dms_document_content", "settle"]);
  });

  it("stops paid work at the local deadline even when the claim assertion still passes", async () => {
    const tick = vi.spyOn(performance, "now");
    try {
      tick.mockReturnValue(0);
      testState.embed.mockImplementation(async () => {
        tick.mockReturnValue(9 * 60_000);
        return { embedding, model: "synthetic-embedding" };
      });
      expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({ success: false });
      expect(testState.embed).toHaveBeenCalledOnce();
      expect(requestedActions()).toEqual(["inspect", "dms_document_content"]);
    } finally { tick.mockRestore(); }
  });

  it("rejects a vector with no usable direction before requesting publication", async () => {
    testState.embed.mockResolvedValue({ embedding: Array(1536).fill(0), model: "synthetic-embedding" });
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({
      success: false, retryable: false,
    });
    expect(requestedActions()).toEqual(["inspect", "dms_document_content"]);
  });

  it("recognizes a same-claim publication already committed at the source", async () => {
    ready = { ...ready, status: "published", chunksCreated: 2, chunksEmbedded: 2, pendingRemaining: 0 };
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({ success: true, status: "indexed" });
    expect(requests.map(r => r.action)).toEqual(["inspect"]);
    expect(testState.provider).not.toHaveBeenCalled();
  });

  it("keeps earlier search results when the generation cannot fit the attempt's embedding budget", async () => {
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically({ ...input, maxEmbedChunks: 1 }))).toMatchObject({
      success: false, retryable: false,
    });
    expect(testState.provider).not.toHaveBeenCalled();
    expect(requests.map(r => r.action)).toEqual(["inspect", "dms_document_content"]);
  });

  it("publishes text once with pending vectors when embeddings are disabled", async () => {
    ready.embeddingsEnabled = false;
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({
      success: true, status: "partial", chunksCreated: 2, chunksEmbedded: 0, pendingRemaining: 2,
    });
    expect(testState.provider).not.toHaveBeenCalled();
  });

  it("retains the searchable generation when disabled embeddings hold a replacement", async () => {
    ready = { success: false, status: "held", reason: "search_index_preserved" };
    expect(await runWithJobClaim(claim, () => indexDmsDocumentSemantically(input))).toMatchObject({ success: true, status: "skipped" });
    expect(requestedActions()).toEqual(["inspect"]);
    expect(testState.provider).not.toHaveBeenCalled();
  });

  it.each([
    ["hard split", `${"A".repeat(5999)}🧪${"B".repeat(150)}`],
    ["overlap", `${"A".repeat(3798)}🧪${"B".repeat(199)}\n\n${"C".repeat(300)}`],
  ])("preserves supplementary Unicode at a %s boundary through claimed publication", async (_boundary, unicodeText) => {
    ready.sourceHash = hash(unicodeText);
    content.content_text = unicodeText;
    expect(await runDmsAiJob(job, claim)).toBe("completed");
    const publication = requests.find(r => r.action === "publish");
    const chunks = publication?.body.chunks as { chunkText: string }[];
    expect(chunks).toHaveLength(2);
    expect(chunks.every(chunk => Buffer.from(chunk.chunkText).toString("utf8") === chunk.chunkText)).toBe(true);
    expect(chunks.some(chunk => chunk.chunkText.includes("🧪"))).toBe(true);
    expect(chunks.every(chunk => unicodeText.includes(chunk.chunkText))).toBe(true);
  });

  it("preserves contiguous raw chunks and unpunctuated trailing source text", async () => {
    const exactText = `${"A".repeat(3099)}.\r\n\r\n${"B".repeat(3099)}. ${"C".repeat(4000)}. trailing content`;
    ready.sourceHash = hash(exactText);
    content.content_text = exactText;
    expect(await runDmsAiJob(job, claim)).toBe("completed");
    const chunks = requests.find(r => r.action === "publish")?.body.chunks as { chunkText: string }[];
    expect(chunks.every(chunk => exactText.includes(chunk.chunkText))).toBe(true);
    expect(chunks.at(-1)?.chunkText).toMatch(/trailing content$/);
  });

  it("reconciles a lost commit acknowledgement by querying the exact receipt outside the poisoned scope", async () => {
    acknowledge = false;
    expect(await runDmsAiJob(job, claim)).toBe("completed");
    expect(requestedActions()).toEqual(["assert", "inspect", "dms_document_content", "publish", "receipt", "settle"]);
    expect(requests.find(r => r.action === "receipt")).toMatchObject({ body: expectation, inScope: false });
    expect(requests.find(r => r.action === "settle")?.body).toMatchObject({ success: true });
  });

  it.each(["missing", "pending", "unavailable"])("retains the current claim for bounded recovery when reconciliation is %s", async status => {
    acknowledge = false;
    recordPublication = false;
    currentReceiptUnavailable = status === "unavailable";
    receiptOverride = { success: true, status };
    expect(await runDmsAiJob(job, claim)).toBeNull();
    expect(requestedActions()).toEqual(["assert", "inspect", "dms_document_content", "publish", "receipt"]);
  });

  it.each([{ sourceProof: "b".repeat(64) }, { isTruncated: true }])("declines a receipt with a mismatched source identity %j", async mismatch => {
    acknowledge = false;
    receiptOverride = { success: true, status: "published", ...proof, isTruncated: false, embeddingsEnabled: true,
      chunksCreated: 2, chunksEmbedded: 2, pendingRemaining: 0, ...mismatch };
    expect(await runDmsAiJob(job, claim)).toBeNull();
    expect(requestedActions()).toEqual(["assert", "inspect", "dms_document_content", "publish", "receipt"]);
  });
});

describe("semantic publication fetch fence", () => {
  it.each(["receipt", "wrong-token", "wrong-job", "GET", "chunk-update"])("blocks %s in claim scope", async variant => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ success: true }));
    const fetch = jobScopedFetch(transport);
    const endpoint = "https://semantic.test/rest/v1/";
    const path = variant === "chunk-update" ? "dms_document_content_chunks" : "rpc/f07_semantic_index";
    const method = variant === "chunk-update" ? "PATCH" : variant === "GET" ? "GET" : "POST";
    const body = JSON.stringify({ p_action: variant === "receipt" ? "receipt" : "inspect", p_data: {
      ...claimData, token: variant === "wrong-token" ? "different" : claim.token, jobId: variant === "wrong-job" ? 27 : 7,
    } });
    await expect(runWithJobClaim(claim, () => fetch(`${endpoint}${path}`, { method, body }))).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
